// create-test-dbs.ts
// Ensures all Jest worker test databases exist before running tests
import { Client } from 'pg';

// Use the disasters user for DB creation (must match docker-compose)
const baseUri =
  process.env.POSTGRES_URI_BASE || 'postgresql://disasters:disasters_pass@postgres:5432';
const maxWorkers = parseInt(process.env.JEST_MAX_WORKERS || '4', 10); // adjust as needed

async function ensureTestDbs() {
  const client = new Client({ connectionString: baseUri + '/postgres' });
  await client.connect();

  // Always drop and recreate template_postgis to guarantee a clean template
  const templateRes = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [
    'template_postgis',
  ]);
  if (templateRes.rowCount !== 0) {
    // Ensure template_postgis is not a template before dropping
    await client.query(
      `UPDATE pg_database SET datistemplate = FALSE WHERE datname = 'template_postgis'`,
    );
    // Terminate all connections to the template before dropping
    await client.query(
      'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1',
      ['template_postgis'],
    );
    console.log('[create-test-dbs] Dropping existing template_postgis database');
    // Now drop template_postgis if it exists
    await client.query('DROP DATABASE IF EXISTS template_postgis');
  }
  console.log('[create-test-dbs] Creating template_postgis database');
  await client.query('CREATE DATABASE template_postgis');
  const templateClient = new Client({ connectionString: baseUri + '/template_postgis' });
  await templateClient.connect();
  try {
    // Always enable postgis before postgis_raster
    await templateClient.query('CREATE EXTENSION IF NOT EXISTS postgis');
    await templateClient.query('CREATE EXTENSION IF NOT EXISTS postgis_raster');
    console.log(
      '[create-test-dbs] PostGIS and PostGIS Raster extensions enabled in template_postgis',
    );
  } finally {
    await templateClient.end();
  }

  for (let i = 1; i <= maxWorkers; i++) {
    const dbName = `disasters_test_jest_worker${i}`;
    // Drop DB if exists
    const res = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (res.rowCount !== 0) {
      // Terminate all connections to the DB before dropping
      await client.query(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1`,
        [dbName],
      );
      console.log(`[create-test-dbs] Dropping existing database: ${dbName}`);
      await client.query(`DROP DATABASE IF EXISTS "${dbName}"`);
    }
    console.log(`[create-test-dbs] Creating database: ${dbName} from template_postgis`);
    await client.query(`CREATE DATABASE "${dbName}" TEMPLATE template_postgis`);
    // Ensure PostGIS and PostGIS Raster are enabled in the new test DB (workaround for template issues)
    const workerClient = new Client({ connectionString: baseUri + `/${dbName}` });
    await workerClient.connect();
    try {
      await workerClient.query('CREATE EXTENSION IF NOT EXISTS postgis');
      await workerClient.query('CREATE EXTENSION IF NOT EXISTS postgis_raster');
      // Ensure disasters table exists with correct schema (TIMESTAMP for date)
      await workerClient.query(`
        CREATE TABLE IF NOT EXISTS disasters (
          id SERIAL PRIMARY KEY,
          type VARCHAR(64) NOT NULL,
          location geography(Point, 4326) NOT NULL,
          date TIMESTAMP NOT NULL,
          description TEXT,
          status VARCHAR(32) DEFAULT 'active',
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);
      await workerClient.query(
        'CREATE INDEX IF NOT EXISTS idx_disasters_location ON disasters USING GIST(location)',
      );
      console.log(`[create-test-dbs] PostGIS and PostGIS Raster extensions enabled in ${dbName}`);
    } finally {
      await workerClient.end();
    }
  }
  await client.end();
}

ensureTestDbs().catch((err) => {
  console.error('[create-test-dbs] Failed to ensure test DBs:', err);
  process.exit(1);
});
