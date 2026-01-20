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

module.exports = router;
