# API Contract: disasters-api <> disasters-mobile

> This file is maintained in **both** repos. Changes must be synced manually.
> Tag related beads issues with `-l contract` in both repos.

## Base URL

```
Production: TBD
Development: http://localhost:3000
```

## Authentication

All `/api/*` and `/graphql` routes require:

```
Authorization: Bearer <API_KEY>
```

Rate limit: **100 requests / 15 minutes** per IP.

---

## Data Boundary: Official vs. User Reports

> **Decision (2026-02-14):** Path C — User reports do NOT sync to the API.
> See [disasters-mobile#1](https://github.com/goodthingsdev/disasters-mobile/issues/1) for full analysis.

| Data Source | Where It Lives | Owner |
|-------------|---------------|-------|
| Official government feeds (Fogos.pt, PROCIV, NASA FIRMS) | **Disasters API** (`disasters` table) | API |
| User-submitted reports (photos, votes, moderation, verification) | **Supabase** (`user_reports` table) | Mobile / Supabase |

### Why

- The API's purpose is aggregating **official government data**. User reports have fundamentally different fields (title, phase, photos, voting, moderation, verification) that don't map to the `disasters` schema.
- Syncing creates hard problems: moderation cascading, visibility leaks (flagged report hidden in Supabase but visible in API), deduplication fragility, semantic type mismatches (volunteer calls aren't disasters).
- The mobile app already reads from **both** sources and merges into a `UnifiedDisasterEvent` client-side — no sync needed.

### What this means for the mobile app

1. **Official disasters** — fetch from `GET /api/v1/disasters` (or GraphQL)
2. **User reports** — fetch directly from Supabase `user_reports` table via Supabase client
3. **Merge client-side** — combine into `UnifiedDisasterEvent`, deduplicate by checking `linked_disaster_id`
4. **No Edge Function sync** — no Supabase-to-API replication of user reports

### Future option

If non-mobile API consumers need user report data, consider a **separate endpoint** (`/api/v2/reports`) or a dedicated table rather than expanding the `disasters` schema. This keeps the official data clean.

---

## Core Data Model: Disaster

### Response Shape (JSON)

```typescript
interface Disaster {
  id: string;                    // UUID v4
  type: string;                  // e.g. "wildfire", "flood", "earthquake"
  location: {
    type: "Point";
    coordinates: [number, number]; // [longitude, latitude] (GeoJSON order)
  };
  date: string;                  // ISO 8601 datetime
  description: string | null;
  status: "active" | "contained" | "resolved";
  source: string;                // "official" | "fogos_pt" | "prociv" | "nasa_firms"
  externalId: string | null;     // ID from the original data source
  sourceUrl: string | null;      // Link to original source
  createdAt: string;             // ISO 8601
  updatedAt: string;             // ISO 8601
  distanceKm?: number;           // Only present in /near responses
}
```

### Request Shape (for create/update)

```typescript
interface DisasterInput {
  type: string;                          // required
  location: {
    type: "Point";                       // required
    coordinates: [number, number];       // required [lng, lat]
  };
  date: string;                          // required, ISO 8601
  description?: string;
  status: "active" | "contained" | "resolved"; // required
  source?: string;                       // defaults to "official"
  external_id?: string | null;           // NOTE: snake_case in request
  source_url?: string | null;            // NOTE: snake_case in request
}
```

> **Field name mapping**: Requests use `snake_case` (`external_id`, `source_url`). Responses use `camelCase` (`externalId`, `sourceUrl`).

---

## REST Endpoints

### GET /api/v1/disasters

Paginated list with filters.

| Parameter | Type | Default | Notes |
|-----------|------|---------|-------|
| `page` | int | 1 | |
| `limit` | int | 20 | max 100 |
| `type` | string | — | filter by disaster type |
| `dateFrom` | string | — | ISO date |
| `dateTo` | string | — | ISO date |
| `status` | enum | — | active, contained, resolved |
| `source` | string | — | filter by source |

**Response:**
```json
{
  "data": [Disaster],
  "page": 1,
  "limit": 20,
  "total": 150,
  "totalPages": 8
}
```

### GET /api/v1/disasters/:id

Single disaster by UUID.

**Response:** `Disaster`
**Errors:** 400 (invalid UUID), 404 (not found)

### GET /api/v1/disasters/near

Geospatial proximity search.

| Parameter | Type | Required | Notes |
|-----------|------|----------|-------|
| `lat` | float | yes | -90 to 90 |
| `lng` | float | yes | -180 to 180 |
| `distance` | float | yes | radius in km |
| `status` | enum | no | |
| `source` | string | no | |

**Response:** `Disaster[]` (ordered by distance, includes `distanceKm`)

### POST /api/v1/disasters

Create a disaster. Body: `DisasterInput`.
**Response:** `Disaster` (201)

### PUT /api/v1/disasters/:id

Update a disaster. Body: `DisasterInput` (all fields required).
**Response:** `Disaster` (200)

### DELETE /api/v1/disasters/:id

**Response:** 204 No Content

---

## GraphQL

**Endpoint:** `/graphql`

### Queries

```graphql
# Paginated list (same filters as REST)
disasters(page: Int, limit: Int, type: String, dateFrom: String, dateTo: String, status: DisasterStatus, source: String): DisasterPage!

# Single by ID
disaster(id: ID!): Disaster

# Proximity search
disastersNear(lat: Float!, lng: Float!, distance: Float!, status: DisasterStatus, source: String): [Disaster!]!
```

### Mutations

```graphql
createDisaster(input: DisasterInput!): Disaster!
updateDisaster(id: ID!, input: DisasterInput!): Disaster!
deleteDisaster(id: ID!): Boolean!
```

### Types

```graphql
enum DisasterStatus { active, contained, resolved }

type Location {
  type: String!
  coordinates: [Float!]!
}

type Disaster {
  id: ID!
  type: String!
  location: Location!
  date: String!
  description: String
  status: DisasterStatus!
  source: String
  externalId: String
  sourceUrl: String
  distanceKm: Float
}

type DisasterPage {
  data: [Disaster!]!
  page: Int!
  limit: Int!
  total: Int!
  totalPages: Int!
}
```

---

## Error Format

```json
{
  "error": "Human-readable message",
  "code": "ERROR_CODE",
  "details": ["field-level detail", "..."]
}
```

| Code | HTTP | Meaning |
|------|------|---------|
| `INVALID_INPUT` | 400 | Validation failure |
| `INVALID_ID` | 400 | Bad UUID format |
| `NOT_FOUND` | 404 | Resource missing |
| `INVALID_QUERY` | 400 | Bad query params |
| — | 401 | Missing/invalid API key |
| — | 429 | Rate limit exceeded |

---

## Status Enum

| Value | Meaning |
|-------|---------|
| `active` | Ongoing disaster |
| `contained` | Under control but not resolved |
| `resolved` | No longer a threat |

---

## Health Endpoints (no auth)

| Endpoint | Purpose |
|----------|---------|
| `GET /healthz` | Liveness — `{ status: "ok", uptime, timestamp }` |
| `GET /readyz` | Readiness — `{ status: "ready", db: "connected" }` |
| `GET /metrics` | Prometheus metrics (text) |

---

## Versioning & Breaking Changes

- REST is versioned at `/api/v1/`. A new version path will be introduced for breaking changes.
- GraphQL changes must be additive (new fields/types). Removing or renaming fields is a breaking change.
- Any change to this contract requires a beads issue tagged `contract` in **both** repos.
