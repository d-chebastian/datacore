import request from 'supertest';
import { createApp } from '../../src/app';
import { ensureTestInfra, resetDatabase, createTestPipeline, createTestPlugin, waitFor } from './testUtils';

const app = createApp();

describe('Pipeline step assigned to an inactive plugin', () => {
  beforeAll(async () => {
    await ensureTestInfra();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  it('is treated as a step failure and marks the resource FAILED', async () => {
    const plugin = await createTestPlugin({ isActive: false });
    await createTestPipeline('MARKDOWN', [{ pluginId: plugin.id, maxAttempts: 1 }]);

    const createRes = await request(app)
      .post('/api/v1/resources')
      .send({ name: 'Doc', type: 'MARKDOWN', source: { kind: 'URL', url: 'https://example.com/x.md' } });

    await waitFor(async () => {
      const res = await request(app).get(`/api/v1/resources/${createRes.body.id}`);
      return res.body.status === 'FAILED' ? res.body : null;
    });

    const final = await request(app).get(`/api/v1/resources/${createRes.body.id}`);
    expect(final.body.status).toBe('FAILED');
    expect(final.body.failure_reason).toBe('plugin inactive');
  });
});
