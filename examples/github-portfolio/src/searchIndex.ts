import { writeFile } from 'node:fs/promises';
import { embedText } from './embeddings.js';
import { RepoAnalysis } from './coreApiClient.js';
import { summarizeKeyFiles } from './techStack.js';

export interface SearchIndexEntry {
  repo_name: string;
  url: string;
  text: string;
  embedding: number[];
}

const MAX_REPOS_TO_INDEX = 10;

/**
 * Embeds a summary of each top repo — its real README (fetched directly by `github-profile-scanner`) if
 * present, else the DataCore SUMMARY artifact from `ingestReadmes`, else just its raw GitHub description —
 * plus a note of its actual dependencies/tooling if any manifest files were captured, so a question like
 * "what have you built with Express?" can actually match. Failures on individual repos are logged and
 * skipped, not fatal to the whole run.
 */
export async function buildSearchIndex(
  analysis: RepoAnalysis,
  readmeSummaries: Map<string, string>,
): Promise<SearchIndexEntry[]> {
  const repos = [...analysis.repos]
    .filter((r) => !r.is_fork)
    .sort((a, b) => b.stars - a.stars)
    .slice(0, MAX_REPOS_TO_INDEX);

  const entries: SearchIndexEntry[] = [];
  for (const repo of repos) {
    const text = repo.readme ?? readmeSummaries.get(repo.name) ?? repo.description;
    if (!text || !text.trim()) continue;

    const keyFiles = summarizeKeyFiles(repo.key_files);
    const chunk = `${repo.name} (${repo.language ?? 'unknown language'}): ${text}${keyFiles ? `\n\nProject files:\n${keyFiles}` : ''}`;
    try {
      const embedding = await embedText(chunk);
      entries.push({ repo_name: repo.name, url: repo.url, text: chunk, embedding });
    } catch (err) {
      console.log(`  ⚠️  failed to embed ${repo.name}: ${(err as Error).message}`);
    }
  }
  return entries;
}

export async function writeSearchIndex(filePath: string, entries: SearchIndexEntry[]): Promise<void> {
  await writeFile(filePath, JSON.stringify(entries), 'utf-8');
}
