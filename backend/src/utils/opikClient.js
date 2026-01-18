const { spawn } = require('child_process');
const path = require('path');

class OpikClient {
  constructor() {
    this.pythonPath = 'python'; // or 'python3' depending on system
    this.wrapperPath = path.join(__dirname, '..', 'utils', 'opik_wrapper.py');
  }

  /**
   * Log agent action to Opik
   */
  async logTrace(action, metadata, input, output, status = 'success', error = null) {
    const data = {
      action,
      metadata: {
        ...metadata,
        timestamp: new Date().toISOString()
      },
      input,
      output,
      status,
      error
    };

    return new Promise((resolve, reject) => {
      const python = spawn(this.pythonPath, [
        this.wrapperPath,
        JSON.stringify(data)
      ]);

      let result = '';
      let errorOutput = '';

      python.stdout.on('data', (data) => {
        result += data.toString();
      });

      python.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      python.on('close', (code) => {
        if (code !== 0) {
          console.error('[Opik] Error:', errorOutput);
          reject(new Error(`Opik logging failed: ${errorOutput}`));
        } else {
          try {
            const parsed = JSON.parse(result);
            resolve(parsed);
          } catch (e) {
            console.error('[Opik] Parse error:', e);
            reject(e);
          }
        }
      });
    });
  }

  /**
   * Track decorator for async functions
   */
  track(name, metadata = {}) {
    return (target, propertyKey, descriptor) => {
      const originalMethod = descriptor.value;

      descriptor.value = async function (...args) {
        const startTime = Date.now();
        let result, error, status = 'success';

        try {
          result = await originalMethod.apply(this, args);
          return result;
        } catch (e) {
          error = e.message;
          status = 'error';
          throw e;
        } finally {
          const duration = Date.now() - startTime;
          
          // Log to Opik asynchronously (don't block)
          this.opikClient.logTrace(
            name,
            { ...metadata, duration_ms: duration },
            { args: args.map(a => typeof a === 'object' ? JSON.stringify(a) : a) },
            { result: typeof result === 'object' ? JSON.stringify(result) : result },
            status,
            error
          ).catch(err => console.error('[Opik] Logging failed:', err));
        }
      };

      return descriptor;
    };
  }
}

module.exports = new OpikClient();