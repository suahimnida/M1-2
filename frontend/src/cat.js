/* 껌냥이 액터: 채팅 대화 영역(#messages) 안을 돌아다니는 픽셀 고양이
 *
 * 동작
 * - 앉아서 쉬기(idle) / 걷기 / 그루밍 / 자기 / 눈 깜빡임을 스스로 골라서 반복
 * - 고양이를 클릭하면 '장난' (앉아 있으면 일어선 뒤 장난)
 * - 자고 있는 고양이를 클릭하면 '앉기→일어서기'로 깨어남
 * - 말풍선으로 말걸기: 컨디션 요약 데이터(ggeom:summary 이벤트)를 보고 대사를 고름
 */
(function () {
  "use strict";

  const SHEET_URL = "assets/ggeomnyang_sprites.png";
  const META_URL = "assets/ggeomnyang_sprites.json";
  const SPEED = 48;             // 화면에서 걷는 속도 (px/초)
  const BUBBLE_MS = 2800;       // 말풍선 표시 시간

  // json을 못 읽었을 때 쓰는 기본값 (ggeomnyang_sprites.json과 같은 내용)
  const FALLBACK_META = {
    frameWidth: 64, frameHeight: 64, sheetWidth: 640, sheetHeight: 448,
    animations: {
      idle: { row: 0, frames: 6, durations: [220, 180, 200, 240, 180, 200], loop: true },
      walk: { row: 1, frames: 8, durations: [100, 100, 100, 100, 100, 100, 100, 100], loop: true },
      groom: { row: 2, frames: 10, durations: [140, 140, 260, 200, 260, 140, 240, 140, 260, 180], loop: true },
      play: { row: 3, frames: 6, durations: [220, 140, 140, 90, 160, 240], loop: false },
      sleep: { row: 4, frames: 4, durations: [520, 420, 520, 420], loop: true },
      sit_to_stand: { row: 5, frames: 3, durations: [110, 110, 120], loop: false },
      blink: { row: 6, frames: 3, durations: [60, 90, 70], loop: false },
    },
  };

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  let meta = FALLBACK_META;
  let chat, msgs, stage, actor, sprite, bubble, zzz;
  let scale = 2, size = 128;
  let bounds = { w: 0, h: 0, xMin: 0, xMax: 0, yMin: 0, yMax: 0 };

  const cat = {
    x: 24, y: 0,
    facing: 1,          // 1 = 오른쪽, -1 = 왼쪽
    mode: "sit",        // sit | groom | sleep | walk | busy
    standing: false,    // 지금 서 있는 자세인지 (전환 동작이 필요한지 판단)
    target: null,
    nextDecision: 0,
    nextBlink: 0,
  };
  let anim = null;      // { name, frame, t, reverse, onEnd, done }
  let summary = null, lastCount = null;
  let bubbleTimer = null;
  let lastTime = performance.now();

  /* ---------- 애니메이션 재생 ---------- */
  function play(name, opts = {}) {
    const a = meta.animations[name];
    anim = {
      name,
      reverse: !!opts.reverse,
      frame: opts.reverse ? a.frames - 1 : 0,
      t: 0,
      onEnd: opts.onEnd || null,
      done: false,
    };
    draw();
  }

  function draw() {
    if (!anim) return;
    const a = meta.animations[anim.name];
    const x = anim.frame * meta.frameWidth * scale;
    const y = a.row * meta.frameHeight * scale;
    sprite.style.backgroundPosition = `-${x}px -${y}px`;
  }

  function stepAnim(dt) {
    if (!anim || anim.done) return;
    const a = meta.animations[anim.name];
    anim.t += dt;
    // 프레임마다 재생 시간이 달라서 강약이 생긴다
    while (anim.t >= a.durations[anim.frame]) {
      anim.t -= a.durations[anim.frame];
      const next = anim.frame + (anim.reverse ? -1 : 1);
      if (next < 0 || next >= a.frames) {
        if (a.loop) {
          anim.frame = anim.reverse ? a.frames - 1 : 0;
        } else {
          anim.done = true;               // 마지막 프레임에서 멈춤
          const cb = anim.onEnd;
          anim.onEnd = null;
          if (cb) cb();
          return draw();
        }
      } else {
        anim.frame = next;
      }
    }
    draw();
  }

  /* ---------- 행동 ---------- */
  function sit() {
    cat.mode = "sit";
    cat.standing = false;
    zzz.hidden = true;
    play("idle");
    cat.nextDecision = performance.now() + rand(2500, 6000);
    cat.nextBlink = performance.now() + rand(1500, 4000);
  }

  function standUp(then) {
    if (cat.standing) return then();
    cat.mode = "busy";
    play("sit_to_stand", { onEnd: () => { cat.standing = true; then(); } });
  }

  function sitDown(then) {
    if (!cat.standing) return then();
    cat.mode = "busy";
    play("sit_to_stand", { reverse: true, onEnd: () => { cat.standing = false; then(); } });
  }

  function walkTo(x, y) {
    standUp(() => {
      cat.mode = "walk";
      cat.target = { x, y };
      cat.facing = x >= cat.x ? 1 : -1;
      applyFacing();
      play("walk");
    });
  }

  function walkSomewhere() {
    if (reduceMotion || bounds.w === 0) return sit();
    // 너무 가까운 곳은 피해서 목적지 고르기
    let x, y, tries = 0;
    do {
      x = rand(bounds.xMin, bounds.xMax);
      y = rand(bounds.yMin, bounds.yMax);
      tries++;
    } while (Math.hypot(x - cat.x, y - cat.y) < 80 && tries < 8);
    walkTo(x, y);
  }

  function groom() {
    cat.mode = "groom";
    play("groom");
    cat.nextDecision = performance.now() + rand(4000, 7500);
  }

  function sleep() {
    cat.mode = "sleep";
    zzz.hidden = false;
    play("sleep");
    cat.nextDecision = performance.now() + rand(15000, 28000);
  }

  // 혼자 고르는 다음 행동
  function decide() {
    if (cat.mode === "groom") return sit();
    if (cat.mode === "sleep") {           // 저절로 깨면 일어나서 기지개 후 산책
      zzz.hidden = true;
      cat.mode = "busy";
      return play("sit_to_stand", { onEnd: () => { cat.standing = true; walkSomewhere(); } });
    }
    const r = Math.random();
    if (r < 0.42 && !reduceMotion) return walkSomewhere();
    if (r < 0.62) return groom();
    if (r < 0.72) return sleep();
    if (r < 0.9) say(talkLine());
    cat.nextDecision = performance.now() + rand(3000, 6000);
  }

  /* ---------- 클릭 반응 ---------- */
  function onPoke() {
    if (cat.mode === "busy") return;      // 장난이나 전환 동작 중에는 무시

    // 2) 자고 있으면 앉기→일어서기로 깨어남
    if (cat.mode === "sleep") {
      zzz.hidden = true;
      cat.mode = "busy";
      play("sit_to_stand", {
        onEnd: () => {
          cat.standing = true;
          say(pick(["으냥… 깨웠냥?", "꿈에서 츄르 먹고 있었는데냥", "흐아암, 좋은 아침이다냥"]));
          setTimeout(() => (Math.random() < 0.5 ? walkSomewhere() : sitDown(sit)), 1400);
        },
      });
      return;
    }

    // 1) 깨어 있으면 장난
    cat.target = null;
    standUp(() => {
      cat.mode = "busy";
      play("play", {
        onEnd: () => {
          say(pick(["냥냥펀치!", "잡았다냥!", "한 번 더 해볼래냥?", "운동 끝! 이제 네 차례다냥"]));
          setTimeout(() => sitDown(sit), 900);
        },
      });
    });
  }

  /* ---------- 말걸기 ---------- */
  function talkLine() {
    const s = summary;
    if (!s || !s.count) {
      return pick(["오늘 컨디션 체크 했냥?", "기록을 남겨주면 맞춤 운동 알려줄게냥", "물 한 잔 마시고 오라냥"]);
    }
    const l = s.latest || {};
    const lines = [];
    if (l.value <= 4) lines.push(`컨디션 ${l.value}점이네… 오늘은 스트레칭만 하자냥`);
    if (l.value >= 8) lines.push(`컨디션 ${l.value}점! 오늘은 제대로 달려보자냥`);
    if (l.stress >= 7) lines.push("스트레스 높아 보여… 쓰다듬어 줄래냥?");
    if (l.sleep_hours != null && l.sleep_hours < 6) lines.push(`${l.sleep_hours}시간밖에 못 잤냥? 낮잠 같이 자자냥`);
    if (s.trend === "증가") lines.push("최근 7일 컨디션 올라가는 중이다냥!");
    if (s.trend === "감소") lines.push("요즘 좀 지쳤냥? 쉬는 것도 운동이다냥");
    if (s.best_weekday) lines.push(`${s.best_weekday}요일엔 컨디션이 제일 좋더라냥`);
    lines.push("주스 레시피 궁금하면 물어보라냥", "나랑 같이 기지개 켜자냥");
    return pick(lines);
  }

  function say(text) {
    bubble.textContent = text;
    bubble.classList.add("show");
    keepBubbleInside();
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => bubble.classList.remove("show"), BUBBLE_MS);
  }

  // 말풍선이 대화 영역 밖으로 잘리지 않게 좌우 위치 보정
  function keepBubbleInside() {
    bubble.style.setProperty("--shift", "0px");
    const bw = bubble.offsetWidth;
    const center = cat.x + size / 2;
    const left = center - bw / 2, right = center + bw / 2;
    let shift = 0;
    if (left < 4) shift = 4 - left;
    if (right > bounds.w - 4) shift = bounds.w - 4 - right;
    bubble.style.setProperty("--shift", `${shift}px`);
  }

  /* ---------- 위치와 영역 ---------- */
  function applyFacing() {
    sprite.classList.toggle("flip", cat.facing < 0);
  }

  function applyPosition() {
    actor.style.transform = `translate(${Math.round(cat.x)}px, ${Math.round(cat.y)}px)`;
  }

  function hasMessages() {
    return !!msgs.querySelector(".msg");
  }

  // 대화 영역 크기에 맞춰 무대 위치와 돌아다닐 범위 계산
  function layout() {
    const newScale = window.matchMedia("(max-width: 900px)").matches ? 1.5 : 2;
    if (newScale !== scale) {
      scale = newScale;
      size = meta.frameWidth * scale;
      stage.style.setProperty("--cat-size", `${size}px`);
      sprite.style.backgroundSize = `${meta.sheetWidth * scale}px ${meta.sheetHeight * scale}px`;
      draw();
    }
    const c = chat.getBoundingClientRect();
    const m = msgs.getBoundingClientRect();
    stage.style.left = `${m.left - c.left}px`;
    stage.style.top = `${m.top - c.top}px`;
    stage.style.width = `${m.width}px`;
    stage.style.height = `${m.height}px`;

    const w = m.width, h = m.height;
    const yMax = Math.max(0, h - size - 2);
    // 대화가 시작되면 메시지를 가리지 않게 아래쪽 띠에서만 돌아다님
    const band = hasMessages() ? 70 : h;
    bounds = {
      w, h,
      xMin: 6, xMax: Math.max(6, w - size - 6),
      yMin: Math.max(0, yMax - band), yMax,
    };
    const prevX = cat.x, prevY = cat.y;
    cat.x = Math.min(Math.max(cat.x, bounds.xMin), bounds.xMax);
    cat.y = Math.min(Math.max(cat.y, bounds.yMin), bounds.yMax);
    if (cat.target) {
      cat.target.x = Math.min(Math.max(cat.target.x, bounds.xMin), bounds.xMax);
      cat.target.y = Math.min(Math.max(cat.target.y, bounds.yMin), bounds.yMax);
    }
    if (prevX !== cat.x || prevY !== cat.y) applyPosition();
  }

  /* ---------- 메인 루프 ---------- */
  function tick(now) {
    const dt = Math.min(now - lastTime, 100);   // 탭을 오래 비웠다 돌아와도 순간이동하지 않게
    lastTime = now;

    if (bounds.w > 0) {
      stepAnim(dt);

      if (cat.mode === "walk" && cat.target) {
        const dx = cat.target.x - cat.x, dy = cat.target.y - cat.y;
        const dist = Math.hypot(dx, dy);
        const step = (SPEED * dt) / 1000;
        if (dist <= step) {
          cat.x = cat.target.x; cat.y = cat.target.y;
          cat.target = null;
          sitDown(sit);
        } else {
          cat.x += (dx / dist) * step;
          cat.y += (dy / dist) * step;
          if (Math.abs(dx) > 2) {
            const f = dx > 0 ? 1 : -1;
            if (f !== cat.facing) { cat.facing = f; applyFacing(); }
          }
        }
        applyPosition();
      }

      if (cat.mode === "sit" && anim && anim.name === "idle" && now > cat.nextBlink) {
        play("blink", { onEnd: () => { if (cat.mode === "sit") play("idle"); } });
        cat.nextBlink = now + rand(2500, 6000);
      }

      if ((cat.mode === "sit" || cat.mode === "groom" || cat.mode === "sleep") && now > cat.nextDecision) {
        decide();
      }
    }
    requestAnimationFrame(tick);
  }

  /* ---------- 시작 ---------- */
  function build() {
    stage = document.createElement("div");
    stage.className = "cat-stage";
    stage.innerHTML = `
      <div class="cat-actor">
        <div class="cat-bubble" role="status"></div>
        <span class="cat-zzz" aria-hidden="true" hidden>z<span>z</span></span>
        <div class="cat-shadow"></div>
        <div class="cat-sprite" role="button" tabindex="0"
             aria-label="껌냥이. 누르면 장난을 치고, 자고 있으면 깨어나요"></div>
      </div>`;
    chat.appendChild(stage);
    actor = stage.querySelector(".cat-actor");
    sprite = stage.querySelector(".cat-sprite");
    bubble = stage.querySelector(".cat-bubble");
    zzz = stage.querySelector(".cat-zzz");

    sprite.style.backgroundImage = `url("${SHEET_URL}")`;
    scale = 0; // layout()에서 크기 설정을 강제로 한 번 적용
    sprite.addEventListener("click", onPoke);
    sprite.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPoke(); }
    });
  }

  async function loadMeta() {
    try {
      const res = await fetch(META_URL);
      if (!res.ok) throw new Error(res.status);
      const m = await res.json();
      // json에는 시트 크기가 없으니 프레임 수로 계산
      const rows = Math.max(...Object.values(m.animations).map((a) => a.row)) + 1;
      const cols = Math.max(...Object.values(m.animations).map((a) => a.frames));
      meta = { ...m, sheetWidth: cols * m.frameWidth, sheetHeight: rows * m.frameHeight };
    } catch {
      meta = FALLBACK_META;
    }
  }

  function loadImage() {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = resolve;
      img.onerror = reject;
      img.src = SHEET_URL;
    });
  }

  async function init() {
    chat = document.querySelector("main.chat");
    msgs = document.getElementById("messages");
    if (!chat || !msgs) return;
    try {
      await Promise.all([loadMeta(), loadImage()]);
    } catch {
      console.warn("껌냥이 스프라이트를 불러오지 못했어요:", SHEET_URL);
      return;
    }
    build();
    layout();
    cat.x = bounds.xMin + 10;
    cat.y = bounds.yMax;
    applyPosition();
    applyFacing();
    sit();
    stage.classList.add("ready");

    new ResizeObserver(layout).observe(msgs);
    window.addEventListener("resize", layout);
    // 메시지가 생기거나 사라지면 돌아다닐 범위를 다시 계산하고, 범위 밖이면 걸어서 비켜남
    new MutationObserver(() => {
      layout();
      if (cat.mode === "sit" && cat.y < bounds.yMin) walkTo(cat.x, bounds.yMax);
    }).observe(msgs, { childList: true });

    requestAnimationFrame((t) => { lastTime = t; requestAnimationFrame(tick); });
  }

  // app.js가 컨디션 요약을 불러올 때마다 알려줌 → 대사에 반영
  window.addEventListener("ggeom:summary", (e) => {
    summary = e.detail;
    if (!bubble) { lastCount = summary && summary.count; return; }
    if (lastCount != null && summary && summary.count > lastCount) {
      say("기록 고맙다냥! 오늘도 잘 했다냥");
    }
    lastCount = summary && summary.count;
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
