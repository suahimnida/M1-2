const API = (window.APP_CONFIG && window.APP_CONFIG.API_URL) || "http://localhost:8000";
const $ = (sel) => document.querySelector(sel);

const LIST_LIMIT = 5;   // 이전 대화·기록 목록은 처음에 5개까지만 보여줌
const LIST_STEP = 10;   // 더보기를 누를 때마다 추가로 보여줄 개수

const state = {
  conversationId: null,
  data: [],
  convs: [],
  dataShown: LIST_LIMIT,   // 기록 목록에 지금 보여주는 개수
  convShown: LIST_LIMIT,   // 이전 대화에 지금 보여주는 개수
  editingId: null,
  sending: false,
};

/* ---------- 공통 ---------- */
function esc(text) {
  return String(text ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function api(path, options = {}) {
  const res = await fetch(API + path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = Array.isArray(body.detail)
      ? body.detail.map((d) => d.msg).join(", ")
      : body.detail;
    throw new Error(detail || `요청 실패 (${res.status})`);
  }
  return body;
}

// 아주 작은 마크다운 변환: 굵게, 목록, 줄바꿈
function renderMarkdown(text) {
  const lines = esc(text).split("\n");
  let html = "", list = null;
  const close = () => { if (list) { html += `</${list}>`; list = null; } };
  for (const raw of lines) {
    const line = raw.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    const ul = line.match(/^\s*[-*•]\s+(.*)/);
    const ol = line.match(/^\s*\d+[.)]\s+(.*)/);
    if (ul || ol) {
      const tag = ul ? "ul" : "ol";
      if (list !== tag) { close(); html += `<${tag}>`; list = tag; }
      html += `<li>${(ul || ol)[1]}</li>`;
    } else {
      close();
      const h = line.match(/^#{1,4}\s+(.*)/);
      if (h) html += `<p><strong>${h[1]}</strong></p>`;
      else if (line.trim()) html += `<p>${line}</p>`;
    }
  }
  close();
  return html;
}

const fmtDate = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

/* ---------- 콜드스타트 대응 ---------- */
async function wakeServer() {
  const banner = $("#wake-banner");
  const timer = setTimeout(() => { banner.hidden = false; }, 2500);
  for (let i = 0; i < 6; i++) {
    try {
      await api("/health");
      clearTimeout(timer);
      banner.hidden = true;
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
  clearTimeout(timer);
  banner.textContent = "서버에 연결하지 못했어요. 잠시 후 새로고침해 주세요.";
  banner.hidden = false;
  return false;
}

/* ---------- 껌냥이 표정 ---------- */
function setCatMood(latest) {
  const mood = $("#cat-mood");
  if (!latest) { mood.textContent = "오늘 컨디션을 기록해 주면 맞춤으로 알려줄게냥."; return; }
  const v = latest.value, stress = latest.stress ?? 5;
  // 컨디션이 낮을수록 눈꺼풀이 내려온다
  const lid = v >= 8 ? 0 : v >= 5 ? 9 : 19;
  const pupilRx = v >= 8 ? 6 : 4;
  for (const side of ["l", "r"]) {
    $(`#lid-${side}`).setAttribute("height", lid);
    $(`#pupil-${side}`).setAttribute("rx", pupilRx);
  }
  $("#sweat").toggleAttribute("hidden", stress < 7);
  const day = latest.date.slice(5).replace("-", "/");
  mood.textContent =
    v >= 8 ? `${day} 컨디션 ${v}점! 오늘은 제대로 달려보자냥.` :
    v >= 5 ? `${day} 컨디션 ${v}점. 무리하지 말고 꾸준히 가자냥.` :
             `${day} 컨디션 ${v}점… 오늘은 회복이 먼저다냥.`;
  if (stress >= 7) mood.textContent += " 스트레스도 높아 보여.";
}

/* ---------- 요약 ---------- */
async function loadSummary() {
  try {
    const s = await api("/api/data/summary");
    window.dispatchEvent(new CustomEvent("ggeom:summary", { detail: s })); 
    const list = $("#summary-list");
    if (!s.count) {
      list.innerHTML = `<div><dt>기록</dt><dd>아직 없음</dd></div>`;
      setCatMood(null);
      return;
    }
    const rows = [
      ["기간", `${s.period.start.slice(5)} ~ ${s.period.end.slice(5)}`],
      ["기록 수", `${s.count}일`],
      ["평균 컨디션", `${s.condition.avg} / 10`],
      ["최근 7일", `${s.recent7_avg} (${s.trend})`],
      ["최고 / 최저", `${s.condition.max} / ${s.condition.min}`],
      ["평균 스트레스", `${s.stress_avg} (${s.stress_trend})`],
      ["평균 수면", `${s.sleep_avg}시간`],
      ["컨디션 좋은 요일", `${s.best_weekday}요일`],
    ];
    const w = s.weight;
    if (w) {
      // 몸무게 추세: 증가는 빨간색, 감소는 초록색
      const wClass = w.trend === "증가" ? "weight-up" : w.trend === "감소" ? "weight-down" : "";
      const change = w.change7 != null ? ` ${w.change7 > 0 ? "+" : ""}${w.change7}kg` : "";
      rows.push(["최근 몸무게", `${w.latest}kg`]);
      rows.push(["몸무게 7회 추세", `<span class="${wClass}">${w.trend}${change}</span>`]);
    } else {
      rows.push(["몸무게", "기록 없음"]);
    }
    list.innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("");
    setCatMood(s.latest);
  } catch (e) {
    $("#summary-list").innerHTML = `<div><dt>요약</dt><dd>${esc(e.message)}</dd></div>`;
  }
}

/* ---------- 채팅 ---------- */
function clearEmpty() {
  const empty = $("#messages .empty-chat");
  if (empty) empty.remove();
}

function addMessage(role, content, extraClass = "") {
  clearEmpty();
  const el = document.createElement("div");
  el.className = `msg ${role} ${extraClass}`.trim();
  el.innerHTML = role === "assistant" ? renderMarkdown(content) : esc(content).replace(/\n/g, "<br>");
  $("#messages").append(el);
  el.scrollIntoView({ block: "end" });
  return el;
}

function showTyping() {
  clearEmpty();
  const el = document.createElement("div");
  el.className = "msg assistant";
  el.setAttribute("aria-label", "껌냥이가 답변을 쓰는 중");
  el.innerHTML = `<span class="typing"><span></span><span></span><span></span></span>`;
  $("#messages").append(el);
  el.scrollIntoView({ block: "end" });
  return el;
}

async function sendMessage(text, mode = null) {
  text = text.trim();
  if (!text || state.sending) return;
  state.sending = true;
  $("#send-btn").disabled = true;
  addMessage("user", text);
  const typing = showTyping();
  try {
    const res = await api("/api/chat", {
      method: "POST",
      body: JSON.stringify({ message: text, conversation_id: state.conversationId, mode }),
    });
    typing.remove();
    addMessage("assistant", res.reply);
    const isNew = !state.conversationId;
    state.conversationId = res.conversation_id;
    if (isNew) $("#chat-title").textContent = text.slice(0, 30);
    loadConversations();
  } catch (e) {
    typing.remove();
    addMessage("assistant", `답변을 받지 못했어요. ${e.message}`, "error");
  } finally {
    state.sending = false;
    $("#send-btn").disabled = false;
  }
}

function newChat() {
  state.conversationId = null;
  $("#chat-title").textContent = "새 대화";
  $("#messages").innerHTML = `<div class="empty-chat"><p>오늘 몸 상태에 맞춰 뭘 하면 좋을지 물어보세요.</p></div>`;
  markCurrentConv();
  switchTab("chat");
}

/* ---------- 대화 기록 ---------- */
async function loadConversations() {
  const ul = $("#conv-list");
  try {
    state.convs = await api("/api/conversations");
    renderConversations();
  } catch (e) {
    ul.innerHTML = `<li class="muted-note">${esc(e.message)}</li>`;
    $("#more-conv").hidden = true;
  }
}

// 5개를 넘으면 5개만 보여주고 아래에 더보기 버튼
function renderConversations() {
  const ul = $("#conv-list");
  const list = state.convs;
  if (!list.length) {
    ul.innerHTML = `<li class="muted-note">저장된 대화가 없어요. 껌냥이에게 말을 걸면 자동으로 저장돼요.</li>`;
    $("#more-conv").hidden = true;
    return;
  }
  const shown = list.slice(0, state.convShown);
  ul.innerHTML = shown.map((c) => `
      <li class="conv-item" data-id="${esc(c.id)}">
        <button type="button" class="conv-open">
          <strong>${esc(c.title)}</strong>
          <small>${fmtDate(c.updated_at)} · 메시지 ${c.message_count}개</small>
        </button>
        <button type="button" class="conv-del" aria-label="${esc(c.title)} 삭제">삭제</button>
      </li>`).join("");
  markCurrentConv();
  updateMoreButton($("#more-conv"), list.length, state.convShown);
}

// 남은 게 있으면 "더보기 (+추가될 개수)", 다 펼쳤으면 "접기"
function updateMoreButton(btn, total, shownCount) {
  btn.hidden = total <= LIST_LIMIT;
  const rest = total - shownCount;
  // 다음에 추가될 개수: 보통 10개, 10개 미만이 남았으면 남은 만큼
  btn.textContent = rest > 0 ? `더보기 (+${Math.min(LIST_STEP, rest)}개)` : "접기";
  btn.setAttribute("aria-expanded", rest > 0 ? "false" : "true");
}

// 더보기: 10개씩 추가, 다 보이는 상태에서 누르면 처음 5개로 접기
function nextShown(current, total) {
  return current >= total ? LIST_LIMIT : current + LIST_STEP;
}

function markCurrentConv() {
  document.querySelectorAll(".conv-item").forEach((li) =>
    li.setAttribute("aria-current", li.dataset.id === state.conversationId ? "true" : "false"));
}

async function openConversation(id) {
  try {
    const conv = await api(`/api/conversations/${id}`);
    state.conversationId = conv.id;
    $("#chat-title").textContent = conv.title;
    $("#messages").innerHTML = "";
    conv.messages.forEach((m) => addMessage(m.role, m.content));
    markCurrentConv();
    switchTab("chat");
  } catch (e) {
    alert(`대화를 불러오지 못했어요: ${e.message}`);
  }
}

async function deleteConversation(id) {
  if (!confirm("이 대화를 삭제할까요?")) return;
  try {
    await api(`/api/conversations/${id}`, { method: "DELETE" });
    if (state.conversationId === id) newChat();
    loadConversations();
  } catch (e) {
    alert(`삭제하지 못했어요: ${e.message}`);
  }
}

/* ---------- 컨디션 기록 (CRUD) ---------- */
const todayStr = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

function resetForm() {
  state.editingId = null;
  $("#data-form").reset();
  $("#f-date").value = todayStr();
  $("#o-value").textContent = $("#f-value").value;
  $("#o-stress").textContent = $("#f-stress").value;
  $("#form-title").textContent = "오늘 컨디션 체크";
  $("#data-submit").textContent = "기록 저장";
  $("#cancel-edit").hidden = true;
  $("#data-form").classList.remove("editing");
}

function startEdit(id) {
  const item = state.data.find((d) => d.id === id);
  if (!item) return;
  state.editingId = id;
  $("#f-date").value = item.date;
  $("#f-value").value = item.value;
  $("#f-stress").value = item.stress;
  $("#f-sleep").value = item.sleep_hours;
  $("#f-weight").value = item.weight_kg ?? "";
  $("#f-goal").value = item.goal || "회복";
  $("#f-memo").value = item.memo || "";
  $("#o-value").textContent = item.value;
  $("#o-stress").textContent = item.stress;
  $("#form-title").textContent = `${item.date} 기록 수정`;
  $("#data-submit").textContent = "수정 저장";
  $("#cancel-edit").hidden = false;
  $("#data-form").classList.add("editing");
  $("#form-msg").textContent = "";
  $("#data-form").scrollIntoView({ behavior: "smooth", block: "start" });
}

function formMsg(text, isErr = false) {
  const el = $("#form-msg");
  el.textContent = text;
  el.classList.toggle("err", isErr);
}

async function submitData(e) {
  e.preventDefault();
  const payload = {
    date: $("#f-date").value,
    value: Number($("#f-value").value),
    stress: Number($("#f-stress").value),
    sleep_hours: Number($("#f-sleep").value),
    weight_kg: $("#f-weight").value === "" ? null : Number($("#f-weight").value),
    goal: $("#f-goal").value,
    memo: $("#f-memo").value.trim(),
  };
  const btn = $("#data-submit");
  btn.disabled = true;
  try {
    if (state.editingId) {
      await api(`/api/data/${state.editingId}`, { method: "PUT", body: JSON.stringify(payload) });
      formMsg(`${payload.date} 기록을 수정했어요.`);
    } else {
      await api("/api/data", { method: "POST", body: JSON.stringify(payload) });
      formMsg(`${payload.date} 기록을 저장했어요.`);
    }
    if (payload.stress >= 7) {
      formMsg($("#form-msg").textContent + " 스트레스가 높아서 껌냥이가 음악을 고르고 있어요.");
      waitForPlaylist(payload.date);
    }
    resetForm();
    await Promise.all([loadData(), loadSummary()]);
  } catch (err) {
    formMsg(err.message, true);
  } finally {
    btn.disabled = false;
  }
}

async function deleteData(id) {
  const item = state.data.find((d) => d.id === id);
  if (!confirm(`${item ? item.date : ""} 기록을 삭제할까요?`)) return;
  try {
    await api(`/api/data/${id}`, { method: "DELETE" });
    if (state.editingId === id) resetForm();
    formMsg("기록을 삭제했어요.");
    await Promise.all([loadData(), loadSummary()]);
  } catch (e) {
    formMsg(e.message, true);
  }
}

function renderData() {
  const ul = $("#data-list");
  if (!state.data.length) {
    ul.innerHTML = `<li class="empty">아직 기록이 없어요. 위에서 오늘 컨디션을 기록해 보세요.</li>`;
    $("#more-data").hidden = true;
    return;
  }
  const shown = state.data.slice(0, state.dataShown);
  ul.innerHTML = shown.map((d) => `
    <li class="data-item" data-id="${esc(d.id)}">
      <span class="score" aria-label="컨디션 ${d.value}점">${d.value}</span>
      <span>${esc(d.date)}</span>
      <span class="data-actions">
        <button type="button" data-act="edit">수정</button>
        <button type="button" data-act="del">삭제</button>
      </span>
      <span class="data-meta">
        ${d.goal ? esc(d.goal) + " · " : ""}스트레스 ${d.stress} · 수면 ${d.sleep_hours}h${d.weight_kg != null ? ` · 몸무게 ${d.weight_kg}kg` : ""}${d.memo ? " · " + esc(d.memo) : ""}
      </span>
    </li>`).join("");
  updateMoreButton($("#more-data"), state.data.length, state.dataShown);
}

async function loadData() {
  try {
    state.data = await api("/api/data");
    renderData();
  } catch (e) {
    $("#data-list").innerHTML = `<li class="empty">${esc(e.message)}</li>`;
  }
}

/* ---------- 스트레스 날 음악 ---------- */
// AI가 곡을 고르는 데 시간이 걸려서, 해당 날짜 목록이 생길 때까지 몇 번 다시 확인
async function waitForPlaylist(date, tries = 20) {
  for (let i = 0; i < tries; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    try {
      const lists = await api("/api/playlists");
      if (lists.some((p) => p.date === date)) {
        await loadPlaylists();
        formMsg(`${date} 스트레스 날 음악이 저장됐어요.`);
        return;
      }
    } catch { /* 다음 시도 */ }
  }
  formMsg("음악 저장이 늦어지고 있어요. 잠시 후 새로고침해 보세요.");
}

async function loadPlaylists() {
  const box = $("#playlists");
  try {
    const lists = await api("/api/playlists");
    if (!lists.length) {
      box.innerHTML = `<p class="empty">아직 저장된 음악이 없어요.</p>`;
      return;
    }
    box.innerHTML = lists.map((p) => `
      <article class="playlist">
        <h3>${esc(p.date)} · 스트레스 ${p.stress}</h3>
        <ol>${p.songs.map((s) => {
          const q = encodeURIComponent(`${s.artist} ${s.title}`);
          return `<li><a href="https://www.youtube.com/results?search_query=${q}" target="_blank" rel="noopener">${esc(s.title)} - ${esc(s.artist)}</a>
            ${s.reason ? `<small>${esc(s.reason)}</small>` : ""}</li>`;
        }).join("")}</ol>
      </article>`).join("");
  } catch (e) {
    box.innerHTML = `<p class="empty">${esc(e.message)}</p>`;
  }
}

/* ---------- 모바일 탭 ---------- */
function switchTab(tab) {
  document.body.dataset.tab = tab;
  document.querySelectorAll(".tabbar button").forEach((b) => {
    if (b.dataset.go === tab) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
}

/* ---------- 이벤트 ---------- */
function bindEvents() {
  const input = $("#chat-input");
  $("#chat-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const text = input.value;
    input.value = "";
    input.style.height = "";
    sendMessage(text);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      $("#chat-form").requestSubmit();
    }
  });
  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = input.scrollHeight + "px";
  });
  document.querySelectorAll(".chip").forEach((chip) =>
    chip.addEventListener("click", () => sendMessage(chip.dataset.q, chip.dataset.mode)));

  $("#new-chat").addEventListener("click", newChat);
  $("#conv-list").addEventListener("click", (e) => {
    const li = e.target.closest(".conv-item");
    if (!li) return;
    if (e.target.closest(".conv-del")) deleteConversation(li.dataset.id);
    else if (e.target.closest(".conv-open")) openConversation(li.dataset.id);
  });

  $("#data-form").addEventListener("submit", submitData);
  $("#cancel-edit").addEventListener("click", () => { resetForm(); formMsg(""); });
  $("#f-value").addEventListener("input", (e) => { $("#o-value").textContent = e.target.value; });
  $("#f-stress").addEventListener("input", (e) => { $("#o-stress").textContent = e.target.value; });
  $("#data-list").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;
    const id = btn.closest(".data-item").dataset.id;
    btn.dataset.act === "edit" ? startEdit(id) : deleteData(id);
  });
  $("#more-data").addEventListener("click", () => {
    state.dataShown = nextShown(state.dataShown, state.data.length);
    renderData();
  });
  $("#more-conv").addEventListener("click", () => {
    state.convShown = nextShown(state.convShown, state.convs.length);
    renderConversations();
  });

  document.querySelectorAll(".tabbar button").forEach((b) =>
    b.addEventListener("click", () => switchTab(b.dataset.go)));
}

/* ---------- 시작 ---------- */
(async function init() {
  bindEvents();
  resetForm();
  const ok = await wakeServer();
  if (!ok) return;
  await Promise.all([loadSummary(), loadData(), loadConversations(), loadPlaylists()]);
})();
