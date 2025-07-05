// Disaster Service Layer (PostgreSQL with PostGIS)
import { Pool } from 'pg';
import { Disaster } from '../disaster.model.js';
import { DisasterInput } from '../dto/disaster.dto.js';

// Initialize PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.POSTGRES_URI,
});

/**
 * Create a new disaster record
 */
export const createDisaster = async (data: DisasterInput): Promise<Disaster> => {
  const { type, location, date, description, status } = data;
  let dateValue = date;
  if (typeof dateValue === 'number' || (typeof dateValue === 'string' && /^\d+$/.test(dateValue))) {
    dateValue = new Date(Number(dateValue)).toISOString().slice(0, 10);
  }
  const result = await pool.query(
    `INSERT INTO disasters (type, location, date, description, status)
     VALUES ($1, ST_GeomFromGeoJSON($2)::geography, $3, $4, $5)
     RETURNING id, type, ST_AsGeoJSON(location)::json as location, date, description, status, created_at, updated_at`,
    [type, JSON.stringify(location), dateValue, description, status || 'active'],
  );
  return mapRowToDisaster(result.rows[0]);
};

// Add a type for filtering disasters, supporting dateFrom and dateTo
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
  const { skip: skipRaw = 0, limit: limitRaw = 20, filter = {} } = opts;
  const skip = Number.isFinite(skipRaw) && skipRaw >= 0 ? skipRaw : 0;
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 20;

  let whereClause = '';
  const values: unknown[] = [];
  let paramIndex = 1;

  // Build WHERE clause dynamically based on filter
  if (Object.keys(filter).length > 0) {
    const conditions: string[] = [];

    if (filter.type) {
      conditions.push(`type = $${paramIndex++}`);
      values.push(filter.type);
    }

    if (filter.status) {
      conditions.push(`status = $${paramIndex++}`);
      values.push(filter.status);
    }

    if (filter.dateFrom) {
      let dateFrom = filter.dateFrom;
      if (
        typeof dateFrom === 'number' ||
        (typeof dateFrom === 'string' && /^\d+$/.test(dateFrom))
      ) {
        dateFrom = new Date(Number(dateFrom)).toISOString().slice(0, 10);
      }
      // Use >= comparison and cast date column to DATE for safe string comparison
      conditions.push(`date::date >= $${paramIndex++}`);
      values.push(dateFrom);
    }
    if (filter.dateTo) {
      let dateTo = filter.dateTo;
      if (typeof dateTo === 'number' || (typeof dateTo === 'string' && /^\d+$/.test(dateTo))) {
        dateTo = new Date(Number(dateTo)).toISOString().slice(0, 10);
      }
      // Use <= comparison and cast date column to DATE for safe string comparison
      conditions.push(`date::date <= $${paramIndex++}`);
      values.push(dateTo);
    }

    if (conditions.length > 0) {
      whereClause = `WHERE ${conditions.join(' AND ')}`;
    }
  }

  values.push(skip, limit);

  const result = await pool.query(
    `SELECT id, type, ST_AsGeoJSON(location)::json as location, date, description, status, created_at, updated_at
     FROM disasters 
     ${whereClause}
     ORDER BY created_at DESC
     OFFSET $${paramIndex++} LIMIT $${paramIndex++}`,
    values,
  );

  return result.rows.map(mapRowToDisaster);
};

/**
 * Count total disasters
 */
export const countDisasters = async (): Promise<number> => {
  const result = await pool.query('SELECT COUNT(*) FROM disasters');
  return parseInt(result.rows[0].count, 10);
};

/**
 * Get disaster by ID
 */
export const getDisasterById = async (id: number): Promise<Disaster | null> => {
  const result = await pool.query(
    `SELECT id, type, ST_AsGeoJSON(location)::json as location, date, description, status, created_at, updated_at
     FROM disasters WHERE id = $1`,
    [id],
  );

  return result.rows[0] ? mapRowToDisaster(result.rows[0]) : null;
};

/**
 * Update disaster by ID
 */
export const updateDisaster = async (
  id: number,
  data: Partial<DisasterInput>,
): Promise<Disaster | null> => {
  const fields: string[] = [];
  const values: unknown[] = [id];
  let paramIndex = 2;

  // Build SET clause dynamically
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      if (key === 'location') {
        fields.push(`location = ST_GeomFromGeoJSON($${paramIndex++})::geography`);
        values.push(JSON.stringify(value));
      } else if (key === 'date') {
        let dateValue = value;
        if (
          typeof dateValue === 'number' ||
          (typeof dateValue === 'string' && /^\d+$/.test(dateValue))
        ) {
          dateValue = new Date(Number(dateValue)).toISOString().slice(0, 10);
        }
        fields.push(`date = $${paramIndex++}`);
        values.push(dateValue);
      } else {
        fields.push(`${key} = $${paramIndex++}`);
        values.push(value);
      }
    }
  }

  if (fields.length === 0) {
    return getDisasterById(id);
  }

  // Always update the updated_at timestamp
  fields.push('updated_at = NOW()');

  const result = await pool.query(
    `UPDATE disasters 
     SET ${fields.join(', ')}
     WHERE id = $1
     RETURNING id, type, ST_AsGeoJSON(location)::json as location, date, description, status, created_at, updated_at`,
    values,
  );

  return result.rows[0] ? mapRowToDisaster(result.rows[0]) : null;
};

/**
 * Delete disaster by ID
 */
export const deleteDisaster = async (id: number): Promise<boolean> => {
  const result = await pool.query('DELETE FROM disasters WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
};

// Overloads for findDisastersNear function
export async function findDisastersNear(
  lng: number,
  lat: number,
  distanceKm: number,
): Promise<Disaster[]>;
export async function findDisastersNear(args: {
  lat: number;
  lng: number;
  distance: number;
}): Promise<Disaster[]>;
export async function findDisastersNear(
  arg1: number | { lat: number; lng: number; distance: number },
  arg2?: number,
  arg3?: number,
): Promise<Disaster[]> {
  let lng: number, lat: number, distanceKm: number;

  if (typeof arg1 === 'object') {
    ({ lat, lng, distance: distanceKm } = arg1);
  } else {
    lng = arg1;
    lat = arg2 as number;
    distanceKm = arg3 as number;
  }

  const result = await pool.query(
    `SELECT id, type, ST_AsGeoJSON(location)::json as location, date, description, status, created_at, updated_at,
            ST_Distance(location, ST_GeomFromText('POINT(' || $1 || ' ' || $2 || ')')::geography) / 1000 as distance_km
     FROM disasters 
     WHERE ST_DWithin(location, ST_GeomFromText('POINT(' || $1 || ' ' || $2 || ')')::geography, $3 * 1000)
     ORDER BY distance_km`,
    [lng, lat, distanceKm],
  );

  return result.rows.map(mapRowToDisaster);
}

/**
 * Bulk insert disasters
 */
export const bulkInsertDisasters = async (disasters: DisasterInput[]): Promise<Disaster[]> => {
  if (disasters.length === 0) return [];
  const values: unknown[] = [];
  const placeholders: string[] = [];
  let paramIndex = 1;
  for (const disaster of disasters) {
    let dateValue = disaster.date;
    if (
      typeof dateValue === 'number' ||
      (typeof dateValue === 'string' && /^\d+$/.test(dateValue))
    ) {
      dateValue = new Date(Number(dateValue)).toISOString().slice(0, 10);
    }
    placeholders.push(
      `($${paramIndex++}, ST_GeomFromGeoJSON($${paramIndex++})::geography, $${paramIndex++}, $${paramIndex++}, $${paramIndex++})`,
    );
    values.push(
      disaster.type,
      JSON.stringify(disaster.location),
      dateValue,
      disaster.description,
      disaster.status || 'active',
    );
  }
  const result = await pool.query(
    `INSERT INTO disasters (type, location, date, description, status)
     VALUES ${placeholders.join(', ')}
     RETURNING id, type, ST_AsGeoJSON(location)::json as location, date, description, status, created_at, updated_at`,
    values,
  );
  return result.rows.map(mapRowToDisaster);
};

/**
 * Bulk update disasters
 */
export const bulkUpdateDisasters = async (
  updates: Array<{ id: number } & Partial<DisasterInput>>,
): Promise<{ matchedCount: number; modifiedCount: number }> => {
  let modifiedCount = 0;
  const matchedCount = updates.length;
  // Use a transaction for bulk updates
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const update of updates) {
      const { id, ...data } = update;
      const result = await updateDisaster(id, data);
      if (result) {
        modifiedCount++;
      }
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  return { matchedCount, modifiedCount };
};

// Helper function to map database row to Disaster object
function mapRowToDisaster(row: Record<string, unknown>): Disaster {
  let dateValue = row.date;
  // Always convert to ISO date string (YYYY-MM-DD)
  if (dateValue instanceof Date) {
    dateValue = dateValue.toISOString().slice(0, 10);
  } else if (typeof dateValue === 'string') {
    // If stringified timestamp, convert to ISO
    if (/^\d+$/.test(dateValue)) {
      dateValue = new Date(Number(dateValue)).toISOString().slice(0, 10);
    } else if (/^\d{4}-\d{2}-\d{2}/.test(dateValue)) {
      // Already ISO, keep as is
    } else {
      // Try to parse as date
      const d = new Date(dateValue);
      if (!isNaN(d.getTime())) {
        dateValue = d.toISOString().slice(0, 10);
      }
    }
  } else if (typeof dateValue === 'number') {
    dateValue = new Date(dateValue).toISOString().slice(0, 10);
  }
  // Always return a string for date
  const dateString = typeof dateValue === 'string' ? dateValue : '';
  return {
    id: row.id as number,
    type: row.type as string,
    location:
      typeof row.location === 'object' &&
      row.location !== null &&
      'type' in row.location &&
      'coordinates' in row.location
        ? (row.location as { type: 'Point'; coordinates: [number, number] })
        : { type: 'Point', coordinates: [0, 0] },
    date: dateString,
    description: row.description as string,
    status: row.status as 'active' | 'contained' | 'resolved',
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}
