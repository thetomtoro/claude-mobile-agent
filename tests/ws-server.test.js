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

  afterEach((done) => { wsServer.closeAllClients(); httpServer.closeAllConnections(); httpServer.close(done); });

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
