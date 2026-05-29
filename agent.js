const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { ClaudeRunner } = require('./claude-runner');
const { WsServer } = require('./ws-server');
const { sendNotification } = require('./notify');
const { authMiddleware } = require('./auth');

const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));

const app = express();
const server = http.createServer(app);

app.use(express.static(path.join(__dirname, 'public')));
app.use(authMiddleware(config));
app.get('/info', (_req, res) =>
  res.json({ name: config.name, platform: process.platform, port: config.port })
);

const wsServer = new WsServer(config);
wsServer.attach(server);

const claude = new ClaudeRunner(config);

wsServer.onMessage = (raw) => {
  try {
    const msg = JSON.parse(raw);
    if (msg.type === 'input') {
      const prompt = String(msg.data || '').trim();
      if (!prompt) return;

      wsServer.broadcast(JSON.stringify({ type: 'start' }));

      claude.send(prompt, {
        onChunk: (chunk) => {
          wsServer.broadcast(JSON.stringify({ type: 'chunk', data: chunk }));
        },
        onDone: () => {
          wsServer.broadcast(JSON.stringify({ type: 'done' }));
          sendNotification(config.ntfyTopic, config.name, 'Claude is ready');
        },
        onError: (err) => {
          wsServer.broadcast(JSON.stringify({ type: 'error', message: err.message }));
        },
      });
    } else if (msg.type === 'cancel') {
      claude.cancel();
      wsServer.broadcast(JSON.stringify({ type: 'cancelled' }));
    } else if (msg.type === 'new-session') {
      claude.cancel();
      claude.resetSession();
      wsServer.broadcast(JSON.stringify({ type: 'session-reset' }));
    }
  } catch { /* ignore malformed */ }
};

server.listen(config.port, '0.0.0.0', () => {
  console.log(`\nClaude Mobile Agent started`);
  console.log(`Local:  http://localhost:${config.port}?token=${config.token}`);
  console.log(`Phone:  http://<tailscale-ip>:${config.port}?token=${config.token}\n`);
});
