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
  status: string; // <-- add status
}

export class DisasterInputDTO implements DisasterInput {
  type: string;
  location: { type: 'Point'; coordinates: [number, number] };
  date: string | Date;
  description: string;
  status: string; // <-- add status

  constructor({ type, location, date, description, status }: DisasterInput) {
    this.type = type;
    this.location = location;
    this.date = date;
    this.description = description;
    this.status = status; // <-- assign status
  }
}

// For response shaping
export interface DisasterResponse {
  _id: string;
  type: string;
  location: { type: 'Point'; coordinates: [number, number] };
  date: string | Date;
  description: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  status: string;
}

export class DisasterResponseDTO implements DisasterResponse {
  _id: string;
  type: string;
  location: { type: 'Point'; coordinates: [number, number] };
  date: string | Date;
  description: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  status: string;

  constructor(disaster: DisasterResponse | import('../disaster.model').DisasterDocument) {
    // Always coerce _id to string (handles Mongoose Document and plain object)
    this._id = disaster._id ? disaster._id.toString() : '';
    this.type = disaster.type;
    this.location = disaster.location;
    this.date = disaster.date;
    this.description = disaster.description;
    this.createdAt = disaster.createdAt;
    this.updatedAt = disaster.updatedAt;
    this.status = disaster.status || 'active';
  }
}
