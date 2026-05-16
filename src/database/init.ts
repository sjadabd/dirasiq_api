/**
 * init.ts — schema_migrations–backed migration runner.
 *
 * Reads every .sql file under `migrations/`, applies the ones not yet recorded
 * in the `schema_migrations` ledger, and records each successful apply with
 * its SHA-256 checksum. Each file is wrapped in its own transaction; on
 * failure, the transaction rolls back and the runner stops.
 *
 * Behaviour:
 *   1. Ensure the schema_migrations table exists (via 000_schema_migrations.sql).
 *   2. Read every applied filename from schema_migrations.
 *   3. For each .sql file under migrations/ that isn't already applied:
 *        - BEGIN
 *        - Apply the file
 *        - INSERT INTO schema_migrations(filename, checksum)
 *        - COMMIT (or ROLLBACK on error)
 *   4. Stop on the first failure with a clear message.
 *
 * Run with:
 *   npm run db:init
 *
 * Safety guard:
 *   By default the runner refuses to run if the target database already
 *   contains a `users` table but the schema_migrations ledger is empty.
 *   That state means the DB was built by an older runner (or by hand) — the
 *   runner refuses to apply migrations that would conflict. Set
 *   ALLOW_INIT_ON_EXISTING_SCHEMA=1 to override.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import pool from '../config/database';

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');
const LEDGER_BOOTSTRAP_FILE = '000_schema_migrations.sql';

interface MigrationFile {
  filename: string;
  sql: string;
  checksum: string;
}

function listMigrationFiles(): MigrationFile[] {
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  return files.map((filename) => {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, filename), 'utf8');
    const checksum = crypto.createHash('sha256').update(sql).digest('hex');
    return { filename, sql, checksum };
  });
}

async function ensureLedgerTable(): Promise<void> {
  // Apply 000_schema_migrations.sql in its own transaction. The file is
  // idempotent (CREATE TABLE IF NOT EXISTS), so re-running is safe.
  const bootstrap = path.join(MIGRATIONS_DIR, LEDGER_BOOTSTRAP_FILE);
  if (!fs.existsSync(bootstrap)) {
    throw new Error(`Missing bootstrap migration: ${LEDGER_BOOTSTRAP_FILE}`);
  }
  const sql = fs.readFileSync(bootstrap, 'utf8');
  await pool.query(sql);
}

async function readAppliedLedger(): Promise<Set<string>> {
  const { rows } = await pool.query<{ filename: string }>(
    'SELECT filename FROM schema_migrations',
  );
  return new Set(rows.map((r) => r.filename));
}

async function applyMigration(m: MigrationFile): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(m.sql);
    await client.query(
      'INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)',
      [m.filename, m.checksum],
    );
    await client.query('COMMIT');
    console.log(`  ✓ ${m.filename}`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`  ✗ ${m.filename} failed:`, err);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Guard: refuse to run if the DB has v1 user tables but no schema_migrations
 * entries. This means we're about to "v2-init" a database that was previously
 * built by the legacy runner — which would re-run every migration and almost
 * certainly fail at the first CREATE TABLE that conflicts.
 *
 * The cutover SQL pre-populates schema_migrations with the legacy filenames,
 * which satisfies this guard. Set ALLOW_INIT_ON_EXISTING_SCHEMA=1 to bypass
 * (e.g. during the cutover dress rehearsal).
 */
async function preflightGuard(applied: Set<string>): Promise<void> {
  if (applied.size > 0) return; // already-recorded migrations — nothing to guard

  const allowOverride = process.env['ALLOW_INIT_ON_EXISTING_SCHEMA'] === '1';
  if (allowOverride) {
    console.warn(
      '⚠ ALLOW_INIT_ON_EXISTING_SCHEMA=1 set — skipping pre-existing-schema guard.',
    );
    return;
  }

  const { rows } = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'users'
     ) AS exists`,
  );

  if (rows[0]?.exists) {
    throw new Error(
      'Refusing to run v2 init: the database already has a "users" table but ' +
        'schema_migrations is empty. This suggests the DB was built by the ' +
        'legacy runner and a cutover backfill of schema_migrations has not ' +
        'been performed. Either:\n' +
        '  - Run the cutover SQL (which pre-fills schema_migrations) first, or\n' +
        '  - Start from a fresh database (Path Y), or\n' +
        '  - Set ALLOW_INIT_ON_EXISTING_SCHEMA=1 if you really know what you are doing.',
    );
  }
}

export async function initializeDatabase(): Promise<void> {
  console.log(`📁 migrations dir: ${MIGRATIONS_DIR}`);

  // Step 1: ledger table.
  await ensureLedgerTable();

  // Step 2: who's already applied?
  const applied = await readAppliedLedger();
  console.log(`📋 schema_migrations rows: ${applied.size}`);

  // Step 3: safety check.
  await preflightGuard(applied);

  // Step 4: apply the rest, in order.
  const files = listMigrationFiles();
  const pending = files.filter((m) => !applied.has(m.filename));

  if (pending.length === 0) {
    console.log('✅ No pending migrations. DB is up to date.');
    return;
  }

  console.log(`🚀 Applying ${pending.length} pending migration(s):`);
  for (const m of pending) {
    await applyMigration(m);
  }

  console.log(`✅ Done. ${pending.length} migration(s) applied.`);
}

// Run directly with: ts-node src/database/init-v2.ts
if (require.main === module) {
  initializeDatabase()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ v2 database init failed:', err);
      process.exit(1);
    });
}
