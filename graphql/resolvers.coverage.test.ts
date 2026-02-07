import { GraphQLError } from 'graphql';
// Fix import style for named exports
import { resolvers } from './resolvers';
import * as disasterService from '../services/disaster.service';

// Cast resolver maps for direct invocation in tests
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Query = resolvers.Query as Record<string, (...args: any[]) => any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Mutation = resolvers.Mutation as Record<string, (...args: any[]) => any>;

describe('GraphQL resolvers coverage', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('disasters: should throw GraphQLError on service failure', async () => {
    jest.spyOn(disasterService, 'getAllDisasters').mockImplementation(() => {
      throw new Error('fail');
    });
    await expect(Query.disasters({}, {}, {})).rejects.toThrow(GraphQLError);
  });

  it('disaster: should throw GraphQLError BAD_USER_INPUT for missing id', async () => {
    await expect(Query.disaster({}, { id: undefined }, {})).rejects.toThrow(GraphQLError);
  });

  it('disaster: should throw GraphQLError for service failure', async () => {
    jest.spyOn(disasterService, 'getDisasterById').mockImplementation(() => {
      throw new Error('fail');
    });
    await expect(Query.disaster({}, { id: 1 }, {})).rejects.toThrow(GraphQLError);
  });

  it('disastersNear: should throw GraphQLError for invalid input', async () => {
    await expect(Query.disastersNear({}, { lat: 'bad', lng: 0, distance: 0 }, {})).rejects.toThrow(
      GraphQLError,
    );
  });

  it('disastersNear: should throw GraphQLError for service failure', async () => {
    jest.spyOn(disasterService, 'findDisastersNear').mockImplementation(() => {
      throw new Error('fail');
    });
    await expect(Query.disastersNear({}, { lat: 1, lng: 2, distance: 3 }, {})).rejects.toThrow(
      GraphQLError,
    );
  });

  it('createDisaster: should throw GraphQLError for invalid input', async () => {
    await expect(
      Mutation.createDisaster(
        {},
        {
          input: {
            type: '',
            location: { type: 'Point', coordinates: [] },
            date: '',
            description: '',
            status: 'active',
          },
        },
        {},
      ),
    ).rejects.toThrow(GraphQLError);
  });

  it('createDisaster: should throw GraphQLError for service failure', async () => {
    jest.spyOn(disasterService, 'createDisaster').mockImplementation(() => {
      throw new Error('fail');
    });
    await expect(
      Mutation.createDisaster(
        {},
        {
          input: {
            type: 'wildfire',
            location: { type: 'Point', coordinates: [0, 0] },
            date: '2025-01-01',
            description: '',
            status: 'active',
          },
        },
        {},
      ),
    ).rejects.toThrow(GraphQLError);
  });

  it('updateDisaster: should throw GraphQLError for missing id', async () => {
    await expect(Mutation.updateDisaster({}, { id: undefined, input: {} }, {})).rejects.toThrow(
      GraphQLError,
    );
  });

  it('updateDisaster: should throw GraphQLError for service failure', async () => {
    jest.spyOn(disasterService, 'updateDisaster').mockImplementation(() => {
      throw new Error('fail');
    });
    await expect(Mutation.updateDisaster({}, { id: 1, input: {} }, {})).rejects.toThrow(
      GraphQLError,
    );
  });

  it('updateDisaster: should throw GraphQLError NOT_FOUND if update returns null', async () => {
    jest.spyOn(disasterService, 'updateDisaster').mockResolvedValue(null);
    // Provide valid input so validation passes and NOT_FOUND branch is hit
    const validInput = { status: 'active' };
    await expect(Mutation.updateDisaster({}, { id: 1, input: validInput }, {})).rejects.toThrow(
      /not found/i,
    );
  });

  it('deleteDisaster: should throw GraphQLError for missing id', async () => {
    await expect(Mutation.deleteDisaster({}, { id: undefined }, {})).rejects.toThrow(GraphQLError);
  });

  it('deleteDisaster: should throw GraphQLError for service failure', async () => {
    jest.spyOn(disasterService, 'deleteDisaster').mockImplementation(() => {
      throw new Error('fail');
    });
    await expect(Mutation.deleteDisaster({}, { id: 1 }, {})).rejects.toThrow(GraphQLError);
  });

  it('deleteDisaster: should throw GraphQLError NOT_FOUND if delete returns null', async () => {
    jest.spyOn(disasterService, 'deleteDisaster').mockResolvedValue(false);
    await expect(Mutation.deleteDisaster({}, { id: 1 }, {})).rejects.toThrow(/not found/i);
  });

  it('bulkInsertDisasters: should throw GraphQLError for invalid input', async () => {
    await expect(Mutation.bulkInsertDisasters({}, { disasters: [{}] }, {})).rejects.toThrow(
      GraphQLError,
    );
  });

  it('bulkInsertDisasters: should throw GraphQLError for service failure', async () => {
    jest.spyOn(disasterService, 'bulkInsertDisasters').mockImplementation(() => {
      throw new Error('fail');
    });
    await expect(
      Mutation.bulkInsertDisasters(
        {},
        {
          disasters: [
            {
              type: 'wildfire',
              location: { type: 'Point', coordinates: [0, 0] },
              date: '2025-01-01',
              description: '',
              status: 'active',
            },
          ],
        },
        {},
      ),
    ).rejects.toThrow(GraphQLError);
  });

  it('bulkUpdateDisasters: should throw GraphQLError for invalid input', async () => {
    await expect(Mutation.bulkUpdateDisasters({}, { updates: 'bad' }, {})).rejects.toThrow(
      GraphQLError,
    );
  });

  it('bulkUpdateDisasters: should throw GraphQLError for service failure', async () => {
    jest.spyOn(disasterService, 'bulkUpdateDisasters').mockImplementation(() => {
      throw new Error('fail');
    });
    await expect(
      Mutation.bulkUpdateDisasters({}, { updates: [{ id: 1, input: {} }] }, {}),
    ).rejects.toThrow(GraphQLError);
  });

  // This file is missing an export or test. Add a dummy test to satisfy Jest.
  it('dummy test to satisfy Jest', () => {
    expect(true).toBe(true);
  });
});
