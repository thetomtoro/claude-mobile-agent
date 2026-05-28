const { WebSocketServer } = require('ws');
const { validateToken } = require('./auth');

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
      if (!validateToken(token, this.config.token)) {
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

  closeAllClients() {
    for (const client of this._clients) {
      client.terminate();
    }
    this._clients.clear();
  }

  get clientCount() {
    return this._clients.size;
  }
}

module.exports = { WsServer };
