import { Request, Response, NextFunction, Router } from 'express';
import Joi from 'joi';
import mongoose from 'mongoose';
import {
  createDisaster,
  getAllDisasters,
  getDisasterById,
  updateDisaster,
  deleteDisaster,
  findDisastersNear,
  bulkInsertDisasters,
  bulkUpdateDisasters,
} from '../services/disaster.service';
import { DisasterInputDTO, DisasterResponseDTO } from '../dto/disaster.dto';
import {
  disasterSchema,
  nearQuerySchema,
  bulkInsertSchema,
  bulkUpdateSchema,
  mapJoiErrorMessage,
} from '../validation/disaster';
import { errorResponse } from '../middleware/error';
import type { DisasterInput } from '../dto/disaster.dto';
import type { DisasterDocument } from '../disaster.model';

function asyncHandler<T extends Request, U extends Response>(
  fn: (req: T, res: U, next: NextFunction) => Promise<unknown>,
) {
  return (req: T, res: U, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function isValidObjectId(id: string): boolean {
  return mongoose.Types.ObjectId.isValid(id);
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
    if (dateFrom || dateTo) {
      filter.date = {};
      if (dateFrom) (filter.date as Record<string, string>).$gte = dateFrom;
      if (dateTo) (filter.date as Record<string, string>).$lte = dateTo;
    }
    const disasters = await getAllDisasters({
      skip: (pageNum - 1) * limitNum,
      limit: limitNum,
      filter,
    });
    res.json({ data: disasters.map((d: DisasterDocument) => new DisasterResponseDTO(d)) });
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
    res.json(disasters.map((d: DisasterDocument) => new DisasterResponseDTO(d)));
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
      res
        .status(201)
        .json({ data: disasters.map((d: DisasterDocument) => new DisasterResponseDTO(d)) });
    } catch (err) {
      // Handle duplicate key or validation errors from Mongo
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
    // Only check ObjectIds if Joi validation passes
    const invalidIds = req.body
      .filter((item) => !item._id || typeof item._id !== 'string' || !isValidObjectId(item._id))
      .map((item) => item._id);
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
      res.json({ matchedCount: result.matchedCount, modifiedCount: result.modifiedCount });
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
    if (!isValidObjectId(req.params.id))
      return errorResponse(res, {
        error: 'Invalid ID format',
        code: 'INVALID_ID',
        status: 400,
      });
    const disaster = await getDisasterById(req.params.id);
    if (!disaster)
      return errorResponse(res, {
        error: 'Not found',
        code: 'NOT_FOUND',
        status: 404,
      });
    res.json(new DisasterResponseDTO(disaster));
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
    res.status(201).json(new DisasterResponseDTO(disaster));
  }),
);

// Update a disaster
router.put(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    if (!isValidObjectId(req.params.id))
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
    const disaster = await updateDisaster(req.params.id, new DisasterInputDTO(req.body));
    if (!disaster)
      return errorResponse(res, {
        error: 'Not found',
        code: 'NOT_FOUND',
        status: 404,
      });
    res.json(new DisasterResponseDTO(disaster));
  }),
);

// Delete a disaster
router.delete(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    if (!isValidObjectId(req.params.id))
      return errorResponse(res, {
        error: 'Invalid ID format',
        code: 'INVALID_ID',
        status: 400,
      });
    const disaster = await deleteDisaster(req.params.id);
    if (!disaster)
      return errorResponse(res, {
        error: 'Not found',
        code: 'NOT_FOUND',
        status: 404,
      });
    res.status(204).end();
  }),
);

export { router };
