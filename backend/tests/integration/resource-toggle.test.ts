import request from 'supertest';
import { createApp } from '../../src/app';
import { ensureTestInfra, resetDatabase } from './testUtils';

const app = createApp();

describe('PUT /api/v1/resources/:id/toggle', () => {
  beforeAll(async () => {
    await ensureTestInfra();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  it('defaults new resources to enabled and toggles is_enabled without affecting status', async () => {
    const createRes = await request(app)
      .post('/api/v1/resources')
      .send({ name: 'Toggle Me', type: 'MARKDOWN', source: { kind: 'URL', url: 'https://example.com/doc.md' } });
    expect(createRes.body.is_enabled).toBe(true);

    const toggleRes = await request(app).put(`/api/v1/resources/${createRes.body.id}/toggle`);
    expect(toggleRes.status).toBe(200);
    expect(toggleRes.body.is_enabled).toBe(false);
    // Toggling LLM/MCP visibility must not touch pipeline status.
    expect(toggleRes.body.status).toBe(createRes.body.status);

    const toggleBackRes = await request(app).put(`/api/v1/resources/${createRes.body.id}/toggle`);
    expect(toggleBackRes.body.is_enabled).toBe(true);
  });

  it('returns 404 for an unknown resource id', async () => {
    const res = await request(app).put('/api/v1/resources/00000000-0000-0000-0000-000000000000/toggle');
    expect(res.status).toBe(404);
  });
});
