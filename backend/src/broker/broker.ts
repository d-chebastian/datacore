import amqplib, { Channel, ChannelModel } from 'amqplib';

export const EXCHANGE = 'datacore.resource-lifecycle';

export const RoutingKeys = {
  RESOURCE_CREATED: 'resource.created',
  ARTIFACT_GENERATED: 'artifact.generated',
  PIPELINE_STEP_COMPLETED: 'pipeline.step.completed',
  RESOURCE_FAILED: 'resource.failed',
  stepDispatched: (pluginId: string) => `pipeline.step.dispatched.${pluginId}`,
} as const;

let connection: ChannelModel | null = null;
let channel: Channel | null = null;

export async function getChannel(): Promise<Channel> {
  if (channel) return channel;
  const url = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';
  connection = await amqplib.connect(url);
  channel = await connection.createChannel();
  await channel.assertExchange(EXCHANGE, 'topic', { durable: true });
  return channel;
}

export interface BrokerEvent<T = Record<string, unknown>> {
  event: string;
  resource_id: string;
  occurred_at: string;
  payload: T;
}

export async function publishEvent<T>(
  routingKey: string,
  event: string,
  resourceId: string,
  payload: T,
): Promise<void> {
  const ch = await getChannel();
  const body: BrokerEvent<T> = {
    event,
    resource_id: resourceId,
    occurred_at: new Date().toISOString(),
    payload,
  };
  ch.publish(EXCHANGE, routingKey, Buffer.from(JSON.stringify(body)), { persistent: true });
}

export async function consume(
  queueName: string,
  bindingPattern: string,
  handler: (msg: BrokerEvent) => Promise<void>,
): Promise<void> {
  const ch = await getChannel();
  await ch.assertQueue(queueName, { durable: true });
  await ch.bindQueue(queueName, EXCHANGE, bindingPattern);
  await ch.prefetch(1);
  await ch.consume(queueName, (msg) => {
    if (!msg) return;
    const parsed = JSON.parse(msg.content.toString()) as BrokerEvent;
    handler(parsed)
      .then(() => ch.ack(msg))
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error(`Error handling message on ${queueName}:`, err);
        ch.nack(msg, false, false);
      });
  });
}

export async function closeBroker(): Promise<void> {
  await channel?.close();
  await connection?.close();
  channel = null;
  connection = null;
}
