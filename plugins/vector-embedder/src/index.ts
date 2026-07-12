import amqplib from 'amqplib';
import fetch from 'node-fetch';
import { QdrantClient } from '@qdrant/js-client-rest';
import crypto from 'crypto';

const EXCHANGE = 'datacore.resource-lifecycle';
const PLUGIN_ID = process.env.PLUGIN_ID || 'vector-embedder';
const CORE_API_URL = process.env.CORE_API_URL || 'http://localhost:3010';
const COLLECTION = 'datacore_vectors';
const VECTOR_SIZE = 8;

const qdrant = new QdrantClient({ url: process.env.QDRANT_URL || 'http://localhost:6333' });

interface UpstreamArtifact {
  type: string;
  external_ref: string;
}

interface DispatchPayload {
  step_position: number;
  plugin_id: string;
  source_uri: string;
  upstream_artifacts: UpstreamArtifact[];
}

interface BrokerEvent {
  resource_id: string;
  payload: DispatchPayload;
}

/** Deterministic mock embedding: hashes the input text into VECTOR_SIZE floats in [0,1). */
function mockEmbedding(text: string): number[] {
  const hash = crypto.createHash('sha256').update(text).digest();
  const vector: number[] = [];
  for (let i = 0; i < VECTOR_SIZE; i++) {
    vector.push(hash[i] / 255);
  }
  return vector;
}

async function ensureCollection(): Promise<void> {
  const collections = await qdrant.getCollections();
  if (!collections.collections.some((c) => c.name === COLLECTION)) {
    await qdrant.createCollection(COLLECTION, { vectors: { size: VECTOR_SIZE, distance: 'Cosine' } });
  }
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
    const summaryArtifact = payload.upstream_artifacts.find((a) => a.type === 'SUMMARY');
    const textToEmbed = summaryArtifact?.external_ref || payload.source_uri;
    const vector = mockEmbedding(textToEmbed);
    const pointId = crypto.randomUUID();

    await ensureCollection();
    await qdrant.upsert(COLLECTION, {
      points: [{ id: pointId, vector, payload: { resource_id: resourceId } }],
    });

    await callback(resourceId, payload.step_position, 'SUCCESS', {
      artifact: { type: 'VECTOR', external_ref: `qdrant://${COLLECTION}/${pointId}` },
    });
  } catch (err) {
    await callback(resourceId, payload.step_position, 'FAILURE', { error: String(err) });
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
