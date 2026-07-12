import request from 'supertest';
import { createApp } from '../../src/app';
import { consume } from '../../src/broker/broker';
import { ensureTestInfra, resetDatabase, createTestPipeline, createTestPlugin, waitFor } from './testUtils';

const app = createApp();

describe('POST /api/v1/resources', () => {
  beforeAll(async () => {
    await ensureTestInfra();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  it('creates a PENDING resource and publishes RESOURCE_CREATED when a matching pipeline exists', async () => {
    const plugin = await createTestPlugin();
    await createTestPipeline('MARKDOWN', [{ pluginId: plugin.id }]);

    let received: unknown = null;
    await consume('test.resource-create.q1', 'resource.created', async (msg) => {
      received = msg;
    });

    const res = await request(app)
      .post('/api/v1/resources')
      .send({ name: 'Test Doc', type: 'MARKDOWN', source: { kind: 'URL', url: 'https://example.com/doc.md' } });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Test Doc');
    // pipeline_id is assigned synchronously by the route handler before RESOURCE_CREATED is published,
    // even though the PROCESSING transition itself happens asynchronously once the event is consumed.
    expect(res.body.no_matching_pipeline).toBe(false);

    await waitFor(() => (received ? received : null));
    expect(received).toMatchObject({ event: 'RESOURCE_CREATED', resource_id: res.body.id });

    await waitFor(async () => {
      const fetched = await request(app).get(`/api/v1/resources/${res.body.id}`);
      return fetched.body.status === 'PROCESSING' ? fetched.body : null;
    });
  });

  it('rejects a resource with an invalid type', async () => {
    const res = await request(app)
      .post('/api/v1/resources')
      .send({ name: 'Bad', type: 'NOT_A_TYPE', source: { kind: 'URL', url: 'https://example.com' } });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_RESOURCE');
  });
});
