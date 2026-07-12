import { Prisma, Resource as PrismaResource, Artifact as PrismaArtifact } from '@prisma/client';
import { prisma } from './prismaClient';

export type ResourceWithArtifacts = PrismaResource & { artifacts: PrismaArtifact[] };

export interface StepSnapshotEntry {
  plugin_id: string;
  max_attempts: number;
  backoff_seconds: number;
  timeout_seconds: number;
}

function toArtifactDto(a: PrismaArtifact) {
  return {
    id: a.id,
    type: a.type,
    producing_plugin_id: a.producingPluginId,
    external_ref: a.externalRef,
    created_at: a.createdAt.toISOString(),
    updated_at: a.updatedAt.toISOString(),
  };
}

export function toResourceDto(r: ResourceWithArtifacts) {
  return {
    id: r.id,
    name: r.name,
    type: r.type,
    status: r.status,
    is_enabled: r.isEnabled,
    source_type: r.sourceType,
    // Only a URL source is meaningful to expose for sharing/reprocessing elsewhere — an UPLOAD's
    // source_uri is an internal s3:// path into this instance's own MinIO, not fetchable by anyone else.
    source_uri: r.sourceType === 'URL' ? r.sourceUri : null,
    failure_reason: r.failureReason,
    no_matching_pipeline: r.status === 'PENDING' && r.pipelineId === null,
    artifacts: r.artifacts.map(toArtifactDto),
    created_at: r.createdAt.toISOString(),
    updated_at: r.updatedAt.toISOString(),
  };
}

export async function createResource(data: {
  name: string;
  type: PrismaResource['type'];
  sourceType: PrismaResource['sourceType'];
  sourceUri: string;
}): Promise<ResourceWithArtifacts> {
  return prisma.resource.create({ data, include: { artifacts: true } });
}

export async function listResources(q?: string): Promise<ResourceWithArtifacts[]> {
  return prisma.resource.findMany({
    where: q ? { name: { contains: q, mode: 'insensitive' } } : undefined,
    include: { artifacts: true },
    orderBy: { createdAt: 'desc' },
  });
}

export async function findResourceById(id: string): Promise<ResourceWithArtifacts | null> {
  return prisma.resource.findUnique({ where: { id }, include: { artifacts: true } });
}

export async function updateResource(
  id: string,
  data: Prisma.ResourceUpdateInput,
): Promise<ResourceWithArtifacts> {
  return prisma.resource.update({ where: { id }, data, include: { artifacts: true } });
}

export async function deleteResource(id: string): Promise<void> {
  await prisma.resource.delete({ where: { id } });
}

export async function toggleResourceEnabled(id: string): Promise<ResourceWithArtifacts> {
  const resource = await prisma.resource.findUniqueOrThrow({ where: { id } });
  return prisma.resource.update({
    where: { id },
    data: { isEnabled: !resource.isEnabled },
    include: { artifacts: true },
  });
}

export async function findPendingResourcesForType(triggerType: PrismaResource['type']) {
  return prisma.resource.findMany({
    where: { status: 'PENDING', pipelineId: null, type: triggerType },
  });
}
