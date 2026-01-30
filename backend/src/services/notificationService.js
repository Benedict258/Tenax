const Notification = require('../models/Notification');

async function createNotification(userId, payload) {
  try {
    return await Notification.create({
      user_id: userId,
      type: payload.type || 'system',
      title: payload.title || 'Update',
      message: payload.message || null,
      metadata: payload.metadata || null
    });
  } catch (error) {
    console.warn('[Notifications] Failed to create:', error.message);
    return null;
  }
}

async function listNotifications(userId, options = {}) {
  try {
    return await Notification.listByUser(userId, options);
  } catch (error) {
    console.warn('[Notifications] Failed to list:', error.message);
    return [];
  }
}

async function markRead(userId, ids = []) {
  try {
    return await Notification.markRead(userId, ids);
  } catch (error) {
    console.warn('[Notifications] Failed to mark read:', error.message);
    return [];
  }
}

module.exports = {
  createNotification,
  listNotifications,
  markRead
};
