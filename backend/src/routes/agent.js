const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const UserChannel = require('../models/UserChannel');
const agentPipeline = require('../services/agentPipeline');

const router = express.Router();

const isUpstreamError = (error) => {
  const message = String(error?.message || '').toLowerCase();
  const code = error?.code || error?.cause?.code;
  return message.includes('fetch failed') || message.includes('timeout') || code === 'UND_ERR_CONNECT_TIMEOUT';
};

async function optionalAuth(req, _res, next) {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) {
    return next();
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    if (user) {
      req.user = user;
    }
  } catch (error) {
    console.warn('Optional auth skipped:', error.message);
    if (isUpstreamError(error)) {
      req.authError = error;
    }
  }

  next();
}

router.post('/message', optionalAuth, async (req, res) => {
  try {
    const { channel = 'web', text, external_id: externalId, timestamp, metadata = {} } = req.body;
    if (!text) {
      return res.status(400).json({ error: 'Message text is required' });
    }

    let sessionUser = null;
    if (channel === 'web') {
      if (req.authError) {
        return res.status(503).json({ error: 'Auth service unavailable. Try again shortly.' });
      }
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required for web channel' });
      }
      sessionUser = req.user;
    } else if (channel === 'whatsapp') {
      if (!externalId) {
        return res.status(400).json({ error: 'external_id required for WhatsApp channel' });
      }
      sessionUser = await UserChannel.findUserByChannel('whatsapp', externalId);
      if (!sessionUser) {
        return res.status(404).json({ error: 'User not found for supplied identity' });
      }
    } else {
      return res.status(400).json({ error: 'Unsupported channel' });
    }

    const result = await agentPipeline.handleMessage({
      user: sessionUser,
      channel,
      text,
      externalId,
      metadata: { ...metadata, timestamp },
      raw: req.body
    });

    res.json(result);
  } catch (error) {
    console.error('Agent message error:', error);
    res.status(500).json({ error: 'Failed to process message' });
  }
});

router.get('/conversations/active', optionalAuth, async (req, res) => {
  try {
    if (req.authError) {
      return res.status(503).json({ error: 'Auth service unavailable. Try again shortly.' });
    }
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const limit = Number(req.query.limit) || 40;
    const { conversation, messages } = await agentPipeline.getRecentMessages(req.user.id, limit);
    res.json({ conversation, messages });
  } catch (error) {
    console.error('Conversation fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch conversation' });
  }
});

module.exports = router;
