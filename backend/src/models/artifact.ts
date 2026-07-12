import { ArtifactType } from '@prisma/client';
import { prisma } from './prismaClient';

export async function upsertArtifact(
  resourceId: string,
  type: ArtifactType,
  producingPluginId: string,
  externalRef: string,
) {
  return prisma.artifact.upsert({
    where: { resourceId_type: { resourceId, type } },
    create: { resourceId, type, producingPluginId, externalRef },
    update: { producingPluginId, externalRef },
  });
}

export async function listArtifactsForResource(resourceId: string) {
  return prisma.artifact.findMany({ where: { resourceId } });
}

export async function findArtifactById(resourceId: string, artifactId: string) {
  return prisma.artifact.findFirst({ where: { id: artifactId, resourceId } });
}
