// Disaster Service Layer
// Handles business logic for disaster operations
import { Disaster, DisasterDocument } from '../disaster.model';
import { DisasterInput } from '../dto/disaster.dto';
import type { BulkWriteResult } from 'mongodb';

// Define a type for filter objects
export interface DisasterFilter {
  type?: string;
  date?: { $gte?: string; $lte?: string };
  location?: {
    $near?: {
      $geometry: {
        type: 'Point';
        coordinates: [number, number];
      };
      $maxDistance?: number;
    };
  };
  [key: string]: unknown;
}

// Define a type for bulk update objects
export interface DisasterUpdate {
  _id: string;
  [key: string]: unknown;
}

const createDisaster = async (data: DisasterInput): Promise<DisasterDocument> => {
  const disaster = new Disaster(data);
  await disaster.save();
  return disaster;
};

// Paginated getAllDisasters
const getAllDisasters = async (
  opts: { skip?: number; limit?: number; filter?: DisasterFilter } = {},
): Promise<DisasterDocument[]> => {
  // Support both legacy (no args) and paginated ({skip, limit, filter})
  if (Object.keys(opts).length === 0) {
    return Disaster.find();
  }
  const { skip = 0, limit = 20, filter = {} } = opts;
  return Disaster.find(filter).skip(skip).limit(limit);
};

const countDisasters = async (filter: DisasterFilter = {}): Promise<number> => {
  return Disaster.countDocuments(filter);
};

const getDisasterById = async (id: string): Promise<DisasterDocument | null> => {
  return Disaster.findById(id);
};

const updateDisaster = async (
  id: string,
  data: Partial<DisasterInput>,
): Promise<DisasterDocument | null> => {
  return Disaster.findByIdAndUpdate(id, data, { new: true });
};

const deleteDisaster = async (id: string): Promise<DisasterDocument | null> => {
  return Disaster.findByIdAndDelete(id);
};

// Overloads for type safety
export async function findDisastersNear(
  lng: number,
  lat: number,
  distanceKm: number,
): Promise<DisasterDocument[]>;
export async function findDisastersNear(args: {
  lat: number;
  lng: number;
  distance: number;
}): Promise<DisasterDocument[]>;
export async function findDisastersNear(
  arg1: number | { lat: number; lng: number; distance: number },
  arg2?: number,
  arg3?: number,
): Promise<DisasterDocument[]> {
  let lng: number, lat: number, distanceKm: number;
  if (typeof arg1 === 'object') {
    ({ lat, lng, distance: distanceKm } = arg1);
  } else {
    lng = arg1;
    lat = arg2 as number;
    distanceKm = arg3 as number;
  }
  return Disaster.find({
    location: {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: [lng, lat],
        },
        $maxDistance: distanceKm * 1000,
      },
    },
  });
}

const bulkInsertDisasters = async (disasterArray: DisasterInput[]): Promise<DisasterDocument[]> => {
  // disasterArray: array of disaster objects
  return Disaster.insertMany(disasterArray, { ordered: false });
};

const bulkUpdateDisasters = async (updatesArray: DisasterUpdate[]): Promise<BulkWriteResult> => {
  const ops = updatesArray.map(({ _id, ...fields }) => ({
    updateOne: {
      filter: { _id },
      update: { $set: fields },
    },
  }));
  return Disaster.bulkWrite(ops, { ordered: false });
};

export {
  createDisaster,
  getAllDisasters,
  countDisasters,
  getDisasterById,
  updateDisaster,
  deleteDisaster,
  bulkInsertDisasters,
  bulkUpdateDisasters,
};
