import request from 'supertest';
import { createApp } from '../../src/app';
import { ensureTestInfra, resetDatabase } from './testUtils';

const app = createApp();

describe('Global resource search (FR-010)', () => {
  beforeAll(async () => {
    await ensureTestInfra();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  it('returns only resources whose name matches the query, case-insensitively', async () => {
    await request(app)
      .post('/api/v1/resources')
      .send({ name: 'Spring Boot Architecture', type: 'PDF', source: { kind: 'URL', url: 'https://example.com/1' } });
    await request(app)
      .post('/api/v1/resources')
      .send({ name: 'React Core Engine', type: 'GITHUB_REPO', source: { kind: 'URL', url: 'https://example.com/2' } });
    await request(app)
      .post('/api/v1/resources')
      .send({ name: 'Q2 Financials', type: 'CSV', source: { kind: 'URL', url: 'https://example.com/3' } });

    const res = await request(app).get('/api/v1/resources').query({ q: 'spring' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('Spring Boot Architecture');

    const noMatch = await request(app).get('/api/v1/resources').query({ q: 'nonexistent' });
    expect(noMatch.body).toHaveLength(0);

    const allRes = await request(app).get('/api/v1/resources');
    expect(allRes.body).toHaveLength(3);
  });
});
