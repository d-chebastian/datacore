import request from 'supertest';
import { createApp } from '../../src/app';
import { consume, RoutingKeys } from '../../src/broker/broker';
import { ensureTestInfra, resetDatabase, createTestPlugin, waitFor } from './testUtils';

const app = createApp();

describe('Resource with no matching pipeline', () => {
  beforeAll(async () => {
    await ensureTestInfra();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  it('stays PENDING with no_matching_pipeline true, then auto-starts once a matching pipeline is created', async () => {
    const createRes = await request(app)
      .post('/api/v1/resources')
      .send({ name: 'Orphan Doc', type: 'MARKDOWN', source: { kind: 'URL', url: 'https://example.com/x.md' } });

    expect(createRes.status).toBe(201);
    expect(createRes.body.status).toBe('PENDING');

    const fetched = await request(app).get(`/api/v1/resources/${createRes.body.id}`);
    expect(fetched.body.no_matching_pipeline).toBe(true);

    // Now create a matching pipeline — the resource should be auto picked up.
    const plugin = await createTestPlugin();
    let dispatched = false;
    await consume('test.pickup.q', RoutingKeys.stepDispatched(plugin.id), async () => {
      dispatched = true;
    });

    await request(app)
      .post('/api/v1/pipelines')
      .send({ name: 'Late Pipeline', trigger_type: 'MARKDOWN', steps: [{ plugin_id: plugin.id }] });

    await waitFor(() => (dispatched ? true : null));

    const afterPickup = await request(app).get(`/api/v1/resources/${createRes.body.id}`);
    expect(afterPickup.body.no_matching_pipeline).toBe(false);
    expect(afterPickup.body.status).toBe('PROCESSING');
  });
});
