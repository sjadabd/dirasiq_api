import dotenv from 'dotenv';
import { Pool, PoolConfig } from 'pg';

dotenv.config();

// SSL is opt-in via `DB_SSL=true`, NOT coupled to NODE_ENV.
//
// Why: production today runs Postgres inside the same docker network as the
// API, where TLS is unnecessary AND breaks the connection (the container's
// pg server is started without certs). Forcing SSL when NODE_ENV=production
// caused the API to fail-to-connect on the VPS — that incident is what this
// rewrite prevents. Managed-Postgres deploys (e.g. RDS, Cloud SQL) flip
// DB_SSL=true explicitly; nothing else changes.
const config: PoolConfig = {
  host: process.env['DB_HOST'] || 'localhost',
  port: parseInt(process.env['DB_PORT'] || '5432'),
  database: process.env['DB_NAME'] || 'mulhimiq_local',
  user: process.env['DB_USER'] || 'postgres',
  // No password fallback — refuse to start without an explicit secret in
  // any environment. This forces production deploys to set DB_PASSWORD and
  // catches accidental empty / shared credentials at boot.
  password: process.env['DB_PASSWORD'],
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection could not be established
  ssl:
    process.env['DB_SSL'] === 'true'
      ? { rejectUnauthorized: false }
      : false,
};

if (!config.password) {
  // Fail fast: an undefined password silently coerces to "" which then
  // succeeds against trust-auth Postgres images. Cheap to forbid here.
  // eslint-disable-next-line no-console
  console.error('❌ DB_PASSWORD is required in env. Refusing to start.');
  process.exit(1);
}

const pool = new Pool(config);

// Test the connection
pool.on('connect', () => {
});

pool.on('error', (err) => {
  console.error('❌ Unexpected error on idle client', err);
  process.exit(-1);
});

export default pool;
