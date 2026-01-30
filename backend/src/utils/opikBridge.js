const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

class OpikBridge {
  constructor() {
    this.pythonPath = path.normalize(process.env.OPIK_PYTHON_BIN || process.env.PYTHON_PATH || 'python');
    this.runnerPath = path.join(__dirname, 'opik_runner.py');
    this.disabled = false;
    this.disableReason = null;
    this._warned = false;
    this.fallbackPath = path.join(__dirname, '..', '..', 'logs', 'opik_fallback.jsonl');
    this._checkPaths();
  }

  _checkPaths() {
    const hasScript = fs.existsSync(this.runnerPath);
    if (!hasScript) {
      this.disabled = true;
      this.disableReason = `Opik runner missing at ${this.runnerPath}`;
      if (!this._warned) {
        console.warn('[Opik] Disabled: opik_runner.py not found');
        this._warned = true;
      }
    }
    console.log('[Opik] Bridge:', {
      enabled: !this.disabled,
      python: this.pythonPath,
      runner: this.runnerPath
    });
  }
  _writeFallback(functionName, payload = {}, reason = null) {
    try {
      const dir = path.dirname(this.fallbackPath);
      fs.mkdirSync(dir, { recursive: true });
      const record = {
        at: new Date().toISOString(),
        function: functionName,
        payload,
        reason
      };
      fs.appendFileSync(this.fallbackPath, `${JSON.stringify(record)}\n`);
    } catch (error) {
      console.warn('[Opik] Fallback log failed:', error.message || error);
    }
  }

  _run(functionName, payload = {}) {
    return new Promise((resolve, reject) => {
      if (this.disabled) {
        this._writeFallback(functionName, payload, this.disableReason || 'disabled');
        return resolve({ status: 'ok', mode: 'fallback', reason: this.disableReason || 'disabled' });
      }
      const args = [this.runnerPath, functionName, JSON.stringify(payload)];
      const isWindows = process.platform === 'win32';
      const command = isWindows ? 'C:\\\\Windows\\\\System32\\\\cmd.exe' : this.pythonPath;
      const commandArgs = isWindows ? ['/c', this.pythonPath, ...args] : args;
      let child = null;
      try {
        child = spawn(command, commandArgs, { cwd: __dirname, windowsHide: true });
      } catch (error) {
        return reject(error);
      }

      let stdout = '';
      let stderr = '';

      child.on('error', (error) => {
        reject(error);
      });

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        if (code !== 0) {
          return reject(new Error(stderr || `Opik logger exited with code ${code}`));
        }
        try {
          const parsed = stdout ? JSON.parse(stdout) : { status: 'ok' };
          resolve(parsed);
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  invoke(functionName, payload = {}) {
    return this._run(functionName, payload).catch((error) => {
      const message = error?.message || String(error);
      if (message.includes('EPERM') || message.includes('spawn')) {
        this.disabled = true;
        this.disableReason = message;
        if (!this._warned) {
          console.warn('[Opik] Disabled Python bridge:', message);
          this._warned = true;
        }
        this._writeFallback(functionName, payload, message);
        return { status: 'ok', mode: 'fallback', reason: message };
      }
      console.error('[Opik] invoke failed:', message);
      this._writeFallback(functionName, payload, message);
      return null;
    });
  }

  log(functionName, payload = {}) {
    return this.invoke(functionName, payload);
  }

  isAvailable() {
    return !this.disabled;
  }
}

module.exports = new OpikBridge();
