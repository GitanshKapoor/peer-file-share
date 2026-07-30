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

const server = express();
const PORT = process.env.PORT || 8080;
const FUNCTION_URL = process.env.AZURE_FUNCTION_URL;
const FUNCTION_KEY = process.env.FUNCTION_KEY;

// ─── Health Check ────────────────────────────────────────────────────────────
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

// ─── API Proxy ────────────────────────────────────────────────────────────────
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
  console.warn('⚠️  AZURE_FUNCTION_URL not set — API proxy disabled. Set it to the Function App URL.');
}

// ─── Download Redirect (Masked Link) ──────────────────────────────────────────
// Masks the Azure Blob URL (e.g. /d/<uuid>) and redirects to the raw SAS URL
server.get('/d/:fileId', async (req, res) => {
  if (!FUNCTION_URL) return res.status(500).send('API URL not configured');
  try {
    const apiRes = await fetch(`${FUNCTION_URL}/api/getFileList`);
    if (!apiRes.ok) throw new Error('Backend API failed to respond');
    
    const data = await apiRes.json();
    const file = data.files?.find(f => f.blobName === req.params.fileId);
    
    if (file && file.shareUrl) {
      // 302 Redirect causes browser to navigate to Blob URL (which forces download via Content-Disposition)
      res.redirect(302, file.shareUrl);
    } else {
      res.status(404).send('File not found or link has expired.');
    }
  } catch (err) {
    console.error('Download redirect error:', err);
    res.status(500).send('Internal Server Error');
  }
});

// ─── Static Frontend ──────────────────────────────────────────────────────────
server.use(express.static(path.join(__dirname, 'public')));

// SPA fallback
server.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Start ────────────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`🚀 PFS frontend running on http://localhost:${PORT}`);
  console.log(`   API proxy → ${FUNCTION_URL || '(disabled — set AZURE_FUNCTION_URL)'}`);
  console.log(`   Environment: ${process.env.ENVIRONMENT || 'development'}`);
});
