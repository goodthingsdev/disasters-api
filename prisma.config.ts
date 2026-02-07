import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Use process.env with a fallback so prisma generate succeeds at Docker
    // build time (no DB connection needed) without requiring the env var.
    url: process.env.POSTGRES_URI ?? 'postgresql://localhost:5432/placeholder',
  },
});
