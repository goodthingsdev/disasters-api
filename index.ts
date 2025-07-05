import 'dotenv/config';
import { createApp, apolloReady } from './app.js';
import { Server } from 'http';

console.log('[index.ts] Entry point reached');
console.log('[index.ts] Starting Disaster API entrypoint');

process.on('uncaughtException', (err) => {
  console.error('[index.ts] Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('[index.ts] Unhandled Rejection:', reason);
  process.exit(1);
});

async function start() {
  // Wait for ApolloServer to be ready (if present)
  // Use optional chaining to safely call __APOLLO_INIT__ if it exists
  if (
    typeof (apolloReady as { __APOLLO_INIT__?: () => Promise<void> }).__APOLLO_INIT__ === 'function'
  ) {
    await (apolloReady as { __APOLLO_INIT__?: () => Promise<void> }).__APOLLO_INIT__?.();
  }
  let server: Server | undefined;
  if (process.env.NODE_ENV !== 'test') {
    const port = process.env.PORT || 3000;
    const app = await createApp();
    console.log('[index.ts] About to start server...');
    server = app.listen(port, () => {
      console.log(`[index.ts] Disaster API server listening on port ${port}`);
    });

    // Graceful shutdown
    const shutdown = () => {
      console.log('Received shutdown signal, closing server...');
      server!.close(() => {
        console.log('HTTP server closed.');
        process.exit(0);
      });
      // Force exit if not closed in 10s
      setTimeout(() => {
        console.error('Force exiting after 10s.');
        process.exit(1);
      }, 10000);
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  }
}

start().catch((err) => {
  console.error('Fatal error during startup:', err);
  process.exit(1);
});
