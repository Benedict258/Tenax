const optimizerService = require('./optimizerService');
const optimizerConfig = require('../config/optimizer');

class OptimizerJobs {
  constructor() {
    this.timer = null;
    this.initialized = false;
  }

  init() {
    if (this.initialized) {
      return;
    }

    if (!optimizerService.isEnabled()) {
      console.log('[OptimizerJobs] Optimizer disabled; scheduler idle');
      return;
    }

    this.scheduleNightlyHRPO();
    this.initialized = true;
    console.log('[OptimizerJobs] Nightly HRPO job scheduled (in-memory)');
  }

  scheduleNightlyHRPO(options = {}) {
    const cron = options.cron || optimizerConfig.nightlyCron;
    const nextRun = this._computeNextRunFromCron(cron);

    if (!nextRun) {
      console.warn('[OptimizerJobs] Invalid cron expression; skipping schedule');
      return { status: 'skipped', reason: 'invalid_cron' };
    }

    if (this.timer) {
      clearTimeout(this.timer);
    }

    const delay = Math.max(0, nextRun.getTime() - Date.now());
    this.timer = setTimeout(async () => {
      this.timer = null;
      try {
        await optimizerService.runReminderPromptOptimization({
          prompt: options.prompt || optimizerConfig.reminder.baselinePrompt,
          datasetName: options.datasetName,
          datasetPath: options.datasetPath,
          metric: options.metric,
          model: options.model,
          numTrials: options.numTrials
        });
        console.log('[OptimizerJobs] Nightly HRPO run completed');
      } catch (error) {
        console.error('[OptimizerJobs] HRPO run failed:', error.message);
      } finally {
        this.scheduleNightlyHRPO(options);
      }
    }, delay);

    return { status: 'scheduled', runAt: nextRun.toISOString() };
  }

  async enqueueImmediateHRPO(payload = {}) {
    if (!optimizerService.isEnabled()) {
      throw new Error('Optimizer disabled; cannot enqueue HRPO job');
    }

    return optimizerService.runReminderPromptOptimization({
      prompt: payload.prompt || optimizerConfig.reminder.baselinePrompt,
      datasetName: payload.datasetName,
      datasetPath: payload.datasetPath,
      metric: payload.metric,
      model: payload.model,
      numTrials: payload.numTrials
    });
  }

  _computeNextRunFromCron(cron) {
    if (!cron) {
      return null;
    }
    const parts = cron.trim().split(/\s+/);
    if (parts.length < 2) {
      return null;
    }

    const minute = Number(parts[0]);
    const hour = Number(parts[1]);
    if (Number.isNaN(minute) || Number.isNaN(hour)) {
      return null;
    }

    const now = new Date();
    const next = new Date(now);
    next.setSeconds(0, 0);
    next.setMinutes(minute);
    next.setHours(hour);

    if (next <= now) {
      next.setDate(next.getDate() + 1);
    }
    return next;
  }
}

module.exports = new OptimizerJobs();
