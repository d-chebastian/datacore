import { ArtifactType } from '@prisma/client';
import { prisma } from '../models/prismaClient';
import { findPipelineByTriggerType, PipelineWithSteps, StepInput } from '../models/pipeline';
import { findPendingResourcesForType, findResourceById, StepSnapshotEntry } from '../models/resource';
import { findPluginById } from '../models/plugin';
import { upsertArtifact, listArtifactsForResource } from '../models/artifact';
import { consume, publishEvent, RoutingKeys } from '../broker/broker';
import { logger } from '../logging';

const RESOURCE_CREATED_QUEUE = 'core.pipeline-router.resource-created';
const TIMEOUT_SWEEP_INTERVAL_MS = 15_000;

function snapshotFromPipeline(pipeline: PipelineWithSteps): StepSnapshotEntry[] {
  return pipeline.steps
    .sort((a, b) => a.position - b.position)
    .map((s) => ({
      plugin_id: s.pluginId,
      max_attempts: s.maxAttempts,
      backoff_seconds: s.backoffSeconds,
      timeout_seconds: s.timeoutSeconds,
    }));
}

/** Assigns a matching pipeline to a resource and publishes RESOURCE_CREATED, or leaves it PENDING (FR-003a). */
export async function assignPipelineAndDispatch(resourceId: string, resourceType: string): Promise<void> {
  const pipeline = await findPipelineByTriggerType(resourceType as never);
  if (!pipeline) return; // stays PENDING with no pipeline_id (FR-003a)

  const resource = await prisma.resource.update({
    where: { id: resourceId },
    data: { pipelineId: pipeline.id },
  });

  await publishEvent(RoutingKeys.RESOURCE_CREATED, 'RESOURCE_CREATED', resourceId, {
    type: resourceType,
    pipeline_id: pipeline.id,
    source_uri: resource.sourceUri,
  });
}

/** FR-003a: when a pipeline is created/updated, pick up any PENDING resources of that type with no pipeline yet. */
export async function pickUpPendingResourcesForPipeline(triggerType: string): Promise<void> {
  const pending = await findPendingResourcesForType(triggerType as never);
  for (const resource of pending) {
    await assignPipelineAndDispatch(resource.id, resource.type);
  }
}

async function handleResourceCreated(payload: { pipeline_id: string; source_uri: string }, resourceId: string) {
  const pipeline = await prisma.pipeline.findUnique({ where: { id: payload.pipeline_id }, include: { steps: true } });
  if (!pipeline) return;
  const snapshot = snapshotFromPipeline(pipeline);
  await prisma.resource.update({
    where: { id: resourceId },
    data: {
      status: 'PROCESSING',
      stepSnapshot: snapshot as never,
      currentStepIndex: 0,
      attemptCount: 0,
    },
  });
  await dispatchStep(resourceId, 0);
}

export async function startPipelineRouterConsumers(): Promise<void> {
  await consume(RESOURCE_CREATED_QUEUE, RoutingKeys.RESOURCE_CREATED, async (msg) => {
    await handleResourceCreated(msg.payload as { pipeline_id: string; source_uri: string }, msg.resource_id);
  });
  setInterval(() => {
    sweepTimedOutSteps().catch((err) => {
      // eslint-disable-next-line no-console
      console.error('Timeout sweep failed:', err);
    });
  }, TIMEOUT_SWEEP_INTERVAL_MS);
}

/** Dispatches the given step index for a resource, guarding against inactive plugins (FR-020/FR-021). */
export async function dispatchStep(resourceId: string, stepIndex: number): Promise<void> {
  const resource = await findResourceById(resourceId);
  if (!resource || !resource.stepSnapshot) return;
  const snapshot = resource.stepSnapshot as unknown as StepSnapshotEntry[];
  const step = snapshot[stepIndex];
  if (!step) return;

  const plugin = await findPluginById(step.plugin_id);
  if (!plugin || !plugin.isActive) {
    await handleStepFailure(resourceId, stepIndex, 'plugin inactive');
    return;
  }

  await prisma.resource.update({
    where: { id: resourceId },
    data: { currentStepDispatchedAt: new Date() },
  });

  const upstreamArtifacts = await listArtifactsForResource(resourceId);
  logger.info('dispatching pipeline step', { resourceId, stepIndex, pluginId: step.plugin_id });
  await publishEvent(RoutingKeys.stepDispatched(step.plugin_id), 'PIPELINE_STEP_DISPATCHED', resourceId, {
    pipeline_id: resource.pipelineId,
    step_position: stepIndex,
    plugin_id: step.plugin_id,
    attempt_count: resource.attemptCount,
    source_uri: resource.sourceUri,
    upstream_artifacts: upstreamArtifacts,
  });
}

/** Handles a successful artifact callback (FR-003, FR-006a, FR-023, Principle I). */
export async function handleStepSuccess(
  resourceId: string,
  stepPosition: number,
  pluginId: string,
  artifact: { type: ArtifactType; external_ref: string },
): Promise<void> {
  await upsertArtifact(resourceId, artifact.type, pluginId, artifact.external_ref);
  logger.info('artifact callback succeeded', { resourceId, stepPosition, pluginId, artifactType: artifact.type });
  await publishEvent(RoutingKeys.ARTIFACT_GENERATED, 'ARTIFACT_GENERATED', resourceId, {
    artifact_type: artifact.type,
    external_ref: artifact.external_ref,
    producing_plugin_id: pluginId,
  });

  const resource = await findResourceById(resourceId);
  if (!resource || !resource.stepSnapshot) return;
  const snapshot = resource.stepSnapshot as unknown as StepSnapshotEntry[];
  const nextIndex = stepPosition + 1;

  if (nextIndex >= snapshot.length) {
    await prisma.resource.update({
      where: { id: resourceId },
      data: { status: 'COMPLETED', currentStepIndex: nextIndex, attemptCount: 0 },
    });
    await publishEvent(RoutingKeys.PIPELINE_STEP_COMPLETED, 'PIPELINE_STEP_COMPLETED', resourceId, {
      step_position: stepPosition,
      next_step_position: null,
    });
    return;
  }

  await prisma.resource.update({
    where: { id: resourceId },
    data: { currentStepIndex: nextIndex, attemptCount: 0 },
  });
  await publishEvent(RoutingKeys.PIPELINE_STEP_COMPLETED, 'PIPELINE_STEP_COMPLETED', resourceId, {
    step_position: stepPosition,
    next_step_position: nextIndex,
  });
  await dispatchStep(resourceId, nextIndex);
}

/** Handles a failed attempt (explicit failure, inactive plugin, or timeout) per FR-016a/b/c. */
export async function handleStepFailure(resourceId: string, stepIndex: number, error: string): Promise<void> {
  const resource = await findResourceById(resourceId);
  if (!resource || !resource.stepSnapshot) return;
  const snapshot = resource.stepSnapshot as unknown as StepSnapshotEntry[];
  const step = snapshot[stepIndex];
  if (!step) return;

  const attemptCount = resource.attemptCount + 1;
  logger.warn('pipeline step attempt failed', { resourceId, stepIndex, attemptCount, error });

  if (attemptCount < step.max_attempts) {
    await prisma.resource.update({ where: { id: resourceId }, data: { attemptCount } });
    if (step.backoff_seconds > 0) {
      setTimeout(() => {
        dispatchStep(resourceId, stepIndex).catch((err) => {
          // eslint-disable-next-line no-console
          console.error('Retry dispatch failed:', err);
        });
      }, step.backoff_seconds * 1000);
    } else {
      await dispatchStep(resourceId, stepIndex);
    }
    return;
  }

  await prisma.resource.update({
    where: { id: resourceId },
    data: { status: 'FAILED', failureReason: error, attemptCount },
  });
  logger.error('resource marked FAILED — retries exhausted', { resourceId, stepIndex, error });
  await publishEvent(RoutingKeys.RESOURCE_FAILED, 'RESOURCE_FAILED', resourceId, {
    step_position: stepIndex,
    plugin_id: step.plugin_id,
    error,
  });
}

/** FR-016c: periodic scan for steps whose plugin never called back within timeout_seconds. */
export async function sweepTimedOutSteps(): Promise<void> {
  const processing = await prisma.resource.findMany({ where: { status: 'PROCESSING' } });
  const now = Date.now();
  for (const resource of processing) {
    if (!resource.stepSnapshot || resource.currentStepIndex === null || !resource.currentStepDispatchedAt) continue;
    const snapshot = resource.stepSnapshot as unknown as StepSnapshotEntry[];
    const step = snapshot[resource.currentStepIndex];
    if (!step) continue;
    const deadline = resource.currentStepDispatchedAt.getTime() + step.timeout_seconds * 1000;
    if (now > deadline) {
      logger.warn('timeout sweep detected non-responding step', {
        resourceId: resource.id,
        stepIndex: resource.currentStepIndex,
      });
      await handleStepFailure(resource.id, resource.currentStepIndex, 'step timed out');
    }
  }
}

export type { StepInput };
