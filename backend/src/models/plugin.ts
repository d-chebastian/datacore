import { Plugin as PrismaPlugin } from '@prisma/client';
import { prisma } from './prismaClient';

export function toPluginDto(p: PrismaPlugin) {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    author: p.author,
    version: p.version,
    is_active: p.isActive,
    created_at: p.createdAt.toISOString(),
    updated_at: p.updatedAt.toISOString(),
  };
}

export async function listPlugins(): Promise<PrismaPlugin[]> {
  return prisma.plugin.findMany({ orderBy: { createdAt: 'asc' } });
}

export async function findPluginById(id: string): Promise<PrismaPlugin | null> {
  return prisma.plugin.findUnique({ where: { id } });
}

export async function createPlugin(data: {
  name: string;
  description: string;
  author: string;
  version: string;
}): Promise<PrismaPlugin> {
  return prisma.plugin.create({ data });
}

export async function togglePlugin(id: string): Promise<PrismaPlugin> {
  const plugin = await prisma.plugin.findUniqueOrThrow({ where: { id } });
  return prisma.plugin.update({ where: { id }, data: { isActive: !plugin.isActive } });
}

export async function countPipelineStepsUsingPlugin(id: string): Promise<number> {
  return prisma.pipelineStep.count({ where: { pluginId: id } });
}

export async function deletePlugin(id: string): Promise<void> {
  await prisma.plugin.delete({ where: { id } });
}
