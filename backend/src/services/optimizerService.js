const fs = require('fs');
const path = require('path');
const optimizerConfig = require('../config/optimizer');
const opikBridge = require('../utils/opikBridge');

function assertOptimizerEnabled() {
  if (!optimizerConfig.enabled) {
    throw new Error('Opik optimizer is disabled. Set OPIK_OPTIMIZER_ENABLED=true in your env.');
  }
}

function resolveDatasetPath(datasetName, explicitPath) {
  if (explicitPath) {
    return path.isAbsolute(explicitPath)
      ? explicitPath
      : path.join(process.cwd(), explicitPath);
  }

  if (!datasetName) {
    throw new Error('Dataset reference missing: pass datasetName or datasetPath.');
  }

  return path.join(optimizerConfig.datasetDir, datasetName);
}

function ensureDatasetExists(resolvedPath) {
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Dataset not found at ${resolvedPath}`);
  }

  return resolvedPath;
}

function isPositiveNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isOptimizerEnabled() {
  return optimizerConfig.enabled && opikBridge.isAvailable();
}

function buildDatasetPayload({
  datasetPath,
  explicitDatasetName,
  explicitDatasetId,
  defaultDatasetName,
  defaultDatasetId,
  datasetLimit
}) {
  const limitPayload = isPositiveNumber(datasetLimit) ? { dataset_limit: datasetLimit } : {};

  if (datasetPath || explicitDatasetName) {
    const resolvedPath = ensureDatasetExists(
      resolveDatasetPath(explicitDatasetName || defaultDatasetName, datasetPath)
    );
    return { dataset_path: resolvedPath, ...limitPayload };
  }

  const resolvedIdentifier = explicitDatasetId || defaultDatasetId;
  if (resolvedIdentifier) {
    return { dataset_identifier: resolvedIdentifier, ...limitPayload };
  }

  const resolvedPath = ensureDatasetExists(resolveDatasetPath(defaultDatasetName));
  return { dataset_path: resolvedPath, ...limitPayload };
}

async function callOptimizer(functionName, payload) {
  const response = await opikBridge.invoke(functionName, payload);
  if (!response) {
    throw new Error(`Python optimizer bridge returned no response for ${functionName}`);
  }
  if (response.error) {
    throw new Error(response.error);
  }
  return response;
}

function listAvailableDatasets() {
  if (!fs.existsSync(optimizerConfig.datasetDir)) {
    return [];
  }

  return fs
    .readdirSync(optimizerConfig.datasetDir)
    .filter((file) => file.endsWith('.json') || file.endsWith('.jsonl'));
}

async function runReminderPromptOptimization({
  prompt,
  datasetName,
  datasetPath,
  datasetId,
  metric,
  model,
  numTrials,
  metadata
} = {}) {
  assertOptimizerEnabled();
  if (!prompt) {
    throw new Error('Baseline prompt is required for HRPO runs.');
  }

  const datasetPayload = buildDatasetPayload({
    datasetPath,
    explicitDatasetName: datasetName,
    explicitDatasetId: datasetId,
    defaultDatasetName: optimizerConfig.reminder.dataset,
    defaultDatasetId: optimizerConfig.reminder.datasetId,
    datasetLimit: optimizerConfig.reminder.maxItems
  });

  return callOptimizer('run_hrpo_optimization', {
    prompt,
    metric: metric || optimizerConfig.reminder.metric,
    model: model || optimizerConfig.defaultModel,
    num_trials: numTrials || optimizerConfig.maxTrials,
    metadata: metadata || {},
    ...datasetPayload
  });
}

async function runToneEvolutionarySearch({
  promptVariants,
  datasetName,
  datasetPath,
  datasetId,
  metric,
  model,
  generations,
  populationSize
} = {}) {
  assertOptimizerEnabled();
  if (!Array.isArray(promptVariants) || !promptVariants.length) {
    throw new Error('At least one prompt variant is required for GEPA runs.');
  }

  const datasetPayload = buildDatasetPayload({
    datasetPath,
    explicitDatasetName: datasetName,
    explicitDatasetId: datasetId,
    defaultDatasetName: optimizerConfig.tone.dataset,
    defaultDatasetId: optimizerConfig.tone.datasetId,
    datasetLimit: optimizerConfig.tone.maxItems
  });

  return callOptimizer('run_gepa_optimization', {
    initial_prompts: promptVariants,
    metric: metric || optimizerConfig.tone.metric,
    model: model || optimizerConfig.defaultModel,
    generations: generations || 3,
    population_size: populationSize || 6,
    ...datasetPayload
  });
}

async function runIntentFewShotSelection({
  examplePool,
  datasetName,
  datasetPath,
  datasetId,
  metric,
  model,
  numShots,
  task
} = {}) {
  assertOptimizerEnabled();

  const datasetPayload = buildDatasetPayload({
    datasetPath,
    explicitDatasetName: datasetName,
    explicitDatasetId: datasetId,
    defaultDatasetName: optimizerConfig.intentParsing.dataset,
    defaultDatasetId: optimizerConfig.intentParsing.datasetId,
    datasetLimit: optimizerConfig.intentParsing.maxItems
  });

  return callOptimizer('run_fewshot_selection', {
    example_pool: examplePool,
    metric: metric || optimizerConfig.intentParsing.metric,
    model: model || optimizerConfig.defaultModel,
    num_shots: numShots || optimizerConfig.intentParsing.shots,
    task: task || 'intent_parsing',
    ...datasetPayload
  });
}

module.exports = {
  isEnabled: () => isOptimizerEnabled(),
  listAvailableDatasets,
  runReminderPromptOptimization,
  runToneEvolutionarySearch,
  runIntentFewShotSelection
};
