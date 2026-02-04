const express = require('express');
const auth = require('../middleware/auth');
const googleCalendar = require('../services/googleCalendar');
const Task = require('../models/Task');
const QueueService = require('../services/queue');
const { DateTime } = require('luxon');

const router = express.Router();

const buildTodayWindow = (timezone) => {
  const start = DateTime.now().setZone(timezone || 'UTC').startOf('day');
  const end = start.plus({ days: 1 });
  return { startISO: start.toUTC().toISO(), endISO: end.toUTC().toISO() };
};

const formatEventTasks = (userId, events) =>
  events.map((event) => ({
    user_id: userId,
    title: event.summary || 'Calendar event',
    description: event.description ? String(event.description).slice(0, 1000) : null,
    category: 'Calendar',
    priority: 'P2',
    created_via: 'google_calendar',
    start_time: event.start?.dateTime || null,
    duration_minutes: event.end?.dateTime
      ? Math.max(15, Math.round((new Date(event.end.dateTime).getTime() - new Date(event.start.dateTime).getTime()) / 60000))
      : 60,
    metadata: {
      source: 'google_calendar',
      external_id: event.id,
      location: event.location || null
    }
  }));

router.get('/google/auth-url', auth, async (req, res) => {
  try {
    const url = await googleCalendar.generateAuthUrl(req.user.id);
    res.json({ url });
  } catch (error) {
    console.error('[Integrations] auth-url error:', error.message);
    res.status(500).json({ message: 'Unable to start Google Calendar connect' });
  }
});

router.get('/google/callback', async (req, res) => {
  try {
    const code = req.query.code;
    const state = req.query.state;
    if (!code || !state) {
      return res.status(400).send('Missing OAuth parameters');
    }
    const result = await googleCalendar.exchangeCodeForTokens(code, state);
    const redirectBase = process.env.FRONTEND_URL || process.env.APP_URL || 'http://localhost:3000';
    return res.redirect(`${redirectBase.replace(/\/$/, '')}/settings?gcal=connected`);
  } catch (error) {
    console.error('[Integrations] callback error:', error.message);
    res.status(500).send('Google Calendar connection failed');
  }
});

router.get('/google/status', auth, async (req, res) => {
  try {
    const integration = await googleCalendar.getTokens(req.user.id);
    res.json({
      status: integration?.status || 'disconnected',
      email: integration?.provider_account_email || null
    });
  } catch (error) {
    console.error('[Integrations] status error:', error.message);
    res.status(500).json({ message: 'Failed to check integration status' });
  }
});

router.post('/google/disconnect', auth, async (req, res) => {
  try {
    await googleCalendar.disconnect(req.user.id);
    res.json({ status: 'disconnected' });
  } catch (error) {
    console.error('[Integrations] disconnect error:', error.message);
    res.status(500).json({ message: 'Failed to disconnect' });
  }
});

router.post('/google/review-today', auth, async (req, res) => {
  try {
    const timezone = req.user?.timezone || 'UTC';
    const { startISO, endISO } = buildTodayWindow(timezone);
    const events = await googleCalendar.fetchEvents(req.user.id, startISO, endISO);
    const timedEvents = (events || []).filter((event) => Boolean(event?.start?.dateTime));
    if (!timedEvents.length) {
      return res.json({ inserted: 0, skipped_duplicates: 0, events: [] });
    }

    const externalIds = timedEvents.map((event) => event.id).filter(Boolean);
    const { data: existing, error } = await require('../config/supabase')
      .from('tasks')
      .select('metadata')
      .eq('user_id', req.user.id)
      .eq('created_via', 'google_calendar')
      .in('metadata->>external_id', externalIds);

    if (error) throw error;
    const existingIds = new Set((existing || []).map((row) => row?.metadata?.external_id).filter(Boolean));
    const newEvents = timedEvents.filter((event) => !existingIds.has(event.id));

    if (!newEvents.length) {
      return res.json({ inserted: 0, skipped_duplicates: timedEvents.length, events: [] });
    }

    const tasksPayload = formatEventTasks(req.user.id, newEvents);
    const createdTasks = await Task.createMany(tasksPayload);

    for (const task of createdTasks) {
      await QueueService.scheduleTaskReminders(req.user, task);
    }

    res.json({
      inserted: createdTasks.length,
      skipped_duplicates: timedEvents.length - newEvents.length,
      events: newEvents.map((event) => ({ id: event.id, summary: event.summary }))
    });
  } catch (error) {
    console.error('[Integrations] review-today error:', error.message);
    res.status(500).json({ message: 'Failed to review today events' });
  }
});

module.exports = router;
