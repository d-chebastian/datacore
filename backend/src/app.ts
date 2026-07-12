import express from 'express';
import { resourcesRouter } from './routes/resources';
import { pipelinesRouter } from './routes/pipelines';
import { pluginsRouter } from './routes/plugins';
import { internalArtifactsRouter } from './routes/internalArtifacts';
import { errorHandler } from './middleware/errorHandler';

export function createApp() {
  const app = express();
  app.use(express.json());

  app.use('/api/v1/resources', resourcesRouter);
  app.use('/api/v1/pipelines', pipelinesRouter);
  app.use('/api/v1/plugins', pluginsRouter);
  app.use('/api/v1/internal/artifacts', internalArtifactsRouter);

  app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

  app.use(errorHandler);
  return app;
}
