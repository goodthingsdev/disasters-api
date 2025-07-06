import { ApolloError, UserInputError } from 'apollo-server-express';
import {
  disasterSchema,
  nearQuerySchema,
  mapJoiErrorMessage,
  bulkInsertSchema,
  bulkUpdateSchema,
} from '../validation/disaster.js';
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
} from '../services/disaster.service.js';
import { IResolvers } from '@graphql-tools/utils';
import { DisasterInput, DisasterResponse, DisasterResponseDTO } from '../dto/disaster.dto.js';
import { Disaster } from '../disaster.model.js';
import Joi from 'joi';

function isApolloNotFoundError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'extensions' in err &&
    (err as { extensions: { code?: string } }).extensions?.code === 'NOT_FOUND'
  );
}

const resolvers: IResolvers = {
  Query: {
    disasters: async (
      _: unknown,
      args: {
        page?: number;
        limit?: number;
        type?: string;
        status?: string;
        dateFrom?: string;
        dateTo?: string;
      },
    ) => {
      try {
        const { page = 1, limit = 20, type, dateFrom, dateTo, status } = args;
        // Create filter object for PostgreSQL service - simplified for now
        const filter: Record<string, unknown> = {};
        if (type) filter.type = type;
        if (status) filter.status = status;
        if (dateFrom) filter.dateFrom = dateFrom;
        if (dateTo) filter.dateTo = dateTo;

        const skip = (page - 1) * limit;
        const data: DisasterResponse[] = (
          await getAllDisasters({
            skip,
            limit,
            filter,
          })
        ).map((doc: Disaster) => new DisasterResponseDTO(doc));
        const total = await countDisasters();
        return {
          data,
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        };
      } catch {
        throw new ApolloError('Failed to fetch disasters', 'INTERNAL_ERROR');
      }
    },
    disaster: async (_: unknown, { id }: { id: string }) => {
      try {
        if (!id) throw new UserInputError('Missing id');
        // Validate UUID format if needed
        const result: Disaster | null = await getDisasterById(id);
        if (!result) throw new ApolloError('Not found', 'NOT_FOUND');
        return new DisasterResponseDTO(result);
      } catch (err) {
        if (err instanceof UserInputError || isApolloNotFoundError(err)) throw err;
        throw new ApolloError('Failed to fetch disaster', 'INTERNAL_ERROR');
      }
    },
    disastersNear: async (
      _: unknown,
      { lat, lng, distance }: { lat: number; lng: number; distance: number },
    ) => {
      try {
        const { error } = nearQuerySchema.validate({ lat, lng, distance });
        if (error) throw new UserInputError(mapJoiErrorMessage(error.message));
        return (await findDisastersNear({ lat, lng, distance })).map(
          (doc: Disaster) => new DisasterResponseDTO(doc),
        );
      } catch (err) {
        if (err instanceof UserInputError) throw err;
        throw new ApolloError('Failed to fetch disasters near location', 'INTERNAL_ERROR');
      }
    },
  },
  Mutation: {
    createDisaster: async (_: unknown, { input }: { input: DisasterInput }) => {
      try {
        const { error } = disasterSchema.validate(input);
        if (error) throw new UserInputError(mapJoiErrorMessage(error.message));
        const created = await createDisaster(input);
        return new DisasterResponseDTO(created);
      } catch (err) {
        if (err instanceof UserInputError) throw err;
        throw new ApolloError('Failed to create disaster', 'INTERNAL_ERROR');
      }
    },
    updateDisaster: async (
      _: unknown,
      { id, input }: { id: string; input: Partial<DisasterInput> },
    ) => {
      try {
        if (!id) throw new UserInputError('Missing id');
        // Validate UUID format if needed
        const { error } = disasterSchema
          .fork(['type', 'location', 'date'], (field: Joi.Schema) => field.optional())
          .validate(input);
        if (error) throw new UserInputError(mapJoiErrorMessage(error.message));
        const updated = await updateDisaster(id, input);
        if (!updated) throw new ApolloError('Not found', 'NOT_FOUND');
        return new DisasterResponseDTO(updated);
      } catch (err) {
        if (err instanceof UserInputError || isApolloNotFoundError(err)) throw err;
        throw new ApolloError('Failed to update disaster', 'INTERNAL_ERROR');
      }
    },
    deleteDisaster: async (_: unknown, { id }: { id: string }) => {
      try {
        if (!id) throw new UserInputError('Missing id');
        // Validate UUID format if needed
        const result = await deleteDisaster(id);
        if (!result) throw new ApolloError('Not found', 'NOT_FOUND');
        return !!result;
      } catch (err) {
        if (err instanceof UserInputError || isApolloNotFoundError(err)) throw err;
        throw new ApolloError('Failed to delete disaster', 'INTERNAL_ERROR');
      }
    },
    bulkInsertDisasters: async (_: unknown, { disasters }: { disasters: DisasterInput[] }) => {
      try {
        const { error } = bulkInsertSchema.validate({ disasters });
        if (error) throw new UserInputError(mapJoiErrorMessage(error.message));
        const inserted = await bulkInsertDisasters(disasters);
        return inserted.map((doc: Disaster) => new DisasterResponseDTO(doc));
      } catch (err) {
        if (err instanceof UserInputError) throw err;
        throw new ApolloError('Failed to bulk insert disasters', 'INTERNAL_ERROR');
      }
    },
    bulkUpdateDisasters: async (
      _: unknown,
      { updates }: { updates: Array<{ id: string; input: Partial<DisasterInput> }> },
    ) => {
      try {
        // Validate input using bulkUpdateSchema
        const { error } = bulkUpdateSchema.validate(updates);
        if (error) throw new UserInputError(mapJoiErrorMessage(error.message));
        const updateOps = updates.map(({ id, input }) => ({ id, ...input }));
        await bulkUpdateDisasters(updateOps);
        return true;
      } catch (err) {
        if (err instanceof UserInputError) throw err;
        throw new ApolloError('Failed to bulk update disasters', 'INTERNAL_ERROR');
      }
    },
  },
};

export { resolvers };
