const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SESSION_FILE = path.join(__dirname, '.phone-session-id');

function loadOrCreateSessionId() {
  try {
    const existing = fs.readFileSync(SESSION_FILE, 'utf8').trim();
    if (existing) return existing;
  } catch { /* file doesn't exist yet */ }

  const id = crypto.randomUUID();
  fs.writeFileSync(SESSION_FILE, id);
  return id;
}

class ClaudeRunner {
  constructor(config) {
    this.config = {
      workingDirectory: config.workingDirectory || process.cwd(),
    };
    this._sessionId = loadOrCreateSessionId();
    this._hasStarted = false;
    this._current = null;
    console.log(`[claude] phone session id: ${this._sessionId}`);
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

  resetSession() {
    this._sessionId = crypto.randomUUID();
    fs.writeFileSync(SESSION_FILE, this._sessionId);
    this._hasStarted = false;
    console.log(`[claude] new session: ${this._sessionId}`);
  }

  send(prompt, { onChunk, onDone, onError } = {}) {
    if (this._current) {
      if (onError) onError(new Error('Claude is still responding to a previous message'));
      return;
    }

    const isWin = process.platform === 'win32';
    const claudeArgs = ['-p', prompt];
    if (this._hasStarted) {
      claudeArgs.push('--resume', this._sessionId);
    } else {
      claudeArgs.push('--session-id', this._sessionId);
    }

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
        this._hasStarted = true;
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
