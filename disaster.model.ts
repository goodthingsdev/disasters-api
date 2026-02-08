// Disaster model for PostgreSQL
// This file defines the TypeScript interface for a disaster and SQL for table creation

export interface Disaster {
  id: string;
  type: string;
  location: {
    type: 'Point';
    coordinates: [number, number];
  };
  date: string | Date;
  description: string;
  status: 'active' | 'contained' | 'resolved';
  source: string;
  externalId?: string | null;
  sourceUrl?: string | null;
  distanceKm?: number;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

// Helper: SQL for creating the disasters table
export const CREATE_DISASTERS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS disasters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type VARCHAR(255) NOT NULL,
  location GEOGRAPHY(POINT, 4326) NOT NULL,
  date TIMESTAMP NOT NULL,
  description TEXT,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  source VARCHAR(255) NOT NULL DEFAULT 'official',
  external_id VARCHAR(255),
  source_url TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
`;

// Helper: SQL to add source tracking columns to existing tables (safe to run repeatedly)
export const ADD_SOURCE_COLUMNS_SQL = `
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'disasters' AND column_name = 'source') THEN
    ALTER TABLE disasters ADD COLUMN source VARCHAR(255) NOT NULL DEFAULT 'official';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'disasters' AND column_name = 'external_id') THEN
    ALTER TABLE disasters ADD COLUMN external_id VARCHAR(255);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'disasters' AND column_name = 'source_url') THEN
    ALTER TABLE disasters ADD COLUMN source_url TEXT;
  END IF;
END
$$;
`;

// Helper: SQL for creating the geospatial index
export const CREATE_LOCATION_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS idx_disasters_location ON disasters USING GIST(location);
`;

// Helper: SQL for creating source-related indexes
export const CREATE_SOURCE_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS idx_disasters_source ON disasters (source);
`;

export const CREATE_SOURCE_EXTERNAL_ID_UNIQUE_INDEX_SQL = `
CREATE UNIQUE INDEX IF NOT EXISTS idx_disasters_source_external_id
  ON disasters (source, external_id)
  WHERE external_id IS NOT NULL;
`;
