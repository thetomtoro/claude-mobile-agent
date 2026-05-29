const { spawn } = require('child_process');

class ClaudeRunner {
  constructor(config) {
    this.config = {
      workingDirectory: config.workingDirectory || process.cwd(),
    };
    this._hasSession = false;
    this._current = null;
  }

  isBusy() {
    return this._current !== null;
  }

  cancel() {
    if (this._current) {
      this._current.kill();
      this._current = null;
    }
  }

  send(prompt, { onChunk, onDone, onError } = {}) {
    if (this._current) {
      if (onError) onError(new Error('Claude is still responding to a previous message'));
      return;
    }

    const isWin = process.platform === 'win32';
    const claudeArgs = ['-p', prompt];
    if (this._hasSession) claudeArgs.push('--continue');

    const command = isWin ? 'cmd.exe' : 'claude';
    const args = isWin ? ['/c', 'claude', ...claudeArgs] : claudeArgs;

    const child = spawn(command, args, {
      cwd: this.config.workingDirectory,
      env: process.env,
    });
    this._current = child;

    child.stdout.on('data', (data) => {
      if (onChunk) onChunk(data.toString());
    });

    child.stderr.on('data', (data) => {
      console.error('[claude stderr]', data.toString());
    });

    child.on('close', (code) => {
      this._current = null;
      if (code === 0) {
        this._hasSession = true;
        if (onDone) onDone();
      } else {
        if (onError) onError(new Error(`claude exited with code ${code}`));
      }
    });

    child.on('error', (err) => {
      this._current = null;
      if (onError) onError(err);
    });
  }
}

module.exports = { ClaudeRunner };
