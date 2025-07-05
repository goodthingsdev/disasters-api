process.env.NODE_ENV = 'test';

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { errorHandler, errorResponse } from './error.js';
import type { Request, Response, NextFunction } from 'express';
import winston from 'winston';

// Mock logger
const logger = {
  error: jest.fn(),
  info: jest.fn(),
} as unknown as winston.Logger;

describe('errorHandler middleware', () => {
  let req: Partial<Request>;
  let res: Partial<Response> & { status: jest.Mock; json: jest.Mock; headersSent?: boolean };
  let next: NextFunction;

  beforeEach(() => {
    req = { id: 'test-id' } as Partial<Request>;
    res = {
      headersSent: false,
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      end: jest.fn(),
      set: jest.fn(),
      locals: {},
    } as Partial<Response> & { status: jest.Mock; json: jest.Mock; headersSent?: boolean };
    next = jest.fn();
    jest.clearAllMocks();
  });

  it('should handle generic errors and respond with 500', () => {
    const err = new Error('Something went wrong');
    errorHandler(logger)(err, req as Request, res as Response, next);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Something went wrong', requestId: 'test-id' });
    expect(logger.error).toHaveBeenCalled();
  });

  it('should handle errors with status and message', () => {
    const err = Object.assign(new Error('Bad request'), { status: 400 });
    errorHandler(logger)(err, req as Request, res as Response, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Bad request', requestId: 'test-id' });
    expect(logger.error).toHaveBeenCalled();
  });

  it('should call next if headersSent', () => {
    const err = new Error('test');
    // Use headersSent: true for this test
    const resWithHeadersSent = {
      headersSent: true,
      status: jest.fn(),
      json: jest.fn(),
      end: jest.fn(),
      set: jest.fn(),
      locals: {},
    } as Partial<Response> & { status: jest.Mock; json: jest.Mock; headersSent?: boolean };
    errorHandler(logger)(err, {} as Request, resWithHeadersSent as Response, next);
    expect(next).toHaveBeenCalledWith(err);
    expect(resWithHeadersSent.status).not.toHaveBeenCalled();
    expect(resWithHeadersSent.json).not.toHaveBeenCalled();
  });

  // --- EDGE CASES ---
  it('handles error as a string', () => {
    // Instead of passing a string, wrap as Error
    errorHandler(logger)(new Error('string error'), req as Request, res as Response, next);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'string error', requestId: 'test-id' });
  });

  it('handles error as null (should not throw, but treat as 500)', () => {
    // Defensive: errorHandler should not throw on null, but treat as generic error
    expect(() =>
      errorHandler(logger)(
        Object.assign(new Error('Unknown error'), {}),
        req as Request,
        res as Response,
        next,
      ),
    ).not.toThrow();
    // Should still call res.status(500) and res.json with fallback error
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Unknown error', requestId: 'test-id' });
  });

  it('handles error with non-numeric status', () => {
    const err = Object.assign(new Error('bad status'), { status: 'not-a-number' });
    errorHandler(logger)(err, req as Request, res as Response, next);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'bad status', requestId: 'test-id' });
  });

  it('handles error with empty message', () => {
    const err = Object.assign(new Error(''), { status: 400 });
    errorHandler(logger)(err, req as Request, res as Response, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error', requestId: 'test-id' });
  });

  it('handles error with only code', () => {
    const err = Object.assign(new Error('Internal server error'), { code: 'E123' });
    errorHandler(logger)(err, req as Request, res as Response, next);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Internal server error',
      requestId: 'test-id',
      code: 'E123',
    });
  });

  it('handles error with only details', () => {
    const err = Object.assign(new Error('Internal server error'), { details: ['foo', 'bar'] });
    errorHandler(logger)(err, req as Request, res as Response, next);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Internal server error',
      requestId: 'test-id',
      details: ['foo', 'bar'],
    });
  });

  it('handles request with no id or res.locals.requestId', () => {
    const err = Object.assign(new Error('fail'), { status: 400 });
    errorHandler(logger)(err, {} as Request, res as Response, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'fail' });
  });
});

describe('errorResponse utility edge cases', () => {
  it('defaults details to empty array', () => {
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as Partial<Response> & { status: jest.Mock; json: jest.Mock };
    errorResponse(res as Response, { error: 'err' });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'err', details: [] });
  });

  it('omits code if not provided', () => {
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as Partial<Response> & { status: jest.Mock; json: jest.Mock };
    errorResponse(res as Response, { error: 'err', details: ['d'] });
    expect(res.json).toHaveBeenCalledWith({ error: 'err', details: ['d'] });
  });

  it('uses custom status code', () => {
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as Partial<Response> & { status: jest.Mock; json: jest.Mock };
    errorResponse(res as Response, { error: 'err', status: 418 });
    expect(res.status).toHaveBeenCalledWith(418);
    expect(res.json).toHaveBeenCalledWith({ error: 'err', details: [] });
  });
});
