import { createMarkdownResource, findResourceBySourceUri, getSummaryText, RepoAnalysis, Resource } from './coreApiClient.js';
import { waitForCompletion } from './pollResource.js';

const MAX_REPOS_TO_INGEST = 5;

export interface ReadmeIngestResult {
  summaries: Map<string, string>;
  // Every DataCore resource actually registered/reused along the way — kept so the minisite can show a
  // "DataCore Resources" tab of what really ran behind the scenes, not just the rendered output.
  resources: Resource[];
}

async function readmeExists(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Registers each of a profile's top (non-fork, by stars) repos' README as its own MARKDOWN resource in
 * DataCore, letting the real `markdown-summarizer` plugin produce a SUMMARY artifact from the actual
 * project write-up — this is what grounds the AI-written portfolio copy in real content instead of just a
 * one-line GitHub description field. Repos with no README.md on their default branch (or scanned before
 * `default_branch` was captured) are skipped, not fatal — the portfolio still renders fine for them using
 * just their raw metadata.
 */
export async function ingestReadmes(analysis: RepoAnalysis): Promise<ReadmeIngestResult> {
  const summaries = new Map<string, string>();
  const resources: Resource[] = [];

  const candidates = analysis.repos
    .filter((r) => !r.is_fork && r.default_branch)
    .sort((a, b) => b.stars - a.stars)
    .slice(0, MAX_REPOS_TO_INGEST);

  for (const repo of candidates) {
    const readmeUrl = `https://raw.githubusercontent.com/${analysis.username}/${repo.name}/${repo.default_branch}/README.md`;
    if (!(await readmeExists(readmeUrl))) {
      console.log(`  skipping ${repo.name} — no README.md on its default branch`);
      continue;
    }

    console.log(`  ingesting README for ${repo.name}...`);
    let resource = await findResourceBySourceUri(readmeUrl);
    if (!resource) {
      resource = await createMarkdownResource(`${repo.name} README`, readmeUrl);
    }
    if (resource.status !== 'COMPLETED') {
      try {
        resource = await waitForCompletion(resource.id, { timeoutMs: 30_000 });
      } catch (err) {
        console.log(`  ⚠️  ${repo.name}: ${(err as Error).message} — skipping`);
        resources.push(resource);
        continue;
      }
    }

    resources.push(resource);
    const summaryArtifact = resource.artifacts.find((a) => a.type === 'SUMMARY');
    if (!summaryArtifact) continue;
    const summary = await getSummaryText(resource.id, summaryArtifact.id);
    summaries.set(repo.name, summary);
  }

  return { summaries, resources };
}
