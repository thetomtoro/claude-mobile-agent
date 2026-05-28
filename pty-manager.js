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
