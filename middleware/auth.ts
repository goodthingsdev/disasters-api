import { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'crypto';

/**
 * Express middleware that authenticates requests using a Bearer token
 * in the Authorization header. The token is compared against the API_KEY
 * environment variable using constant-time comparison to prevent timing attacks.
 *
 * Excluded from auth (handled at the app level): /healthz, /readyz, /metrics, /api-docs
 */
export function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
  const apiKey = process.env.API_KEY;

  if (!apiKey) {
    res.status(500).json({ error: 'Server misconfigured: API_KEY not set' });
    return;
  }

  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }

  const token = authHeader.slice(7); // Strip 'Bearer ' prefix
  const tokenBuffer = Buffer.from(token);
  const keyBuffer = Buffer.from(apiKey);

  if (tokenBuffer.length !== keyBuffer.length || !timingSafeEqual(tokenBuffer, keyBuffer)) {
    res.status(401).json({ error: 'Invalid API key' });
    return;
  }

  next();
}
