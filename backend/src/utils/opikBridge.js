const { spawn } = require('child_process');
const path = require('path');

class OpikBridge {
  constructor() {
    this.pythonPath = process.env.PYTHON_PATH || 'python';
    this.runnerPath = path.join(__dirname, 'opik_runner.py');
  }

  _run(functionName, payload = {}) {
    return new Promise((resolve, reject) => {
      const args = [this.runnerPath, functionName, JSON.stringify(payload)];
      const child = spawn(this.pythonPath, args, { cwd: __dirname });

      let stdout = '';
      let stderr = '';

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
      console.error('[Opik] invoke failed:', error.message);
      return null;
    });
  }

  log(functionName, payload = {}) {
    return this.invoke(functionName, payload);
  }
}

module.exports = new OpikBridge();
