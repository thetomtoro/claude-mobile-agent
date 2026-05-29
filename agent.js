const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { ClaudeRunner } = require('./claude-runner');
const { WsServer } = require('./ws-server');
const { sendNotification } = require('./notify');
const { authMiddleware } = require('./auth');
const { listSessions, loadSessionMessages } = require('./session-store');
const { buildSyncMessages } = require('./sync');

const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));

const app = express();
const server = http.createServer(app);

app.use(express.static(path.join(__dirname, 'public')));
app.use(authMiddleware(config));
app.get('/info', (_req, res) =>
  res.json({ name: config.name, platform: process.platform, port: config.port })
);
app.get('/sessions', (_req, res) => res.json(listSessions()));

const wsServer = new WsServer(config);
wsServer.attach(server);

const claude = new ClaudeRunner(config);

// Track the in-flight response so a client that reconnects (e.g. iOS froze the
// WebSocket while backgrounded) can be brought back in sync instead of being
// stuck on a partial/empty screen until a manual refresh.
let streaming = false;
let liveBuffer = '';

// Replay current conversation state to each newly connected client.
wsServer.onConnection = (ws) => {
  const messages = buildSyncMessages({
    sessionId: claude.sessionId,
    streaming,
    liveBuffer,
    loadSessionMessages,
  });
  for (const msg of messages) {
    if (ws.readyState === 1) ws.send(JSON.stringify(msg));
  }
};

wsServer.onMessage = (raw) => {
  try {
    const msg = JSON.parse(raw);
    if (msg.type === 'input') {
      const prompt = String(msg.data || '').trim();
      if (!prompt) return;

      streaming = true;
      liveBuffer = '';
      wsServer.broadcast(JSON.stringify({ type: 'start' }));

      claude.send(prompt, {
        onChunk: (chunk) => {
          liveBuffer += chunk;
          wsServer.broadcast(JSON.stringify({ type: 'chunk', data: chunk }));
        },
        onDone: () => {
          streaming = false;
          wsServer.broadcast(JSON.stringify({ type: 'done' }));
          sendNotification(config.ntfyTopic, config.name, 'Claude is ready');
        },
        onError: (err) => {
          streaming = false;
          wsServer.broadcast(JSON.stringify({ type: 'error', message: err.message }));
        },
      });
    } else if (msg.type === 'cancel') {
      streaming = false;
      claude.cancel();
      wsServer.broadcast(JSON.stringify({ type: 'cancelled' }));
    } else if (msg.type === 'new-session') {
      streaming = false;
      liveBuffer = '';
      claude.cancel();
      claude.resetSession();
      wsServer.broadcast(JSON.stringify({ type: 'session-reset' }));
    } else if (msg.type === 'switch-session') {
      streaming = false;
      liveBuffer = '';
      claude.cancel();
      const loaded = loadSessionMessages(msg.id);
      if (!loaded) {
        wsServer.broadcast(JSON.stringify({ type: 'error', message: 'Session not found' }));
        return;
      }
      claude.setSession(msg.id);
      wsServer.broadcast(JSON.stringify({
        type: 'session-loaded',
        project: loaded.project,
        messages: loaded.messages,
      }));
    }
  } catch { /* ignore malformed */ }
};

server.listen(config.port, '0.0.0.0', () => {
  console.log(`\nClaude Mobile Agent started`);
  console.log(`Local:  http://localhost:${config.port}?token=${config.token}`);
  console.log(`Phone:  http://<tailscale-ip>:${config.port}?token=${config.token}\n`);
});
