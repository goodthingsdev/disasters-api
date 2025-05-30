import { ApolloError, UserInputError } from 'apollo-server-express';
import {
  disasterSchema,
  nearQuerySchema,
  mapJoiErrorMessage,
  bulkInsertSchema,
  bulkUpdateSchema,
} from '../validation/disaster';
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
} from '../services/disaster.service';
import { IResolvers } from '@graphql-tools/utils';
import { DisasterInput, DisasterResponse, DisasterResponseDTO } from '../dto/disaster.dto';
import { DisasterDocument } from '../disaster.model';
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
        dateFrom?: string;
        dateTo?: string;
        status?: string;
      },
    ) => {
      try {
        const { page = 1, limit = 20, type, dateFrom, dateTo, status } = args;
        // Use string type for date filter to match model
        const filter: { type?: string; date?: { $gte?: string; $lte?: string }; status?: string } =
          {};
        if (type) filter.type = type;
        if (status) filter.status = status;
        if (dateFrom || dateTo) {
          filter.date = {};
          if (dateFrom) filter.date.$gte = dateFrom;
          if (dateTo) filter.date.$lte = dateTo;
        }
        const skip = (page - 1) * limit;
        const data: DisasterResponse[] = (
          await getAllDisasters({
            skip,
            limit,
            filter,
          })
        ).map((doc: DisasterDocument) => new DisasterResponseDTO(doc));
        const total = await countDisasters(filter);
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
    disaster: async (_: unknown, { _id }: { _id: string }) => {
      try {
        if (!_id) throw new UserInputError('Missing _id');
        const result: DisasterDocument | null = await getDisasterById(_id);
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
          (doc: DisasterDocument) => new DisasterResponseDTO(doc),
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
      { _id, input }: { _id: string; input: Partial<DisasterInput> },
    ) => {
      try {
        if (!_id) throw new UserInputError('Missing _id');
        const { error } = disasterSchema
          .fork(['type', 'location', 'date'], (field: Joi.Schema) => field.optional())
          .validate(input);
        if (error) throw new UserInputError(mapJoiErrorMessage(error.message));
        const updated = await updateDisaster(_id, input);
        if (!updated) throw new ApolloError('Not found', 'NOT_FOUND');
        return new DisasterResponseDTO(updated);
      } catch (err) {
        if (err instanceof UserInputError || isApolloNotFoundError(err)) throw err;
        throw new ApolloError('Failed to update disaster', 'INTERNAL_ERROR');
      }
    },
    deleteDisaster: async (_: unknown, { _id }: { _id: string }) => {
      try {
        if (!_id) throw new UserInputError('Missing _id');
        const result = await deleteDisaster(_id);
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
        return inserted.map((doc: DisasterDocument) => new DisasterResponseDTO(doc));
      } catch (err) {
        if (err instanceof UserInputError) throw err;
        throw new ApolloError('Failed to bulk insert disasters', 'INTERNAL_ERROR');
      }
    },
    bulkUpdateDisasters: async (
      _: unknown,
      { updates }: { updates: Array<{ _id: string; input: Partial<DisasterInput> }> },
    ) => {
      try {
        const { error } = bulkUpdateSchema.validate({ updates });
        if (error) throw new UserInputError(mapJoiErrorMessage(error.message));
        // Map to the expected update format
        const updateOps = updates.map(({ _id, input }) => ({ _id, ...input }));
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
