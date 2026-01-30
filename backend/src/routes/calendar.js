const express = require('express');
const auth = require('../middleware/auth');
const googleCalendar = require('../services/googleCalendar');
const User = require('../models/User');

const router = express.Router();

router.get('/connect', auth, async (req, res) => {
  try {
    const authUrl = await googleCalendar.generateAuthUrl(req.user.id);
    res.json({ authUrl });
  } catch (error) {
    console.error('[Calendar] connect error:', error.message);
    res.status(500).json({ message: 'Failed to start calendar connect' });
  }
});

router.get('/callback', async (req, res) => {
  try {
    const code = req.query.code;
    const state = req.query.state;
    if (!code || !state) {
      return res.status(400).send('Missing OAuth parameters');
    }
    await googleCalendar.exchangeCodeForTokens(code, state);
    await User.updateProfile(state, { google_calendar_connected: true });
    res.redirect(`${process.env.APP_URL || 'http://localhost:3000'}/dashboard/settings`);
  } catch (error) {
    console.error('[Calendar] callback error:', error.message);
    res.status(500).send('Google Calendar connection failed');
  }
});

router.get('/status', auth, async (req, res) => {
  try {
    const tokens = await googleCalendar.getTokens(req.user.id);
    res.json({ connected: Boolean(tokens) });
  } catch (error) {
    console.error('[Calendar] status error:', error.message);
    res.status(500).json({ message: 'Failed to check calendar status' });
  }
});

router.get('/events', auth, async (req, res) => {
  try {
    const events = await googleCalendar.fetchEvents(req.user.id);
    res.json({ events });
  } catch (error) {
    console.error('[Calendar] events error:', error.message);
    res.status(500).json({ message: 'Failed to load calendar events' });
  }
});

module.exports = router;
