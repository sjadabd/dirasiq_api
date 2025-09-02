import dotenv from 'dotenv';
import { Pool, PoolConfig } from 'pg';

dotenv.config();

const config: PoolConfig = {
  host: process.env['DB_HOST'] || 'localhost',
  port: parseInt(process.env['DB_PORT'] || '5432'),
  database: process.env['DB_NAME'] || 'dirasiq_db',
  user: process.env['DB_USER'] || 'postgres',
  password: process.env['DB_PASSWORD'] || 'Mlak1212@Mlak1212',
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection could not be established
  ssl: process.env['NODE_ENV'] === 'production' ? { rejectUnauthorized: false } : false,
};

const pool = new Pool(config);

// Test the connection
pool.on('connect', () => {
  console.log('✅ Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('❌ Unexpected error on idle client', err);
  process.exit(-1);
});

export default pool;
