require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

// Import routes
const authRoutes = require('./routes/auth');
const taskRoutes = require('./routes/tasks');
const whatsappRoutes = require('./routes/whatsapp');
const agentRoutes = require('./routes/agent');
const scheduleRoutes = require('./routes/schedule');
const analyticsRoutes = require('./routes/analytics');
const resolutionRoutes = require('./routes/resolution');
const notificationRoutes = require('./routes/notifications');
const calendarRoutes = require('./routes/calendar');
const scheduleQueues = require('./services/scheduleQueues');
const optimizerJobs = require('./services/optimizerJobs');

const app = express();
app.set('etag', false);

// Middleware
app.use(helmet());
const parseOrigins = () => {
  const raw = process.env.CORS_ORIGINS || '';
  const extra = [process.env.APP_URL, process.env.FRONTEND_URL]
    .filter(Boolean);
  const merged = raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .concat(extra);
  return Array.from(new Set(merged));
};

const allowedOrigins = parseOrigins();
const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.length === 0) {
      return callback(null, true);
    }
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  optionsSuccessStatus: 204
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/agent', agentRoutes);
app.use('/api/schedule', scheduleRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/resolution', resolutionRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/calendar', calendarRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: 'Tenax Backend',
    version: '1.0.0'
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 Tenax Backend running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  scheduleQueues.initProcessors();
  optimizerJobs.init();
});

module.exports = app;
