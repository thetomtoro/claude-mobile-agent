# Claude Mobile Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Node.js agent that wraps a Claude Code CLI session and exposes it as a mobile-optimized PWA chat UI, accessible securely from anywhere via Tailscale.

**Architecture:** A local Node.js server (agent.js) spawns Claude Code via PTY and streams I/O over WebSocket. A mobile PWA (served by the agent) provides a chat-style UI. Push notifications via ntfy.sh alert the user when Claude is idle or exits. Tailscale handles remote networking.

**Tech Stack:** Node.js 18+, node-pty, ws, express, node-fetch v2, Jest, Tailscale (user-installed), ntfy.sh (external service)

---

## File Map

```
claude-mobile-agent/
├── package.json
├── config.example.json
├── config.json                   (gitignored — user creates this)
├── .gitignore
├── agent.js                      # entry: wires HTTP + WS + PTY
├── auth.js                       # token validation middleware
├── notify.js                     # ntfy.sh POST
├── pty-manager.js                # PTY lifecycle, buffer, idle detection
├── ws-server.js                  # WebSocket server + broadcast
├── tests/
│   ├── auth.test.js
│   ├── notify.test.js
│   ├── pty-manager.test.js
│   └── ws-server.test.js
└── public/
    ├── index.html                # PWA shell
    ├── style.css                 # dark theme, mobile-first
    ├── app.js                    # WS client, chat rendering, device picker
    ├── manifest.json             # PWA metadata
    └── sw.js                     # service worker (offline cache)
```

---

## Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `config.example.json`

- [ ] **Step 1: Verify working directory**

```bash
ls "C:\Users\Tommy Ong\claude-mobile-agent"
```

Expected: `docs/` directory only (created earlier).

- [ ] **Step 2: Write `package.json`**

Write `C:\Users\Tommy Ong\claude-mobile-agent\package.json`:

```json
{
  "name": "claude-mobile-agent",
  "version": "1.0.0",
  "description": "Stream a Claude Code session to your iPhone via PWA",
  "main": "agent.js",
  "scripts": {
    "start": "node agent.js",
    "test": "jest --runInBand"
  },
  "dependencies": {
    "express": "^4.18.2",
    "node-fetch": "^2.7.0",
    "node-pty": "^1.0.0",
    "ws": "^8.16.0"
  },
  "devDependencies": {
    "jest": "^29.7.0"
  }
}
```

- [ ] **Step 3: Write `.gitignore`**

Write `C:\Users\Tommy Ong\claude-mobile-agent\.gitignore`:

```
node_modules/
config.json
```

- [ ] **Step 4: Write `config.example.json`**

Write `C:\Users\Tommy Ong\claude-mobile-agent\config.example.json`:

```json
{
  "name": "Tommy's PC",
  "port": 3000,
  "token": "replace-with-a-random-string",
  "ntfyTopic": "tommy-claude-replace-with-random-suffix",
  "idleThresholdMs": 3000,
  "outputBufferLines": 500,
  "workingDirectory": "C:\\Users\\Tommy Ong\\your-project"
}
```

- [ ] **Step 5: Install dependencies**

```bash
cd "C:\Users\Tommy Ong\claude-mobile-agent" && npm install
```

Expected: `node_modules/` created, no errors.

- [ ] **Step 6: Init git and commit**

```bash
cd "C:\Users\Tommy Ong\claude-mobile-agent"
git init
git add package.json package-lock.json .gitignore config.example.json
git commit -m "feat: project scaffold"
```

---

## Task 2: Auth Module

**Files:**
- Create: `auth.js`
- Create: `tests/auth.test.js`

- [ ] **Step 1: Write the failing tests**

Write `C:\Users\Tommy Ong\claude-mobile-agent\tests\auth.test.js`:

```javascript
const { validateToken, authMiddleware } = require('../auth');

describe('validateToken', () => {
  test('returns true for matching token', () => {
    expect(validateToken('abc123', 'abc123')).toBe(true);
  });

  test('returns false for wrong token', () => {
    expect(validateToken('wrong', 'abc123')).toBe(false);
  });

  test('returns false for undefined', () => {
    expect(validateToken(undefined, 'abc123')).toBe(false);
  });

  test('returns false for empty string', () => {
    expect(validateToken('', 'abc123')).toBe(false);
  });
});

describe('authMiddleware', () => {
  const config = { token: 'secret123' };
  const middleware = authMiddleware(config);

  function makeReq(query = {}, headers = {}) {
    return { query, headers };
  }
  function makeRes() {
    const res = {};
    res.status = jest.fn(() => res);
    res.json = jest.fn(() => res);
    return res;
  }

  test('calls next() with valid query token', () => {
    const next = jest.fn();
    middleware(makeReq({ token: 'secret123' }), makeRes(), next);
    expect(next).toHaveBeenCalled();
  });

  test('calls next() with valid x-token header', () => {
    const next = jest.fn();
    middleware(makeReq({}, { 'x-token': 'secret123' }), makeRes(), next);
    expect(next).toHaveBeenCalled();
  });

  test('returns 401 with wrong token', () => {
    const res = makeRes();
    const next = jest.fn();
    middleware(makeReq({ token: 'wrong' }), res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 401 with no token', () => {
    const res = makeRes();
    const next = jest.fn();
    middleware(makeReq(), res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd "C:\Users\Tommy Ong\claude-mobile-agent" && npm test -- --testPathPattern=auth
```

Expected: `Cannot find module '../auth'`

- [ ] **Step 3: Write `auth.js`**

Write `C:\Users\Tommy Ong\claude-mobile-agent\auth.js`:

```javascript
function validateToken(provided, expected) {
  return typeof provided === 'string' && provided.length > 0 && provided === expected;
}

function authMiddleware(config) {
  return (req, res, next) => {
    const token = req.query.token || req.headers['x-token'];
    if (!validateToken(token, config.token)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
  };
}

module.exports = { validateToken, authMiddleware };
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd "C:\Users\Tommy Ong\claude-mobile-agent" && npm test -- --testPathPattern=auth
```

Expected: `Tests: 8 passed`

- [ ] **Step 5: Commit**

```bash
cd "C:\Users\Tommy Ong\claude-mobile-agent"
git add auth.js tests/auth.test.js
git commit -m "feat: auth token validation middleware"
```

---

## Task 3: Notify Module

**Files:**
- Create: `notify.js`
- Create: `tests/notify.test.js`

- [ ] **Step 1: Write the failing tests**

Write `C:\Users\Tommy Ong\claude-mobile-agent\tests\notify.test.js`:

```javascript
jest.mock('node-fetch');
const fetch = require('node-fetch');
const { sendNotification } = require('../notify');

describe('sendNotification', () => {
  beforeEach(() => {
    fetch.mockReset();
    fetch.mockResolvedValue({ ok: true });
  });

  test('POSTs to correct ntfy URL', async () => {
    await sendNotification('my-topic', 'Test Title', 'Test message');
    expect(fetch).toHaveBeenCalledWith(
      'https://ntfy.sh/my-topic',
      expect.objectContaining({ method: 'POST', body: 'Test message' })
    );
  });

  test('includes Title header', async () => {
    await sendNotification('topic', 'My Title', 'body');
    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ Title: 'My Title' }),
      })
    );
  });

  test('does not throw on network error', async () => {
    fetch.mockRejectedValue(new Error('Network error'));
    await expect(sendNotification('topic', 'title', 'msg')).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd "C:\Users\Tommy Ong\claude-mobile-agent" && npm test -- --testPathPattern=notify
```

Expected: `Cannot find module '../notify'`

- [ ] **Step 3: Write `notify.js`**

Write `C:\Users\Tommy Ong\claude-mobile-agent\notify.js`:

```javascript
const fetch = require('node-fetch');

async function sendNotification(topic, title, message) {
  try {
    await fetch(`https://ntfy.sh/${topic}`, {
      method: 'POST',
      headers: { Title: title, 'Content-Type': 'text/plain' },
      body: message,
    });
  } catch (err) {
    console.error('[notify] failed:', err.message);
  }
}

module.exports = { sendNotification };
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd "C:\Users\Tommy Ong\claude-mobile-agent" && npm test -- --testPathPattern=notify
```

Expected: `Tests: 3 passed`

- [ ] **Step 5: Commit**

```bash
cd "C:\Users\Tommy Ong\claude-mobile-agent"
git add notify.js tests/notify.test.js
git commit -m "feat: ntfy.sh push notification module"
```

---

## Task 4: PTY Manager

**Files:**
- Create: `pty-manager.js`
- Create: `tests/pty-manager.test.js`

- [ ] **Step 1: Write the failing tests**

Write `C:\Users\Tommy Ong\claude-mobile-agent\tests\pty-manager.test.js`:

```javascript
const { PtyManager } = require('../pty-manager');

const BASE_CONFIG = {
  outputBufferLines: 10,
  idleThresholdMs: 80,
  workingDirectory: process.cwd(),
};

describe('PtyManager - buffer', () => {
  test('appends data and returns it via getBuffer()', () => {
    const pm = new PtyManager(BASE_CONFIG);
    pm._appendToBuffer('hello\n');
    pm._appendToBuffer('world\n');
    expect(pm.getBuffer()).toBe('hello\nworld\n');
  });

  test('trims buffer to outputBufferLines', () => {
    const pm = new PtyManager({ ...BASE_CONFIG, outputBufferLines: 3 });
    for (let i = 0; i < 10; i++) pm._appendToBuffer(`line${i}\n`);
    const lines = pm.getBuffer().split('\n').filter(Boolean);
    expect(lines.length).toBeLessThanOrEqual(3);
  });

  test('getBuffer() returns empty string before any output', () => {
    const pm = new PtyManager(BASE_CONFIG);
    expect(pm.getBuffer()).toBe('');
  });
});

describe('PtyManager - idle timer', () => {
  test('fires onIdle after idleThresholdMs', (done) => {
    const pm = new PtyManager({ ...BASE_CONFIG, idleThresholdMs: 50 });
    pm.onIdle = () => { done(); };
    pm._resetIdleTimer();
  });

  test('does not fire onIdle if timer is reset before threshold', (done) => {
    const pm = new PtyManager({ ...BASE_CONFIG, idleThresholdMs: 80 });
    let firedCount = 0;
    pm.onIdle = () => { firedCount++; };

    pm._resetIdleTimer();
    setTimeout(() => pm._resetIdleTimer(), 40); // reset before first fires

    setTimeout(() => {
      expect(firedCount).toBe(0); // should not have fired yet at 60ms
    }, 60);

    setTimeout(() => {
      expect(firedCount).toBe(1); // should fire once after second reset completes
      done();
    }, 200);
  });

  test('_clearIdleTimer prevents onIdle from firing', (done) => {
    const pm = new PtyManager({ ...BASE_CONFIG, idleThresholdMs: 50 });
    let fired = false;
    pm.onIdle = () => { fired = true; };
    pm._resetIdleTimer();
    pm._clearIdleTimer();
    setTimeout(() => {
      expect(fired).toBe(false);
      done();
    }, 100);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd "C:\Users\Tommy Ong\claude-mobile-agent" && npm test -- --testPathPattern=pty-manager
```

Expected: `Cannot find module '../pty-manager'`

- [ ] **Step 3: Write `pty-manager.js`**

Write `C:\Users\Tommy Ong\claude-mobile-agent\pty-manager.js`:

```javascript
const pty = require('node-pty');

class PtyManager {
  constructor(config) {
    this.config = config;
    this._pty = null;
    this._buffer = [];
    this._idleTimer = null;
    this.onOutput = null;  // (data: string) => void
    this.onIdle = null;    // () => void
    this.onExit = null;    // (code: number) => void
  }

  start() {
    const command = 'claude';
    this._pty = pty.spawn(command, [], {
      name: 'xterm-color',
      cols: 120,
      rows: 30,
      cwd: this.config.workingDirectory || process.cwd(),
      env: process.env,
    });

    this._pty.onData((data) => {
      this._appendToBuffer(data);
      this._resetIdleTimer();
      if (this.onOutput) this.onOutput(data);
    });

    this._pty.onExit(({ exitCode }) => {
      this._clearIdleTimer();
      if (this.onExit) this.onExit(exitCode);
    });
  }

  write(input) {
    if (this._pty) this._pty.write(input);
  }

  getBuffer() {
    return this._buffer.join('');
  }

  stop() {
    this._clearIdleTimer();
    if (this._pty) {
      this._pty.kill();
      this._pty = null;
    }
  }

  _appendToBuffer(data) {
    this._buffer.push(data);
    const joined = this._buffer.join('');
    const lines = joined.split('\n');
    const limit = this.config.outputBufferLines || 500;
    if (lines.length > limit) {
      this._buffer = [lines.slice(-limit).join('\n')];
    }
  }

  _resetIdleTimer() {
    this._clearIdleTimer();
    this._idleTimer = setTimeout(() => {
      if (this.onIdle) this.onIdle();
    }, this.config.idleThresholdMs || 3000);
  }

  _clearIdleTimer() {
    if (this._idleTimer) {
      clearTimeout(this._idleTimer);
      this._idleTimer = null;
    }
  }
}

module.exports = { PtyManager };
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd "C:\Users\Tommy Ong\claude-mobile-agent" && npm test -- --testPathPattern=pty-manager
```

Expected: `Tests: 6 passed`

- [ ] **Step 5: Commit**

```bash
cd "C:\Users\Tommy Ong\claude-mobile-agent"
git add pty-manager.js tests/pty-manager.test.js
git commit -m "feat: PTY manager with buffer and idle detection"
```

---

## Task 5: WebSocket Server

**Files:**
- Create: `ws-server.js`
- Create: `tests/ws-server.test.js`

- [ ] **Step 1: Write the failing tests**

Write `C:\Users\Tommy Ong\claude-mobile-agent\tests\ws-server.test.js`:

```javascript
const http = require('http');
const { WebSocket } = require('ws');
const { WsServer } = require('../ws-server');

const TEST_CONFIG = { token: 'test-token-123' };

function makeServer() {
  const httpServer = http.createServer();
  const wsServer = new WsServer(TEST_CONFIG);
  wsServer.attach(httpServer);
  return new Promise((resolve) => {
    httpServer.listen(0, () => {
      resolve({ httpServer, wsServer, port: httpServer.address().port });
    });
  });
}

function connectClient(port, token) {
  const tokenPart = token ? `?token=${token}` : '';
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}/${tokenPart}`);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

describe('WsServer', () => {
  let httpServer, wsServer, port;

  beforeEach(async () => {
    ({ httpServer, wsServer, port } = await makeServer());
  });

  afterEach((done) => httpServer.close(done));

  test('rejects connections without token', (done) => {
    const ws = new WebSocket(`ws://localhost:${port}/`);
    ws.on('close', (code) => {
      expect(code).toBe(4001);
      done();
    });
  });

  test('rejects connections with wrong token', (done) => {
    const ws = new WebSocket(`ws://localhost:${port}/?token=wrong`);
    ws.on('close', (code) => {
      expect(code).toBe(4001);
      done();
    });
  });

  test('accepts connections with correct token', async () => {
    const ws = await connectClient(port, TEST_CONFIG.token);
    expect(ws.readyState).toBe(WebSocket.OPEN);
    expect(wsServer.clientCount).toBe(1);
    ws.close();
  });

  test('clientCount decrements on disconnect', async () => {
    const ws = await connectClient(port, TEST_CONFIG.token);
    expect(wsServer.clientCount).toBe(1);
    ws.close();
    await new Promise((r) => setTimeout(r, 50));
    expect(wsServer.clientCount).toBe(0);
  });

  test('broadcasts to all connected clients', async () => {
    const ws1 = await connectClient(port, TEST_CONFIG.token);
    const ws2 = await connectClient(port, TEST_CONFIG.token);

    const received = [];
    ws1.on('message', (d) => received.push(d.toString()));
    ws2.on('message', (d) => received.push(d.toString()));

    wsServer.broadcast('hello');
    await new Promise((r) => setTimeout(r, 50));

    expect(received.sort()).toEqual(['hello', 'hello']);
    ws1.close();
    ws2.close();
  });

  test('fires onMessage when client sends data', async () => {
    const ws = await connectClient(port, TEST_CONFIG.token);
    let received = null;
    wsServer.onMessage = (data) => { received = data; };

    ws.send('test message');
    await new Promise((r) => setTimeout(r, 50));

    expect(received).toBe('test message');
    ws.close();
  });

  test('fires onConnection with the connected socket', async () => {
    let connectedWs = null;
    wsServer.onConnection = (ws) => { connectedWs = ws; };

    await connectClient(port, TEST_CONFIG.token);
    await new Promise((r) => setTimeout(r, 50));

    expect(connectedWs).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd "C:\Users\Tommy Ong\claude-mobile-agent" && npm test -- --testPathPattern=ws-server
```

Expected: `Cannot find module '../ws-server'`

- [ ] **Step 3: Write `ws-server.js`**

Write `C:\Users\Tommy Ong\claude-mobile-agent\ws-server.js`:

```javascript
const { WebSocketServer } = require('ws');

class WsServer {
  constructor(config) {
    this.config = config;
    this._clients = new Set();
    this._wss = null;
    this.onMessage = null;    // (data: string) => void
    this.onConnection = null; // (ws: WebSocket) => void
  }

  attach(httpServer) {
    this._wss = new WebSocketServer({ server: httpServer });
    this._wss.on('connection', (ws, req) => {
      const url = new URL(req.url, 'http://localhost');
      const token = url.searchParams.get('token');
      if (token !== this.config.token) {
        ws.close(4001, 'Unauthorized');
        return;
      }

      this._clients.add(ws);
      if (this.onConnection) this.onConnection(ws);

      ws.on('message', (data) => {
        if (this.onMessage) this.onMessage(data.toString());
      });

      ws.on('close', () => this._clients.delete(ws));
    });
  }

  broadcast(data) {
    for (const client of this._clients) {
      if (client.readyState === 1) client.send(data);
    }
  }

  get clientCount() {
    return this._clients.size;
  }
}

module.exports = { WsServer };
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd "C:\Users\Tommy Ong\claude-mobile-agent" && npm test -- --testPathPattern=ws-server
```

Expected: `Tests: 7 passed`

- [ ] **Step 5: Run the full test suite to check for regressions**

```bash
cd "C:\Users\Tommy Ong\claude-mobile-agent" && npm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
cd "C:\Users\Tommy Ong\claude-mobile-agent"
git add ws-server.js tests/ws-server.test.js
git commit -m "feat: WebSocket server with token auth and broadcast"
```

---

## Task 6: Agent Entry Point

**Files:**
- Create: `agent.js`

No unit tests here — this file is pure wiring. The integration test is: start it and connect.

- [ ] **Step 1: Write `agent.js`**

Write `C:\Users\Tommy Ong\claude-mobile-agent\agent.js`:

```javascript
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { PtyManager } = require('./pty-manager');
const { WsServer } = require('./ws-server');
const { sendNotification } = require('./notify');
const { authMiddleware } = require('./auth');

const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));

const app = express();
const server = http.createServer(app);

app.use(authMiddleware(config));
app.get('/info', (_req, res) =>
  res.json({ name: config.name, platform: process.platform, port: config.port })
);
app.use(express.static(path.join(__dirname, 'public')));

const wsServer = new WsServer(config);
wsServer.attach(server);

const ptyManager = new PtyManager(config);

ptyManager.onOutput = (data) => {
  wsServer.broadcast(JSON.stringify({ type: 'output', data }));
};

ptyManager.onIdle = () => {
  sendNotification(config.ntfyTopic, config.name, 'Claude is waiting for input');
  wsServer.broadcast(JSON.stringify({ type: 'idle' }));
};

ptyManager.onExit = (code) => {
  const msg = code === 0
    ? `Session finished on ${config.name}`
    : `Claude crashed on ${config.name} (exit ${code})`;
  sendNotification(config.ntfyTopic, config.name, msg);
  wsServer.broadcast(JSON.stringify({ type: 'exit', code }));
};

wsServer.onConnection = (ws) => {
  const history = ptyManager.getBuffer();
  if (history) ws.send(JSON.stringify({ type: 'history', data: history }));
};

wsServer.onMessage = (raw) => {
  try {
    const msg = JSON.parse(raw);
    if (msg.type === 'input') ptyManager.write(msg.data);
  } catch { /* ignore malformed */ }
};

ptyManager.start();

server.listen(config.port, '0.0.0.0', () => {
  console.log(`\nClaude Mobile Agent started`);
  console.log(`Local:  http://localhost:${config.port}?token=${config.token}`);
  console.log(`Phone:  http://<tailscale-ip>:${config.port}?token=${config.token}\n`);
});
```

- [ ] **Step 2: Create `config.json` for local testing**

Copy `config.example.json` to `config.json` and fill in values:

```json
{
  "name": "Tommy's PC",
  "port": 3000,
  "token": "dev-token-local",
  "ntfyTopic": "tommy-claude-dev",
  "idleThresholdMs": 3000,
  "outputBufferLines": 500,
  "workingDirectory": "C:\\Users\\Tommy Ong"
}
```

- [ ] **Step 3: Smoke test — start the agent**

```bash
cd "C:\Users\Tommy Ong\claude-mobile-agent" && node agent.js
```

Expected output:
```
Claude Mobile Agent started
Local:  http://localhost:3000?token=dev-token-local
Phone:  http://<tailscale-ip>:3000?token=dev-token-local
```

Claude Code should start in the terminal (you'll see the Claude prompt). Press Ctrl+C to stop.

- [ ] **Step 4: Commit**

```bash
cd "C:\Users\Tommy Ong\claude-mobile-agent"
git add agent.js
git commit -m "feat: agent entry point wiring PTY, WS, HTTP, and notifications"
```

---

## Task 7: PWA Shell — HTML + CSS

**Files:**
- Create: `public/index.html`
- Create: `public/style.css`

- [ ] **Step 1: Create `public/` directory**

```bash
mkdir "C:\Users\Tommy Ong\claude-mobile-agent\public"
```

- [ ] **Step 2: Write `public/index.html`**

Write `C:\Users\Tommy Ong\claude-mobile-agent\public\index.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <title>Claude Mobile</title>
  <link rel="manifest" href="/manifest.json">
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  <div id="app">
    <header id="header">
      <button id="device-btn" class="device-name">Connecting...</button>
      <span id="status-dot" class="dot dot--connecting"></span>
    </header>
    <main id="chat"></main>
    <footer id="footer">
      <textarea id="input" placeholder="Type a message..." rows="1"></textarea>
      <button id="send-btn">&#9654;</button>
    </footer>
  </div>

  <div id="device-modal" class="modal hidden">
    <div class="modal-inner">
      <h2>Devices</h2>
      <ul id="device-list"></ul>
      <form id="add-device-form">
        <input id="add-device-ip" placeholder="Tailscale IP (100.x.x.x)" autocomplete="off">
        <input id="add-device-name" placeholder="Name (optional)" autocomplete="off">
        <button type="submit">Add Device</button>
      </form>
      <button id="close-modal">Cancel</button>
    </div>
  </div>

  <script src="/app.js"></script>
</body>
</html>
```

- [ ] **Step 3: Write `public/style.css`**

Write `C:\Users\Tommy Ong\claude-mobile-agent\public\style.css`:

```css
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg: #1a1a1a;
  --surface: #2a2a2a;
  --claude-bg: #2d2d2d;
  --user-bg: #0a84ff;
  --text: #f0f0f0;
  --text-muted: #888;
  --border: #3a3a3a;
  --green: #34c759;
  --yellow: #ffd60a;
  --red: #ff453a;
  --radius: 18px;
}

html, body {
  height: 100%;
  background: var(--bg);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

#app {
  display: flex;
  flex-direction: column;
  height: 100%;
  height: 100dvh;
}

/* ── Header ── */
#header {
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  padding-top: calc(12px + env(safe-area-inset-top));
  flex-shrink: 0;
}

.device-name {
  background: none;
  border: none;
  color: var(--text);
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
}
.device-name:active { background: var(--border); }

.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}
.dot--connected    { background: var(--green); }
.dot--connecting   { background: var(--yellow); animation: pulse 1s infinite; }
.dot--disconnected { background: var(--red); }

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

/* ── Chat ── */
#chat {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  -webkit-overflow-scrolling: touch;
}

.bubble-wrapper {
  display: flex;
  flex-direction: column;
  max-width: 85%;
}
.bubble-wrapper--claude { align-self: flex-start; }
.bubble-wrapper--user   { align-self: flex-end; }
.bubble-wrapper--system { align-self: center; max-width: 100%; }

.bubble-label {
  font-size: 11px;
  color: var(--text-muted);
  margin-bottom: 4px;
  padding-left: 4px;
}

.bubble {
  padding: 10px 14px;
  border-radius: var(--radius);
  font-size: 15px;
  line-height: 1.5;
  word-break: break-word;
}
.bubble--claude {
  background: var(--claude-bg);
  border-bottom-left-radius: 4px;
}
.bubble--user {
  background: var(--user-bg);
  border-bottom-right-radius: 4px;
  color: #fff;
}
.bubble--system {
  background: var(--surface);
  color: var(--text-muted);
  font-size: 13px;
  border-radius: 8px;
  text-align: center;
  padding: 6px 12px;
}

.bubble pre {
  background: #111;
  border-radius: 8px;
  padding: 10px 12px;
  overflow-x: auto;
  font-size: 12px;
  font-family: 'Menlo', 'Monaco', 'Consolas', monospace;
  margin-top: 8px;
  white-space: pre;
  line-height: 1.4;
}

.bubble span {
  white-space: pre-wrap;
}

/* ── Footer ── */
#footer {
  background: var(--surface);
  border-top: 1px solid var(--border);
  padding: 10px 16px;
  padding-bottom: calc(10px + env(safe-area-inset-bottom));
  display: flex;
  align-items: flex-end;
  gap: 10px;
  flex-shrink: 0;
}

#input {
  flex: 1;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 20px;
  color: var(--text);
  font-size: 16px;
  padding: 10px 16px;
  resize: none;
  outline: none;
  max-height: 120px;
  line-height: 1.4;
  font-family: inherit;
}
#input:focus { border-color: var(--user-bg); }

#send-btn {
  background: var(--user-bg);
  border: none;
  border-radius: 50%;
  width: 42px;
  height: 42px;
  color: #fff;
  font-size: 16px;
  cursor: pointer;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
#send-btn:active { opacity: 0.8; }

/* ── Modal ── */
.modal {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 24px;
}
.modal.hidden { display: none; }

.modal-inner {
  background: var(--surface);
  border-radius: 16px;
  padding: 24px;
  width: 100%;
  max-width: 360px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.modal-inner h2 { font-size: 18px; font-weight: 700; }

#device-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 200px;
  overflow-y: auto;
}
#device-list li {
  padding: 12px;
  background: var(--bg);
  border-radius: 10px;
  cursor: pointer;
  font-size: 15px;
  border: 2px solid transparent;
}
#device-list li.active { border-color: var(--user-bg); }
#device-list li:empty { display: none; }

#add-device-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  border-top: 1px solid var(--border);
  padding-top: 14px;
}
#add-device-form input {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 10px;
  color: var(--text);
  font-size: 15px;
  padding: 10px 14px;
  outline: none;
  font-family: inherit;
}
#add-device-form input:focus { border-color: var(--user-bg); }
#add-device-form button {
  padding: 12px;
  border-radius: 10px;
  border: none;
  background: var(--user-bg);
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}
#close-modal {
  padding: 12px;
  border-radius: 10px;
  border: none;
  background: var(--bg);
  color: var(--text-muted);
  font-size: 15px;
  cursor: pointer;
  font-family: inherit;
}
```

- [ ] **Step 4: Verify the agent serves the HTML**

Start the agent (`node agent.js`) then open `http://localhost:3000?token=dev-token-local` in a browser.

Expected: page loads with dark header, empty chat area, and footer input. Console shows no JS errors (app.js doesn't exist yet, that's fine — it will 404).

- [ ] **Step 5: Commit**

```bash
cd "C:\Users\Tommy Ong\claude-mobile-agent"
git add public/index.html public/style.css
git commit -m "feat: PWA HTML shell and mobile-first CSS"
```

---

## Task 8: PWA JavaScript

**Files:**
- Create: `public/app.js`

- [ ] **Step 1: Write `public/app.js`**

Write `C:\Users\Tommy Ong\claude-mobile-agent\public\app.js`:

```javascript
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

function appendToBubble(bubble, rawText) {
  const text = rawText.replace(/\x1b\[[0-9;]*[mGKHF]/g, '');
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
  pre.textContent = data.replace(/\x1b\[[0-9;]*[mGKHF]/g, '');
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
```

- [ ] **Step 2: Smoke test the full flow**

1. Start the agent: `node agent.js` in the project folder
2. Open `http://localhost:3000?token=dev-token-local` in a browser
3. Expected: token is saved to localStorage, modal opens asking to add a device
4. Add `127.0.0.1` as the device IP, click "Add Device"
5. Expected: modal closes, chat connects, Claude output appears in bubbles
6. Type a message in the input and send it
7. Expected: message appears as a blue right-aligned bubble, Claude responds on the left

- [ ] **Step 3: Commit**

```bash
cd "C:\Users\Tommy Ong\claude-mobile-agent"
git add public/app.js
git commit -m "feat: PWA chat UI with WebSocket client and device picker"
```

---

## Task 9: PWA Manifest and Service Worker

**Files:**
- Create: `public/manifest.json`
- Create: `public/sw.js`

- [ ] **Step 1: Write `public/manifest.json`**

Write `C:\Users\Tommy Ong\claude-mobile-agent\public\manifest.json`:

```json
{
  "name": "Claude Mobile",
  "short_name": "Claude",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#1a1a1a",
  "theme_color": "#1a1a1a",
  "description": "Chat with Claude Code from your iPhone"
}
```

- [ ] **Step 2: Write `public/sw.js`**

Write `C:\Users\Tommy Ong\claude-mobile-agent\public\sw.js`:

```javascript
const CACHE = 'claude-mobile-v1';
const ASSETS = ['/', '/style.css', '/app.js', '/manifest.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (!ASSETS.includes(url.pathname)) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const clone = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
```

- [ ] **Step 3: Verify PWA installability on iPhone**

1. On your iPhone, open Safari and navigate to `http://<your-pc-tailscale-ip>:3000?token=<your-token>`
   (Tailscale must be installed on both PC and iPhone first — see setup notes below)
2. Tap the Share button → "Add to Home Screen"
3. Confirm install
4. Launch from home screen
5. Expected: fullscreen dark UI, no Safari address bar, device picker modal opens

- [ ] **Step 4: Commit**

```bash
cd "C:\Users\Tommy Ong\claude-mobile-agent"
git add public/manifest.json public/sw.js
git commit -m "feat: PWA manifest and service worker for offline and home screen install"
```

---

## Task 10: GitHub Private Repo

- [ ] **Step 1: Create private repo and push**

```bash
cd "C:\Users\Tommy Ong\claude-mobile-agent"
gh repo create claude-mobile-agent --private --source=. --remote=origin --push
```

Expected: repo created at `github.com/TommyOng/claude-mobile-agent` (or your GitHub username), all commits pushed.

- [ ] **Step 2: Verify**

```bash
gh repo view claude-mobile-agent --web
```

Expected: opens GitHub in browser showing the private repo.

---

## Post-Build: Tailscale Setup (Manual — One Time)

These steps are done by Tommy outside the codebase:

1. **Windows PC:** Download Tailscale from tailscale.com, install, sign in with your account
2. **Mac:** Same — install from tailscale.com or Mac App Store
3. **iPhone:** Install Tailscale from App Store, sign in with same account
4. **ntfy iPhone:** Install ntfy from App Store, subscribe to the topic from your `config.json`
5. **Find your PC's Tailscale IP:** Open Tailscale on your PC — it shows your `100.x.x.x` address
6. **First launch from iPhone:** Open `http://100.x.x.x:3000?token=yourtoken` in Safari, add device, install to home screen

---

## Self-Review Notes

- Spec requires `/info` to return `{ name, platform }` — implemented, also returns `port` (additive, not breaking)
- Spec requires idle notification for "Claude waiting" and "session finished" and "Claude crashed" — all three covered in `agent.js`
- Spec requires buffer replay to new clients — implemented via `wsServer.onConnection`
- Spec requires auto-reconnect on drop — implemented in `connect()` via `ws.onclose`
- Spec requires device switcher stored in localStorage — implemented in `app.js`
- Spec requires token on WebSocket — implemented in `ws-server.js` (closes with code 4001)
- Spec requires token on HTTP — implemented via `authMiddleware` in `agent.js`
