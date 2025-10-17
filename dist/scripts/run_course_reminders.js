"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const course_reminder_service_1 = require("../services/course-reminder.service");
function parseArgs(argv) {
    const args = {};
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
        const svc = new course_reminder_service_1.CourseReminderService();
        const args = parseArgs(process.argv);
        const courseId = args['courseId'];
        const days = args['days'] ? Number(args['days']) : undefined;
        if (courseId) {
            console.log(`Running manual reminder for courseId=${courseId}${days ? `, days=${days}` : ''} ...`);
            await svc.sendReminderForCourse(courseId, days ?? 1);
        }
        else {
            console.log('Running course reminders (scheduled logic: 3,2,1 days) ...');
            await svc.sendReminders();
        }
        console.log('Done sending course reminders.');
        process.exit(0);
    }
    catch (err) {
        console.error('Error running course reminders:', err);
        process.exit(1);
    }
})();
//# sourceMappingURL=run_course_reminders.js.map