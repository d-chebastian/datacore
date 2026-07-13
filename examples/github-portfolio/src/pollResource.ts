import { getResource, Resource } from './coreApiClient.js';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Polls a resource until it leaves PROCESSING/PENDING — shared by the main profile scan and by each
 * README ingestion, since both are just "register a resource, wait for DataCore's normal pipeline". */
export async function waitForCompletion(
  resourceId: string,
  { pollIntervalMs = 2000, timeoutMs = 60_000, log = false }: { pollIntervalMs?: number; timeoutMs?: number; log?: boolean } = {},
): Promise<Resource> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const resource = await getResource(resourceId);
    if (resource.status === 'COMPLETED') return resource;
    if (resource.status === 'FAILED') {
      throw new Error(`Processing failed: ${resource.failure_reason ?? 'unknown reason'}`);
    }
    if (log) process.stdout.write(`  ...still ${resource.status.toLowerCase()}\n`);
    await sleep(pollIntervalMs);
  }
  throw new Error(`Timed out after ${timeoutMs / 1000}s waiting for processing to complete`);
}
