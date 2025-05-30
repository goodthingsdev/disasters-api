import mongoose, { Document } from 'mongoose';
import { DisasterInput } from './dto/disaster.dto';

// GeoJSON Point schema for location
const geoPointSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['Point'],
      required: true,
      default: 'Point',
    },
    coordinates: {
      type: [Number],
      required: true,
      validate: {
        validator: (arr: number[]) =>
          Array.isArray(arr) && arr.length === 2 && arr.every((n) => typeof n === 'number'),
        message: 'Coordinates must be [lng, lat] as numbers.',
      },
    },
  },
  { _id: false },
);

const disasterSchema = new mongoose.Schema(
  {
    type: { type: String, required: true },
    location: { type: geoPointSchema, required: true },
    date: { type: String, required: true },
    description: { type: String },
    status: {
      type: String,
      enum: ['active', 'contained', 'resolved'],
      default: 'active',
      required: true,
    },
  },
  { timestamps: true },
);

disasterSchema.index({ location: '2dsphere' });

export interface DisasterDocument extends Document, DisasterInput {
  status: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

const Disaster = mongoose.model<DisasterDocument>('Disaster', disasterSchema);

export { Disaster };
