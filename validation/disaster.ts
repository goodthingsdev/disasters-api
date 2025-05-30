// Joi validation schemas and helpers for disasters
import Joi from 'joi';

const disasterSchema = Joi.object({
  type: Joi.string().required(),
  location: Joi.object({
    type: Joi.string().valid('Point').required(),
    coordinates: Joi.array()
      .length(2)
      .items(
        Joi.number().min(-180).max(180), // lng
        Joi.number().min(-90).max(90), // lat
      )
      .required(),
  }).required(),
  date: Joi.string().isoDate().required(),
  description: Joi.string().allow('').optional(),
  status: Joi.string().valid('active', 'contained', 'resolved').default('active').required(),
});

const nearQuerySchema = Joi.object({
  lat: Joi.number().min(-90).max(90).required(),
  lng: Joi.number().min(-180).max(180).required(),
  distance: Joi.number().min(0).required(),
});

const bulkInsertSchema = Joi.array().items(disasterSchema).min(1).required();

const bulkUpdateSchema = Joi.array()
  .items(
    Joi.object({
      _id: Joi.string().required(),
      type: Joi.string(),
      location: Joi.object({
        type: Joi.string().valid('Point'),
        coordinates: Joi.array()
          .length(2)
          .items(Joi.number().min(-180).max(180), Joi.number().min(-90).max(90)),
      }),
      date: Joi.string().isoDate(),
      description: Joi.string().allow(''),
      status: Joi.string().valid('active', 'contained', 'resolved'),
    }).min(2), // must have _id and at least one field to update
  )
  .min(1)
  .required();

function mapJoiErrorMessage(msg: string): string {
  return msg
    .replace('"type" is required', 'type (string) is required')
    .replace('"location" is required', 'location (object) is required')
    .replace('"date" is required', 'date (ISO string) is required')
    .replace('"location.lat" is required', 'location.lat (number) is required')
    .replace('"location.lng" is required', 'location.lng (number) is required')
    .replace('"location.lat" must be a number', 'location.lat (number) is required')
    .replace('"location.lng" must be a number', 'location.lng (number) is required')
    .replace('"lat" must be a number', 'lat (number) is required as query parameter')
    .replace('"lng" must be a number', 'lng (number) is required as query parameter')
    .replace('"distance" must be a number', 'distance (number, km) is required as query parameter')
    .replace('"date" must be in iso format', 'date (ISO string) is required');
}

export { disasterSchema, nearQuerySchema, bulkInsertSchema, bulkUpdateSchema, mapJoiErrorMessage };
