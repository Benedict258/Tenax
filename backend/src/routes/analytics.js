const express = require('express');
const analyticsService = require('../services/analyticsService');

const router = express.Router();

router.get('/user/:userId/summary', async (req, res) => {
  try {
    const { userId } = req.params;
    const summary = await analyticsService.getUserSummary(userId);
    res.json(summary);
  } catch (error) {
    console.error('[Analytics] user summary error:', error.message);
    res.status(500).json({ error: 'Unable to load analytics summary' });
  }
});


router.get('/leaderboard', async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 10;
    const leaderboard = await analyticsService.getLeaderboard(limit);
    res.json({ leaderboard });
  } catch (error) {
    console.error('[Analytics] leaderboard error:', error.message);
    res.status(500).json({ error: 'Unable to load leaderboard' });
  }
});

router.get('/admin/overview', async (_req, res) => {
  try {
    const overview = await analyticsService.getAdminOverview();
    res.json(overview);
  } catch (error) {
    console.error('[Analytics] admin overview error:', error.message);
    res.status(500).json({ error: 'Unable to load analytics overview' });
  }
});

module.exports = router;
