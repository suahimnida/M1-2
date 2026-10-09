const API = (window.APP_CONFIG && window.APP_CONFIG.API_URL) || "http://localhost:8000";
const $ = (sel) => document.querySelector(sel);

const state = {
  conversationId: null,
  data: [],
  dataShown: 20,
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
    const trendClass = s.trend === "증가" ? "trend-up" : s.trend === "감소" ? "trend-down" : "";
    const rows = [
      ["기간", `${s.period.start.slice(5)} ~ ${s.period.end.slice(5)}`],
      ["기록 수", `${s.count}일`],
      ["평균 컨디션", `${s.condition.avg} / 10`],
      ["최근 7일", `${s.recent7_avg} <span class="${trendClass}">${s.trend}</span>`],
      ["최고 / 최저", `${s.condition.max} / ${s.condition.min}`],
      ["평균 스트레스", `${s.stress_avg} (${s.stress_trend})`],
      ["평균 수면", `${s.sleep_avg}시간`],
      ["컨디션 좋은 요일", `${s.best_weekday}요일`],
    ];
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

async function sendMessage(text) {
  text = text.trim();
  if (!text || state.sending) return;
  state.sending = true;
  $("#send-btn").disabled = true;
  addMessage("user", text);
  const typing = showTyping();
  try {
    const res = await api("/api/chat", {
      method: "POST",
      body: JSON.stringify({ message: text, conversation_id: state.conversationId }),
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
    const list = await api("/api/conversations");
    if (!list.length) {
      ul.innerHTML = `<li class="muted-note">저장된 대화가 없어요. 껌냥이에게 말을 걸면 자동으로 저장돼요.</li>`;
      return;
    }
    ul.innerHTML = list.map((c) => `
      <li class="conv-item" data-id="${esc(c.id)}">
        <button type="button" class="conv-open">
          <strong>${esc(c.title)}</strong>
          <small>${fmtDate(c.updated_at)} · 메시지 ${c.message_count}개</small>
        </button>
        <button type="button" class="conv-del" aria-label="${esc(c.title)} 삭제">삭제</button>
      </li>`).join("");
    markCurrentConv();
  } catch (e) {
    ul.innerHTML = `<li class="muted-note">${esc(e.message)}</li>`;
  }
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
      setTimeout(loadPlaylists, 6000);
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
  ul.innerHTML = state.data.slice(0, state.dataShown).map((d) => `
    <li class="data-item" data-id="${esc(d.id)}">
      <span class="score" aria-label="컨디션 ${d.value}점">${d.value}</span>
      <span>${esc(d.date)}</span>
      <span class="data-actions">
        <button type="button" data-act="edit">수정</button>
        <button type="button" data-act="del">삭제</button>
      </span>
      <span class="data-meta">
        ${d.goal ? esc(d.goal) + " · " : ""}<span class="${d.stress >= 7 ? "hot" : ""}">스트레스 ${d.stress}</span> · 수면 ${d.sleep_hours}h${d.memo ? " · " + esc(d.memo) : ""}
      </span>
    </li>`).join("");
  $("#more-data").hidden = state.data.length <= state.dataShown;
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
    chip.addEventListener("click", () => sendMessage(chip.dataset.q)));

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
  $("#more-data").addEventListener("click", () => { state.dataShown += 20; renderData(); });

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
