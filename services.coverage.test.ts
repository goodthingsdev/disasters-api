process.env.NODE_ENV = 'test';
import { describe, it, expect } from '@jest/globals';
import {
  createDisaster,
  getAllDisasters,
  countDisasters,
  getDisasterById,
  updateDisaster,
  deleteDisaster,
  findDisastersNear,
  bulkInsertDisasters,
  bulkUpdateDisasters,
} from './services/disaster.service';
import { Disaster } from './disaster.model';

describe('Disaster service coverage', () => {
  it('should export expected functions', () => {
    expect(typeof createDisaster).toBe('function');
    expect(typeof getAllDisasters).toBe('function');
    expect(typeof getDisasterById).toBe('function');
    expect(typeof updateDisaster).toBe('function');
    expect(typeof deleteDisaster).toBe('function');
  });

  it('getAllDisasters: legacy (no args) and paginated/filter', async () => {
    const origFind = Disaster.find;
    // Legacy: returns an array
    Disaster.find = jest.fn(() => [{ _id: '1' }]) as unknown as typeof Disaster.find;
    const legacyResult = await getAllDisasters();
    expect(Array.isArray(legacyResult)).toBe(true);
    // Paginated: returns a chainable object with .skip/.limit, .limit returns array
    Disaster.find = jest.fn(() => ({
      skip: function () {
        return this;
      },
      limit: function () {
        return [{ _id: '2' }];
      },
    })) as unknown as typeof Disaster.find;
    const paginatedResult = await getAllDisasters({
      skip: 1,
      limit: 2,
      filter: { type: 'fire' },
    });
    expect(Array.isArray(paginatedResult)).toBe(true);
    Disaster.find = origFind;
  });

  it('countDisasters: default and with filter', async () => {
    const origCount = Disaster.countDocuments;
    Disaster.countDocuments = jest.fn(() => 42) as unknown as typeof Disaster.countDocuments;
    expect(await countDisasters()).toBe(42);
    expect(await countDisasters({ type: 'flood' })).toBe(42);
    Disaster.countDocuments = origCount;
  });

  it('findDisastersNear: object and tuple overloads', async () => {
    const origFind = Disaster.find;
    Disaster.find = jest.fn(() => ['nearby']) as unknown as typeof Disaster.find;
    // object overload
    expect(await findDisastersNear({ lat: 1, lng: 2, distance: 3 })).toEqual(['nearby']);
    // tuple overload
    expect(await findDisastersNear(2, 1, 3)).toEqual(['nearby']);
    Disaster.find = origFind;
  });

  it('bulkInsertDisasters: success and error', async () => {
    const origInsertMany = Disaster.insertMany;
    Disaster.insertMany = jest.fn(() => ['inserted']) as unknown as typeof Disaster.insertMany;
    expect(
      await bulkInsertDisasters([
        {
          type: 'fire',
          location: { type: 'Point', coordinates: [1, 2] },
          date: '2025-01-01',
          description: '',
          status: 'active',
        },
      ]),
    ).toEqual(['inserted']);
    Disaster.insertMany = jest.fn(() => {
      throw new Error('fail insert');
    }) as unknown as typeof Disaster.insertMany;
    await expect(
      bulkInsertDisasters([
        {
          type: 'fire',
          location: { type: 'Point', coordinates: [1, 2] },
          date: '2025-01-01',
          description: '',
          status: 'active',
        },
      ]),
    ).rejects.toThrow('fail insert');
    Disaster.insertMany = origInsertMany;
  });

  it('bulkUpdateDisasters: success and error', async () => {
    const origBulkWrite = Disaster.bulkWrite;
    // Fix formatting for jest.fn mocks to comply with ESLint/prettier
    Disaster.bulkWrite = jest.fn(() => ({
      matchedCount: 1,
      modifiedCount: 1,
    })) as unknown as typeof Disaster.bulkWrite;
    expect(await bulkUpdateDisasters([{ _id: 'abc', type: 'fire' }])).toEqual({
      matchedCount: 1,
      modifiedCount: 1,
    });
    Disaster.bulkWrite = jest.fn(() => {
      throw new Error('fail update');
    }) as unknown as typeof Disaster.bulkWrite;
    await expect(bulkUpdateDisasters([{ _id: 'abc', type: 'fire' }])).rejects.toThrow(
      'fail update',
    );
    Disaster.bulkWrite = origBulkWrite;
  });
});
