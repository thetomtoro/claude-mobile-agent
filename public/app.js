// ─── Config ──────────────────────────────────────────────────────────────────
const STORAGE_KEY    = 'claude-mobile-devices';
const TOKEN_KEY      = 'claude-mobile-token';
const ACTIVE_IDX_KEY = 'claude-mobile-active';
const DEFAULT_PORT   = 3000;
const RECONNECT_DELAY = 2000;

// ─── State ────────────────────────────────────────────────────────────────────
let ws = null;
let reconnectTimer = null;
let term = null;
let fitAddon = null;
let devices = [];
let activeIndex = 0;
let token = '';

// ─── DOM ──────────────────────────────────────────────────────────────────────
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

// ─── Terminal ─────────────────────────────────────────────────────────────────
function initTerminal() {
  term = new Terminal({
    theme: {
      background: '#1a1a1a',
      foreground: '#f0f0f0',
      cursor: '#0a84ff',
      selectionBackground: 'rgba(10,132,255,0.3)',
    },
    fontFamily: "'Menlo', 'Monaco', 'Consolas', monospace",
    fontSize: 13,
    lineHeight: 1.4,
    scrollback: 2000,
    convertEol: true,
    cursorBlink: true,
  });

  fitAddon = new FitAddon.FitAddon();
  term.loadAddon(fitAddon);
  term.open(document.getElementById('terminal'));
  fitAddon.fit();

  window.addEventListener('resize', () => {
    fitAddon.fit();
    sendResize();
  });
}

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

// ─── Message handlers ─────────────────────────────────────────────────────────
function handleHistory(data) {
  if (data && term) term.write(data);
}

function handleOutput(data) {
  if (term) term.write(data);
}

function handleExit(code) {
  if (term) term.writeln(`\r\n\x1b[33m[Session ended (exit ${code})]\x1b[0m`);
  setStatus('disconnected');
}

// ─── WebSocket ────────────────────────────────────────────────────────────────
function sendResize() {
  if (ws && ws.readyState === WebSocket.OPEN && term) {
    ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
  }
}

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

  ws.onopen = () => {
    setStatus('connected');
    sendResize();
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if      (msg.type === 'history') handleHistory(msg.data);
      else if (msg.type === 'output')  handleOutput(msg.data);
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
  ws.send(JSON.stringify({ type: 'input', data: text + '\r' }));
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
      if (term) term.reset();
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
  if (term) term.reset();
  connect();
});

// ─── Init ─────────────────────────────────────────────────────────────────────
token = loadToken();
devices = loadDevices();
activeIndex = Math.min(
  parseInt(localStorage.getItem(ACTIVE_IDX_KEY) || '0', 10),
  Math.max(0, devices.length - 1)
);

initTerminal();

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
