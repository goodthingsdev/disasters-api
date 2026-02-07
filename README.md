[![Coverage Status](https://img.shields.io/badge/coverage-local--report-brightgreen)](./coverage/lcov-report/index.html)

# Disaster API

This project is a Node.js backend for storing and serving disaster data (e.g., wildfires) via a RESTful API. It uses Express.js, PostgreSQL with PostGIS, and is containerized with Docker Compose.

## Database: PostgreSQL + PostGIS

- The API uses PostgreSQL with the PostGIS extension for geospatial data.
- The default database credentials (see `docker-compose.yml`):
  - Host: `postgres` (Docker Compose service name)
  - Port: `5432`
  - User: `disasters`
  - Password: `disasters_pass`
  - Database: `disasters_test`
- The connection string is provided to the API via the `POSTGRES_URI` environment variable.

## Features

- RESTful API for disaster data
- PostgreSQL with PostGIS for storage
- Express.js best practices
- TypeScript throughout
- Docker Compose for local development
- OpenAPI/Swagger documentation
- Prometheus metrics
- GraphQL endpoint
- Comprehensive test suite (run inside Docker container)
- Prisma ORM for schema management and database access (hybrid with raw SQL for geospatial queries)

## Prisma & PostGIS Hybrid Approach

- Prisma is used for all standard (non-geospatial) CRUD operations.
- Geospatial queries (e.g., filtering by location, distance) use raw SQL via Prisma's `$queryRaw` due to current Prisma/PostGIS limitations.
- The `location` field is defined as `Unsupported("geography(Point,4326)")` in `schema.prisma`.
- See `services/disaster.service.ts` for examples of both standard and geospatial queries.
- When Prisma adds full PostGIS support, raw SQL usage can be further minimized.

## Test Coverage

Test coverage is measured using Jest. After running tests, a detailed HTML report is available in the `coverage/lcov-report/index.html` file.

[![Coverage Status](https://img.shields.io/badge/coverage-local--report-brightgreen)](./coverage/lcov-report/index.html)

To generate a coverage report, run:

```sh
docker compose exec api npm test -- --coverage
```

## Getting Started

### Prerequisites

- [Docker](https://www.docker.com/) and [Docker Compose](https://docs.docker.com/compose/)
- [Node.js 22 LTS](https://nodejs.org/) (only for local non-Docker development)

### Quick Start (Docker -- recommended)

Build and start the API + PostgreSQL with a single command:

```sh
docker compose up --build
```

The API is available at `http://localhost:3000` once the container is healthy.
Protobuf files, Prisma client, and all dependencies are generated during the
Docker build -- no manual steps required.

Useful endpoints to verify the server is running:

```sh
curl http://localhost:3000/healthz    # health check
curl http://localhost:3000/readyz     # readiness (DB connected)
curl http://localhost:3000/api/v1/disasters  # REST API
```

### Running Tests

Tests run inside the Docker container. The test framework sets `NODE_ENV=test`
and configures per-worker test databases automatically:

```sh
docker compose exec api npm test
```

### Seeding Sample Data

The repository includes a seed script that populates the database with 17
realistic disaster records spanning 6 continents, 12 disaster types, multiple
time frames (Jan 2025 – Feb 2026), and all three statuses (`active`,
`contained`, `resolved`).

```sh
docker compose exec api npm run seed              # inside Docker (recommended)
npm run seed                                      # from the host
npm run seed -- http://my-host:4000               # custom base URL
```

> **Note:** The script is additive — running it multiple times creates
> duplicate records. To start fresh, recreate the database with
> `docker compose down -v && docker compose up --build -d`.

### Local Development (without Docker)

If you prefer running Node.js directly on your machine:

1. Copy the environment template and adjust the database URL:

   ```sh
   cp .env.example .env
   # Edit .env -- point POSTGRES_URI to your local PostgreSQL + PostGIS instance
   ```

2. Install dependencies:

   ```sh
   nvm use            # uses the version pinned in .nvmrc (Node 22)
   npm install
   ```

3. Generate Prisma client and protobuf files:

   ```sh
   npx prisma generate
   npm run proto:all
   ```

4. Start the dev server (auto-reloads on file changes):

   ```sh
   npm run dev
   ```

### Environment Variables

All required and optional variables are documented in `.env.example`. When
running via Docker Compose, they are set in `docker-compose.yml` and no
`.env` file is needed.

| Variable       | Required | Default       | Description                                  |
| -------------- | -------- | ------------- | -------------------------------------------- |
| `POSTGRES_URI` | Yes      | --            | PostgreSQL connection string                 |
| `NODE_ENV`     | No       | `development` | `development`, `test`, `ci`, or `production` |
| `PORT`         | No       | `3000`        | HTTP server port                             |
| `CORS_ORIGIN`  | No       | `*`           | Allowed CORS origins                         |
| `LOG_LEVEL`    | No       | `info`        | Winston log level                            |

### Running on macOS (Apple Silicon / ARM)

When running this project with Docker on macOS (especially Apple Silicon / M-series chips), there are a few things to be aware of:

1. **Platform mismatch for PostGIS image:**
   The `postgis/postgis:15-3.4` image is built for `linux/amd64`. Docker Desktop on Apple Silicon runs it under emulation automatically, but you may see a warning:

   > `The requested image's platform (linux/amd64) does not match the detected host platform (linux/arm64/v8)`

   This is expected and the container works correctly under emulation.

2. **Node modules volume isolation (bind mount + native binaries):**
   The `docker-compose.yml` uses a bind mount (`.:/usr/src/app`) for live code reloading. An anonymous volume (`/usr/src/app/node_modules`) is used to prevent the host's macOS-native `node_modules` from overriding the container's Linux-native packages. This is critical because packages like `esbuild`, `tsx`, and Prisma's query engine include platform-specific binaries that differ between macOS ARM and Linux.

3. **Prisma OpenSSL warning:**
   You may see a Prisma warning about failing to detect the libssl/openssl version. This is cosmetic and does not affect functionality. If needed, install OpenSSL in the container by adding to the Dockerfile:
   ```dockerfile
   RUN apt-get update -y && apt-get install -y openssl
   ```

### Running Tests

Tests should be run **inside the container**:

```sh
docker compose exec api npm test -- --coverage
```

### Running E2E (Integration) Tests

End-to-end tests use a real PostgreSQL connection and are not run by default. To run the E2E test:

1. **Build the project:**

   ```sh
   docker compose exec api npm run build
   ```

2. **Run the E2E test from the compiled output:**
   ```sh
   docker compose exec api npx jest dist/disasters.e2e.test.js --runTestsByPath --testTimeout=30000 --detectOpenHandles
   ```

- Make sure PostgreSQL is running and accessible at the URI specified in your environment (defaults to `postgresql://localhost:5432/disasters_test`).
- The E2E test will seed the database before running and clean up after.

### API Documentation

- **Swagger/OpenAPI:** [http://localhost:3000/api-docs](http://localhost:3000/api-docs)
- **GraphQL:** [http://localhost:3000/graphql](http://localhost:3000/graphql)

### Environment Variables

This project uses multiple `.env` files for environment variable management:

- `.env` — Default for local development (used by `npm start`, `npm run dev`)
- `.env.docker` — Used automatically by Docker Compose for the `api` container
- `.env.test` — Used for running tests (unit/integration) inside the container or locally

**How they are used:**

- **Local development:** `.env` is loaded automatically by most tooling (e.g., `npm start`).
- **Docker Compose:** `.env.docker` is loaded by the `api` service when running via Docker Compose.
- **Tests:** `.env.test` is loaded automatically when running tests (e.g., `npm test` or `docker compose exec api npm test`).

See `.env.example` for all available configuration options. Key variables:

- `POSTGRES_URI` (required)
- `PORT` (default: 3000)
- `CORS_ORIGIN` (default: \*)

## Project Structure

- `src/` (if present): TypeScript source files
- `dist/`: Compiled JavaScript output (ignored by git)
- `routes/`, `services/`, `middleware/`, `dto/`, `graphql/`, `validation/`: Main code modules (all TypeScript)
- `coverage/`: Test coverage reports (ignored by git)

## Notes

- Do **not** commit compiled `.js` files from source directories; only `dist/` (or `build/`) should contain build output.
- All source code and tests are in TypeScript (`.ts`).
- Use Docker Compose for consistent local development and testing.
- **Keep OpenAPI in sync:** The OpenAPI spec (`openapi.json`) is validated against the OpenAPI schema. Run:
  ```sh
  docker compose exec api npm run validate:openapi
  ```
  This will fail if the spec is invalid or out of sync with your endpoints.

### Production Deployment

A multi-stage production Dockerfile is provided for small, secure images:

1. **Build the production image:**
   ```sh
   docker build -f Dockerfile.production -t disasters-api:prod .
   ```
2. **Run the container in production mode:**

   ```sh
   docker run -d \
     --env-file .env.docker \
     -e NODE_ENV=production \
     -p 3000:3000 \
     disasters-api:prod
   ```

   - The API will be available at `http://localhost:3000`.
   - Make sure to provide the correct environment variables (see `.env.docker`).

**Note:** The production image only contains the compiled output (`dist/`), `openapi.json`, and production dependencies for minimal attack surface and fast startup.

---

For more details, see the inline comments in the code and the OpenAPI spec in `openapi.json`.

## Monitoring: Prometheus Metrics

This API exposes Prometheus-compatible metrics for monitoring and observability.

- **Endpoint:**
  - Metrics are available at: `http://localhost:3000/metrics`
  - The endpoint exposes standard process metrics (CPU, memory, event loop lag, etc.) and custom application metrics (e.g., HTTP request counts, durations, error rates).

- **What is Exposed:**
  - `http_requests_total`: Count of HTTP requests by method, route, and status code.
  - `http_request_duration_seconds`: Histogram of request durations by route and method.
  - `process_*`: Node.js process metrics (CPU, memory, event loop, etc.).
  - `up`: Always 1 if the API is running (useful for basic liveness checks).
  - Additional custom metrics may be present depending on implementation.

- **How to Scrape:**
  - Add the following scrape config to your Prometheus server:

    ```yaml
    scrape_configs:
      - job_name: 'disaster-api'
        static_configs:
          - targets: ['host.docker.internal:3000'] # Or use your host/IP
    ```

    - If running Prometheus in Docker, use `host.docker.internal` or the appropriate network alias.
    - Adjust the port if you run the API on a different port.

- **Grafana Dashboards:**
  - You can visualize these metrics in Grafana by adding Prometheus as a data source and importing a Node.js/Express dashboard.

- **Security:**
  - The `/metrics` endpoint is public by default. For production, consider restricting access (e.g., via IP allowlist, auth proxy, or network firewall).

## Bulk Operations: Limits and Performance

Some API endpoints support bulk operations (e.g., creating or updating multiple disasters at once). For these endpoints:

- **Limits:**
  - The maximum number of items per bulk request is typically 100 (see OpenAPI spec or endpoint docs for details).
  - Requests exceeding this limit will be rejected with a 400 error.
- **Performance:**
  - Bulk operations may take longer to process, especially with large payloads or complex validation.
  - For best performance, keep bulk requests as small as practical.
  - The API is optimized for reasonable batch sizes, but extremely large requests may be rate-limited or time out.
- **Error Handling:**
  - If some items in a bulk request are invalid, the API will return details for each failed item (see error response schema).
  - Partial success is possible; check the response for per-item status.

See the OpenAPI documentation for specific limits and schemas for each bulk endpoint.

## API Versioning

If you anticipate breaking changes to the API, follow these guidelines to add new API versions:

- **Route Structure:**
  - Add a new versioned route prefix, e.g., `/api/v2/` for version 2.
  - Keep existing versions (e.g., `/api/v1/`) available for backward compatibility.
- **Implementation:**
  - Create a new set of route/controller files for the new version (e.g., `routes/v2/`, `controllers/v2/`).
  - Update the main Express app to mount the new versioned routes:
    ```ts
    // ...existing code...
    app.use('/api/v1', v1Router);
    app.use('/api/v2', v2Router);
    // ...existing code...
    ```
- **OpenAPI Spec:**
  - Document each version separately in the OpenAPI spec, or maintain separate specs per version if needed.
- **Deprecation:**
  - Clearly document deprecated endpoints and provide a migration path for clients.
- **Testing:**
  - Ensure all versions are covered by tests.

For more details, see the Express.js documentation on [route prefixes](https://expressjs.com/en/guide/routing.html#route-prefixes) and the [OpenAPI guidelines for versioning](https://swagger.io/docs/specification/api-host-and-base-path/).

---

## Disaster Status

Each disaster has a `status` property, which can be one of:

- `active`: The disaster is ongoing and requires attention.
- `contained`: The disaster is under control but not fully resolved.
- `resolved`: The disaster is no longer ongoing.

You can filter disasters by `status` in both the REST and GraphQL APIs.

### REST API

- **Filter by status:**
  - `GET /api/v1/disasters?status=active` returns only disasters with status `active`.
  - The `status` property is required when creating or updating a disaster.

### GraphQL API

- The `Disaster` type includes a `status` field.
- The `disasters` query accepts a `status` argument to filter results:
  ```graphql
  query {
    disasters(status: active) {
      data {
        _id
        type
        status
        description
      }
    }
  }
  ```
- You can set or update the `status` via the `createDisaster` and `updateDisaster` mutations.

### OpenAPI/Swagger

- The `status` property is documented in the OpenAPI spec and is required for all disaster records.
- The `status` query parameter is available for filtering in the `/disasters` endpoint.

## Linting and Formatting (Prettier, ESLint, Husky)

This project enforces code style and formatting using [Prettier](https://prettier.io/) and [ESLint](https://eslint.org/). A pre-commit hook is set up with [Husky](https://typicode.github.io/husky/) to ensure code is linted and formatted before commits.

### Prettier

- **Config:** See `.prettierrc` in the project root.
- **Format all files:**
  ```sh
  npm run format
  ```
- **Check formatting (CI/lint mode):**
  ```sh
  npm run format:check
  ```

### ESLint

- **Config:** See `eslint.config.js` (flat config, ESLint v9+) in the project root.
- **Run linter:**
  ```sh
  npm run lint
  ```
- **Fix lint errors automatically:**
  ```sh
  npm run lint:fix
  ```
- **Notes:**
  - Linting is strict for source and test code, but ignores or relaxes rules for build, coverage, and utility/config files.
  - Some TypeScript lint errors (e.g., `no-explicit-any`, unused vars) may require manual fixes.
  - You can further relax rules for test files or add overrides in `eslint.config.js` if desired.

### Husky (Pre-commit Hook)

- Husky is set up to run `npm run lint` and `npm run format:check` before every commit.
- To (re)install Husky hooks (after cloning or if hooks are missing):
  ```sh
  npm run prepare
  ```
- You can customize the pre-commit hook in `.husky/pre-commit`.

### Why enforce code style?

- Consistent code style improves readability and reduces friction in code reviews.
- Linting helps catch bugs and anti-patterns early.
- Pre-commit hooks prevent accidental commits of unformatted or problematic code.

## Protobuf Support (Content Negotiation)

This API supports [Protocol Buffers (Protobuf)](https://developers.google.com/protocol-buffers) as an alternative to JSON for all disaster-related endpoints.

- **Content Negotiation:**
  - To receive responses in Protobuf format, set the `Accept` header to `application/x-protobuf`.
  - If the `Accept` header is not set or is `application/json`, responses will be in JSON (default).
  - All disaster REST endpoints support Protobuf (e.g., `GET /api/v1/disasters`, `POST /api/v1/disasters`, `GET /api/v1/disasters/:id`, etc.).
- **Protobuf Schema:**
  - The Protobuf schema is defined in [`proto/disaster.proto`](proto/disaster.proto).
  - Generated files: [`proto/disaster_pb.js`](proto/disaster_pb.js), [`proto/disaster_pb.d.ts`](proto/disaster_pb.d.ts)
- **Client Usage:**
  - To request Protobuf, set the header:
    ```sh
    curl -H "Accept: application/x-protobuf" http://localhost:3000/api/v1/disasters
    ```
  - The response will be a binary Protobuf message. Use the schema in `proto/disaster.proto` to decode it in your client.
  - For POST/PUT requests, you may send Protobuf-encoded bodies by setting `Content-Type: application/x-protobuf` (see OpenAPI for details).

### Protobuf Code Generation

Protobuf code is generated automatically during Docker builds and can also be generated manually:

- **To generate Protobuf JS/TS files locally:**
  ```sh
  npm run proto:all
  # or individually:
  npm run proto:js
  npm run proto:ts
  ```
- **During Docker build:**
  - The Dockerfile runs `npm run proto:all` automatically, so generated files are always up to date in containers.
- **Edit the schema:**
  - Make changes in `proto/disaster.proto`, then re-run the codegen scripts above.

See the [protobufjs CLI documentation](https://github.com/protobufjs/protobuf.js#pbjs-for-javascript) for more details.

---
