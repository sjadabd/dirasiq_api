import pool from '@/config/database';

async function seedFreeSubscriptions() {
  console.log('Seeding free subscriptions for existing teachers...');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1) Find a free & active package (prefer highest max_students)
    const freePkgQ = `
      SELECT id, duration_days
      FROM subscription_packages
      WHERE is_free = true AND is_active = true AND deleted_at IS NULL
      ORDER BY max_students DESC
      LIMIT 1
    `;
    const freePkgR = await client.query(freePkgQ);
    if (freePkgR.rows.length === 0) {
      console.error('No active free subscription package found. Aborting.');
      await client.query('ROLLBACK');
      process.exitCode = 1;
      return;
    }

    const freePkg = freePkgR.rows[0];

    // 2) Insert a free active subscription for each teacher without an active subscription
    const insertQ = `
      INSERT INTO teacher_subscriptions (
        teacher_id,
        subscription_package_id,
        start_date,
        end_date,
        is_active,
        current_students
      )
      SELECT
        u.id AS teacher_id,
        $1::uuid AS subscription_package_id,
        NOW() AS start_date,
        NOW() + make_interval(days => COALESCE($2::int, 30)) AS end_date,
        true AS is_active,
        0 AS current_students
      FROM users u
      LEFT JOIN teacher_subscriptions ts
        ON ts.teacher_id = u.id
       AND ts.is_active = true
       AND ts.deleted_at IS NULL
      WHERE u.user_type = 'teacher'
        AND ts.id IS NULL
    `;

    const result = await client.query(insertQ, [freePkg.id, freePkg.duration_days]);

    await client.query('COMMIT');
    console.log(`Done. Created ${result.rowCount || 0} free subscription(s).`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error seeding free subscriptions:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    // Give pg time to flush logs then end
    setTimeout(() => pool.end(), 100);
  }
}

seedFreeSubscriptions();
