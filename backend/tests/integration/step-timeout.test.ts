import request from 'supertest';
import { createApp } from '../../src/app';
import { sweepTimedOutSteps } from '../../src/services/pipelineRouter';
import { ensureTestInfra, resetDatabase, createTestPipeline, createTestPlugin, waitFor } from './testUtils';

const app = createApp();

describe('Step timeout detection (FR-016c)', () => {
  beforeAll(async () => {
    await ensureTestInfra();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  it('treats a non-responding step as a failed attempt once its timeout elapses', async () => {
    const plugin = await createTestPlugin();
    // No worker consumes this plugin's dispatch queue in this test, so the step will never call back.
    await createTestPipeline('MARKDOWN', [{ pluginId: plugin.id, maxAttempts: 1, timeoutSeconds: 1 }]);

    const createRes = await request(app)
      .post('/api/v1/resources')
      .send({ name: 'Doc', type: 'MARKDOWN', source: { kind: 'URL', url: 'https://example.com/x.md' } });
    const resourceId = createRes.body.id;

    await waitFor(async () => {
      const res = await request(app).get(`/api/v1/resources/${resourceId}`);
      return res.body.status === 'PROCESSING' ? res.body : null;
    });

    // Wait past the 1s timeout, then trigger the sweep directly (avoids waiting on the 15s interval).
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await sweepTimedOutSteps();

    const final = await request(app).get(`/api/v1/resources/${resourceId}`);
    expect(final.body.status).toBe('FAILED');
    expect(final.body.failure_reason).toBe('step timed out');
  });
});
