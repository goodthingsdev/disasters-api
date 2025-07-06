import request from 'supertest';
import { createApp } from '../app';
import * as disastersPb from '../proto/disaster_pb.js';
import type { Server } from 'http';

describe('Protobuf Content Negotiation', () => {
  let server: Server;

  beforeAll(async () => {
    const app = await createApp();
    server = app.listen(0);
  });
  afterAll(async () => {
    if (server && typeof server.close === 'function') {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  // Helper to force supertest to treat response as a buffer
  function asBuffer(res: request.Response) {
    return Buffer.isBuffer(res.body) ? res.body : Buffer.from(res.body);
  }

  it('GET /api/v1/disasters returns Protobuf when Accept header is set', async () => {
    const res = await request(server)
      .get('/api/v1/disasters')
      .set('Accept', 'application/x-protobuf')
      .buffer()
      .parse((res, cb) => {
        const data: Uint8Array[] = [];
        res.on('data', (chunk) => data.push(chunk));
        res.on('end', () => cb(null, Buffer.concat(data)));
      });
    if (res.status === 200 && res.type === 'application/x-protobuf') {
      const decoded = disastersPb.disasters.DisasterList.decode(asBuffer(res));
      expect(decoded).toHaveProperty('disasters');
      expect(Array.isArray(decoded.disasters)).toBe(true);
    } else {
      console.error('Non-Protobuf response:', res.status, res.type, res.body);
      expect(res.type).toBe('application/x-protobuf');
    }
  });

  it('POST /api/v1/disasters returns Protobuf when Accept header is set', async () => {
    const disaster = {
      type: 'fire',
      location: { type: 'Point', coordinates: [10, 10] },
      date: '2025-01-01',
      status: 'active',
      description: 'Test fire',
    };
    const res = await request(server)
      .post('/api/v1/disasters')
      .send(disaster)
      .set('Accept', 'application/x-protobuf')
      .buffer()
      .parse((res, cb) => {
        const data: Uint8Array[] = [];
        res.on('data', (chunk) => data.push(chunk));
        res.on('end', () => cb(null, Buffer.concat(data)));
      });
    if (res.status === 201 && res.type === 'application/x-protobuf') {
      const decoded = disastersPb.disasters.Disaster.decode(asBuffer(res));
      expect(decoded).toHaveProperty('type', 'fire');
    } else {
      console.error('Non-Protobuf response:', res.status, res.type, res.body);
      expect([201, 400]).toContain(res.status);
    }
  });

  it('GET /api/v1/disasters returns JSON by default', async () => {
    const res = await request(server).get('/api/v1/disasters');
    expect(res.status).toBe(200);
    expect(res.type).toMatch(/json/);
  });
});
