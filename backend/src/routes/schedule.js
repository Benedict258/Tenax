const express = require('express');
const multer = require('multer');
const scheduleService = require('../services/scheduleService');
const scheduleQueues = require('../services/scheduleQueues');
const features = require('../config/features');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const router = express.Router();

router.use((req, res, next) => {
  if (!features.scheduleIntelEnabled) {
    return res.status(503).json({ message: 'Schedule intelligence not enabled' });
  }
  return next();
});

router.post('/upload', upload.single('timetable'), async (req, res) => {
  try {
    if (!req.body.user_id) {
      return res.status(400).json({ message: 'user_id is required' });
    }
    if (!req.file) {
      return res.status(400).json({ message: 'timetable file is required' });
    }

    const uploadRecord = await scheduleService.ingestUpload({
      userId: req.body.user_id,
      source: req.body.source || 'upload',
      file: req.file
    });

    await scheduleQueues.enqueueUploadJob({
      uploadId: uploadRecord.id,
      userId: req.body.user_id
    });

    return res.status(202).json({
      upload_id: uploadRecord.id,
      status: 'queued'
    });
  } catch (error) {
    console.error('[Schedule] upload error:', error.message);
    return res.status(500).json({ message: 'Failed to queue timetable', error: error.message });
  }
});

router.get('/availability/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { date } = req.query;
    const availability = await scheduleService.getAvailability(userId, date ? new Date(date) : new Date());
    return res.json(availability);
  } catch (error) {
    console.error('[Schedule] availability error:', error.message);
    return res.status(500).json({ message: 'Failed to compute availability' });
  }
});

router.get('/extractions/:userId', async (req, res) => {
  try {
    const rows = await scheduleService.listExtractionRows(req.params.userId);
    return res.json({ rows });
  } catch (error) {
    console.error('[Schedule] list extractions error:', error.message);
    const status = error.statusCode || 500;
    return res.status(status).json({ message: 'Failed to load timetable rows', error: error.message });
  }
});

router.post('/extractions/:userId', async (req, res) => {
  try {
    const row = await scheduleService.createManualExtractionRow(req.params.userId, req.body || {});
    return res.status(201).json({ row });
  } catch (error) {
    console.error('[Schedule] create extraction error:', error.message);
    const status = error.statusCode || 500;
    return res.status(status).json({ message: 'Failed to create timetable row', error: error.message });
  }
});

router.patch('/extractions/row/:rowId', async (req, res) => {
  try {
    const row = await scheduleService.updateExtractionRow(req.params.rowId, req.body || {});
    return res.json({ row });
  } catch (error) {
    console.error('[Schedule] update extraction error:', error.message);
    const status = error.statusCode || 500;
    return res.status(status).json({ message: 'Failed to update timetable row', error: error.message });
  }
});

router.delete('/extractions/row/:rowId', async (req, res) => {
  try {
    await scheduleService.deleteExtractionRow(req.params.rowId);
    return res.status(204).send();
  } catch (error) {
    console.error('[Schedule] delete extraction error:', error.message);
    const status = error.statusCode || 500;
    return res.status(status).json({ message: 'Failed to delete timetable row', error: error.message });
  }
});

router.get('/uploads/:userId/latest', async (req, res) => {
  try {
    const upload = await scheduleService.getLatestUploadForUser(req.params.userId);
    return res.json({ upload });
  } catch (error) {
    console.error('[Schedule] latest upload error:', error.message);
    const status = error.statusCode || 500;
    return res.status(status).json({ message: 'Failed to fetch latest upload', error: error.message });
  }
});

router.get('/coverage/:userId', async (req, res) => {
  try {
    const coverage = await scheduleService.getScheduleCoverage(req.params.userId, req.query.date);
    return res.json({ coverage });
  } catch (error) {
    console.error('[Schedule] coverage error:', error.message);
    const status = error.statusCode || 500;
    return res.status(status).json({ message: 'Failed to compute coverage', error: error.message });
  }
});

module.exports = router;
