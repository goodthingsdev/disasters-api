import 'dotenv/config';
import { createApp, apolloReady } from './app';
import { Server } from 'http';

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
    server = app.listen(port, () => {
      console.log(`Disaster API server running on port ${port}`);
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

start();
