// One-shot: credit a teacher's wallet (test/seed helper).
//
// Credits the LEGACY `teacher_wallets.balance` column via TeacherWalletService
// — the same path the teacher app reads (`GET /api/teacher/wallet` →
// getBalance → balance) and writes a matching `teacher_wallet_transactions`
// audit row atomically. The credited amount shows up immediately in the app's
// wallet screen as "الرصيد الحالي القابل للاستخدام".
//
// Usage (from dirasiq_api/):
//   npx ts-node -r tsconfig-paths/register src/scripts/credit_teacher_wallet.ts --email=teacher@example.com --amount=100000
//   npx ts-node -r tsconfig-paths/register src/scripts/credit_teacher_wallet.ts --teacherId=<uuid> --amount=100000
//
// Defaults credit 100000 IQD to the test teacher below.

import pool from '../config/database';
import { TeacherWalletService } from '../services/teacher-wallet.service';

const DEFAULT_TEACHER_ID = '1b1f888e-d5d7-426d-8818-99feab61d71e';
const DEFAULT_AMOUNT = 100000;

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (const part of argv.slice(2)) {
    const [k, v] = part.split('=');
    if (k && v) args[k.replace(/^--/, '')] = v;
  }
  return args;
}

async function resolveTeacherId(args: Record<string, string>): Promise<{
  teacherId: string;
  name: string;
}> {
  if (args['teacherId']) {
    const userRes = await pool.query<{ name: string; user_type: string }>(
      'SELECT name, user_type FROM users WHERE id = $1',
      [args['teacherId']],
    );
    const user = userRes.rows[0];
    if (!user) {
      throw new Error(`No user found with id ${args['teacherId']}`);
    }
    if (user.user_type !== 'teacher') {
      throw new Error(
        `User ${args['teacherId']} is "${user.user_type}", not a teacher`,
      );
    }
    return { teacherId: args['teacherId'], name: user.name };
  }

  const email = args['email']?.trim().toLowerCase();
  if (!email) {
    return { teacherId: DEFAULT_TEACHER_ID, name: '(default test teacher)' };
  }

  const userRes = await pool.query<{
    id: string;
    name: string;
    user_type: string;
    deleted_at: Date | null;
  }>(
    `SELECT id, name, user_type, deleted_at
       FROM users
      WHERE email = $1`,
    [email],
  );
  const user = userRes.rows[0];
  if (!user) {
    throw new Error(`No user found with email ${email}`);
  }
  if (user.user_type !== 'teacher') {
    throw new Error(`User ${email} is "${user.user_type}", not a teacher`);
  }
  if (user.deleted_at) {
    throw new Error(`Teacher ${email} is soft-deleted — restore first`);
  }
  return { teacherId: user.id, name: user.name };
}

(async () => {
  const args = parseArgs(process.argv);
  const amount = args['amount'] ? Number(args['amount']) : DEFAULT_AMOUNT;

  if (!Number.isFinite(amount) || amount <= 0) {
    console.error(`Invalid amount: ${args['amount']}`);
    process.exit(1);
  }

  try {
    const { teacherId, name } = await resolveTeacherId(args);

    console.log(
      `Crediting ${amount.toLocaleString()} IQD to ${name} (${teacherId})...`,
    );

    const { balanceBefore, balanceAfter } = await TeacherWalletService.credit({
      teacherId,
      amount,
      referenceType: 'manual_adjustment',
      referenceId: 'seed-script',
    });

    console.log(
      `Done. balance ${balanceBefore.toLocaleString()} → ${balanceAfter.toLocaleString()} IQD`,
    );
    process.exit(0);
  } catch (err) {
    console.error('Failed to credit wallet:', err);
    process.exit(1);
  }
})();
