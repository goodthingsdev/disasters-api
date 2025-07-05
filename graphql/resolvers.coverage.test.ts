import { ApolloError, UserInputError } from 'apollo-server-express';
// Fix import style for named exports
import { resolvers } from './resolvers';
import * as disasterService from '../services/disaster.service';

describe('GraphQL resolvers coverage', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('disasters: should throw ApolloError on service failure', async () => {
    jest.spyOn(disasterService, 'getAllDisasters').mockImplementation(() => {
      throw new Error('fail');
    });
    await expect(
      // @ts-expect-error: purposely passing wrong args to test error handling
      resolvers.Query.disasters({}, {}, {}),
    ).rejects.toThrow(ApolloError);
  });

  it('disaster: should throw UserInputError for missing id', async () => {
    await expect(
      // @ts-expect-error: purposely passing undefined id to test error handling
      resolvers.Query.disaster({}, { id: undefined }, {}),
    ).rejects.toThrow(UserInputError);
  });

  it('disaster: should throw ApolloError for service failure', async () => {
    jest.spyOn(disasterService, 'getDisasterById').mockImplementation(() => {
      throw new Error('fail');
    });
    await expect(
      // @ts-expect-error: purposely passing wrong args to test error handling
      resolvers.Query.disaster({}, { id: 1 }, {}),
    ).rejects.toThrow(ApolloError);
  });

  it('disastersNear: should throw UserInputError for invalid input', async () => {
    await expect(
      // @ts-expect-error: purposely passing invalid lat to test error handling
      resolvers.Query.disastersNear({}, { lat: 'bad', lng: 0, distance: 0 }, {}),
    ).rejects.toThrow(UserInputError);
  });

  it('disastersNear: should throw ApolloError for service failure', async () => {
    jest.spyOn(disasterService, 'findDisastersNear').mockImplementation(() => {
      throw new Error('fail');
    });
    await expect(
      // @ts-expect-error: purposely passing valid args to simulate service failure
      resolvers.Query.disastersNear({}, { lat: 1, lng: 2, distance: 3 }, {}),
    ).rejects.toThrow(ApolloError);
  });

  it('createDisaster: should throw UserInputError for invalid input', async () => {
    await expect(
      // @ts-expect-error: purposely passing invalid input to test error handling
      resolvers.Mutation.createDisaster(
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
    ).rejects.toThrow(UserInputError);
  });

  it('createDisaster: should throw ApolloError for service failure', async () => {
    jest.spyOn(disasterService, 'createDisaster').mockImplementation(() => {
      throw new Error('fail');
    });
    await expect(
      // @ts-expect-error: purposely passing valid input to simulate service failure
      resolvers.Mutation.createDisaster(
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
    ).rejects.toThrow(ApolloError);
  });

  it('updateDisaster: should throw UserInputError for missing id', async () => {
    await expect(
      // @ts-expect-error: purposely passing undefined id to test error handling
      resolvers.Mutation.updateDisaster({}, { id: undefined, input: {} }, {}),
    ).rejects.toThrow(UserInputError);
  });

  it('updateDisaster: should throw ApolloError for service failure', async () => {
    jest.spyOn(disasterService, 'updateDisaster').mockImplementation(() => {
      throw new Error('fail');
    });
    await expect(
      // @ts-expect-error: purposely passing valid args to simulate service failure
      resolvers.Mutation.updateDisaster({}, { id: 1, input: {} }, {}),
    ).rejects.toThrow(ApolloError);
  });

  it('updateDisaster: should throw ApolloError NOT_FOUND if update returns null', async () => {
    jest.spyOn(disasterService, 'updateDisaster').mockResolvedValue(null);
    // Provide valid input so validation passes and NOT_FOUND branch is hit
    const validInput = { status: 'active' };
    await expect(
      // @ts-expect-error: purposely passing valid args to simulate not found
      resolvers.Mutation.updateDisaster({}, { id: 1, input: validInput }, {}),
    ).rejects.toThrow(/not found/i);
  });

  it('deleteDisaster: should throw UserInputError for missing id', async () => {
    await expect(
      // @ts-expect-error: purposely passing undefined id to test error handling
      resolvers.Mutation.deleteDisaster({}, { id: undefined }, {}),
    ).rejects.toThrow(UserInputError);
  });

  it('deleteDisaster: should throw ApolloError for service failure', async () => {
    jest.spyOn(disasterService, 'deleteDisaster').mockImplementation(() => {
      throw new Error('fail');
    });
    await expect(
      // @ts-expect-error: purposely passing valid args to simulate service failure
      resolvers.Mutation.deleteDisaster({}, { id: 1 }, {}),
    ).rejects.toThrow(ApolloError);
  });

  it('deleteDisaster: should throw ApolloError NOT_FOUND if delete returns null', async () => {
    jest.spyOn(disasterService, 'deleteDisaster').mockResolvedValue(false);
    await expect(
      // @ts-expect-error: purposely passing valid args to simulate not found
      resolvers.Mutation.deleteDisaster({}, { id: 1 }, {}),
    ).rejects.toThrow(/not found/i);
  });

  it('bulkInsertDisasters: should throw UserInputError for invalid input', async () => {
    await expect(
      // @ts-expect-error: purposely passing invalid input to test error handling
      resolvers.Mutation.bulkInsertDisasters({}, { disasters: [{}] }, {}),
    ).rejects.toThrow(UserInputError);
  });

  it('bulkInsertDisasters: should throw ApolloError for service failure', async () => {
    jest.spyOn(disasterService, 'bulkInsertDisasters').mockImplementation(() => {
      throw new Error('fail');
    });
    await expect(
      // @ts-expect-error: purposely passing valid input to simulate service failure
      resolvers.Mutation.bulkInsertDisasters(
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
    ).rejects.toThrow(ApolloError);
  });

  it('bulkUpdateDisasters: should throw UserInputError for invalid input', async () => {
    await expect(
      // @ts-expect-error: purposely passing invalid input to test error handling
      resolvers.Mutation.bulkUpdateDisasters({}, { updates: 'bad' }, {}),
    ).rejects.toThrow(UserInputError);
  });

  it('bulkUpdateDisasters: should throw ApolloError for service failure', async () => {
    jest.spyOn(disasterService, 'bulkUpdateDisasters').mockImplementation(() => {
      throw new Error('fail');
    });
    await expect(
      // @ts-expect-error: purposely passing valid input to simulate service failure
      resolvers.Mutation.bulkUpdateDisasters({}, { updates: [{ id: 1, input: {} }] }, {}),
    ).rejects.toThrow(ApolloError);
  });

  // This file is missing an export or test. Add a dummy test to satisfy Jest.
  it('dummy test to satisfy Jest', () => {
    expect(true).toBe(true);
  });
});
