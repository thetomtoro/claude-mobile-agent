const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SESSION_FILE = path.join(__dirname, '.phone-session-id');

function listFilesystemRoots() {
  if (process.platform !== 'win32') return ['/'];
  try {
    const out = execSync('wmic logicaldisk get caption', { encoding: 'utf8' });
    return out
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => /^[A-Z]:$/.test(l))
      .map((l) => l + '\\');
  } catch {
    return ['C:\\'];
  }
}

function buildAddDirArgs(workingDirectory) {
  const roots = listFilesystemRoots();
  const cwdRoot = path.parse(path.resolve(workingDirectory)).root.toUpperCase();
  const args = [];
  for (const root of roots) {
    if (root.toUpperCase() !== cwdRoot) {
      args.push('--add-dir', root);
    }
  }
  return args;
}

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
    this._addDirArgs = buildAddDirArgs(this.config.workingDirectory);
    this._sessionId = loadOrCreateSessionId();
    this._hasStarted = false;
    this._current = null;
    console.log(`[claude] phone session id: ${this._sessionId}`);
    if (this._addDirArgs.length) {
      const dirs = this._addDirArgs.filter((a) => a !== '--add-dir').join(', ');
      console.log(`[claude] extra accessible roots: ${dirs}`);
    }
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

  setSession(sessionId) {
    this._sessionId = sessionId;
    this._hasStarted = true;  // existing session, use --resume
    console.log(`[claude] switched to session: ${sessionId}`);
  }

  send(prompt, { onChunk, onDone, onError } = {}) {
    if (this._current) {
      if (onError) onError(new Error('Claude is still responding to a previous message'));
      return;
    }

    const isWin = process.platform === 'win32';
    const claudeArgs = [
      '-p', prompt,
      '--permission-mode', 'bypassPermissions',
      ...this._addDirArgs,
    ];
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
