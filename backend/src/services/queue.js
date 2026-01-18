const Queue = require('bull');
const redis = require('redis');
const agentService = require('./agent');

// Create Redis client
const redisClient = redis.createClient({ url: process.env.REDIS_URL });

// Create job queues
const reminderQueue = new Queue('reminder queue', process.env.REDIS_URL);
const messageQueue = new Queue('message queue', process.env.REDIS_URL);

// Process reminder jobs
reminderQueue.process('send-reminder', async (job) => {
  const { user, task, type } = job.data;
  
  try {
    if (type === 'morning-summary') {
      await agentService.sendMorningSummary(user);
    } else if (type === 'task-reminder') {
      await agentService.sendReminder(user, task, task?.reminderType || '30_min');
    } else if (type === 'end-of-day') {
      await agentService.sendEODSummary(user);
    }
    
    console.log(`✅ Processed ${type} for user ${user.id}`);
  } catch (error) {
    console.error(`❌ Failed to process ${type}:`, error);
    throw error;
  }
});

class QueueService {
  static async scheduleReminder(user, task, type, delay, extra = {}) {
    return reminderQueue.add('send-reminder', { user, task: task ? { ...task, ...extra } : null, type }, { 
      delay,
      attempts: 3,
      backoff: 'exponential'
    });
  }

  static async scheduleMorningSummary(user, tasks, startTime) {
    const now = new Date();
    const [hours, minutes] = startTime.split(':');
    const scheduledTime = new Date();
    scheduledTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
    
    // If time has passed today, schedule for tomorrow
    if (scheduledTime <= now) {
      scheduledTime.setDate(scheduledTime.getDate() + 1);
    }
    
    const delay = scheduledTime.getTime() - now.getTime();
    return this.scheduleReminder(user, null, 'morning-summary', delay);
  }

  static async scheduleTaskReminder(user, task, reminderTime) {
    const now = new Date();
    const delay = new Date(reminderTime).getTime() - now.getTime();
    
    if (delay > 0) {
      return this.scheduleReminder(user, task, 'task-reminder', delay, { reminderType: task.reminderType || '30_min' });
    }
  }

  static async getQueueStats() {
    const waiting = await reminderQueue.getWaiting();
    const active = await reminderQueue.getActive();
    const completed = await reminderQueue.getCompleted();
    const failed = await reminderQueue.getFailed();
    
    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length
    };
  }
}

module.exports = QueueService;