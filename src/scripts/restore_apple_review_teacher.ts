/**
 * Restores the Apple Review teacher demo account after accidental soft-delete.
 *
 * Usage (production or local):
 *   APPLE_REVIEW_PASSWORD='Review123!' npm run restore:apple-review-teacher
 *
 * Steps:
 *   1. Clears users.deleted_at for review.teacher@mulhimiq.com
 *   2. Resets password from APPLE_REVIEW_PASSWORD
 *   3. Re-runs the full Apple Review seed to restore courses, wallet, etc.
 */
import { spawnSync } from 'child_process';
import path from 'path';

import bcrypt from 'bcryptjs';

import pool from '../config/database';

const TEACHER_EMAIL = 'review.teacher@mulhimiq.com';

async function main(): Promise<void> {
  const password = process.env['APPLE_REVIEW_PASSWORD'] || 'Review123!';
  if (password.length < 8) {
    throw new Error('APPLE_REVIEW_PASSWORD must be at least 8 characters.');
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const restored = await pool.query(
    `UPDATE users
        SET deleted_at = NULL,
            status = 'active',
            password = $2,
            email_verified = TRUE,
            updated_at = NOW()
      WHERE email = $1
      RETURNING id, name, email`,
    [TEACHER_EMAIL, passwordHash],
  );

  if ((restored.rowCount ?? 0) === 0) {
    throw new Error(
      `Teacher ${TEACHER_EMAIL} not found. Run seed:apple-review first.`,
    );
  }

  console.log('Restored teacher login:', restored.rows[0]);

  const seedScript = path.join(__dirname, 'seed_apple_review_accounts.ts');
  const result = spawnSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['ts-node', '-r', 'tsconfig-paths/register', seedScript],
    {
      stdio: 'inherit',
      env: { ...process.env, APPLE_REVIEW_PASSWORD: password },
      shell: process.platform === 'win32',
    },
  );

  if (result.status !== 0) {
    throw new Error('Apple Review seed failed after undelete.');
  }

  console.log('\nDone. Teacher demo account is active again with full seed data.');
}

main()
  .catch((error) => {
    console.error('Restore failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
