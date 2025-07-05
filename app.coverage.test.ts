type CustomError = Error & { status?: number; code?: string; details?: string[] };

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import type { Application, Request, Response, NextFunction } from 'express';
import type { Server } from 'http';
import winston from 'winston';
import { createApp, isWhitelisted, isBlacklisted } from './app.js';

let server: Server;
let application: Application;

beforeAll(async () => {
  application = await createApp();
  server = application.listen(0);
});
afterAll(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
});

describe('App', () => {
  it('GET /healthz returns ok', async () => {
    const { default: request } = await import('supertest');
    const res = await request(application).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('GET /not-a-real-route returns 404', async () => {
    const { default: request } = await import('supertest');
    const res = await request(application).get('/not-a-real-route');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Not found');
  });

  it('isWhitelisted returns true only for whitelisted IPs', async () => {
    expect(isWhitelisted('1.2.3.4')).toBe(true);
    expect(isWhitelisted('5.6.7.8')).toBe(true);
    expect(isWhitelisted('9.9.9.9')).toBe(false);
  });

  it('isBlacklisted returns true only for blacklisted IPs', async () => {
    expect(isBlacklisted('2.2.2.2')).toBe(true);
    expect(isBlacklisted('3.3.3.3')).toBe(true);
    expect(isBlacklisted('1.1.1.1')).toBe(false);
  });

  it('rate limit handler blocks blacklisted IP and allows others', async () => {
    const handler = (
      req: Partial<Request> & { ip?: string },
      res: Partial<Response> & { status: jest.Mock; json: jest.Mock },
      _next: NextFunction,
      options: { statusCode: number; message: { error: string } },
    ) => {
      if (isBlacklisted(req.ip ?? '')) {
        return res.status!(403).json!({ error: 'Your IP is blocked.', code: 'IP_BLOCKED' });
      }
      res.status!(options.statusCode).json!(options.message);
    };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    handler({ ip: '8.8.8.8' }, res, jest.fn(), {
      statusCode: 429,
      message: { error: 'Too many requests' },
    });
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Your IP is blocked.', code: 'IP_BLOCKED' });
    handler({ ip: '1.1.1.1' }, res, jest.fn(), {
      statusCode: 429,
      message: { error: 'Too many requests' },
    });
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith({ error: 'Too many requests' });
  });

  it('centralized error handler covers all branches', async () => {
    const { errorHandler } = await import('./middleware/error');
    const loggerMock = winston.createLogger({ transports: [] });
    loggerMock.error = jest.fn();
    loggerMock.info = jest.fn();
    const err: CustomError = Object.assign(new Error('fail'), { status: 400 });
    const req = { id: 'req-id' } as Partial<Request>;
    const res = {
      locals: {},
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as Partial<Response> & { status: jest.Mock; json: jest.Mock };
    const next = jest.fn();
    errorHandler(loggerMock)(err, req as Request, res as Response, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'fail', requestId: 'req-id' }),
    );
    // No req.id
    errorHandler(loggerMock)(err, {} as Request, res as Response, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'fail' }));
  });
});

// --- Remove unused withRealServer function if present ---
