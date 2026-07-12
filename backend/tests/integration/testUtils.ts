import { prisma } from '../../src/models/prismaClient';
import { ensureBucket } from '../../src/storage/minio';
import { ensureCollection } from '../../src/storage/qdrant';
import { startPipelineRouterConsumers } from '../../src/services/pipelineRouter';

let started = false;

export async function ensureTestInfra(): Promise<void> {
  await ensureBucket();
  await ensureCollection();
  if (!started) {
    await startPipelineRouterConsumers();
    started = true;
  }
}

export async function resetDatabase(): Promise<void> {
  await prisma.artifact.deleteMany();
  await prisma.resource.deleteMany();
  await prisma.pipelineStep.deleteMany();
  await prisma.pipeline.deleteMany();
  await prisma.plugin.deleteMany();
}

export async function createTestPlugin(overrides: Partial<{ name: string; isActive: boolean }> = {}) {
  return prisma.plugin.create({
    data: {
      name: overrides.name ?? 'Test Plugin',
      description: 'A plugin used in integration tests',
      author: 'Test Suite',
      version: '1.0.0',
      isActive: overrides.isActive ?? true,
    },
  });
}

export async function createTestPipeline(
  triggerType: 'PDF' | 'GITHUB_REPO' | 'CSV' | 'AUDIO' | 'MARKDOWN',
  steps: { pluginId: string; maxAttempts?: number; backoffSeconds?: number; timeoutSeconds?: number }[],
) {
  return prisma.pipeline.create({
    data: {
      name: `Test Pipeline ${triggerType}`,
      triggerType,
      steps: {
        create: steps.map((s, i) => ({
          position: i,
          pluginId: s.pluginId,
          maxAttempts: s.maxAttempts ?? 1,
          backoffSeconds: s.backoffSeconds ?? 0,
          timeoutSeconds: s.timeoutSeconds ?? 300,
        })),
      },
    },
    include: { steps: true },
  });
}

export function waitFor<T>(
  check: () => T | null | undefined | false | Promise<T | null | undefined | false>,
  timeoutMs = 8000,
  intervalMs = 150,
): Promise<T> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const result = await Promise.resolve(check());
        if (result) {
          resolve(result);
          return;
        }
      } catch {
        // keep polling
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error('waitFor timed out'));
        return;
      }
      setTimeout(tick, intervalMs);
    };
    tick();
  });
}
