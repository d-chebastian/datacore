import amqplib from 'amqplib';
import fetch from 'node-fetch';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const EXCHANGE = 'datacore.resource-lifecycle';
const PLUGIN_ID = process.env.PLUGIN_ID || 'github-profile-scanner';
const CORE_API_URL = process.env.CORE_API_URL || 'http://localhost:3010';
const BUCKET = process.env.MINIO_BUCKET || 'datacore-resources';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN; // optional — raises the unauthenticated 60/hr rate limit to 5000/hr
const MAX_PAGES = 3; // bounds a single scan to at most 300 repos (100 per page)

const s3 = new S3Client({
  endpoint: process.env.MINIO_ENDPOINT || 'http://localhost:9000',
  region: 'us-east-1',
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY || 'datacore',
    secretAccessKey: process.env.MINIO_SECRET_KEY || 'datacore123',
  },
});

interface DispatchPayload {
  step_position: number;
  plugin_id: string;
  source_uri: string;
}

interface BrokerEvent {
  resource_id: string;
  payload: DispatchPayload;
}

interface GitHubRepo {
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  fork: boolean;
  updated_at: string;
}

/** Accepts either a profile URL (github.com/user) or a repo URL (github.com/user/repo) — the
 * profile's public repos are scanned either way, since the owner is the first path segment in both. */
function extractGitHubUsername(sourceUri: string): string {
  const url = new URL(sourceUri);
  const segments = url.pathname.split('/').filter(Boolean);
  if (segments.length === 0) {
    throw new Error(`could not extract a GitHub username from URL: ${sourceUri}`);
  }
  return segments[0];
}

function githubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'datacore-github-profile-scanner',
  };
  if (GITHUB_TOKEN) headers.Authorization = `Bearer ${GITHUB_TOKEN}`;
  return headers;
}

async function fetchPublicRepos(username: string): Promise<GitHubRepo[]> {
  const repos: GitHubRepo[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await fetch(
      `https://api.github.com/users/${encodeURIComponent(username)}/repos?type=owner&sort=updated&per_page=100&page=${page}`,
      { headers: githubHeaders() },
    );

    if (res.status === 404) {
      throw new Error(`GitHub user '${username}' not found`);
    }
    if (res.status === 403) {
      throw new Error('GitHub API rate limit exceeded — set a GITHUB_TOKEN to raise the limit');
    }
    if (!res.ok) {
      throw new Error(`GitHub API returned ${res.status} while listing repos for '${username}'`);
    }

    const page_repos = (await res.json()) as GitHubRepo[];
    repos.push(...page_repos);
    if (page_repos.length < 100) break; // last page reached
  }
  return repos;
}

async function callback(
  resourceId: string,
  stepPosition: number,
  outcome: 'SUCCESS' | 'FAILURE',
  extra: Record<string, unknown>,
): Promise<void> {
  await fetch(`${CORE_API_URL}/api/v1/internal/artifacts/${resourceId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plugin_id: PLUGIN_ID, step_position: stepPosition, outcome, ...extra }),
  });
}

async function handleMessage(event: BrokerEvent): Promise<void> {
  const { resource_id: resourceId, payload } = event;
  try {
    const username = extractGitHubUsername(payload.source_uri);
    const repos = await fetchPublicRepos(username);

    const analysis = {
      username,
      scanned_at: new Date().toISOString(),
      repo_count: repos.length,
      repos: repos.map((r) => ({
        name: r.name,
        full_name: r.full_name,
        description: r.description,
        url: r.html_url,
        language: r.language,
        stars: r.stargazers_count,
        forks: r.forks_count,
        is_fork: r.fork,
        updated_at: r.updated_at,
      })),
    };

    const key = `github-analysis/${resourceId}.json`;
    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: JSON.stringify(analysis, null, 2),
        ContentType: 'application/json',
      }),
    );

    await callback(resourceId, payload.step_position, 'SUCCESS', {
      artifact: { type: 'REPO_ANALYSIS', external_ref: `s3://${BUCKET}/${key}` },
    });
  } catch (err) {
    await callback(resourceId, payload.step_position, 'FAILURE', { error: String((err as Error).message || err) });
  }
}

async function main() {
  const conn = await amqplib.connect(process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672');
  const channel = await conn.createChannel();
  await channel.assertExchange(EXCHANGE, 'topic', { durable: true });
  const queue = `plugin.${PLUGIN_ID}`;
  await channel.assertQueue(queue, { durable: true });
  await channel.bindQueue(queue, EXCHANGE, `pipeline.step.dispatched.${PLUGIN_ID}`);
  await channel.prefetch(1);

  // eslint-disable-next-line no-console
  console.log(`[${PLUGIN_ID}] listening for dispatched steps...`);

  channel.consume(queue, (msg) => {
    if (!msg) return;
    const event = JSON.parse(msg.content.toString()) as BrokerEvent;
    handleMessage(event)
      .then(() => channel.ack(msg))
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error(`[${PLUGIN_ID}] unhandled error`, err);
        channel.ack(msg);
      });
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(`[${PLUGIN_ID}] fatal startup error`, err);
  process.exit(1);
});
