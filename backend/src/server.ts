import { createApp } from './app';
import { startPipelineRouterConsumers } from './services/pipelineRouter';
import { ensureBucket } from './storage/minio';
import { ensureCollection } from './storage/qdrant';
import { logger } from './logging';

async function main() {
  await ensureBucket().catch((err) => logger.warn('could not ensure MinIO bucket', { error: String(err) }));
  await ensureCollection().catch((err) => logger.warn('could not ensure Qdrant collection', { error: String(err) }));
  await startPipelineRouterConsumers();

  const app = createApp();
  const port = Number(process.env.PORT) || 3000;
  app.listen(port, () => {
    logger.info(`DataCore Core Warehouse listening on port ${port}`);
  });
}

main().catch((err) => {
  logger.error('Fatal startup error', { error: String(err) });
  process.exit(1);
});
