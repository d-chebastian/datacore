import request from 'supertest';
import { createApp } from '../../src/app';
import { consume, RoutingKeys } from '../../src/broker/broker';
import { ensureTestInfra, resetDatabase, createTestPipeline, createTestPlugin, waitFor } from './testUtils';

const app = createApp();

describe('Plugin worker crash isolation (Constitution Principle II)', () => {
  beforeAll(async () => {
    await ensureTestInfra();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  it('a crashing plugin worker does not crash Core or block an unrelated resource from completing', async () => {
    const crashingPlugin = await createTestPlugin({ name: 'Crashing Plugin' });
    const healthyPlugin = await createTestPlugin({ name: 'Healthy Plugin' });
    await createTestPipeline('MARKDOWN', [{ pluginId: crashingPlugin.id, maxAttempts: 1 }]);
    await createTestPipeline('PDF', [{ pluginId: healthyPlugin.id, maxAttempts: 1 }]);

    // Simulated worker for the crashing plugin: throws synchronously, mimicking a worker process crash.
    // broker.consume() must not let this take down the process — it should nack the message and move on.
    await consume('test.crash.q', RoutingKeys.stepDispatched(crashingPlugin.id), async () => {
      throw new Error('simulated plugin worker crash');
    });

    // Simulated worker for the healthy plugin on an unrelated resource.
    await consume('test.healthy.q', RoutingKeys.stepDispatched(healthyPlugin.id), async (msg) => {
      await request(app)
        .post(`/api/v1/internal/artifacts/${msg.resource_id}`)
        .send({
          plugin_id: healthyPlugin.id,
          step_position: 0,
          outcome: 'SUCCESS',
          artifact: { type: 'SUMMARY', external_ref: 's3://bucket/ok.txt' },
        });
    });

    const crashResource = await request(app)
      .post('/api/v1/resources')
      .send({ name: 'Crash Doc', type: 'MARKDOWN', source: { kind: 'URL', url: 'https://example.com/a.md' } });
    const healthyResource = await request(app)
      .post('/api/v1/resources')
      .send({ name: 'Healthy Doc', type: 'PDF', source: { kind: 'URL', url: 'https://example.com/b.pdf' } });

    // The unrelated resource must still complete normally, proving the crash didn't affect Core or other work.
    await waitFor(async () => {
      const res = await request(app).get(`/api/v1/resources/${healthyResource.body.id}`);
      return res.body.status === 'COMPLETED' ? res.body : null;
    });
    const healthyFinal = await request(app).get(`/api/v1/resources/${healthyResource.body.id}`);
    expect(healthyFinal.body.status).toBe('COMPLETED');

    // Core's own HTTP surface must remain responsive throughout.
    const health = await request(app).get('/health');
    expect(health.status).toBe(200);

    // The crashed resource is simply stuck PROCESSING (no callback ever arrived) — not FAILED yet
    // (that's the timeout sweep's job, covered separately), but critically Core itself is unaffected.
    const crashFinal = await request(app).get(`/api/v1/resources/${crashResource.body.id}`);
    expect(crashFinal.body.status).toBe('PROCESSING');
  });
});
