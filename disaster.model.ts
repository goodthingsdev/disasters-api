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
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
`;

// Helper: SQL for creating the geospatial index
export const CREATE_LOCATION_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS idx_disasters_location ON disasters USING GIST(location);
`;
