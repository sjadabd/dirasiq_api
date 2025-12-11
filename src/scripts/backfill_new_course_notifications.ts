import pool from '../config/database';

async function backfillNewCourseNotifications() {
  console.log('Starting backfill for NEW_COURSE_AVAILABLE notifications...');

  const query = `
    UPDATE notifications
    SET study_year = data->>'studyYear'
    WHERE type = 'new_course_available'
      AND deleted_at IS NULL
      AND (data->>'studyYear') IS NOT NULL
  `;

  try {
    const result = await pool.query(query);
    console.log(`Backfill completed. Updated rows: ${result.rowCount ?? 0}`);
  } catch (error) {
    console.error('Error during backfill of new_course notifications:', error);
  } finally {
    await pool.end();
    console.log('Database pool closed.');
  }
}

backfillNewCourseNotifications().catch(err => {
  console.error('Unhandled error in backfill script:', err);
  process.exit(1);
});
