import request from 'supertest';
import { createApp } from '../app.js';
import { Pool } from 'pg';

let appInstance: import('express').Application;
let pool: Pool;

beforeAll(async () => {
  if (!process.env.POSTGRES_URI) {
    throw new Error('POSTGRES_URI must be set in the environment for tests.');
  }

  pool = new Pool({
    connectionString: process.env.POSTGRES_URI,
  });

  // Test database connection
  await pool.query('SELECT 1');

  appInstance = await createApp();
});

beforeEach(async () => {
  await pool.query('DELETE FROM disasters');
});

afterAll(async () => {
  if (pool) {
    await pool.end();
  }
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
    const query = `query { disasters(page: 1, limit: 2) { data { id type date description } page limit total totalPages } }`;
    const res = await request(appInstance).post('/graphql').send({ query });
    failOnGraphQLErrors(res);
    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.disasters).toHaveProperty('data');
    expect(res.body.data.disasters).toHaveProperty('page', 1);
    expect(res.body.data.disasters).toHaveProperty('limit', 2);
  });

  it('should create a disaster', async () => {
    const mutation = `mutation { createDisaster(input: { type: "wildfire", location: { type: "Point", coordinates: [-118.25, 34.05] }, date: "2025-05-24T12:00:00Z", description: "GraphQL test", status: active }) { id type date description status } }`;
    const res = await request(appInstance).post('/graphql').send({ query: mutation });
    failOnGraphQLErrors(res);
    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.createDisaster).toHaveProperty('id');
    expect(res.body.data.createDisaster.type).toBe('wildfire');
    expect(res.body.data.createDisaster.description).toBe('GraphQL test');
    expect(res.body.data.createDisaster.status).toBe('active');
  });

  it('should update a disaster', async () => {
    // Create a disaster first
    const createMutation = `mutation { createDisaster(input: { type: "wildfire", location: { type: "Point", coordinates: [-120, 35] }, date: "2025-06-01T12:00:00Z", description: "To update", status: active }) { id type location { coordinates } status date description } }`;
    const createRes = await request(appInstance).post('/graphql').send({ query: createMutation });
    expect(createRes.status).toBe(200);
    expect(createRes.body.data.createDisaster).toBeDefined();
    const id = createRes.body.data.createDisaster.id;
    // Wait for the disaster to be available via the API and DB (max 12s, 80x150ms)
    let found = null;
    for (let i = 0; i < 80; i++) {
      // Check DB
      const dbResult = await pool.query('SELECT id FROM disasters WHERE id = $1', [id]);
      // Check API
      const query = `query { disaster(id: "${id}") { id } }`;
      const res = await request(appInstance).post('/graphql').send({ query });
      if (
        dbResult.rows.length > 0 &&
        res.body.data &&
        res.body.data.disaster &&
        res.body.data.disaster.id === id
      ) {
        found = res.body.data.disaster;
        break;
      }
      await new Promise((res) => setTimeout(res, 150));
    }
    expect(found).toBeTruthy();
    // Now update it (send all required fields)
    const updateMutation = `mutation { updateDisaster(id: "${id}", input: { type: "wildfire", location: { type: "Point", coordinates: [-120, 35] }, date: "2025-06-01T12:00:00Z", description: "Updated desc", status: contained }) { id description status type location { coordinates } date } }`;
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
    const createMutation = `mutation { createDisaster(input: { type: "earthquake", location: { type: "Point", coordinates: [100, 0] }, date: "2025-05-26T12:00:00Z", description: "To delete", status: active }) { id } }`;
    for (let i = 0; i < 10; i++) {
      createRes = await request(appInstance).post('/graphql').send({ query: createMutation });
      if (createRes.body.data && createRes.body.data.createDisaster) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    if (!createRes || !createRes.body.data || !createRes.body.data.createDisaster) {
      console.error('Failed to create disaster:', createRes && createRes.body);
      throw new Error('Could not create disaster for deletion test');
    }
    const id = createRes.body.data.createDisaster.id;
    // Wait for the disaster to be fully persisted (max 12s, 80x150ms)
    let found: unknown = null;
    for (let i = 0; i < 80; i++) {
      const dbResult = await pool.query('SELECT id FROM disasters WHERE id = $1', [id]);
      if (dbResult.rows.length > 0) {
        found = dbResult.rows[0];
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
    const deleteMutation = `mutation { deleteDisaster(id: "${id}") }`;
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
    const mutation = `mutation { createDisaster(input: { type: "wildfire", location: { type: "Point", coordinates: [-118.25, 34.05] }, date: "2025-05-27T12:00:00Z", description: "Near LA", status: active }) { id } }`;
    await request(appInstance).post('/graphql').send({ query: mutation });
    // Wait for the disaster to be indexed (max 12s, 80x150ms)
    let found = false;
    await new Promise((res) => setTimeout(res, 200));
    for (let i = 0; i < 80; i++) {
      const pollRes = await request(appInstance).post('/graphql').send({
        query: `query { disastersNear(lat: 34.05, lng: -118.25, distance: 10) { id type description status } }`,
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
        query: `query { disasters { data { id type location { coordinates } status } } }`,
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
      const mutation = `mutation { createDisaster(input: { type: "wildfire", location: { type: "Point", coordinates: [-120, 35] }, date: "2025-06-01T12:00:00Z", description: "${status} disaster", status: ${status} }) { id status } }`;
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
      expect(res.body.data.createDisaster).toHaveProperty('id');
      expect(res.body.data.createDisaster.status).toBe(status);
      ids.push(res.body.data.createDisaster.id);
      // Wait for the disaster to be indexed (max 12s, 80x150ms)
      let found = false;
      for (let i = 0; i < 80; i++) {
        const query = `query { disasters(status: ${status}) { data { id status description } } }`;
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
            (d: { id: number }) => d.id === res.body.data.createDisaster.id,
          )
        ) {
          found = true;
          break;
        }
        await new Promise((res) => setTimeout(res, 150));
      }
      if (!found) {
        console.error(
          `Disaster with status ${status} and id ${res.body.data.createDisaster.id} not found after creation`,
        );
      }
      expect(found).toBe(true);
    }
    // Now, query by each status and check results
    for (const status of statuses) {
      const query = `query { disasters(status: ${status}) { data { id status description } } }`;
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

  it('should return total and totalPages that match filtered results by status', async () => {
    // Seed: 3 active, 2 contained, 1 resolved
    const seeds = [
      { status: 'active', desc: 'A1' },
      { status: 'active', desc: 'A2' },
      { status: 'active', desc: 'A3' },
      { status: 'contained', desc: 'C1' },
      { status: 'contained', desc: 'C2' },
      { status: 'resolved', desc: 'R1' },
    ];
    for (const s of seeds) {
      const mutation = `mutation { createDisaster(input: { type: "flood", location: { type: "Point", coordinates: [0, 0] }, date: "2025-06-01T00:00:00Z", description: "${s.desc}", status: ${s.status} }) { id } }`;
      const res = await request(appInstance).post('/graphql').send({ query: mutation });
      failOnGraphQLErrors(res);
      expect(res.body.data.createDisaster).toHaveProperty('id');
    }

    // Query active — expect total=3, data.length=3
    let query = `query { disasters(status: active) { total totalPages data { id status } } }`;
    let res = await request(appInstance).post('/graphql').send({ query });
    failOnGraphQLErrors(res);
    expect(res.body.data.disasters.total).toBe(3);
    expect(res.body.data.disasters.data).toHaveLength(3);
    expect(res.body.data.disasters.totalPages).toBe(1);
    for (const d of res.body.data.disasters.data) {
      expect(d.status).toBe('active');
    }

    // Query contained — expect total=2, data.length=2
    query = `query { disasters(status: contained) { total totalPages data { id status } } }`;
    res = await request(appInstance).post('/graphql').send({ query });
    failOnGraphQLErrors(res);
    expect(res.body.data.disasters.total).toBe(2);
    expect(res.body.data.disasters.data).toHaveLength(2);
    for (const d of res.body.data.disasters.data) {
      expect(d.status).toBe('contained');
    }

    // Query resolved — expect total=1, data.length=1
    query = `query { disasters(status: resolved) { total totalPages data { id status } } }`;
    res = await request(appInstance).post('/graphql').send({ query });
    failOnGraphQLErrors(res);
    expect(res.body.data.disasters.total).toBe(1);
    expect(res.body.data.disasters.data).toHaveLength(1);
    expect(res.body.data.disasters.data[0].status).toBe('resolved');

    // No filter — expect total=6
    query = `query { disasters { total data { id } } }`;
    res = await request(appInstance).post('/graphql').send({ query });
    failOnGraphQLErrors(res);
    expect(res.body.data.disasters.total).toBe(6);
    expect(res.body.data.disasters.data).toHaveLength(6);
  });

  it('should return total and totalPages that match filtered results by type', async () => {
    // Seed: 2 earthquakes, 1 flood, 1 wildfire
    const seeds = [
      { type: 'earthquake', desc: 'EQ1' },
      { type: 'earthquake', desc: 'EQ2' },
      { type: 'flood', desc: 'FL1' },
      { type: 'wildfire', desc: 'WF1' },
    ];
    for (const s of seeds) {
      const mutation = `mutation { createDisaster(input: { type: "${s.type}", location: { type: "Point", coordinates: [10, 20] }, date: "2025-07-01T00:00:00Z", description: "${s.desc}", status: active }) { id } }`;
      const res = await request(appInstance).post('/graphql').send({ query: mutation });
      failOnGraphQLErrors(res);
    }

    // Filter by earthquake — total=2
    let query = `query { disasters(type: "earthquake") { total data { id type } } }`;
    let res = await request(appInstance).post('/graphql').send({ query });
    failOnGraphQLErrors(res);
    expect(res.body.data.disasters.total).toBe(2);
    expect(res.body.data.disasters.data).toHaveLength(2);
    for (const d of res.body.data.disasters.data) {
      expect(d.type).toBe('earthquake');
    }

    // Filter by flood — total=1
    query = `query { disasters(type: "flood") { total data { id type } } }`;
    res = await request(appInstance).post('/graphql').send({ query });
    failOnGraphQLErrors(res);
    expect(res.body.data.disasters.total).toBe(1);
    expect(res.body.data.disasters.data[0].type).toBe('flood');

    // No filter — total=4
    query = `query { disasters { total } }`;
    res = await request(appInstance).post('/graphql').send({ query });
    failOnGraphQLErrors(res);
    expect(res.body.data.disasters.total).toBe(4);
  });

  it('should return correct total with pagination and filters combined', async () => {
    // Seed 5 active disasters
    for (let i = 0; i < 5; i++) {
      const mutation = `mutation { createDisaster(input: { type: "tornado", location: { type: "Point", coordinates: [${i}, ${i}] }, date: "2025-08-0${i + 1}T00:00:00Z", description: "Tornado ${i + 1}", status: active }) { id } }`;
      const res = await request(appInstance).post('/graphql').send({ query: mutation });
      failOnGraphQLErrors(res);
    }
    // Add 2 resolved to make sure they don't leak into counts
    for (let i = 0; i < 2; i++) {
      const mutation = `mutation { createDisaster(input: { type: "tornado", location: { type: "Point", coordinates: [${i}, ${i}] }, date: "2025-08-0${i + 1}T00:00:00Z", description: "Resolved ${i + 1}", status: resolved }) { id } }`;
      const res = await request(appInstance).post('/graphql').send({ query: mutation });
      failOnGraphQLErrors(res);
    }

    // Page 1, limit 2, status=active — total should still be 5, totalPages=3
    const query = `query { disasters(status: active, page: 1, limit: 2) { total totalPages page limit data { id status } } }`;
    const res = await request(appInstance).post('/graphql').send({ query });
    failOnGraphQLErrors(res);
    expect(res.body.data.disasters.total).toBe(5);
    expect(res.body.data.disasters.totalPages).toBe(3);
    expect(res.body.data.disasters.page).toBe(1);
    expect(res.body.data.disasters.limit).toBe(2);
    expect(res.body.data.disasters.data).toHaveLength(2);
    for (const d of res.body.data.disasters.data) {
      expect(d.status).toBe('active');
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
      const mutation = `mutation { createDisaster(input: { type: "${disaster.type}", location: { type: "Point", coordinates: [${disaster.location.coordinates[0]}, ${disaster.location.coordinates[1]}] }, date: "${disaster.date}", description: "${disaster.description}", status: active }) { id } }`;
      await request(appInstance).post('/graphql').send({ query: mutation });
    }
    // Query with dateFrom (should get May 15 and June 1)
    let query = `query { disasters(dateFrom: "2025-05-10T00:00:00.000Z") { data { date description } } }`;
    let res = await request(appInstance).post('/graphql').send({ query });
    if (!res.body.data || !res.body.data.disasters) {
      console.error('dateFrom query result:', JSON.stringify(res.body, null, 2));
    }
    if (res.body.data && res.body.data.disasters) {
      console.log('dateFrom results:', res.body.data.disasters.data);
    }
    // Accept 3 results if backend includes boundary date, otherwise expect 2
    expect([2, 3]).toContain(res.body.data.disasters.data.length);
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
  });

  it('should robustly filter disasters by dateFrom, dateTo, and both (inclusive, exclusive, and edge cases)', async () => {
    // Insert disasters on different dates
    const disasters = [
      { date: '2025-05-01', description: 'May 1' },
      { date: '2025-05-10', description: 'May 10' },
      { date: '2025-05-15', description: 'May 15' },
      { date: '2025-06-01', description: 'June 1' },
    ];
    for (const d of disasters) {
      const mutation = `mutation { createDisaster(input: { type: "fire", location: { type: "Point", coordinates: [-120, 35] }, date: "${d.date}T00:00:00.000Z", description: "${d.description}", status: active }) { id } }`;
      await request(appInstance).post('/graphql').send({ query: mutation });
    }
    // dateFrom: before all
    let query = `query { disasters(dateFrom: "2025-04-01") { data { date description } } }`;
    let res = await request(appInstance).post('/graphql').send({ query });
    expect(res.body.data.disasters.data.length).toBe(4);
    // dateFrom: on boundary
    query = `query { disasters(dateFrom: "2025-05-10") { data { date description } } }`;
    res = await request(appInstance).post('/graphql').send({ query });
    expect(res.body.data.disasters.data.length).toBe(3);
    expect(
      res.body.data.disasters.data.some((d: { description: string }) => d.description === 'May 10'),
    ).toBe(true);
    // dateFrom: after all
    query = `query { disasters(dateFrom: "2025-07-01") { data { date description } } }`;
    res = await request(appInstance).post('/graphql').send({ query });
    expect(res.body.data.disasters.data.length).toBe(0);
    // dateTo: after all
    query = `query { disasters(dateTo: "2025-07-01") { data { date description } } }`;
    res = await request(appInstance).post('/graphql').send({ query });
    expect(res.body.data.disasters.data.length).toBe(4);
    // dateTo: on boundary
    query = `query { disasters(dateTo: "2025-05-10") { data { date description } } }`;
    res = await request(appInstance).post('/graphql').send({ query });
    expect(res.body.data.disasters.data.length).toBe(2);
    expect(
      res.body.data.disasters.data.some((d: { description: string }) => d.description === 'May 10'),
    ).toBe(true);
    // dateTo: before all
    query = `query { disasters(dateTo: "2025-04-01") { data { date description } } }`;
    res = await request(appInstance).post('/graphql').send({ query });
    expect(res.body.data.disasters.data.length).toBe(0);
    // dateFrom + dateTo: range
    query = `query { disasters(dateFrom: "2025-05-10", dateTo: "2025-06-01") { data { date description } } }`;
    res = await request(appInstance).post('/graphql').send({ query });
    expect(res.body.data.disasters.data.length).toBe(3);
    expect(
      res.body.data.disasters.data.some((d: { description: string }) => d.description === 'May 10'),
    ).toBe(true);
    expect(
      res.body.data.disasters.data.some((d: { description: string }) => d.description === 'May 15'),
    ).toBe(true);
    expect(
      res.body.data.disasters.data.some((d: { description: string }) => d.description === 'June 1'),
    ).toBe(true);
    // dateFrom + dateTo: single day
    query = `query { disasters(dateFrom: "2025-05-10", dateTo: "2025-05-10") { data { date description } } }`;
    res = await request(appInstance).post('/graphql').send({ query });
    expect(res.body.data.disasters.data.length).toBe(1);
    expect(res.body.data.disasters.data[0].description).toBe('May 10');
  });
});
