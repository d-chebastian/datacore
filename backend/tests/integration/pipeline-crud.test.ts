import request from 'supertest';
import { createApp } from '../../src/app';
import { consume, RoutingKeys } from '../../src/broker/broker';
import { prisma } from '../../src/models/prismaClient';
import { ensureTestInfra, resetDatabase, createTestPlugin, waitFor } from './testUtils';

const app = createApp();

describe('Pipeline CRUD', () => {
  beforeAll(async () => {
    await ensureTestInfra();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  it('creates, lists, updates, and deletes a pipeline, persisting retry/backoff/timeout fields', async () => {
    const plugin = await createTestPlugin();

    const createRes = await request(app)
      .post('/api/v1/pipelines')
      .send({
        name: 'CSV Pipeline',
        trigger_type: 'CSV',
        steps: [{ plugin_id: plugin.id, max_attempts: 4, backoff_seconds: 10, timeout_seconds: 60 }],
      });
    expect(createRes.status).toBe(201);
    expect(createRes.body.steps[0]).toMatchObject({
      plugin_id: plugin.id,
      max_attempts: 4,
      backoff_seconds: 10,
      timeout_seconds: 60,
    });

    const listRes = await request(app).get('/api/v1/pipelines');
    expect(listRes.body).toHaveLength(1);

    const updateRes = await request(app)
      .put(`/api/v1/pipelines/${createRes.body.id}`)
      .send({ name: 'CSV Pipeline v2', steps: [{ plugin_id: plugin.id, max_attempts: 1 }] });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.name).toBe('CSV Pipeline v2');
    expect(updateRes.body.steps).toHaveLength(1);

    const deleteRes = await request(app).delete(`/api/v1/pipelines/${createRes.body.id}`);
    expect(deleteRes.status).toBe(204);

    const listAfterDelete = await request(app).get('/api/v1/pipelines');
    expect(listAfterDelete.body).toHaveLength(0);
  });

  it('rejects creating a second pipeline for a trigger type that already has one (FR-012a)', async () => {
    const plugin = await createTestPlugin();
    await request(app)
      .post('/api/v1/pipelines')
      .send({ name: 'First', trigger_type: 'AUDIO', steps: [{ plugin_id: plugin.id }] });

    const second = await request(app)
      .post('/api/v1/pipelines')
      .send({ name: 'Second', trigger_type: 'AUDIO', steps: [{ plugin_id: plugin.id }] });

    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('PIPELINE_TRIGGER_TYPE_TAKEN');
  });

  it('does not affect a resource already Processing when its pipeline is deleted (FR-014a)', async () => {
    const plugin = await createTestPlugin();
    const pipelineRes = await request(app)
      .post('/api/v1/pipelines')
      .send({ name: 'Slow Pipeline', trigger_type: 'PDF', steps: [{ plugin_id: plugin.id, max_attempts: 1 }] });

    // Do NOT respond to the dispatched step yet — resource will sit PROCESSING.
    let capturedResourceId: string | null = null;
    await consume('test.pipeline-delete.q', RoutingKeys.stepDispatched(plugin.id), async (msg) => {
      capturedResourceId = msg.resource_id;
    });

    const createRes = await request(app)
      .post('/api/v1/resources')
      .send({ name: 'Doc', type: 'PDF', source: { kind: 'URL', url: 'https://example.com/x.pdf' } });
    const resourceId = createRes.body.id;

    await waitFor(async () => {
      const res = await request(app).get(`/api/v1/resources/${resourceId}`);
      return res.body.status === 'PROCESSING' ? res.body : null;
    });
    await waitFor(() => (capturedResourceId ? true : null));

    // Delete the pipeline while the resource is still Processing under it.
    const deleteRes = await request(app).delete(`/api/v1/pipelines/${pipelineRes.body.id}`);
    expect(deleteRes.status).toBe(204);

    // The resource must be completely unaffected: still PROCESSING, same step state.
    const afterDelete = await request(app).get(`/api/v1/resources/${resourceId}`);
    expect(afterDelete.body.status).toBe('PROCESSING');

    const rawResource = await prisma.resource.findUnique({ where: { id: resourceId } });
    expect(rawResource?.pipelineId).toBeNull(); // ON DELETE SET NULL, not cascade
    expect(rawResource?.stepSnapshot).not.toBeNull(); // still has its own snapshot to run from

    // The run can still complete normally via its captured step_snapshot, unaffected by the deleted pipeline.
    await request(app)
      .post(`/api/v1/internal/artifacts/${resourceId}`)
      .send({
        plugin_id: plugin.id,
        step_position: 0,
        outcome: 'SUCCESS',
        artifact: { type: 'SUMMARY', external_ref: 's3://bucket/summary.txt' },
      });

    await waitFor(async () => {
      const res = await request(app).get(`/api/v1/resources/${resourceId}`);
      return res.body.status === 'COMPLETED' ? res.body : null;
    });
    const final = await request(app).get(`/api/v1/resources/${resourceId}`);
    expect(final.body.status).toBe('COMPLETED');
  });
});
