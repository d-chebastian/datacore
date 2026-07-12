import request from 'supertest';
import { createApp } from '../../src/app';
import { consume, RoutingKeys } from '../../src/broker/broker';
import { ensureTestInfra, resetDatabase, createTestPipeline, createTestPlugin, waitFor } from './testUtils';

const app = createApp();

describe('Full pipeline run', () => {
  beforeAll(async () => {
    await ensureTestInfra();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  it('reaches COMPLETED with both artifacts recorded after a 2-step pipeline', async () => {
    const step1Plugin = await createTestPlugin({ name: 'Step1 Plugin' });
    const step2Plugin = await createTestPlugin({ name: 'Step2 Plugin' });
    await createTestPipeline('MARKDOWN', [{ pluginId: step1Plugin.id }, { pluginId: step2Plugin.id }]);

    // Simulate plugin worker for step 1: on dispatch, call back with SUMMARY artifact.
    await consume('test.step1.q', RoutingKeys.stepDispatched(step1Plugin.id), async (msg) => {
      await request(app)
        .post(`/api/v1/internal/artifacts/${msg.resource_id}`)
        .send({
          plugin_id: step1Plugin.id,
          step_position: 0,
          outcome: 'SUCCESS',
          artifact: { type: 'SUMMARY', external_ref: 's3://bucket/summary.txt' },
        });
    });

    // Simulate plugin worker for step 2: on dispatch, call back with VECTOR artifact.
    await consume('test.step2.q', RoutingKeys.stepDispatched(step2Plugin.id), async (msg) => {
      await request(app)
        .post(`/api/v1/internal/artifacts/${msg.resource_id}`)
        .send({
          plugin_id: step2Plugin.id,
          step_position: 1,
          outcome: 'SUCCESS',
          artifact: { type: 'VECTOR', external_ref: 'qdrant://col/point1' },
        });
    });

    const createRes = await request(app)
      .post('/api/v1/resources')
      .send({ name: 'Doc', type: 'MARKDOWN', source: { kind: 'URL', url: 'https://example.com/x.md' } });
    const resourceId = createRes.body.id;

    await waitFor(async () => {
      const res = await request(app).get(`/api/v1/resources/${resourceId}`);
      return res.body.status === 'COMPLETED' ? res.body : null;
    });

    const final = await request(app).get(`/api/v1/resources/${resourceId}`);
    expect(final.body.status).toBe('COMPLETED');
    expect(final.body.artifacts).toHaveLength(2);
    expect(final.body.artifacts.map((a: { type: string }) => a.type).sort()).toEqual(['SUMMARY', 'VECTOR']);
  });
});
