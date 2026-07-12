import request from 'supertest';
import { createApp } from '../../src/app';
import { consume, RoutingKeys } from '../../src/broker/broker';
import { ensureTestInfra, resetDatabase, createTestPipeline, createTestPlugin, waitFor } from './testUtils';

const app = createApp();

describe('Plugin registry management', () => {
  beforeAll(async () => {
    await ensureTestInfra();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  it('lists plugins and toggles active/inactive', async () => {
    const plugin = await createTestPlugin({ name: 'Toggle Me' });

    const listRes = await request(app).get('/api/v1/plugins');
    expect(listRes.body).toHaveLength(1);
    expect(listRes.body[0]).toMatchObject({ name: 'Toggle Me', is_active: true });

    const toggleRes = await request(app).put(`/api/v1/plugins/${plugin.id}/toggle`);
    expect(toggleRes.status).toBe(200);
    expect(toggleRes.body.is_active).toBe(false);

    const toggleBackRes = await request(app).put(`/api/v1/plugins/${plugin.id}/toggle`);
    expect(toggleBackRes.body.is_active).toBe(true);
  });

  it('does not dispatch new work to an inactive plugin', async () => {
    const plugin = await createTestPlugin({ isActive: false });
    await createTestPipeline('MARKDOWN', [{ pluginId: plugin.id, maxAttempts: 1 }]);

    let dispatched = false;
    await consume('test.inactive-dispatch.q', RoutingKeys.stepDispatched(plugin.id), async () => {
      dispatched = true;
    });

    const createRes = await request(app)
      .post('/api/v1/resources')
      .send({ name: 'Doc', type: 'MARKDOWN', source: { kind: 'URL', url: 'https://example.com/x.md' } });

    await waitFor(async () => {
      const res = await request(app).get(`/api/v1/resources/${createRes.body.id}`);
      return res.body.status === 'FAILED' ? res.body : null;
    });

    expect(dispatched).toBe(false);
  });

  it('rejects deleting a plugin still referenced by a pipeline step with 409 PLUGIN_IN_USE', async () => {
    const plugin = await createTestPlugin();
    await createTestPipeline('CSV', [{ pluginId: plugin.id }]);

    const deleteRes = await request(app).delete(`/api/v1/plugins/${plugin.id}`);
    expect(deleteRes.status).toBe(409);
    expect(deleteRes.body.error.code).toBe('PLUGIN_IN_USE');
  });
});
