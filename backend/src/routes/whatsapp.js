const express = require('express');
const User = require('../models/User');
const Task = require('../models/Task');
const whatsappService = require('../services/whatsapp');
const agentService = require('../services/agent');
const opikLogger = require('../utils/opikBridge');
const metricsStore = require('../services/metricsStore');
const ruleStateService = require('../services/ruleState');
const router = express.Router();

// Simple intent parser
function parseMessage(message) {
  const text = message.toLowerCase().trim();
  const collapsed = text.replace(/\s+/g, ' ');

  // Natural language completion statements
  const completionStarters = ['done', 'finished', 'completed'];
  if (completionStarters.some((word) => collapsed.startsWith(word))) {
    const taskName = collapsed.replace(/^(done|finished|completed)/, '').trim();
    return { intent: 'mark_complete', taskName, confidence: 0.92, slots: { taskName } };
  }

  const completionRegex = /(i\s*(?:have|just)?\s*)?(completed|finished|done)\s+(?<task>.+)/;
  const completionMatch = collapsed.match(completionRegex);
  if (completionMatch) {
    const rawTask = (completionMatch.groups?.task || '').trim();
    const taskName = ['my tasks', 'all my tasks', 'everything'].includes(rawTask) ? '' : rawTask;
    return { intent: 'mark_complete', taskName, confidence: 0.85, slots: { taskName } };
  }

  if (collapsed === 'status' || collapsed === "what's left" || collapsed.includes('what is left')) {
    return { intent: 'status', confidence: 0.95, slots: {} };
  }

  if (collapsed.startsWith('add ') || collapsed.startsWith('create ')) {
    const taskName = collapsed.replace(/^(add|create)/, '').trim();
    return { intent: 'add_task', taskName, confidence: 0.9, slots: { taskName } };
  }

  if (collapsed === 'help' || collapsed.includes('what can you do')) {
    return { intent: 'help', confidence: 0.85, slots: {} };
  }

  return { intent: 'unknown', originalText: text, confidence: 0.2, slots: {} };
}

// WhatsApp webhook endpoint
router.post('/webhook', async (req, res) => {
  try {
    const { From, Body } = req.body;
    
    if (!From || !Body) {
      return res.status(400).send('Missing required fields');
    }
    
    const phoneNumber = From.replace('whatsapp:', '');
    console.log(`📱 WhatsApp message from ${phoneNumber}: ${Body}`);
    
    // Find user by phone
    const user = await User.findByPhone(phoneNumber);
    if (!user) {
      console.log(`❌ User not found for phone: ${phoneNumber}`);
      return res.status(200).send('User not found');
    }
    
    if (!user.phone_verified) {
      await whatsappService.sendMessage(phoneNumber, 'Please verify your phone number first through the app.');
      return res.status(200).send('Phone not verified');
    }
    
    metricsStore.recordUserMessage(user.id);
    const parsed = parseMessage(Body);

    const [p1Tasks, ruleState] = await Promise.all([
      ruleStateService.getActiveP1Tasks(user.id),
      ruleStateService.getUserState(user.id)
    ]);

    const guardActive = ruleStateService.shouldBlockNonCompletion(ruleState);
    if (guardActive && parsed.intent !== 'mark_complete' && parsed.intent !== 'help') {
      const guardMessage = ruleStateService.buildGuardrailMessage(p1Tasks);
      await whatsappService.sendMessage(phoneNumber, guardMessage);
      await ruleStateService.recordSurface({
        userId: user.id,
        tasks: p1Tasks,
        surfaceType: 'inbound_guard',
        channel: 'whatsapp',
        metadata: { blocked_intent: parsed.intent }
      });
      await ruleStateService.recordBlockedAction({
        userId: user.id,
        action: parsed.intent,
        channel: 'whatsapp',
        metadata: { body: Body }
      });
      return res.status(200).send('Guard enforced');
    }

    await opikLogger.log('log_intent_parsing', {
      user_id: user.id,
      message: Body,
      intent: parsed.intent,
      confidence: parsed.confidence || 0,
      slots: parsed.slots || {}
    });

    // Parse message intent
    switch (parsed.intent) {
      case 'mark_complete':
        await handleMarkComplete(user, parsed.taskName, phoneNumber);
        break;
        
      case 'status':
        await handleStatus(user, phoneNumber, p1Tasks);
        break;
        
      case 'add_task':
        await handleAddTask(user, parsed.taskName, phoneNumber);
        break;
        
      case 'help':
        await handleHelp(phoneNumber);
        break;
        
      default:
        await whatsappService.sendMessage(phoneNumber, 
          'I understand: "done [task]", "status", "add [task]", or "help"');
    }
    
    res.status(200).send('OK');
  } catch (error) {
    console.error('❌ WhatsApp webhook error:', error);
    res.status(500).send('Error processing message');
  }
});

async function handleMarkComplete(user, taskName, phoneNumber) {
  try {
    const tasks = await Task.findByUserId(user.id, 'todo');
    
    let matchedTask = null;
    
    if (taskName) {
      // Find task by partial name match
      matchedTask = tasks.find(t => 
        t.title.toLowerCase().includes(taskName) || 
        taskName.includes(t.title.toLowerCase())
      );
    } else if (tasks.length === 1) {
      // If only one task, mark it complete
      matchedTask = tasks[0];
    }
    
    if (matchedTask) {
      const reminderInfo = metricsStore.getReminderForTask(user.id, matchedTask.id);
      const reminderWasSent = !!reminderInfo;
      const reminderSentAt = reminderInfo?.sentAt || null;
      await Task.updateStatus(matchedTask.id, 'done');
      await agentService.trackTaskCompletion(
        user,
        matchedTask,
        'whatsapp',
        reminderWasSent,
        reminderSentAt
      );
      await whatsappService.sendMessage(phoneNumber, 
        `✅ Marked "${matchedTask.title}" as completed! Great job!`);
    } else if (tasks.length === 0) {
      await whatsappService.sendMessage(phoneNumber, 
        'No pending tasks found. All done! 🎉');
    } else {
      // Multiple tasks, ask for clarification
      const taskList = tasks.slice(0, 5).map((t, i) => `${i + 1}. ${t.title}`).join('\n');
      await whatsappService.sendMessage(phoneNumber, 
        `Nice! Which task should I mark off?\n\n${taskList}\n\nYou can reply with the number or just tell me the task name.`);
    }
  } catch (error) {
    console.error('Mark complete error:', error);
    await whatsappService.sendMessage(phoneNumber, 'Sorry, there was an error marking your task as complete.');
  }
}

async function handleStatus(user, phoneNumber, p1Tasks = []) {
  try {
    const [todoTasks, doneTasks, stats] = await Promise.all([
      Task.findByUserId(user.id, 'todo'),
      Task.findByUserId(user.id, 'done'),
      agentService.calculateCompletionStats(user)
    ]);
    const banner = p1Tasks.length ? `${ruleStateService.buildBanner(p1Tasks)}\n\n` : '';
    
    if (todoTasks.length === 0) {
      await whatsappService.sendMessage(phoneNumber, 
        `${banner}All tasks completed! 🎉\n\nCompleted today: ${doneTasks.length}\nCompletion rate: ${stats.completion_rate}%`);
    } else {
      const taskList = todoTasks.slice(0, 8).map(t => `• ${t.title}`).join('\n');
      const moreText = todoTasks.length > 8 ? `\n...and ${todoTasks.length - 8} more` : '';
      
      await whatsappService.sendMessage(phoneNumber, 
        `${banner}You have ${todoTasks.length} tasks left:\n\n${taskList}${moreText}\n\nCompleted: ${doneTasks.length}\nCompletion rate: ${stats.completion_rate}%`);
    }
  } catch (error) {
    console.error('Status error:', error);
    await whatsappService.sendMessage(phoneNumber, 'Sorry, there was an error getting your status.');
  }
}

async function handleAddTask(user, taskName, phoneNumber) {
  try {
    if (!taskName) {
      await whatsappService.sendMessage(phoneNumber, 'Please specify a task name. Example: "add workout"');
      return;
    }
    
    const task = await Task.create({
      user_id: user.id,
      title: taskName,
      category: 'Other',
      created_via: 'whatsapp'
    });
    
    await whatsappService.sendMessage(phoneNumber, 
      `✅ Added "${task.title}" to your tasks!`);
  } catch (error) {
    console.error('Add task error:', error);
    await whatsappService.sendMessage(phoneNumber, 'Sorry, there was an error adding your task.');
  }
}

async function handleHelp(phoneNumber) {
  const helpText = `🤖 Tenax Commands:\n\n• "done [task]" - Mark task complete\n• "status" - See remaining tasks\n• "add [task]" - Add new task\n• "help" - Show this message\n\nExample: "done workout"`;
  await whatsappService.sendMessage(phoneNumber, helpText);
}

// Webhook verification (for Twilio)
router.get('/webhook', (req, res) => {
  res.send('Tenax WhatsApp webhook is running!');
});

module.exports = router;