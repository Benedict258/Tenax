#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const Groq = require('groq-sdk');
const opikBridge = require('../src/utils/opikBridge');

const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
} else {
  require('dotenv').config();
}

const optimizerConfig = require('../src/config/optimizer');

function normalizeGroqModel(input) {
  if (!input) {
    return 'llama-3.1-8b-instant';
  }
  if (!input.includes('/')) {
    return input;
  }
  const [, model] = input.split('/', 2);
  return model || input;
}

function loadLocalDataset(datasetPath) {
  if (!fs.existsSync(datasetPath)) {
    return null;
  }

  const raw = fs.readFileSync(datasetPath, 'utf-8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error('Dataset must be an array of entries');
  }
  return parsed;
}

async function loadOpikDataset(identifier, limit) {
  if (!identifier) {
    throw new Error('dataset identifier is required for Opik fetch');
  }
  const response = await opikBridge.invoke('fetch_opik_dataset_entries', {
    dataset_identifier: identifier,
    dataset_limit: limit
  });
  if (!response) {
    throw new Error('Opik bridge returned no response');
  }
  if (response.error) {
    throw new Error(response.error);
  }
  if (!Array.isArray(response.items)) {
    throw new Error('Opik bridge did not return dataset items');
  }
  return response.items;
}

async function resolveDataset(datasetArg, datasetLimit) {
  if (datasetArg) {
    const potentialPath = path.resolve(process.cwd(), datasetArg);
    const local = loadLocalDataset(potentialPath);
    if (local) {
      return local;
    }
    return loadOpikDataset(datasetArg, datasetLimit);
  }

  const defaultPath = path.join(__dirname, '..', 'opik_datasets', 'failure_cases.json');
  const local = loadLocalDataset(defaultPath);
  if (local) {
    return local;
  }

  const defaultIdentifier = process.env.OPIK_REMINDER_DATASET_ID;
  if (!defaultIdentifier) {
    throw new Error('Set --dataset or OPIK_REMINDER_DATASET_ID to load remote entries');
  }
  return loadOpikDataset(defaultIdentifier, datasetLimit);
}

function sampleDataset(entries, limit) {
  if (entries.length <= limit) {
    return entries;
  }
  const copy = [...entries];
  copy.sort(() => Math.random() - 0.5);
  return copy.slice(0, limit);
}

async function callGroq({ model, messages, temperature = 0.3, max_tokens = 800 }) {
  const client = new Groq({ apiKey: process.env.GROQ_API_KEY });
  if (!process.env.GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY is required to run optimizer lite');
  }
  const response = await client.chat.completions.create({
    model,
    temperature,
    max_tokens,
    messages
  });
  return response.choices?.[0]?.message?.content?.trim() || '';
}

async function generateVariantPrompt({ baseline, instruction, model }) {
  const content = await callGroq({
    model,
    temperature: 0.4,
    max_tokens: 600,
    messages: [
      {
        role: 'system',
        content: 'You rewrite behavioral coaching prompts for Tenax. Always return the rewritten prompt text only.'
      },
      {
        role: 'user',
        content: `Base prompt:\n"""${baseline}"""\nInstruction:\n${instruction}\n\nRewrite the base prompt so it satisfies the instruction while preserving Tenax voice. Return only the new prompt.`
      }
    ]
  });
  return content || baseline;
}

function buildEvaluationContext(entry) {
  const tasksPreview = (entry.tasks || [])
    .slice(0, 4)
    .map((task) => `- ${task.title} (${task.category || 'uncat'})`)
    .join('\n');

  return `User goal: ${entry.user?.goal || 'N/A'}\nReason this sample was flagged: ${entry.reason || 'N/A'}\nRepresentative tasks:\n${tasksPreview}`;
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    if (!text) {
      return null;
    }
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch (innerError) {
        return null;
      }
    }
    return null;
  }
}

async function scoreVariant({ model, promptText, entry }) {
  const evaluationPrompt = `You grade Tenax reminder prompts on a 1-5 scale (floats allowed).\nReturn strict JSON with keys goal_alignment, specificity, tone, realism, notes.`;

  const response = await callGroq({
    model,
    temperature: 0.1,
    messages: [
      { role: 'system', content: evaluationPrompt },
      {
        role: 'user',
        content: `Reminder prompt:\n"""${promptText}"""\n\nDataset context:\n${buildEvaluationContext(entry)}\n\nOutput JSON.`
      }
    ]
  });

  const parsed = safeJsonParse(response) || {};
  return {
    goal_alignment: Number(parsed.goal_alignment) || 0,
    specificity: Number(parsed.specificity) || 0,
    tone: Number(parsed.tone) || 0,
    realism: Number(parsed.realism) || 0,
    notes: parsed.notes || response
  };
}

async function main() {
  const args = process.argv.slice(2);
  const datasetArg = args.find((arg) => arg.startsWith('--dataset='))?.split('=')[1];
  const sampleArg = args.find((arg) => arg.startsWith('--samples='))?.split('=')[1];
  const datasetLimitArg = args.find((arg) => arg.startsWith('--dataset-limit='))?.split('=')[1];
  const sampleSize = sampleArg ? Number(sampleArg) : 3;
  const datasetLimit = datasetLimitArg ? Number(datasetLimitArg) : undefined;

  const dataset = await resolveDataset(datasetArg, datasetLimit);
  const sampledEntries = sampleDataset(dataset, Number.isFinite(sampleSize) && sampleSize > 0 ? sampleSize : 3);

  const groqModel = normalizeGroqModel(process.env.OPIK_OPTIMIZER_MODEL || 'groq/llama-3.1-8b-instant');
  const baselinePrompt = optimizerConfig.reminder.baselinePrompt;

  const variantInstructions = [
    {
      name: 'Actionable CTA',
      detail: 'Add a single actionable CTA sentence that references the most urgent task and invites a quick reply.'
    },
    {
      name: 'Empathetic Coach',
      detail: 'Adopt a warmer coaching tone that acknowledges setbacks before delivering guidance.'
    },
    {
      name: 'Streak Motivation',
      detail: 'Blend in streak language and completion percentages to motivate consistency.'
    }
  ];

  const variants = [];
  for (const variant of variantInstructions) {
    const promptText = await generateVariantPrompt({
      baseline: baselinePrompt,
      instruction: variant.detail,
      model: groqModel
    });

    const scores = [];
    for (const entry of sampledEntries) {
      scores.push(await scoreVariant({ model: groqModel, promptText, entry }));
    }

    const average = (key) => scores.reduce((sum, item) => sum + (item[key] || 0), 0) / scores.length;
    variants.push({
      name: variant.name,
      prompt: promptText,
      avg_goal_alignment: average('goal_alignment'),
      avg_specificity: average('specificity'),
      avg_tone: average('tone'),
      avg_realism: average('realism'),
      notes: scores.map((s) => s.notes).join(' | ')
    });
  }

  variants.sort((a, b) => (b.avg_goal_alignment + b.avg_specificity + b.avg_tone + b.avg_realism)
    - (a.avg_goal_alignment + a.avg_specificity + a.avg_tone + a.avg_realism));

  console.log('\n=== Optimizer Lite Results ===');
  console.log('Variant'.padEnd(18), 'Goal', 'Spec', 'Tone', 'Realism');
  variants.forEach((variant) => {
    console.log(
      variant.name.padEnd(18),
      variant.avg_goal_alignment.toFixed(2).padStart(4),
      variant.avg_specificity.toFixed(2).padStart(4),
      variant.avg_tone.toFixed(2).padStart(4),
      variant.avg_realism.toFixed(2).padStart(4)
    );
  });

  variants.forEach((variant, idx) => {
    console.log(`\n[${idx + 1}] ${variant.name}`);
    console.log('Prompt:\n' + variant.prompt);
    console.log('Notes:', variant.notes);
  });
}

main().catch((error) => {
  console.error('\n[OptimizerLite] Run failed:', error.message);
  process.exitCode = 1;
});
