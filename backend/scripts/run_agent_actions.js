#!/usr/bin/env node
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const agentService = require('../src/services/agent');
const User = require('../src/models/User');
const Task = require('../src/models/Task');

const TEST_PHONE = process.env.TEST_WHATSAPP_NUMBER || '+15555550123';

async function ensureUser() {
  let user = await User.findByPhone(TEST_PHONE);

  if (!user) {
    user = await User.create({
      name: 'Test Tenax User',
      email: `agent-test-${Date.now()}@tenax.dev`,
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
  if (tasks.length > 0) return tasks;

  const seedTasks = [
    { title: 'Morning Workout', category: 'Health' },
    { title: 'Deep Work Session', category: 'P1' },
    { title: 'Read AI Paper', category: 'Learning' }
  ];

  for (const task of seedTasks) {
    await Task.create({
      user_id: user.id,
      title: task.title,
      category: task.category,
      created_via: 'agent_test_script'
    });
  }

  return Task.getTodaysTasks(user.id);
}

async function runMorningSummary(user) {
  console.log('🌅 Triggering morning summary...');
  await ensureTasks(user);
  const result = await agentService.sendMorningSummary(user);
  console.log('✅ Morning summary dispatched:', result?.summary?.slice(0, 120) || 'n/a');
}

async function runReminder(user) {
  console.log('⏰ Triggering reminder...');
  const tasks = await ensureTasks(user);
  const targetTask = tasks.find((t) => t.status !== 'done') || tasks[0];

  if (!targetTask) {
    throw new Error('No tasks available for reminder testing.');
  }

  const reminder = await agentService.sendReminder(user, targetTask, '30_min');
  console.log('✅ Reminder dispatched:', reminder.message.slice(0, 120));
}

async function runEODSummary(user) {
  console.log('🌙 Triggering end-of-day summary...');
  const result = await agentService.sendEODSummary(user);
  console.log('✅ EOD summary dispatched:', result.message.slice(0, 120));
}

async function main() {
  const action = process.argv[2] || 'all';

  try {
    const user = await ensureUser();

    if (action === 'morning' || action === 'all') {
      await runMorningSummary(user);
    }

    if (action === 'reminder' || action === 'all') {
      await runReminder(user);
    }

    if (action === 'eod' || action === 'all') {
      await runEODSummary(user);
    }

    console.log('\n🎯 Done. Check Opik for corresponding traces and evaluator scores.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Agent test failed:', error.message || error);
    if (error.stack) console.error(error.stack);
    process.exit(1);
  }
}

main();
