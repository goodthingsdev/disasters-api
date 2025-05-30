import { describe, it, expect, jest } from '@jest/globals';
import { createApp, logger, isWhitelisted, isBlacklisted } from '../app';
import { errorHandler } from '../middleware/error';
import type { Request, Response, NextFunction } from 'express';

describe('app.ts utility/edge cases', () => {
  it('should export createApp as a function', () => {
    expect(typeof createApp).toBe('function');
  });

  it('should have a logger with error/info methods', () => {
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.info).toBe('function');
  });

  it('isWhitelisted and isBlacklisted work as expected', () => {
    expect(isWhitelisted('1.2.3.4')).toBe(false); // unless env is set
    expect(isBlacklisted('1.2.3.4')).toBe(false); // unless env is set
  });

  it('should not throw when calling error handler with generic error', () => {
    const err = new Error('fail');
    const req = { id: 'test' } as Partial<Request>;
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      locals: {},
    } as Partial<Response> & { status: jest.Mock; json: jest.Mock };
    const next = jest.fn() as NextFunction;
    expect(() => errorHandler(logger)(err, req as Request, res as Response, next)).not.toThrow();
  });
});
