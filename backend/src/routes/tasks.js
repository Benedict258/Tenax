const express = require('express');
const Task = require('../models/Task');
const ResolutionTask = require('../models/ResolutionTask');
const auth = require('../middleware/auth');
const QueueService = require('../services/queue');
const notificationService = require('../services/notificationService');
const ruleEngine = require('../services/ruleEngine');
const router = express.Router();

// Get all user tasks
router.get('/', auth, async (req, res) => {
  try {
    const { status } = req.query;
    const tasks = await Task.findByUserId(req.user.id, status);
    res.json(tasks);
  } catch (error) {
    console.error('Get tasks error:', error);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

// Get today's tasks
router.get('/today', auth, async (req, res) => {
  try {
    await ruleEngine.enforceDailyRules(req.user, new Date());
    let tasks = await Task.getTodaysTasks(req.user.id, req.user.timezone);
    const resolutionTaskIds = tasks
      .map((task) => task?.metadata?.resolution_task_id)
      .filter(Boolean)
      .map((value) => String(value));
    if (resolutionTaskIds.length) {
      try {
        const lockedRows = await ResolutionTask.listByIds(resolutionTaskIds);
        const lockedMap = new Map(
          lockedRows.map((row) => [String(row.id), Boolean(row.locked)])
        );
        tasks = tasks.filter((task) => {
          const resolutionId = task?.metadata?.resolution_task_id;
          if (!resolutionId) return true;
          return !lockedMap.get(String(resolutionId));
        });
      } catch (err) {
        console.warn('[Tasks] Unable to filter locked resolution tasks:', err?.message || err);
      }
    }
    let scheduleBlocks = [];
    try {
      const scheduleService = require('../services/scheduleService');
      const blocks = await scheduleService.buildScheduleBlockInstances(req.user.id, new Date(), req.user.timezone || 'UTC');
      scheduleBlocks = (blocks || [])
        .filter((block) => block.start_time_utc)
        .map((block) => ({
          id: `schedule-${block.id}`,
          title: block.title,
          status: 'scheduled',
          category: block.category || 'Schedule',
          start_time: block.start_time_utc,
          location: block.location || null,
          is_schedule_block: true
        }));
      try {
        await QueueService.scheduleScheduleBlockReminders(req.user);
      } catch (err) {
        console.warn('[Tasks] Failed to schedule timetable reminders:', err?.message || err);
      }
    } catch (err) {
      console.warn('[Tasks] schedule blocks unavailable:', err?.message || err);
    }
    res.json([...(tasks || []), ...scheduleBlocks]);
  } catch (error) {
    console.error('Get today tasks error:', error);
    res.status(500).json({ error: 'Failed to fetch today\'s tasks' });
  }
});

// Create new task
router.post('/', auth, async (req, res) => {
  try {
    const taskData = { 
      ...req.body, 
      user_id: req.user.id,
      created_via: req.body.created_via || 'web'
    };
    
    // Validation
    if (!taskData.title) {
      return res.status(400).json({ error: 'Task title is required' });
    }

    if (!taskData.category) {
      taskData.category = 'Manual';
    }

    if (!taskData.start_time && taskData.time_for_execution) {
      const target = new Date(taskData.time_for_execution);
      taskData.start_time = Number.isNaN(target.getTime()) ? null : target.toISOString();
    }
    delete taskData.time_for_execution;

    if (taskData.priority_label && !taskData.priority) {
      taskData.priority = taskData.priority_label;
    }
    delete taskData.priority_label;
    
    const task = await Task.create(taskData);
    if (task?.start_time) {
      await QueueService.scheduleTaskReminders(req.user, task);
    }
    await notificationService.createNotification(req.user.id, {
      type: 'task',
      title: 'Task added',
      message: task.title,
      metadata: { task_id: task.id }
    });
    res.status(201).json({
      message: 'Task created successfully',
      task
    });
  } catch (error) {
    console.error('Create task error:', error);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// Update task status
router.patch('/:id/status', auth, async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['todo', 'started', 'done', 'archived', 'missed'];
    
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    
    const task = await Task.updateStatus(req.params.id, status);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    await notificationService.createNotification(req.user.id, {
      type: 'task',
      title: status === 'done' ? 'Task completed' : 'Task updated',
      message: task.title,
      metadata: { task_id: task.id, status }
    });

    res.json({
      message: 'Task status updated successfully',
      task
    });
  } catch (error) {
    console.error('Update task status error:', error);
    res.status(500).json({ error: 'Failed to update task status' });
  }
});

// Delete task
router.delete('/:id', auth, async (req, res) => {
  try {
    const task = await Task.delete(req.params.id);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    await notificationService.createNotification(req.user.id, {
      type: 'task',
      title: 'Task removed',
      message: task.title,
      metadata: { task_id: task.id }
    });

    res.json({
      message: 'Task deleted successfully',
      task
    });
  } catch (error) {
    console.error('Delete task error:', error);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

// Get single task
router.get('/:id', auth, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    res.json(task);
  } catch (error) {
    console.error('Get task error:', error);
    res.status(500).json({ error: 'Failed to fetch task' });
  }
});

module.exports = router;
