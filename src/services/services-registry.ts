// Tiny module-level singleton registry for cross-service references.
//
// Background: NotificationService is constructed once in `src/index.ts` and
// stored on `app.set('notificationService', …)`. Controllers grab it via
// `req.app.get('notificationService')`. Services (e.g. VideoCourseService)
// don't have a Request handle, so they can't use that path.
//
// Rather than refactor every caller to forward the instance, we set it once
// at boot via `registerNotificationService(notif)` and any service that
// needs to dispatch a push call gets it via `getNotificationService()`.
//
// Returns `null` until set OR if the boot-time initialisation failed (env
// vars missing). Callers MUST treat null as "no push delivery available"
// and continue without throwing.

import type { NotificationService } from './notification.service';

let notif: NotificationService | null = null;

export function registerNotificationService(instance: NotificationService): void {
  notif = instance;
}

export function getNotificationService(): NotificationService | null {
  return notif;
}
