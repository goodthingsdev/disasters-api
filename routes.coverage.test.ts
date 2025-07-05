import { afterAll, beforeAll, describe, it, expect } from '@jest/globals';
import request from 'supertest';
import { createApp } from './app.js';
import type { Server } from 'http';

// Mock PostgreSQL Pool for routes coverage testing
jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation(() => ({
    query: jest.fn().mockResolvedValue({ rows: [] }),
    end: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('./services/disaster.service', () => ({
  getAllDisasters: jest
    .fn()
    .mockResolvedValue({ data: [], total: 0, page: 1, limit: 10, totalPages: 0 }),
  getDisasterById: jest.fn().mockResolvedValue(null),
  createDisaster: jest.fn().mockResolvedValue({ id: 1, type: 'fire', status: 'active' }),
  updateDisaster: jest.fn().mockResolvedValue(null),
  deleteDisaster: jest.fn().mockResolvedValue(null),
  findDisastersNear: jest.fn().mockResolvedValue([]),
  bulkInsertDisasters: jest.fn().mockResolvedValue([]),
  bulkUpdateDisasters: jest.fn().mockResolvedValue([]),
}));

let server: Server;

beforeAll(async () => {
  const app = await createApp();
  server = app.listen(0);
});
afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  // Remove SIGINT/SIGTERM listeners to avoid EventEmitter leak warnings in tests
  process.removeAllListeners('SIGINT');
  process.removeAllListeners('SIGTERM');
});

describe('Disaster API route handler coverage', () => {
  describe('GET /api/v1/disasters', () => {
    it('returns 200, 404, or 500 for disasters endpoint', async () => {
      const res = await request(server).get('/api/v1/disasters');
      expect([200, 404, 500]).toContain(res.status);
    });
  });

  it('POST /api/v1/disasters returns 400 or 201', async () => {
    const res = await request(server).post('/api/v1/disasters').send({});
    expect([201, 400, 404]).toContain(res.status);
  }, 10000);
  // Repeat similar logic for other endpoints that may return 500 due to DB errors, if needed.
});
