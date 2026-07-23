/**
 * Hard-wipe the MulhimIQ test teacher + student accounts and ALL related rows
 * so both emails can re-register as brand-new empty accounts.
 *
 * Targets (hard-coded — test accounts only):
 *   Teacher: www.sjad.n@gmail.com
 *   Student: mulhimiq@gmail.com
 *
 * Usage (from dirasiq_api/, against the DB in .env):
 *   # Preview counts only — no writes
 *   npm run wipe:test-accounts -- --dry-run
 *
 *   # Actually delete (IRREVERSIBLE)
 *   npm run wipe:test-accounts -- --confirm
 *
 * Notes:
 *   - Chat lives in dirasiq_chat (separate DB) — wipe there separately if needed.
 *   - Bunny / uploaded files on disk are NOT deleted by this script.
 *   - Soft-delete is intentionally NOT used: email UNIQUE would still block re-registration.
 */

import type { PoolClient } from 'pg';

import pool from '../config/database';

const TEACHER_EMAIL = 'www.sjad.n@gmail.com';
const STUDENT_EMAIL = 'mulhimiq@gmail.com';

type UserRow = {
  id: string;
  email: string;
  name: string;
  user_type: string;
  deleted_at: Date | null;
};

function hasFlag(flag: string): boolean {
  return process.argv.slice(2).includes(flag);
}

async function del(
  client: PoolClient,
  label: string,
  sql: string,
  params: unknown[] = []
): Promise<number> {
  try {
    const result = await client.query(sql, params);
    const n = result.rowCount ?? 0;
    console.log(`  ${label.padEnd(42)} ${n}`);
    return n;
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    // undefined_table / undefined_column — schema drift / dropped legacy tables
    if (code === '42P01' || code === '42703') {
      console.log(`  ${label.padEnd(42)} (skip — missing)`);
      return 0;
    }
    throw err;
  }
}

async function count(
  client: PoolClient,
  label: string,
  sql: string,
  params: unknown[] = []
): Promise<number> {
  try {
    const result = await client.query<{ n: string }>(sql, params);
    const n = Number(result.rows[0]?.n ?? 0);
    console.log(`  ${label.padEnd(42)} ${n}`);
    return n;
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === '42P01' || code === '42703') {
      console.log(`  ${label.padEnd(42)} (skip — missing)`);
      return 0;
    }
    throw err;
  }
}

async function resolveUsers(client: PoolClient): Promise<{
  teacher: UserRow | null;
  student: UserRow | null;
}> {
  const { rows } = await client.query<UserRow>(
    `SELECT id, email::text AS email, name, user_type, deleted_at
       FROM users
      WHERE email = ANY($1::citext[])`,
    [[TEACHER_EMAIL, STUDENT_EMAIL]]
  );

  const teacher =
    rows.find((r) => r.email.toLowerCase() === TEACHER_EMAIL) ?? null;
  const student =
    rows.find((r) => r.email.toLowerCase() === STUDENT_EMAIL) ?? null;

  return { teacher, student };
}

async function preview(client: PoolClient, tid: string | null, sid: string | null) {
  console.log('\nDry-run counts (no changes):');
  if (tid) {
    await count(client, 'advertisements (teacher)', `SELECT COUNT(*)::text AS n FROM advertisements WHERE teacher_id = $1`, [tid]);
    await count(client, 'video_courses (teacher)', `SELECT COUNT(*)::text AS n FROM video_courses WHERE teacher_id = $1`, [tid]);
    await count(client, 'courses (teacher)', `SELECT COUNT(*)::text AS n FROM courses WHERE teacher_id = $1`, [tid]);
    await count(client, 'course_bookings (teacher)', `SELECT COUNT(*)::text AS n FROM course_bookings WHERE teacher_id = $1`, [tid]);
    await count(client, 'course_invoices (teacher)', `SELECT COUNT(*)::text AS n FROM course_invoices WHERE teacher_id = $1`, [tid]);
    await count(client, 'wallet_ledger (teacher)', `SELECT COUNT(*)::text AS n FROM wallet_ledger WHERE teacher_id = $1`, [tid]);
    await count(client, 'wayl_payment_links (teacher)', `SELECT COUNT(*)::text AS n FROM wayl_payment_links WHERE teacher_id = $1`, [tid]);
  }
  if (sid) {
    await count(client, 'course_bookings (student)', `SELECT COUNT(*)::text AS n FROM course_bookings WHERE student_id = $1`, [sid]);
    await count(client, 'course_invoices (student)', `SELECT COUNT(*)::text AS n FROM course_invoices WHERE student_id = $1`, [sid]);
    await count(client, 'student_grades (student)', `SELECT COUNT(*)::text AS n FROM student_grades WHERE student_id = $1`, [sid]);
    await count(client, 'video_course_purchases (student)', `SELECT COUNT(*)::text AS n FROM video_course_purchases WHERE student_id = $1`, [sid]);
    await count(client, 'advertisement_clicks (student)', `SELECT COUNT(*)::text AS n FROM advertisement_clicks WHERE student_id = $1`, [sid]);
  }
}

async function wipe(
  client: PoolClient,
  tid: string | null,
  sid: string | null
): Promise<void> {
  const ids = [tid, sid].filter(Boolean) as string[];

  console.log('\nDeleting related rows…');

  // 1) Commission overrides — set_by is RESTRICT + NOT NULL
  if (tid) {
    const admin = await client.query<{ id: string }>(
      `SELECT id FROM users
        WHERE user_type = 'super_admin' AND deleted_at IS NULL AND id <> $1
        ORDER BY created_at ASC
        LIMIT 1`,
      [tid]
    );
    if (admin.rows[0]) {
      await del(
        client,
        'teacher_commission_overrides (reassign set_by)',
        `UPDATE teacher_commission_overrides
            SET set_by = $2
          WHERE set_by = $1 AND teacher_id <> $1`,
        [tid, admin.rows[0].id]
      );
    } else {
      await del(
        client,
        'teacher_commission_overrides (set_by rows)',
        `DELETE FROM teacher_commission_overrides WHERE set_by = $1 AND teacher_id <> $1`,
        [tid]
      );
    }
    await del(
      client,
      'teacher_commission_overrides (teacher)',
      `DELETE FROM teacher_commission_overrides WHERE teacher_id = $1`,
      [tid]
    );
  }

  // 2) Advertisements
  if (tid || sid) {
    await del(
      client,
      'advertisement_clicks',
      `DELETE FROM advertisement_clicks
        WHERE ($2::uuid IS NOT NULL AND student_id = $2)
           OR ($1::uuid IS NOT NULL AND advertisement_id IN (
                SELECT id FROM advertisements WHERE teacher_id = $1
              ))`,
      [tid, sid]
    );
    await del(
      client,
      'advertisement_wallet_transactions',
      `DELETE FROM advertisement_wallet_transactions
        WHERE ($1::uuid IS NOT NULL AND teacher_id = $1)
           OR ($1::uuid IS NOT NULL AND advertisement_id IN (
                SELECT id FROM advertisements WHERE teacher_id = $1
              ))`,
      [tid]
    );
  }
  if (tid) {
    await del(
      client,
      'advertisements',
      `DELETE FROM advertisements WHERE teacher_id = $1`,
      [tid]
    );
  }

  // 3) Video purchases + free whitelist
  await del(
    client,
    'video_course_purchases',
    `DELETE FROM video_course_purchases
      WHERE ($1::uuid IS NOT NULL AND teacher_id = $1)
         OR ($2::uuid IS NOT NULL AND student_id = $2)`,
    [tid, sid]
  );
  await del(
    client,
    'video_course_free_students',
    `DELETE FROM video_course_free_students
      WHERE ($2::uuid IS NOT NULL AND student_id = $2)
         OR (granted_by = ANY($3::uuid[]))
         OR ($1::uuid IS NOT NULL AND video_course_id IN (
              SELECT id FROM video_courses WHERE teacher_id = $1
            ))`,
    [tid, sid, ids]
  );

  // 4) Commission-free first students
  await del(
    client,
    'teacher_commission_free_students',
    `DELETE FROM teacher_commission_free_students
      WHERE ($1::uuid IS NOT NULL AND teacher_id = $1)
         OR ($2::uuid IS NOT NULL AND student_id = $2)`,
    [tid, sid]
  );

  // 5) Wallet stack
  if (tid) {
    await del(client, 'wallet_ledger', `DELETE FROM wallet_ledger WHERE teacher_id = $1`, [tid]);
    await del(
      client,
      'teacher_withdrawal_requests',
      `DELETE FROM teacher_withdrawal_requests WHERE teacher_id = $1`,
      [tid]
    );
    await del(
      client,
      'teacher_wallet_transactions',
      `DELETE FROM teacher_wallet_transactions WHERE teacher_id = $1`,
      [tid]
    );
    await del(client, 'teacher_wallets', `DELETE FROM teacher_wallets WHERE teacher_id = $1`, [tid]);
  }

  // 6) Wayl
  if (tid) {
    await del(
      client,
      'wayl_payment_links',
      `DELETE FROM wayl_payment_links WHERE teacher_id = $1`,
      [tid]
    );
  }

  // 7) Invoices
  await del(
    client,
    'invoice_installments',
    `DELETE FROM invoice_installments
      WHERE invoice_id IN (
        SELECT id FROM course_invoices
         WHERE ($1::uuid IS NOT NULL AND teacher_id = $1)
            OR ($2::uuid IS NOT NULL AND student_id = $2)
      )`,
    [tid, sid]
  );
  await del(
    client,
    'course_invoices',
    `DELETE FROM course_invoices
      WHERE ($1::uuid IS NOT NULL AND teacher_id = $1)
         OR ($2::uuid IS NOT NULL AND student_id = $2)`,
    [tid, sid]
  );

  // 8) Academic tree
  await del(
    client,
    'assignment_submissions',
    `DELETE FROM assignment_submissions
      WHERE ($2::uuid IS NOT NULL AND student_id = $2)
         OR ($1::uuid IS NOT NULL AND assignment_id IN (
              SELECT id FROM assignments WHERE teacher_id = $1
            ))`,
    [tid, sid]
  );
  await del(
    client,
    'assignment_recipients',
    `DELETE FROM assignment_recipients
      WHERE ($2::uuid IS NOT NULL AND student_id = $2)
         OR ($1::uuid IS NOT NULL AND assignment_id IN (
              SELECT id FROM assignments WHERE teacher_id = $1
            ))`,
    [tid, sid]
  );
  await del(
    client,
    'exam_grades',
    `DELETE FROM exam_grades
      WHERE ($2::uuid IS NOT NULL AND student_id = $2)
         OR ($1::uuid IS NOT NULL AND exam_id IN (
              SELECT id FROM exams WHERE teacher_id = $1
            ))`,
    [tid, sid]
  );
  if (tid) {
    await del(
      client,
      'exam_sessions',
      `DELETE FROM exam_sessions
        WHERE exam_id IN (SELECT id FROM exams WHERE teacher_id = $1)`,
      [tid]
    );
    await del(client, 'assignments', `DELETE FROM assignments WHERE teacher_id = $1`, [tid]);
    await del(client, 'exams', `DELETE FROM exams WHERE teacher_id = $1`, [tid]);
  }

  await del(
    client,
    'session_attendance',
    `DELETE FROM session_attendance
      WHERE ($1::uuid IS NOT NULL AND teacher_id = $1)
         OR ($2::uuid IS NOT NULL AND student_id = $2)`,
    [tid, sid]
  );
  await del(
    client,
    'student_evaluations',
    `DELETE FROM student_evaluations
      WHERE ($1::uuid IS NOT NULL AND teacher_id = $1)
         OR ($2::uuid IS NOT NULL AND student_id = $2)`,
    [tid, sid]
  );

  await del(
    client,
    'session_conflicts',
    `DELETE FROM session_conflicts
      WHERE ($2::uuid IS NOT NULL AND student_id = $2)
         OR ($1::uuid IS NOT NULL AND session_id IN (SELECT id FROM sessions WHERE teacher_id = $1))
         OR ($1::uuid IS NOT NULL AND other_session_id IN (SELECT id FROM sessions WHERE teacher_id = $1))`,
    [tid, sid]
  );
  await del(
    client,
    'session_attendees',
    `DELETE FROM session_attendees
      WHERE ($2::uuid IS NOT NULL AND student_id = $2)
         OR ($1::uuid IS NOT NULL AND session_id IN (SELECT id FROM sessions WHERE teacher_id = $1))`,
    [tid, sid]
  );
  if (tid || sid) {
    await del(
      client,
      'session_holds',
      `DELETE FROM session_holds
        WHERE ($1::uuid IS NOT NULL AND session_id IN (SELECT id FROM sessions WHERE teacher_id = $1))
           OR (created_by = ANY($2::uuid[]))`,
      [tid, ids]
    );
    await del(
      client,
      'session_audit',
      `DELETE FROM session_audit
        WHERE ($1::uuid IS NOT NULL AND session_id IN (SELECT id FROM sessions WHERE teacher_id = $1))
           OR (created_by = ANY($2::uuid[]))`,
      [tid, ids]
    );
  }
  if (tid) {
    await del(client, 'sessions', `DELETE FROM sessions WHERE teacher_id = $1`, [tid]);
  }

  await del(
    client,
    'reservation_payments',
    `DELETE FROM reservation_payments
      WHERE ($1::uuid IS NOT NULL AND teacher_id = $1)
         OR ($2::uuid IS NOT NULL AND student_id = $2)`,
    [tid, sid]
  );
  await del(
    client,
    'course_bookings',
    `DELETE FROM course_bookings
      WHERE ($1::uuid IS NOT NULL AND teacher_id = $1)
         OR ($2::uuid IS NOT NULL AND student_id = $2)`,
    [tid, sid]
  );

  // Video course satellites + courses
  if (tid) {
    await del(
      client,
      'video_course_target_courses',
      `DELETE FROM video_course_target_courses
        WHERE video_course_id IN (SELECT id FROM video_courses WHERE teacher_id = $1)
           OR course_id IN (SELECT id FROM courses WHERE teacher_id = $1)`,
      [tid]
    );
    await del(
      client,
      'video_course_grade_targets',
      `DELETE FROM video_course_grade_targets
        WHERE video_course_id IN (SELECT id FROM video_courses WHERE teacher_id = $1)`,
      [tid]
    );
    await del(
      client,
      'video_lessons',
      `DELETE FROM video_lessons
        WHERE course_id IN (SELECT id FROM video_courses WHERE teacher_id = $1)`,
      [tid]
    );
    await del(client, 'video_courses', `DELETE FROM video_courses WHERE teacher_id = $1`, [tid]);
    await del(client, 'courses', `DELETE FROM courses WHERE teacher_id = $1`, [tid]);
    await del(client, 'subjects', `DELETE FROM subjects WHERE teacher_id = $1`, [tid]);
    await del(client, 'teacher_grades', `DELETE FROM teacher_grades WHERE teacher_id = $1`, [tid]);
    await del(client, 'teacher_expenses', `DELETE FROM teacher_expenses WHERE teacher_id = $1`, [tid]);
    await del(
      client,
      'teacher_referrals',
      `DELETE FROM teacher_referrals
        WHERE referrer_teacher_id = $1 OR referred_teacher_id = $1`,
      [tid]
    );
  }

  if (sid) {
    await del(client, 'student_grades', `DELETE FROM student_grades WHERE student_id = $1`, [sid]);
  }

  // 9) Notifications / tokens
  if (ids.length > 0) {
    await del(
      client,
      'user_notifications',
      `DELETE FROM user_notifications WHERE user_id = ANY($1::uuid[])`,
      [ids]
    );
    await del(
      client,
      'notifications (created_by)',
      `DELETE FROM notifications WHERE created_by = ANY($1::uuid[])`,
      [ids]
    );
    await del(
      client,
      'notification_templates',
      `DELETE FROM notification_templates WHERE created_by = ANY($1::uuid[])`,
      [ids]
    );
    await del(client, 'tokens', `DELETE FROM tokens WHERE user_id = ANY($1::uuid[])`, [ids]);
  }

  // 10) Email-keyed leftovers (no user_id FK)
  await del(
    client,
    'account_deletion_requests',
    `DELETE FROM account_deletion_requests
      WHERE email = ANY($1::citext[])`,
    [[TEACHER_EMAIL, STUDENT_EMAIL]]
  );
  await del(
    client,
    'teacher_application_files',
    `DELETE FROM teacher_application_files
      WHERE application_id IN (
        SELECT id FROM teacher_applications WHERE email = ANY($1::citext[])
      )`,
    [[TEACHER_EMAIL, STUDENT_EMAIL]]
  );
  await del(
    client,
    'teacher_application_grades',
    `DELETE FROM teacher_application_grades
      WHERE application_id IN (
        SELECT id FROM teacher_applications WHERE email = ANY($1::citext[])
      )`,
    [[TEACHER_EMAIL, STUDENT_EMAIL]]
  );
  await del(
    client,
    'teacher_applications',
    `DELETE FROM teacher_applications WHERE email = ANY($1::citext[])`,
    [[TEACHER_EMAIL, STUDENT_EMAIL]]
  );

  // 11) Users last
  if (ids.length > 0) {
    await del(client, 'users', `DELETE FROM users WHERE id = ANY($1::uuid[])`, [ids]);
  }
}

async function main(): Promise<void> {
  const dryRun = hasFlag('--dry-run');
  const confirm = hasFlag('--confirm');

  if (!dryRun && !confirm) {
    console.error(`
Usage:
  npm run wipe:test-accounts -- --dry-run     # preview only
  npm run wipe:test-accounts -- --confirm    # IRREVERSIBLE hard delete

Targets:
  Teacher  ${TEACHER_EMAIL}
  Student  ${STUDENT_EMAIL}
`);
    process.exit(1);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { teacher, student } = await resolveUsers(client);

    console.log('Resolved accounts:');
    if (teacher) {
      console.log(
        `  teacher  ${teacher.email}  id=${teacher.id}  type=${teacher.user_type}` +
          (teacher.deleted_at ? '  (soft-deleted)' : '')
      );
      if (teacher.user_type !== 'teacher') {
        throw new Error(
          `${TEACHER_EMAIL} is "${teacher.user_type}", expected teacher`
        );
      }
    } else {
      console.log(`  teacher  ${TEACHER_EMAIL}  — NOT FOUND (will skip)`);
    }

    if (student) {
      console.log(
        `  student  ${student.email}  id=${student.id}  type=${student.user_type}` +
          (student.deleted_at ? '  (soft-deleted)' : '')
      );
      if (student.user_type !== 'student') {
        throw new Error(
          `${STUDENT_EMAIL} is "${student.user_type}", expected student`
        );
      }
    } else {
      console.log(`  student  ${STUDENT_EMAIL}  — NOT FOUND (will skip)`);
    }

    if (!teacher && !student) {
      console.log('\nNothing to wipe.');
      await client.query('ROLLBACK');
      return;
    }

    const tid = teacher?.id ?? null;
    const sid = student?.id ?? null;

    if (dryRun) {
      await preview(client, tid, sid);
      await client.query('ROLLBACK');
      console.log('\nDry-run complete — no changes committed.');
      return;
    }

    await wipe(client, tid, sid);
    await client.query('COMMIT');

    console.log('\nDone. Both emails are free to re-register as empty accounts.');
    console.log('Note: chat DB (dirasiq_chat) and Bunny media were not touched.');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

main()
  .catch((error) => {
    console.error('\nWipe failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
