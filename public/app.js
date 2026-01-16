const LS_KEY = "chat_sab_state_v1";
const LS_SETTINGS = "chat_sab_settings_v1";

// DOM
const chatListEl = document.getElementById("chatList");
const messagesEl = document.getElementById("messages");
const inputEl = document.getElementById("input");
const sendBtn = document.getElementById("sendBtn");
const newChatBtn = document.getElementById("newChatBtn");
const clearAllBtn = document.getElementById("clearAllBtn");

const chatTitleEl = document.getElementById("chatTitle");
const chatMetaEl = document.getElementById("chatMeta");
const streamToggleEl = document.getElementById("streamToggle");
const regenBtn = document.getElementById("regenBtn");

const addImgBtn = document.getElementById("addImgBtn");
const fileInput = document.getElementById("fileInput");
const imgPreview = document.getElementById("imgPreview");
const imgPreviewEl = document.getElementById("imgPreviewEl");
const removeImgBtn = document.getElementById("removeImgBtn");
const stopBtn = document.getElementById("stopBtn");

const settingsBtn = document.getElementById("settingsBtn");
const settingsModal = document.getElementById("settingsModal");
const closeSettingsBtn = document.getElementById("closeSettingsBtn");
const saveSettingsBtn = document.getElementById("saveSettingsBtn");
const themeSelect = document.getElementById("themeSelect");
const historySelect = document.getElementById("historySelect");
const fontSelect = document.getElementById("fontSelect");

const profileBtn = document.getElementById("profileBtn");
const profileModal = document.getElementById("profileModal");
const closeProfileBtn = document.getElementById("closeProfileBtn");
const profileBody = document.getElementById("profileBody");
const logoutBtn = document.getElementById("logoutBtn");

const authBox = document.getElementById("authBox");

// State
let state = loadState();
let activeChatId = state.activeChatId || null;

let settings = loadSettings();
applySettings();

let attachedImage = null;
let aborter = null;

let me = null;
let limits = null;

// init
(async function init() {
  await refreshMe();

  if (!state.chats || !Array.isArray(state.chats)) state = { chats: [], activeChatId: null };

  if (!activeChatId || !state.chats.find(c => c.id === activeChatId)) {
    const id = createChat("Новый чат");
    activeChatId = id;
    state.activeChatId = id;
    saveState();
  }

  // гости могут писать
  setChatInputEnabled(true);

  renderAll();
})();

// ---------- helpers ----------
function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
function nowStr() {
  return new Date().toLocaleString();
}
function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, m => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[m]));
}

function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { chats: [], activeChatId: null };
    const parsed = JSON.parse(raw);
    if (!parsed?.chats) return { chats: [], activeChatId: null };
    return parsed;
  } catch {
    return { chats: [], activeChatId: null };
  }
}
function saveState() {
  localStorage.setItem(LS_KEY, JSON.stringify(state));
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(LS_SETTINGS);
    if (!raw) return { theme: "dark", history: 4, font: 16 };
    const s = JSON.parse(raw);
    return { theme: s.theme || "dark", history: Number(s.history || 10), font: Number(s.font || 16) };
  } catch {
    return { theme: "dark", history: 10, font: 16 };
  }
}
function saveSettings() {
  localStorage.setItem(LS_SETTINGS, JSON.stringify(settings));
}
function applySettings() {
  document.documentElement.setAttribute("data-theme", settings.theme);
  document.documentElement.style.setProperty("--font", `${settings.font}px`);
  themeSelect.value = settings.theme;
  historySelect.value = String(settings.history);
  fontSelect.value = String(settings.font);
}

// ---------- auth ----------
async function refreshMe() {
  const res = await fetch("/api/auth/me");
  const data = await res.json();
  me = data.user;
  limits = data.limits || null;

  renderAuthBox();
  renderProfileBody();

  // гости могут писать, но upload только после входа
  addImgBtn.disabled = !me;
}

function renderAuthBox() {
  // ВАЖНО: логин теперь только для увеличения лимита (а не чтобы писать)
  if (me) {
    authBox.innerHTML = `
      <div><b>Аккаунт:</b> ${escapeHtml(me.username)}</div>
      <div class="small">Тариф: <b>${me.plan}</b></div>
      <div class="small">Лимит: <b>${limits?.requestsPerDay ?? "?"}</b> запросов/день</div>
    `;
    return;
  }

  authBox.innerHTML = `
    <div><b>Вход / Регистрация (для увеличения лимита)</b></div>
    <div class="authRow">
      <input id="uInput" class="input" placeholder="username" />
    </div>
    <div class="authRow">
      <input id="pInput" class="input" placeholder="password" type="password" />
    </div>
    <div class="authRow">
      <button id="loginBtn" class="btn primary full">Войти</button>
    </div>
    <div class="authRow">
      <button id="regBtn" class="btn ghost full">Регистрация</button>
    </div>
    <div id="authMsg" class="small"></div>
    <div class="small">Можно писать и без аккаунта. Аккаунт нужен, чтобы лимит был больше.</div>
  `;

  const u = document.getElementById("uInput");
  const p = document.getElementById("pInput");
  const msg = document.getElementById("authMsg");

  document.getElementById("loginBtn").onclick = async () => {
    msg.textContent = "";
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: u.value.trim(), password: p.value })
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      msg.textContent = data?.message || "Ошибка входа.";
      return;
    }
    await refreshMe();
  };

  document.getElementById("regBtn").onclick = async () => {
    msg.textContent = "";
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: u.value.trim(), password: p.value })
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      msg.textContent = data?.message || "Ошибка регистрации.";
      return;
    }
    await refreshMe();
  };
}

function setChatInputEnabled(enabled) {
  inputEl.disabled = !enabled;
  sendBtn.disabled = !enabled;
  newChatBtn.disabled = !enabled;
  regenBtn.disabled = !enabled;
  inputEl.placeholder = enabled ? "Написать сообщение..." : "—";
}

// ---------- profile ----------
function renderProfileBody() {
  if (!profileBody) return;

  if (!me) {
    profileBody.innerHTML = `<div class="small">Войдите, чтобы управлять лимитом (писать можно и без входа).</div>`;
    return;
  }

  profileBody.innerHTML = `
    <div><b>Username:</b> ${escapeHtml(me.username)}</div>
    <div class="small">Тариф: <b>${me.plan}</b></div>
    <div class="small">Лимит: <b>${limits?.requestsPerDay ?? "?"}</b> запросов/день</div>

    <hr style="border:none;border-top:1px solid var(--border);margin:14px 0;">

    <div><b>Увеличить лимит</b></div>
    <div class="small">Введите код апгрейда (для теста).</div>
    <div class="authRow">
      <input id="upgradeCode" class="input" placeholder="CHAT_SAB_PLUS" />
    </div>
    <div class="authRow">
      <button id="upgradeBtn" class="btn primary full">Активировать</button>
    </div>
    <div id="upgradeMsg" class="small"></div>
  `;

  const btn = document.getElementById("upgradeBtn");
  const inp = document.getElementById("upgradeCode");
  const msg = document.getElementById("upgradeMsg");

  btn.onclick = async () => {
    msg.textContent = "";
    const res = await fetch("/api/profile/upgrade", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: inp.value.trim() })
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      msg.textContent = data?.message || "Не получилось.";
      return;
    }
    msg.textContent = "Готово! Лимит увеличен.";
    await refreshMe();
  };
}

profileBtn.onclick = () => profileModal.classList.remove("hidden");
closeProfileBtn.onclick = () => profileModal.classList.add("hidden");

logoutBtn.onclick = async () => {
  await fetch("/api/auth/logout", { method: "POST" });
  me = null;
  limits = null;
  profileModal.classList.add("hidden");
  await refreshMe();
};

// ---------- chats ----------
function createChat(name = "Новый чат") {
  const id = uid();
  state.chats.unshift({ id, name, createdAt: Date.now(), updatedAt: Date.now(), messages: [] });
  return id;
}
function getActiveChat() {
  return state.chats.find(c => c.id === activeChatId);
}

// ---------- render ----------
function renderAll() {
  renderChatList();
  renderChatHeader();
  renderMessages();
}
function renderChatList() {
  chatListEl.innerHTML = "";
  for (const c of state.chats) {
    const div = document.createElement("div");
    div.className = "chatItem" + (c.id === activeChatId ? " active" : "");
    div.innerHTML = `
      <div class="name">${escapeHtml(c.name)}</div>
      <div class="meta">${new Date(c.updatedAt).toLocaleTimeString()}</div>
    `;
    div.onclick = () => {
      abortStream();
      activeChatId = c.id;
      state.activeChatId = activeChatId;
      saveState();
      renderAll();
    };
    chatListEl.appendChild(div);
  }
}
function renderChatHeader() {
  const chat = getActiveChat();
  if (!chat) return;
  const who = me ? `Аккаунт: ${me.username} (${me.plan})` : "Гость";
  chatTitleEl.textContent = chat.name;
  chatMetaEl.textContent = `${who} • Сообщений: ${chat.messages.length} • История: ${settings.history} • Stream: ${streamToggleEl.checked ? "ON" : "OFF"}`;
}
function renderMessages() {
  const chat = getActiveChat();
  if (!chat) return;

  messagesEl.innerHTML = "";
  for (const m of chat.messages) {
    const row = document.createElement("div");
    row.className = "msgRow " + (m.role === "user" ? "user" : "ai");

    const bubble = document.createElement("div");
    bubble.className = "bubble";

    const meta = document.createElement("div");
    meta.className = "msgMeta";
    meta.innerHTML = `<span>${m.role === "user" ? "Ты" : "ИИ"}</span><span>${m.time}</span>`;

    const text = document.createElement("div");
    text.className = "msgText";
    text.textContent = m.text || "";

    bubble.appendChild(meta);
    bubble.appendChild(text);

    if (m.imageUrl) {
      const img = document.createElement("img");
      img.src = m.imageUrl;
      img.className = "imgInMsg";
      bubble.appendChild(img);
    }

    row.appendChild(bubble);
    messagesEl.appendChild(row);
  }

  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// ---------- settings ----------
settingsBtn.onclick = () => settingsModal.classList.remove("hidden");
closeSettingsBtn.onclick = () => settingsModal.classList.add("hidden");
saveSettingsBtn.onclick = () => {
  settings = {
    theme: themeSelect.value,
    history: Number(historySelect.value),
    font: Number(fontSelect.value)
  };
  saveSettings();
  applySettings();
  settingsModal.classList.add("hidden");
  renderChatHeader();
};

// ---------- stream ----------
function abortStream() {
  if (aborter) {
    aborter.abort();
    aborter = null;
  }
  stopBtn.classList.add("hidden");
  sendBtn.disabled = false;
}
stopBtn.onclick = () => abortStream();

// ---------- image upload (only logged in) ----------
addImgBtn.onclick = () => {
  if (!me) {
    alert("Загрузка фото доступна после входа/регистрации.");
    return;
  }
  fileInput.click();
};

fileInput.onchange = async () => {
  const file = fileInput.files?.[0];
  if (!file) return;

  try {
    const fd = new FormData();
    fd.append("image", file);

    const res = await fetch("/api/upload", { method: "POST", body: fd });
    const data = await res.json();

    if (!res.ok || !data.ok) {
      alert(data?.message || "Ошибка загрузки изображения.");
      return;
    }

    attachedImage = data;
    imgPreviewEl.src = data.url;
    imgPreview.classList.remove("hidden");
  } catch {
    alert("Ошибка загрузки изображения.");
  }
};

removeImgBtn.onclick = () => {
  attachedImage = null;
  imgPreview.classList.add("hidden");
  fileInput.value = "";
};

// ---------- UI buttons ----------
newChatBtn.onclick = () => {
  abortStream();
  const id = createChat("Новый чат");
  activeChatId = id;
  state.activeChatId = id;
  saveState();
  renderAll();
};

clearAllBtn.onclick = () => {
  if (!confirm("Очистить все чаты (локально)?")) return;
  abortStream();
  state = { chats: [], activeChatId: null };
  localStorage.setItem(LS_KEY, JSON.stringify(state));
  const id = createChat("Новый чат");
  activeChatId = id;
  state.activeChatId = id;
  saveState();
  renderAll();
};

regenBtn.onclick = () => regenerateLast();

// ---------- send ----------
sendBtn.onclick = () => sendMessage();
inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

function setAiText(chat, aiId, text) {
  const msg = chat.messages.find(m => m.id === aiId);
  if (!msg) return;
  msg.text = text;
  chat.updatedAt = Date.now();
  saveState();
  renderMessages();
  renderChatHeader();
}

function formatForOpenAI(chat) {
  const MAX_MSG = settings.history;
  const sliced = chat.messages.slice(-MAX_MSG);

  const sys = { role: "system", content: "Ты полезный ИИ ассистент. Отвечай ясно и по делу." };
  const msgs = [sys];

  for (const m of sliced) {
    if (m.role === "user") {
      if (m.imageDataUrl) {
        msgs.push({
          role: "user",
          content: [
            { type: "text", text: m.text || "" },
            { type: "image_url", image_url: { url: m.imageDataUrl } }
          ]
        });
      } else {
        msgs.push({ role: "user", content: m.text || "" });
      }
    } else if (m.role === "assistant") {
      msgs.push({ role: "assistant", content: m.text || "" });
    }
  }
  return msgs;
}

function appLimitText(isLoggedIn) {
  return isLoggedIn
    ? "⚠️ Вы достигли лимита вашего тарифа на сегодня.\n⏳ Попробуйте завтра или активируйте апгрейд."
    : "⚠️ Вы достигли гостевого лимита на сегодня.\n✅ Зарегистрируйтесь/войдите, чтобы получить больше запросов.";
}
function openAiLimitText(sec = 60) {
  return `⚠️ Вы достигли лимита OpenAI на минуту.\n⏳ Подождите ${sec} сек и попробуйте снова.`;
}

async function sendMessage() {
  const text = inputEl.value.trim();
  if (!text && !attachedImage) return;

  abortStream();
  const chat = getActiveChat();
  if (!chat) return;

  chat.messages.push({
    id: uid(),
    role: "user",
    text,
    time: nowStr(),
    imageUrl: attachedImage?.url || null,
    imageDataUrl: attachedImage?.dataUrl || null
  });

  if (chat.name === "Новый чат" && text) chat.name = text.slice(0, 24);
  chat.updatedAt = Date.now();

  inputEl.value = "";
  attachedImage = null;
  imgPreview.classList.add("hidden");
  fileInput.value = "";

  saveState();
  renderAll();

  const aiId = uid();
  chat.messages.push({ id: aiId, role: "assistant", text: "", time: nowStr() });
  chat.updatedAt = Date.now();
  saveState();
  renderAll();

  const useStream = !!streamToggleEl.checked;
  if (useStream) await callAIStream(chat, aiId);
  else await callAINormal(chat, aiId);
}

async function regenerateLast() {
  const chat = getActiveChat();
  if (!chat) return;

  abortStream();

  for (let i = chat.messages.length - 1; i >= 0; i--) {
    if (chat.messages[i].role === "assistant") {
      chat.messages.splice(i, 1);
      break;
    }
  }

  const aiId = uid();
  chat.messages.push({ id: aiId, role: "assistant", text: "", time: nowStr() });
  chat.updatedAt = Date.now();
  saveState();
  renderAll();

  const useStream = !!streamToggleEl.checked;
  if (useStream) await callAIStream(chat, aiId);
  else await callAINormal(chat, aiId);
}

async function callAINormal(chat, aiId) {
  try {
    sendBtn.disabled = true;
    stopBtn.classList.add("hidden");

    const messages = formatForOpenAI(chat);
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages })
    });

    let data = null;
    try { data = await res.json(); } catch {}

    if (!res.ok || data?.ok === false) {
      if (data?.code === "APP_LIMIT") setAiText(chat, aiId, appLimitText(!!me));
      else if (data?.code === "RATE_LIMIT") setAiText(chat, aiId, openAiLimitText(data.retry_after_sec || 60));
      else setAiText(chat, aiId, `⚠️ ${data?.message || "Ошибка. Попробуйте позже."}`);
      return;
    }

    setAiText(chat, aiId, data.content || "");
  } catch {
    setAiText(chat, aiId, "⚠️ Ошибка. Попробуйте позже.");
  } finally {
    sendBtn.disabled = false;
  }
}

async function callAIStream(chat, aiId) {
  aborter = new AbortController();
  stopBtn.classList.remove("hidden");
  sendBtn.disabled = true;

  try {
    const messages = formatForOpenAI(chat);
    const res = await fetch("/api/chat/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
      signal: aborter.signal
    });

    if (!res.ok) {
      let data = null;
      try { data = await res.json(); } catch {}

      if (data?.code === "APP_LIMIT") setAiText(chat, aiId, appLimitText(!!me));
      else if (data?.code === "RATE_LIMIT") setAiText(chat, aiId, openAiLimitText(data.retry_after_sec || 60));
      else setAiText(chat, aiId, `⚠️ ${data?.message || "Ошибка. Попробуйте позже."}`);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");

    let buf = "";
    let full = "";

    const parseSSE = (chunk) => {
      buf += chunk;
      const parts = buf.split("\n\n");
      buf = parts.pop() || "";

      for (const p of parts) {
        const lines = p.split("\n");
        let event = "message";
        let data = "";

        for (const line of lines) {
          if (line.startsWith("event:")) event = line.slice(6).trim();
          if (line.startsWith("data:")) data += line.slice(5).trim();
        }

        if (event === "token") {
          try {
            const j = JSON.parse(data);
            full += j.t || "";
            setAiText(chat, aiId, full);
          } catch {}
        } else if (event === "error") {
          let msg = data;
          try { msg = JSON.parse(data).message || data; } catch {}
          setAiText(chat, aiId, `⚠️ ${msg}`);
        }
      }
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      parseSSE(decoder.decode(value, { stream: true }));
    }
  } catch (e) {
    if (e?.name === "AbortError") {
      const cur = getActiveChat()?.messages?.find(m => m.id === aiId)?.text || "";
      setAiText(chat, aiId, cur + "\n\n[Остановлено]");
    } else {
      setAiText(chat, aiId, "⚠️ Ошибка. Попробуйте позже.");
    }
  } finally {
    abortStream();
  }
}
