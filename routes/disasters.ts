import { Request, Response, NextFunction, Router } from 'express';
import Joi from 'joi';
import {
  createDisaster,
  getAllDisasters,
  getDisasterById,
  updateDisaster,
  deleteDisaster,
  findDisastersNear,
  bulkInsertDisasters,
  bulkUpdateDisasters,
} from '../services/disaster.service.js';
import { DisasterInputDTO, DisasterResponseDTO } from '../dto/disaster.dto.js';
import {
  disasterSchema,
  nearQuerySchema,
  bulkInsertSchema,
  bulkUpdateSchema,
  mapJoiErrorMessage,
} from '../validation/disaster.js';
import { errorResponse } from '../middleware/error.js';
import type { DisasterInput } from '../dto/disaster.dto';
import type { Disaster } from '../disaster.model';
// Protobuf support
import * as disastersPb from '../proto/disaster_pb.js';

function asyncHandler<T extends Request, U extends Response>(
  fn: (req: T, res: U, next: NextFunction) => Promise<unknown>,
) {
  return (req: T, res: U, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function isValidNumericId(id: string): boolean {
  return /^\d+$/.test(id) && parseInt(id, 10) > 0;
}

function isDisasterObject(obj: unknown): obj is Disaster {
  return (
    obj !== null && typeof obj === 'object' && 'id' in obj && 'type' in obj && 'location' in obj
  );
}

// Helper for serializing Disaster to Protobuf
function toProtoDisaster(disaster: Disaster) {
  return disastersPb.disasters.Disaster.create({
    id: disaster.id,
    type: disaster.type,
    location:
      disaster.location &&
      disaster.location.type === 'Point' &&
      Array.isArray(disaster.location.coordinates)
        ? JSON.stringify({
            type: disaster.location.type,
            coordinates: disaster.location.coordinates,
          })
        : '',
    date: disaster.date instanceof Date ? disaster.date.toISOString() : disaster.date,
    description: disaster.description,
    status: disaster.status,
    createdAt:
      disaster.createdAt instanceof Date ? disaster.createdAt.toISOString() : disaster.createdAt,
    updatedAt:
      disaster.updatedAt instanceof Date ? disaster.updatedAt.toISOString() : disaster.updatedAt,
  });
}

// Helper to check if client explicitly wants Protobuf
function wantsProtobuf(req: Request): boolean {
  const accept = req.headers.accept;
  if (!accept) return false;
  // Only return Protobuf if it's the first preference
  return accept.split(',')[0].trim() === 'application/x-protobuf';
}

const router = Router();

// Get all disasters with pagination and filtering
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const {
      page = '1',
      limit = '20',
      type,
      dateFrom,
      dateTo,
      status,
    } = req.query as Record<string, string>;
    const pageNum = Number(page) || 1;
    const limitNum = Math.min(Number(limit) || 20, 100);
    const filter: Record<string, unknown> = {};
    if (type) filter.type = type;
    if (status) filter.status = status;
    if (dateFrom) filter.dateFrom = dateFrom;
    if (dateTo) filter.dateTo = dateTo;
    const disasters = await getAllDisasters({
      skip: (pageNum - 1) * limitNum,
      limit: limitNum,
      filter,
    });
    if (wantsProtobuf(req)) {
      // Map to protobuf Disaster messages
      const pbDisasters = disasters.map(toProtoDisaster);
      const message = disastersPb.disasters.DisasterList.create({ disasters: pbDisasters });
      const buffer = disastersPb.disasters.DisasterList.encode(message).finish();
      res.type('application/x-protobuf').send(buffer);
    } else {
      res.json({ data: disasters.map((d: Disaster) => new DisasterResponseDTO(d)) });
    }
  }),
);

// GET /disasters/near?lat=...&lng=...&distance=...
router.get(
  '/near',
  asyncHandler(async (req: Request, res: Response) => {
    // Use a shallow copy of req.query for validation to avoid mutation issues
    const query = { ...req.query };
    const { error, value } = nearQuerySchema.validate(query, { abortEarly: false, convert: true });
    if (error) {
      return errorResponse(res, {
        error: 'Invalid query parameters',
        details: error.details.map((d: Joi.ValidationErrorItem) => mapJoiErrorMessage(d.message)),
        code: 'INVALID_QUERY',
        status: 400,
      });
    }
    const { lat, lng, distance } = value;
    const disasters = await findDisastersNear({ lng, lat, distance });
    if (wantsProtobuf(req)) {
      const pbDisasters = disasters.map(toProtoDisaster);
      const message = disastersPb.disasters.DisasterList.create({ disasters: pbDisasters });
      const buffer = disastersPb.disasters.DisasterList.encode(message).finish();
      res.type('application/x-protobuf').send(buffer);
    } else {
      res.json(disasters.map((d: Disaster) => new DisasterResponseDTO(d)));
    }
  }),
);

// Bulk insert disasters
router.post(
  '/bulk',
  asyncHandler(async (req: Request, res: Response) => {
    const { error } = bulkInsertSchema.validate(req.body, { abortEarly: false });
    if (error)
      return errorResponse(res, {
        error: 'Invalid input',
        details: error.details.map((d: Joi.ValidationErrorItem) => mapJoiErrorMessage(d.message)),
        code: 'INVALID_INPUT',
        status: 400,
      });
    try {
      const disasters = await bulkInsertDisasters(
        req.body.map((d: DisasterInput) => new DisasterInputDTO(d)),
      );
      if (wantsProtobuf(req)) {
        const pbDisasters = disasters.map(toProtoDisaster);
        const message = disastersPb.disasters.DisasterList.create({ disasters: pbDisasters });
        const buffer = disastersPb.disasters.DisasterList.encode(message).finish();
        res.status(201).type('application/x-protobuf').send(buffer);
      } else {
        res.status(201).json({ data: disasters.map((d: Disaster) => new DisasterResponseDTO(d)) });
      }
    } catch (err) {
      // Handle duplicate key or validation errors from PostgreSQL
      return errorResponse(res, {
        error: 'Bulk insert failed',
        details: [(err as Error).message],
        code: 'BULK_INSERT_ERROR',
        status: 400,
      });
    }
  }),
);

// Bulk update disasters
router.put(
  '/bulk',
  asyncHandler(async (req: Request, res: Response) => {
    if (!Array.isArray(req.body) || req.body.length === 0) {
      return errorResponse(res, {
        error: 'Invalid input',
        details: ['Request body must be a non-empty array'],
        code: 'INVALID_INPUT',
        status: 400,
      });
    }
    const { error } = bulkUpdateSchema.validate(req.body, { abortEarly: false });
    if (error)
      return errorResponse(res, {
        error: 'Invalid input',
        details: error.details.map((d: Joi.ValidationErrorItem) => mapJoiErrorMessage(d.message)),
        code: 'INVALID_INPUT',
        status: 400,
      });
    // Only check IDs if Joi validation passes
    const invalidIds = req.body
      .filter(
        (item) =>
          !item.id || typeof item.id !== 'number' || !Number.isInteger(item.id) || item.id <= 0,
      )
      .map((item) => item.id);
    if (invalidIds.length > 0) {
      // For bulk, always return 'Invalid input' (never 'Invalid ID format')
      return errorResponse(res, {
        error: 'Invalid input',
        details: invalidIds.map(() => 'Invalid input'),
        code: 'INVALID_INPUT',
        status: 400,
      });
    }
    try {
      const result = await bulkUpdateDisasters(req.body);
      if (wantsProtobuf(req)) {
        // Only send counts in protobuf if needed, otherwise JSON
        const pbResult = disastersPb.disasters.DisasterList.create({
          disasters: [],
        });
        // Optionally, you could define a new protobuf message for counts
        const buffer = disastersPb.disasters.DisasterList.encode(pbResult).finish();
        res.type('application/x-protobuf').send(buffer);
      } else {
        res.json({ matchedCount: result.matchedCount, modifiedCount: result.modifiedCount });
      }
    } catch (err) {
      return errorResponse(res, {
        error: 'Bulk update failed',
        details: [(err as Error).message],
        code: 'BULK_UPDATE_ERROR',
        status: 400,
      });
    }
  }),
);

// Get a single disaster by ID
router.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    if (!isValidNumericId(req.params.id))
      return errorResponse(res, {
        error: 'Invalid ID format',
        code: 'INVALID_ID',
        status: 400,
      });
    const disaster = await getDisasterById(parseInt(req.params.id, 10));
    if (!disaster)
      return errorResponse(res, {
        error: 'Not found',
        code: 'NOT_FOUND',
        status: 404,
      });
    if (wantsProtobuf(req)) {
      const pbDisaster = toProtoDisaster(disaster);
      const buffer = disastersPb.disasters.Disaster.encode(pbDisaster).finish();
      res.type('application/x-protobuf').send(buffer);
    } else {
      res.json(new DisasterResponseDTO(disaster));
    }
  }),
);

// Create a new disaster
router.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const { error } = disasterSchema.validate(req.body, { abortEarly: false });
    if (error)
      return errorResponse(res, {
        error: 'Invalid input',
        details: error.details.map((d: Joi.ValidationErrorItem) => mapJoiErrorMessage(d.message)),
        code: 'INVALID_INPUT',
        status: 400,
      });
    const disaster = await createDisaster(new DisasterInputDTO(req.body));
    if (wantsProtobuf(req)) {
      const pbDisaster = toProtoDisaster(disaster);
      const buffer = disastersPb.disasters.Disaster.encode(pbDisaster).finish();
      res.status(201).type('application/x-protobuf').send(buffer);
    } else {
      res.status(201).json(new DisasterResponseDTO(disaster));
    }
  }),
);

// Update a disaster
router.put(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    if (!isValidNumericId(req.params.id))
      return errorResponse(res, {
        error: 'Invalid ID format',
        code: 'INVALID_ID',
        status: 400,
      });
    const { error } = disasterSchema.validate(req.body, { abortEarly: false });
    if (error)
      return errorResponse(res, {
        error: 'Invalid input',
        details: error.details.map((d: Joi.ValidationErrorItem) => mapJoiErrorMessage(d.message)),
        code: 'INVALID_INPUT',
        status: 400,
      });
    const disaster = await updateDisaster(
      parseInt(req.params.id, 10),
      new DisasterInputDTO(req.body),
    );
    if (!disaster)
      return errorResponse(res, {
        error: 'Not found',
        code: 'NOT_FOUND',
        status: 404,
      });
    if (wantsProtobuf(req)) {
      const pbDisaster = toProtoDisaster(disaster);
      const buffer = disastersPb.disasters.Disaster.encode(pbDisaster).finish();
      res.type('application/x-protobuf').send(buffer);
    } else {
      res.json(new DisasterResponseDTO(disaster));
    }
  }),
);

// Delete a disaster
router.delete(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    if (!isValidNumericId(req.params.id))
      return errorResponse(res, {
        error: 'Invalid ID format',
        code: 'INVALID_ID',
        status: 400,
      });
    const disaster = await deleteDisaster(parseInt(req.params.id, 10));
    if (!disaster)
      return errorResponse(res, {
        error: 'Not found',
        code: 'NOT_FOUND',
        status: 404,
      });
    if (wantsProtobuf(req)) {
      if (isDisasterObject(disaster)) {
        const pbDisaster = toProtoDisaster(disaster);
        const buffer = disastersPb.disasters.Disaster.encode(pbDisaster).finish();
        res.type('application/x-protobuf').send(buffer);
      } else {
        // Return an empty message if no object is returned
        const empty = disastersPb.disasters.Empty.create();
        const buffer = disastersPb.disasters.Empty.encode(empty).finish();
        res.type('application/x-protobuf').send(buffer);
      }
    } else {
      res.status(204).end();
    }
  }),
);

export { router };
