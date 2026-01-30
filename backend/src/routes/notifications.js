const express = require('express');
const auth = require('../middleware/auth');
const notificationService = require('../services/notificationService');

const router = express.Router();

router.get('/', auth, async (req, res) => {
  try {
    const limit = Number(req.query.limit || 50);
    const unreadOnly = req.query.unread === 'true';
    const notifications = await notificationService.listNotifications(req.user.id, { limit, unreadOnly });
    res.json({ notifications });
  } catch (error) {
    console.error('[Notifications] list error:', error.message);
    res.status(500).json({ message: 'Failed to load notifications' });
  }
});

router.post('/read', auth, async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    const updated = await notificationService.markRead(req.user.id, ids);
    res.json({ updated });
  } catch (error) {
    console.error('[Notifications] mark read error:', error.message);
    res.status(500).json({ message: 'Failed to update notifications' });
  }
});

module.exports = router;
