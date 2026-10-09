/* 껌냥이 액터: 채팅 대화 영역(#messages) 안을 돌아다니는 픽셀 고양이
 *
 * 동작
 * - 앉아서 쉬기(idle) / 걷기 / 그루밍 / 자기 / 눈 깜빡임을 스스로 골라서 반복
 * - 고양이를 클릭하면 '장난' (앉아 있으면 일어선 뒤 장난)
 * - 자고 있는 고양이를 클릭하면 '앉기→일어서기'로 깨어남
 * - 말풍선으로 말걸기: 컨디션 요약 데이터(ggeom:summary 이벤트)를 보고 대사를 고름
 * - 마우스로 끌거나, 휴대폰에서 꾹 누른 뒤 끌어서 옮기기 (뒷목 잡힌 자세 + 꼬리 살랑)
 * - 스스로 걸어갈 때 지나간 자리에 회색 발자국이 3초 동안 남았다가 사라짐
 */
(function () {
  "use strict";

  const SHEET_URL = "assets/ggeomnyang_sprites.png";
  const META_URL = "assets/ggeomnyang_sprites.json";
  const SPEED = 48;             // 화면에서 걷는 속도 (px/초)
  const BUBBLE_MS = 2800;       // 말풍선 표시 시간
  const LONG_PRESS_MS = 380;    // 휴대폰에서 꾹 눌러야 하는 시간
  const PAW_GAP = 16;           // 발자국 간격 (px)
  const PAW_LIFE_MS = 3000;     // 발자국이 남아 있는 시간
  const HOLD_X = 0.5, HOLD_Y = 0.16;  // 스프라이트에서 뒷목(잡는 지점)의 위치 비율

  // json을 못 읽었을 때 쓰는 기본값 (ggeomnyang_sprites.json과 같은 내용)
  const FALLBACK_META = {
    frameWidth: 64, frameHeight: 64, sheetWidth: 640, sheetHeight: 512,
    animations: {
      idle: { row: 0, frames: 6, durations: [220, 180, 200, 240, 180, 200], loop: true },
      walk: { row: 1, frames: 8, durations: [100, 100, 100, 100, 100, 100, 100, 100], loop: true },
      groom: { row: 2, frames: 10, durations: [140, 140, 260, 200, 260, 140, 240, 140, 260, 180], loop: true },
      play: { row: 3, frames: 6, durations: [220, 140, 140, 90, 160, 240], loop: false },
      sleep: { row: 4, frames: 4, durations: [520, 420, 520, 420], loop: true },
      sit_to_stand: { row: 5, frames: 3, durations: [110, 110, 120], loop: false },
      blink: { row: 6, frames: 3, durations: [60, 90, 70], loop: false },
      held: { row: 7, frames: 6, durations: [260, 260, 260, 260, 260, 260], loop: true },
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
    mode: "sit",        // sit | groom | sleep | walk | busy | held | fall
    standing: false,    // 지금 서 있는 자세인지 (전환 동작이 필요한지 판단)
    target: null,
    nextDecision: 0,
    nextBlink: 0,
    epoch: 0,           // 드래그로 행동이 끊기면 증가 → 예약된 행동을 무효화
    vy: 0, fallTo: 0,   // 떨어질 때 속도와 목표 높이
    pawDist: 0, pawSide: 1,
  };
  const drag = { id: null, type: "", sx: 0, sy: 0, timer: null, active: false };

  // 예약 실행: 그 사이 드래그로 행동이 끊겼다면 실행하지 않음
  function later(fn, ms) {
    const ep = cat.epoch;
    setTimeout(() => { if (ep === cat.epoch) fn(); }, ms);
  }
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
    if (cat.mode === "busy" || cat.mode === "held" || cat.mode === "fall") return;  // 장난·전환·드래그 중에는 무시

    // 2) 자고 있으면 앉기→일어서기로 깨어남
    if (cat.mode === "sleep") {
      zzz.hidden = true;
      cat.mode = "busy";
      play("sit_to_stand", {
        onEnd: () => {
          cat.standing = true;
          say(pick(["으냥… 깨웠냥?", "꿈에서 츄르 먹고 있었는데냥", "흐아암, 좋은 아침이다냥"]));
          later(() => (Math.random() < 0.5 ? walkSomewhere() : sitDown(sit)), 1400);
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
          later(() => sitDown(sit), 900);
        },
      });
    });
  }

  /* ---------- 드래그로 옮기기 ---------- */
  // 마우스: 누른 채 5px 이상 움직이면 드래그 시작, 그냥 떼면 클릭(장난)
  // 터치: 380ms 꾹 누르면 드래그 시작, 짧게 탭하면 클릭(장난)
  function onPointerDown(e) {
    if (drag.id !== null) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    drag.id = e.pointerId;
    drag.type = e.pointerType;
    drag.sx = e.clientX;
    drag.sy = e.clientY;
    drag.active = false;
    try { sprite.setPointerCapture(e.pointerId); } catch { /* 일부 브라우저 대비 */ }
    if (e.pointerType !== "mouse") {
      drag.timer = setTimeout(() => startDrag(drag.sx, drag.sy), LONG_PRESS_MS);
    }
  }

  function onPointerMove(e) {
    if (e.pointerId !== drag.id) return;
    if (drag.active) {
      e.preventDefault();
      return moveHeld(e.clientX, e.clientY);
    }
    const moved = Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy);
    if (drag.type === "mouse" && moved > 5) startDrag(e.clientX, e.clientY);
    else if (drag.type !== "mouse" && moved > 10) endPress();  // 꾹 누르기 전에 움직이면 취소
  }

  function onPointerUp(e) {
    if (e.pointerId !== drag.id) return;
    const wasDragging = drag.active;
    const isTap = e.type === "pointerup" && !wasDragging && drag.id !== null;
    endPress();
    if (wasDragging) drop();
    else if (isTap) onPoke();
  }

  function endPress() {
    clearTimeout(drag.timer);
    try {
      if (drag.id !== null && sprite.hasPointerCapture(drag.id)) sprite.releasePointerCapture(drag.id);
    } catch { /* 무시 */ }
    drag.id = null;
    drag.active = false;
  }

  function startDrag(x, y) {
    clearTimeout(drag.timer);
    drag.active = true;
    cat.epoch++;                     // 하던 행동과 예약된 행동 모두 중단
    cat.mode = "held";
    cat.target = null;
    zzz.hidden = true;
    actor.classList.add("held");
    sprite.classList.remove("flip"); // 들려 있을 땐 정면
    play("held");
    if (navigator.vibrate) navigator.vibrate(12);
    say(pick(["냥?! 내려줘냥…", "뒷목 잡혔다냥…", "어디 가는 거냥?"]));
    moveHeld(x, y);
  }

  function moveHeld(clientX, clientY) {
    const r = stage.getBoundingClientRect();
    // 잡은 지점(뒷목)이 손가락/커서 아래에 오도록
    cat.x = clientX - r.left - size * HOLD_X;
    cat.y = clientY - r.top - size * HOLD_Y;
    cat.x = Math.min(Math.max(cat.x, -size * 0.2), bounds.w - size * 0.8);
    cat.y = Math.min(Math.max(cat.y, -size * 0.1), bounds.h - size);
    applyPosition();
    keepBubbleInside();
  }

  function drop() {
    actor.classList.remove("held");
    cat.x = Math.min(Math.max(cat.x, bounds.xMin), bounds.xMax);
    if (cat.y < bounds.yMin) {          // 바닥 띠보다 위에서 놓으면 떨어져서 착지
      cat.mode = "fall";
      cat.vy = 0;
      cat.fallTo = bounds.yMin + Math.random() * Math.max(0, bounds.yMax - bounds.yMin);
    } else {
      cat.y = Math.min(cat.y, bounds.yMax);
      land();
    }
    applyPosition();
  }

  function land() {
    cat.standing = true;               // 들려 있다가 내려오면 선 자세 → 앉기
    applyFacing();
    say(pick(["휴, 살았다냥", "여기 맘에 든다냥", "다음엔 간식 주고 옮겨라냥"]));
    sitDown(sit);
  }

  /* ---------- 발자국 ---------- */
  function leavePaw(dx, dy) {
    const angle = Math.atan2(dy, dx);
    const off = size * 0.06 * cat.pawSide;        // 왼발·오른발 번갈아
    cat.pawSide *= -1;
    const fx = cat.x + size / 2 - Math.sin(angle) * off;
    const fy = cat.y + size * 0.92 + Math.cos(angle) * off;
    const paw = document.createElement("span");
    paw.className = "cat-paw";
    paw.style.left = `${fx}px`;
    paw.style.top = `${fy}px`;
    paw.style.setProperty("--angle", `${angle}rad`);
    paw.style.animationDuration = `${PAW_LIFE_MS}ms`;
    paw.innerHTML = PAW_SVG;
    paw.addEventListener("animationend", () => paw.remove());
    stage.insertBefore(paw, actor);                // 고양이 뒤쪽 층에
    const paws = stage.querySelectorAll(".cat-paw");
    if (paws.length > 40) paws[0].remove();
  }

  // 오른쪽을 향한 픽셀 발자국 (발바닥 + 발가락 4개)
  const PAW_SVG = `<svg viewBox="0 0 7 7" width="100%" height="100%" shape-rendering="crispEdges" aria-hidden="true">
    <rect x="0" y="2" width="3" height="3"/><rect x="1" y="1" width="1" height="5"/>
    <rect x="4" y="0" width="1" height="1"/><rect x="5" y="2" width="1" height="1"/>
    <rect x="5" y="4" width="1" height="1"/><rect x="4" y="6" width="1" height="1"/></svg>`;

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
          cat.pawDist += step;
          if (cat.pawDist >= PAW_GAP) {
            cat.pawDist = 0;
            leavePaw(dx, dy);
          }
          if (Math.abs(dx) > 2) {
            const f = dx > 0 ? 1 : -1;
            if (f !== cat.facing) { cat.facing = f; applyFacing(); }
          }
        }
        applyPosition();
      }

      if (cat.mode === "fall") {
        cat.vy += 2200 * dt / 1000;
        cat.y += cat.vy * dt / 1000;
        if (cat.y >= cat.fallTo) { cat.y = cat.fallTo; land(); }
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
             aria-label="껌냥이. 누르면 장난을 치고, 자고 있으면 깨어나요. 끌어서 옮길 수 있어요"></div>
      </div>`;
    chat.appendChild(stage);
    actor = stage.querySelector(".cat-actor");
    sprite = stage.querySelector(".cat-sprite");
    bubble = stage.querySelector(".cat-bubble");
    zzz = stage.querySelector(".cat-zzz");

    sprite.style.backgroundImage = `url("${SHEET_URL}")`;
    scale = 0; // layout()에서 크기 설정을 강제로 한 번 적용
    sprite.addEventListener("pointerdown", onPointerDown);
    sprite.addEventListener("pointermove", onPointerMove);
    sprite.addEventListener("pointerup", onPointerUp);
    sprite.addEventListener("pointercancel", onPointerUp);
    sprite.addEventListener("contextmenu", (e) => e.preventDefault()); // 꾹 누를 때 메뉴 안 뜨게
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
