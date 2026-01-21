const path = require('path');

const datasetDir = process.env.OPIK_DATASET_DIR
  ? path.resolve(process.cwd(), process.env.OPIK_DATASET_DIR)
  : path.join(__dirname, '../../opik_datasets');

const toPositiveInt = (value) => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

const defaultReminderPrompt = [
  'You are Tenax, a behavioral accountability coach for university students.',
  'Craft WhatsApp reminders that mention the task, explain why it matters, and suggest the next action.',
  'Always acknowledge schedule constraints and end with an encouraging rallying line.'
].join('\n');

const optimizerConfig = {
  enabled: process.env.OPIK_OPTIMIZER_ENABLED === 'true',
  pythonPath: process.env.PYTHON_PATH || 'python',
  datasetDir,
  defaultModel: process.env.OPIK_OPTIMIZER_MODEL || 'gpt-4o-mini',
  maxTrials: Number(process.env.OPIK_OPTIMIZER_MAX_TRIALS) || 5,
  nightlyCron: process.env.OPIK_OPTIMIZER_CRON || '0 2 * * *',
  reminder: {
    dataset: process.env.OPIK_REMINDER_DATASET || 'failure_cases.json',
    datasetId: process.env.OPIK_REMINDER_DATASET_ID,
    metric: process.env.OPIK_REMINDER_METRIC || 'completion_rate',
    baselinePrompt: process.env.OPIK_REMINDER_BASE_PROMPT || defaultReminderPrompt,
    maxItems: toPositiveInt(process.env.OPIK_REMINDER_DATASET_MAX_ITEMS)
  },
  intentParsing: {
    dataset: process.env.OPIK_INTENT_DATASET || 'intent_examples.json',
    datasetId: process.env.OPIK_INTENT_DATASET_ID,
    metric: process.env.OPIK_INTENT_METRIC || 'levenshtein_distance',
    shots: Number(process.env.OPIK_INTENT_NUM_SHOTS) || 5,
    maxItems: toPositiveInt(process.env.OPIK_INTENT_DATASET_MAX_ITEMS)
  },
  tone: {
    dataset: process.env.OPIK_TONE_DATASET || 'failure_cases.json',
    datasetId: process.env.OPIK_TONE_DATASET_ID,
    metric: process.env.OPIK_TONE_METRIC || 'tone_score',
    maxItems: toPositiveInt(process.env.OPIK_TONE_DATASET_MAX_ITEMS)
  }
};

module.exports = optimizerConfig;
