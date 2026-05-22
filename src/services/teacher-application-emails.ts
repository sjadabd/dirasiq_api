// Email templates for the four teacher-application lifecycle events.
//
// One file, four functions. Each returns `{ subject, html, text }` ready
// for transporter.sendMail. Arabic-first, RTL, Cairo font, minimal inline
// CSS so Gmail / iCloud / Outlook all render acceptably.
//
// Style mirrors the existing verification / password-reset templates in
// src/config/email.ts so the applicant gets a consistent look.

const BRAND = 'مُلهِم IQ';
const BRAND_PRIMARY = '#0B2545';
const BRAND_ACCENT_OK = '#28a745';
const BRAND_ACCENT_BAD = '#dc3545';
const BRAND_ACCENT_INFO = '#0d6efd';

interface BuiltEmail {
  subject: string;
  html: string;
  text: string;
}

const shell = (
  innerHtml: string,
  innerText: string,
  accent: string
): { html: string; text: string } => ({
  html: `<div dir="rtl" style="font-family: 'Cairo', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1f2937;">
  <div style="background: ${BRAND_PRIMARY}; color: #fff; padding: 18px 24px; border-radius: 8px 8px 0 0;">
    <h2 style="margin: 0; font-size: 20px;">${BRAND}</h2>
  </div>
  <div style="background: #fff; padding: 24px; border: 1px solid #e5e7eb; border-top: none;">
    ${innerHtml}
  </div>
  <div style="padding: 14px 24px; color: #6b7280; font-size: 12px; background: #f9fafb; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
    <span style="border-right: 3px solid ${accent}; padding-right: 8px;">رسالة آلية من منصة ${BRAND} — لا داعي للرد.</span>
  </div>
</div>`,
  text: `${innerText}\n\n— ${BRAND}`,
});

// ---------------------------------------------------------------------------
// 0. EMAIL VERIFICATION — Phase 8. Sent before the application is queued.
// ---------------------------------------------------------------------------
export function applicationEmailVerificationCodeEmail(args: {
  fullName: string;
  code: string;
  expiresInMinutes: number;
}): BuiltEmail {
  const subject = `رمز التحقق لطلب الانضمام إلى ${BRAND}`;
  const lead = `مرحباً ${args.fullName}،`;

  const html = `<p style="font-size: 16px; font-weight: 600;">${lead}</p>
<p>شكراً لتقديمك طلب الانضمام كأستاذ إلى منصة ${BRAND}.</p>
<p>للمتابعة، يرجى إدخال رمز التحقق التالي داخل التطبيق أو على الموقع:</p>
<div style="background: #f4f4f4; padding: 20px; text-align: center; margin: 20px 0; border-radius: 8px;">
  <h1 style="color: ${BRAND_PRIMARY}; font-size: 32px; margin: 0; letter-spacing: 4px;">${args.code}</h1>
</div>
<p>هذا الرمز صالح لمدة ${args.expiresInMinutes} دقيقة فقط.</p>
<p style="color: #6b7280; font-size: 13px;">إذا لم تقم بتقديم طلب، يمكنك تجاهل هذه الرسالة.</p>`;

  const text = [
    lead,
    '',
    `شكراً لتقديمك طلب الانضمام كأستاذ إلى منصة ${BRAND}.`,
    'للمتابعة، يرجى إدخال رمز التحقق التالي داخل التطبيق:',
    '',
    `  ${args.code}`,
    '',
    `هذا الرمز صالح لمدة ${args.expiresInMinutes} دقيقة فقط.`,
    'إذا لم تقم بتقديم طلب، يمكنك تجاهل هذه الرسالة.',
  ].join('\n');

  const shelled = shell(html, text, BRAND_ACCENT_INFO);
  return { subject, html: shelled.html, text: shelled.text };
}

// ---------------------------------------------------------------------------
// 0a. STATUS-CHECK OTP — Phase 8.12. Sent when an applicant requests the
//     current status of their existing application via /status/request.
//     Independent from the initial-verification OTP (different lifecycle).
// ---------------------------------------------------------------------------
export function applicationStatusCheckCodeEmail(args: {
  fullName: string;
  code: string;
  expiresInMinutes: number;
}): BuiltEmail {
  const subject = `رمز عرض حالة طلب الانضمام إلى ${BRAND}`;
  const lead = `مرحباً ${args.fullName}،`;

  const html = `<p style="font-size: 16px; font-weight: 600;">${lead}</p>
<p>تم استلام طلبك بالاستعلام عن حالة طلب الانضمام إلى منصة ${BRAND}.</p>
<p>أدخل الرمز التالي داخل التطبيق لعرض الحالة الحالية لطلبك:</p>
<div style="background: #f4f4f4; padding: 20px; text-align: center; margin: 20px 0; border-radius: 8px;">
  <h1 style="color: ${BRAND_PRIMARY}; font-size: 32px; margin: 0; letter-spacing: 4px;">${args.code}</h1>
</div>
<p>هذا الرمز صالح لمدة ${args.expiresInMinutes} دقيقة فقط.</p>
<p style="color: #6b7280; font-size: 13px;">إذا لم تطلب الرمز، يمكنك تجاهل هذه الرسالة بأمان.</p>`;

  const text = [
    lead,
    '',
    `تم استلام طلبك بالاستعلام عن حالة طلب الانضمام إلى منصة ${BRAND}.`,
    'أدخل الرمز التالي داخل التطبيق لعرض الحالة الحالية لطلبك:',
    '',
    `  ${args.code}`,
    '',
    `هذا الرمز صالح لمدة ${args.expiresInMinutes} دقيقة فقط.`,
    'إذا لم تطلب الرمز، يمكنك تجاهل هذه الرسالة بأمان.',
  ].join('\n');

  const shelled = shell(html, text, BRAND_ACCENT_INFO);
  return { subject, html: shelled.html, text: shelled.text };
}

// ---------------------------------------------------------------------------
// 0b. SUPER-ADMIN NOTIFICATION — Phase 8. Sent when a new (verified)
//     application arrives.
// ---------------------------------------------------------------------------
export function applicationReceivedForAdminEmail(args: {
  applicantName: string;
  subjectName: string;
  applicationId: string;
}): BuiltEmail {
  const subject = `طلب انضمام أستاذ جديد — ${args.applicantName}`;
  const html = `<p>وصل طلب انضمام جديد:</p>
<ul style="font-size: 14px; line-height: 1.9;">
  <li>الاسم: <strong>${escapeHtml(args.applicantName)}</strong></li>
  <li>المادة: <strong>${escapeHtml(args.subjectName)}</strong></li>
  <li>معرّف الطلب: <code>${escapeHtml(args.applicationId)}</code></li>
</ul>
<p>يرجى مراجعته من لوحة التحكم في قسم "طلبات انضمام الأساتذة".</p>`;

  const text = [
    'وصل طلب انضمام جديد:',
    `  - الاسم: ${args.applicantName}`,
    `  - المادة: ${args.subjectName}`,
    `  - معرّف الطلب: ${args.applicationId}`,
    '',
    'يرجى مراجعته من لوحة التحكم في قسم "طلبات انضمام الأساتذة".',
  ].join('\n');

  const shelled = shell(html, text, BRAND_PRIMARY);
  return { subject, html: shelled.html, text: shelled.text };
}

// ---------------------------------------------------------------------------
// 1. SUBMITTED — application received.
// ---------------------------------------------------------------------------
export function applicationSubmittedEmail(args: {
  fullName: string;
}): BuiltEmail {
  const subject = `تم استلام طلب الانضمام إلى ${BRAND}`;
  const lead = `مرحباً ${args.fullName}،`;

  const html = `<p style="font-size: 16px; font-weight: 600;">${lead}</p>
<p>شكراً لتقديمك طلب الانضمام كأستاذ إلى منصة ${BRAND}.</p>
<p>تم استلام طلبك بنجاح، وسيقوم فريق الإدارة بمراجعته خلال 24–72 ساعة عمل.</p>
<p>ستصلك رسالة أخرى فور البتّ في الطلب.</p>`;

  const text = [
    lead,
    '',
    `شكراً لتقديمك طلب الانضمام كأستاذ إلى منصة ${BRAND}.`,
    'تم استلام طلبك بنجاح، وسيقوم فريق الإدارة بمراجعته خلال 24–72 ساعة عمل.',
    'ستصلك رسالة أخرى فور البتّ في الطلب.',
  ].join('\n');

  const shelled = shell(html, text, BRAND_ACCENT_INFO);
  return { subject, html: shelled.html, text: shelled.text };
}

// ---------------------------------------------------------------------------
// 2. APPROVED — user can sign in.
// ---------------------------------------------------------------------------
export function applicationApprovedEmail(args: {
  fullName: string;
  email: string;
}): BuiltEmail {
  const subject = `تم قبول طلبك في ${BRAND} 🎉`;
  const lead = `مرحباً ${args.fullName}،`;

  const html = `<p style="font-size: 16px; font-weight: 600;">${lead}</p>
<p>يسعدنا إبلاغك بأنه تم قبول طلب انضمامك إلى منصة ${BRAND} وتفعيل حسابك كأستاذ.</p>
<p>يمكنك الآن تسجيل الدخول باستخدام:</p>
<ul>
  <li>البريد الإلكتروني: <strong>${args.email}</strong></li>
  <li>كلمة المرور التي اخترتها وقت تقديم الطلب</li>
</ul>
<p>نتمنى لك تجربة موفّقة معنا.</p>`;

  const text = [
    lead,
    '',
    `يسعدنا إبلاغك بأنه تم قبول طلب انضمامك إلى منصة ${BRAND} وتفعيل حسابك كأستاذ.`,
    'يمكنك الآن تسجيل الدخول باستخدام:',
    `  • البريد الإلكتروني: ${args.email}`,
    '  • كلمة المرور التي اخترتها وقت تقديم الطلب',
    '',
    'نتمنى لك تجربة موفّقة معنا.',
  ].join('\n');

  const shelled = shell(html, text, BRAND_ACCENT_OK);
  return { subject, html: shelled.html, text: shelled.text };
}

// ---------------------------------------------------------------------------
// 3. REJECTED — with reason.
// ---------------------------------------------------------------------------
export function applicationRejectedEmail(args: {
  fullName: string;
  rejectionReason: string;
}): BuiltEmail {
  const subject = `تحديث بخصوص طلبك في ${BRAND}`;
  const lead = `مرحباً ${args.fullName}،`;

  const reasonSafe = escapeHtml(args.rejectionReason);

  const html = `<p style="font-size: 16px; font-weight: 600;">${lead}</p>
<p>نشكر لك اهتمامك بالانضمام إلى منصة ${BRAND}.</p>
<p>بعد المراجعة من قبل فريق الإدارة، نأسف لإبلاغك بأنه تعذّر قبول طلبك حالياً للسبب التالي:</p>
<div style="background: #fff5f5; padding: 14px 16px; margin: 12px 0; border-right: 4px solid ${BRAND_ACCENT_BAD}; border-radius: 4px; color: #7f1d1d; white-space: pre-wrap;">${reasonSafe}</div>
<p style="font-size: 13px; color: #4b5563;">يمكنك إعادة تقديم طلب جديد بعد 30 يوماً من تاريخ هذه الرسالة.</p>`;

  const text = [
    lead,
    '',
    `نشكر لك اهتمامك بالانضمام إلى منصة ${BRAND}.`,
    'بعد المراجعة من قبل فريق الإدارة، نأسف لإبلاغك بأنه تعذّر قبول طلبك حالياً للسبب التالي:',
    '',
    args.rejectionReason,
    '',
    'يمكنك إعادة تقديم طلب جديد بعد 30 يوماً من تاريخ هذه الرسالة.',
  ].join('\n');

  const shelled = shell(html, text, BRAND_ACCENT_BAD);
  return { subject, html: shelled.html, text: shelled.text };
}

// ---------------------------------------------------------------------------
// 4. NEEDS MORE INFO — with admin notes.
// ---------------------------------------------------------------------------
export function applicationNeedsMoreInfoEmail(args: {
  fullName: string;
  adminNotes: string;
}): BuiltEmail {
  const subject = `طلب معلومات إضافية بخصوص طلبك في ${BRAND}`;
  const lead = `مرحباً ${args.fullName}،`;

  const notesSafe = escapeHtml(args.adminNotes);

  const html = `<p style="font-size: 16px; font-weight: 600;">${lead}</p>
<p>تم استلام طلب انضمامك إلى منصة ${BRAND}، ويحتاج فريق المراجعة إلى معلومات إضافية لإتمام التقييم:</p>
<div style="background: #eff6ff; padding: 14px 16px; margin: 12px 0; border-right: 4px solid ${BRAND_ACCENT_INFO}; border-radius: 4px; color: #1e3a8a; white-space: pre-wrap;">${notesSafe}</div>
<p>يرجى التواصل معنا أو إعادة رفع المستندات المطلوبة من خلال التطبيق في أقرب وقت ممكن.</p>`;

  const text = [
    lead,
    '',
    `تم استلام طلب انضمامك إلى منصة ${BRAND}، ويحتاج فريق المراجعة إلى معلومات إضافية لإتمام التقييم:`,
    '',
    args.adminNotes,
    '',
    'يرجى التواصل معنا أو إعادة رفع المستندات المطلوبة من خلال التطبيق في أقرب وقت ممكن.',
  ].join('\n');

  const shelled = shell(html, text, BRAND_ACCENT_INFO);
  return { subject, html: shelled.html, text: shelled.text };
}

// ---------------------------------------------------------------------------
// Tiny HTML escape — admin-supplied strings (rejection_reason, admin_notes)
// land in HTML. We never let raw `<` / `>` reach the inbox.
// ---------------------------------------------------------------------------
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
