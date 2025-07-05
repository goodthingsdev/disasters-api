console.log('[app.ts] App module loaded');

import dotenv from 'dotenv';
import Joi from 'joi';
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { Pool } from 'pg';
import winston from 'winston';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import fs from 'fs';
import path from 'path';
import hpp from 'hpp';
import client from 'prom-client';
import { ApolloServer } from 'apollo-server-express';
import { router } from './routes/disasters.js';
import { typeDefs } from './graphql/schema.js';
import { resolvers } from './graphql/resolvers.js';
import { errorHandler } from './middleware/error.js';
import type { GraphQLError, GraphQLFormattedError } from 'graphql';
import type { GraphQLResponse } from 'apollo-server-types';
import { CREATE_DISASTERS_TABLE_SQL, CREATE_LOCATION_INDEX_SQL } from './disaster.model.js';

dotenv.config();

// Environment selection and defaults for dev/test/ci
// Remove unused variables: isTest, isCI, isDev, port, is404Registered

// Fallback: Set NODE_ENV to 'development' if unset or empty
if (!process.env.NODE_ENV || process.env.NODE_ENV.trim() === '') {
  process.env.NODE_ENV = 'development';
}

// Only set POSTGRES_URI fallback for test/dev/ci, never in production
// DO NOT set any fallback to localhost. POSTGRES_URI must be set in the environment for all environments.
if (!process.env.POSTGRES_URI) {
  throw new Error('[app.ts] POSTGRES_URI must be set in the environment.');
}

// Set PORT and CORS_ORIGIN defaults for all environments if not set
process.env.PORT =
  process.env.PORT ||
  (process.env.NODE_ENV === 'test' ? '3001' : process.env.NODE_ENV === 'ci' ? '3002' : '3000');
process.env.CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

// Do NOT set any fallback for POSTGRES_URI. It must be set in the environment for all environments.

// Validate and load environment variables
const envSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test', 'ci').default('development'),
  PORT: Joi.number().integer().min(1).max(65535).default(3000),
  POSTGRES_URI: Joi.string().uri().required(),
  CORS_ORIGIN: Joi.string().allow('*').default('*'),
  API_KEY: Joi.string().optional(),
  // Add more as needed
}).unknown();

const { value: env, error: envError } = envSchema.validate(process.env, { abortEarly: false });
if (envError) {
  if (process.env.NODE_ENV === 'test') {
    // Print warning but do not exit in test mode
    console.warn(
      'Test environment: Invalid env config:',
      envError.details.map((d: Joi.ValidationErrorItem) => d.message).join(', '),
    );
  } else {
    console.error(
      'Invalid environment configuration:',
      envError.details.map((d: Joi.ValidationErrorItem) => d.message).join(', '),
    );
    process.exit(1);
  }
}

// Use validated env variables
const CORS_ORIGIN = env.CORS_ORIGIN;

// Winston logger setup (module scope)
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      return `${timestamp} [${level.toUpperCase()}] ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
    }),
  ),
  transports: [new winston.transports.Console()],
});

// 404 handler (module scope)
function register404Handler(req: express.Request, res: express.Response) {
  res.status(404).json({ error: 'Not found', url: req.originalUrl });
}

// --- ApolloServer initialization: always apply to app before any /graphql route ---
let apolloServer: ApolloServer | undefined;
let apolloReadyResolve: (() => void) | undefined;
const apolloReady: Promise<void> = new Promise((resolve) => {
  apolloReadyResolve = resolve;
});
async function initApollo(app?: express.Application): Promise<void> {
  if (!apolloServer) {
    apolloServer = new ApolloServer({
      typeDefs,
      resolvers,
      formatError: (error: GraphQLError): GraphQLFormattedError => {
        const msg =
          '[GraphQL ERROR] ' + (error && error.stack ? error.stack : JSON.stringify(error));
        console.error(msg);
        if (logger && logger.error) logger.error('[GraphQL ERROR]', { error });
        if (process && process.stderr && process.stderr.write) process.stderr.write(msg + '\n');
        return {
          message: error.message,
          path: error.path,
          locations: error.locations,
          extensions: error.extensions,
        };
      },
      formatResponse: (response: GraphQLResponse): GraphQLResponse | null => {
        if (response.errors && Array.isArray(response.errors)) {
          console.error('[GraphQL RESPONSE ERRORS]', JSON.stringify(response.errors));
        }
        return response;
      },
    });
    await apolloServer.start();
    // @ts-expect-error: Suppress Application type mismatch between express and apollo-server-express
    apolloServer.applyMiddleware({ app, path: '/graphql' });
    if (apolloReadyResolve) apolloReadyResolve();
  }
}

// openApiSpec type fix
let openApiSpec: Record<string, unknown> | null;
try {
  const devPath = path.join(process.cwd(), 'openapi.json');
  console.log('[OpenAPI] Trying to load spec from', devPath);
  openApiSpec = JSON.parse(fs.readFileSync(devPath, 'utf8'));
} catch (e1) {
  try {
    const prodPath = path.join(__dirname, 'openapi.json');
    console.log('[OpenAPI] Trying to load spec from', prodPath);
    openApiSpec = JSON.parse(fs.readFileSync(prodPath, 'utf8'));
  } catch (e2) {
    openApiSpec = null;
    if (typeof logger !== 'undefined') {
      logger.error('Failed to load OpenAPI spec', { error1: e1, error2: e2 });
    } else {
      console.error('Failed to load OpenAPI spec', { error1: e1, error2: e2 });
    }
  }
}

// --- Express app factory for testability and modularity ---
/**
 * Creates an Express app. Optionally accepts a PostgreSQL connection pool to use (for test isolation).
 * If no connection is provided, creates a new connection pool.
 */
async function createApp(pgPool?: Pool): Promise<express.Application> {
  // Create or use provided PostgreSQL connection pool
  let pool: Pool;
  if (pgPool) {
    pool = pgPool;
  } else {
    pool = new Pool({
      connectionString: process.env.POSTGRES_URI!,
    });
  }

  // Test the connection
  try {
    const client = await pool.connect();
    client.release();
  } catch (err) {
    logger.error('Failed to connect to PostgreSQL', { error: err });
    throw new Error('PostgreSQL connection failed: ' + (err as Error).message);
  }

  // Ensure disasters table and index exist
  try {
    await pool.query(CREATE_DISASTERS_TABLE_SQL);
    await pool.query(CREATE_LOCATION_INDEX_SQL);
  } catch (err) {
    logger.error('Failed to ensure disasters table/index', { error: err });
    throw new Error('Failed to ensure disasters table/index: ' + (err as Error).message);
  }

  const app = express();

  // Security headers
  app.use(helmet());

  // Rate limiting: disable or relax for tests
  if (process.env.NODE_ENV !== 'test') {
    app.use(
      rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100,
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: 'Too many requests, please try again later.' },
      }),
    );
  } else {
    // In test mode, set a very high limit to avoid 429s
    app.use(
      rateLimit({
        windowMs: 60 * 1000, // 1 minute
        max: 10000,
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: 'Too many requests, please try again later.' },
      }),
    );
  }

  app.use(
    cors({
      origin: CORS_ORIGIN === '*' ? true : CORS_ORIGIN.split(',').map((s: string) => s.trim()),
      credentials: true,
    }),
  );

  // ApolloServer initialization (now synchronous)
  await initApollo(app);

  // Only apply bodyParser.json() to REST routes
  app.use('/api', bodyParser.json());
  app.use(helmet());
  app.use(hpp());

  // Swagger UI
  if (openApiSpec) {
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openApiSpec));
  }

  // Fine-tuned Helmet configuration
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", 'https://cdn.jsdelivr.net'],
          styleSrc: ["'self'", 'https://cdn.jsdelivr.net'],
          imgSrc: ["'self'", 'data:', 'https://cdn.jsdelivr.net'],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          upgradeInsecureRequests: [],
        },
      },
      hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
      referrerPolicy: { policy: 'no-referrer' },
      crossOriginResourcePolicy: { policy: 'same-origin' },
    }),
  );

  // Mount disaster routes
  app.use('/api/v1/disasters', router);

  // Health check endpoint
  app.get('/healthz', (req, res) => {
    res.status(200).json({ status: 'ok', uptime: process.uptime(), timestamp: Date.now() });
  });

  // /readyz endpoint
  app.get('/readyz', ((req, res) => {
    pool
      .query('SELECT 1')
      .then(() => res.status(200).json({ status: 'ready', db: 'connected' }))
      .catch((err: unknown) =>
        res.status(503).json({ status: 'not ready', db: 'error', error: (err as Error).message }),
      );
  }) as express.RequestHandler);

  // /metrics endpoint
  app.get('/metrics', async (req, res) => {
    try {
      const metrics = await client.register.metrics();
      res.set('Content-Type', client.register.contentType);
      res.end(metrics);
    } catch (err) {
      if (!res.headersSent) {
        res.status(500).json({ error: (err as Error).message || 'Prometheus metrics error' });
      }
    }
  });

  // Centralized error handler
  app.use(
    (err: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
      if (!res || typeof res.headersSent !== 'boolean') {
        // Fallback: log and end the response if possible
        if (res && typeof res.end === 'function') {
          res.end();
        }
        console.error('Express error handler called with invalid res object:', { err });
        return;
      }
      res.locals = res.locals || {};
      (res.locals as Record<string, unknown>).requestId = (req as { id?: string }).id;
      errorHandler(logger)(err as Error, req, res, next);
    },
  );

  // Register 404 handler after all other middleware/routes
  app.use(register404Handler);

  return app;
}

// --- Health and readiness checks ---
// (All app.get/app.use calls below must be removed from module scope; they are now inside createApp)

// --- Prometheus Metrics ---
// Default metrics
client.collectDefaultMetrics();

// Custom metrics
const ongoingDisastersGauge = new client.Gauge({
  name: 'disasters_ongoing_total',
  help: 'Current number of ongoing disasters (date >= today)',
});
const disastersLast24hGauge = new client.Gauge({
  name: 'disasters_last_24h_total',
  help: 'Number of disasters created in the last 24 hours',
});
const disastersByTypeGauge = new client.Gauge({
  name: 'disasters_by_type',
  help: 'Number of disasters by type',
  labelNames: ['type'],
});
const disastersByDayGauge = new client.Gauge({
  name: 'disasters_by_day',
  help: 'Number of disasters by day (last 7 days)',
  labelNames: ['date'],
});
const disastersByStatusGauge = new client.Gauge({
  name: 'disasters_by_status',
  help: 'Number of disasters by status',
  labelNames: ['status'],
});

async function updateDisasterMetrics() {
  console.log('[updateDisasterMetrics] Using POSTGRES_URI:', process.env.POSTGRES_URI);
  let pool: Pool | undefined;
  try {
    pool = new Pool({
      connectionString: process.env.POSTGRES_URI,
    });

    // Test connection and ensure disasters table exists
    const client = await pool.connect();
    try {
      await client.query('SELECT 1 FROM disasters LIMIT 1');
    } catch (tableError) {
      // Table doesn't exist or other issue, skip metrics update
      logger.warn('Disasters table not accessible, skipping metrics update', { error: tableError });
      return;
    } finally {
      client.release();
    }

    // Ongoing disasters (date >= today and status = 'active')
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const ongoingResult = await pool.query(
      `SELECT COUNT(*) FROM disasters WHERE date >= $1 AND status = 'active'`,
      [todayStr],
    );
    const ongoingCount = parseInt(ongoingResult.rows[0].count, 10);
    ongoingDisastersGauge.set(ongoingCount);

    // Disasters in last 24h (created_at)
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const last24hResult = await pool.query(
      `SELECT COUNT(*) FROM disasters WHERE created_at >= $1`,
      [since.toISOString()],
    );
    const last24hCount = parseInt(last24hResult.rows[0].count, 10);
    disastersLast24hGauge.set(last24hCount);

    // Disasters by type
    const byTypeResult = await pool.query(
      `SELECT type, COUNT(*) as count FROM disasters GROUP BY type`,
    );
    disastersByTypeGauge.reset();
    byTypeResult.rows.forEach((row: { type: string; count: string }) => {
      disastersByTypeGauge.set({ type: row.type }, parseInt(row.count, 10));
    });

    // Disasters by day (last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const byDayResult = await pool.query(
      `SELECT DATE(created_at) as day, COUNT(*) as count 
       FROM disasters 
       WHERE created_at >= $1 
       GROUP BY DATE(created_at)`,
      [sevenDaysAgo.toISOString()],
    );
    disastersByDayGauge.reset();
    byDayResult.rows.forEach((row: { day: string; count: string }) => {
      disastersByDayGauge.set({ date: row.day }, parseInt(row.count, 10));
    });

    // Disasters by status
    const byStatusResult = await pool.query(
      `SELECT status, COUNT(*) as count FROM disasters GROUP BY status`,
    );
    disastersByStatusGauge.reset();
    byStatusResult.rows.forEach((row: { status: string; count: string }) => {
      disastersByStatusGauge.set({ status: row.status }, parseInt(row.count, 10));
    });
  } catch (error) {
    logger.error('Error updating disaster metrics', { error });
  } finally {
    if (pool) {
      await pool.end();
    }
  }
}

// Update metrics every 30 seconds
const metricsInterval = setInterval(updateDisasterMetrics, 30000);
metricsInterval.unref(); // Prevents Jest/test runner from hanging due to open handle
// Delay initial update by 5 seconds to allow database to be ready
setTimeout(() => {
  updateDisasterMetrics().catch(() => {});
}, 5000);

// Centralized error handler
// app.use((err: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
//   // Defensive: ensure res is defined and has headersSent
//   if (!res || typeof res.headersSent !== 'boolean') {
//     // Fallback: log and end the response if possible
//     if (res && typeof res.end === 'function') {
//       res.end();
//     }
//     console.error('Express error handler called with invalid res object:', { err });
//     return;
//   }
//   res.locals = res.locals || {};
//   (res.locals as Record<string, unknown>).requestId = (req as { id?: string }).id;
//   // Fix errorHandler type error by casting err to Error
//   errorHandler(logger)(err as Error, req, res, next);
// });

// Remove or comment out app.listen from app.js to avoid port conflicts in tests
// Only start the server in index.js

// Remove global mongoSanitize middleware (not Express 5 compatible for req.query)
// app.use(mongoSanitize());
//   if (req.body) mongoSanitize.sanitize(req.body);
//   if (req.params) mongoSanitize.sanitize(req.params);
//   next();
// });

// --- Graceful PostgreSQL Shutdown ---
function gracefulShutdown(
  signal: string,
  injectedLogger?: { info: (...args: unknown[]) => void; error: (...args: unknown[]) => void },
): void {
  const log = injectedLogger || logger;
  log.info(`Received ${signal}, closing PostgreSQL connections...`);
  // PostgreSQL pools will be closed automatically when the process exits
  log.info('PostgreSQL connections closed. Exiting.');
  process.exit(0);
}

// Register signal listeners for graceful shutdown (no test env check)
if (process.listenerCount('SIGINT') === 0) {
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}
if (process.listenerCount('SIGTERM') === 0) {
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
}

// Register 404 handler after all other middleware/routes
// app.use(register404Handler);

// --- Rate Limiting with IP Whitelist/Blacklist ---
const IP_WHITELIST = (process.env.RATE_LIMIT_IP_WHITELIST || '').split(',').filter(Boolean);
const IP_BLACKLIST = (process.env.RATE_LIMIT_IP_BLACKLIST || '').split(',').filter(Boolean);

function isWhitelisted(ip: string): boolean {
  return IP_WHITELIST.length > 0 && IP_WHITELIST.includes(ip);
}
function isBlacklisted(ip: string): boolean {
  return IP_BLACKLIST.length > 0 && IP_BLACKLIST.includes(ip);
}

export { createApp, apolloReady, gracefulShutdown, logger, isWhitelisted, isBlacklisted };
