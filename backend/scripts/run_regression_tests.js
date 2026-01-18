#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const agentService = require('../src/services/agent');
const evaluator = require('../src/services/llmEvaluator');

const DATASET_PATH = path.join(__dirname, '..', 'opik_datasets', 'failure_cases.json');

function loadDataset() {
  const raw = fs.readFileSync(DATASET_PATH, 'utf-8');
  return JSON.parse(raw);
}

function selectCases(dataset, filter) {
  if (!filter || filter === 'all') return dataset;
  const lower = filter.toLowerCase();
  return dataset.filter(
    (item) => item.type === lower || item.id === filter
  );
}

async function generateOutput(entry, user) {
  if (entry.type === 'daily_plan') {
    return agentService.generateMorningSummary(user, entry.tasks || []);
  }

  if (entry.type === 'reminder') {
    return agentService.generateReminder(user, entry.task, entry.reminderType || '30_min');
  }

  if (entry.type === 'eod_summary') {
    const { message } = await agentService.generateEODSummary(user, entry.stats);
    return message;
  }

  throw new Error(`Unsupported case type: ${entry.type}`);
}

function buildEvaluatorPayload(entry, user, generatedText) {
  const schedule = entry.type === 'daily_plan'
    ? entry.tasks
    : entry.userSchedule || entry.tasks || [];

  const taskMetadata = entry.task || entry.stats || entry.tasks || {};

  return {
    messageType: entry.type,
    userGoal: user.goal,
    userSchedule: schedule,
    taskMetadata,
    generatedText
  };
}

function summarizeResult(result) {
  if (result.failures.length === 0) {
    return `✅ ${result.entry.id} passed (scores: ${JSON.stringify(result.scores)})`;
  }

  const failureText = result.failures
    .map((item) => `${item.metric} ${item.actual.toFixed(2)} < ${item.min}`)
    .join(', ');

  return `❌ ${result.entry.id} failed: ${failureText}`;
}

async function runCase(entry) {
  const user = {
    id: entry.user?.id || `dataset-${entry.type}`,
    name: entry.user?.name || 'Dataset User',
    phone_number: entry.user?.phone_number || process.env.TEST_WHATSAPP_NUMBER,
    goal: entry.user?.goal || 'Improve habits'
  };

  const generatedText = await generateOutput(entry, user);
  const scores = await evaluator.evaluate(buildEvaluatorPayload(entry, user, generatedText));

  const expectations = entry.expected_min_scores || {};
  const failures = Object.entries(expectations)
    .map(([metric, min]) => ({ metric, min, actual: scores[metric] || 0 }))
    .filter(({ actual, min }) => actual < min);

  return {
    entry,
    scores,
    failures,
    generatedText
  };
}

async function main() {
  const filter = process.argv[2];
  const dataset = loadDataset();
  const cases = selectCases(dataset, filter);

  if (cases.length === 0) {
    console.error('No regression cases matched the provided filter.');
    process.exit(1);
  }

  console.log(`📚 Running ${cases.length} regression case(s)...`);

  const results = [];
  for (const entry of cases) {
    try {
      const result = await runCase(entry);
      console.log(summarizeResult(result));
      results.push(result);
    } catch (error) {
      console.error(`❌ ${entry.id} errored: ${error.message}`);
      results.push({ entry, error: error.message, failures: [{ metric: 'runtime', min: 0, actual: 0 }] });
    }
  }

  const failed = results.filter((item) => item.failures?.length);

  if (failed.length > 0) {
    console.error(`\nRegression suite failed (${failed.length}/${results.length}). Fix issues before shipping.`);
    process.exit(1);
  }

  console.log('\n🎉 Regression suite passed. Ready for Opik-backed validation.');
  process.exit(0);
}

main();
