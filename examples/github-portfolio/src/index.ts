#!/usr/bin/env node
/**
 * Registers (or reuses) a GITHUB_REPO resource for a GitHub profile in a running DataCore instance,
 * waits for the github-profile-scanner plugin to produce its REPO_ANALYSIS artifact, and renders a
 * static portfolio page from the real, live-scanned data — a downstream-consumer example: DataCore
 * ingests + processes, this script just reads the result back out over the same REST API the Web UI uses.
 */
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createGithubProfileResource, findResourceBySourceUri, getRepoAnalysis, Resource } from './coreApiClient.js';
import { renderPortfolio } from './render.js';
import { generatePortfolioCopy } from './gemini.js';
import { ingestReadmes } from './readmeIngest.js';
import { buildSearchIndex, writeSearchIndex } from './searchIndex.js';
import { waitForCompletion } from './pollResource.js';

const USERNAME = process.argv[2] || process.env.GITHUB_USERNAME || 'd-chebastian';
const OUTPUT_PATH = process.env.OUTPUT_PATH || path.resolve(process.cwd(), 'output', 'portfolio.html');
const SEARCH_INDEX_PATH = path.join(path.dirname(OUTPUT_PATH), 'search-index.json');

async function main() {
  const profileUrl = `https://github.com/${USERNAME}`;
  console.log(`→ Looking for an existing DataCore resource for ${profileUrl}...`);

  let resource = await findResourceBySourceUri(profileUrl);
  if (resource) {
    console.log(`  found one already (${resource.id}, status ${resource.status})`);
  } else {
    console.log('  none found — registering a new one');
    resource = await createGithubProfileResource(`${USERNAME} GitHub Profile`, profileUrl);
    console.log(`  created ${resource.id}`);
  }

  if (!resource.is_enabled) {
    console.log('⚠️  This resource has "LLM Access" turned off in the Web UI — the portfolio will still');
    console.log('   render (this script reads the REST API directly, same as the Web UI), but an MCP');
    console.log('   client would be refused. Turn it back on if you want both to work.');
  }

  if (resource.status !== 'COMPLETED') {
    console.log(`→ Waiting for the github-profile-scanner plugin to finish (status: ${resource.status})...`);
    resource = await waitForCompletion(resource.id, { log: true });
  }

  const artifact = resource.artifacts.find((a) => a.type === 'REPO_ANALYSIS');
  if (!artifact) {
    throw new Error('Resource completed but has no REPO_ANALYSIS artifact — is the plugin pipeline configured for GITHUB_REPO?');
  }

  console.log('→ Fetching the scanned data...');
  const analysis = await getRepoAnalysis(resource.id, artifact.id);

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });

  let copy = null;
  let readmeSummaries = new Map<string, string>();
  let searchIndexBuilt = false;
  // Every DataCore resource actually involved, so the minisite can show a "DataCore Resources" tab —
  // starts with the main profile resource itself; ingestReadmes appends any README resources it registers.
  const dataCoreResources: Resource[] = [resource];

  let copyJa = null;

  if (process.env.GEMINI_API_KEY) {
    console.log('→ Ingesting top repos\' READMEs as DataCore resources (real markdown-summarizer pipeline)...');
    const readmeResult = await ingestReadmes(analysis);
    readmeSummaries = readmeResult.summaries;
    dataCoreResources.push(...readmeResult.resources);

    console.log('→ Asking Gemini to write portfolio copy (English + Japanese) from the scanned data...');
    try {
      copy = await generatePortfolioCopy(analysis, readmeSummaries, 'en');
    } catch (err) {
      console.log(`⚠️  Gemini request failed for English copy (${(err as Error).message}) — rendering with raw data only.`);
    }
    try {
      copyJa = await generatePortfolioCopy(analysis, readmeSummaries, 'ja');
    } catch (err) {
      console.log(`⚠️  Gemini request failed for Japanese copy (${(err as Error).message}) — rendering with raw data only.`);
    }

    console.log('→ Building the "ask about my work" search index (Gemini embeddings)...');
    try {
      const entries = await buildSearchIndex(analysis, readmeSummaries);
      if (entries.length > 0) {
        await writeSearchIndex(SEARCH_INDEX_PATH, entries);
        searchIndexBuilt = true;
      } else {
        console.log('  no repos had enough content to index — skipping the search box.');
      }
    } catch (err) {
      console.log(`⚠️  Failed to build the search index (${(err as Error).message}) — skipping the search box.`);
    }
  } else {
    console.log('→ GEMINI_API_KEY not set — rendering with raw scanned data only (no AI copy, no search box).');
  }

  console.log('→ Rendering the portfolio minisite (English + Japanese)...');
  const html = renderPortfolio(analysis, copy, searchIndexBuilt, dataCoreResources, 'en');
  await writeFile(OUTPUT_PATH, html, 'utf-8');

  const jaOutputPath = path.join(path.dirname(OUTPUT_PATH), 'ja', 'portfolio.html');
  await mkdir(path.dirname(jaOutputPath), { recursive: true });
  const htmlJa = renderPortfolio(analysis, copyJa, searchIndexBuilt, dataCoreResources, 'ja');
  await writeFile(jaOutputPath, htmlJa, 'utf-8');

  console.log(`\n✅ Portfolio for ${analysis.username} written to ${OUTPUT_PATH} (and ${jaOutputPath})`);
  console.log(`   ${analysis.repo_count} repos scanned at ${analysis.scanned_at}${copy ? ' — enhanced with Gemini' : ''}`);
  if (searchIndexBuilt) {
    console.log('   Search index built — run `npm run serve` to get the "ask about my work" box working.');
  }
  console.log(`   Open it: file://${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error('Failed:', (error as Error).message);
  process.exit(1);
});
