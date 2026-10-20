import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import ejs from 'ejs';
import express from 'express';
import { boardRouter } from './routes/boardRoutes.js';
import { instanceRouter } from './routes/instanceRoutes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 5541;
const HOST = process.env.HOST || '0.0.0.0';

// Middlewares
app.use(cors());
app.use(express.json());

// UI static paths
// In development or build, find packages/ui/dist
const uiDistPath = path.resolve(__dirname, '../../ui/dist');
app.use('/static', express.static(path.join(uiDistPath, 'static')));

// Docs static path: serve root docs/
const docsPath = path.resolve(__dirname, '../../../docs');
app.use('/docs', express.static(docsPath));
app.get('/docs', (_req, res) => {
  res.sendFile(path.join(docsPath, 'index.html'));
});

// Set EJS view engine
app.engine('ejs', ejs.renderFile);
app.set('views', uiDistPath);
app.set('view engine', 'ejs');

// API Routes
app.use('/api/instances', instanceRouter);
app.use('/api/instances', boardRouter);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Single Page App Fallback: Serve UI for all other routes
app.use((_req, res) => {
  res.render('index', {
    basePath: '/',
    title: 'Bull Board • Redis Insight',
    favIconDefault: '/static/images/logo.svg',
    favIconAlternative: '/static/favicon-32x32.png',
    uiConfig: JSON.stringify({
      boardTitle: 'Bull Board',
      boardLogo: {
        path: '/static/images/logo.svg',
        width: 32,
        height: 32,
      },
    }),
  });
});

app.listen(PORT, HOST, () => {
  console.warn(`====================================================`);
  console.warn(`🚀 Bull Board Standalone (Redis-Insight Edition)`);
  console.warn(`📡 Server running at http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  console.warn(`📁 UI Assets: ${uiDistPath}`);
  console.warn(`====================================================`);
});

export default app;
