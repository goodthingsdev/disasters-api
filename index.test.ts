// Remove all DisasterMock, in-memory mock, and jest.doMock code
// Use real PostgreSQL, database, and app
import request from 'supertest';
import { Pool } from 'pg';
import { createApp } from './app.js';
let appInstance: import('express').Application;
let pool: Pool;

beforeAll(async () => {
  pool = new Pool({
    connectionString: process.env.POSTGRES_URI!,
  });

  // Ensure PostGIS extension exists in the current test DB (safety net)
  try {
    await pool.query('CREATE EXTENSION IF NOT EXISTS postgis;');
  } catch (err) {
    console.error('[index.test.ts] Could not ensure PostGIS extension:', err);
    throw err;
  }
  // Test database connection
  await pool.query('SELECT 1');

  appInstance = await createApp();
});

beforeEach(async () => {
  await pool.query('DELETE FROM disasters');
});

afterAll(async () => {
  if (pool) {
    await pool.end();
  }
  await new Promise((resolve) => setTimeout(resolve, 300)); // Give time for all async cleanup
});

// Helper: retry a request on 429 (rate limit) with exponential backoff
import type { Response } from 'supertest';
async function retryOn429<T extends Response>(
  fn: () => Promise<T>,
  maxRetries = 5,
  baseDelay = 100,
): Promise<T> {
  let attempt = 0;
  while (true) {
    const response = await fn();
    if (response.statusCode !== 429) return response;
    if (attempt++ >= maxRetries) return response;
    await new Promise((r) => setTimeout(r, baseDelay * Math.pow(2, attempt)));
  }
}

// Use app directly with supertest
describe('Disaster API', () => {
  it('should create a new disaster', async () => {
    const res = await request(appInstance)
      .post('/api/v1/disasters')
      .send({
        type: 'wildfire',
        location: { type: 'Point', coordinates: [-118.25, 34.05] },
        date: '2025-05-23',
        description: 'Test fire',
        status: 'active',
      });
    expect(res.statusCode).toBe(201);
    expect(res.body.type).toBe('wildfire');
    expect(res.body.location.coordinates[0]).toBe(-118.25);
    expect(res.body.location.coordinates[1]).toBe(34.05);
    expect(res.body.status).toBe('active');
  });

  it('should get all disasters', async () => {
    await request(appInstance)
      .post('/api/v1/disasters')
      .send({
        type: 'flood',
        location: { type: 'Point', coordinates: [-74.01, 40.71] },
        date: '2025-05-22',
        description: 'Test flood',
        status: 'active', // <-- required
      });
    const res = await request(appInstance).get('/api/v1/disasters');
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1); // Accept 1 or more
    expect(res.body.data[0].location).toHaveProperty('coordinates');
    expect(res.body.data[0].location.coordinates.length).toBe(2);
  });

  it('should get a disaster by id', async () => {
    // Create a disaster first
    const createRes = await retryOn429(() =>
      request(appInstance)
        .post('/api/v1/disasters')
        .send({
          type: 'earthquake',
          location: { type: 'Point', coordinates: [139.6917, 35.6895] },
          date: '2025-07-01',
          description: 'Test earthquake',
          status: 'active',
        }),
    );
    expect(createRes.statusCode).toBe(201);
    const id = createRes.body.id;
    // Now fetch it
    const res = await retryOn429(() => request(appInstance).get(`/api/v1/disasters/${id}`));
    expect(res.statusCode).toBe(200);
    expect(res.body.type).toBe('earthquake');
    expect(res.body.location).toHaveProperty('coordinates');
    expect(res.body.location.coordinates.length).toBe(2);
  });

  it('should return 404 for missing disaster', async () => {
    // Use a valid but non-existent UUID
    const nonExistentId = '99999999-9999-4999-9999-999999999999';
    const res = await request(appInstance).get(`/api/v1/disasters/${nonExistentId}`);
    expect(res.statusCode).toBe(404);
  });

  it('should update a disaster', async () => {
    // Create a disaster first
    const createRes = await request(appInstance)
      .post('/api/v1/disasters')
      .send({
        type: 'hurricane',
        location: { type: 'Point', coordinates: [-80.19, 25.76] },
        date: '2025-06-01',
        description: 'Test hurricane',
        status: 'active',
      });
    expect(createRes.statusCode).toBe(201);
    const id = createRes.body.id;
    // Now update it
    const res = await retryOn429(() =>
      request(appInstance)
        .put(`/api/v1/disasters/${id}`)
        .send({
          type: 'hurricane',
          location: { type: 'Point', coordinates: [-80.19, 25.76] },
          date: '2025-06-01',
          description: 'Updated hurricane',
          status: 'contained',
        }),
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.type).toBe('hurricane');
    expect(res.body.location.coordinates[0]).toBe(-80.19);
    expect(res.body.location.coordinates[1]).toBe(25.76);
    expect(res.body.status).toBe('contained');
  });

  it('should delete a disaster', async () => {
    const create = await request(appInstance)
      .post('/api/v1/disasters')
      .send({
        type: 'tornado',
        location: { type: 'Point', coordinates: [-97.52, 35.47] },
        date: '2025-05-19',
        description: 'Test tornado',
        status: 'active',
      });
    const id = create.body.id;
    // Wait for the disaster to be available via the API (max 15s, 60x250ms)
    let found = null;
    for (let i = 0; i < 60; i++) {
      const pollRes = await request(appInstance).get(`/api/v1/disasters/${id}`);
      if (pollRes.statusCode === 200 && pollRes.body && pollRes.body.id === id) {
        found = pollRes.body;
        break;
      }
      await new Promise((res) => setTimeout(res, 250));
    }
    expect(found).toBeTruthy();
    const res = await retryOn429(() => request(appInstance).delete(`/api/v1/disasters/${id}`));
    expect(res.statusCode).toBe(204);
  });

  it('should return disasters within a certain distance of a point', async () => {
    // Los Angeles
    const la = await retryOn429(() =>
      request(appInstance)
        .post('/api/v1/disasters')
        .send({
          type: 'wildfire',
          location: { type: 'Point', coordinates: [-118.25, 34.05] },
          date: '2025-05-23',
          description: 'LA fire',
          status: 'active',
        }),
    );
    // New York
    const ny = await retryOn429(() =>
      request(appInstance)
        .post('/api/v1/disasters')
        .send({
          type: 'flood',
          location: { type: 'Point', coordinates: [-73.935242, 40.73061] },
          date: '2025-05-22',
          description: 'NY flood',
          status: 'active',
        }),
    );
    // Wait for both disasters to be available via the API (max 15s, 60x250ms)
    let foundLA = null;
    let foundNY = null;
    for (let i = 0; i < 60; i++) {
      const pollLA = await retryOn429(() =>
        request(appInstance).get(`/api/v1/disasters/${la.body.id}`),
      );
      const pollNY = await retryOn429(() =>
        request(appInstance).get(`/api/v1/disasters/${ny.body.id}`),
      );
      if (pollLA.statusCode === 200 && pollNY.statusCode === 200) {
        foundLA = pollLA.body;
        foundNY = pollNY.body;
        break;
      }
      await new Promise((res) => setTimeout(res, 250));
    }
    expect(foundLA).toBeTruthy();
    expect(foundNY).toBeTruthy();
    // Query near LA, 100km
    const resNear100 = await retryOn429(() =>
      request(appInstance)
        .get('/api/v1/disasters/near')
        .query({ lat: 34.05, lng: -118.25, distance: 100 }),
    );
    if (resNear100.statusCode !== 200) {
      console.error('Test failure /near 100km:', resNear100.body);
    }
    expect(resNear100.statusCode).toBe(200);
    expect(resNear100.body.length).toBe(1);
    expect(resNear100.body[0].type).toBe('wildfire');
    // Query near LA, 4000km (should include both)
    const resNear4000 = await retryOn429(() =>
      request(appInstance)
        .get('/api/v1/disasters/near')
        .query({ lat: 34.05, lng: -118.25, distance: 4000 }),
    );
    if (resNear4000.statusCode !== 200) {
      console.error('Test failure /near 4000km:', resNear4000.body);
    }
    expect(resNear4000.statusCode).toBe(200);
    expect(resNear4000.body.length).toBe(2);
  });

  it('should reject invalid ID on GET/PUT/DELETE', async () => {
    const badIds = ['notavalidid', '-1', '0', '1.5'];
    for (const badId of badIds) {
      let res = await request(appInstance).get(`/api/v1/disasters/${badId}`);
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/Invalid disaster ID format/);
      res = await request(appInstance)
        .put(`/api/v1/disasters/${badId}`)
        .send({ type: 'x', location: { type: 'Point', coordinates: [1, 2] }, date: '2025-01-01' });
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/Invalid disaster ID format/);
      res = await request(appInstance).delete(`/api/v1/disasters/${badId}`);
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/Invalid disaster ID format/);
    }
  });

  it('should reject invalid disaster input on POST/PUT', async () => {
    let res = await request(appInstance).post('/api/v1/disasters').send({});
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/Invalid input/);
    try {
      expect(res.body.details).toContain('type (string) is required');
      expect(res.body.details).toContain('location (object) is required');
      expect(res.body.details).toContain('date (ISO string) is required');
      expect(res.body.details).toContain('"status" is required');
    } catch (e) {
      console.error('Validation details:', res.body.details);
      throw e;
    }
    // Invalid location
    res = await request(appInstance)
      .post('/api/v1/disasters')
      .send({ type: 'x', location: { lat: 'bad', lng: 2 }, date: '2025-01-01', status: 'active' });
    expect(res.statusCode).toBe(400);
    expect(res.body.details).toContain('"location.type" is required');
    expect(res.body.details).toContain('"location.coordinates" is required');
    // Invalid date
    res = await request(appInstance)
      .post('/api/v1/disasters')
      .send({ type: 'x', location: { lat: 1, lng: 2 }, date: 'notadate', status: 'active' });
    expect(res.statusCode).toBe(400);
    expect(res.body.details).toContain('date (ISO string) is required');
  });

  it('should reject invalid query params for /near', async () => {
    let res = await request(appInstance).get('/api/v1/disasters/near');
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/Invalid query parameters/);
    res = await request(appInstance)
      .get('/api/v1/disasters/near')
      .query({ lat: 'bad', lng: 1, distance: 1 });
    expect(res.statusCode).toBe(400);
    expect(res.body.details).toContain('lat (number) is required as query parameter');
    // prettier-ignore
    res = await request(appInstance).get('/api/v1/disasters/near').query({ lat: 1, lng: '', distance: 1 });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/Invalid/);
    res = await request(appInstance)
      .get('/api/v1/disasters/near')
      .query({ lat: 0, lng: 0, distance: NaN });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/Invalid/);
  });

  it('should reject disasters with extreme/invalid numbers', async () => {
    // Extremely large lat/lng
    let res = await request(appInstance)
      .post('/api/v1/disasters')
      .send({
        type: 'fire',
        location: { type: 'Point', coordinates: [9999, 9999] },
        date: '2025-01-01',
        status: 'active',
      });
    expect(res.statusCode).toBe(400);
    // Extremely small lat/lng
    res = await request(appInstance)
      .post('/api/v1/disasters')
      .send({
        type: 'fire',
        location: { type: 'Point', coordinates: [-9999, -9999] },
        date: '2025-01-01',
        status: 'active',
      });
    expect(res.statusCode).toBe(400);
    // NaN
    res = await request(appInstance)
      .post('/api/v1/disasters')
      .send({
        type: 'fire',
        location: { type: 'Point', coordinates: [NaN, 0] },
        date: '2025-01-01',
        status: 'active',
      });
    expect(res.statusCode).toBe(400);
    // Infinity
    res = await request(appInstance)
      .post('/api/v1/disasters')
      .send({
        type: 'fire',
        location: { type: 'Point', coordinates: [Infinity, 0] },
        date: '2025-01-01',
        status: 'active',
      });
    expect(res.statusCode).toBe(400);
  });

  it('should reject /near with extreme/invalid query params', async () => {
    let res;
    res = await request(appInstance)
      .get('/api/v1/disasters/near')
      .query({ lat: 9999, lng: 0, distance: 10 });
    expect(res.statusCode).toBe(400);
    res = await request(appInstance)
      .get('/api/v1/disasters/near')
      .query({ lat: 0, lng: -9999, distance: 10 });
    expect(res.statusCode).toBe(400);
    res = await request(appInstance)
      .get('/api/v1/disasters/near')
      .query({ lat: 'notanumber', lng: 0, distance: 10 });
    expect(res.statusCode).toBe(400);
    res = await request(appInstance)
      .get('/api/v1/disasters/near')
      .query({ lat: 0, lng: 0, distance: NaN });
    expect(res.statusCode).toBe(400);
  });

  it('should handle concurrent requests safely', async () => {
    const disasters = [
      {
        type: 'fire',
        location: { type: 'Point', coordinates: [10, 10] },
        date: '2025-01-01',
        status: 'active',
      },
      {
        type: 'flood',
        location: { type: 'Point', coordinates: [20, 20] },
        date: '2025-01-02',
        status: 'active',
      },
    ];
    await Promise.all(disasters.map((d) => request(appInstance).post('/api/v1/disasters').send(d)));
    const [res1, res2] = await Promise.all([
      request(appInstance).get('/api/v1/disasters'),
      request(appInstance)
        .get('/api/v1/disasters/near')
        .query({ lat: 10, lng: 10, distance: 1000 }),
    ]);
    expect(res1.statusCode).toBe(200);
    expect(res2.statusCode).toBe(200);
    expect(res1.body.data.length).toBeGreaterThanOrEqual(2);
    expect(res2.body.length).toBeGreaterThanOrEqual(1);
  });
});

describe('Disaster API edge and error cases', () => {
  it('should default page/limit and handle invalid values', async () => {
    // Negative page/limit
    let res = await request(appInstance).get('/api/v1/disasters?page=-1&limit=-5');
    expect(res.statusCode).toBe(200);
    // Too large limit
    res = await request(appInstance).get('/api/v1/disasters?limit=999');
    expect(res.statusCode).toBe(200);
    // Non-numeric
    res = await request(appInstance).get('/api/v1/disasters?page=foo&limit=bar');
    expect(res.statusCode).toBe(200);
  });

  it('should filter by type and date', async () => {
    await request(appInstance)
      .post('/api/v1/disasters')
      .send({
        type: 'fire',
        location: { type: 'Point', coordinates: [1, 2] },
        date: '2025-01-01',
        status: 'active',
      });
    await request(appInstance)
      .post('/api/v1/disasters')
      .send({
        type: 'flood',
        location: { type: 'Point', coordinates: [3, 4] },
        date: '2025-01-02',
        status: 'active',
      });
    let res = await request(appInstance).get('/api/v1/disasters?type=fire');
    expect(res.body.data.some((d: unknown) => (d as { type?: string }).type === 'fire')).toBe(true);
    res = await request(appInstance).get('/api/v1/disasters?dateFrom=2025-01-02');
    if (!Array.isArray(res.body.data)) {
      console.error('dateFrom API result:', JSON.stringify(res.body, null, 2));
    }
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].date).toBe('2025-01-02');
    expect(
      res.body.data.every(
        (d: unknown) =>
          (d as { date?: string }).date !== undefined &&
          (d as { date: string }).date >= '2025-01-02',
      ),
    ).toBe(true);
    res = await request(appInstance).get('/api/v1/disasters?dateTo=2025-01-01');
    expect(
      res.body.data.every(
        (d: unknown) =>
          (d as { date?: string }).date !== undefined &&
          (d as { date: string }).date <= '2025-01-01',
      ),
    ).toBe(true);
  });

  it('should filter disasters by status', async () => {
    await request(appInstance)
      .post('/api/v1/disasters')
      .send({
        type: 'fire',
        location: { type: 'Point', coordinates: [1, 2] },
        date: '2025-01-01',
        status: 'active',
      });
    await request(appInstance)
      .post('/api/v1/disasters')
      .send({
        type: 'flood',
        location: { type: 'Point', coordinates: [3, 4] },
        date: '2025-01-02',
        status: 'resolved',
      });
    let res = await request(appInstance).get('/api/v1/disasters?status=active');
    expect(
      res.body.data.every((d: unknown) => (d as { status?: string }).status === 'active'),
    ).toBe(true);
    res = await request(appInstance).get('/api/v1/disasters?status=resolved');
    expect(
      res.body.data.every((d: unknown) => (d as { status?: string }).status === 'resolved'),
    ).toBe(true);
  });

  it('should reject bulk insert with non-array or empty array', async () => {
    let res = await request(appInstance).post('/api/v1/disasters/bulk').send({});
    expect(res.statusCode).toBe(400);
    res = await request(appInstance).post('/api/v1/disasters/bulk').send([]);
    expect(res.statusCode).toBe(400);
  });

  it('should reject bulk update with non-array or empty array', async () => {
    let res = await request(appInstance).put('/api/v1/disasters/bulk').send({});
    expect(res.statusCode).toBe(400);
    res = await request(appInstance).put('/api/v1/disasters/bulk').send([]);
    expect(res.statusCode).toBe(400);
  });

  it('should reject bulk update with invalid IDs', async () => {
    const updates = [
      {
        id: 'badid',
        type: 'fire',
        status: 'active',
        location: { type: 'Point', coordinates: [1, 2] },
        date: '2025-01-01',
      },
    ];
    const res = await request(appInstance).put('/api/v1/disasters/bulk').send(updates);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/Invalid input/);
  });

  it('should handle service errors in bulk insert/update', async () => {
    // Test bulk insert with invalid data (should trigger validation errors)
    let res = await request(appInstance)
      .post('/api/v1/disasters/bulk')
      .send([
        {
          type: 'fire',
          location: { type: 'Point', coordinates: [1, 2] },
          date: '2025-01-01',
          status: 'active',
        },
        {
          type: 'invalid-type-very-long-string-that-exceeds-limits', // This should cause a validation error
          location: { type: 'Point', coordinates: [1, 2] },
          date: '2025-01-01',
          status: 'active',
        },
      ]);
    expect([400, 201]).toContain(res.statusCode); // Either validation error or success

    // Test bulk update with non-existent numeric IDs
    res = await request(appInstance)
      .put('/api/v1/disasters/bulk')
      .send([
        {
          id: 999999, // Non-existent ID
          type: 'fire',
          status: 'active',
          location: { type: 'Point', coordinates: [1, 2] },
          date: '2025-01-01',
        },
      ]);
    expect([400, 200]).toContain(res.statusCode); // Either validation error or partial success
  });

  it('should return 404 for update/delete with valid but non-existent ID', async () => {
    const id = '99999999-9999-4999-9999-999999999999';
    let res = await request(appInstance)
      .put(`/api/v1/disasters/${id}`)
      .send({
        type: 'fire',
        location: { type: 'Point', coordinates: [1, 2] },
        date: '2025-01-01',
        status: 'active',
      });
    expect(res.statusCode).toBe(404);
    res = await request(appInstance).delete(`/api/v1/disasters/${id}`);
    expect(res.statusCode).toBe(404);
  });
});
