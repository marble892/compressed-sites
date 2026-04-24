const statusEl = document.getElementById("status");
const unreadEl = document.getElementById("unread");
const chatArea = document.getElementById("chat-area");
const form = document.getElementById("composer");
const input = document.getElementById("message");
const typingEl = document.getElementById("typing");
const topicEl = document.getElementById("topic");
const userListEl = document.getElementById("user-list");
const statsEl = document.getElementById("stats");
const charCountEl = document.getElementById("char-count");
const toggleSound = document.getElementById("toggle-sound");
const toggleTimestamps = document.getElementById("toggle-timestamps");
const toggleScroll = document.getElementById("toggle-scroll");
const toggleCompact = document.getElementById("toggle-compact");
const toggleHideSystem = document.getElementById("toggle-hide-system");
const toggleMentions = document.getElementById("toggle-mentions");
const searchInput = document.getElementById("search");
const soundVolume = document.getElementById("sound-volume");
const soundTestBtn = document.getElementById("sound-test");
const clearBtn = document.getElementById("clear-chat");
const pinLastBtn = document.getElementById("pin-last");
const clearPinsBtn = document.getElementById("clear-pins");
const copyLastBtn = document.getElementById("copy-last");
const saveTranscriptBtn = document.getElementById("save-transcript");
const pinnedList = document.getElementById("pinned-list");

let socket;
let nickname = "marble";
let messageCount = 0;
let startTime = Date.now();
let onlineCount = 0;
let soundEnabled = false;
let soundLevel = 0.3;
let showTimestamps = true;
let autoScroll = true;
let highlightMentions = true;
let isTyping = false;
const typingUsers = new Map();
let typingSelfTimer;
let unreadCount = 0;
let windowFocused = true;
let lastMessageTs = 0;
let baseName = "";
let audioCtx;

function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

function formatTime(ts) {
  const date = new Date(ts);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function updateStats() {
  const minutes = Math.max(1, Math.floor((Date.now() - startTime) / 60000));
  const rate = (messageCount / minutes).toFixed(1);
  statsEl.textContent = `You: ${nickname} • Online: ${onlineCount} • Messages: ${messageCount} • Rate: ${rate}/min`;
}

function updateUnread() {
  unreadEl.textContent = `Unread: ${unreadCount}`;
  document.title = unreadCount > 0 ? `(${unreadCount}) family barbeques` : "family barbeques";
}

function sanitizeEmotes(text) {
  return text
}

function linkify(text) {
  const fragment = document.createDocumentFragment();
  const regex = /(https?:\/\/[^\s]+)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    const before = text.slice(lastIndex, match.index);
    if (before) {
      fragment.appendChild(document.createTextNode(before));
    }

    const link = document.createElement("a");
    link.href = match[0];
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.className = "link";
    link.textContent = match[0];
    fragment.appendChild(link);
    lastIndex = match.index + match[0].length;
  }

  const after = text.slice(lastIndex);
  if (after) {
    fragment.appendChild(document.createTextNode(after));
  }

  return fragment;
}

function addSeparator(ts) {
  const separator = document.createElement("div");
  separator.className = "separator";
  separator.textContent = `— ${new Date(ts).toLocaleString()} —`;
  chatArea.appendChild(separator);
}

function addMessage({ type, nickname: name, text, ts, color }) {
  if (lastMessageTs && Math.abs(ts - lastMessageTs) > 5 * 60 * 1000) {
    addSeparator(ts);
  }
  lastMessageTs = ts;

  const msg = document.createElement("div");
  msg.className = `message ${type === "system" ? "system" : ""} ${type === "action" ? "action" : ""}`;
  msg.dataset.text = String(text || "").toLowerCase();
  msg.dataset.user = String(name || "").toLowerCase();

  if (type === "system") {
    msg.textContent = showTimestamps ? `[${formatTime(ts)}] ${text}` : text;
  } else {
    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = showTimestamps ? `[${formatTime(ts)}] ${name}` : name;
    if (color) {
      meta.style.color = color;
    }

    const body = document.createElement("div");
    const processed = sanitizeEmotes(text);
    body.appendChild(linkify(processed));

    msg.appendChild(meta);
    msg.appendChild(body);
  }

  if (
    highlightMentions &&
    type !== "system" &&
    text &&
    (text.toLowerCase().includes(nickname.toLowerCase()) ||
      (baseName && text.toLowerCase().includes(baseName.toLowerCase())))
  ) {
    msg.classList.add("mention");
  }

  chatArea.appendChild(msg);
  if (autoScroll) {
    chatArea.scrollTop = chatArea.scrollHeight;
  }
}

function playSound() {
  if (!soundEnabled) {
    return;
  }
  try {
    const ctx = getAudioContext();
    if (ctx.state === "suspended") {
      ctx.resume();
    }
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = 640;
    gain.gain.value = Math.max(0.01, Math.min(soundLevel, 1));
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.08);
  } catch {
    // Ignore audio errors
  }
}

function updateTypingIndicator() {
  const names = Array.from(typingUsers.keys());
  if (names.length === 0) {
    typingEl.innerHTML = "&nbsp;";
    return;
  }
  typingEl.textContent = `${names.join(", ")} ${names.length === 1 ? "is" : "are"} typing...`;
}

function connect() {
  const scheme = window.location.protocol === "https:" ? "wss" : "ws";
  socket = new WebSocket(`${scheme}://familybarbeques.nnfsystems.com:443`);

  socket.addEventListener("open", () => {
    statusEl.textContent = "Connected";
    statusEl.style.color = "#1a6b2d";
  });

  socket.addEventListener("close", () => {
    statusEl.textContent = "Disconnected - retrying...";
    statusEl.style.color = "#b02929";
    setTimeout(connect, 1200);
  });

  socket.addEventListener("message", (event) => {
    try {
      const payload = JSON.parse(event.data);
      if (payload.type === "welcome") {
        nickname = payload.nickname
        baseName = nickname.split("#")[0] || nickname;
        topicEl.textContent = payload.topic || "";
        startTime = Date.now();
        addMessage({
          type: "system",
          text: `You are ${nickname}.`,
          ts: payload.ts
        });
        updateStats();
        updateUnread();
        autoscript();
        return;
      }
      if (payload.type === "topic") {
        topicEl.textContent = payload.topic;
        addMessage({
          type: "system",
          text: `${payload.nickname} updated the topic.`,
          ts: payload.ts
        });
        return;
      }
      if (payload.type === "roster") {
        userListEl.innerHTML = "";
        onlineCount = payload.users.length;
        payload.users.forEach((user) => {
          const item = document.createElement("li");
          const name = document.createElement("span");
          name.textContent = user.nickname;
          item.appendChild(name);
          if (user.status === "away") {
            item.appendChild(document.createTextNode(" (away)"));
          }
          if (user.mood) {
            const mood = document.createElement("em");
            mood.textContent = ` — ${user.mood}`;
            item.appendChild(mood);
          }
          userListEl.appendChild(item);
        });
        updateStats();
        return;
      }
      if (payload.type === "typing") {
        if (payload.nickname === nickname) {
          return;
        }
        if (payload.isTyping) {
          if (typingUsers.has(payload.nickname)) {
            clearTimeout(typingUsers.get(payload.nickname));
          }
          const timeout = setTimeout(() => {
            typingUsers.delete(payload.nickname);
            updateTypingIndicator();
          }, 2500);
          typingUsers.set(payload.nickname, timeout);
        } else {
          typingUsers.delete(payload.nickname);
        }
        updateTypingIndicator();
        return;
      }

      if (payload.type === "chat" || payload.type === "system" || payload.type === "action") {
        addMessage(payload);
        if (payload.type === "chat" || payload.type === "action") {
          messageCount += 1;
          updateStats();
          if (payload.nickname !== nickname) {
            playSound();
            if (!windowFocused) {
              unreadCount += 1;
              updateUnread();
            }
          }
        }
        return;
      }
    } catch {
      // Ignore malformed
    }
  });
}

function sendTyping(state) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return;
  }
  socket.send(JSON.stringify({ type: "typing", isTyping: state }));
}

function clearChat() {
  chatArea.innerHTML = "";
  addMessage({ type: "system", text: "Chat cleared locally.", ts: Date.now() });
}

function filterMessages() {
  const query = searchInput.value.trim().toLowerCase();
  const messages = chatArea.querySelectorAll(".message");
  messages.forEach((msg) => {
    const match = !query || msg.dataset.text.includes(query) || msg.dataset.user.includes(query);
    msg.style.display = match ? "" : "none";
  });
}

function pinMessage(text) {
  const item = document.createElement("li");
  item.textContent = text;
  pinnedList.prepend(item);
}

function getLastChatMessage() {
  const messages = Array.from(chatArea.querySelectorAll(".message"));
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (!messages[i].classList.contains("system")) {
      return messages[i];
    }
  }
  return null;
}

function saveTranscript() {
  const lines = [];
  chatArea.querySelectorAll(".message").forEach((msg) => {
    lines.push(msg.textContent.trim());
  });
  const blob = new Blob([lines.join("\n")], { type: "text/plain" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `family-barbeques-${new Date().toISOString().slice(0, 10)}.txt`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function sendMessage(text) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return;
  }
  socket.send(JSON.stringify({ type: "chat", text }));
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = input.value.trim();
  if (!text) {
    return;
  }

  if (text.startsWith("/clear")) {
    clearChat();
  } else if (text.startsWith("/shrug")) {
    const suffix = text.replace("/shrug", "").trim();
    sendMessage(`${suffix ? `${suffix} ` : ""}¯\\_(ツ)_/¯`);
  } else if (text.startsWith("/")) {
    socket.send(JSON.stringify({ type: "command", text }));
  } else {
    sendMessage(text);
  }

  input.value = "";
  charCountEl.textContent = "0 / 400";
  isTyping = false;
  sendTyping(false);
  input.focus();
});

input.addEventListener("input", () => {
  const length = input.value.length;
  charCountEl.textContent = `${length} / 400`;
  if (!isTyping) {
    isTyping = true;
    sendTyping(true);
  }
  if (typingSelfTimer) {
    clearTimeout(typingSelfTimer);
  }
  typingSelfTimer = setTimeout(() => {
    isTyping = false;
    sendTyping(false);
  }, 1200);
});

input.addEventListener("blur", () => {
  isTyping = false;
  sendTyping(false);
});

toggleSound.addEventListener("change", (event) => {
  soundEnabled = event.target.checked;
  if (soundEnabled) {
    try {
      const ctx = getAudioContext();
      if (ctx.state === "suspended") {
        ctx.resume();
      }
    } catch {
      // ignore
    }
  }
});

soundVolume.addEventListener("input", (event) => {
  soundLevel = Number(event.target.value) / 100;
});

soundTestBtn.addEventListener("click", () => {
  const wasEnabled = soundEnabled;
  soundEnabled = true;
  playSound();
  soundEnabled = wasEnabled;
});

toggleTimestamps.addEventListener("change", (event) => {
  showTimestamps = event.target.checked;
});

toggleScroll.addEventListener("change", (event) => {
  autoScroll = event.target.checked;
});

toggleCompact.addEventListener("change", (event) => {
  document.body.classList.toggle("compact", event.target.checked);
});

toggleHideSystem.addEventListener("change", (event) => {
  document.body.classList.toggle("hide-system", event.target.checked);
});

toggleMentions.addEventListener("change", (event) => {
  highlightMentions = event.target.checked;
});

searchInput.addEventListener("input", filterMessages);

clearBtn.addEventListener("click", () => {
  clearChat();
});

pinLastBtn.addEventListener("click", () => {
  const last = getLastChatMessage();
  if (!last) {
    return;
  }
  pinMessage(last.textContent.trim());
});

clearPinsBtn.addEventListener("click", () => {
  pinnedList.innerHTML = "";
});

copyLastBtn.addEventListener("click", async () => {
  const last = getLastChatMessage();
  if (!last) {
    return;
  }
  try {
    await navigator.clipboard.writeText(last.textContent.trim());
  } catch {
    // ignore clipboard errors
  }
});

saveTranscriptBtn.addEventListener("click", () => {
  saveTranscript();
});

window.addEventListener("focus", () => {
  windowFocused = true;
  unreadCount = 0;
  updateUnread();
});

window.addEventListener("blur", () => {
  windowFocused = false;
});

function autoscript() {
  sendMessage("/nick marble");
  sendMessage("/color purple");
  clearChat();
}

connect();