const { createProxyMiddleware } = require('http-proxy-middleware');

const target = process.env.TENAX_BACKEND_URL || 'http://localhost:4000';
console.log('[CRA proxy] forwarding /api to', target);

module.exports = function setupProxy(app) {
  app.use(
    '/api',
    createProxyMiddleware({
      target,
      changeOrigin: true,
      secure: false,
      ws: false,
      logLevel: 'warn'
    })
  );
};
