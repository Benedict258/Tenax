const jwt = require('jsonwebtoken');
const User = require('../models/User');

const isUpstreamError = (error) => {
  const message = String(error?.message || '').toLowerCase();
  const code = error?.code || error?.cause?.code;
  return message.includes('fetch failed') || message.includes('timeout') || code === 'UND_ERR_CONNECT_TIMEOUT';
};

const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'Access denied. No token provided.' });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid token. User not found.' });
    }
    
    req.user = user;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    if (isUpstreamError(error)) {
      return res.status(503).json({ error: 'Auth service unavailable. Try again shortly.' });
    }
    return res.status(401).json({ error: 'Invalid token.' });
  }
};

module.exports = auth;
