// Teacher-application lifecycle notifications — Phase 4.
//
// One static method per lifecycle event. Each method:
//   - sends a push (OneSignal) if a target is available
//   - sends an email (nodemailer) via the shared transporter
//   - swallows every error and logs a warning — NEVER throws
//
// The whole module is best-effort by design. The caller fires these AFTER
// the pg transaction has COMMITted, so an SMTP hiccup or a 5xx from
// OneSignal must never undo a real application state change.
//
// Push targeting:
//   - submitted / rejected / needs_more_info  →  include_player_ids
//     (the applicant doesn't have a users row yet; their player id is on
//     the application row from Phase 4 wiring)
//   - approved                                 →  include_external_user_ids
//     (the new users row now owns the OneSignal external id)

import { Client as OneSignalClient } from 'onesignal-node';

import pool from '../config/database';
import transporter from '../config/email';
import { logger } from '../utils/logger';
import {
  applicationApprovedEmail,
  applicationNeedsMoreInfoEmail,
  applicationReceivedForAdminEmail,
  applicationRejectedEmail,
  applicationSubmittedEmail,
} from './teacher-application-emails';

const FROM_ADDRESS =
  process.env['EMAIL_FROM'] ||
  process.env['EMAIL_USER'] ||
  'mulhim@lamassu-iq.com';

// Lazy OneSignal client. We instantiate on first use so a missing env var
// during boot doesn't crash the whole app — it just means push is disabled
// and we fall back to email-only delivery.
let cachedClient: OneSignalClient | null | undefined; // undefined = not tried yet
function oneSignal(): OneSignalClient | null {
  if (cachedClient !== undefined) return cachedClient;

  const appId = process.env['ONESIGNAL_APP_ID'];
  const restKey = process.env['ONESIGNAL_REST_API_KEY'];
  if (!appId || !restKey) {
    logger.warn(
      { hasAppId: Boolean(appId), hasRestKey: Boolean(restKey) },
      'teacher-application notify: OneSignal env not configured — push disabled'
    );
    cachedClient = null;
    return null;
  }
  cachedClient = new OneSignalClient(appId, restKey);
  return cachedClient;
}

type PushPayload = {
  title: string;
  message: string;
  data?: Record<string, unknown>;
};

// Push to a specific OneSignal player id. Used for pre-approval events.
async function pushToPlayer(playerId: string | null | undefined, p: PushPayload): Promise<void> {
  if (!playerId) return; // no device handle — caller falls back to email
  const client = oneSignal();
  if (!client) return;
  try {
    await client.createNotification({
      include_player_ids: [playerId],
      headings: { en: p.title, ar: p.title },
      contents: { en: p.message, ar: p.message },
      data: p.data || {},
      priority: 10,
    } as Record<string, unknown>);
  } catch (err) {
    logger.warn({ err, playerId }, 'teacher-application notify: push-to-player failed');
  }
}

// Push to an external user id (the new users row after approval).
async function pushToExternalUser(externalUserId: string, p: PushPayload): Promise<void> {
  const client = oneSignal();
  if (!client) return;
  try {
    await client.createNotification({
      include_external_user_ids: [externalUserId],
      headings: { en: p.title, ar: p.title },
      contents: { en: p.message, ar: p.message },
      data: p.data || {},
      priority: 10,
    } as Record<string, unknown>);
  } catch (err) {
    logger.warn(
      { err, externalUserId },
      'teacher-application notify: push-to-external-user failed'
    );
  }
}

async function sendEmail(to: string, mail: { subject: string; html: string; text: string }): Promise<void> {
  try {
    await transporter.sendMail({
      from: FROM_ADDRESS,
      to,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    });
  } catch (err) {
    logger.warn({ err, to }, 'teacher-application notify: email send failed');
  }
}

// ---------------------------------------------------------------------------
// Public hooks
// ---------------------------------------------------------------------------

export class TeacherApplicationNotifyService {
  /**
   * Fire-and-forget hook fired when an application becomes "real" — meaning
   * the email has been verified (for email-provider applications) or it
   * arrived via Google with an already-verified email. Sends:
   *   - applicant ack (email + push)
   *   - super-admin alert (email + push) to every active super-admin
   */
  static async onSubmitted(args: {
    applicationId: string;
    email: string;
    fullName: string;
    subject: string;
    oneSignalPlayerId: string | null;
  }): Promise<void> {
    try {
      const applicantMail = applicationSubmittedEmail({ fullName: args.fullName });
      await Promise.all([
        sendEmail(args.email, applicantMail),
        pushToPlayer(args.oneSignalPlayerId, {
          title: 'تم استلام طلبك',
          message: 'سيقوم فريق الإدارة بمراجعة طلب انضمامك قريباً.',
          data: { type: 'teacher_application_submitted', applicationId: args.applicationId },
        }),
        this.notifySuperAdmins({
          applicationId: args.applicationId,
          applicantName: args.fullName,
          subjectName: args.subject,
        }),
      ]);
    } catch (err) {
      logger.warn({ err, applicationId: args.applicationId }, 'notify.onSubmitted failed');
    }
  }

  /**
   * Iterate every active super-admin and ping them (email + push). Best-
   * effort per recipient — one admin's bounced email never blocks the rest.
   */
  private static async notifySuperAdmins(args: {
    applicationId: string;
    applicantName: string;
    subjectName: string;
  }): Promise<void> {
    let admins: Array<{ id: string; email: string; name: string }> = [];
    try {
      const { rows } = await pool.query<{ id: string; email: string; name: string }>(
        `SELECT id, email, name
           FROM users
          WHERE user_type = 'super_admin'
            AND status   = 'active'
            AND deleted_at IS NULL`
      );
      admins = rows;
    } catch (err) {
      logger.warn({ err }, 'notify.notifySuperAdmins: failed to load super-admins');
      return;
    }
    if (admins.length === 0) return;

    const adminMail = applicationReceivedForAdminEmail({
      applicantName: args.applicantName,
      subjectName: args.subjectName,
      applicationId: args.applicationId,
    });

    await Promise.all(
      admins.map(async (admin) => {
        try {
          await Promise.all([
            sendEmail(admin.email, adminMail),
            pushToExternalUser(admin.id, {
              title: 'طلب انضمام أستاذ جديد',
              message: `تم تقديم طلب انضمام جديد من ${args.applicantName} لمادة ${args.subjectName}. يرجى مراجعته من لوحة التحكم.`,
              data: {
                type: 'teacher_application_received',
                applicationId: args.applicationId,
                route: '/admin/teacher-applications',
              },
            }),
          ]);
        } catch (err) {
          logger.warn(
            { err, adminId: admin.id },
            'notify.notifySuperAdmins: per-admin delivery failed',
          );
        }
      }),
    );
  }

  /**
   * Fire-and-forget hook called after approve() commit. The new users row
   * is already provisioned at this point and carries the external user id.
   */
  static async onApproved(args: {
    applicationId: string;
    userId: string;
    email: string;
    fullName: string;
  }): Promise<void> {
    try {
      const mail = applicationApprovedEmail({
        fullName: args.fullName,
        email: args.email,
      });
      await Promise.all([
        sendEmail(args.email, mail),
        pushToExternalUser(args.userId, {
          title: 'تم تفعيل حسابك',
          message: 'مرحباً بك في مُلهِم IQ — يمكنك الآن تسجيل الدخول.',
          data: { type: 'teacher_application_approved', applicationId: args.applicationId },
        }),
      ]);
    } catch (err) {
      logger.warn({ err, applicationId: args.applicationId }, 'notify.onApproved failed');
    }
  }

  /**
   * Fire-and-forget hook called after reject() commit.
   */
  static async onRejected(args: {
    applicationId: string;
    email: string;
    fullName: string;
    rejectionReason: string;
    oneSignalPlayerId: string | null;
  }): Promise<void> {
    try {
      const mail = applicationRejectedEmail({
        fullName: args.fullName,
        rejectionReason: args.rejectionReason,
      });
      await Promise.all([
        sendEmail(args.email, mail),
        pushToPlayer(args.oneSignalPlayerId, {
          title: 'تحديث على طلبك',
          message: 'نأسف لإبلاغك بعدم قبول طلبك حالياً — تفاصيل عبر البريد.',
          data: { type: 'teacher_application_rejected', applicationId: args.applicationId },
        }),
      ]);
    } catch (err) {
      logger.warn({ err, applicationId: args.applicationId }, 'notify.onRejected failed');
    }
  }

  /**
   * Fire-and-forget hook called after requestMoreInfo() commit.
   */
  static async onNeedsMoreInfo(args: {
    applicationId: string;
    email: string;
    fullName: string;
    adminNotes: string;
    oneSignalPlayerId: string | null;
  }): Promise<void> {
    try {
      const mail = applicationNeedsMoreInfoEmail({
        fullName: args.fullName,
        adminNotes: args.adminNotes,
      });
      await Promise.all([
        sendEmail(args.email, mail),
        pushToPlayer(args.oneSignalPlayerId, {
          title: 'مطلوب معلومات إضافية',
          message: 'يحتاج فريق المراجعة معلومات إضافية لإتمام دراسة طلبك.',
          data: { type: 'teacher_application_more_info', applicationId: args.applicationId },
        }),
      ]);
    } catch (err) {
      logger.warn({ err, applicationId: args.applicationId }, 'notify.onNeedsMoreInfo failed');
    }
  }
}
