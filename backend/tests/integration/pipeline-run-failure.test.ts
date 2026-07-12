import request from 'supertest';
import { createApp } from '../../src/app';
import { consume, RoutingKeys } from '../../src/broker/broker';
import { ensureTestInfra, resetDatabase, createTestPipeline, createTestPlugin, waitFor } from './testUtils';

const app = createApp();

describe('Pipeline step retry exhaustion', () => {
  beforeAll(async () => {
    await ensureTestInfra();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  it('marks the resource FAILED with the last error once retries are exhausted', async () => {
    const plugin = await createTestPlugin();
    await createTestPipeline('MARKDOWN', [{ pluginId: plugin.id, maxAttempts: 2, backoffSeconds: 0 }]);

    let attempts = 0;
    await consume('test.failure.q', RoutingKeys.stepDispatched(plugin.id), async (msg) => {
      attempts += 1;
      await request(app)
        .post(`/api/v1/internal/artifacts/${msg.resource_id}`)
        .send({ plugin_id: plugin.id, step_position: 0, outcome: 'FAILURE', error: `boom attempt ${attempts}` });
    });

    const createRes = await request(app)
      .post('/api/v1/resources')
      .send({ name: 'Doc', type: 'MARKDOWN', source: { kind: 'URL', url: 'https://example.com/x.md' } });
    const resourceId = createRes.body.id;

    await waitFor(async () => {
      const res = await request(app).get(`/api/v1/resources/${resourceId}`);
      return res.body.status === 'FAILED' ? res.body : null;
    });

    const final = await request(app).get(`/api/v1/resources/${resourceId}`);
    expect(final.body.status).toBe('FAILED');
    expect(final.body.failure_reason).toContain('boom attempt');
    expect(attempts).toBe(2);
  });
});
