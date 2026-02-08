// Disaster DTOs (Data Transfer Objects)

// For request validation and shaping
export interface DisasterInput {
  type: string;
  location: {
    type: 'Point';
    coordinates: [number, number];
  };
  date: string | Date;
  description: string;
  status: string;
  source?: string;
  external_id?: string | null;
  source_url?: string | null;
}

export class DisasterInputDTO implements DisasterInput {
  type: string;
  location: { type: 'Point'; coordinates: [number, number] };
  date: string | Date;
  description: string;
  status: string;
  source?: string;
  external_id?: string | null;
  source_url?: string | null;

  constructor({
    type,
    location,
    date,
    description,
    status,
    source,
    external_id,
    source_url,
  }: DisasterInput) {
    this.type = type;
    this.location = location;
    this.date = date;
    this.description = description;
    this.status = status;
    this.source = source;
    this.external_id = external_id;
    this.source_url = source_url;
  }
}

// For response shaping
export interface DisasterResponse {
  id: string;
  type: string;
  location: { type: 'Point'; coordinates: [number, number] };
  date: string | Date;
  description: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  status: string;
  source: string;
  externalId?: string | null;
  sourceUrl?: string | null;
  distanceKm?: number;
}

// Allow snake_case fields from raw DB results
interface RawDisasterRow {
  id?: string;
  type: string;
  location: { type: 'Point'; coordinates: [number, number] };
  date: string | Date;
  description: string;
  createdAt?: string | Date;
  created_at?: string | Date;
  updatedAt?: string | Date;
  updated_at?: string | Date;
  status: string;
  source?: string;
  externalId?: string | null;
  external_id?: string | null;
  sourceUrl?: string | null;
  source_url?: string | null;
  distanceKm?: number;
  distance_km?: number;
}

export class DisasterResponseDTO implements DisasterResponse {
  id: string;
  type: string;
  location: { type: 'Point'; coordinates: [number, number] };
  date: string | Date;
  description: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  status: string;
  source: string;
  externalId?: string | null;
  sourceUrl?: string | null;
  distanceKm?: number;

  constructor(disaster: RawDisasterRow | DisasterResponse | import('../disaster.model').Disaster) {
    const raw = disaster as RawDisasterRow;
    this.id = disaster.id as string;
    this.type = disaster.type;
    this.location = disaster.location;
    this.date = disaster.date;
    this.description = disaster.description;
    this.createdAt = raw.createdAt ?? raw.created_at;
    this.updatedAt = raw.updatedAt ?? raw.updated_at;
    this.status = disaster.status || 'active';
    this.source = raw.source || 'official';
    this.externalId = raw.externalId ?? raw.external_id ?? null;
    this.sourceUrl = raw.sourceUrl ?? raw.source_url ?? null;
    const distKm = raw.distanceKm ?? raw.distance_km;
    if (distKm !== undefined && distKm !== null) {
      this.distanceKm = Number(distKm);
    }
  }
}
