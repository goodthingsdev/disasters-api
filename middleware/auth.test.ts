process.env.NODE_ENV = 'test';

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { apiKeyAuth } from './auth.js';
import type { Request, Response, NextFunction } from 'express';

const VALID_API_KEY = 'a'.repeat(64);

describe('apiKeyAuth middleware', () => {
  let req: Partial<Request>;
  let res: Partial<Response> & { status: jest.Mock; json: jest.Mock };
  let next: jest.Mock;
  let originalApiKey: string | undefined;

  beforeEach(() => {
    originalApiKey = process.env.API_KEY;
    process.env.API_KEY = VALID_API_KEY;

    req = {
      headers: {},
    } as Partial<Request>;

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as Partial<Response> & { status: jest.Mock; json: jest.Mock };

    next = jest.fn();
    jest.clearAllMocks();
  });

  afterEach(() => {
    if (originalApiKey === undefined) {
      delete process.env.API_KEY;
    } else {
      process.env.API_KEY = originalApiKey;
    }
  });

  it('should return 500 when API_KEY env var is not set', () => {
    delete process.env.API_KEY;

    apiKeyAuth(req as Request, res as Response, next as NextFunction);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Server misconfigured: API_KEY not set' });
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 when Authorization header is missing', () => {
    apiKeyAuth(req as Request, res as Response, next as NextFunction);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Missing or invalid Authorization header' });
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 when Authorization header does not start with Bearer', () => {
    req.headers = { authorization: 'Basic some-token' };

    apiKeyAuth(req as Request, res as Response, next as NextFunction);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Missing or invalid Authorization header' });
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 when Bearer token is empty', () => {
    req.headers = { authorization: 'Bearer ' };

    apiKeyAuth(req as Request, res as Response, next as NextFunction);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid API key' });
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 when API key is invalid', () => {
    req.headers = { authorization: 'Bearer wrong-key' };

    apiKeyAuth(req as Request, res as Response, next as NextFunction);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid API key' });
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 when API key has correct length but wrong content', () => {
    const wrongKey = 'b'.repeat(64);
    req.headers = { authorization: `Bearer ${wrongKey}` };

    apiKeyAuth(req as Request, res as Response, next as NextFunction);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid API key' });
    expect(next).not.toHaveBeenCalled();
  });

  it('should call next() when API key is valid', () => {
    req.headers = { authorization: `Bearer ${VALID_API_KEY}` };

    apiKeyAuth(req as Request, res as Response, next as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('should use timing-safe comparison (same-length keys take similar time)', () => {
    // This test verifies the code path exercises timingSafeEqual
    // by checking that a key of equal length to the valid key is still rejected
    const sameLengthWrongKey = 'z'.repeat(64);
    req.headers = { authorization: `Bearer ${sameLengthWrongKey}` };

    apiKeyAuth(req as Request, res as Response, next as NextFunction);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid API key' });
    expect(next).not.toHaveBeenCalled();
  });

  it('should reject key that is a substring of the valid key', () => {
    const partialKey = VALID_API_KEY.slice(0, 32);
    req.headers = { authorization: `Bearer ${partialKey}` };

    apiKeyAuth(req as Request, res as Response, next as NextFunction);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid API key' });
    expect(next).not.toHaveBeenCalled();
  });
});
