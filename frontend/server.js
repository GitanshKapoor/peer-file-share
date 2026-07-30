/**
 * PFS - Express Server (Azure App Service)
 *
 * Responsibilities:
 *  1. Serve the static frontend from /public
 *  2. Proxy /api/* requests to Azure Function App (keeps Function URL private)
 *  3. Expose /health for blue-green deployment slot swap validation
 *
 * Environment variables:
 *  PORT              - App Service sets this automatically (default: 8080)
 *  AZURE_FUNCTION_URL - Full base URL of the Function App (e.g. https://pfs-func.azurewebsites.net)
 *  FUNCTION_KEY      - Function App host key (stored as slot-sticky App Setting)
 *  APP_VERSION       - Injected by CI/CD for health check response
 */

const express = require('express');
const path = require('path');
const { createProxyMiddleware } = require('http-proxy-middleware');
const helmet = require('helmet');

const server = express();

// Security Headers
server.use(
  helmet({
    contentSecurityPolicy: false, // CSP can break the frontend without proper config, disable for now
  })
);
const PORT = process.env.PORT || 8080;
const FUNCTION_URL = process.env.AZURE_FUNCTION_URL;
const FUNCTION_KEY = process.env.FUNCTION_KEY;

// Health Check
// Used by CI/CD pipeline to validate staging slot before blue-green swap
server.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'pfs-frontend',
    version: process.env.APP_VERSION || '1.0.0',
    environment: process.env.ENVIRONMENT || 'development',
    timestamp: new Date().toISOString(),
  });
});

// API Proxy
// Forwards /api/* → Azure Function App
// Adds the function host key header so the Function can be protected
if (FUNCTION_URL) {
  server.use(
    '/api',
    createProxyMiddleware({
      target: FUNCTION_URL,
      changeOrigin: true,
      pathRewrite: (path, req) => req.originalUrl,
      on: {
        proxyReq: (proxyReq) => {
          if (FUNCTION_KEY) {
            proxyReq.setHeader('x-functions-key', FUNCTION_KEY);
          }
        },
        error: (err, req, res) => {
          console.error('Proxy error:', err.message);
          res.status(502).json({ error: 'API unavailable', details: err.message });
        },
      },
    })
  );
} else {
  console.warn('AZURE_FUNCTION_URL not set. API proxy disabled.');
}

// Shared Link Route
// Serves the frontend SPA which will handle fetching metadata and rendering the preview
server.get('/d/:fileId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Static Frontend
server.use(express.static(path.join(__dirname, 'public')));

// SPA fallback
server.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start
server.listen(PORT, () => {
  console.log(`PFS frontend running on http://localhost:${PORT}`);
  console.log(`   API proxy → ${FUNCTION_URL || '(disabled — set AZURE_FUNCTION_URL)'}`);
  console.log(`   Environment: ${process.env.ENVIRONMENT || 'development'}`);
});
