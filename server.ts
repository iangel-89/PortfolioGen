/**
 * Server bootstrap.
 *
 * Serves the React client (through Vite in development, from dist in production)
 * and mounts the API. Everything else lives under server/.
 */

import 'dotenv/config';
import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { createApiRouter } from './server/api';
import { isConfigured } from './server/llm/client';

const PORT = Number(process.env.PORT ?? 3000);

async function startServer() {
  const app = express();

  app.use(express.json({ limit: '2mb' }));
  app.use('/api', createApiRouter());

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`PortfolioGen running on http://localhost:${PORT}`);
    if (!isConfigured()) {
      console.warn(
        'Warning: GEMINI_API_KEY is not set. The interface will load, but nothing can be generated. ' +
          'Copy .env.example to .env and add your key.',
      );
    }
  });
}

startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
