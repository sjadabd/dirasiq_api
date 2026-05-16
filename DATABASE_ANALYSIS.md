# Database Analysis — Mulhim IQ / Dirasiq

> Read-only audit of the PostgreSQL schema defined by SQL migrations in `src/database/migrations/`.
> No schema, data, or migration files were modified during this analysis.
> See [CLAUDE.md](CLAUDE.md) for the backend code analysis and [../CLAUDE.md](../CLAUDE.md) for the project-wide index.

The schema has no ORM. The Node.js backend issues parameterized queries directly through `pg`. The migration runner (`src/database/init.ts`) reads `migrations/*.sql` with `fs.readdirSync().sort()` and executes them sequentially with no transaction wrapper and no `schema_migrations` ledger. Forty migration files exist as of this audit.

---

## 1. Migration execution order (actual alphabetical sort)

The runner uses string sort, so files apply in this exact order:

1. `001_create_news_table.sql` — **`001_` collision** with #2; `news` < `users` lexicographically.
2. `001_create_users_table.sql`
3. `002_create_subscription_packages_table.sql` — **`002_` collision** with #4; `subscription_packages` < `tokens` lexicographically.
4. `002_create_tokens_table.sql`
5. `003_create_academic_years_table.sql`
6. `004_create_subjects_table.sql`
7. `005_create_grades_table.sql`
8. `006_create_courses_table.sql`
9. `007_create_student_grades_table.sql`
10. `008_create_teacher_grades_table.sql`
11. `009_update_grades_table.sql`
12. `010_create_course_bookings_table.sql`
13. `011_create_reservation_payments_table.sql` — **`011_` collision** with #14; `reservation_payments` < `teacher_subscriptions`.
14. `011_create_teacher_subscriptions_table.sql`
15. `012_create_booking_usage_logs_table.sql`
16. `013_create_notifications_tables.sql`
17. `020_create_lecture_scheduling.sql`
18. `021_create_session_attendance.sql`
19. `022_create_assignments.sql`
20. `023_create_exams.sql`
21. `024_restructure_exams.sql`
22. `025_create_student_evaluations.sql`
23. `026_create_course_invoices_table.sql`
24. `027_create_invoice_installments_table.sql`
25. `029_drop_invoice_entries_table.sql` — destructive `DROP TABLE`.
26. `030_alter_invoice_dates_to_varchar.sql` — destructive type-change DATE → VARCHAR(10).
27. `031_create_teacher_expenses.sql`
28. `032_create_teacher_referrals_table.sql`
29. `033_create_teacher_subscription_bonuses_table.sql`
30. `034_create_app_settings_table.sql`
31. `035_create_teacher_wallets_table.sql`
32. `036_create_teacher_wallet_transactions_table.sql`
33. `037_create_wayl_payment_links_table.sql`
34. `038_fix_teacher_subscriptions_unique_active.sql`
35. `039_support_multiple_active_subscriptions_and_teacher_capacity.sql`
36. `040_create_wayl_payment_events_tables.sql`
37. `20251003_add_profile_image_path_to_users.sql` — alters `users`.
38. `20251025_add_intro_video_to_users.sql` — alters `users`.
39. `999_update_courses_unique_index.sql` — rebuilds partial unique index on `courses`.
40. `notifications.sql` — near-duplicate of #16; relies on `IF NOT EXISTS` to be a no-op when run after #16.

**Cross-file dependency check.** No FK references a table that hasn't been created yet under this ordering. Dependencies pair off correctly: `reservation_payments` (#13) → `course_bookings` (#12) + `courses` (#8); `teacher_subscriptions` (#14) → `subscription_packages` (#3) + `users` (#2); `booking_usage_logs` (#15) → `course_bookings` (#12) + `teacher_subscriptions` (#14); `wayl_*` (#33, #36) → `users` (#2) + `subscription_packages` (#3); `teacher_student_capacity` from #35 → `users` (#2). The schema builds correctly top-to-bottom **today**, but the collisions make ordering fragile against future filename changes.

---

## 2. Extensions, enums, helper functions, triggers

| Object | Type | Defined in | Purpose | Used by |
|---|---|---|---|---|
| `uuid-ossp` | EXTENSION | 003, 004, 005, 006, 010, 020, 021, 022, 023 | Provides `uuid_generate_v4()` for UUID PKs | Tables that use `uuid_generate_v4()` (academic_years, subjects, grades, courses, course_bookings, sessions, session_attendance, assignments, exams, …) |
| `update_updated_at_column()` | FUNCTION | 001 (re-declared via `OR REPLACE` in 002, 005, 006, 007, 008, 010, 011, 012, 013, 020, 021, 022, 026, 027, 031, 032, 034, 035, 036, 037) | Generic `BEFORE UPDATE` trigger function setting `NEW.updated_at = NOW()` / `CURRENT_TIMESTAMP` | Almost every table with an `updated_at` column |
| `update_news_updated_at_column()` | FUNCTION | 001 (news) | News-specific updated_at trigger | `news` |
| `ensure_single_active_academic_year()` | FUNCTION | 003 | When a row's `is_active` is set true, force all others to false | `academic_years` (via trigger) |
| `clean_expired_tokens()` | FUNCTION | 002 | Helper for cron-style cleanup of expired sessions | Manual / scheduled — not wired to a trigger |
| `log_booking_usage()` | FUNCTION | 012 | Inserts a row into `booking_usage_logs` describing a status delta | Called from app code — no trigger attached |
| `update_notifications_updated_at()` | FUNCTION | 013, `notifications.sql` | Updated_at trigger for notifications and templates | `notifications`, `notification_templates` |
| `update_teacher_referrals_updated_at()` | FUNCTION | 032 | Updated_at trigger for referrals | `teacher_referrals` |
| `update_assignments_updated_at()` | FUNCTION | 022 | Updated_at trigger for assignments and submissions | `assignments`, `assignment_submissions` |
| `update_teacher_student_capacity_updated_at_column()` | FUNCTION | 039 | Updated_at trigger for capacity table | `teacher_student_capacity` |
| _no PostgreSQL ENUM types_ | TYPE | — | All enums are `VARCHAR(n) CHECK (… IN (…))` | — |
| _no custom composite types_ | TYPE | — | — | — |

All triggers are `BEFORE UPDATE … FOR EACH ROW`. They never carry business logic beyond stamping `updated_at`. `ensure_single_active_academic_year` is the only domain-aware trigger.

---

## 3. Schema overview

**Schemas used:** `public` only. No custom search_path or schema declarations.

**Domains (after all 40 migrations apply):**

- **Identity & auth.** `users` (UUID PK, three roles via `user_type`, OAuth+local auth, location columns for nearby search, plus QR + intro-video columns added in `20251003` / `20251025`); `tokens` (server-side revocation for JWTs, OneSignal `player_id` per session).
- **Reference / curriculum.** `academic_years` (single-active enforced by trigger), `grades` (with `is_active` and soft delete from `009`), `subjects` (per-teacher, soft-deleted), `subscription_packages` (SaaS tiers for teachers).
- **Enrolment context.** `student_grades`, `teacher_grades` (which grades a user is associated with, per study year).
- **Catalog & booking.** `courses` (per teacher × grade × subject × study year, soft-deleted, partial unique active index); `course_bookings` (the workflow: pending → pre_approved → confirmed → approved, plus rejected/cancelled, with rejection/cancellation metadata); `reservation_payments` (1:1 to a booking).
- **Subscriptions.** `teacher_subscriptions` (with `current_students` counter, semantics changed by `038` and `039`); `teacher_subscription_bonuses` (bonus seats); `teacher_referrals` (referrer ↔ referred teacher with status); `teacher_student_capacity` (introduced in `039` to decouple capacity from subscriptions).
- **Sessions & attendance.** `sessions` (weekly recurring lectures with `state` workflow and flexibility windows), plus `session_attendees`, `session_conflicts`, `session_holds`, `session_audit`; `session_attendance` (per occurrence QR check-ins).
- **Assessments.** `assignments` (+ `assignment_recipients` for specific-student visibility, `assignment_submissions`); `exams` (restructured in `024` to decouple from a single session via `exam_sessions` join), `exam_grades`; `student_evaluations` (6-axis rubric, unique per student/teacher/day).
- **Billing.** `course_invoices` (types: reservation / course / installment / penalty; `remaining_amount` is a STORED generated column); `invoice_installments` (with `remaining_amount` also generated). The `invoice_entries` table was created earlier in history but **dropped in `029`** and is not part of the final schema. Dates on these two tables were converted to `VARCHAR(10)` by `030`.
- **Money ledger.** `teacher_wallets` (1:1 with teacher, single `balance`); `teacher_wallet_transactions` (debit/credit audit with `balance_before` / `balance_after`); `teacher_expenses` (manual deductions).
- **Payments gateway.** `wayl_payment_links` (Wayl integration, stores `wayl_secret` in plaintext); `wayl_payment_link_logs` (outbound request/response audit); `wayl_webhook_events` (inbound webhooks with `signature_valid` flag and `processing_status`).
- **Notifications & CMS.** `notifications` (18 type enum values, JSONB `recipient_ids` + `data`), `user_notifications` (per-user read state), `notification_templates` (parameterised templates); `news` (CMS announcements, `web_and_mobile`/etc. targeting).
- **App config.** `app_settings` (key/value store, `value` is TEXT, `value_type` for runtime coercion).

`study_year` is consistently `VARCHAR(9)` with `CHECK (year ~ '^\d{4}-\d{4}$')`.

---

## 4. Table-by-table compact reference

### `users`
- **From:** `001_create_users_table.sql`; `20251003_add_profile_image_path_to_users.sql`; `20251025_add_intro_video_to_users.sql`
- **Purpose:** Identity and profile for super_admin / teacher / student.
- **Columns:**
  - `id` — UUID PK, DEFAULT `gen_random_uuid()`
  - `name` — VARCHAR(255) NOT NULL
  - `email` — VARCHAR(255) UNIQUE NOT NULL
  - `password` — VARCHAR(255) NOT NULL (bcrypt hash)
  - `user_type` — VARCHAR(20) NOT NULL, CHECK IN ('super_admin','teacher','student')
  - `status` — VARCHAR(20) NOT NULL DEFAULT 'pending', CHECK IN ('pending','active','inactive','suspended')
  - `phone`, `address`, `bio`, `experience_years`, `visitor_id`, `device_info` — teacher fields
  - `student_phone`, `parent_phone`, `school_name`, `gender` (CHECK IN ('male','female')), `birth_date` — student fields
  - `latitude` DECIMAL(10,8), `longitude` DECIMAL(11,8), plus `formatted_address`, `country`, `city`, `state`, `zipcode`, `street_name`, `suburb`, `location_confidence` DECIMAL(3,2)
  - `email_verified` BOOLEAN DEFAULT FALSE, `verification_code` VARCHAR(6), `verification_code_expires` TIMESTAMP, `password_reset_code` VARCHAR(6), `password_reset_expires` TIMESTAMP
  - `auth_provider` VARCHAR(20) NOT NULL DEFAULT 'email', `oauth_provider_id` VARCHAR(255)
  - `teacher_qr_image_path` TEXT
  - `profile_image_path` TEXT *(added 20251003)*
  - `intro_video_status` VARCHAR(20) DEFAULT 'none', CHECK IN ('none','processing','ready','failed') *(added 20251025)*
  - `intro_video_manifest_path` TEXT, `intro_video_storage_dir` TEXT, `intro_video_thumbnail_path` TEXT, `intro_video_duration_seconds` INTEGER *(added 20251025)*
  - `created_at`, `updated_at`, `deleted_at` — TIMESTAMP
- **PK:** `id`
- **FKs:** none
- **Unique:** `email`
- **Checks:** `user_type IN (…)`, `status IN (…)`, `gender IN (…)`, `intro_video_status IN (…)`
- **Indexes:** `idx_users_email`, `idx_users_user_type`, `idx_users_status`, `idx_users_created_at`, `idx_users_student_phone`, `idx_users_parent_phone`, `idx_users_birth_date`, `idx_users_location (latitude, longitude)`, `idx_users_auth_provider`, `idx_users_oauth_provider_id`, `idx_users_intro_video_status`
- **Triggers:** `update_users_updated_at` (BEFORE UPDATE → `update_updated_at_column`)

### `tokens`
- **From:** `002_create_tokens_table.sql`
- **Purpose:** Device/session tokens for JWT revocation; carries OneSignal `player_id`.
- **Columns:** `id` UUID PK; `user_id` UUID NOT NULL; `token` VARCHAR(500) NOT NULL; `expires_at` TIMESTAMP NOT NULL; `onesignal_player_id` VARCHAR(255); `created_at` TIMESTAMP.
- **PK:** `id`
- **FKs:** `user_id → users.id` ON DELETE CASCADE
- **Unique:** none
- **Checks:** none
- **Indexes:** `idx_tokens_user_id`, `idx_tokens_token`, `idx_tokens_expires_at`, `idx_tokens_onesignal_player_id`
- **Triggers:** none

### `news`
- **From:** `001_create_news_table.sql`
- **Purpose:** CMS announcements with `web_and_mobile`/etc. targeting and soft delete.
- **Columns:** `id` UUID PK; `title` VARCHAR(255) NOT NULL; `image_url` TEXT; `details` TEXT NOT NULL; `category` VARCHAR(100); `news_type` VARCHAR(50) NOT NULL DEFAULT 'web_and_mobile'; `is_active` BOOLEAN DEFAULT TRUE; `published_at`, `created_at`, `updated_at`, `deleted_at` TIMESTAMP.
- **PK:** `id`
- **FKs:** none
- **Unique:** `unique_news_title (title)`
- **Checks:** none
- **Indexes:** `idx_news_is_active`, `idx_news_published_at`, `idx_news_news_type`
- **Triggers:** `update_news_updated_at` (BEFORE UPDATE → `update_news_updated_at_column`)

### `subscription_packages`
- **From:** `002_create_subscription_packages_table.sql`
- **Purpose:** Teacher subscription tiers (capacity, price, duration).
- **Columns:** `id` UUID PK; `name` VARCHAR(100) NOT NULL; `description` TEXT; `max_students` INTEGER NOT NULL; `price` DECIMAL(10,2) NOT NULL; `duration_days` INTEGER NOT NULL; `is_free` BOOLEAN DEFAULT FALSE; `is_active` BOOLEAN DEFAULT TRUE; `created_at`, `updated_at`, `deleted_at` TIMESTAMP.
- **PK:** `id`
- **FKs:** none
- **Unique:** `unique_package_name (name)`; `unique_package_combination (max_students, price, duration_days, is_free)`
- **Checks:** none
- **Indexes:** `idx_subscription_packages_name`, `_is_active`, `_price`, `_duration_days`
- **Triggers:** `update_subscription_packages_updated_at`

### `academic_years`
- **From:** `003_create_academic_years_table.sql`
- **Purpose:** Reference table of school years ("2024-2025") with single-active enforcement.
- **Columns:** `id` UUID PK DEFAULT `uuid_generate_v4()`; `year` VARCHAR(9) NOT NULL UNIQUE, CHECK `year ~ '^\d{4}-\d{4}$'`; `is_active` BOOLEAN DEFAULT false; `created_at`, `updated_at` TIMESTAMPTZ.
- **PK:** `id`
- **FKs:** none
- **Unique:** `year`
- **Checks:** `year ~ '^\d{4}-\d{4}$'`
- **Indexes:** `idx_academic_years_year`, `idx_academic_years_is_active`
- **Triggers:** `update_academic_years_updated_at`; `trigger_ensure_single_active_academic_year` (BEFORE UPDATE → `ensure_single_active_academic_year`)

### `subjects`
- **From:** `004_create_subjects_table.sql`
- **Purpose:** Per-teacher subject catalog with soft delete.
- **Columns:** `id` UUID PK; `teacher_id` UUID NOT NULL; `name` VARCHAR(255) NOT NULL; `description` TEXT; `created_at`, `updated_at`, `deleted_at` TIMESTAMPTZ.
- **PK:** `id`
- **FKs:** `teacher_id → users.id` ON DELETE CASCADE
- **Unique:** `unique_subject_name_per_teacher_active (teacher_id, name) WHERE deleted_at IS NULL`
- **Checks:** none
- **Indexes:** `idx_subjects_teacher_id`, `idx_subjects_name`, `idx_subjects_deleted_at`
- **Triggers:** `update_subjects_updated_at`

### `grades`
- **From:** `005_create_grades_table.sql`; `009_update_grades_table.sql` (adds `is_active`, `deleted_at`, indexes)
- **Purpose:** Grade levels (UNIQUE by name).
- **Columns:** `id` UUID PK; `name` VARCHAR(255) UNIQUE NOT NULL; `description` TEXT; `is_active` BOOLEAN DEFAULT TRUE; `created_at`, `updated_at` TIMESTAMPTZ; `deleted_at` TIMESTAMPTZ.
- **PK:** `id`
- **FKs:** none
- **Unique:** `unique_grade_name (name)`
- **Checks:** none
- **Indexes:** `idx_grades_name`, `idx_grades_active`, `idx_grades_deleted_at`
- **Triggers:** `update_grades_updated_at`

### `courses`
- **From:** `006_create_courses_table.sql`; `999_update_courses_unique_index.sql`
- **Purpose:** Courses owned by a teacher with grade/subject/study_year scoping and a partial unique index on active rows.
- **Columns:** `id` UUID PK; `teacher_id`, `grade_id`, `subject_id` UUID NOT NULL; `study_year` VARCHAR(9) NOT NULL; `course_name` VARCHAR(255) NOT NULL; `course_images` TEXT[]; `description` TEXT; `start_date` DATE NOT NULL; `end_date` DATE NOT NULL; `price` DECIMAL(10,2) NOT NULL; `seats_count` INTEGER NOT NULL; `has_reservation` BOOLEAN NOT NULL DEFAULT false; `reservation_amount` DECIMAL(10,2); `is_deleted` BOOLEAN DEFAULT false; `created_at`, `updated_at` TIMESTAMPTZ.
- **PK:** `id`
- **FKs:** `teacher_id → users.id` CASCADE; `grade_id → grades.id` CASCADE; `subject_id → subjects.id` CASCADE
- **Unique:** `unique_course_per_teacher_year_grade_subject (teacher_id, study_year, course_name, grade_id, subject_id) WHERE is_deleted = false` *(rebuilt in 999)*
- **Checks:** `study_year ~ '^\d{4}-\d{4}$'`; `price >= 0`; `seats_count > 0`; `chk_courses_reservation_amount` = `(has_reservation=false AND reservation_amount IS NULL) OR (has_reservation=true AND reservation_amount IS NOT NULL AND reservation_amount > 0 AND reservation_amount <= price)`
- **Indexes:** `idx_courses_teacher_id`, `_grade_id`, `_subject_id`, `_study_year`, `_course_name`, `_is_deleted`
- **Triggers:** `update_courses_updated_at`

### `student_grades`
- **From:** `007_create_student_grades_table.sql`
- **Purpose:** Which grade a student is enrolled in per study year.
- **Columns:** `id` UUID PK; `student_id`, `grade_id` UUID NOT NULL; `study_year` VARCHAR(9) NOT NULL; `is_active` BOOLEAN DEFAULT TRUE; `created_at`, `updated_at`, `deleted_at` TIMESTAMP.
- **PK:** `id`
- **FKs:** `student_id → users.id` CASCADE; `grade_id → grades.id` CASCADE
- **Unique:** `(student_id, grade_id, study_year)`
- **Checks:** `study_year ~ '^\d{4}-\d{4}$'`
- **Indexes:** `_student_id`, `_grade_id`, `_study_year`, `_active`, `_created_at`
- **Triggers:** `update_student_grades_updated_at`

### `teacher_grades`
- **From:** `008_create_teacher_grades_table.sql`
- **Purpose:** Which grade(s) a teacher serves per study year.
- **Columns:** `id` UUID PK; `teacher_id`, `grade_id` UUID NOT NULL; `study_year` VARCHAR(9) NOT NULL; `is_active` BOOLEAN; `created_at`, `updated_at`, `deleted_at` TIMESTAMP.
- **PK:** `id`
- **FKs:** `teacher_id → users.id` CASCADE; `grade_id → grades.id` CASCADE
- **Unique:** `(teacher_id, grade_id, study_year)`
- **Checks:** `study_year ~ '^\d{4}-\d{4}$'`
- **Indexes:** `_teacher_id`, `_grade_id`, `_study_year`, `_active`, `_created_at`
- **Triggers:** `update_teacher_grades_updated_at`

### `course_bookings`
- **From:** `010_create_course_bookings_table.sql`
- **Purpose:** Booking workflow between a student and a course, with full audit fields for rejection and cancellation.
- **Columns:** `id` UUID PK; `student_id`, `course_id`, `teacher_id` UUID NOT NULL; `study_year` VARCHAR(9) NOT NULL; `status` VARCHAR(20) NOT NULL DEFAULT 'pending', CHECK IN ('pending','pre_approved','confirmed','approved','rejected','cancelled'); `cancelled_by` VARCHAR(10) CHECK IN ('student','teacher'); `rejected_by` VARCHAR(20) CHECK IN ('teacher','student'); `reactivated_at`, `booking_date`, `approved_at`, `rejected_at`, `cancelled_at` TIMESTAMPTZ; `rejection_reason`, `cancellation_reason`, `student_message`, `teacher_response` TEXT; `is_deleted` BOOLEAN; `created_at`, `updated_at` TIMESTAMPTZ.
- **PK:** `id`
- **FKs:** `student_id → users.id` CASCADE; `course_id → courses.id` CASCADE; `teacher_id → users.id` CASCADE
- **Unique:** `unique_student_course_booking (student_id, course_id)`
- **Checks:** see status / cancelled_by / rejected_by enums above
- **Indexes:** `_student_id`, `_course_id`, `_teacher_id`, `_study_year`, `_status`, `_booking_date`, `_is_deleted`, `_cancelled_by`, `_rejected_by`, `_reactivated_at`
- **Triggers:** `update_course_bookings_updated_at`

### `reservation_payments`
- **From:** `011_create_reservation_payments_table.sql`
- **Purpose:** 1:1 reservation deposit tracking for a booking.
- **Columns:** `id` UUID PK; `booking_id` UUID NOT NULL UNIQUE; `student_id`, `teacher_id`, `course_id` UUID NOT NULL; `amount` DECIMAL(10,2) NOT NULL CHECK > 0; `status` VARCHAR(10) DEFAULT 'pending' CHECK IN ('pending','paid'); `paid_at`, `created_at`, `updated_at` TIMESTAMPTZ.
- **PK:** `id`
- **FKs:** `booking_id → course_bookings.id` CASCADE (UNIQUE); `student_id → users.id` CASCADE; `teacher_id → users.id` CASCADE; `course_id → courses.id` CASCADE
- **Unique:** `booking_id`
- **Checks:** `amount > 0`; `status IN ('pending','paid')`
- **Indexes:** `idx_res_pay_teacher_id`, `_course_id`, `_student_id`, `_status`
- **Triggers:** `update_reservation_payments_updated_at`

### `teacher_subscriptions`
- **From:** `011_create_teacher_subscriptions_table.sql`; `038_fix_teacher_subscriptions_unique_active.sql`; `039_support_multiple_active_subscriptions_and_teacher_capacity.sql`
- **Purpose:** Teacher's SaaS plan subscription with seat counter and lifecycle dates.
- **Columns:** `id` UUID PK; `teacher_id`, `subscription_package_id` UUID NOT NULL; `start_date`, `end_date` TIMESTAMP NOT NULL; `is_active` BOOLEAN DEFAULT TRUE; `current_students` INTEGER NOT NULL DEFAULT 0 CHECK >= 0; `created_at`, `updated_at`, `deleted_at` TIMESTAMP.
- **PK:** `id`
- **FKs:** `teacher_id → users.id` CASCADE; `subscription_package_id → subscription_packages.id` CASCADE
- **Unique:** _none in the final state._ The original `(teacher_id, is_active)` UNIQUE constraint was logically broken (only one inactive row allowed per teacher); `038` replaced it with a partial UNIQUE index `WHERE is_active=true AND deleted_at IS NULL`; `039` drops that index entirely to allow multiple active subscriptions per teacher.
- **Checks:** `current_students >= 0`
- **Indexes:** `_teacher_id`, `_package_id`, `_active`, `_current_students`
- **Triggers:** `update_teacher_subscriptions_updated_at`

### `booking_usage_logs`
- **From:** `012_create_booking_usage_logs_table.sql`
- **Purpose:** Audit log of booking state transitions with seat-count deltas.
- **Columns:** `id` UUID PK; `booking_id`, `teacher_id`, `student_id`, `teacher_subscription_id` UUID NOT NULL; `action_type` VARCHAR(20) NOT NULL CHECK IN ('approved','rejected','cancelled','reactivated'); `previous_status` VARCHAR(20); `new_status` VARCHAR(20) NOT NULL; `students_before` INTEGER NOT NULL DEFAULT 0; `students_after` INTEGER NOT NULL DEFAULT 0; `reason` TEXT; `performed_by` VARCHAR(20) NOT NULL CHECK IN ('teacher','student','system'); `created_at` TIMESTAMP.
- **PK:** `id`
- **FKs:** `booking_id → course_bookings.id` CASCADE; `teacher_id`, `student_id → users.id` CASCADE; `teacher_subscription_id → teacher_subscriptions.id` CASCADE
- **Unique:** `(booking_id, action_type, created_at)`
- **Checks:** see `action_type` and `performed_by` enums
- **Indexes:** `_teacher_id`, `_student_id`, `_subscription_id`, `_action_type`, `_created_at`
- **Triggers:** none — `log_booking_usage()` is called from application code

### `notifications`
- **From:** `013_create_notifications_tables.sql` (also re-declared in `notifications.sql` which runs last and is effectively a no-op due to `IF NOT EXISTS`)
- **Purpose:** Targeted or broadcast in-app + push notifications with scheduling.
- **Columns:** `id` UUID PK; `title` VARCHAR(255) NOT NULL; `message` TEXT NOT NULL; `type` VARCHAR(50) NOT NULL CHECK IN (18 values: `homework_reminder`, `course_update`, `booking_confirmation`, `booking_cancellation`, `new_booking`, `payment_reminder`, `system_announcement`, `grade_update`, `assignment_due`, `class_reminder`, `teacher_message`, `parent_notification`, `subscription_expiry`, `new_course_available`, `course_completion`, `feedback_request`, `booking_status`); `priority` VARCHAR(20) DEFAULT 'medium' CHECK IN ('low','medium','high','urgent'); `status` VARCHAR(20) DEFAULT 'pending' CHECK IN ('pending','sent','delivered','read','failed'); `recipient_type` VARCHAR(50) NOT NULL CHECK IN ('all','teachers','students','specific_teachers','specific_students','parents'); `recipient_ids` JSONB; `data` JSONB; `study_year` VARCHAR(50); `scheduled_at`, `sent_at`, `read_at`, `created_at`, `updated_at`, `deleted_at` TIMESTAMPTZ; `created_by` UUID NOT NULL; `deleted_by` UUID.
- **PK:** `id`
- **FKs:** `created_by → users.id` CASCADE
- **Unique:** none
- **Checks:** see enums above
- **Indexes:** `_type`, `_status`, `_priority`, `_recipient_type`, `_created_by`, `_scheduled_at`, `_created_at`, `_recipient_ids (GIN)`, `_study_year`, `_not_deleted WHERE deleted_at IS NULL`
- **Triggers:** `trigger_update_notifications_updated_at`

### `user_notifications`
- **From:** `013_create_notifications_tables.sql`
- **Purpose:** Per-user read state for a notification (m:m).
- **Columns:** `id` UUID PK; `user_id`, `notification_id` UUID NOT NULL; `read_at`, `created_at` TIMESTAMPTZ.
- **PK:** `id`
- **FKs:** `user_id → users.id` CASCADE; `notification_id → notifications.id` CASCADE
- **Unique:** `(user_id, notification_id)`
- **Checks:** none
- **Indexes:** `_user_id`, `_notification_id`, `_read_at`
- **Triggers:** none

### `notification_templates`
- **From:** `013_create_notifications_tables.sql`
- **Purpose:** Parameterised templates with `{variables}` substitution.
- **Columns:** `id` UUID PK; `name` VARCHAR(100) UNIQUE NOT NULL; `title_template`, `message_template` TEXT NOT NULL; `type` VARCHAR(50) NOT NULL; `priority` VARCHAR(20) DEFAULT 'medium'; `variables` JSONB; `is_active` BOOLEAN DEFAULT true; `created_by` UUID NOT NULL; `created_at`, `updated_at` TIMESTAMPTZ.
- **PK:** `id`
- **FKs:** `created_by → users.id` CASCADE
- **Unique:** `name`
- **Checks:** none
- **Indexes:** `_type`, `_is_active`, `_created_by`
- **Triggers:** `trigger_update_notification_templates_updated_at`

### `sessions`
- **From:** `020_create_lecture_scheduling.sql`
- **Purpose:** Weekly recurring lecture sessions with negotiation/state workflow.
- **Columns:** `id` UUID PK; `course_id`, `teacher_id` UUID NOT NULL; `title` TEXT; `weekday` SMALLINT NOT NULL CHECK BETWEEN 0 AND 6 (0=Sunday); `start_time`, `end_time` TIME NOT NULL; `recurrence` BOOLEAN NOT NULL DEFAULT true; `flex_type` VARCHAR(20) NOT NULL DEFAULT 'window' CHECK IN ('window','alternates','none'); `flex_minutes` SMALLINT CHECK >= 0; `flex_alternates`, `hard_constraints`, `soft_constraints` JSONB; `state` VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK IN ('draft','proposed','conflict','confirmed','negotiating','rejected','canceled'); `version` INTEGER DEFAULT 1; `is_deleted` BOOLEAN DEFAULT false; `created_at`, `updated_at` TIMESTAMPTZ.
- **PK:** `id`
- **FKs:** `course_id → courses.id` CASCADE; `teacher_id → users.id` CASCADE
- **Unique:** none
- **Checks:** see weekday / flex_type / state enums above
- **Indexes:** `idx_sessions_course`, `_teacher`, `_weekday_time (weekday, start_time, end_time)`, `_state`
- **Triggers:** `update_sessions_updated_at`

### `session_attendees`
- **From:** `020_create_lecture_scheduling.sql`
- **Purpose:** Explicit student ↔ session enrolment.
- **Columns:** `session_id` UUID; `student_id` UUID.
- **PK:** `(session_id, student_id)`
- **FKs:** `session_id → sessions.id` CASCADE; `student_id → users.id` CASCADE
- **Unique:** PK enforces
- **Checks:** none
- **Indexes:** `idx_session_attendees_student`
- **Triggers:** none

### `session_conflicts`
- **From:** `020_create_lecture_scheduling.sql`
- **Purpose:** Detected time overlaps per student across sessions.
- **Columns:** `id` UUID PK; `session_id`, `other_session_id`, `student_id` UUID NOT NULL; `status` VARCHAR(20) DEFAULT 'open' CHECK IN ('open','resolved','dismissed'); `detected_at`, `resolved_at` TIMESTAMPTZ; `details` JSONB.
- **PK:** `id`
- **FKs:** `session_id → sessions.id` CASCADE; `other_session_id → sessions.id` CASCADE; `student_id → users.id` CASCADE
- **Unique:** none
- **Checks:** `status IN ('open','resolved','dismissed')`
- **Indexes:** `idx_session_conflicts_session`, `_student`
- **Triggers:** none

### `session_holds`
- **From:** `020_create_lecture_scheduling.sql`
- **Purpose:** Soft holds during negotiation to block premature confirmation.
- **Columns:** `id` UUID PK; `session_id` UUID NOT NULL; `hold_until` TIMESTAMPTZ NOT NULL; `created_by` UUID; `reason` TEXT; `status` VARCHAR(20) DEFAULT 'active' CHECK IN ('active','expired','released'); `created_at` TIMESTAMPTZ.
- **PK:** `id`
- **FKs:** `session_id → sessions.id` CASCADE; `created_by → users.id` ON DELETE SET NULL
- **Unique:** none
- **Checks:** `status IN ('active','expired','released')`
- **Indexes:** none explicit
- **Triggers:** none

### `session_audit`
- **From:** `020_create_lecture_scheduling.sql`
- **Purpose:** Append-only log of session state transitions.
- **Columns:** `id` UUID PK; `session_id` UUID NOT NULL; `action` TEXT NOT NULL; `from_state`, `to_state` VARCHAR(20); `meta` JSONB; `created_by` UUID; `created_at` TIMESTAMPTZ.
- **PK:** `id`
- **FKs:** `session_id → sessions.id` CASCADE; `created_by → users.id` ON DELETE SET NULL
- **Unique:** none
- **Checks:** none
- **Indexes:** none explicit
- **Triggers:** none

### `session_attendance`
- **From:** `021_create_session_attendance.sql`
- **Purpose:** Check-in record per session occurrence per student.
- **Columns:** `id` UUID PK; `session_id`, `course_id`, `teacher_id`, `student_id` UUID NOT NULL; `occurred_on` DATE NOT NULL; `checkin_at` TIMESTAMPTZ DEFAULT NOW(); `source` VARCHAR(20) DEFAULT 'qr' CHECK IN ('qr','manual','system'); `meta` JSONB; `created_at`, `updated_at` TIMESTAMPTZ.
- **PK:** `id`
- **FKs:** `session_id → sessions.id` CASCADE; `course_id → courses.id` CASCADE; `teacher_id`, `student_id → users.id` CASCADE
- **Unique:** `(session_id, student_id, occurred_on)`
- **Checks:** `source IN ('qr','manual','system')`
- **Indexes:** `_student`, `_session`, `_course`, `_teacher`
- **Triggers:** `update_session_attendance_updated_at`

### `assignments`
- **From:** `022_create_assignments.sql`
- **Purpose:** Course assignments with visibility and submission type.
- **Columns:** `id` UUID PK; `course_id` UUID NOT NULL; `subject_id`, `session_id` UUID; `teacher_id` UUID NOT NULL; `title` TEXT NOT NULL; `description` TEXT; `assigned_date`, `due_date` TIMESTAMPTZ; `submission_type` VARCHAR(20) DEFAULT 'mixed' CHECK IN ('text','file','link','mixed'); `attachments` JSONB DEFAULT '{}'; `resources` JSONB DEFAULT '[]'; `max_score` INTEGER DEFAULT 100; `is_active` BOOLEAN DEFAULT TRUE; `visibility` VARCHAR(32) DEFAULT 'all_students' CHECK IN ('all_students','group','specific_students'); `study_year` VARCHAR(20); `grade_id` UUID; `created_at`, `updated_at`, `deleted_at` TIMESTAMPTZ; `created_by` UUID NOT NULL.
- **PK:** `id`
- **FKs:** `course_id → courses.id` CASCADE; `subject_id → subjects.id` SET NULL; `session_id → sessions.id` SET NULL; `teacher_id → users.id` CASCADE; `grade_id → grades.id` SET NULL; `created_by → users.id` SET NULL
- **Unique:** none
- **Checks:** see `submission_type` / `visibility`
- **Indexes:** `_course`, `_teacher`, `_due_date`, `_visibility`
- **Triggers:** `trigger_update_assignments_updated_at`

### `assignment_recipients`
- **From:** `022_create_assignments.sql`
- **Purpose:** Specific-student visibility when `assignments.visibility = 'specific_students'`.
- **Columns:** `assignment_id`, `student_id` UUID.
- **PK:** `(assignment_id, student_id)`
- **FKs:** `assignment_id → assignments.id` CASCADE; `student_id → users.id` CASCADE
- **Unique:** PK enforces
- **Checks:** none
- **Indexes:** none explicit
- **Triggers:** none

### `assignment_submissions`
- **From:** `022_create_assignments.sql`
- **Purpose:** Per-student submission with grading.
- **Columns:** `id` UUID PK; `assignment_id`, `student_id` UUID NOT NULL; `submitted_at`, `graded_at` TIMESTAMPTZ; `status` VARCHAR(20) DEFAULT 'submitted' CHECK IN ('submitted','late','graded','returned'); `content_text`, `link_url`, `feedback` TEXT; `attachments` JSONB DEFAULT '[]'; `score` INTEGER; `graded_by` UUID; `created_at`, `updated_at` TIMESTAMPTZ.
- **PK:** `id`
- **FKs:** `assignment_id → assignments.id` CASCADE; `student_id → users.id` CASCADE; `graded_by → users.id` SET NULL
- **Unique:** `(assignment_id, student_id)`
- **Checks:** `status IN ('submitted','late','graded','returned')`
- **Indexes:** `_student`, `_status`
- **Triggers:** `trigger_update_assignment_submissions_updated_at`

### `exams`
- **From:** `023_create_exams.sql`; `024_restructure_exams.sql` (drops `session_id`)
- **Purpose:** Exam definitions; sessions associated via `exam_sessions`.
- **Columns:** `id` UUID PK; `course_id`, `subject_id`, `teacher_id` UUID NOT NULL; `exam_date` TIMESTAMPTZ NOT NULL; `exam_type` VARCHAR(20) NOT NULL CHECK IN ('daily','monthly'); `max_score` INTEGER NOT NULL; `description`, `notes` TEXT; `created_at`, `updated_at` TIMESTAMPTZ.
- **PK:** `id`
- **FKs:** `course_id → courses.id` CASCADE; `subject_id → subjects.id` CASCADE; `teacher_id → users.id` CASCADE
- **Unique:** none
- **Checks:** `exam_type IN ('daily','monthly')`
- **Indexes:** none explicit (gap)
- **Triggers:** none

### `exam_sessions`
- **From:** `024_restructure_exams.sql`
- **Purpose:** m:m link of exams to lecture sessions.
- **Columns:** `exam_id`, `session_id` UUID.
- **PK:** `(exam_id, session_id)`
- **FKs:** `exam_id → exams.id` CASCADE; `session_id → sessions.id` CASCADE
- **Unique:** PK enforces
- **Checks:** none
- **Indexes:** none explicit
- **Triggers:** none

### `exam_grades`
- **From:** `023_create_exams.sql` (+ adjustments in `024`)
- **Purpose:** Per-student score on an exam.
- **Columns:** `id` UUID PK; `exam_id`, `student_id` UUID NOT NULL; `score` INTEGER NOT NULL; `graded_at` TIMESTAMPTZ DEFAULT NOW(); `graded_by` UUID.
- **PK:** `id`
- **FKs:** `exam_id → exams.id` CASCADE; `student_id → users.id` CASCADE; `graded_by → users.id` SET NULL
- **Unique:** `(exam_id, student_id)`
- **Checks:** none — note no `score <= exams.max_score` enforcement
- **Indexes:** unique on `(exam_id, student_id)` only
- **Triggers:** none

### `student_evaluations`
- **From:** `025_create_student_evaluations.sql`
- **Purpose:** 6-axis daily rubric evaluations by a teacher for a student.
- **Columns:** `id` UUID PK; `student_id`, `teacher_id` UUID NOT NULL; `eval_date` TIMESTAMPTZ DEFAULT NOW(); `eval_date_date` DATE DEFAULT CURRENT_DATE; six rubric levels — `scientific_level`, `behavioral_level`, `attendance_level`, `homework_preparation`, `participation_level`, `instruction_following` — each VARCHAR(20) NOT NULL CHECK IN ('excellent','very_good','good','fair','weak'); `guidance`, `notes` TEXT; `created_at`, `updated_at` TIMESTAMPTZ.
- **PK:** `id`
- **FKs:** `student_id`, `teacher_id → users.id` CASCADE
- **Unique:** `student_evaluations_unique_per_day (student_id, teacher_id, eval_date_date)`
- **Checks:** six rubric-level CHECKs (same enum on each)
- **Indexes:** `_student`, `_teacher`, `_date`
- **Triggers:** none

### `course_invoices`
- **From:** `026_create_course_invoices_table.sql`; `030_alter_invoice_dates_to_varchar.sql`
- **Purpose:** Course-level billing with reservation / course / installment / penalty types.
- **Columns:** `id` UUID PK; `student_id`, `teacher_id`, `course_id` UUID NOT NULL; `study_year` VARCHAR(9) NOT NULL; `invoice_number` VARCHAR UNIQUE; `invoice_type` VARCHAR(20) NOT NULL CHECK IN ('reservation','course','installment','penalty'); `payment_mode` VARCHAR(20) NOT NULL CHECK IN ('cash','installments'); `amount_due` DECIMAL(12,2) CHECK >= 0; `discount_total` DEFAULT 0 CHECK >= 0; `amount_paid` DEFAULT 0 CHECK >= 0; **`remaining_amount` DECIMAL(12,2) GENERATED ALWAYS AS `GREATEST(amount_due - discount_total - amount_paid, 0)` STORED**; `invoice_status` VARCHAR(10) DEFAULT 'pending' CHECK IN ('pending','partial','paid','overdue','cancelled'); `invoice_date`, `due_date`, `paid_date` — **VARCHAR(10) after 030** (were DATE in 026); `notes` TEXT; `created_at`, `updated_at`, `deleted_at` TIMESTAMPTZ.
- **PK:** `id`
- **FKs:** `student_id → users.id` CASCADE; `teacher_id → users.id` CASCADE; `course_id → courses.id` CASCADE
- **Unique:** `invoice_number`
- **Checks:** see enums and non-negative amount checks above
- **Indexes:** `_teacher_id`, `_student_id`, `_course_id`, `_study_year`, `_status`, `_due_date`
- **Triggers:** `update_course_invoices_updated_at`

### `invoice_installments`
- **From:** `027_create_invoice_installments_table.sql`; `030_alter_invoice_dates_to_varchar.sql`
- **Purpose:** Installment plan rows for a course invoice.
- **Columns:** `id` UUID PK; `invoice_id` UUID NOT NULL; `installment_number` INTEGER NOT NULL; `planned_amount` DECIMAL(12,2) NOT NULL CHECK > 0; `paid_amount` DECIMAL(12,2) DEFAULT 0; **`remaining_amount` DECIMAL(12,2) GENERATED ALWAYS AS `GREATEST(planned_amount - paid_amount, 0)` STORED**; `installment_status` VARCHAR(10) DEFAULT 'pending' CHECK IN ('pending','partial','paid','overdue'); `due_date`, `paid_date` — **VARCHAR(10) after 030**; `notes` TEXT; `created_at`, `updated_at`, `deleted_at` TIMESTAMPTZ.
- **PK:** `id`
- **FKs:** `invoice_id → course_invoices.id` CASCADE
- **Unique:** `(invoice_id, installment_number)`
- **Checks:** see enums above
- **Indexes:** `_invoice_id`, `_status`, `_due_date`
- **Triggers:** `update_invoice_installments_updated_at`

### `teacher_expenses`
- **From:** `031_create_teacher_expenses.sql`
- **Purpose:** Teacher-recorded expenses (wallet deductions).
- **Columns:** `id` UUID PK; `teacher_id` UUID NOT NULL; `study_year` VARCHAR(9); `amount` DECIMAL(12,2) NOT NULL CHECK >= 0; `note` TEXT; `expense_date` DATE NOT NULL DEFAULT CURRENT_DATE; `created_at`, `updated_at`, `deleted_at` TIMESTAMPTZ.
- **PK:** `id`
- **FKs:** `teacher_id → users.id` CASCADE
- **Unique:** none
- **Checks:** `amount >= 0`
- **Indexes:** `_teacher_id`, `_expense_date`
- **Triggers:** `update_teacher_expenses_updated_at`

### `teacher_referrals`
- **From:** `032_create_teacher_referrals_table.sql`
- **Purpose:** Teacher-to-teacher referral tracking.
- **Columns:** `id` UUID PK; `referrer_teacher_id`, `referred_teacher_id` UUID NOT NULL; `referral_code_used` TEXT NOT NULL; `status` VARCHAR(20) DEFAULT 'pending' CHECK IN ('pending','completed','rejected'); `created_at`, `updated_at` TIMESTAMP.
- **PK:** `id`
- **FKs:** `referrer_teacher_id → users.id`; `referred_teacher_id → users.id` *(no explicit ON DELETE — verify whether ALTER TABLE in any migration added FK semantics; the inline `REFERENCES users(id)` clause without ON DELETE results in NO ACTION)*
- **Unique:** `unique_referred_teacher (referred_teacher_id)`; `unique_referral_pair (referrer_teacher_id, referred_teacher_id)`
- **Checks:** `no_self_referral` = `referrer_teacher_id <> referred_teacher_id`; `status IN (3 values)`
- **Indexes:** `_referrer`, `_referred`, `_status`
- **Triggers:** `update_teacher_referrals_updated_at`

### `teacher_subscription_bonuses`
- **From:** `033_create_teacher_subscription_bonuses_table.sql`
- **Purpose:** Bonus seats tied to a subscription with optional expiry.
- **Columns:** `id` UUID PK; `teacher_subscription_id` UUID NOT NULL; `bonus_type` VARCHAR(32) NOT NULL; `bonus_value` INTEGER NOT NULL; `expires_at` TIMESTAMP; `created_at` TIMESTAMP.
- **PK:** `id`
- **FKs:** `teacher_subscription_id → teacher_subscriptions.id` (no explicit ON DELETE)
- **Unique:** none
- **Checks:** none
- **Indexes:** `_subscription`, `_expires`
- **Triggers:** none

### `app_settings`
- **From:** `034_create_app_settings_table.sql`
- **Purpose:** Global key/value config store.
- **Columns:** `key` VARCHAR(100) PK; `value` TEXT NOT NULL; `value_type` VARCHAR(20) DEFAULT 'string'; `updated_by` UUID; `created_at`, `updated_at` TIMESTAMP.
- **PK:** `key`
- **FKs:** `updated_by → users.id` ON DELETE SET NULL
- **Unique:** PK enforces
- **Checks:** none
- **Indexes:** `idx_app_settings_updated_at`
- **Triggers:** `update_app_settings_updated_at`

### `teacher_wallets`
- **From:** `035_create_teacher_wallets_table.sql`
- **Purpose:** 1:1 teacher → balance.
- **Columns:** `teacher_id` UUID PK; `balance` DECIMAL(14,2) NOT NULL DEFAULT 0; `created_at`, `updated_at` TIMESTAMP.
- **PK:** `teacher_id`
- **FKs:** `teacher_id → users.id` CASCADE
- **Unique:** PK
- **Checks:** none
- **Indexes:** `idx_teacher_wallets_balance`
- **Triggers:** `update_teacher_wallets_updated_at`

### `teacher_wallet_transactions`
- **From:** `036_create_teacher_wallet_transactions_table.sql`
- **Purpose:** Debit / credit audit with balance snapshots.
- **Columns:** `id` UUID PK; `teacher_id` UUID NOT NULL; `txn_type` VARCHAR(20) NOT NULL; `amount`, `balance_before`, `balance_after` DECIMAL(14,2) NOT NULL; `reference_type` VARCHAR(40); `reference_id` TEXT; `created_at` TIMESTAMP.
- **PK:** `id`
- **FKs:** `teacher_id → users.id` CASCADE
- **Unique:** none
- **Checks:** none
- **Indexes:** `_teacher_id`, `_created_at`, `_reference (reference_type, reference_id)`
- **Triggers:** none

### `wayl_payment_links`
- **From:** `037_create_wayl_payment_links_table.sql`
- **Purpose:** Wayl payment gateway integration — links + secret + status.
- **Columns:** `id` UUID PK; `teacher_id` UUID NOT NULL; `purpose` VARCHAR(30) NOT NULL; `subscription_package_id` UUID; `amount` DECIMAL(14,2) NOT NULL; `currency` VARCHAR(10) DEFAULT 'iqd'; `reference_id` TEXT NOT NULL; `wayl_order_id`, `wayl_code`, `wayl_url` TEXT; `wayl_secret` TEXT NOT NULL; `status` VARCHAR(20) DEFAULT 'created'; `webhook_received_at`, `created_at`, `updated_at` TIMESTAMP.
- **PK:** `id`
- **FKs:** `teacher_id → users.id` CASCADE; `subscription_package_id → subscription_packages.id` SET NULL
- **Unique:** `ux_wayl_payment_links_reference_id (reference_id)`
- **Checks:** none
- **Indexes:** `_teacher_id`, `_status`
- **Triggers:** `update_wayl_payment_links_updated_at`

### `wayl_payment_link_logs`
- **From:** `040_create_wayl_payment_events_tables.sql`
- **Purpose:** Outbound Wayl API request/response audit.
- **Columns:** `id` UUID PK; `payment_link_id` UUID; `reference_id` TEXT; `event_type` VARCHAR(30) NOT NULL; `http_status` INTEGER; `payload` JSONB; `created_at` TIMESTAMP.
- **PK:** `id`
- **FKs:** `payment_link_id → wayl_payment_links.id` CASCADE
- **Unique:** none
- **Checks:** none
- **Indexes:** `_payment_link_id`, `_reference_id`
- **Triggers:** none

### `wayl_webhook_events`
- **From:** `040_create_wayl_payment_events_tables.sql`
- **Purpose:** Inbound Wayl webhook audit with signature validation flag.
- **Columns:** `id` UUID PK; `payment_link_id` UUID; `reference_id`, `signature`, `raw_body`, `processing_message` TEXT; `signature_valid` BOOLEAN DEFAULT false; `headers`, `body` JSONB; `received_at` TIMESTAMP DEFAULT NOW; `processed_at` TIMESTAMP; `processing_status` VARCHAR(30) DEFAULT 'received' CHECK IN ('received','processed','ignored','failed').
- **PK:** `id`
- **FKs:** `payment_link_id → wayl_payment_links.id` CASCADE
- **Unique:** none
- **Checks:** `processing_status IN ('received','processed','ignored','failed')`
- **Indexes:** `_payment_link_id`, `_reference_id`, `_processing_status`
- **Triggers:** none

### `teacher_student_capacity`
- **From:** `039_support_multiple_active_subscriptions_and_teacher_capacity.sql`
- **Purpose:** Global seat counter per teacher, decoupled from any single subscription. Backfilled from `MAX(teacher_subscriptions.current_students)` per teacher.
- **Columns:** `teacher_id` UUID PK; `current_students` INTEGER NOT NULL DEFAULT 0; `created_at`, `updated_at` TIMESTAMP.
- **PK:** `teacher_id`
- **FKs:** `teacher_id → users.id` CASCADE
- **Unique:** PK
- **Checks:** none
- **Indexes:** none explicit
- **Triggers:** `update_teacher_student_capacity_updated_at`

> **Removed:** `invoice_entries` (created earlier, **dropped by migration `029`**). Not part of the final schema.

---

## 5. Relationship map by domain

### Identity & auth
- `tokens.user_id → users.id` ON DELETE CASCADE
- `app_settings.updated_by → users.id` ON DELETE SET NULL
- `notifications.created_by → users.id` CASCADE
- `notification_templates.created_by → users.id` CASCADE
- `user_notifications.user_id → users.id` CASCADE

### Reference data
- `subjects.teacher_id → users.id` CASCADE
- `student_grades.student_id → users.id` CASCADE; `.grade_id → grades.id` CASCADE
- `teacher_grades.teacher_id → users.id` CASCADE; `.grade_id → grades.id` CASCADE

### Catalog & enrolment
- `courses.teacher_id → users.id` CASCADE; `.grade_id → grades.id` CASCADE; `.subject_id → subjects.id` CASCADE
- `course_bookings.student_id`, `.teacher_id → users.id` CASCADE; `.course_id → courses.id` CASCADE
- `reservation_payments.booking_id → course_bookings.id` CASCADE (UNIQUE); `.student_id`, `.teacher_id → users.id` CASCADE; `.course_id → courses.id` CASCADE
- `booking_usage_logs.booking_id → course_bookings.id` CASCADE; `.teacher_id`, `.student_id → users.id` CASCADE; `.teacher_subscription_id → teacher_subscriptions.id` CASCADE

### Subscriptions
- `teacher_subscriptions.teacher_id → users.id` CASCADE; `.subscription_package_id → subscription_packages.id` CASCADE
- `teacher_subscription_bonuses.teacher_subscription_id → teacher_subscriptions.id` (no explicit ON DELETE)
- `teacher_referrals.referrer_teacher_id`, `.referred_teacher_id → users.id` (NO ACTION by default)
- `teacher_student_capacity.teacher_id → users.id` CASCADE

### Sessions & attendance
- `sessions.course_id → courses.id` CASCADE; `.teacher_id → users.id` CASCADE
- `session_attendees.session_id → sessions.id` CASCADE; `.student_id → users.id` CASCADE
- `session_conflicts.session_id`, `.other_session_id → sessions.id` CASCADE; `.student_id → users.id` CASCADE
- `session_holds.session_id → sessions.id` CASCADE; `.created_by → users.id` SET NULL
- `session_audit.session_id → sessions.id` CASCADE; `.created_by → users.id` SET NULL
- `session_attendance.session_id → sessions.id` CASCADE; `.course_id → courses.id` CASCADE; `.teacher_id`, `.student_id → users.id` CASCADE

### Assessments
- `assignments.course_id → courses.id` CASCADE; `.subject_id → subjects.id` SET NULL; `.session_id → sessions.id` SET NULL; `.teacher_id → users.id` CASCADE; `.grade_id → grades.id` SET NULL; `.created_by → users.id` SET NULL
- `assignment_recipients.assignment_id → assignments.id` CASCADE; `.student_id → users.id` CASCADE
- `assignment_submissions.assignment_id → assignments.id` CASCADE; `.student_id → users.id` CASCADE; `.graded_by → users.id` SET NULL
- `exams.course_id → courses.id` CASCADE; `.subject_id → subjects.id` CASCADE; `.teacher_id → users.id` CASCADE
- `exam_sessions.exam_id → exams.id` CASCADE; `.session_id → sessions.id` CASCADE
- `exam_grades.exam_id → exams.id` CASCADE; `.student_id → users.id` CASCADE; `.graded_by → users.id` SET NULL
- `student_evaluations.student_id`, `.teacher_id → users.id` CASCADE

### Billing
- `course_invoices.student_id`, `.teacher_id → users.id` CASCADE; `.course_id → courses.id` CASCADE
- `invoice_installments.invoice_id → course_invoices.id` CASCADE
- `teacher_expenses.teacher_id → users.id` CASCADE

### Money ledger
- `teacher_wallets.teacher_id → users.id` CASCADE
- `teacher_wallet_transactions.teacher_id → users.id` CASCADE

### Payments gateway
- `wayl_payment_links.teacher_id → users.id` CASCADE; `.subscription_package_id → subscription_packages.id` SET NULL
- `wayl_payment_link_logs.payment_link_id → wayl_payment_links.id` CASCADE
- `wayl_webhook_events.payment_link_id → wayl_payment_links.id` CASCADE

### Notifications
- `notifications.created_by → users.id` CASCADE
- `user_notifications.user_id → users.id` CASCADE; `.notification_id → notifications.id` CASCADE
- `notification_templates.created_by → users.id` CASCADE

Top-level "hub": `users`. Almost every table FK-cascades from `users`. Deleting a user row would cascade-delete vast amounts of business data — financial records included. This is dangerous; see section 8.

---

## 6. Lifecycle & state machines

| Entity | Status column | Legal values | Notes |
|---|---|---|---|
| `users` | `status` | pending, active, inactive, suspended | App-side; no schema-enforced transitions. Email-verify flips pending → active. |
| `users` | `user_type` | super_admin, teacher, student | Effectively immutable; FKs assume consistency. |
| `academic_years` | `is_active` | true/false | Trigger `ensure_single_active_academic_year` enforces single active row. |
| `course_bookings` | `status` | pending, pre_approved, confirmed, approved, rejected, cancelled | Typical path: pending → pre_approved → confirmed → approved. Cancellation tracked by `cancelled_by`; rejection by `rejected_by`. Reactivation via `reactivated_at`. No schema-enforced FSM. |
| `reservation_payments` | `status` | pending, paid | Set to paid after a Wayl webhook (or admin action). |
| `course_invoices` | `invoice_status` | pending, partial, paid, overdue, cancelled | Driven by `remaining_amount` (generated column). |
| `invoice_installments` | `installment_status` | pending, partial, paid, overdue | Same pattern; `remaining_amount` generated. |
| `teacher_subscriptions` | `is_active` | true/false | After 039, multiple active rows per teacher are allowed; capacity in `teacher_student_capacity`. |
| `booking_usage_logs` | `action_type` | approved, rejected, cancelled, reactivated | Append-only audit. |
| `notifications` | `status` | pending, sent, delivered, read, failed | App-side. |
| `sessions` | `state` | draft, proposed, conflict, confirmed, negotiating, rejected, canceled | App-side workflow with `session_audit` trail and `session_holds` for negotiation. |
| `assignment_submissions` | `status` | submitted, late, graded, returned | App-side. |
| `student_evaluations` | (no status — append-only) | — | UNIQUE per (student, teacher, day). |
| `wayl_payment_links` | `status` | created, pending, paid, failed, expired (no CHECK) | Free-form VARCHAR — *no DB-side enum enforcement.* |
| `wayl_webhook_events` | `processing_status` | received, processed, ignored, failed | Drives idempotency. |
| `teacher_referrals` | `status` | pending, completed, rejected | No timestamp columns track transitions. |
| `session_conflicts` | `status` | open, resolved, dismissed | |
| `session_holds` | `status` | active, expired, released | |

None of these state machines are enforced by triggers (apart from the academic-year single-active rule). Invalid transitions are an application correctness concern.

---

## 7. Indexing review (Have vs Missing)

### Tables with good coverage
- **`users`** — Have: email, user_type, status, created_at, phones, birth_date, (lat, lon), auth_provider, oauth_provider_id, intro_video_status. **Recommend** a partial index on `(status, deleted_at) WHERE status='active' AND deleted_at IS NULL` to support the common auth-middleware predicate.
- **`courses`** — Have: teacher_id, grade_id, subject_id, study_year, course_name, is_deleted, partial unique active index. Coverage is excellent.
- **`course_bookings`** — Have: student_id, course_id, teacher_id, study_year, status, booking_date, is_deleted, cancelled_by, rejected_by, reactivated_at. **Recommend** a composite `(status, is_deleted)` for "list pending approvals".
- **`notifications`** — Have: type, status, priority, recipient_type, created_by, scheduled_at, created_at, `recipient_ids` GIN, study_year, partial WHERE deleted_at IS NULL. Excellent.
- **`session_attendance`** — Have: student, session, course, teacher; UNIQUE on (session, student, occurred_on). Good.
- **`sessions`** — Have: course, teacher, (weekday, start_time, end_time), state. Good.

### Tables with gaps
- **`student_grades` / `teacher_grades`** — Missing a partial `(student_id, study_year) WHERE is_active=true AND deleted_at IS NULL` (or teacher variant). The booking-creation flow looks up active grade rows on every request.
- **`assignments`** — Missing `(course_id, is_active)` and `(visibility, deleted_at)`. Listing per-course active assignments scans more rows than needed.
- **`assignment_submissions`** — Have student, status. Missing `(assignment_id, status)` for "find ungraded submissions for assignment X".
- **`exams`** — Has no listed indexes beyond the PK. Recommend `(course_id, exam_date)` and `(student_id, exam_date)` for grade history.
- **`exam_grades`** — Only UNIQUE `(exam_id, student_id)`. Recommend `(student_id, graded_at)` for student exam history.
- **`teacher_expenses`** — Has separate indexes on `teacher_id` and `expense_date`. Recommend a composite `(teacher_id, expense_date)`.
- **`teacher_subscriptions`** — Recommend `(teacher_id) WHERE is_active=true AND deleted_at IS NULL`.
- **`wayl_payment_links`** — Recommend `(teacher_id, status)` for listing a teacher's links by state.
- **`course_invoices`** / **`invoice_installments`** — `due_date` is VARCHAR(10) (see section 8) — the index is a text index, so range scans (`due_date < now()`) are lexicographic.
- **`teacher_wallet_transactions`** — Recommend `(teacher_id, created_at DESC)` for the wallet history page.
- **`booking_usage_logs`** — Recommend `(booking_id, action_type)` for per-booking timeline and `(subscription_id, action_type, created_at)` for SaaS analytics.
- **`session_audit`**, **`session_holds`** — No indexes at all. Recommend `(session_id, created_at)` on `session_audit`.

---

## 8. Data integrity findings (prioritized)

### Critical

1. **VARCHAR date columns on invoices (migration 030).** `course_invoices.invoice_date / due_date / paid_date` and `invoice_installments.due_date / paid_date` were converted from DATE to VARCHAR(10). Consequences:
   - Range queries (`due_date < CURRENT_DATE`) become lexicographic; they happen to be correct only for the strict `YYYY-MM-DD` format.
   - No date arithmetic; the app must parse to Date in JS and back.
   - The B-tree index becomes a text index — much less useful.
   - The application is now responsible for guaranteeing the exact string format on every write. Any non-conforming value silently breaks ordering.
   - This change is almost certainly a mistake. Revert with `ALTER COLUMN … TYPE DATE USING column::date`.

2. **Missing FK behavior on `teacher_referrals`.** Both `referrer_teacher_id` and `referred_teacher_id` are declared `REFERENCES users(id)` *without* `ON DELETE`, so the default is `NO ACTION`. Deleting a user that has referral rows will fail at runtime. Worse, no `ON DELETE CASCADE` means orphaned-referral cleanup is the app's problem.

3. **No `score <= max_score` enforcement on `exam_grades`.** Cross-table CHECKs aren't possible in vanilla PostgreSQL, but a trigger could enforce it. As-is, scores can be arbitrarily large.

4. **Soft-delete columns without partial indexes.** Tables with `is_deleted` or `deleted_at` that lack matching indexes include `news`, `student_grades`, `teacher_grades`, `course_invoices`, `invoice_installments`, `teacher_expenses`, `assignments`, `sessions`. Queries that filter on the soft-delete flag pay full-scan cost on the partial set, or rely on a different index plus filter.

5. **`TIMESTAMP` vs `TIMESTAMPTZ` drift.** `TIMESTAMPTZ` is used in newer migrations (010+, 013, 020+, 022+, 025+, 026+, 027, 031); `TIMESTAMP` is used in older migrations (001, 002, 007, 008, 011 (teacher_subscriptions), 012, 032, 033, 034, 035, 036, 037, 040, 039). The server is set to `Asia/Baghdad`; clients vary. Mixed columns produce subtle bugs when comparing or reporting.

6. **`ON DELETE CASCADE` flows from users to financial data.** Deleting a `users` row cascades into `course_invoices`, `invoice_installments`, `course_bookings`, `reservation_payments`, `teacher_wallets`, `teacher_wallet_transactions`, `wayl_payment_links`, and `wayl_webhook_events`. For audit-grade financial data this is dangerous. Use `ON DELETE RESTRICT` or `ON DELETE SET NULL` for ledger tables; rely on soft-delete on `users` instead.

7. **UUID generator inconsistency.** Some tables use `gen_random_uuid()` (built-in since PG 13); others use `uuid_generate_v4()` (from `uuid-ossp`). Dropping the extension would break inserts on the latter group.

### High

8. **Active-subscription uniqueness history is messy.** Migration 011 created `UNIQUE (teacher_id, is_active)` — logically wrong (only one inactive row allowed). Migration 038 replaced it with a correct partial UNIQUE. Migration 039 dropped that, allowing multiple active subscriptions. The consequence: when a booking is approved, *which* subscription's `current_students` should increment? `teacher_student_capacity` was added to centralise the count, but neither table is kept in sync by a trigger — it's the application's job, and the app code has no obvious source of truth for "the" subscription.

9. **Wayl webhook handler doesn't verify signatures.** The schema records `signature_valid` and stores `wayl_secret`, but the API audit (see `CLAUDE.md`) confirmed the webhook accepts any POST. An attacker can forge `processing_status='processed'` payloads and mark invoices paid + credit wallets.

10. **`tokens` table has no concurrent-session cap.** Every login inserts a row; only the current token is deleted at logout. A stolen JWT remains valid until its `expires_at`, even after the user logs out from another device.

11. **Plaintext OTP / reset codes in `users`.** `verification_code`, `password_reset_code` are 6-digit `VARCHAR(6)`. 1M-combination space; database leak immediately compromises every in-flight reset.

12. **Plaintext payment gateway secret.** `wayl_payment_links.wayl_secret` is TEXT. Encrypt at rest (pgcrypto, application-layer, or move to a secrets manager).

### Medium

13. **Money precision inconsistency.** `DECIMAL(10,2)` (courses, subscription_packages, reservation_payments) vs `DECIMAL(12,2)` (invoices, installments, expenses) vs `DECIMAL(14,2)` (wallets, transactions, wayl). DECIMAL(10,2) maxes at ~99M.99; safe for IQD today but inconsistent. Standardise.

14. **No `deleted_by` / `deletion_reason` on most soft-delete tables.** Only `notifications` records who deleted. For courses, invoices, subscriptions, an audit `deleted_by` is highly useful.

15. **JSONB fields have no validation.** `recipient_ids`, `data`, `hard_constraints`, `soft_constraints`, `attachments`, `resources`, `headers`, `body`, etc. — no shape constraints. Consider check constraints with `jsonb_typeof()` or move to typed columns.

16. **`notifications.type` is a 17-value VARCHAR CHECK.** Adding a new type requires a schema migration. Either move to a `notification_types` reference table or to a native ENUM (`CREATE TYPE … AS ENUM`).

17. **Latitude/longitude are unbounded.** No `CHECK (latitude BETWEEN -90 AND 90)` etc. Application bug could insert nonsensical coordinates.

18. **No idempotency outside `reference_id` UNIQUE for Wayl.** Repeated webhook deliveries are safe because the same payload re-runs the same update; but no explicit "already processed" guard exists beyond the UNIQUE on `reference_id`.

### Low

19. **Email is case-sensitive.** `users.email` is UNIQUE but PostgreSQL stores text case-sensitively. Add `CHECK (email = LOWER(email))` and lowercase on insert, or use `citext`.
20. **Index naming inconsistency.** Mix of `idx_*` and `ux_*`. No functional impact.
21. **`course.reservation_amount` correctness depends on app-level rules.** The CHECK enforces internal consistency but if `courses.price` changes after a booking, `reservation_payments.amount` is not auto-updated.

---

## 9. Migration system findings

1. **Prefix collisions (`001_`, `002_`, `011_`).** Today the alphabetical order happens to be safe (no FK violations) but the system is fragile against renames. Use a strict `NNNN_YYYYMMDDHHMM_*` convention.
2. **No transaction wrapping per migration.** The runner just `pool.query(sql)` per file. A partial failure leaves a half-applied schema. Wrap each file in `BEGIN; … COMMIT;`.
3. **No `schema_migrations` ledger.** Idempotency depends entirely on `IF NOT EXISTS` in every migration. Re-running a file with destructive DDL (`DROP`, `ALTER COLUMN TYPE`) could silently corrupt state.
4. **Filenames outside the `NNN_` convention** (`notifications.sql`, `20251003_*`, `20251025_*`, `999_*`) sort interleaved with the numeric prefixes. The longest-of-its-kind cases:
   - `20251003_*` and `20251025_*` sort lexicographically *after* `040_*` because `"2" > "0"` in the second character. Today they're applied late, which is what's intended.
   - `999_*` sorts at the very end of the 3-digit range but before the timestamp files (since `"9" < "2"...` wait — `"9" > "2"`, so `999_*` actually sorts after `20251025_*`). Verify the actual order:
     - `"040_*"` vs `"20251003_*"`: first chars `"0"` and `"2"` — `"0" < "2"` so `040_*` comes first. ✓
     - `"20251003_*"` vs `"999_*"`: `"2" < "9"` so `20251003_*` comes first. ✓
     - `"999_*"` vs `"notifications.sql"`: `"9" < "n"` so `999_*` comes first. ✓
   - Effective tail order: `040_*` → `20251003_*` → `20251025_*` → `999_*` → `notifications.sql`. **Confirmed safe today.**
5. **Mixed DDL + DML in single files.** `038`, `039`, and the tail of `011_create_teacher_subscriptions` perform `UPDATE`/`INSERT` for backfill alongside DDL. Without transactions, partial failure leaves data half-migrated.
6. **Destructive operations have no safeguards.** `029` drops `invoice_entries`; `024` drops `exams.session_id`; `030` changes column types in place. None are reversible. A `ALLOW_DESTRUCTIVE_MIGRATIONS=true` guard is reasonable.
7. **`notifications.sql` duplicates `013_*`.** Both run; `IF NOT EXISTS` makes the second a no-op. Remove the duplicate, or convert to documentation.

---

## 10. Security & multi-tenant findings

1. **No row-level security.** Anyone with database access can read across tenants. Multi-tenant isolation lives entirely in the API. Consider RLS policies keyed off a session variable for defence in depth (`teacher_id = current_setting('app.current_user_id')::uuid`).
2. **Plaintext secrets in DB:** `wayl_payment_links.wayl_secret`.
3. **Plaintext recovery codes:** `verification_code`, `password_reset_code` — even hashing them with bcrypt before insert raises the bar dramatically.
4. **Passwords are bcrypt-hashed.** Good.
5. **No rate-limit ledger in DB.** All throttling lives in `express-rate-limit` memory; if scaled to multiple instances it doesn't share state. Either move to Redis or to a DB-backed table.
6. **`tokens.token` is the full JWT stored verbatim.** Storing the JWT in plaintext is moot security-wise (JWTs are bearer tokens) but inflates the table; consider hashing the JWT and storing only the hash for matching at revocation check.
7. **OAuth identifiers are indexed but not unique.** `oauth_provider_id` has no UNIQUE constraint — duplicate accounts for the same Google user are possible. Add a UNIQUE on `(auth_provider, oauth_provider_id)` WHERE both NOT NULL.
8. **Soft-delete queries forget the filter.** Schema can't enforce "every query must include `deleted_at IS NULL`". RLS policies or filtered views are the only safety net.

---

## 11. Tech-debt summary

- **Soft-delete styles mixed.** `is_deleted` boolean (courses, course_bookings, sessions) vs `deleted_at` timestamp (users, subjects, grades, news, invoices, installments, notifications, …). Pick one — `deleted_at` is richer and a clearer truth (NULL = alive).
- **`TIMESTAMP` vs `TIMESTAMPTZ` drift** across migrations.
- **`gen_random_uuid()` vs `uuid_generate_v4()`** drift; the latter depends on `uuid-ossp`.
- **VARCHAR + CHECK enums everywhere** instead of native PostgreSQL ENUMs.
- **Money precision inconsistency** (10,2 / 12,2 / 14,2).
- **Same trigger function (`update_updated_at_column`)** declared with `CREATE OR REPLACE` in many migrations; this is harmless but creates noise — define it once and reference everywhere.
- **JSONB columns lack validation.** Acceptable for genuinely free-form data, but at least add `CHECK (jsonb_typeof(recipient_ids) IN ('array','null'))` style guards.
- **Two notification creation paths** (`013_create_notifications_tables.sql` and `notifications.sql`).
- **Function `log_booking_usage()` is defined but only called from application code,** not a trigger — sounds wasteful since the function adds nothing the app couldn't do directly.
- **`current_students` and `balance` counters are not maintained by triggers** — drift between the cached counter and the source of truth is the schema's biggest hidden correctness risk.

---

## 12. Open questions

1. Why were invoice dates converted to `VARCHAR(10)` in `030`? Was this a workaround for an ORM, timezone, or formatting bug? Document the rationale or revert.
2. After `039`, when a booking is approved, *which* subscription's `current_students` increments — and what keeps `teacher_student_capacity.current_students` in sync? Is there a trigger, a service method, or is it ad-hoc?
3. Is `teacher_referrals` truly missing FK ON-DELETE semantics, or did a later migration outside this list add them? Recommend explicit `ON DELETE` clauses.
4. Why are there two migration files creating `notifications` (`013_create_notifications_tables.sql` and `notifications.sql`)? Is one obsolete?
5. `log_booking_usage()` — who calls it? The function exists; if app code already inserts directly, remove the function to avoid drift.
6. Is `course_invoices.invoice_status` recalculated from `remaining_amount` (the generated column) anywhere, or is it set independently? Drift risk if the app writes both.
7. `clean_expired_tokens()` is defined but not scheduled in code or a cron. Is there an external scheduler, or is the function dead code?
8. Are the `intro_video_*` columns on `users` always populated together, or independently? Consider extracting them to a `user_intro_videos` table with NOT NULL constraints.
9. Should `wayl_payment_links.status` have a CHECK constraint with explicit allowed values?
10. After dropping `invoice_entries` in `029`, is anything in `src/models/` still referencing it?

---

## Status update (2026-05-15)

**This analysis was performed against the legacy 40-file migration set.** That schema has since been replaced by **32 clean migrations** (30 v2 files + 030 FK fix + 031 index pass) via the [Schema v2 consolidation plan](../.claude/plans/2026-05-15_schema-v2-consolidation.md) (status: **done**).

The migrations directory at [`src/database/migrations/`](src/database/migrations/) now contains:

| File | Purpose | Origin |
|---|---|---|
| `000_schema_migrations.sql` | Migration ledger | new in v2 |
| `001`–`029` | The 29 domain tables | v2 consolidation |
| `030_fix_course_invoices_fk_restrict.sql` | Correct a v2 drift: `course_invoices` FKs were CASCADE; now RESTRICT per plan §4 delta #5 | post-verification fix |
| `031_index_pass.sql` | 10 hot-path indexes audited from `src/models/*.ts` | index pass |

The runner [`src/database/init.ts`](src/database/init.ts) is ledger-backed (uses `schema_migrations` table). The 8 deltas in the plan §4 are applied:

- ✅ `course_invoices` / `invoice_installments` date columns back to `DATE` / `TIMESTAMPTZ` (no more VARCHAR(10)).
- ✅ All timestamps are `TIMESTAMPTZ`.
- ✅ Money columns standardised on `DECIMAL(14,2)`.
- ✅ Explicit `ON DELETE` on `teacher_referrals`, `teacher_wallets`, `teacher_wallet_transactions`, `wayl_payment_links` (financial / audit data uses `RESTRICT` from `users`).
- ✅ `gen_random_uuid()` everywhere (no more `uuid_generate_v4`).
- ✅ Shared `update_updated_at_column()` function reused; per-table copies removed.
- ✅ `schema_migrations` ledger + per-file transactions in the runner.
- ✅ Duplicate `notifications.sql` removed.

**Findings resolved by the verification + index pass (2026-05-15):**

- ✅ §7 index review — 10 missing hot-path indexes added via `031_index_pass.sql`. Total non-PK indexes: 193 (was 183 after v2 consolidation).
- ✅ §8 Critical #6 (`ON DELETE CASCADE` on financial FKs) — `course_invoices` corrected by `030_fix_course_invoices_fk_restrict.sql`. All financial tables now `RESTRICT`.

**Findings resolved by the citext email track (2026-05-15):**

- ✅ §10.5 / §8 Low #19 (case-sensitive email lookups). Migration `033_email_citext.sql` installs the `citext` extension and converts `users.email` from `VARCHAR(255)` to `CITEXT`. The previous `users_email_lowercase CHECK (email = LOWER(email))` was dropped (redundant under citext). Effects:
  - `UNIQUE(email)` is now case-insensitive at the DB layer — `Foo@Bar.com` collides with `foo@bar.com`.
  - Every `WHERE email = $1` query in `src/models/user.model.ts` (findByEmail, getAuthProviderByEmail, verifyEmail, resetPassword, etc.) is case-insensitive at the DB layer with no code change.
  - `UserModel.create()` now normalizes input via `UserModel.normalizeEmail()` (trim + lowercase) for uniform storage. Defense-in-depth — citext makes lookups work either way, but stored values are uniform for display / exports.
  - Verified: registering `Citext.Test@Foo.COM` then `CITEXT.test@FOO.com` returns "Email already exists"; login with all three casings of the same email returns 200; wrong password still 401.

**Findings resolved by the Wayl webhook hardening track (2026-05-15):**

- ✅ §8 Critical #9 + §10.2 (Wayl webhook HMAC verification). The original audit understated the state — verification was already implemented end-to-end (per-link `wayl_secret`, `HMAC-SHA256`, `crypto.timingSafeEqual`). The hardening track closed the remaining gaps:
  - The unsafe fallback `rawBody = JSON.stringify(req.body)` was removed. Missing raw body → 400 + audit row.
  - `WAYL_WEBHOOK_VERIFY_MODE` env var added (default `strict`; `warn`/`skip` for dev only).
  - Content-Length cap (`WAYL_WEBHOOK_MAX_BODY_BYTES`, default 64 KB) prevents oversized payloads on the webhook route.
  - Opt-in timestamp / freshness check via `WAYL_WEBHOOK_TIMESTAMP_HEADER` + `WAYL_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS` (off by default; Wayl protocol currently doesn't ship a timestamp).
  - Every reject path now records an audit row in `wayl_webhook_events` (previously the no-signature path skipped recording).
  - 14 smoke tests verified the full failure matrix. See `dirasiq_api/CLAUDE.md` → "Security — Wayl webhook hardening" for the test list.

**Findings resolved by the OTP hashing track (2026-05-15):**

- ✅ §10.3-§10.4 (plaintext OTP / password-reset codes; no attempt limit) — `032_hash_otp_codes.sql` widens the code columns to `TEXT` and adds attempt counters. `user.model.ts` and `auth.service.ts` were refactored so:
  - Codes are generated with `crypto.randomInt` (cryptographically secure RNG, not `Math.random`).
  - Codes are bcrypt-hashed before storage with the existing `BCRYPT_ROUNDS` env knob.
  - Verification compares with `bcrypt.compare` (constant-time).
  - Each failure increments `verification_code_attempts` / `password_reset_code_attempts`; after `OTP_MAX_ATTEMPTS` (env, default 5) the code is locked until a resend.
  - Success burns the code (sets it `NULL`) — single-use guaranteed.
  - Email-enumeration is mitigated: distinct internal reasons (`not_found` / `no_code` / `wrong`) all surface the same generic `INVALID_CODE` message.

**Findings that remain open** (postponed to follow-up tracks):

- Soft-delete style unification (`is_deleted` ↔ `deleted_at`).
- Native PostgreSQL ENUMs replacing `VARCHAR + CHECK` (only where the value set is stable).

The findings below reflect the **historical legacy schema**. Cross-reference against the current migrations when assessing whether a specific finding still applies.

---

## Related plans

- [Schema v2 consolidation plan](../.claude/plans/2026-05-15_schema-v2-consolidation.md) — **done**. Documents the 30-file design, the runner change, and the Reset Plan that shipped instead of the cutover.

## Suggested improvements (summary, for future work)

The findings above translate into the following ranked action list. None of these are implemented during this audit.

### Critical (functional / financial correctness)
- **Revert `course_invoices` and `invoice_installments` date columns to `DATE`** (or `TIMESTAMPTZ` for `paid_date`).
- **Add explicit `ON DELETE` clauses** to `teacher_referrals.referrer_teacher_id` / `referred_teacher_id` (likely `CASCADE` for the referrer, `SET NULL` for the referred to preserve audit).
- **Convert all `TIMESTAMP` columns to `TIMESTAMPTZ`** with `AT TIME ZONE 'Asia/Baghdad'` migration semantics.
- **Change `ON DELETE CASCADE` on financial tables to `RESTRICT` or `SET NULL`** (`course_invoices`, `invoice_installments`, `reservation_payments`, `teacher_wallets`, `teacher_wallet_transactions`, `wayl_payment_links`, `wayl_webhook_events`). Use soft-delete on `users` to preserve audit.
- **Verify Wayl webhook HMAC signature** at the application layer; reject when invalid and *do not* mark the row processed.
- **Hash `verification_code` and `password_reset_code` before storage.**
- **Encrypt `wayl_secret` at rest** (pgcrypto or app-layer).
- **Define triggers (or a single transaction-controlled service)** to keep `teacher_student_capacity.current_students`, `teacher_subscriptions.current_students`, and `teacher_wallets.balance` in sync with their source data.

### High (integrity / safety)
- **Add `schema_migrations` ledger table** and wrap each migration file in `BEGIN; … COMMIT;`.
- **Standardise migration filenames** to a strict `NNNN_YYYYMMDD_descr.sql` (or pure timestamp) convention; rename or merge collisions.
- **Add missing partial / composite indexes** listed in section 7.
- **Add `CHECK` on `users.latitude / longitude`** ranges.
- **Add UNIQUE on `(auth_provider, oauth_provider_id) WHERE oauth_provider_id IS NOT NULL`** in `users`.
- **Limit concurrent tokens per user** (app + `tokens` table).
- **Enforce `score <= exams.max_score` on `exam_grades`** via trigger.

### Medium (consistency / maintainability)
- Pick one soft-delete style (`deleted_at` recommended) and migrate other tables.
- Standardise money to `DECIMAL(14,2)`.
- Standardise UUID generation on `gen_random_uuid()` and drop `uuid-ossp` if possible.
- Convert string-enum CHECKs to native PostgreSQL ENUMs (`CREATE TYPE`) for fixed lists.
- Add JSONB shape constraints on critical columns (`recipient_ids`, `hard_constraints`, etc.).
- Remove the duplicate `notifications.sql` migration.

### Low (polish / future)
- Add `deleted_by`, `deleted_reason` to soft-delete tables.
- Add explicit CHECK on `wayl_payment_links.status`.
- Run `VACUUM ANALYZE` after large refactors.
- Add table/column COMMENTs for documentation in `pg_catalog`.
- Consider `citext` for `users.email`.
- Consider extracting `intro_video_*` columns into their own table.

### Scaling
- Add **partition by study_year** for `course_invoices`, `invoice_installments`, `course_bookings`, `student_evaluations`, `session_attendance`, `exam_grades`. Each is naturally time-bounded and the historical data is rarely re-read.
- Move `tokens` to Redis (or short-lived in-memory cache fed by the DB).
- Move push-notification fan-out off the DB hot path — a queue (BullMQ / pg-boss) decouples writes.
- Move uploaded artefacts (intro video segments, QR images, assignment attachments) to object storage, keep only paths in the DB.

---

**End of analysis.**
