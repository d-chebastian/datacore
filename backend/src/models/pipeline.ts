import { Pipeline as PrismaPipeline, PipelineStep as PrismaStep, ResourceType } from '@prisma/client';
import { prisma } from './prismaClient';

export type PipelineWithSteps = PrismaPipeline & { steps: PrismaStep[] };

export interface StepInput {
  position?: number;
  plugin_id: string;
  max_attempts?: number;
  backoff_seconds?: number;
  timeout_seconds?: number;
}

function toStepDto(s: PrismaStep) {
  return {
    id: s.id,
    position: s.position,
    plugin_id: s.pluginId,
    max_attempts: s.maxAttempts,
    backoff_seconds: s.backoffSeconds,
    timeout_seconds: s.timeoutSeconds,
  };
}

export function toPipelineDto(p: PipelineWithSteps) {
  return {
    id: p.id,
    name: p.name,
    trigger_type: p.triggerType,
    steps: p.steps.sort((a, b) => a.position - b.position).map(toStepDto),
    created_at: p.createdAt.toISOString(),
    updated_at: p.updatedAt.toISOString(),
  };
}

export async function listPipelines(): Promise<PipelineWithSteps[]> {
  return prisma.pipeline.findMany({ include: { steps: true }, orderBy: { createdAt: 'asc' } });
}

export async function findPipelineByTriggerType(triggerType: ResourceType): Promise<PipelineWithSteps | null> {
  return prisma.pipeline.findUnique({ where: { triggerType }, include: { steps: true } });
}

export async function findPipelineById(id: string): Promise<PipelineWithSteps | null> {
  return prisma.pipeline.findUnique({ where: { id }, include: { steps: true } });
}

export async function createPipeline(
  name: string,
  triggerType: ResourceType,
  steps: StepInput[],
): Promise<PipelineWithSteps> {
  return prisma.pipeline.create({
    data: {
      name,
      triggerType,
      steps: {
        create: steps.map((s, index) => ({
          position: s.position ?? index,
          pluginId: s.plugin_id,
          maxAttempts: s.max_attempts ?? 1,
          backoffSeconds: s.backoff_seconds ?? 0,
          timeoutSeconds: s.timeout_seconds ?? 300,
        })),
      },
    },
    include: { steps: true },
  });
}

export async function updatePipelineSteps(
  id: string,
  name: string | undefined,
  steps: StepInput[],
): Promise<PipelineWithSteps> {
  return prisma.$transaction(async (tx) => {
    await tx.pipelineStep.deleteMany({ where: { pipelineId: id } });
    return tx.pipeline.update({
      where: { id },
      data: {
        ...(name ? { name } : {}),
        steps: {
          create: steps.map((s, index) => ({
            position: s.position ?? index,
            pluginId: s.plugin_id,
            maxAttempts: s.max_attempts ?? 1,
            backoffSeconds: s.backoff_seconds ?? 0,
            timeoutSeconds: s.timeout_seconds ?? 300,
          })),
        },
      },
      include: { steps: true },
    });
  });
}

export async function deletePipeline(id: string): Promise<void> {
  await prisma.pipeline.delete({ where: { id } });
}
