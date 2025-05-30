// Jest setup file to configure test environment
process.env.NODE_ENV = 'test';
process.env.PORT = '3001';
process.env.LOG_LEVEL = 'error';

// Increase Jest timeout for all tests (for slow DB or integration tests)
jest.setTimeout(20000);

// Optionally, increase EventEmitter defaultMaxListeners to avoid warnings in large test suites
import { EventEmitter } from 'events';
EventEmitter.defaultMaxListeners = 20;

// Always mock process.exit in all tests to prevent Jest worker leaks
// TypeScript: process.exit is (code?: number) => never, so we must cast
(process.exit as unknown) = jest.fn();

// Set a unique test DB per Jest worker for parallel safety (works with real MongoDB container)
const workerId = process.env.JEST_WORKER_ID || '0';
const baseUri = process.env.MONGO_URI_BASE || 'mongodb://disasters:disasters_pass@mongo:27017';
const dbName = `disasters_test_jest_worker${workerId}`;
process.env.MONGO_URI = `${baseUri}/${dbName}?authSource=admin`;
