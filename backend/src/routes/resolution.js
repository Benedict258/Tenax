const express = require('express');
const auth = require('../middleware/auth');
const resolutionService = require('../services/resolutionService');

const router = express.Router();

router.get('/active', auth, async (req, res) => {
  try {
    const data = await resolutionService.getActivePlanWithDetails(req.user.id);
    if (!data) {
      return res.status(404).json({ error: 'No active resolution plan found.' });
    }
    return res.json(data);
  } catch (error) {
    console.error('[Resolution] active error:', error);
    return res.status(500).json({ error: 'Failed to fetch resolution plan.' });
  }
});

router.get('/plan/:id', auth, async (req, res) => {
  try {
    const data = await resolutionService.getPlanDetails(req.params.id, req.user.id);
    return res.json(data);
  } catch (error) {
    console.error('[Resolution] plan error:', error);
    const status = error.status || 500;
    return res.status(status).json({ error: error.message || 'Failed to fetch resolution plan.' });
  }
});

router.get('/plan/:id/tasks', auth, async (req, res) => {
  try {
    const { start, end } = req.query;
    const data = await resolutionService.listTasksForPlan(req.params.id, req.user.id, start, end);
    return res.json(data);
  } catch (error) {
    console.error('[Resolution] plan tasks error:', error);
    const status = error.status || 500;
    return res.status(status).json({ error: error.message || 'Failed to fetch resolution tasks.' });
  }
});

router.get('/tasks', auth, async (req, res) => {
  try {
    const { start, end } = req.query;
    const data = await resolutionService.listTasksForUser(req.user.id, start, end);
    return res.json(data);
  } catch (error) {
    console.error('[Resolution] tasks error:', error);
    return res.status(500).json({ error: 'Failed to fetch resolution tasks.' });
  }
});

router.post('/tasks/:id/complete', auth, async (req, res) => {
  try {
    const result = await resolutionService.completeResolutionTask(req.params.id, req.user.id);
    return res.json(result);
  } catch (error) {
    console.error('[Resolution] task complete error:', error);
    const status = error.status || 500;
    return res.status(status).json({ error: error.message || 'Failed to complete task.' });
  }
});

router.post('/phases/:id/complete', auth, async (req, res) => {
  try {
    const result = await resolutionService.confirmPhaseCompletion(req.params.id, req.user.id);
    return res.json(result);
  } catch (error) {
    console.error('[Resolution] phase complete error:', error);
    const status = error.status || 500;
    return res.status(status).json({ error: error.message || 'Failed to complete phase.' });
  }
});

router.post('/plan/:id/assets', auth, async (req, res) => {
  try {
    const { kind, dataUrl, filename } = req.body || {};
    const result = await resolutionService.uploadPlanAsset({
      planId: req.params.id,
      userId: req.user.id,
      kind,
      dataUrl,
      filename
    });
    return res.json(result);
  } catch (error) {
    console.error('[Resolution] asset upload error:', error);
    const status = error.status || 500;
    return res.status(status).json({ error: error.message || 'Failed to upload asset.' });
  }
});

module.exports = router;
