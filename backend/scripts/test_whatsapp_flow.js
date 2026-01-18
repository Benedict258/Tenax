#!/usr/bin/env node
const path = require('path');
const axios = require('axios');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const User = require('../src/models/User');
const Task = require('../src/models/Task');
const agentService = require('../src/services/agent');

const WEBHOOK_URL = process.env.TEST_WHATSAPP_WEBHOOK || 'http://localhost:3000/api/whatsapp/webhook';
const TEST_PHONE = process.env.TEST_WHATSAPP_NUMBER || '+15555550123';

async function ensureUser() {
  let user = await User.findByPhone(TEST_PHONE);
  if (!user) {
    user = await User.create({
      name: 'Test Tenax User',
      email: `test-${Date.now()}@tenax.dev`,
      phone_number: TEST_PHONE,
      role: 'student'
    });
  }
  if (!user.phone_verified) {
    await User.updatePhoneVerified(user.id, true);
    user.phone_verified = true;
  }
  return user;
}

async function ensureTasks(user) {
  const tasks = await Task.getTodaysTasks(user.id);
  if (tasks.length >= 2) return tasks;

  const samples = [
    { title: 'Morning Workout', category: 'Health' },
    { title: 'Deep Work Block', category: 'P1' }
  ];

  for (const sample of samples) {
    await Task.create({
      user_id: user.id,
      title: sample.title,
      category: sample.category,
      created_via: 'script'
    });
  }
  return Task.getTodaysTasks(user.id);
}

async function sendWebhook(body) {
  const payload = new URLSearchParams({
    From: `whatsapp:${TEST_PHONE}`,
    Body: body
  });

  try {
    const response = await axios.post(WEBHOOK_URL, payload.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    return response.status;
  } catch (error) {
    if (error.response) {
      console.error('Webhook responded with error:', error.response.status, error.response.data);
    } else if (error.request) {
      console.error('No response from webhook:', error.message);
    } else {
      console.error('Error setting up webhook request:', error.message);
    }
    throw error;
  }
}

async function run() {
  console.log('🧪 Running deterministic WhatsApp flow test...');
  console.log(`→ Target webhook: ${WEBHOOK_URL}`);

  const user = await ensureUser();
  await ensureTasks(user);

  // Generate morning summary + reminder to populate traces
  await agentService.sendMorningSummary(user);

  await sendWebhook('status');
  await sendWebhook('add Read AI paper');
  await sendWebhook('done Morning Workout');

  console.log('\n✅ Test messages sent.');
  console.log('🔍 Verify traces in Opik (intents, LLM calls, reminders, completions).');
}

run().catch((error) => {
  console.error('❌ WhatsApp flow test failed:', error.message || error);
  if (error.stack) {
    console.error(error.stack);
  }
  process.exit(1);
});
