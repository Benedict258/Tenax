require('dotenv').config();

// Mock Task model for testing without database
const Task = {
  getTodaysTasks: async (userId) => {
    return [
      {
        id: 'task-1',
        title: 'Morning Workout',
        category: 'Health',
        start_time: new Date(Date.now() + 60 * 60 * 1000)
      },
      {
        id: 'task-2',
        title: 'Review Tenax Phase 1 Code',
        category: 'P1',
        start_time: new Date(Date.now() + 2 * 60 * 60 * 1000)
      },
      {
        id: 'task-3',
        title: 'Integrate Opik Tracing',
        category: 'Academic'
      }
    ];
  }
};

// Temporarily replace Task model
const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function(id) {
  if (id === './src/models/Task') {
    return Task;
  }
  return originalRequire.apply(this, arguments);
};

const agentService = require('./src/services/agent');

// Mock user and tasks for testing
const mockUser = {
  id: 'test-user-123',
  name: 'Benedict',
  phone_number: '+1234567890'
};

const mockTasks = [
  {
    id: 'task-1',
    title: 'Morning Workout',
    category: 'Health',
    start_time: new Date(Date.now() + 60 * 60 * 1000) // 1 hour from now
  },
  {
    id: 'task-2',
    title: 'Review Tenax Phase 1 Code',
    category: 'P1',
    start_time: new Date(Date.now() + 2 * 60 * 60 * 1000) // 2 hours from now
  },
  {
    id: 'task-3',
    title: 'Integrate Opik Tracing',
    category: 'Academic'
  }
];

async function testAgentService() {
  console.log('🧪 Testing Tenax Agent Service with Opik Integration\n');

  try {
    // Test 1: Generate Morning Summary
    console.log('Test 1: Generate Morning Summary');
    const summary = await agentService.generateMorningSummary(mockUser, mockTasks);
    console.log('✅ Summary:', summary);
    console.log('');

    // Test 2: Generate Reminder
    console.log('Test 2: Generate Reminder');
    const reminder = await agentService.generateReminder(mockUser, mockTasks[0], '30_min');
    console.log('✅ Reminder:', reminder);
    console.log('');

    // Test 3: Calculate Completion Stats
    console.log('Test 3: Calculate Completion Stats');
    const stats = {
      total: 5,
      completed: 3,
      pending: 2,
      completion_rate: 60
    };
    const eodSummary = await agentService.generateEODSummary(mockUser, stats);
    console.log('✅ EOD Summary:', eodSummary.message);
    console.log('   Tone:', eodSummary.tone);
    console.log('');

    console.log('🎉 All tests passed!');
    console.log('\n📊 Check Opik dashboard at: https://www.comet.com/opik/');
    console.log('   Project: Tenax');
    console.log('   Workspace: Tenax');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

testAgentService();