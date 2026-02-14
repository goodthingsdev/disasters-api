# Agent Instructions

This project uses **bd** (beads) for issue tracking. Run `bd onboard` to get started.

## Project Overview

**Disasters API** — a REST + GraphQL API serving aggregated disaster data from official government feeds (Fogos.pt, PROCIV, NASA FIRMS). Built with Express 5, Apollo Server, PostgreSQL + PostGIS, and Prisma.

### Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Express 5.x |
| Language | TypeScript (ESM) |
| Database | PostgreSQL + PostGIS |
| ORM | Prisma (+ raw SQL for geospatial) |
| GraphQL | Apollo Server v5 |
| Validation | Joi |
| Auth | API key (Bearer token) |
| Docs | OpenAPI / Swagger UI at `/api-docs` |
| Testing | Jest + Supertest |
| Linting | ESLint + Prettier |

### Key Resources

- `openapi.json` — OpenAPI 3.x spec (source of truth for REST endpoints)
- `graphql/schema.ts` — GraphQL type definitions
- `proto/disaster.proto` — Protobuf schema for binary transport
- `CONTRACTS.md` — Shared data contract with disasters-mobile

### Architecture

- **REST**: `/api/v1/disasters` — CRUD, pagination, geospatial `/near` queries
- **GraphQL**: `/graphql` — Same capabilities, unified schema
- **Auth**: Bearer token API key on all `/api/*` and `/graphql` routes
- **Rate limit**: 100 req / 15 min (production)
- **Health**: `/healthz`, `/readyz`, `/metrics` (no auth)

### Cross-Repo Contract

This API serves the **disasters-mobile** app. Any changes to response shapes, field names, status enums, or error formats **must** be reflected in `CONTRACTS.md` in both repos. Tag contract-affecting issues with `-l contract`.

## Beads Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd create "Title" -p 0  # Create priority-zero task
bd update <id> --claim   # Atomically claim task
bd update <id> --status in_progress  # Start work
bd close <id>         # Complete work
bd sync               # Sync with git
bd list               # List all issues
```

### Creating Issues

- Use hierarchical IDs for epics: `disasters-api-a3f8` (Epic) > `disasters-api-a3f8.1` (Task)
- Always include priority: `-p 0` (critical), `-p 1` (high), `-p 2` (normal), `-p 3` (low)
- Tag cross-repo issues with `-l contract` when they affect mobile app compatibility
- Never use `bd edit` (opens interactive editor) — use `bd update <id> --description "text"` instead

### Quality Gates (before closing issues with code changes)

```bash
npm run lint          # ESLint
npm run format:check  # Prettier
npm test              # Jest suite
npm run build         # TypeScript compilation
```

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd sync
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
- Include the beads issue ID in commit messages: `"Fix bug (disasters-api-xyz)"`
