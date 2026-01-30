const express = require('express');
const Task = require('../models/Task');
const auth = require('../middleware/auth');
const QueueService = require('../services/queue');
const notificationService = require('../services/notificationService');
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
    const tasks = await Task.getTodaysTasks(req.user.id);
    res.json(tasks);
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
      const reminderTime = new Date(task.start_time);
      reminderTime.setMinutes(reminderTime.getMinutes() - 30);
      await QueueService.scheduleTaskReminder(req.user, task, reminderTime.toISOString());
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
