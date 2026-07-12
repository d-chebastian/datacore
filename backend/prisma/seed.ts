import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const summarizer = await prisma.plugin.upsert({
    where: { id: 'markdown-summarizer' },
    update: {},
    create: {
      id: 'markdown-summarizer',
      name: 'Markdown Summarizer',
      description: 'Summarizes Markdown resources into a queryable Summary artifact.',
      author: 'Core Team',
      version: '1.0.0',
      isActive: true,
    },
  });

  const embedder = await prisma.plugin.upsert({
    where: { id: 'vector-embedder' },
    update: {},
    create: {
      id: 'vector-embedder',
      name: 'Vector Embedder',
      description: 'Embeds resource content and pushes it into the Qdrant vector store.',
      author: 'Core Team',
      version: '1.0.0',
      isActive: true,
    },
  });

  const profileScanner = await prisma.plugin.upsert({
    where: { id: 'github-profile-scanner' },
    update: {},
    create: {
      id: 'github-profile-scanner',
      name: 'GitHub Profile Scanner',
      description:
        'Given a GitHub profile or repo URL, scans all of the owner\'s public repositories and produces an ' +
        'aggregated analysis artifact (name, description, language, stars, forks per repo).',
      author: 'Core Team',
      version: '1.0.0',
      isActive: true,
    },
  });

  const existingMarkdown = await prisma.pipeline.findUnique({ where: { triggerType: 'MARKDOWN' } });
  if (!existingMarkdown) {
    await prisma.pipeline.create({
      data: {
        name: 'Standard Markdown Ingestion',
        triggerType: 'MARKDOWN',
        steps: {
          create: [
            { position: 0, pluginId: summarizer.id, maxAttempts: 3, backoffSeconds: 5, timeoutSeconds: 300 },
            { position: 1, pluginId: embedder.id, maxAttempts: 3, backoffSeconds: 5, timeoutSeconds: 300 },
          ],
        },
      },
    });
  }

  const existingGithub = await prisma.pipeline.findUnique({ where: { triggerType: 'GITHUB_REPO' } });
  if (!existingGithub) {
    await prisma.pipeline.create({
      data: {
        name: 'GitHub Profile Analysis',
        triggerType: 'GITHUB_REPO',
        steps: {
          create: [
            { position: 0, pluginId: profileScanner.id, maxAttempts: 3, backoffSeconds: 10, timeoutSeconds: 300 },
          ],
        },
      },
    });
  }

  // eslint-disable-next-line no-console
  console.log(
    'Seed complete: 3 plugins + 2 pipelines (Markdown Summarizer -> Vector Embedder for MARKDOWN; ' +
      'GitHub Profile Scanner for GITHUB_REPO).',
  );
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
