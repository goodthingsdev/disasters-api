import winston from 'winston';
import { Response, Request, NextFunction } from 'express';

// Define a type-safe API error interface
export interface APIError extends Error {
  status?: number;
  code?: string;
  details?: unknown[];
}

// Centralized error response and error handler for the API
export function errorResponse(
  res: Response,
  {
    error,
    details = [],
    code = undefined,
    status = 400,
  }: { error: string; details?: unknown[]; code?: string; status?: number },
) {
  // Always include details, default to empty array
  const body: { error: string; details: unknown[]; code?: string } = {
    error,
    details: details || [],
  };
  if (code) body.code = code;
  return res.status(status).json(body);
}

export function errorHandler(logger: winston.Logger) {
  return (err: Error | APIError, req: Request, res: Response, next: NextFunction): void => {
    // Defensive: treat null/undefined error as a generic error object
    if (!err) err = { name: 'Error', message: 'Unknown error' } as Error;
    // Defensive: ensure res and res.headersSent are defined
    if (!res || typeof res.headersSent === 'undefined') {
      // If res is missing or incomplete (test/mock), send a minimal error JSON if possible
      if (res && typeof res.status === 'function' && typeof res.json === 'function') {
        res.status(500).json({
          error: err.message || 'Internal server error',
          details: [],
          code: (err as APIError).code,
        });
        return;
      }
      // If res is not a valid object, just return (do not call next) to avoid Express/finalhandler crash
      return;
    }
    if (res.headersSent) return next(err);
    const apiErr = err as APIError;
    const status = typeof apiErr.status === 'number' ? apiErr.status : 500;
    const message = apiErr.message || 'Internal server error';
    const requestId =
      (req as unknown as { id?: string }).id ||
      (res.locals && (res.locals as { requestId?: string }).requestId);
    logger.error('UNHANDLED ERROR', {
      error: err,
      message: apiErr.message,
      stack: apiErr.stack,
      route: req.originalUrl,
      method: req.method,
      body: req.body,
      query: req.query,
      params: req.params,
      requestId,
    });
    const body: { error: string; requestId?: string; code?: string; details?: unknown[] } = {
      error: message,
    };
    if (requestId) body.requestId = requestId;
    if (apiErr.code) body.code = apiErr.code;
    if (apiErr.details) body.details = apiErr.details;
    res.status(status).json(body);
  };
}
