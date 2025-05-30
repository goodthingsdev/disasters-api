// Moved to jest.setup.ts: process.env.MONGO_URI = ...
// Moved to jest.setup.ts: jest.setTimeout(...)

// Additional GraphQL tests for error and edge cases to improve coverage
import request from 'supertest';
import { createApp } from '../app';
import { Disaster } from '../disaster.model';
import mongoose from 'mongoose';

let appInstance: import('express').Application;

beforeAll(async () => {
  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI must be set in the environment for tests.');
  }
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGO_URI);
  }
  appInstance = await createApp();
  // Optionally check DB connection
  if (mongoose.connection.db) {
    await mongoose.connection.db.admin().ping();
  }
  // Ensure 2dsphere index is created before tests run
  await Disaster.createIndexes();
});

beforeEach(async () => {
  await Disaster.deleteMany({});
});

afterAll(async () => {
  await mongoose.connection.close();
  await new Promise((resolve) => setTimeout(resolve, 100));
});

function expectGraphQLError(res: request.Response, pattern: RegExp) {
  expect(res.body.errors).toBeDefined();
  expect(res.body.errors[0].message).toMatch(pattern);
}

describe('GraphQL API Error Cases', () => {
  it('should return error for missing required fields on createDisaster', async () => {
    const mutation = `mutation { createDisaster(input: { description: "Missing required fields" }) { _id } }`;
    const res = await request(appInstance).post('/graphql').send({ query: mutation });
    expect([200, 400]).toContain(res.status);
    expectGraphQLError(res, /required|was not provided/);
  });

  it('should return error for invalid ID on disaster query', async () => {
    const query = `query { disaster(_id: "notavalidid") { _id } }`;
    const res = await request(appInstance).post('/graphql').send({ query });
    expect([200, 400]).toContain(res.status);
    expectGraphQLError(res, /Failed to fetch disaster|Cast to ObjectId|INTERNAL_ERROR/);
  });

  it('should return not found for non-existent disaster', async () => {
    const fakeId = '507f1f77bcf86cd799439011';
    const query = `query { disaster(_id: "${fakeId}") { _id } }`;
    const res = await request(appInstance).post('/graphql').send({ query });
    expect(res.status).toBe(200);
    expect(res.body.data.disaster).toBeNull();
  });

  it('should return error for invalid disastersNear input', async () => {
    const query = `query { disastersNear(lat: "bad", lng: 0, distance: 10) { _id } }`;
    const res = await request(appInstance).post('/graphql').send({ query });
    expect([200, 400]).toContain(res.status);
    expectGraphQLError(res, /Float|GRAPHQL_VALIDATION_FAILED/);
  });

  it('should return error for updateDisaster with missing _id', async () => {
    const mutation = `mutation { updateDisaster(_id: "", input: { description: "No ID" }) { _id } }`;
    const res = await request(appInstance).post('/graphql').send({ query: mutation });
    expect([200, 400]).toContain(res.status);
    expectGraphQLError(res, /Missing _id|was not provided/);
  });

  it('should return error for deleteDisaster with missing _id', async () => {
    const mutation = `mutation { deleteDisaster(_id: "") }`;
    const res = await request(appInstance).post('/graphql').send({ query: mutation });
    expect([200, 400]).toContain(res.status);
    expectGraphQLError(res, /Missing _id|was not provided/);
  });

  it('should return error for bulkInsertDisasters with invalid input', async () => {
    const mutation = `mutation { bulkInsertDisasters(inputs: [{ type: "", location: null, date: "" }]) { _id } }`;
    const res = await request(appInstance).post('/graphql').send({ query: mutation });
    expect([200, 400]).toContain(res.status);
    expectGraphQLError(res, /Bulk insert failed|required|was not provided|Expected value/);
  });

  it('should return error for bulkUpdateDisasters with invalid input', async () => {
    const mutation = `mutation { bulkUpdateDisasters(updates: [{ _id: "", type: "" }]) }`;
    const res = await request(appInstance).post('/graphql').send({ query: mutation });
    expect([200, 400]).toContain(res.status);
    expectGraphQLError(
      res,
      /Bulk update failed|Invalid input|must be an array|required|not allowed to be empty/,
    );
  });
});
