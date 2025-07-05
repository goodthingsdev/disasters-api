import request from 'supertest';
import { createApp } from './app.js';
let appInstance: import('express').Application;
let server: import('http').Server;

describe('E2E: Health and Metrics', () => {
  beforeAll(async () => {
    appInstance = await createApp();
    server = appInstance.listen(5000);
  });
  afterAll(() => {
    server.close();
  });

  it('should return 200 and status ok for /healthz', async () => {
    const res = await request(server).get('/healthz');
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body).toHaveProperty('uptime');
    expect(res.body).toHaveProperty('timestamp');
  });

  it('should return Prometheus metrics at /metrics', async () => {
    const res2 = await request(server).get('/metrics');
    expect(res2.statusCode).toBe(200);
    expect(res2.text).toMatch(/# HELP/);
    expect(res2.text).toMatch(/process_cpu_user_seconds_total/);
  });
});
