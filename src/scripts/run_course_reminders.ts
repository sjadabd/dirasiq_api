import { CourseReminderService } from '@/services/course-reminder.service';

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (const part of argv.slice(2)) {
    const [k, v] = part.split('=');
    if (k && v) {
      args[k.replace(/^--/, '')] = v;
    }
  }
  return args;
}

(async () => {
  try {
    const svc = new CourseReminderService();
    const args = parseArgs(process.argv);
    const courseId = args['courseId'];
    const days = args['days'] ? Number(args['days']) : undefined;

    if (courseId) {
      console.log(`Running manual reminder for courseId=${courseId}${days ? `, days=${days}` : ''} ...`);
      await svc.sendReminderForCourse(courseId, days ?? 1);
    } else {
      console.log('Running course reminders (scheduled logic: 3,2,1 days) ...');
      await svc.sendReminders();
    }

    console.log('Done sending course reminders.');
    process.exit(0);
  } catch (err) {
    console.error('Error running course reminders:', err);
    process.exit(1);
  }
})();
