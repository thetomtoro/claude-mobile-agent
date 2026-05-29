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

// Serve PWA files unauthenticated (WebSocket and /info still require token)
app.use(express.static(path.join(__dirname, 'public')));

// Auth required for all other routes
app.use(authMiddleware(config));
app.get('/info', (_req, res) =>
  res.json({ name: config.name, platform: process.platform, port: config.port })
);

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
    else if (msg.type === 'resize') ptyManager.resize(msg.cols, msg.rows);
  } catch { /* ignore malformed */ }
};

ptyManager.start();

server.listen(config.port, '0.0.0.0', () => {
  console.log(`\nClaude Mobile Agent started`);
  console.log(`Local:  http://localhost:${config.port}?token=${config.token}`);
  console.log(`Phone:  http://<tailscale-ip>:${config.port}?token=${config.token}\n`);
});
