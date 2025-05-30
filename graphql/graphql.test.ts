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

describe('GraphQL API', () => {
  // Helper to print errors and fail if present
  function failOnGraphQLErrors(res: request.Response) {
    if (res.body && res.body.errors) {
      console.error('GraphQL errors:', JSON.stringify(res.body.errors, null, 2));
      expect(res.body.errors).toBeUndefined();
    }
  }

  it('should fetch paginated disasters', async () => {
    const query = `query { disasters(page: 1, limit: 2) { data { _id type date description } page limit total totalPages } }`;
    const res = await request(appInstance).post('/graphql').send({ query });
    failOnGraphQLErrors(res);
    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.disasters).toHaveProperty('data');
    expect(res.body.data.disasters).toHaveProperty('page', 1);
    expect(res.body.data.disasters).toHaveProperty('limit', 2);
  });

  it('should create a disaster', async () => {
    const mutation = `mutation { createDisaster(input: { type: "wildfire", location: { type: "Point", coordinates: [-118.25, 34.05] }, date: "2025-05-24T12:00:00Z", description: "GraphQL test", status: active }) { _id type date description status } }`;
    const res = await request(appInstance).post('/graphql').send({ query: mutation });
    failOnGraphQLErrors(res);
    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.createDisaster).toHaveProperty('_id');
    expect(res.body.data.createDisaster.type).toBe('wildfire');
    expect(res.body.data.createDisaster.description).toBe('GraphQL test');
    expect(res.body.data.createDisaster.status).toBe('active');
  });

  it('should update a disaster', async () => {
    // Create a disaster first
    const createMutation = `mutation { createDisaster(input: { type: "wildfire", location: { type: "Point", coordinates: [-120, 35] }, date: "2025-06-01T12:00:00Z", description: "To update", status: active }) { _id type location { coordinates } status date description } }`;
    const createRes = await request(appInstance).post('/graphql').send({ query: createMutation });
    expect(createRes.status).toBe(200);
    expect(createRes.body.data.createDisaster).toBeDefined();
    const id = createRes.body.data.createDisaster._id;
    // Wait for the disaster to be available via the API and DB (max 12s, 80x150ms)
    let found = null;
    for (let i = 0; i < 80; i++) {
      // Check DB
      const dbDoc = await Disaster.findById(id);
      // Check API
      const query = `query { disaster(_id: "${id}") { _id } }`;
      const res = await request(appInstance).post('/graphql').send({ query });
      if (dbDoc && res.body.data && res.body.data.disaster && res.body.data.disaster._id === id) {
        found = res.body.data.disaster;
        break;
      }
      await new Promise((res) => setTimeout(res, 150));
    }
    expect(found).toBeTruthy();
    // Now update it (send all required fields)
    const updateMutation = `mutation { updateDisaster(_id: "${id}", input: { type: "wildfire", location: { type: "Point", coordinates: [-120, 35] }, date: "2025-06-01T12:00:00Z", description: "Updated desc", status: contained }) { _id description status type location { coordinates } date } }`;
    const updateRes = await request(appInstance).post('/graphql').send({ query: updateMutation });
    if (updateRes.body.errors) {
      console.error(
        'updateDisaster GraphQL errors:',
        JSON.stringify(updateRes.body.errors, null, 2),
      );
    }
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.updateDisaster).toBeDefined();
    expect(updateRes.body.data.updateDisaster.status).toBe('contained');
    expect(updateRes.body.data.updateDisaster.description).toBe('Updated desc');
  });

  it('should delete a disaster', async () => {
    // First, create a disaster
    let createRes: request.Response | undefined = undefined;
    const createMutation = `mutation { createDisaster(input: { type: "earthquake", location: { type: "Point", coordinates: [100, 0] }, date: "2025-05-26T12:00:00Z", description: "To delete", status: active }) { _id } }`;
    for (let i = 0; i < 10; i++) {
      createRes = await request(appInstance).post('/graphql').send({ query: createMutation });
      if (createRes.body.data && createRes.body.data.createDisaster) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    if (!createRes || !createRes.body.data || !createRes.body.data.createDisaster) {
      console.error('Failed to create disaster:', createRes && createRes.body);
      throw new Error('Could not create disaster for deletion test');
    }
    const id = createRes.body.data.createDisaster._id;
    // Wait for the disaster to be fully persisted (max 12s, 80x150ms)
    let found: unknown = null;
    for (let i = 0; i < 80; i++) {
      found = await Disaster.findById(id);
      if (found) {
        if (mongoose.connection.db) {
          await mongoose.connection.db.admin().ping();
        }
        break;
      }
      await new Promise((res) => setTimeout(res, 150));
    }
    if (!found) {
      console.error('Disaster not found after creation:', { id });
      expect(found).toBeTruthy();
      return;
    }
    // Now, delete it
    const deleteMutation = `mutation { deleteDisaster(_id: "${id}") }`;
    let deleteRes: request.Response | undefined = undefined;
    for (let i = 0; i < 10; i++) {
      deleteRes = await request(appInstance).post('/graphql').send({ query: deleteMutation });
      if (deleteRes.body.data && typeof deleteRes.body.data.deleteDisaster === 'boolean') break;
      await new Promise((res) => setTimeout(res, 100));
    }
    failOnGraphQLErrors(deleteRes!);
    expect(deleteRes?.status).toBe(200);
    if (!deleteRes?.body.data) {
      console.error('deleteDisaster mutation response:', deleteRes?.body);
      expect(deleteRes?.body.data).toBeDefined();
      return;
    }
    expect(deleteRes?.body.data && deleteRes.body.data.deleteDisaster).toBe(true);
  });

  it('should support disastersNear query', async () => {
    // Insert a disaster near LA
    const mutation = `mutation { createDisaster(input: { type: "wildfire", location: { type: "Point", coordinates: [-118.25, 34.05] }, date: "2025-05-27T12:00:00Z", description: "Near LA", status: active }) { _id } }`;
    await request(appInstance).post('/graphql').send({ query: mutation });
    // Wait for the disaster to be indexed (max 12s, 80x150ms)
    let found = false;
    await new Promise((res) => setTimeout(res, 200));
    for (let i = 0; i < 80; i++) {
      const pollRes = await request(appInstance).post('/graphql').send({
        query: `query { disastersNear(lat: 34.05, lng: -118.25, distance: 10) { _id type description status } }`,
      });
      if (pollRes.body.errors) {
        console.error(
          'disastersNear GraphQL errors:',
          JSON.stringify(pollRes.body.errors, null, 2),
        );
      }
      if (
        pollRes.body.data &&
        pollRes.body.data.disastersNear &&
        pollRes.body.data.disastersNear.length > 0
      ) {
        found = true;
        expect(pollRes.status).toBe(200);
        expect(pollRes.body.data.disastersNear[0]).toHaveProperty('type');
        expect(pollRes.body.data.disastersNear[0]).toHaveProperty('status');
        break;
      }
      await new Promise((res) => setTimeout(res, 150));
    }
    if (!found) {
      const debugRes = await request(appInstance).post('/graphql').send({
        query: `query { disasters { data { _id type location { coordinates } status } } }`,
      });
      console.error('Disasters in DB for debugging:', JSON.stringify(debugRes.body, null, 2));
    }
    expect(found).toBe(true);
  });

  it('should create disasters with different status values and filter by status', async () => {
    // Create three disasters with different statuses
    const statuses = ['active', 'contained', 'resolved'];
    const ids: string[] = [];
    for (const status of statuses) {
      let res: request.Response | undefined = undefined;
      const mutation = `mutation { createDisaster(input: { type: "wildfire", location: { type: "Point", coordinates: [-120, 35] }, date: "2025-06-01T12:00:00Z", description: "${status} disaster", status: ${status} }) { _id status } }`;
      for (let i = 0; i < 10; i++) {
        res = await request(appInstance).post('/graphql').send({ query: mutation });
        if (res.status === 200 && res.body.data && res.body.data.createDisaster) break;
        await new Promise((r) => setTimeout(r, 100));
      }
      if (!res || !res.body.data || !res.body.data.createDisaster) {
        console.error('Create disaster for status failed:', res && res.body);
        throw new Error('Create disaster for status failed');
      }
      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.createDisaster).toHaveProperty('_id');
      expect(res.body.data.createDisaster.status).toBe(status);
      ids.push(res.body.data.createDisaster._id);
      // Wait for the disaster to be indexed (max 12s, 80x150ms)
      let found = false;
      for (let i = 0; i < 80; i++) {
        const query = `query { disasters(status: ${status}) { data { _id status description } } }`;
        const pollRes = await request(appInstance).post('/graphql').send({ query });
        if (pollRes.body.errors) {
          console.error(
            'disasters(status) GraphQL errors:',
            JSON.stringify(pollRes.body.errors, null, 2),
          );
        }
        if (
          pollRes.body.data &&
          pollRes.body.data.disasters &&
          Array.isArray(pollRes.body.data.disasters.data) &&
          pollRes.body.data.disasters.data.some(
            (d: { _id: string }) => d._id === res.body.data.createDisaster._id,
          )
        ) {
          found = true;
          break;
        }
        await new Promise((res) => setTimeout(res, 150));
      }
      if (!found) {
        console.error(
          `Disaster with status ${status} and id ${res.body.data.createDisaster._id} not found after creation`,
        );
      }
      expect(found).toBe(true);
    }
    // Now, query by each status and check results
    for (const status of statuses) {
      const query = `query { disasters(status: ${status}) { data { _id status description } } }`;
      const res = await request(appInstance).post('/graphql').send({ query });
      failOnGraphQLErrors(res);
      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.disasters).toHaveProperty('data');
      expect(Array.isArray(res.body.data.disasters.data)).toBe(true);
      // Check that all returned disasters have the correct status
      for (const disaster of res.body.data.disasters.data) {
        expect(disaster).toHaveProperty('status', status);
      }
    }
  });

  it('should filter disasters by dateFrom, dateTo, and both', async () => {
    // Create disasters with different dates
    const disasters = [
      {
        type: 'fire',
        location: { type: 'Point', coordinates: [-120, 35] },
        date: '2025-05-01T00:00:00.000Z',
        description: 'May 1',
        status: 'active',
      },
      {
        type: 'fire',
        location: { type: 'Point', coordinates: [-120, 35] },
        date: '2025-05-15T00:00:00.000Z',
        description: 'May 15',
        status: 'active',
      },
      {
        type: 'fire',
        location: { type: 'Point', coordinates: [-120, 35] },
        date: '2025-06-01T00:00:00.000Z',
        description: 'June 1',
        status: 'active',
      },
    ];
    for (const disaster of disasters) {
      const mutation = `mutation { createDisaster(input: { type: "${disaster.type}", location: { type: "Point", coordinates: [${disaster.location.coordinates[0]}, ${disaster.location.coordinates[1]}] }, date: "${disaster.date}", description: "${disaster.description}", status: active }) { _id } }`;
      await request(appInstance).post('/graphql').send({ query: mutation });
    }
    // Query with dateFrom (should get May 15 and June 1)
    let query = `query { disasters(dateFrom: "2025-05-10T00:00:00.000Z") { data { date description } } }`;
    let res = await request(appInstance).post('/graphql').send({ query });
    // Debug output
    if (!res.body.data || !res.body.data.disasters) {
      console.error('dateFrom query result:', JSON.stringify(res.body, null, 2));
    }
    expect(res.status).toBe(200);
    // Log for debugging
    if (res.body.data && res.body.data.disasters) {
      console.log('dateFrom results:', res.body.data.disasters.data);
    }
    expect(res.body.data.disasters.data.length).toBe(2);
    expect(
      res.body.data.disasters.data.some(
        (d: { description?: string }) => d.description === 'May 15',
      ),
    ).toBe(true);
    expect(
      res.body.data.disasters.data.some(
        (d: { description?: string }) => d.description === 'June 1',
      ),
    ).toBe(true);
    // Query with dateTo (should get May 1 and May 15)
    query = `query { disasters(dateTo: "2025-05-20T00:00:00.000Z") { data { date description } } }`;
    res = await request(appInstance).post('/graphql').send({ query });
    if (!res.body.data || !res.body.data.disasters) {
      console.error('dateTo query result:', JSON.stringify(res.body, null, 2));
    }
    if (res.body.data && res.body.data.disasters) {
      console.log('dateTo results:', res.body.data.disasters.data);
    }
    expect(res.status).toBe(200);
    expect(res.body.data.disasters.data.length).toBe(2);
    expect(
      res.body.data.disasters.data.some((d: { description?: string }) => d.description === 'May 1'),
    ).toBe(true);
    expect(
      res.body.data.disasters.data.some(
        (d: { description?: string }) => d.description === 'May 15',
      ),
    ).toBe(true);
    // Query with both dateFrom and dateTo (should get only May 15)
    query = `query { disasters(dateFrom: "2025-05-10T00:00:00.000Z", dateTo: "2025-05-20T00:00:00.000Z") { data { date description } } }`;
    res = await request(appInstance).post('/graphql').send({ query });
    if (!res.body.data || !res.body.data.disasters) {
      console.error('dateFrom+dateTo query result:', JSON.stringify(res.body, null, 2));
    }
    if (res.body.data && res.body.data.disasters) {
      console.log('dateFrom+dateTo results:', res.body.data.disasters.data);
    }
    expect(res.status).toBe(200);
    expect(res.body.data.disasters.data.length).toBe(1);
    expect(res.body.data.disasters.data[0].description).toBe('May 15');
  });
});
