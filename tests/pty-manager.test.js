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
