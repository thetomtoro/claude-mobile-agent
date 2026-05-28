const { PtyManager } = require('../pty-manager');

const BASE_CONFIG = {
  outputBufferLines: 10,
  idleThresholdMs: 1000,
  workingDirectory: process.cwd(),
};

describe('PtyManager - buffer', () => {
  test('appends data and returns it via getBuffer()', () => {
    const pm = new PtyManager(BASE_CONFIG);
    pm._appendToBuffer('hello\n');
    pm._appendToBuffer('world\n');
    expect(pm.getBuffer()).toContain('hello');
    expect(pm.getBuffer()).toContain('world');
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
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('fires onIdle after idleThresholdMs', () => {
    const pm = new PtyManager(BASE_CONFIG);
    const onIdle = jest.fn();
    pm.onIdle = onIdle;
    pm._resetIdleTimer();
    jest.advanceTimersByTime(BASE_CONFIG.idleThresholdMs);
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  test('does not fire onIdle if timer is reset before threshold', () => {
    const pm = new PtyManager(BASE_CONFIG);
    const onIdle = jest.fn();
    pm.onIdle = onIdle;
    pm._resetIdleTimer();
    jest.advanceTimersByTime(500); // halfway
    pm._resetIdleTimer();         // reset
    jest.advanceTimersByTime(500); // still not enough since last reset
    expect(onIdle).not.toHaveBeenCalled();
    jest.advanceTimersByTime(500); // now over threshold from last reset
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  test('_clearIdleTimer prevents onIdle from firing', () => {
    const pm = new PtyManager(BASE_CONFIG);
    const onIdle = jest.fn();
    pm.onIdle = onIdle;
    pm._resetIdleTimer();
    pm._clearIdleTimer();
    jest.advanceTimersByTime(BASE_CONFIG.idleThresholdMs * 2);
    expect(onIdle).not.toHaveBeenCalled();
  });
});
