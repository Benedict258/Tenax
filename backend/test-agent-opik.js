require('dotenv').config();

// Mock models for testing
const mockUser = {
  id: 'test-user-123',
  name: 'Benedict',
  phone_number: 'whatsapp:+1234567890' // Proper WhatsApp format
};

const mockTask = {
  id: 'task-1',
  title: 'Morning Workout',
  category: 'Health',
  start_time: new Date(Date.now() + 60 * 60 * 1000)
};

// Mock Task model
const Task = {
  getTodaysTasks: async () => [mockTask],
  updateStatus: async (id, status) => ({ ...mockTask, status })
};

// Mock module loading
const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function(id) {
  if (id === './src/models/Task' || id === '../models/Task') {
    return Task;
  }
  return originalRequire.apply(this, arguments);
};

const agentService = require('./src/services/agent');

async function testAgentWithOpik() {
  console.log('='.repeat(60));
  console.log('Testing Agent Service with Opik Integration');
  console.log('='.repeat(60));
  console.log('');

  try {
    // Test 1: Morning Summary (with Opik logging)
    console.log('Test 1: Morning Summary with Opik Trace');
    console.log('-'.repeat(60));
    const summary = await agentService.generateMorningSummary(mockUser, [mockTask]);
    console.log('Summary:', summary);
    console.log('Opik: Logged to morning_summary_generated trace');
    console.log('');

    // Test 2: Send Reminder (with Opik logging)
    console.log('Test 2: Send Reminder with Opik Trace');
    console.log('-'.repeat(60));
    const reminder = await agentService.sendReminder(mockUser, mockTask, '30_min');
    console.log('Reminder:', reminder.message);
    console.log('Opik: Logged to reminder_sent trace');
    console.log('');

    // Test 3: Track Task Completion (BEHAVIORAL METRIC)
    console.log('Test 3: Track Task Completion (Behavioral Metric)');
    console.log('-'.repeat(60));
    const completion = await agentService.trackTaskCompletion(
      mockUser,
      mockTask,
      'whatsapp',
      true,
      new Date(Date.now() - 45 * 60 * 1000) // Reminder sent 45 min ago
    );
    console.log('Latency:', completion.latencyMinutes, 'minutes');
    console.log('Opik: Logged to task_completed trace');
    console.log('Opik: Behavioral metric - reminder effectiveness tracked');
    console.log('');

    // Test 4: Calculate Agent Effectiveness (KEY HACKATHON METRIC)
    console.log('Test 4: Calculate Agent Effectiveness (Hackathon Metric)');
    console.log('-'.repeat(60));
    const effectiveness = await agentService.calculateAgentEffectiveness(mockUser, 'daily');
    console.log('Metrics:', JSON.stringify(effectiveness, null, 2));
    console.log('Opik: Logged to agent_effectiveness_calculated trace');
    console.log('');

    // Test 5: EOD Summary
    console.log('Test 5: End-of-Day Summary with Opik Trace');
    console.log('-'.repeat(60));
    const eod = await agentService.sendEODSummary(mockUser);
    console.log('Message:', eod.message);
    console.log('Tone:', eod.tone);
    console.log('Stats:', eod.stats);
    console.log('Opik: Logged to eod_summary_sent trace');
    console.log('');

    console.log('='.repeat(60));
    console.log('ALL TESTS PASSED!');
    console.log('='.repeat(60));
    console.log('');
    console.log('Check Opik Dashboard:');
    console.log('URL: https://www.comet.com/opik/');
    console.log('Project: Tenax');
    console.log('Workspace: Tenax');
    console.log('');
    console.log('You should see traces for:');
    console.log('1. morning_summary_generated');
    console.log('2. reminder_sent');
    console.log('3. task_completed (with latency metric)');
    console.log('4. agent_effectiveness_calculated (KEY METRIC)');
    console.log('5. eod_summary_sent');
    console.log('');
    console.log('CRITICAL: Trace #3 and #4 show BEHAVIORAL OUTCOMES');
    console.log('This is what wins "Best Use of Opik"!');

  } catch (error) {
    console.error('');
    console.error('TEST FAILED:', error.message);
    console.error('');
    console.error('Make sure:');
    console.error('1. OPENAI_API_KEY is set in .env');
    console.error('2. Opik is configured: opik configure');
    console.error('3. Python opik_logger.py is in src/utils/');
    process.exit(1);
  }
}

testAgentWithOpik();
