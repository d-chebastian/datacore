import amqplib from 'amqplib';
import fetch from 'node-fetch';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';

const EXCHANGE = 'datacore.resource-lifecycle';
const PLUGIN_ID = process.env.PLUGIN_ID || 'markdown-summarizer';
const CORE_API_URL = process.env.CORE_API_URL || 'http://localhost:3010';
const BUCKET = process.env.MINIO_BUCKET || 'datacore-resources';

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

async function fetchSourceText(sourceUri: string): Promise<string> {
  if (sourceUri.startsWith('s3://')) {
    const key = sourceUri.replace(`s3://${BUCKET}/`, '');
    const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    const stream = res.Body as Readable;
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    return Buffer.concat(chunks).toString('utf-8');
  }
  const res = await fetch(sourceUri);
  return res.text();
}

function summarize(text: string): string {
  const trimmed = text.replace(/\s+/g, ' ').trim();
  return trimmed.length > 280 ? `${trimmed.slice(0, 280)}...` : trimmed || '(empty document)';
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
    const sourceText = await fetchSourceText(payload.source_uri);
    const summary = summarize(sourceText);
    const key = `summaries/${resourceId}.txt`;
    await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: summary, ContentType: 'text/plain' }));
    await callback(resourceId, payload.step_position, 'SUCCESS', {
      artifact: { type: 'SUMMARY', external_ref: `s3://${BUCKET}/${key}` },
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
