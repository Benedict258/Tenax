const jwt = require('jsonwebtoken');

const adminAuth = (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'Admin token required.' });
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded?.admin) {
      return res.status(403).json({ error: 'Admin access denied.' });
    }
    req.admin = decoded;
    return next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid admin token.' });
  }
};

module.exports = adminAuth;
