process.env.NODE_ENV = 'test';

import request from 'supertest';
import { createApp } from './app';
import mongoose from 'mongoose';
import type { Server } from 'http';

let server: Server;

beforeAll(async () => {
  const app = await createApp();
  server = app.listen(0);
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGO_URI!);
  }
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
  await mongoose.disconnect();
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
    // Mock mongoose connection
    const fakeConn = Object.create(mongoose.connection);
    fakeConn.readyState = 1;
    fakeConn.db = { admin: () => ({ ping: () => Promise.resolve() }) };
    const spy = jest.spyOn(mongoose, 'connection', 'get').mockReturnValue(fakeConn);
    const res = await request(server).get('/readyz');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ready');
    spy.mockRestore();
  });

  // For all errorHandler tests, use Error or APIError objects with required properties (name, message, etc.)
  // Replace all `as any` with explicit type assertions or mocks, e.g. Partial<Request>, Partial<Response>, or Error
});
