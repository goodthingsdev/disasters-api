import dotenv from 'dotenv';
import Joi from 'joi';
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import mongoose from 'mongoose';
import winston from 'winston';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import fs from 'fs';
import path from 'path';
import hpp from 'hpp';
import mongoSanitize from 'express-mongo-sanitize';
import client from 'prom-client';
import { ApolloServer } from 'apollo-server-express';
import { router } from './routes/disasters';
import { typeDefs } from './graphql/schema';
import { resolvers } from './graphql/resolvers';
import {} from // createDisaster,
// getAllDisasters,
// countDisasters,
// getDisasterById,
// updateDisaster,
// deleteDisaster,
// findDisastersNear,
// bulkInsertDisasters,
// bulkUpdateDisasters,
'./services/disaster.service';
import { errorHandler } from './middleware/error';
import { Disaster } from './disaster.model';
import type { GraphQLError, GraphQLFormattedError } from 'graphql';
import type { GraphQLResponse } from 'apollo-server-types';

dotenv.config();

// Environment selection and defaults for dev/test/ci
// Remove unused variables: isTest, isCI, isDev, MONGO_URI, port, is404Registered

// Fallback: Set NODE_ENV to 'development' if unset or empty
if (!process.env.NODE_ENV || process.env.NODE_ENV.trim() === '') {
  process.env.NODE_ENV = 'development';
}
// Only set MONGO_URI fallback for test/dev/ci, never in production
if (process.env.NODE_ENV === 'test' && !process.env.MONGO_URI) {
  process.env.MONGO_URI = process.env.MONGO_URI_TEST || 'mongodb://localhost:27017/disasters_test';
} else if (
  (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'dev') &&
  !process.env.MONGO_URI
) {
  process.env.MONGO_URI = 'mongodb://localhost:27017/disasters_dev';
} else if ((!!process.env.CI || process.env.NODE_ENV === 'ci') && !process.env.MONGO_URI) {
  process.env.MONGO_URI = 'mongodb://localhost:27017/disasters_ci';
}
// In production, do NOT set a fallback for MONGO_URI. It must be set in the environment.

// Set PORT and CORS_ORIGIN defaults for all environments if not set
process.env.PORT =
  process.env.PORT ||
  (process.env.NODE_ENV === 'test' ? '3001' : process.env.NODE_ENV === 'ci' ? '3002' : '3000');
process.env.CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

// Do NOT set any fallback for MONGO_URI. It must be set in the environment for all environments.
// Remove all assignments like process.env.MONGO_URI = ... || 'mongodb://localhost:27017/...';
// If MONGO_URI is missing, validation below will fail and exit.

// Validate and load environment variables
const envSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test', 'ci').default('development'),
  PORT: Joi.number().integer().min(1).max(65535).default(3000),
  MONGO_URI: Joi.string().uri().required(),
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
  openApiSpec = JSON.parse(fs.readFileSync(path.join(__dirname, 'openapi.json'), 'utf8'));
} catch (e) {
  openApiSpec = null;
  // logger may not be initialized yet, so fallback to console
  if (typeof logger !== 'undefined') {
    logger.error('Failed to load OpenAPI spec', { error: e });
  } else {
    console.error('Failed to load OpenAPI spec', { error: e });
  }
}

// --- Express app factory for testability and modularity ---
/**
 * Creates an Express app. Optionally accepts a Mongoose connection to use (for test isolation).
 * If no connection is provided, uses the default mongoose connection.
 */
async function createApp(): Promise<express.Application> {
  // Always use mongoose.connect for connection management
  if (mongoose.connection.readyState === 0) {
    try {
      await mongoose.connect(process.env.MONGO_URI!);
    } catch (err) {
      logger.error('Failed to connect to MongoDB', { error: err });
      throw new Error('MongoDB connection failed: ' + (err as Error).message);
    }
  }
  if (mongoose.connection.readyState !== 1) {
    logger.error('MongoDB is not connected after connect()');
    throw new Error('MongoDB is not connected');
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

  // Ensure 2dsphere index for geospatial queries
  Disaster.collection
    .createIndex({ location: '2dsphere' })
    .catch((e) => logger.error('Index creation error', { error: e }));

  // Mount disaster routes
  app.use('/api/v1/disasters', router);

  // Health check endpoint
  app.get('/healthz', (req, res) => {
    res.status(200).json({ status: 'ok', uptime: process.uptime(), timestamp: Date.now() });
  });

  // /readyz endpoint
  app.get('/readyz', ((req, res) => {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ status: 'not ready', db: 'disconnected' });
    }
    if (mongoose.connection.db) {
      mongoose.connection.db
        .admin()
        .ping()
        .then(() => res.status(200).json({ status: 'ready', db: 'connected' }))
        .catch((err) =>
          res.status(503).json({ status: 'not ready', db: 'error', error: err.message }),
        );
    } else {
      res.status(200).json({ status: 'ready', db: 'connected' });
    }
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

  // Sanitize req.body and req.params only
  app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.body) mongoSanitize.sanitize(req.body);
    if (req.params) mongoSanitize.sanitize(req.params);
    next();
  });

  // Register 404 handler after all other middleware/routes
  app.use(register404Handler);

  return app;
}

// --- Health and readiness checks ---
// (All app.get/app.use calls below must be removed from module scope; they are now inside createApp)

// REMOVE ALL CODE BELOW THIS LINE THAT REFERENCES 'app.' AT MODULE SCOPE

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
  // Ongoing disasters: only 'active' and date >= today
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const ongoingCount = await Disaster.countDocuments({
    date: { $gte: today.toISOString().slice(0, 10) },
    status: 'active',
  });
  ongoingDisastersGauge.set(ongoingCount);

  // Disasters in last 24h (createdAt)
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const last24hCount = await Disaster.countDocuments({ createdAt: { $gte: since } });
  disastersLast24hGauge.set(last24hCount);

  // Disasters by type
  const byType = await Disaster.aggregate([{ $group: { _id: '$type', count: { $sum: 1 } } }]);
  disastersByTypeGauge.reset();
  byType.forEach((row: { _id: string; count: number }) => {
    disastersByTypeGauge.set({ type: row._id }, row.count);
  });

  // Disasters by day (last 7 days)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const byDay = await Disaster.aggregate([
    { $match: { createdAt: { $gte: sevenDaysAgo } } },
    { $project: { day: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } } } },
    { $group: { _id: '$day', count: { $sum: 1 } } },
  ]);
  disastersByDayGauge.reset();
  byDay.forEach((row: { _id: string; count: number }) => {
    disastersByDayGauge.set({ date: row._id }, row.count);
  });

  // Disasters by status
  disastersByStatusGauge.reset();
  const byStatus = await Disaster.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]);
  byStatus.forEach((row: { _id: string; count: number }) => {
    disastersByStatusGauge.set({ status: row._id }, row.count);
  });
}

// Update metrics every 30 seconds
const metricsInterval = setInterval(updateDisasterMetrics, 30000);
metricsInterval.unref(); // Prevents Jest/test runner from hanging due to open handle
// Also update on startup
updateDisasterMetrics().catch(() => {});

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
// Instead, sanitize req.body and req.params only
// app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
//   if (req.body) mongoSanitize.sanitize(req.body);
//   if (req.params) mongoSanitize.sanitize(req.params);
//   next();
// });

// --- Graceful MongoDB Shutdown ---
function gracefulShutdown(
  signal: string,
  injectedLogger?: { info: (...args: unknown[]) => void; error: (...args: unknown[]) => void },
): void {
  const log = injectedLogger || logger;
  import('mongoose').then((mongooseModule) => {
    const mongoose = mongooseModule.default;
    log.info(`Received ${signal}, closing MongoDB connection...`);
    mongoose.connection
      .close(false)
      .then(() => {
        log.info('MongoDB connection closed. Exiting.');
        process.exit(0);
      })
      .catch((err: unknown) => {
        log.error('Error closing MongoDB connection', { error: err });
        process.exit(1);
      });
  });
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
