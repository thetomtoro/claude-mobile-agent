const pty = require('node-pty');

class PtyManager {
  constructor(config) {
    this.config = {
      outputBufferLines: config.outputBufferLines || 500,
      idleThresholdMs: config.idleThresholdMs || 3000,
      workingDirectory: config.workingDirectory || process.cwd(),
    };
    this._pty = null;
    this._lines = [];   // stores individual lines, capped at outputBufferLines
    this._idleTimer = null;
    this.onOutput = null;
    this.onIdle = null;
    this.onExit = null;
  }

  start() {
    this._pty = pty.spawn('claude', [], {
      name: 'xterm-color',
      cols: 120,
      rows: 30,
      cwd: this.config.workingDirectory,
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
    if (!this._pty) {
      console.warn('[pty-manager] write() called but PTY is not running');
      return;
    }
    this._pty.write(input);
  }

  getBuffer() {
    return this._lines.join('\n');
  }

  stop() {
    this._clearIdleTimer();
    if (this._pty) {
      this._pty.kill();
      this._pty = null;
    }
  }

  _appendToBuffer(data) {
    const incoming = data.split('\n');
    // Append to the last line if it didn't end with a newline
    if (this._lines.length > 0 && !this._lines[this._lines.length - 1].endsWith('\n')) {
      this._lines[this._lines.length - 1] += incoming[0];
      this._lines.push(...incoming.slice(1));
    } else {
      this._lines.push(...incoming);
    }
    if (this._lines.length > this.config.outputBufferLines) {
      this._lines = this._lines.slice(-this.config.outputBufferLines);
    }
  }

  _resetIdleTimer() {
    this._clearIdleTimer();
    this._idleTimer = setTimeout(() => {
      if (this.onIdle) this.onIdle();
    }, this.config.idleThresholdMs);
  }

  _clearIdleTimer() {
    if (this._idleTimer) {
      clearTimeout(this._idleTimer);
      this._idleTimer = null;
    }
  }
}

module.exports = { PtyManager };
