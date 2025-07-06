import { prisma } from './prisma';
import { Disaster } from '../disaster.model.js';
import { DisasterInput } from '../dto/disaster.dto.js';

/**
 * Create a new disaster record
 */
export const createDisaster = async (data: DisasterInput): Promise<Disaster> => {
  const { type, location, date, description, status } = data;
  // Prisma does not natively support PostGIS geography(Point,4326), so use raw SQL
  const result = (await prisma.$queryRawUnsafe(
    `INSERT INTO disasters (type, location, date, description, status)
     VALUES ($1, ST_GeomFromGeoJSON($2)::geography, $3::timestamp, $4, $5)
     RETURNING id, type, ST_AsGeoJSON(location)::json as location, date, description, status, created_at, updated_at`,
    type,
    JSON.stringify(location),
    date,
    description,
    status || 'active',
  )) as Disaster[];
  return {
    ...result[0],
    date:
      result[0].date instanceof Date
        ? result[0].date.toISOString().slice(0, 10)
        : typeof result[0].date === 'string'
          ? result[0].date.slice(0, 10)
          : result[0].date,
  };
};

export type DisasterFilter = Partial<Disaster> & {
  dateFrom?: string;
  dateTo?: string;
};

/**
 * Get all disasters with optional pagination and filtering
 */
export const getAllDisasters = async (
  opts: { skip?: number; limit?: number; filter?: DisasterFilter } = {},
): Promise<Disaster[]> => {
  const { skip = 0, limit = 20, filter: filterConst = {} } = opts;
  const sanitizedSkip = Number.isFinite(skip) && skip > 0 ? skip : 0;
  const sanitizedLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 100) : 20;
  // Build WHERE clause and values
  const conditions: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;
  if (filterConst.type) {
    conditions.push(`type = $${paramIndex++}`);
    values.push(filterConst.type);
  }
  if (filterConst.status) {
    conditions.push(`status = $${paramIndex++}`);
    values.push(filterConst.status);
  }
  if (filterConst.dateFrom) {
    conditions.push(`date >= $${paramIndex++}::timestamp`);
    values.push(filterConst.dateFrom);
  }
  if (filterConst.dateTo) {
    conditions.push(`date <= $${paramIndex++}::timestamp`);
    values.push(filterConst.dateTo);
  }
  let whereClause = '';
  if (conditions.length > 0) {
    whereClause = `WHERE ${conditions.join(' AND ')}`;
  }
  values.push(sanitizedSkip, sanitizedLimit);
  const result = (await prisma.$queryRawUnsafe(
    `SELECT id, type, ST_AsGeoJSON(location)::json as location, date, description, status, created_at, updated_at
     FROM disasters
     ${whereClause}
     ORDER BY created_at DESC
     OFFSET $${paramIndex++} LIMIT $${paramIndex++}`,
    ...values,
  )) as Disaster[];
  // Format date as YYYY-MM-DD in each result
  return result.map((d) => ({
    ...d,
    date:
      d.date instanceof Date
        ? d.date.toISOString().slice(0, 10)
        : typeof d.date === 'string'
          ? d.date.slice(0, 10)
          : d.date,
  }));
};

export const countDisasters = async (): Promise<number> => {
  const result = (await prisma.$queryRawUnsafe('SELECT COUNT(*) FROM disasters')) as {
    count: string;
  }[];
  return parseInt(result[0].count, 10);
};

export const getDisasterById = async (id: string): Promise<Disaster | null> => {
  const result = (await prisma.$queryRawUnsafe(
    `SELECT id, type, ST_AsGeoJSON(location)::json as location, date, description, status, created_at, updated_at
     FROM disasters WHERE id = $1::uuid`,
    id,
  )) as Disaster[];
  if (!result[0]) return null;
  // Format date as YYYY-MM-DD
  return {
    ...result[0],
    date:
      result[0].date instanceof Date
        ? result[0].date.toISOString().slice(0, 10)
        : typeof result[0].date === 'string'
          ? result[0].date.slice(0, 10)
          : result[0].date,
  };
};

export const updateDisaster = async (
  id: string,
  data: Partial<DisasterInput>,
): Promise<Disaster | null> => {
  const fields: string[] = [];
  const values: unknown[] = [id];
  let paramIndex = 2;
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      if (key === 'location') {
        fields.push(`location = ST_GeomFromGeoJSON($${paramIndex++})::geography`);
        values.push(JSON.stringify(value));
      } else if (key === 'date') {
        fields.push(`date = $${paramIndex++}::timestamp`);
        values.push(value);
      } else {
        fields.push(`${key} = $${paramIndex++}`);
        values.push(value);
      }
    }
  }
  if (fields.length === 0) {
    return getDisasterById(id);
  }
  fields.push('updated_at = NOW()');
  const result = (await prisma.$queryRawUnsafe(
    `UPDATE disasters
     SET ${fields.join(', ')}
     WHERE id = $1::uuid
     RETURNING id, type, ST_AsGeoJSON(location)::json as location, date, description, status, created_at, updated_at`,
    ...values,
  )) as Disaster[];
  if (!result[0]) return null;
  return {
    ...result[0],
    date:
      result[0].date instanceof Date
        ? result[0].date.toISOString().slice(0, 10)
        : typeof result[0].date === 'string'
          ? result[0].date.slice(0, 10)
          : result[0].date,
  };
};

export const deleteDisaster = async (id: string): Promise<boolean> => {
  const result = await prisma.$executeRawUnsafe('DELETE FROM disasters WHERE id = $1::uuid', id);
  return result > 0;
};

export const bulkInsertDisasters = async (disasters: DisasterInput[]): Promise<Disaster[]> => {
  if (disasters.length === 0) return [];
  const values: unknown[] = [];
  const placeholders: string[] = [];
  let paramIndex = 1;
  for (const disaster of disasters) {
    placeholders.push(
      `($${paramIndex++}, ST_GeomFromGeoJSON($${paramIndex++})::geography, $${paramIndex++}::timestamp, $${paramIndex++}, $${paramIndex++})`,
    );
    values.push(
      disaster.type,
      JSON.stringify(disaster.location),
      disaster.date,
      disaster.description,
      disaster.status || 'active',
    );
  }
  const result = (await prisma.$queryRawUnsafe(
    `INSERT INTO disasters (type, location, date, description, status)
     VALUES ${placeholders.join(', ')}
     RETURNING id, type, ST_AsGeoJSON(location)::json as location, date, description, status, created_at, updated_at`,
    ...values,
  )) as Disaster[];
  return result.map((d) => ({
    ...d,
    date:
      d.date instanceof Date
        ? d.date.toISOString().slice(0, 10)
        : typeof d.date === 'string'
          ? d.date.slice(0, 10)
          : d.date,
  }));
};

export const bulkUpdateDisasters = async (
  updates: Array<{ id: string } & Partial<DisasterInput>>,
): Promise<{ matchedCount: number; modifiedCount: number }> => {
  let modifiedCount = 0;
  const matchedCount = updates.length;
  for (const update of updates) {
    const { id, ...data } = update;
    const result = await updateDisaster(id, data);
    if (result) {
      modifiedCount++;
    }
  }
  return { matchedCount, modifiedCount };
};

export async function findDisastersNear(arg1: {
  lat: number;
  lng: number;
  distance: number;
}): Promise<Disaster[]> {
  const { lat, lng, distance } = arg1;
  const result = (await prisma.$queryRawUnsafe(
    `SELECT id, type, ST_AsGeoJSON(location)::json as location, date, description, status, created_at, updated_at,
            ST_Distance(location, ST_GeomFromText('POINT(' || $1 || ' ' || $2 || ')')::geography) / 1000 as distance_km
     FROM disasters
     WHERE ST_DWithin(location, ST_GeomFromText('POINT(' || $1 || ' ' || $2 || ')')::geography, $3 * 1000)
     ORDER BY distance_km`,
    lng,
    lat,
    distance,
  )) as Disaster[];
  return result;
}
