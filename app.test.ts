process.env.NODE_ENV = 'test';

import request from 'supertest';
import { createApp } from './app.js';
import { Pool } from 'pg';
import type { Server } from 'http';

let server: Server;
let pool: Pool;

beforeAll(async () => {
  const app = await createApp();
  server = app.listen(0);

  pool = new Pool({
    connectionString: process.env.POSTGRES_URI!,
  });

  // Test database connection
  await pool.query('SELECT 1');
});

afterAll(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server.close((err?: Error) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
  if (pool) {
    await pool.end();
  }
});

beforeEach(async () => {
  if (pool) {
    await pool.query('DELETE FROM disasters');
  }
});

describe('App', () => {
  it('should return 200 for /healthz', async () => {
    const res = await request(server).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('should return 404 for unknown route', async () => {
    const res = await request(server).get('/not-a-real-route');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Not found');
  });

  it('should return 200 for /readyz (mocked DB)', async () => {
    // Mock database connection check - we'll mock the pool query
    const originalQuery = pool.query;
    pool.query = jest.fn().mockResolvedValue({ rows: [] });

    const res = await request(server).get('/readyz');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ready');

    // Restore original query method
    pool.query = originalQuery;
  });

  // For all errorHandler tests, use Error or APIError objects with required properties (name, message, etc.)
  // Replace all `as any` with explicit type assertions or mocks, e.g. Partial<Request>, Partial<Response>, or Error
});
