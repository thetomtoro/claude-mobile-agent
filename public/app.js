// ─── Config ──────────────────────────────────────────────────────────────────
const STORAGE_KEY      = 'claude-mobile-devices';
const TOKEN_KEY        = 'claude-mobile-token';
const ACTIVE_IDX_KEY   = 'claude-mobile-active';
const DEFAULT_PORT     = 3000;
const RECONNECT_DELAY  = 2000;

// ─── State ────────────────────────────────────────────────────────────────────
let ws = null;
let reconnectTimer = null;
let currentClaudeBubble = null;
let isUserScrolling = false;
let devices = [];
let activeIndex = 0;
let token = '';

// ─── DOM ──────────────────────────────────────────────────────────────────────
const chat       = document.getElementById('chat');
const inputEl    = document.getElementById('input');
const sendBtn    = document.getElementById('send-btn');
const deviceBtn  = document.getElementById('device-btn');
const statusDot  = document.getElementById('status-dot');
const modal      = document.getElementById('device-modal');
const deviceList = document.getElementById('device-list');
const addForm    = document.getElementById('add-device-form');
const addIpEl    = document.getElementById('add-device-ip');
const addNameEl  = document.getElementById('add-device-name');
const closeModal = document.getElementById('close-modal');

// ─── Token ────────────────────────────────────────────────────────────────────
function loadToken() {
  const params = new URLSearchParams(window.location.search);
  const urlToken = params.get('token');
  if (urlToken) {
    localStorage.setItem(TOKEN_KEY, urlToken);
    history.replaceState(null, '', window.location.pathname);
    return urlToken;
  }
  return localStorage.getItem(TOKEN_KEY) || '';
}

// ─── Devices ──────────────────────────────────────────────────────────────────
function loadDevices() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(devices));
  localStorage.setItem(ACTIVE_IDX_KEY, String(activeIndex));
}

function activeDevice() {
  return devices[activeIndex] || null;
}

// ─── Status ───────────────────────────────────────────────────────────────────
function setStatus(state) {
  statusDot.className = `dot dot--${state}`;
}

// ─── Scroll ───────────────────────────────────────────────────────────────────
chat.addEventListener('scroll', () => {
  const atBottom = chat.scrollHeight - chat.scrollTop - chat.clientHeight < 60;
  isUserScrolling = !atBottom;
});

function scrollToBottom() {
  if (!isUserScrolling) chat.scrollTop = chat.scrollHeight;
}

// ─── Bubbles ──────────────────────────────────────────────────────────────────
function createBubble(role) {
  const wrapper = document.createElement('div');
  wrapper.className = `bubble-wrapper bubble-wrapper--${role}`;

  if (role === 'claude') {
    const label = document.createElement('div');
    label.className = 'bubble-label';
    label.textContent = 'Claude';
    wrapper.appendChild(label);
  }

  const bubble = document.createElement('div');
  bubble.className = `bubble bubble--${role}`;
  wrapper.appendChild(bubble);
  chat.appendChild(wrapper);
  scrollToBottom();
  return bubble;
}

function stripAnsi(s) {
  return s
    .replace(/\x1b\[[?!><=]*[\d;]*[a-zA-Z]/g, '')  // CSI sequences (incl. private ?/>/<)
    .replace(/\x1b\][^\x07\x1b]*\x07/g, '')          // OSC sequences
    .replace(/\x1b[^[\]]/g, '')                       // ESC + single char
    .replace(/\r/g, '');                              // carriage returns
}

function appendToBubble(bubble, rawText) {
  const text = stripAnsi(rawText);
  if (!text) return;

  // If text looks like code output (tabs, or 4+ leading spaces on a line)
  const looksLikeCode = /^\s{4}|\t/.test(text);
  let pre = bubble.querySelector('pre');

  if (looksLikeCode || pre) {
    if (!pre) {
      pre = document.createElement('pre');
      bubble.appendChild(pre);
    }
    pre.textContent += text;
  } else {
    let span = bubble.querySelector('span:last-child');
    if (!span) {
      span = document.createElement('span');
      bubble.appendChild(span);
    }
    span.textContent += text;
  }
  scrollToBottom();
}

// ─── Message handlers ─────────────────────────────────────────────────────────
function handleHistory(data) {
  if (!data) return;
  const bubble = createBubble('claude');
  const pre = document.createElement('pre');
  pre.textContent = stripAnsi(data);
  bubble.appendChild(pre);
  currentClaudeBubble = null;
}

function handleOutput(data) {
  if (!currentClaudeBubble) currentClaudeBubble = createBubble('claude');
  appendToBubble(currentClaudeBubble, data);
}

function handleIdle() {
  currentClaudeBubble = null;
}

function handleExit(code) {
  currentClaudeBubble = null;
  const bubble = createBubble('system');
  bubble.textContent = `Session ended (exit ${code})`;
  setStatus('disconnected');
}

// ─── WebSocket ────────────────────────────────────────────────────────────────
function connect() {
  if (ws) {
    ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
    ws.close();
    ws = null;
  }
  clearTimeout(reconnectTimer);

  const device = activeDevice();
  if (!device) {
    deviceBtn.textContent = 'Add a device ▾';
    setStatus('disconnected');
    return;
  }

  const port = device.port || DEFAULT_PORT;
  deviceBtn.textContent = device.name || device.ip;
  setStatus('connecting');

  ws = new WebSocket(`ws://${device.ip}:${port}/?token=${encodeURIComponent(token)}`);

  ws.onopen = () => setStatus('connected');

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if      (msg.type === 'history') handleHistory(msg.data);
      else if (msg.type === 'output')  handleOutput(msg.data);
      else if (msg.type === 'idle')    handleIdle();
      else if (msg.type === 'exit')    handleExit(msg.code);
    } catch { /* ignore */ }
  };

  ws.onclose = () => {
    setStatus('connecting');
    reconnectTimer = setTimeout(connect, RECONNECT_DELAY);
  };

  ws.onerror = () => setStatus('disconnected');
}

function sendInput(text) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  const bubble = createBubble('user');
  bubble.textContent = text;
  currentClaudeBubble = null;
  isUserScrolling = false;
  scrollToBottom();
  ws.send(JSON.stringify({ type: 'input', data: text + '\n' }));
}

// ─── Input ────────────────────────────────────────────────────────────────────
sendBtn.addEventListener('click', () => {
  const text = inputEl.value.trim();
  if (!text) return;
  sendInput(text);
  inputEl.value = '';
  inputEl.style.height = 'auto';
});

inputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendBtn.click();
  }
});

inputEl.addEventListener('input', () => {
  inputEl.style.height = 'auto';
  inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
});

// ─── Device modal ─────────────────────────────────────────────────────────────
deviceBtn.addEventListener('click', () => {
  renderDeviceList();
  modal.classList.remove('hidden');
});

closeModal.addEventListener('click', () => modal.classList.add('hidden'));

modal.addEventListener('click', (e) => {
  if (e.target === modal) modal.classList.add('hidden');
});

function renderDeviceList() {
  deviceList.innerHTML = '';
  if (devices.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'No devices yet — add one below';
    li.style.color = 'var(--text-muted)';
    li.style.cursor = 'default';
    deviceList.appendChild(li);
    return;
  }
  devices.forEach((d, i) => {
    const li = document.createElement('li');
    li.textContent = `${d.name || d.ip}  (${d.ip})`;
    if (i === activeIndex) li.classList.add('active');
    li.addEventListener('click', () => {
      activeIndex = i;
      saveState();
      modal.classList.add('hidden');
      chat.innerHTML = '';
      currentClaudeBubble = null;
      connect();
    });
    deviceList.appendChild(li);
  });
}

addForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const ip = addIpEl.value.trim();
  if (!ip) return;

  let name = addNameEl.value.trim();
  let port = DEFAULT_PORT;

  if (!name) {
    try {
      const res = await fetch(
        `http://${ip}:${DEFAULT_PORT}/info?token=${encodeURIComponent(token)}`
      );
      if (res.ok) {
        const info = await res.json();
        name = info.name || ip;
        port = info.port || DEFAULT_PORT;
      }
    } catch { name = ip; }
  }

  devices.push({ ip, name, port });
  activeIndex = devices.length - 1;
  saveState();
  addIpEl.value = '';
  addNameEl.value = '';
  modal.classList.add('hidden');
  chat.innerHTML = '';
  currentClaudeBubble = null;
  connect();
});

// ─── Init ─────────────────────────────────────────────────────────────────────
token = loadToken();
devices = loadDevices();
activeIndex = parseInt(localStorage.getItem(ACTIVE_IDX_KEY) || '0', 10);

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

if (devices.length === 0) {
  setTimeout(() => {
    renderDeviceList();
    modal.classList.remove('hidden');
  }, 200);
} else {
  connect();
}
