import dotenv from 'dotenv';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Set test environment
process.env['NODE_ENV'] = 'test';

// Note: Jest globals are available in test environment
// This file is configured in jest.config.js setupFilesAfterEnv
