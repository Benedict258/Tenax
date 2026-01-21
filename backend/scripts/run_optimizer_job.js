const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
} else {
  require('dotenv').config();
}

const optimizerService = require('../src/services/optimizerService');
const optimizerConfig = require('../src/config/optimizer');

const SAMPLE_REMINDER_PROMPT = optimizerConfig.reminder.baselinePrompt;

const REMINDER_PROMPT_VARIANTS = [
  SAMPLE_REMINDER_PROMPT,
  `${SAMPLE_REMINDER_PROMPT}\nAdd one tactical bullet for the opening action.`,
  `${SAMPLE_REMINDER_PROMPT}\nUse a progress framing that references streaks when available.`
];

async function runHrpoDemo() {
  return optimizerService.runReminderPromptOptimization({
    prompt: SAMPLE_REMINDER_PROMPT
  });
}

async function runGepaDemo() {
  return optimizerService.runToneEvolutionarySearch({
    promptVariants: REMINDER_PROMPT_VARIANTS
  });
}

async function runFewShotDemo() {
  return optimizerService.runIntentFewShotSelection();
}

async function main() {
  const jobType = (process.argv[2] || 'hrpo').toLowerCase();

  if (!optimizerService.isEnabled()) {
    throw new Error('Set OPIK_OPTIMIZER_ENABLED=true in your backend .env before running optimizer jobs.');
  }

  let result;
  if (jobType === 'gepa') {
    result = await runGepaDemo();
  } else if (jobType === 'fewshot') {
    result = await runFewShotDemo();
  } else {
    result = await runHrpoDemo();
  }

  console.dir(result, { depth: null, colors: true });
}

main().catch((error) => {
  console.error('\n[Optimizer] Run failed:', error.message);
  process.exitCode = 1;
});
