import { prisma } from './prisma';
import { Disaster } from '../disaster.model.js';
import { DisasterInput } from '../dto/disaster.dto.js';

// Common SELECT columns used across queries
const BASE_SELECT_COLUMNS = `id, type, ST_AsGeoJSON(location)::json as location, date, description, status, source, external_id, source_url, created_at, updated_at`;

// Helper to format date as YYYY-MM-DD
function formatDisasterDate(d: Disaster): Disaster {
  return {
    ...d,
    date:
      d.date instanceof Date
        ? d.date.toISOString().slice(0, 10)
        : typeof d.date === 'string'
          ? d.date.slice(0, 10)
          : d.date,
  };
}

/**
 * Create a new disaster record
 */
export const createDisaster = async (data: DisasterInput): Promise<Disaster> => {
  const { type, location, date, description, status, source, external_id, source_url } = data;
  const result = (await prisma.$queryRawUnsafe(
    `INSERT INTO disasters (type, location, date, description, status, source, external_id, source_url)
     VALUES ($1, ST_GeomFromGeoJSON($2)::geography, $3::timestamp, $4, $5, $6, $7, $8)
     RETURNING ${BASE_SELECT_COLUMNS}`,
    type,
    JSON.stringify(location),
    date,
    description,
    status || 'active',
    source || 'official',
    external_id || null,
    source_url || null,
  )) as Disaster[];
  return formatDisasterDate(result[0]);
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
  if (filterConst.source) {
    conditions.push(`source = $${paramIndex++}`);
    values.push(filterConst.source);
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
    `SELECT ${BASE_SELECT_COLUMNS}
     FROM disasters
     ${whereClause}
     ORDER BY created_at DESC
     OFFSET $${paramIndex++} LIMIT $${paramIndex++}`,
    ...values,
  )) as Disaster[];
  return result.map(formatDisasterDate);
};

export const countDisasters = async (filter: DisasterFilter = {}): Promise<number> => {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;
  if (filter.type) {
    conditions.push(`type = $${paramIndex++}`);
    values.push(filter.type);
  }
  if (filter.status) {
    conditions.push(`status = $${paramIndex++}`);
    values.push(filter.status);
  }
  if (filter.source) {
    conditions.push(`source = $${paramIndex++}`);
    values.push(filter.source);
  }
  if (filter.dateFrom) {
    conditions.push(`date >= $${paramIndex++}::timestamp`);
    values.push(filter.dateFrom);
  }
  if (filter.dateTo) {
    conditions.push(`date <= $${paramIndex++}::timestamp`);
    values.push(filter.dateTo);
  }
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = (await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) FROM disasters ${whereClause}`,
    ...values,
  )) as { count: string }[];
  return parseInt(result[0].count, 10);
};

export const getDisasterById = async (id: string): Promise<Disaster | null> => {
  const result = (await prisma.$queryRawUnsafe(
    `SELECT ${BASE_SELECT_COLUMNS}
     FROM disasters WHERE id = $1::uuid`,
    id,
  )) as Disaster[];
  if (!result[0]) return null;
  return formatDisasterDate(result[0]);
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
     RETURNING ${BASE_SELECT_COLUMNS}`,
    ...values,
  )) as Disaster[];
  if (!result[0]) return null;
  return formatDisasterDate(result[0]);
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
      `($${paramIndex++}, ST_GeomFromGeoJSON($${paramIndex++})::geography, $${paramIndex++}::timestamp, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++})`,
    );
    values.push(
      disaster.type,
      JSON.stringify(disaster.location),
      disaster.date,
      disaster.description,
      disaster.status || 'active',
      disaster.source || 'official',
      disaster.external_id || null,
      disaster.source_url || null,
    );
  }
  const result = (await prisma.$queryRawUnsafe(
    `INSERT INTO disasters (type, location, date, description, status, source, external_id, source_url)
     VALUES ${placeholders.join(', ')}
     RETURNING ${BASE_SELECT_COLUMNS}`,
    ...values,
  )) as Disaster[];
  return result.map(formatDisasterDate);
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

export async function findDisastersNear(params: {
  lat: number;
  lng: number;
  distance: number;
  status?: string;
  source?: string;
}): Promise<Disaster[]> {
  const { lat, lng, distance, status, source } = params;

  // Build optional WHERE conditions beyond the spatial filter
  const conditions: string[] = [
    `ST_DWithin(location, ST_GeomFromText('POINT(' || $1 || ' ' || $2 || ')')::geography, $3 * 1000)`,
  ];
  const values: unknown[] = [lng, lat, distance];
  let paramIndex = 4;

  if (status) {
    conditions.push(`status = $${paramIndex++}`);
    values.push(status);
  }
  if (source) {
    conditions.push(`source = $${paramIndex++}`);
    values.push(source);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  const result = (await prisma.$queryRawUnsafe(
    `SELECT ${BASE_SELECT_COLUMNS},
            ST_Distance(location, ST_GeomFromText('POINT(' || $1 || ' ' || $2 || ')')::geography) / 1000 as distance_km
     FROM disasters
     ${whereClause}
     ORDER BY distance_km`,
    ...values,
  )) as Disaster[];
  return result;
}
