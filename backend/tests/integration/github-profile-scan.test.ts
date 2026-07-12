import request from 'supertest';
import { createApp } from '../../src/app';
import { consume, RoutingKeys } from '../../src/broker/broker';
import { ensureTestInfra, resetDatabase, createTestPipeline, createTestPlugin, waitFor } from './testUtils';

const app = createApp();

describe('GitHub profile scan pipeline (REPO_ANALYSIS artifact)', () => {
  beforeAll(async () => {
    await ensureTestInfra();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  it('registers a GITHUB_REPO resource, dispatches to the scanner plugin, and completes with a REPO_ANALYSIS artifact', async () => {
    const scanner = await createTestPlugin({ name: 'GitHub Profile Scanner' });
    await createTestPipeline('GITHUB_REPO', [{ pluginId: scanner.id, maxAttempts: 1 }]);

    await consume('test.github-scan.q', RoutingKeys.stepDispatched(scanner.id), async (msg) => {
      // Simulates the real plugin: fetches the profile, uploads an analysis JSON, calls back.
      await request(app)
        .post(`/api/v1/internal/artifacts/${msg.resource_id}`)
        .send({
          plugin_id: scanner.id,
          step_position: 0,
          outcome: 'SUCCESS',
          artifact: { type: 'REPO_ANALYSIS', external_ref: 's3://datacore-resources/github-analysis/test.json' },
        });
    });

    const createRes = await request(app)
      .post('/api/v1/resources')
      .send({ name: 'My GitHub Profile', type: 'GITHUB_REPO', source: { kind: 'URL', url: 'https://github.com/octocat' } });

    await waitFor(async () => {
      const res = await request(app).get(`/api/v1/resources/${createRes.body.id}`);
      return res.body.status === 'COMPLETED' ? res.body : null;
    });

    const final = await request(app).get(`/api/v1/resources/${createRes.body.id}`);
    expect(final.body.status).toBe('COMPLETED');
    expect(final.body.artifacts).toHaveLength(1);
    expect(final.body.artifacts[0].type).toBe('REPO_ANALYSIS');
  });
});
