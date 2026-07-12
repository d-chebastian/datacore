import request from 'supertest';
import { createApp } from '../../src/app';
import { consume, RoutingKeys } from '../../src/broker/broker';
import { prisma } from '../../src/models/prismaClient';
import { ensureTestInfra, resetDatabase, createTestPipeline, createTestPlugin, waitFor } from './testUtils';
import { uploadObject } from '../../src/storage/minio';

const app = createApp();

describe('Resource lifecycle management', () => {
  beforeAll(async () => {
    await ensureTestInfra();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  it('allows editing a resource name via PATCH', async () => {
    const createRes = await request(app)
      .post('/api/v1/resources')
      .send({ name: 'Original', type: 'CSV', source: { kind: 'URL', url: 'https://example.com/x.csv' } });

    const patchRes = await request(app)
      .patch(`/api/v1/resources/${createRes.body.id}`)
      .send({ name: 'Renamed' });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.name).toBe('Renamed');
  });

  it('reprocessing overwrites an artifact of the same type in place rather than duplicating it (FR-006a)', async () => {
    const plugin = await createTestPlugin();
    await createTestPipeline('MARKDOWN', [{ pluginId: plugin.id, maxAttempts: 1 }]);

    let callCount = 0;
    await consume('test.reprocess.q', RoutingKeys.stepDispatched(plugin.id), async (msg) => {
      callCount += 1;
      await request(app)
        .post(`/api/v1/internal/artifacts/${msg.resource_id}`)
        .send({
          plugin_id: plugin.id,
          step_position: 0,
          outcome: 'SUCCESS',
          artifact: { type: 'SUMMARY', external_ref: `s3://bucket/summary-v${callCount}.txt` },
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
    const firstRun = await request(app).get(`/api/v1/resources/${resourceId}`);
    expect(firstRun.body.artifacts).toHaveLength(1);
    const firstArtifactId = firstRun.body.artifacts[0].id;

    await request(app).post(`/api/v1/resources/${resourceId}/reprocess`);
    await waitFor(async () => {
      const res = await request(app).get(`/api/v1/resources/${resourceId}`);
      return res.body.status === 'COMPLETED' && callCount === 2 ? res.body : null;
    });

    const secondRun = await request(app).get(`/api/v1/resources/${resourceId}`);
    expect(secondRun.body.artifacts).toHaveLength(1); // overwritten, not duplicated
    expect(secondRun.body.artifacts[0].id).toBe(firstArtifactId); // same row, updated in place
    expect(secondRun.body.artifacts[0].external_ref).toBe('s3://bucket/summary-v2.txt');
  });

  it('deletes a resource and cleans up its artifacts from MinIO, rejecting deletion while Processing (FR-007a, FR-008)', async () => {
    const plugin = await createTestPlugin();
    await createTestPipeline('MARKDOWN', [{ pluginId: plugin.id, maxAttempts: 1 }]);

    const key = 'summaries/pre-existing.txt';
    await uploadObject(key, Buffer.from('hello'), 'text/plain');

    // Deliberately do NOT bind a consumer for this plugin's dispatch queue yet, so the resource
    // stays PROCESSING (dispatched, uncompleted) until we choose to complete it below.
    const createRes = await request(app)
      .post('/api/v1/resources')
      .send({ name: 'Doc', type: 'MARKDOWN', source: { kind: 'URL', url: 'https://example.com/x.md' } });
    const resourceId = createRes.body.id;

    await waitFor(async () => {
      const res = await request(app).get(`/api/v1/resources/${resourceId}`);
      return res.body.status === 'PROCESSING' ? res.body : null;
    });

    // Attempting delete while Processing must be rejected.
    const deleteWhileProcessing = await request(app).delete(`/api/v1/resources/${resourceId}`);
    expect(deleteWhileProcessing.status).toBe(409);
    expect(deleteWhileProcessing.body.error.code).toBe('RESOURCE_PROCESSING');

    // Now let the (simulated) plugin worker finally complete the step.
    await request(app)
      .post(`/api/v1/internal/artifacts/${resourceId}`)
      .send({
        plugin_id: plugin.id,
        step_position: 0,
        outcome: 'SUCCESS',
        artifact: { type: 'SUMMARY', external_ref: `s3://datacore-resources/${key}` },
      });

    await waitFor(async () => {
      const res = await request(app).get(`/api/v1/resources/${resourceId}`);
      return res.body.status === 'COMPLETED' ? res.body : null;
    });

    const deleteRes = await request(app).delete(`/api/v1/resources/${resourceId}`);
    expect(deleteRes.status).toBe(204);

    const fetchAfterDelete = await request(app).get(`/api/v1/resources/${resourceId}`);
    expect(fetchAfterDelete.status).toBe(404);

    const remainingArtifacts = await prisma.artifact.findMany({ where: { resourceId } });
    expect(remainingArtifacts).toHaveLength(0);
  });
});
