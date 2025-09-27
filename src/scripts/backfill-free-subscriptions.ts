import 'dotenv/config';
import pool from '@/config/database';
import { SubscriptionPackageModel } from '@/models/subscription-package.model';
import { TeacherSubscriptionModel } from '@/models/teacher-subscription.model';

async function main() {
  console.info('🚀 Backfill free subscriptions for teachers without active subscription...');

  // 1) Fetch the free package
  const freePackage = await SubscriptionPackageModel.getFreePackage();
  if (!freePackage) {
    console.error('❌ No free subscription package found (is_free = true, is_active = true). Aborting.');
    process.exit(1);
  }

  console.info(`✅ Using free package: ${freePackage.name} | max_students=${freePackage.maxStudents} | durationDays=${freePackage.durationDays}`);

  // 2) Find teachers without an active subscription
  const findTeachersQuery = `
    SELECT u.id
    FROM users u
    WHERE u.user_type = 'teacher'
      AND u.status = 'active'
      AND NOT EXISTS (
        SELECT 1
        FROM teacher_subscriptions ts
        WHERE ts.teacher_id = u.id
          AND ts.is_active = true
          AND ts.deleted_at IS NULL
      )
  `;

  const { rows } = await pool.query(findTeachersQuery);
  const teacherIds: string[] = rows.map((r: any) => r.id);

  if (teacherIds.length === 0) {
    console.info('ℹ️ All teachers already have an active subscription. Nothing to do.');
    process.exit(0);
  }

  console.info(`🎯 Found ${teacherIds.length} teacher(s) without active subscription.`);

  // 3) Create subscriptions for each teacher
  const startDate = new Date();
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + Number(freePackage.durationDays || 30));

  let success = 0;
  for (const teacherId of teacherIds) {
    try {
      await TeacherSubscriptionModel.create({
        teacherId,
        subscriptionPackageId: freePackage.id,
        startDate,
        endDate,
      });
      success++;
      console.info(`✅ Created free subscription for teacher ${teacherId}`);
    } catch (err) {
      console.error(`❌ Failed to create subscription for teacher ${teacherId}:`, err);
    }
  }

  console.info(`
===============================
 Backfill Summary
-------------------------------
 Teachers processed: ${teacherIds.length}
 Subscriptions created: ${success}
===============================
  `);

  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Backfill process failed:', err);
  process.exit(1);
});
