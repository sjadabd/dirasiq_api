# dirasiq_api — Backend Analysis

> Read-only audit. No source files were modified. See [../CLAUDE.md](../CLAUDE.md) for the cross-project index.
> Schema-level analysis (migrations, tables, indexes, constraints, integrity findings) lives in [DATABASE_ANALYSIS.md](DATABASE_ANALYSIS.md).

## At a glance

- **Package name:** `mulhimiq-api` v1.0.0 (`package.json`)
- **Stack:** Node.js + TypeScript 5.3, **Express 4.21**, PostgreSQL via `pg` 8.11, JWT (`jsonwebtoken` 9), bcrypt (`bcryptjs` 2.4), **Zod 4** (Phase 1), Multer 1.4, **NodeMailer 8.0**, OneSignal Node 3.4, `node-cron` 4.2, Google Auth Library 10.3, `node-geocoder` 4.1 (OpenCage backend), Helmet 7, `express-rate-limit` 7, **pino + pino-http** (Phase 1), compression, QR Code 1.5. Removed dead deps in Phase 1.D: `joi`, `express-validator`, `@prisma/client`, `prisma`. Phase 1.E (2026-05-16) bumped `express` 4.18→4.21, `nodemailer` 6→8, dropped `morgan`, moved `supertest` to devDependencies, applied `npm audit fix` (non-force); residual audit count is **42 → 13** (the rest are dev-only ESLint v6 transitives and `onesignal-node`'s deprecated `request` chain).
- **Build/dev:** `tsc`, `nodemon` + `ts-node` (`dev` script), Jest + ts-jest, ESLint + Prettier
- **Database:** PostgreSQL — raw parameterized queries, **34 ordered `.sql` migration files** (30 v2 consolidation + `030` FK fix + `031` index pass + `032` OTP hashing + `033` email citext) run by a ledger-backed runner (`schema_migrations` table tracks applied filenames + SHA-256). The legacy 40-file set was consolidated and replaced on 2026-05-15 — see [DATABASE_ANALYSIS.md](DATABASE_ANALYSIS.md) status update and the [v2 consolidation plan](../.claude/plans/2026-05-15_schema-v2-consolidation.md).
- **Path aliases:** `@/*`, `@/config/*`, `@/controllers/*`, `@/models/*`, `@/routes/*`, `@/middleware/*`, `@/services/*`, `@/utils/*`, `@/types/*`, `@/database/*` (via `tsconfig.json` + `tsconfig-paths`)

---

## API foundation — Phase 1.A (added 2026-05-15)

Phase 1 of the [architecture-modernization plan](../.claude/plans/2026-05-15_architecture-modernization.md#phase-1--backend-foundations-2-weeks-1-engineer) introduces a single API response envelope, a single error path, and **Zod** as the only validation library. **Phase 1.A** wires the foundation in and migrates `/api/auth/*` as the reference implementation. Phase 1.B (teacher, student, super-admin, payments, notifications, public) is queued but not started.

### Response envelope — `ApiResponse<T>`

Every endpoint returns this shape:

```ts
{
  success: boolean;
  message: string;
  data?: T;                                          // present on success
  errors?: Array<{ code?: string; message: string; field?: string }>;  // present on failure
  meta?: { pagination?: { page, limit, total, totalPages }; ... };
  content_url?: string;                              // injected by middleware (legacy contract)
}
```

Build it via the helpers in [`src/utils/response.util.ts`](src/utils/response.util.ts):

- `ok(data, message?, meta?)` — success path.
- `okEmpty(message?)` — success with no payload (returns `data: null`).
- `paginated(rows, pagination, message?)` — list endpoints; wraps `ok()` + `meta.pagination`.
- `fail(message, errors?)` — used internally by the error handler; controllers should `throw` instead.

The `content_url` field is preserved at the top level by the post-serialize wrapper in [`src/index.ts`](src/index.ts) (clients depend on it for resolving relative asset paths).

### Error path — `ApiError` + global handler

Controllers signal failure by **throwing**. The global error middleware ([`src/middleware/error.middleware.ts`](src/middleware/error.middleware.ts)) catches everything, translates to the canonical `fail()` shape, and logs through pino:

```ts
throw new ApiError(404, 'الطالب غير موجود', ErrorCodes.NOT_FOUND);
throw new ApiError(400, 'فشل في التحقق', ErrorCodes.VALIDATION_ERROR, { fields });
```

Convenience factories live in [`src/utils/api-error.ts`](src/utils/api-error.ts): `badRequest`, `unauthorized`, `forbidden`, `notFound`, `conflict`, `internal`, `validationFailed`.

Special cases the global handler maps automatically:

| Thrown | Mapped to |
|---|---|
| `ApiError` | its own status + code |
| `ZodError` (escapes `validate()`) | 400 `VALIDATION_ERROR` |
| `jwt.TokenExpiredError` | 401 `TOKEN_EXPIRED` |
| `jwt.JsonWebTokenError` | 401 `TOKEN_INVALID` |
| Postgres unique-violation (code `23505`) | 409 `ALREADY_EXISTS` |
| Anything else | 500 `INTERNAL_ERROR` (stack in dev only) |

### Error codes — the stable contract for clients

Defined in [`src/utils/api-error.ts`](src/utils/api-error.ts) as `ErrorCodes`. Use them as the second-to-last argument when constructing `ApiError`. Never rename without a coordinated client update.

| Group | Codes |
|---|---|
| Validation | `VALIDATION_ERROR`, `INVALID_REQUEST`, `MISSING_FIELD` |
| Auth | `UNAUTHORIZED`, `INVALID_CREDENTIALS`, `TOKEN_EXPIRED`, `TOKEN_INVALID`, `ACCOUNT_INACTIVE`, `EMAIL_NOT_VERIFIED`, `EMAIL_ALREADY_EXISTS`, `PROVIDER_MISMATCH`, `USER_TYPE_MISMATCH` |
| OTP | `INVALID_CODE`, `CODE_EXPIRED`, `CODE_LOCKED` |
| Authorization | `FORBIDDEN`, `ROLE_REQUIRED` |
| Resource | `NOT_FOUND`, `CONFLICT`, `ALREADY_EXISTS`, `ALREADY_PROCESSED` |
| Business | `BUSINESS_RULE`, `CAPACITY_EXCEEDED`, `INSUFFICIENT_FUNDS`, `SUPER_ADMIN_EXISTS` |
| Payments | `PAYMENT_SIGNATURE_INVALID`, `PAYMENT_AMOUNT_MISMATCH` |
| Rate limiting | `RATE_LIMITED` |
| External | `EMAIL_SEND_FAILED`, `GEOCODING_FAILED` |
| Catch-all | `INTERNAL_ERROR`, `SERVICE_UNAVAILABLE` |

Validation errors carry per-field detail in the `errors[]` array:

```json
{
  "success": false,
  "message": "فشل في التحقق من البيانات",
  "errors": [
    { "code": "invalid_format", "field": "body.email",    "message": "البريد الإلكتروني غير صحيح" },
    { "code": "invalid_type",   "field": "body.password", "message": "Invalid input: expected string, received undefined" }
  ]
}
```

`field` is dotted (`body.email`, `params.id`, `query.page`), matching where the value lives in the request.

### Validation — Zod via `validate({...})`

Routes declare their input contract by importing a Zod schema and wrapping the route with `validate({ body, params, query, files })`:

```ts
import { validate } from '../middleware/validate.middleware';
import { loginSchema } from '../schemas/auth.schemas';
import { asyncHandler } from '../utils/async-handler';
import { AuthController } from '../controllers/auth.controller';

router.post(
  '/login',
  validate({ body: loginSchema }),
  asyncHandler(AuthController.login),
);
```

The validator:
- Parses each section (body, params, query, files) against its schema.
- On success **replaces** `req.body` / `req.params` / `req.query` with the **parsed** (coerced, trimmed, transformed) values. Handlers receive numbers as numbers, lowercased emails, ISO-formatted birthDates, etc.
- On failure throws `ApiError(400, …, VALIDATION_ERROR, { fields })`. Handlers never see invalid input.

Auth-specific schemas live in [`src/schemas/auth.schemas.ts`](src/schemas/auth.schemas.ts) — `loginSchema`, `registerTeacherSchema`, `registerStudentSchema`, `verifyEmailSchema`, `resetPasswordSchema`, `googleAuthSchema`, `appleAuthSchema`, etc. Reusable building blocks (`emailSchema`, `passwordWeakSchema`, `passwordStrongSchema`, `otpCodeSchema`, `studyYearSchema`, `birthDateSchema`, …) are exported for use in other schema files.

> **Note on `completeProfile` / `updateProfile`:** these endpoints choose between a `teacher` and `student` schema based on `req.user.userType`, which is populated by `authenticateToken`. Because middleware runs in declaration order, the validation can't sit on the route — it lives inside the controller (see [`src/controllers/auth.controller.ts`](src/controllers/auth.controller.ts)). This pattern is intentional and acceptable when the schema choice depends on the authenticated user.

### asyncHandler + thin controllers

Controllers no longer try/catch and no longer write `res.status(...).json(...)` directly. They:

1. Read `req.body` (Zod-coerced).
2. Call the service layer.
3. On success: `res.status(...).json(ok(data, message))`.
4. On failure: `throw new ApiError(...)`.

The `asyncHandler` wrapper in [`src/utils/async-handler.ts`](src/utils/async-handler.ts) catches any rejected promise and forwards it to the error middleware. Every route uses it.

### Service-layer bridge — removed in Phase 1.C

Earlier phases used a temporary helper, `unwrapServiceResult`, to translate legacy `{success:false}` service returns to `ApiError` throws at the controller boundary. Phase 1.C migrated every service to throw `ApiError` directly, and `src/utils/unwrap-service.ts` was deleted. Controllers now call services and `res.json(ok(data, message))` on success — failures bubble straight through the global error middleware.

### Request ID — every request, every log line

A new middleware ([`src/middleware/request-id.middleware.ts`](src/middleware/request-id.middleware.ts)) runs first in the chain. It accepts an inbound `X-Request-ID` header (4–128 chars, restricted character set) or generates a fresh `crypto.randomUUID()`. The id is exposed back to the client via the `X-Request-ID` response header and also via the CORS `Access-Control-Expose-Headers` allowlist so browser-side fetch can read it. The pino-http request logger (`req.log`) is bound to this id, so every log line emitted during the request carries `req.id`.

### Structured logging — pino + pino-http

`console.error` / `console.warn` / `console.log` are forbidden in new code. Use:

- `import { logger } from '@/utils/logger'` for global logs (startup, cron, etc.).
- `req.log.info(...)` / `req.log.warn(...)` / `req.log.error(...)` inside request handlers — already bound to the request id.

`logger` redacts secrets (`password`, `token`, `accessToken`, `req.headers.authorization`, `cookie`, …) before serialization. Pretty-printing is on in development; production emits one JSON line per event.

The old `morgan` access log was removed; `pino-http` replaces it with a single structured entry per request including method, url, status, and response time, at `info` (2xx/3xx) / `warn` (4xx) / `error` (5xx).

### Role enforcement helper — `requireRole`

`authenticateToken` populates `req.user`. Use `requireRole(...types)` at the router level rather than per handler:

```ts
import { authenticateToken, requireRole } from '@/middleware/auth.middleware';
import { UserType } from '@/types';

router.use(authenticateToken, requireRole(UserType.TEACHER));
```

The named `requireSuperAdmin` / `requireTeacher` / `requireStudent` wrappers still exist; they delegate to `requireRole` and are kept so the not-yet-migrated routes keep working unchanged.

### Pagination helpers

[`src/utils/pagination.ts`](src/utils/pagination.ts) exports:

- `parsePagination(query)` → `{ page, limit, offset }` (defaults `page=1`, `limit=20`; cap `limit≤100`).
- `buildPaginationMeta(total, page, limit)` → `{ page, limit, total, totalPages }`.
- `paginationQuerySchema` — Zod schema for `?page=&limit=`, ready to compose into per-route query schemas.

Pattern:

```ts
import { paginated } from '@/utils/response.util';
import { parsePagination, buildPaginationMeta } from '@/utils/pagination';

const { page, limit, offset } = parsePagination(req.query);
const { rows, total } = await CourseModel.findAll({ offset, limit });
res.json(paginated(rows, buildPaginationMeta(total, page, limit)));
```

### What ships in Phase 1.A vs. what's still pending

| Status | Surface |
|---|---|
| ✅ Phase 1.A | `/api/auth/*` (13 handlers); foundations (response envelope, ApiError, error middleware, Zod validate(), asyncHandler, request id, pino logger, pagination helpers, requireRole) |
| ✅ Phase 1.B-1 | `/api/teacher/*` (20 sub-routes, ~85 handlers across 18 controllers) — see dedicated section below |
| ✅ Phase 1.B-2 | `/api/student/*` (12 sub-routes, ~30 handlers across 11 controllers) — see dedicated section below |
| ✅ Phase 1.B-3 | super-admin (`/api/super-admin/*`, `/api/academic-years/*`, `/api/grades/*`, `/api/news/*`, `/api/subscription-packages/*`), `/api/notifications/*`, `/api/user/*`, `/api/payments/wayl/*`, `/api/public/news`, `/api/teacher-search/*` — see dedicated section below |
| ✅ Phase 1.C | service-layer refactor — every service throws `ApiError` directly; `unwrapServiceResult` removed — see dedicated section below |
| ✅ Phase 1.D | dependency cleanup — `joi`, `express-validator`, `@prisma/client`, and the `prisma` CLI removed from `package.json` and both lockfiles |
| ✅ Phase 1.E | dependency security hardening — express 4.18→4.21, nodemailer 6→8, morgan removed, supertest moved to devDeps, `npm audit fix` applied; 42→13 vulns |

**Phase 1.B is complete.** Every HTTP surface speaks the canonical envelope, validates via Zod, and routes errors through the global handler. The remaining drift is the service layer (Phase 1.C — services still return `{success:false}` instead of throwing `ApiError`) and the dead `joi`/`express-validator` deps in `package.json`.

### Smoke tests + Jest

- [`src/test/envelope.test.ts`](src/test/envelope.test.ts) — wire-level tests for the new envelope, validation errors, 404 path, request-id propagation, bootstrap-gated route. **8/8 passing**, runs without a database.
- [`src/test/teacher-envelope.test.ts`](src/test/teacher-envelope.test.ts) — Phase 1.B-1 router-level auth gate, junk-token rejection, blanket-401 sweep across all 18 teacher sub-routes, canonical 404. **4/4 passing**, runs without a database.
- [`src/test/student-envelope.test.ts`](src/test/student-envelope.test.ts) — Phase 1.B-2 router-level auth gate, junk-token rejection, blanket-401 sweep across every student sub-route (GET / POST / DELETE), canonical envelope. **3/3 passing**, runs without a database.
- [`src/test/phase1b3-envelope.test.ts`](src/test/phase1b3-envelope.test.ts) — Phase 1.B-3 public endpoints (public news, teacher-search, `/grades/all-student`), blanket-401 sweep across the super-admin + notifications + user-onesignal surface, Wayl webhook validation gates (Zod `referenceId` requirement vs. Wayl-compatible "Missing signature" response). **6/6 passing**, runs without a database.
- [`src/test/auth.test.ts`](src/test/auth.test.ts) — integration tests against the running auth flow. Gated behind `TEST_DB_ENABLED=1` because they need a seeded local Postgres. **3/3 properly skipped** today; enable when the test DB is set up.

Run with `npm test`.

---

## API foundation — Phase 1.B-1 (teacher surface, added 2026-05-16)

Phase 1.B-1 migrates **all of `/api/teacher/*`** (20 sub-routes, ~85 handlers across 18 controllers, ~6 944 lines of legacy code) to the Phase 1.A pattern. The same invariants apply: one envelope, one error path, one validation library (Zod), router-level role enforcement, asyncHandler on every route, no `try/catch` boilerplate, no `console.*`.

### Router-level role enforcement

[`src/routes/teacher/index.ts`](src/routes/teacher/index.ts) now applies the auth + role middleware at the top:

```ts
router.use(authenticateToken, requireRole(UserType.TEACHER));
```

Every sub-route mounted under `/api/teacher/*` inherits both. The per-handler `authenticateToken, requireTeacher` calls (previously repeated 30+ times across the sub-route files) are gone. Verified behaviour:

- Anonymous → 401 `UNAUTHORIZED`.
- Junk bearer → 401 `TOKEN_INVALID`.
- Super-admin token → 403 `ROLE_REQUIRED`.
- Teacher token → handler runs (with full `req.user` populated).

### Shared schemas

[`src/schemas/common.schemas.ts`](src/schemas/common.schemas.ts) — primitives reused across domains:

- IDs / params: `uuidSchema`, `idParamSchema`, `courseIdParamSchema`, `sessionIdParamSchema`, `invoiceIdParamSchema`, `bookingIdParamSchema`, `teacherIdParamSchema`, `studentIdParamSchema`, `assignmentGradeParamsSchema`, `examGradeParamsSchema`, `assignmentSubmissionParamsSchema`.
- Values: `studyYearSchema` (`YYYY-YYYY`), `moneySchema`, `positiveMoneySchema`, `isoDateSchema`, `isoDateTimeSchema`, `hhmmTimeSchema`, `weekdaySchema` (0–6).
- Pagination: `paginationQuerySchema`.
- Permissive query helpers that turn `'null'` / `'undefined'` / `''` from un-cleared dashboard filters into `undefined` and accept the rest: `optionalString`, `optionalUuid`, `optionalStudyYear`, `optionalBooleanQuery`.

[`src/schemas/teacher.schemas.ts`](src/schemas/teacher.schemas.ts) — per-domain bodies and queries (~30 exported schemas covering expense, wallet, report, subject, course, course-booking, session, assignment, exam, evaluation, notification, roster, invoice, payment, Wayl). Inferred types are NOT yet shared with the dashboard / Flutter — that's a Phase 2 / 3 cross-stack concern.

### Migrated controllers and the patterns each enforces

| Sub-route | Controller | Lines | Notable patterns this migration enforces |
|---|---|---|---|
| `/courses` | `course.controller.ts` | 367 → 100 | Single endpoint family with reservation-amount cross-field check |
| `/subjects` | `subject.controller.ts` | 310 → 85 | Soft-delete + restore + hard-delete trio behind ownership |
| `/bookings` | `course-booking.controller.ts` | 681 → 290 | Status-transition state machine; ownership re-check before `pre_approved → confirmed` and `rejected → pre_approved` |
| `/sessions` | `session.controller.ts` | 869 → 410 | Multi-weekday bulk creation, attendance bulk-upsert, conflict detection; helper `ensureOwnership` enforces teacher-scoped lookups |
| `/students` + `/roster` | `roster.controller.ts` | 364 → 150 | Pagination + free-text search; ownership checks for course-scoped and session-scoped lists |
| `/assignments` | `assignment.controller.ts` | 712 → 410 | Base64 attachment processing; visibility (`all_students` vs `specific_students`) recipient flow; soft-delete cascades to notifications |
| `/exams` | `exam.controller.ts` | 268 → 200 | Exam-session linking; score-bounds check at grading time |
| `/evaluations` | `student-evaluation.controller.ts` | 253 → 215 | Bulk upsert; multi-source targeted-student SQL (sessions ∪ course bookings) |
| `/invoices` | `invoice.controller.ts` | 823 → 425 | Money-shape preservation; installment workflow; service-error → HTTP mapping helper (`mapServiceMutationError`) |
| `/payments` | `payment.controller.ts` + `wayl-payment.controller.ts` | 293+294 → 200+170 | Wayl link creation with full audit-log persistence; `mapWaylError` translates Wayl strings into stable error codes |
| `/notifications` | `notification.controller.ts` | 486 → 280 | Recipient-mode dispatch (specific / course / session / all); attachment uploads; ownership-on-delete |
| `/dashboard` | `dashboard.controller.ts` | 338 → 220 | Big aggregate queries unchanged; output wrapped through `ok()` |
| `/expenses` | `expense.controller.ts` | 80 → 80 | List endpoint preserves legacy `summary` via `meta.summary` |
| `/wallet` | `wallet.controller.ts` | 64 → 30 | Reference for tiny controllers |
| `/reports/financial` | `report.controller.ts` | 97 → 95 | Same SQL; unwrap via `ok()` |
| `/profile/intro-video` | `profile.controller.ts` | 152 → 95 | Multer file upload preserved (1 GB cap, video-mime filter); status flips on transcode failure |
| `/academic-years` | `academic-year.controller.ts` | 18 → 12 | Reference for "no validation, just service" controllers |
| `/subscription-packages` | (super-admin controller, untouched) | — | Routes wrap legacy handlers in `asyncHandler`; controller migration deferred to Phase 1.B-3 (shared with super-admin) |

Aggregate: **~6 944 → ~3 850 lines** in `src/controllers/teacher/` and **~456 → ~510 lines** in `src/routes/teacher/` (routes grew slightly because each route now imports its schema). Net reduction: about **45%** of teacher controller code.

### Smoke tests verified live (2026-05-16)

| Test | Expected | Result |
|---|---|---|
| Anonymous GET `/api/teacher/dashboard` | 401 UNAUTHORIZED | ✅ |
| Bad bearer GET `/api/teacher/dashboard` | 401 TOKEN_INVALID | ✅ |
| Super-admin bearer GET `/api/teacher/dashboard` | 403 ROLE_REQUIRED | ✅ |
| Teacher bearer GET `/api/teacher/dashboard` | 200 + canonical envelope | ✅ |
| Teacher bearer GET `/api/teacher/academic-years` | 200 + `data: { years, active }` | ✅ |
| Teacher bearer GET `/api/teacher/courses?page=1&limit=5` | 200 + `data: []` (no courses yet) | ✅ |
| Teacher bearer GET `/api/teacher/wallet` | 200 + `data: { balance: 0 }` | ✅ |
| Teacher bearer GET `/api/teacher/wallet/transactions?page=1&limit=5` | 200 + `meta.pagination` | ✅ |
| Teacher bearer GET `/api/teacher/sessions?page=1&limit=5` | 200 + `meta.pagination` | ✅ |
| Teacher bearer GET `/api/teacher/invoices` (no studyYear) | 400 VALIDATION_ERROR field `query.studyYear` | ✅ |
| Teacher bearer GET `/api/teacher/bookings/stats/summary` (no studyYear) | 400 VALIDATION_ERROR field `query.studyYear` | ✅ |
| Teacher bearer POST `/api/teacher/courses` with empty body | 400 with `errors[].field` for every missing field | ✅ |

### Subscription-package note

`/api/teacher/subscription-packages/*` uses a **mixed-auth contract** (revised 2026-05-16 after a regression broke the public landing/pricing page):

| Method + path | Auth required? | Why |
|---|---|---|
| `GET /active` | **No** — public | The marketing / pricing landing page lists plans to guests. |
| `GET /:id` | **No** — public | Same audience — package details for guests. |
| `POST /:id/activate` | **Yes** — TEACHER | Subscribes `req.user.id` to the package; needs an authenticated teacher. |

Implementation: the sub-router is mounted in `routes/teacher/index.ts` **before** the parent `router.use(authenticateToken, requireRole(TEACHER))` line, so it does not inherit the parent gate. Each route inside `subscription-package.routes.ts` declares its own middleware — the public reads have none; the `POST /:id/activate` mutation declares `authenticateToken, requireRole(TEACHER)` itself.

The earlier Phase 1.B-1 design applied the role gate at the router level uniformly. That was the right default but it accidentally blocked guests on the pricing page. The pattern above keeps the "uniform default" intent (everything else under `/api/teacher/*` still inherits the parent gate) while accommodating the one sub-route that has a mixed audience by design.

Verified by [`src/test/teacher-envelope.test.ts`](src/test/teacher-envelope.test.ts) — three new tests cover the public reads return 200 and the mutation still returns 401 without a token.

### What was NOT changed

- Service-layer ownership checks (`AND teacher_id = $userId`) inside `*.service.ts` — unchanged. Controllers continue to rely on the service to enforce ownership at the SQL layer. A few controller-side ownership re-checks (`ensureOwnership` in session, `requireOwnership` in assignment / exam / evaluation) were kept because they short-circuit before the service runs and produce cleaner error codes.
- Notification side-effects — every controller still calls `notificationService.createAndSendNotification(...)` in `try`/`catch` and logs warnings on failure via `req.log` (Phase 1.A's pino-http binding). Best-effort, never blocks the success path.
- Email / OneSignal integration — same.
- The super-admin-side subscription-package controller — see note above.

---

## API foundation — Phase 1.B-2 (student surface, added 2026-05-16)

Phase 1.B-2 migrates **all of `/api/student/*`** (12 sub-routes, ~30 handlers across 11 controllers, ~1 811 lines of legacy code) to the Phase 1 pattern. Same invariants as Phase 1.B-1.

### Router-level role enforcement

[`src/routes/student/index.ts`](src/routes/student/index.ts) now applies the auth + role middleware at the top:

```ts
router.use(authenticateToken, requireRole(UserType.STUDENT));
```

Every sub-route mounted under `/api/student/*` inherits both. The previous mix (`router.use(authenticateToken)` per sub-router, plus `requireStudent` per route) is gone. The inline `DELETE /api/student/account` handler that lived in the index was migrated to the new envelope and uses `asyncHandler` like everything else.

### Schemas

[`src/schemas/student.schemas.ts`](src/schemas/student.schemas.ts) — domain-specific bodies and queries (~22 exported schemas covering course, booking, enrollment, attendance, search, teacher discovery, assignment, exam, evaluation, invoice). Reuses everything in `common.schemas.ts` (UUIDs, money, dates, pagination, permissive optional helpers).

### Migrated controllers

| Sub-route | Controller | Lines | Notable patterns this migration enforces |
|---|---|---|---|
| `/dashboard` | `dashboard.controller.ts` | 39 → 18 | Reference for "service returns ApiResponse → unwrap → ok()" pattern |
| `/search/unified` | `search.controller.ts` | 56 → 25 | Zod-coerced query params; explicit per-key copying so the service contract stays unchanged |
| `/teachers` | `teacher.controller.ts` | 84 → 50 | `/suggested` + `/:teacherId/subjects-courses`; the third route (`/:teacherId/intro-video`) cleanly reuses the Phase 1.B-1 `TeacherProfileController.getTeacherIntroVideo` |
| `/courses` | `course.controller.ts` | 111 → 60 | Two paths into "suggested courses" (with vs without student location) — both flow through `unwrapServiceResult` so failures surface as `ApiError` |
| `/evaluations` | `student-evaluation.controller.ts` | 43 → 45 | Ownership check rewritten as cleaner 404/403 via `ApiError`; pagination via `paginated()` |
| `/exams` | `exam.controller.ts` | 112 → 90 | `/report/by-type` mounted before `/:id` to avoid the dynamic matcher swallowing it |
| `/invoices` | `invoice.controller.ts` | 89 → 55 | Legacy `data: { invoices, report, page, limit }` shape preserved verbatim — Flutter consumes both fields |
| `/enrollments` | `enrollment.controller.ts` | 133 → 80 | Active-academic-year guard turns into a clean 400 BUSINESS_RULE; weekly-schedule routes all share `weeklyScheduleQuerySchema` |
| `/assignments` | `assignment.controller.ts` | 251 → 240 | Visibility + active-year + due-window enforcement keeps the controller-side guards because each one maps to a distinct error code; `mySubmission` block above legacy comment kept |
| `/bookings` + `/course-bookings` | `course-booking.controller.ts` | 519 → 280 | State-machine error mapper (`mapReactivateError`, `mapCreateBookingError`) translates ~12 distinct service messages to stable ApiErrors with `suggestion` / `action` / `currentStatus` hints in `details` so Flutter UX is preserved |
| `/attendance` | `attendance.controller.ts` | 149 → 100 | QR check-in flow; teacher + student notifications stay fire-and-forget; helper `to12hFromISO` for the Arabic time format |

Aggregate: **~1 811 → ~1 110 lines** in `src/controllers/student/` and **~252 → ~280 lines** in `src/routes/student/` (routes grow because each one imports + wires a Zod schema). Net reduction: **~39%** of student controller code.

### Strict ownership

Every student endpoint that touches a row enforces ownership through one of:

1. **Service-layer SQL** (`AND student_id = $userId`) — preserved unchanged from the legacy controllers.
2. **Controller `requireOwnership`-style guard** — used in evaluation and booking-by-id where the service returns a row first and the controller checks `row.student_id === req.user.id` before responding. Mismatches throw `ApiError(404, …, NOT_FOUND)` rather than 403 to avoid leaking the existence of someone else's data (matches the legacy "لا يوجد حجز موجود" behaviour).
3. **Visibility check** — assignments with `visibility = 'specific_students'` check the recipients list; non-recipients get 404 instead of 403 for the same reason.

### State-machine error mapping (bookings)

The legacy student booking controller had ~12 distinct error branches with bespoke `suggestion` / `action` / `currentStatus` fields. The new `mapReactivateError` + `mapCreateBookingError` helpers preserve **every** legacy hint by stuffing them into `ApiError`'s `details` field. The global error middleware passes `details` through untouched on the wire, so Flutter clients that already read `suggestion` / `action` keep working.

| Service error | New ApiError | Hint preserved |
|---|---|---|
| `'Course not found'` | 404 NOT_FOUND | — |
| `'Student grade not eligible for this course'` (or `STUDENT_GRADE_MISMATCH`) | 400 BUSINESS_RULE | — |
| `'Booking already exists for this course'` (or pg `23505 unique_student_course_booking`) | 409 ALREADY_EXISTS | `suggestion`, `action` |
| `'Booking is already active and pending'` / `'…approved and active'` | 400 BUSINESS_RULE | `suggestion`, `action` |
| `'Cannot reactivate rejected bookings…'` | 400 BUSINESS_RULE | `suggestion`, `action` |
| `'Cannot reactivate booking with status: X'` | 400 BUSINESS_RULE | `currentStatus`, `suggestion`, `action` |
| `'Cannot reactivate bookings cancelled by teacher'` | 403 FORBIDDEN | — |
| `'Course is no longer available'` | 400 BUSINESS_RULE | — |
| `'Course has already ended'` | 400 BUSINESS_RULE | `suggestion` |
| `'لا يوجد اشتراك فعال للمعلم'` | 400 BUSINESS_RULE | `suggestion` |
| `'انتهت صلاحية الاشتراك'` | 400 BUSINESS_RULE | `suggestion` |
| `'الباقة ممتلئة. لا يمكنك قبول طلاب إضافيين'` | 400 CAPACITY_EXCEEDED | `suggestion` |

Reactivate also preserves a `courseEndedWarning` field on success — surfaced under `meta.warning` so the Flutter sheet still pops up.

### Smoke tests verified live (2026-05-16)

| Test | Expected | Result |
|---|---|---|
| Anonymous GET `/api/student/dashboard/overview` | 401 UNAUTHORIZED | ✅ |
| Junk-token GET `/api/student/courses/suggested` | 401 TOKEN_INVALID | ✅ |
| Teacher bearer GET `/api/student/dashboard/overview` | 403 ROLE_REQUIRED | ✅ |
| Student bearer GET `/api/student/dashboard/overview` | 200 + canonical envelope | ✅ |
| Student bearer GET `/api/student/courses/suggested` (no active grade) | 404 NOT_FOUND | ✅ |
| Student bearer GET `/api/student/bookings` (missing studyYear) | 400 VALIDATION_ERROR field `query.studyYear` | ✅ |
| Student bearer POST `/api/student/bookings` empty body | 400 VALIDATION_ERROR field `body.courseId` | ✅ |
| Student bearer GET `/api/student/teachers/suggested` | 200 + canonical envelope listing teachers | ✅ |
| Student bearer GET `/api/student/enrollments/schedule` | 200 + `data: []` | ✅ |
| Student bearer GET `/api/student/courses/not-a-uuid` | 400 VALIDATION_ERROR field `params.id` (`invalid_format`) | ✅ |

### What was NOT changed

- Service-layer ownership checks inside `student.service.ts`, `invoice.service.ts`, etc. — unchanged. Both layers continue to defend in depth (controller `requireOwnership` guard + service `AND student_id = …` filter).
- The reused `TeacherProfileController.getTeacherIntroVideo` for `/api/student/teachers/:teacherId/intro-video` — already migrated in Phase 1.B-1, no changes here.
- Reused `CourseBookingService` (lives on the teacher side; both student + teacher controllers call it).
- Assignment submission notifications — still fire-and-forget, never block the success path.

---

## API foundation — Phase 1.B-3 (super-admin, notifications, payments, public, user, teacher-search, added 2026-05-16)

Phase 1.B-3 closes out the Phase 1.B HTTP migration by porting every remaining endpoint to the Phase 1 pattern. **Together with 1.A / 1.B-1 / 1.B-2, the entire `/api/*` surface now speaks the canonical envelope.**

### Surfaces migrated

| Mount | Files | Role contract |
|---|---|---|
| `/api/super-admin/dashboard/*` | `routes/super_admin/dashboard.routes.ts` + `controllers/super_admin/dashboard.controller.ts` | router-level `requireRole(SUPER_ADMIN)` |
| `/api/super-admin/teachers/*` | `routes/super_admin/teacher.routes.ts` + `controllers/super_admin/teacher.controller.ts` | router-level `requireRole(SUPER_ADMIN)`; pagination via `paginated()` |
| `/api/super-admin/settings/*` | `routes/super_admin/settings.routes.ts` + `controllers/super_admin/settings.controller.ts` | router-level `requireRole(SUPER_ADMIN)` |
| `/api/academic-years/*` | `routes/super_admin/academic-year.routes.ts` + `controllers/super_admin/academic-year.controller.ts` | router-level `requireRole(SUPER_ADMIN)`; static `/active` ordered before `/:id` |
| `/api/grades/*` | `routes/super_admin/grade.routes.ts` + `controllers/super_admin/grade.controller.ts` | **mixed-role per route**: `/all-student` PUBLIC, `/all` + `/my-grades` any authenticated user, the rest super-admin |
| `/api/news/*` | `routes/super_admin/news.routes.ts` + `controllers/super_admin/news.controller.ts` | **mixed-role per route**: read endpoints any authenticated user, write endpoints super-admin; base64 image upload + delete preserved |
| `/api/subscription-packages/*` | `routes/super_admin/subscription-package.routes.ts` + `controllers/super_admin/subscription-package.controller.ts` | router-level `requireRole(SUPER_ADMIN)`. The teacher mount at `/api/teacher/subscription-packages` reuses the same controller (its router gates on `TEACHER`); the controller adapts based on `req.user.userType` |
| `/api/notifications/*` | `routes/notification.routes.ts` + `controllers/notification.controller.ts` | mixed: send endpoints `allowAdminOrTeacher`; admin listings `allowAdminOnly`; self-service (`/user/my-notifications`, `/:id/read`) any authenticated user |
| `/api/user/onesignal-*` | `routes/user-onesignal.routes.ts` + `controllers/user-onesignal.controller.ts` (NEW) | any authenticated user; `/onesignal-status/:userId` super-admin only (controller-side check) |
| `/api/teacher-search/*` | `routes/teacher-search.routes.ts` + `controllers/teacher-search.controller.ts` | **PUBLIC** (no auth) — used by marketing pages and Flutter onboarding before the user has a token |
| `/api/public/news` | `routes/public/news.routes.ts` + `controllers/public/news.controller.ts` (NEW) | **PUBLIC** |
| `/api/payments/wayl/webhook` | `routes/payments/wayl.routes.ts` + `controllers/payments/wayl-webhook.controller.ts` | **PUBLIC** (called by Wayl); response shape intentionally untouched (Wayl-compatible) |

Aggregate code change: **~3 763 → ~2 700 lines** across the surface (~28% reduction). The notification controller alone collapsed from 820 → 380 lines by extracting one `persistAttachments` helper that had been inlined 4 times. Two new controllers (`user-onesignal.controller.ts`, `public/news.controller.ts`) move inline route handlers out of route files.

### New schemas

- [`src/schemas/super-admin.schemas.ts`](src/schemas/super-admin.schemas.ts) — academic-year, grade, news (including `newsType` enum), settings, super-admin teacher listing, subscription package (create / update / list).
- [`src/schemas/notification.schemas.ts`](src/schemas/notification.schemas.ts) — broadcast bodies, specific-recipient bodies, template bodies, listing query, self-service query. Mirrors the legacy `notificationValidation` rules but expressed declaratively.
- [`src/schemas/misc.schemas.ts`](src/schemas/misc.schemas.ts) — OneSignal player-id updates, teacher-search coordinates / location queries (the `refine` ensures at least one of `governorate` / `city` / `district` is present), governorate path param, and the minimal `waylWebhookBodySchema` requiring `referenceId`.

### Wayl webhook — what we DID and didn't change

Wayl's webhook protocol expects a specific response shape (`{success, message}` plus a small set of status-specific fields, no `errors[]` array). Changing the wire contract risks breaking payment fulfilment, and the Phase-0 HMAC-hardened controller already returns the correct HTTP status codes and shapes that 14/14 smoke tests previously verified.

So Phase 1.B-3 **only** added two safety nets at the route layer:

1. `validate({ body: waylWebhookBodySchema })` — a permissive Zod gate that just requires `referenceId`. Malformed payloads short-circuit with the canonical 400 `VALIDATION_ERROR` envelope BEFORE the HMAC check runs.
2. `asyncHandler` — unexpected throws inside the controller now flow to the global error middleware instead of leaving the request hanging.

The controller's response shape (e.g. `{success:false, message:"Missing signature"}` on a no-signature request) is preserved verbatim. Test V in the live smoke matrix exercises both: a missing `referenceId` returns the canonical envelope (Zod rejection), but a present-but-fake `referenceId` with no signature header returns the Wayl-compatible shape (controller emission).

### Notification role gating

Replaced the inline `(req, res, next) => { if (userType === ...) next(); else res.status(403).json(...); }` pattern (repeated 7 times in the legacy router) with two named middlewares exported from `notification.controller.ts`:

- `allowAdminOrTeacher` — `super_admin` or `teacher` only. Used by the five `/send-*` endpoints.
- `allowAdminOnly` — `super_admin` only. Used by `GET /`, `GET /statistics`, `POST /process-pending`, `DELETE /:id`.

Both throw `ApiError(403, ..., ROLE_REQUIRED)` so the canonical envelope flows through the global error middleware. The legacy implementation wrote `res.status(403).json({...})` directly with no error code.

### Mixed-role routes (grades + news)

`/api/grades` and `/api/news` had the legacy "apply middleware at different positions" trick (`router.use(authenticateToken); ...; router.use(requireSuperAdmin); ...`) which is order-sensitive and easy to break. Replaced with explicit per-route middleware composition:

```ts
const adminOnly = [authenticateToken, requireRole(UserType.SUPER_ADMIN)] as const;

router.get('/all-student', asyncHandler(GradeController.getAllActive));            // public
router.get('/all', authenticateToken, asyncHandler(GradeController.getAllActive)); // any auth
router.post('/', ...adminOnly, validate({ body: gradeCreateSchema }), ...);        // super-admin
```

This is harder to mis-read than the legacy ordering trick.

### Smoke tests verified live (2026-05-16)

| Test | Expected | Result |
|---|---|---|
| GET `/api/public/news` (no auth) | 200 + canonical envelope | ✅ |
| GET `/api/teacher-search/governorates` (no auth) | 200 + governorate list | ✅ |
| GET `/api/teacher-search/search/coordinates` (no auth, no params) | 400 VALIDATION_ERROR field `query.latitude` + `query.longitude` | ✅ |
| GET `/api/teacher-search/search/coordinates?latitude=33.3&longitude=44.4` | 200 + canonical envelope | ✅ |
| GET `/api/grades/all-student` (no auth, intentionally public) | 200 + canonical envelope | ✅ |
| GET `/api/super-admin/dashboard/stats` (no auth) | 401 UNAUTHORIZED | ✅ |
| GET `/api/notifications/user/my-notifications` (no auth) | 401 UNAUTHORIZED | ✅ |
| PUT `/api/user/onesignal-player-id` (no auth) | 401 UNAUTHORIZED | ✅ |
| GET `/api/academic-years` (no auth) | 401 UNAUTHORIZED | ✅ |
| Super-admin GET `/api/super-admin/dashboard/stats` | 200 + counts | ✅ |
| Super-admin GET `/api/super-admin/teachers?page=1&limit=5` | 200 + `meta.pagination` | ✅ |
| Super-admin GET `/api/super-admin/settings/booking-confirm-fee` | 200 + `data.feeIqd` | ✅ |
| Super-admin GET `/api/notifications/statistics` | 200 + stats object | ✅ |
| Super-admin POST `/api/notifications/send-to-all` (empty body) | 400 VALIDATION_ERROR with `body.title` + `body.message` | ✅ |
| Super-admin PUT `/api/super-admin/settings/booking-confirm-fee` (empty body) | 400 VALIDATION_ERROR field `body.feeIqd` | ✅ |
| Student bearer on `/api/super-admin/dashboard/stats` | 403 ROLE_REQUIRED | ✅ |
| Student bearer on POST `/api/notifications/send-to-all` | 403 ROLE_REQUIRED (admin-or-teacher gate) | ✅ |
| Teacher bearer on POST `/api/notifications/send-to-students` | 201 success | ✅ |
| Teacher bearer on GET `/api/notifications` (admin-only) | 403 ROLE_REQUIRED | ✅ |
| Student bearer on GET `/api/notifications/user/my-notifications` | 200 (any-auth path) | ✅ |
| Student bearer on PUT `/api/user/onesignal-player-id` (empty body) | 400 VALIDATION_ERROR field `body.oneSignalPlayerId` | ✅ |
| POST `/api/payments/wayl/webhook` (empty body) | 400 VALIDATION_ERROR field `body.referenceId` (Zod gate) | ✅ |
| POST `/api/payments/wayl/webhook` with `{referenceId: "x"}` (no signature header) | 401 `{success:false, message:"Missing signature"}` (Wayl-compatible shape) | ✅ |

### What was NOT changed

- Service-layer ownership checks inside `super_admin/*.service.ts`, `notification.service.ts`, etc. — unchanged. Phase 1.C will migrate services to throw `ApiError` directly and remove the `unwrapServiceResult` bridge.
- Wayl webhook response shape (see "Wayl webhook" above) — preserved byte-for-byte because Wayl owns the contract.
- The OneSignal player-id session-tracking mechanism — same `TokenModel.updatePlayerId(userId, token, playerId)` call; only the route + envelope changed.
- The `NewsController` is reused by both the migrated `/api/news/*` routes and the `super_admin/news.controller.ts` import inside `news.controller.create()` for the news-creation notification fan-out — single file, single controller, no fork.
- Cron-driven notification dispatch (`processPendingNotifications`) — same code path; only the `POST /api/notifications/process-pending` admin trigger envelope changed.

### Phase 1.B as a whole

| | Lines before | Lines after | Reduction |
|---|---|---|---|
| Phase 1.A — auth | ~1 382 | ~286 | ~79% |
| Phase 1.B-1 — teacher | ~6 944 | ~3 850 | ~45% |
| Phase 1.B-2 — student | ~1 811 | ~1 110 | ~39% |
| Phase 1.B-3 — super-admin + rest | ~3 763 | ~2 700 | ~28% |
| **Total** | **~13 900** | **~7 950** | **~43%** |

Plus ~1 100 lines of new shared utility code (response.util, api-error, async-handler, validate.middleware, error.middleware, request-id.middleware, logger, pagination, common.schemas, plus per-domain schemas) that's reused across every handler. The `unwrap-service` bridge that existed across Phases 1.A–1.B was removed in Phase 1.C below.

---

## API foundation — Phase 1.C (service-layer refactor, added 2026-05-16)

Phase 1.C finishes the Phase 1 migration by pushing the error contract down one more level: **services now throw `ApiError` with stable `ErrorCodes` directly**, instead of returning the legacy `{success, message, data?, errors?}` shape. The temporary `unwrapServiceResult` bridge that bridged the two worlds across Phases 1.A–1.B is gone, and `src/utils/unwrap-service.ts` was deleted.

### Why this matters

Before Phase 1.C:

```ts
// Controller (the thing the user sees)
const result = await AuthService.login({ email, password });
const data = unwrapServiceResult(result, 401, ErrorCodes.INVALID_CREDENTIALS);
res.status(200).json(ok(data, result.message));
```

- The controller had to pick the failure status code and error code at *every* call site.
- The service emitted Arabic prose ("بيانات الدخول غير صحيحة") with no machine-readable code, so the bridge stuffed a single coarse code on top.
- Tests and clients keyed off the prose, which drifts. The same service returned `INVALID_CREDENTIALS` from one call site and `INVALID_REQUEST` from another — depending on whether the controller author remembered the right second argument.

After Phase 1.C:

```ts
// Service (close to the failure)
throw new ApiError(401, 'بيانات الدخول غير صحيحة', ErrorCodes.INVALID_CREDENTIALS);

// Controller (thin)
const data = await AuthService.login({ email, password });
res.status(200).json(ok(data, 'تم تسجيل الدخول بنجاح'));
```

- The service knows *exactly* what went wrong and emits the correct status + machine code.
- Controllers shrink to "call service, wrap the success in `ok()`".
- Error codes are now consistent across the whole surface — `auth.test.ts` and the live smoke tests both assert against the code, not the message.

### Services migrated (full list)

| Service | Methods now throwing `ApiError` | Notes |
|---|---|---|
| `auth.service.ts` | `registerSuperAdmin`, `registerTeacher`, `registerStudent`, `login`, `logout`, `verifyEmail`, `resendVerificationCode`, `requestPasswordReset`, `resetPassword`, `googleAuth`, `appleAuth`, `completeProfile`, `updateProfile` | OAuth flows now return a typed `OAuthResult` with an `isNewUser` discriminator so the controller picks the right success message ("login" vs "account created"). JWT signing + token-row insertion is centralised in a new private `buildOAuthSession` helper. |
| `google-auth.service.ts` | `verifyGoogleToken`, `verifyGoogleDataWithSecurity`, `exchangeCodeForTokens`, plus the public `verify*` wrappers | Failures now throw `ApiError(400, …, UNAUTHORIZED)` with `legacyErrors` in `details` so the client can still surface the per-check message. |
| `apple-auth.service.ts` | `verifyIdentityToken`, `exchangeAuthorizationCode` | Both return the Apple JSON directly; failures throw. |
| `super_admin/academic-year.service.ts` | All 7 methods. `getActive()` returns `{academicYear} \| null`; new `getActiveOrThrow()` helper for required-active-year flows. | Error codes: `VALIDATION_ERROR`, `ALREADY_EXISTS`, `NOT_FOUND`, `BUSINESS_RULE`. |
| `super_admin/grade.service.ts` | 8 methods. `getAllActive()` / `getActive()` return arrays directly. | |
| `super_admin/subscription-package.service.ts` | 11 methods. `getActivePackages()` returns the array directly. | |
| `teacher-subscription.service.ts` | 7 methods. Best-effort referral bonuses now `logger.warn` instead of `console.error`. | |
| `teacher/subject.service.ts` | 8 methods. New `requireTeacher` helper that throws 404 on lookup miss. | |
| `teacher/course.service.ts` | All public methods (largest service refactored, 767 lines). | Preserves `mapServiceMutationError`-style PG error handling for 23505 unique-violation translation. |
| `student/student.service.ts` | All 1059 lines of class + namespace declarations preserved. New `getStudentLocation()` returns `{latitude, longitude} \| null` so callers can choose between the with-location and without-location suggested-courses paths. `getActiveGrades()` throws 404. `validateStudentLocation()` throws 400. | |
| `student/search.service.ts` | Returns `UnifiedSearchResult` directly; no try/catch. | |
| `teacher-search.service.ts` | 4 methods throw `ApiError(400, …, VALIDATION_ERROR)` on missing required params; return `{teachers, count}` directly. | |

### Auth-layer error code map

The contract clients see today:

| Method | Failure | Status | Code |
|---|---|---|---|
| `login` | unknown email / wrong password | 401 | `INVALID_CREDENTIALS` |
| `login` | account suspended / pending verification | 401 | `ACCOUNT_INACTIVE` |
| `login` | OAuth-provisioned user trying password login | 401 | `PROVIDER_MISMATCH` |
| `logout` | token row not found (already revoked / fake) | 401 | `TOKEN_INVALID` |
| `verifyEmail` / `resetPassword` | too many wrong attempts | 429 | `CODE_LOCKED` |
| `verifyEmail` / `resetPassword` | expired OTP | 400 | `CODE_EXPIRED` |
| `verifyEmail` / `resetPassword` | wrong / unknown OTP (anti-enumeration) | 400 | `INVALID_CODE` |
| `resendVerificationCode` | unknown email | 400 | `EMAIL_NOT_VERIFIED` |
| `requestPasswordReset` | unknown email | 404 | `NOT_FOUND` |
| `requestPasswordReset` | SMTP delivery failed | 502 | `EMAIL_SEND_FAILED` |
| `registerTeacher` / `registerStudent` | email already used via Google | 409 | `PROVIDER_MISMATCH` |
| `registerTeacher` / `registerStudent` | duplicate email | 409 | `EMAIL_ALREADY_EXISTS` |
| `registerTeacher` / `registerStudent` | SMTP delivery failed | 502 | `EMAIL_SEND_FAILED` |
| `registerSuperAdmin` | super-admin already exists | 400 | `SUPER_ADMIN_EXISTS` |
| `googleAuth` / `appleAuth` | user exists with a different provider | 409 | `PROVIDER_MISMATCH` |
| `googleAuth` / `appleAuth` | userType mismatch (student token vs teacher endpoint) | 409 | `USER_TYPE_MISMATCH` |
| `completeProfile` / `updateProfile` | user not found | 404 | `NOT_FOUND` |
| `completeProfile` / `updateProfile` | unsupported role | 400 | `USER_TYPE_MISMATCH` |

### Best-effort side-effects

Throughout the refactor, "best-effort" side-effects (auto-create free subscription, ensure teacher QR, create grade relationships, geocode an address, send a notification) are wrapped in `try` / `catch` and emit a `logger.warn(...)` on failure rather than aborting the whole request. The pattern is uniform across the auth, course, booking, and notification services so that a flaky external provider can't take down a registration flow. Search the codebase for `logger.warn(` to see the full set; `console.error` / `console.warn` are no longer used in services.

### Wire change for OAuth (`googleAuth` / `appleAuth`)

The OAuth response shape now includes `isNewUser` at the top level (it was nested under `data` before). The full success body is:

```json
{
  "success": true,
  "message": "تم تسجيل الدخول بنجاح",
  "data": {
    "user": { ... },
    "token": "...",
    "isNewUser": false,
    "isProfileComplete": true,
    "requiresProfileCompletion": false,
    "activeAcademicYear": { ... }
  },
  "content_url": "https://api.mulhimiq.com"
}
```

Flutter and the dashboard already read `data.isNewUser` / `data.requiresProfileCompletion` — the change is internal (the controller now derives the success message from `data.isNewUser` instead of forwarding `result.message` from the service).

### `LegacyApiResponse` removed

The transitional type alias `LegacyApiResponse` in `auth.service.ts` was deleted at the end of Phase 1.C. No service file imports `ApiResponse` from `src/types/index.ts` anymore (the type itself stays for clients that still consume it elsewhere; only the **server-side return convention** has changed).

### Smoke tests (live, 2026-05-16)

After dev-server restart, against the refactored surface:

| Test | Expected | Result |
|---|---|---|
| `POST /api/auth/login` with wrong creds | 401 + `errors[0].code = INVALID_CREDENTIALS` | ✅ |
| `POST /api/auth/login` with empty body | 400 + `body.email` + `body.password` field errors | ✅ |
| `POST /api/auth/register/teacher` with empty body | 400 + 9 field errors | ✅ |
| `POST /api/auth/register/student` with empty body | 400 + 4 field errors | ✅ |
| `POST /api/auth/register/super-admin` (no `BOOTSTRAP_TOKEN`) | 404 | ✅ |
| `POST /api/auth/verify-email` with bogus code | 400 + `INVALID_CODE` | ✅ |
| `POST /api/auth/resend-verification` for unknown email | 400 + `EMAIL_NOT_VERIFIED` | ✅ |
| `POST /api/auth/request-password-reset` for unknown email | 404 + `NOT_FOUND` | ✅ |
| `POST /api/auth/google-auth` empty body | 400 + `body.userType` field error | ✅ |
| `POST /api/auth/apple-auth` empty body | 400 + `body.identityToken` + `body.userType` field errors | ✅ |
| `POST /api/auth/logout` with no token | 401 + `UNAUTHORIZED` | ✅ |
| `POST /api/auth/complete-profile` with no auth | 401 + `UNAUTHORIZED` | ✅ |
| `POST /api/auth/update-profile` with no auth | 401 + `UNAUTHORIZED` | ✅ |

Plus the envelope test suite is **22 / 22 passing** (`envelope.test.ts` 8, `teacher-envelope.test.ts` 4, `student-envelope.test.ts` 3, `phase1b3-envelope.test.ts` 6) and `tsc --noEmit` is clean.

### What's still pending (post-Phase 1.C)

- Move the inline `getEnhancedUserData` helper in `auth.service.ts` somewhere shared, since it's getting reused by every OAuth path. Not a blocker.
- Phase 2 onwards (dashboard state consolidation, reusable UX building blocks, parent role) — see the [architecture-modernization plan](../.claude/plans/2026-05-15_architecture-modernization.md).

---

## Dependency cleanup — Phase 1.D (added 2026-05-16)

After Phase 1.C left the service layer with no consumers of the legacy validation / ORM libraries, Phase 1.D pruned them from `package.json` and resynced both lockfiles. Pre-removal audit was a full source grep for `from 'joi'`, `express-validator`, `@prisma`, and `PrismaClient` across `dirasiq_api/` (excluding lockfiles, docs, and tool-result captures) — zero hits.

### Packages removed

| Package | Where | Why dead |
|---|---|---|
| `joi` | `dependencies` | Never imported. The intent had been to use it for validation; Zod 4 is the single validator since Phase 1.A. |
| `express-validator` | `dependencies` | Replaced by the `validate({ body, params, query, files })` middleware in Phase 1.A. The last two source-file mentions (`auth.controller.ts` and `auth.schemas.ts`) were doc-comments noting the migration, not imports. |
| `@prisma/client` | `dependencies` | Listed in `package.json` for years but never imported. The repo uses raw `pg` queries with parameterized statements; no Prisma schema or generated client exists. |
| `prisma` | `devDependencies` | The CLI that companions `@prisma/client`. With the client gone and no `schema.prisma` to migrate, the CLI has no purpose. |

### Lockfile sync

`package-lock.json` shrank from **10 552 → 10 092 lines** (`npm install` reported `removed 40 packages, audited 778 packages`). `bun.lock` was re-synced via `bun install` (the repo carries both lockfiles; `npm` is the canonical one but `bun` is what the contributor ran here, so both were updated). After sync:

```text
$ npm ls @prisma/client express-validator joi prisma
mulhimiq-api@1.0.0 D:\my-pro\dirasiq\dirasiq_api
`-- (empty)
```

### Smoke tests verified (2026-05-16)

| # | Test | Expected | Result |
|---|---|---|---|
| 1 | `tsc --noEmit` | exit 0 | ✅ |
| 2 | `jest --testPathPattern=envelope` | 22 / 22 passing | ✅ |
| 3 | `GET /health` | 200, canonical envelope | ✅ |
| 4 | `POST /api/auth/login` wrong creds | 401 `INVALID_CREDENTIALS` | ✅ |
| 5 | `POST /api/auth/login` empty body | 400 `VALIDATION_ERROR`, `body.email` + `body.password` | ✅ |
| 6 | `POST /api/auth/register/super-admin` (no `BOOTSTRAP_TOKEN`) | 404 | ✅ |
| 7 | `GET /api/teacher/dashboard` (no token) | 401 `UNAUTHORIZED` | ✅ |
| 8 | `GET /api/student/dashboard/overview` (no token) | 401 `UNAUTHORIZED` | ✅ |
| 9 | `GET /api/super-admin/dashboard/stats` (no token) | 401 `UNAUTHORIZED` | ✅ |
| 10 | `GET /api/public/news` (no auth) | 200, canonical envelope | ✅ |
| 11 | `GET /api/teacher-search/governorates` (no auth) | 200, canonical envelope | ✅ |
| 12 | `GET /api/nope` | 404 `NOT_FOUND` (canonical envelope) | ✅ |
| 13 | `POST /api/payments/wayl/webhook` empty body | 400 `VALIDATION_ERROR`, `body.referenceId` (Zod gate runs before HMAC) | ✅ |

### What was NOT removed

- `morgan` is still declared, but it's also unused (replaced by `pino-http` in Phase 1.A). Left in for a separate follow-up because some operators may still rely on it locally; flagging here so the next pass can drop it.
- `supertest` stays in `dependencies` even though it's only used by tests. Moving it to `devDependencies` is a nice-to-have; not done in this pass to keep the diff minimal.
- `@types/node-cron` is in `dependencies` rather than `devDependencies` — same story.

### Vulnerability count

`npm install` reported `42 vulnerabilities (3 low, 22 moderate, 13 high, 4 critical)` after the cleanup. Phase 1.E (below) handles the audit pass.

---

## Dependency security hardening — Phase 1.E (added 2026-05-16)

Phase 1.E is the focused audit pass that followed Phase 1.D's dead-dep removal. The goal: cut the `npm audit` count without touching production behaviour or kicking off any of the major migrations queued for later phases.

### Direct dep changes

| Package | Before | After | Why |
|---|---|---|---|
| `express` | `^4.18.2` | `^4.21.2` | Latest 4.x. Pulls in patched `body-parser` (was on vulnerable `qs`), `path-to-regexp` (ReDoS fix), `qs`. **Non-major; drop-in.** |
| `nodemailer` | `^6.9.7` | `^8.0.7` | v6 bundled `@aws-sdk/client-ses` as an optional dep, dragging in ~30 transitive vulnerabilities (`fast-xml-parser`, `ajv`, all `@aws-sdk/*` and `@smithy/*` chains). v8 split that into a separate `@nodemailer/aws-ses` package, so the dependency cloud collapses. Our only mail path is plain Gmail SMTP (`createTransport({host, port, secure, auth})`); v8 keeps that API identical. **Requires Node 18+ at runtime.** Confirmed live: `POST /api/auth/request-password-reset` reaches the SMTP server and gets a real 550 response for an unreachable recipient — proves the transport works end-to-end. |
| `@types/nodemailer` | `6.4.20` | `^8.0.0` | Matches the new runtime version. |
| `@typescript-eslint/eslint-plugin` | `^6.12.0` | `^6.21.0` | Latest in the v6 line. Picks up patched `minimatch` / `picomatch` / `flatted` transitively. |
| `@typescript-eslint/parser` | `^6.12.0` | `^6.21.0` | Same. |
| `eslint` | `^8.54.0` | `^8.57.1` | Last patch in v8 line. v9's flat-config migration was explicitly declined for this pass (dev-tooling vulns don't reach production). |

### Removed

| Package | Reason |
|---|---|
| `morgan` (`dependencies`) | The only mention left in source was a doc-comment in `src/index.ts` saying "Replaces the previous `morgan` access log." pino-http has fully owned request logging since Phase 1.A. Comment was updated to drop the back-reference. |
| `@types/morgan` (`devDependencies`) | Companion to the removed runtime dep. |

### Moved

| Package | From | To | Reason |
|---|---|---|---|
| `supertest` | `dependencies` | `devDependencies` | Only used by the four `src/test/*-envelope.test.ts` suites and `src/test/auth.test.ts`. Has no runtime caller. |
| `@types/node-cron` | `dependencies` | `devDependencies` | TypeScript ambient-only; not needed at runtime. |

### How the audit was driven

1. **Audit first**: `npm audit --json` parsed and grouped by direct/indirect, severity, and `fixAvailable` flag. Identified 4 root-cause clusters: (a) onesignal-node's deprecated `request` chain, (b) nodemailer 6's AWS-SDK SES bundling, (c) typescript-eslint v6 chain, (d) misc patchable transitives.
2. **Confirm the two judgement-call majors** with the user (nodemailer 6→8 and eslint 8→9). Got "yes nodemailer, no eslint."
3. **Edit `package.json`** for all direct changes in one pass.
4. **`npm install`**: 42 → 25 vulnerabilities (drops the AWS-SDK chain after nodemailer 8 lands).
5. **`npm audit fix`** (non-`--force`): 25 → 13 (applies the transitive patches that don't require a semver-major).
6. **`bun install`** to resync `bun.lock` (the repo ships both lockfiles), then `npm install` again so npm regenerates anything bun touched. Final audit count is stable at **13 vulnerabilities (5 moderate, 6 high, 2 critical)**.

### Residual vulnerabilities and why they stay

The remaining 13 split into two clusters, neither of which is fixable inside Phase 1's scope:

**Cluster A — `onesignal-node` deprecated `request` chain (7 vulns, 2 critical + 4 moderate + 1 direct moderate):**

- `request` (critical SSRF), `form-data` (critical), `request-promise`, `request-promise-core`, `tough-cookie` (prototype pollution), `qs` (DoS), `onesignal-node` itself (moderate).
- Root cause: `onesignal-node@3.4.0` (released 2020) depends on the deprecated `request` package. No newer version exists; the maintainer ceded the namespace.
- **Real fix**: replace `onesignal-node` with the official `@onesignal/node-onesignal` SDK across `src/services/notification.service.ts` and every caller. This is a non-trivial refactor (the new SDK uses a different client-instantiation pattern + an OpenAPI-generated surface) and was deliberately excluded from this hardening pass.
- **Containment**: the OneSignal calls are server-to-server and the data passed in is fully under our control (no user-input fed to OneSignal URLs). The SSRF advisory on `request` does not have an exploitable vector through our usage pattern.

**Cluster B — `@typescript-eslint/*` v6 chain (6 vulns, all high, all dev-only):**

- `@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser`, `@typescript-eslint/type-utils`, `@typescript-eslint/typescript-estree`, `@typescript-eslint/utils`, `minimatch` (transitive).
- Root cause: v6 line uses an older `minimatch` with a known ReDoS. Fix path is v8, which requires eslint v9 + flat-config migration.
- **Dev-only**: ESLint never runs in production. The advisories are about parsing crafted regex patterns; the only "attacker input" is the source code being linted, which is our own.
- Explicitly declined for this pass by the user.

### Smoke tests (live, 2026-05-16, post-cleanup)

| # | Test | Expected | Result |
|---|---|---|---|
| 1 | `tsc --noEmit` | exit 0 | ✅ |
| 2 | `jest --testPathPattern=envelope` | 22 / 22 passing | ✅ |
| 3 | `GET /health` | 200 canonical envelope | ✅ |
| 4 | `POST /api/auth/login` wrong creds | 401 `INVALID_CREDENTIALS` | ✅ |
| 5 | `POST /api/auth/login` empty body | 400 `VALIDATION_ERROR` | ✅ |
| 6 | `POST /api/auth/register/super-admin` (no `BOOTSTRAP_TOKEN`) | 404 | ✅ |
| 7 | `POST /api/auth/request-password-reset` (real student email, unreachable domain) | 502 `EMAIL_SEND_FAILED` after nodemailer@8 SMTP 550 — **proves new transport works** | ✅ |
| 8 | `GET /api/teacher/dashboard` no token | 401 `UNAUTHORIZED` | ✅ |
| 9 | `GET /api/student/dashboard/overview` no token | 401 `UNAUTHORIZED` | ✅ |
| 10 | `GET /api/super-admin/dashboard/stats` no token | 401 `UNAUTHORIZED` | ✅ |
| 11 | `GET /api/public/news` (no auth) | 200 canonical envelope | ✅ |
| 12 | `GET /api/teacher-search/governorates` (no auth) | 200 canonical envelope | ✅ |
| 13 | `GET /api/nope` | 404 `NOT_FOUND` | ✅ |
| 14 | `POST /api/payments/wayl/webhook` empty body | 400 `VALIDATION_ERROR` (Zod gate before HMAC) | ✅ |

### Malformed-JSON handling (fixed 2026-05-16)

Previously, posting `Content-Type: application/json` with a body that body-parser couldn't parse (e.g. `not-json`, truncated JSON, trailing garbage) returned **500 `INTERNAL_ERROR`** with the raw `body-parser` "Unexpected token …" message instead of the canonical envelope. `error.middleware.ts` did not special-case body-parser's `SyntaxError`, so it fell through to the generic catch-all.

The fix in [`src/middleware/error.middleware.ts`](src/middleware/error.middleware.ts) adds one branch to `normalizeError()`: when the thrown value is a `SyntaxError` with `type === 'entity.parse.failed'` and a `body` property (body-parser's exact signature), it rewrites to `validationFailed([{ field: 'body', message: 'Malformed JSON in request body', code: 'invalid_json' }])`. The detection is intentionally narrow — only the body-parser parse-failure path — so it doesn't swallow Zod or other SyntaxError sources.

Response shape now:

```json
{
  "success": false,
  "message": "فشل في التحقق من البيانات",
  "errors": [
    { "code": "invalid_json", "field": "body", "message": "Malformed JSON in request body" }
  ]
}
```

Regression covered by [`src/test/envelope.test.ts`](src/test/envelope.test.ts) → `"Malformed JSON body"` describe block. Verified live with 4 variants: pure non-JSON, truncated object, trailing garbage, and a Zod-normal empty body (unchanged behaviour — still emits `body.email` / `body.password` errors).

### Vulnerability trajectory

| Stage | low | moderate | high | critical | total |
|---|---|---|---|---|---|
| Start of Phase 1.E (post-1.D) | 3 | 22 | 13 | 4 | 42 |
| After nodemailer 6→8 + express 4.18→4.21 + typescript-eslint patch | 2 | 8 | 12 | 3 | 25 |
| After `npm audit fix` (non-force) | 0 | 5 | 6 | 2 | 13 |

29 of the 42 vulnerabilities (69%) are gone. The remaining 13 require either replacing `onesignal-node` (refactor) or migrating to ESLint v9 flat-config (dev tooling) — both intentionally deferred.

---

## Security — Phase 0 hardening (added 2026-05-15)

Three changes from [`architecture-modernization` Phase 0](../.claude/plans/2026-05-15_architecture-modernization.md#phase-0--security-emergency-1-week-1-engineer):

### 1. Super-admin bootstrap gate

`POST /api/auth/register/super-admin` is now protected by `BOOTSTRAP_TOKEN` env var via [`src/middleware/bootstrap.middleware.ts`](src/middleware/bootstrap.middleware.ts):

- **`BOOTSTRAP_TOKEN` unset / empty (steady state):** endpoint returns `404 Not Found`. The first request anyone makes against the endpoint reveals nothing about its existence.
- **`BOOTSTRAP_TOKEN` set:** request must carry `Authorization: Bearer <token>` matching the env value. Comparison is `crypto.timingSafeEqual` (constant-time, no timing leak).

Operational flow:
1. On a fresh deploy with no super admin in the DB, set `BOOTSTRAP_TOKEN=<random-32-bytes>` in the environment, restart, then `POST /api/auth/register/super-admin` with the token in `Authorization`.
2. Once the super admin exists, comment out / blank the env var and restart. The endpoint returns 404 thereafter.
3. Any later super admin should be created out-of-band (SQL INSERT by the existing super admin), not by re-enabling the gate.

This closes the race-condition vulnerability: previously two concurrent requests on a fresh DB could both observe `superAdminExists() = false` and both succeed.

#### How to add a super admin (recipe)

The bootstrap endpoint only works when ZERO super admins exist. For every subsequent admin, INSERT directly. Two shell-friendly recipes:

**Recipe A — first ever super admin (empty DB):**
```bash
# 1. Set the bootstrap env and restart the API
echo 'BOOTSTRAP_TOKEN=<random-32-bytes>' >> dirasiq_api/.env
# 2. Restart the API so the env is loaded (Ctrl-C the running nodemon, then npm run dev)
# 3. Register
curl -X POST http://localhost:3000/api/auth/register/super-admin \
  -H "Authorization: Bearer <BOOTSTRAP_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Admin","email":"admin@example.com","password":"YourPassword123"}'
# 4. UNSET BOOTSTRAP_TOKEN in .env and restart so the endpoint returns 404 again
```

**Recipe B — additional super admin (one already exists):**
```bash
# 1. Generate the bcrypt hash (cost=BCRYPT_ROUNDS, default 12)
cd dirasiq_api
node -e "require('bcryptjs').hash('YourPassword123', 12).then(h => console.log(h))"
# → copy the $2a$12$... string

# 2. Insert via SQL (UPSERT keeps it idempotent)
PGPASSWORD=<pwd> psql -h localhost -U postgres -d mulhimiq_local -c "
INSERT INTO users (name, email, password, user_type, status, email_verified, auth_provider)
VALUES ('Admin Name', 'admin2@example.com', '<paste-bcrypt-hash>',
        'super_admin', 'active', true, 'email')
ON CONFLICT (email) DO UPDATE SET
  password = EXCLUDED.password, status = 'active',
  email_verified = true, name = EXCLUDED.name, updated_at = now();
"

# 3. No restart needed. Verify with a login round-trip:
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin2@example.com","password":"YourPassword123"}'
# Expect: HTTP 200 + token + userType: "super_admin"
```

Why the SQL path is correct (not a workaround): the `superAdminExists()` guard exists to stop privilege escalation via the public `/register/super-admin` endpoint. An out-of-band SQL INSERT requires DB shell access, which is itself a privileged operation — the threat model is preserved.

Reset the password the same way: re-run step 1+2 with the same email; the `ON CONFLICT` clause updates `password` in place. The first login after a password reset issues a fresh JWT.

### 2. CORS bypass removed

`src/index.ts` previously had a manual `app.use((req, res, next) => { res.header('Access-Control-Allow-Origin', req.headers.origin || '*'); … })` block AFTER the `cors()` allowlist. That defeated the allowlist — any Origin received a permissive `Access-Control-Allow-Origin` header. Removed in Phase 0. The `cors()` middleware now exclusively controls CORS responses, including preflight (OPTIONS).

Verified: a preflight from `http://evil.com` no longer receives any `Access-Control-Allow-*` header; allowed origins (`http://localhost:5174`, `https://mulhimiq.com`, etc.) continue to receive the proper headers.

### 3. Helmet CSP re-enabled

Previously `helmet({ contentSecurityPolicy: false })`. Now:

```ts
contentSecurityPolicy: {
  useDefaults: true,
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc:  ["'self'"],
    styleSrc:   ["'self'", "'unsafe-inline'"],
    imgSrc:     ["'self'", 'data:', 'blob:'],
    connectSrc: ["'self'"],
    objectSrc:  ["'none'"],
    baseUri:    ["'none'"],
    frameAncestors: ["'none'"],
    formAction: ["'self'"],
    upgradeInsecureRequests: NODE_ENV === 'production' ? [] : null,
  },
}
```

The API serves JSON + static files only — it doesn't ship HTML pages — so the policy can be strict. The dashboard, served from its own origin, has its own CSP (see `dirasiq_dash/index.html`).

Verified: `Content-Security-Policy` header is present on every API response (including `/health`).

### Dashboard CSP and third-party scripts

`dirasiq_dash/index.html` now contains:
- A `<meta http-equiv="Content-Security-Policy" content="...">` tag allowing only `https://cdn.onesignal.com`, `https://accounts.google.com`, `https://fonts.googleapis.com` / `gstatic.com`, plus `self`.
- `crossorigin="anonymous"` on both third-party `<script>` tags.

**Why no SRI on the third-party scripts:** OneSignal and Google both rotate the bytes at their CDN URLs without version pinning. An `integrity="sha384-…"` hash would pin the dashboard to one byte sequence and break the next time the provider updates. The CSP `script-src` allowlist is the substitute defence — only those two hostnames may serve any script.

### Phase 0 smoke tests (10/10 on 2026-05-15)

| # | Test | Expected | Result |
|---|---|---|---|
| 1 | `POST /api/auth/register/super-admin` with `BOOTSTRAP_TOKEN` unset | 404 Not Found | ✅ |
| 2 | Existing super-admin login | 200 OK with token | ✅ |
| 3 | CORS preflight from `http://localhost:5174` | 204 + `Access-Control-Allow-Origin: http://localhost:5174` | ✅ |
| 4 | CORS preflight from `http://evil.com` | rejected, no `Access-Control-Allow-*` header | ✅ |
| 5 | `BOOTSTRAP_TOKEN` set + no `Authorization` header | 401 "Bootstrap token required" | ✅ |
| 6 | `BOOTSTRAP_TOKEN` set + wrong token | 401 "Invalid bootstrap token" | ✅ |
| 7 | `BOOTSTRAP_TOKEN` set + correct token (super-admin already exists) | 400 "السوبر أدمن موجود بالفعل" | ✅ |
| 8 | Teacher registration still works | 400 only because email delivery fails to fake address; user record created | ✅ |
| 9 | Timing-safe compare: response time for wrong tokens of varying lengths | All similar (~227 ms) — no length-based timing leak | ✅ |
| 10 | Dashboard `index.html` includes CSP meta + crossorigin on both scripts | HTTP 200, CSP + 2 scripts + crossorigin present | ✅ |

### New environment variable

| Var | Default | Purpose |
|---|---|---|
| `BOOTSTRAP_TOKEN` | unset | When set, gates `POST /api/auth/register/super-admin` behind `Authorization: Bearer <value>`. Unset means the endpoint is 404. |

---

## Email handling — citext (added 2026-05-15)

`users.email` is `CITEXT` (PostgreSQL's case-insensitive text type, migration `033_email_citext.sql`). This means:

- **Uniqueness is case-insensitive at the DB layer.** Inserting `Foo@Bar.com` after `foo@bar.com` raises `duplicate key value violates unique constraint "users_email_key"`. No application code path can create two accounts that differ only in email casing.
- **Lookups are case-insensitive at the DB layer.** Every `WHERE email = $1` query in `src/models/user.model.ts` (`findByEmail`, `getAuthProviderByEmail`, `verifyEmail`, `resetPassword`, `setPasswordResetCode`, `resendVerificationCode`, `findAll`) matches regardless of input casing — with no application code change.
- **`ILIKE` and `LIKE` still work** on citext, so the admin-search query in `super_admin/teacher.controller.ts` (`u.email ILIKE $idx`) continues to function.

### Application normalization

Defense-in-depth: `UserModel.normalizeEmail(raw)` trims and lowercases the input. `UserModel.create()` calls it before INSERT so every stored value is uniform. The two service-level `.toLowerCase()` calls in `registerTeacher` / `registerStudent` are now redundant but harmless — they were left in place.

### What was dropped

The previous `users_email_lowercase` CHECK constraint (`email = LOWER(email)`) is dropped by `033`. Under citext, that expression is always true, so the CHECK never rejected anything and was dead weight.

### Verified behaviour (2026-05-15)

1. Insert `citext-test@example.com` → ok.
2. Insert `CITEXT-Test@Example.COM` → `duplicate key value`. ✅
3. `WHERE email = 'CITEXT-TEST@EXAMPLE.COM'` returns the row stored as `citext-test@example.com`. ✅
4. Register teacher with `Citext.Test@Foo.COM` → stored as `citext.test@foo.com`. ✅
5. Re-register with `CITEXT.test@FOO.com` → "Email already exists". ✅
6. Login with original casing, ALL UPPERCASE, ALL lowercase → all three succeed with the same user id. ✅
7. Login with wrong password → 401. ✅

---

## Security — Wayl webhook hardening (added 2026-05-15)

The Wayl payment-gateway webhook (`POST /api/payments/wayl/webhook`) authenticates every inbound request with HMAC-SHA256 against a **per-link** secret generated at link-creation time. The secret is stored in `wayl_payment_links.wayl_secret` and never leaves the database after the initial outbound call to Wayl.

### Verification pipeline (in order)

1. **Content-Length cap** — `WAYL_WEBHOOK_MAX_BODY_BYTES` (default 64 KB). Oversized requests get 413 immediately. Stops DoS on the global 1000 MB JSON limit.
2. **Raw-body capture** — `express.json({ verify })` in `src/index.ts` writes the exact bytes to `req.rawBody`. The controller refuses with 400 if `req.rawBody` is missing instead of falling back to `JSON.stringify(req.body)` (which would not match Wayl's signed bytes).
3. **Signature header** — read from `X-Wayl-Signature-256` (preferred) or `X-Wayl-Signature`. Missing header → 401 in strict mode.
4. **referenceId** — extracted from the body, used to look up the per-link `wayl_secret`. Missing → 400; unknown → 404. Both paths record an audit event.
5. **Optional timestamp** — if `WAYL_WEBHOOK_TIMESTAMP_HEADER` env var is set (e.g. `x-wayl-timestamp`), the controller reads that header and rejects if the value is more than `WAYL_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS` (default 300) away from server time. Accepts seconds-since-epoch (10-digit) or milliseconds (13-digit). Disabled by default because Wayl's protocol doesn't appear to ship a timestamp.
6. **HMAC compare** — `crypto.createHmac('sha256', secret).update(rawBody).digest('hex')` compared via `crypto.timingSafeEqual` (constant-time). Mismatch → 401 in strict mode.
7. **Event log** — every request, valid or not, gets a row in `wayl_webhook_events` with `signature_valid`, `headers`, `raw_body`, `body`, and `processing_status` (`received | processed | ignored | failed`). Replay/audit lives here.
8. **Idempotency** — `link.status === 'paid'` short-circuits with "Already processed". Same valid webhook delivered twice never double-credits.
9. **Amount mismatch** — webhook `total` must equal `link.amount`. Mismatch → 400 `failed`.

### Verification modes

| `WAYL_WEBHOOK_VERIFY_MODE` | Behaviour |
|---|---|
| `strict` (default — **production**) | Reject 401 on missing signature, missing rawBody, invalid HMAC, or out-of-tolerance timestamp. |
| `warn` | Log a warning but still process. **Dev only**; never set in production. |
| `skip` | Bypass verification entirely. **Local smoke tests only**, where the operator hand-crafts payloads against a self-issued secret. |

### Environment variables

| Var | Default | Purpose |
|---|---|---|
| `WAYL_WEBHOOK_VERIFY_MODE` | `strict` | `strict` / `warn` / `skip`. |
| `WAYL_WEBHOOK_MAX_BODY_BYTES` | `65536` | Reject Content-Length above this. |
| `WAYL_WEBHOOK_TIMESTAMP_HEADER` | (unset) | Optional header name carrying a unix timestamp. If unset, freshness is not checked. |
| `WAYL_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS` | `300` | ±N seconds skew tolerance. |

### Per-link secret (not env-var)

The system intentionally uses a **per-link** secret (32 random bytes, hex) generated by `WaylService.generateSecret()` at link creation and shared with Wayl via the `webhookSecret` field on the create-link request. This is stronger than a single shared secret because:

- Compromise of one link's secret reveals no other links.
- Secrets can be rotated per-link without affecting fulfilled payments.
- There is no long-lived global webhook secret to manage.

A global `WAYL_WEBHOOK_SECRET` is **not** used and is **not** required.

### Smoke tests verified (14/14 on 2026-05-15)

| Test | Expected | Result |
|---|---|---|
| Valid sig + non-paid status | 200 ignored | ✅ |
| Invalid sig (wrong secret) | 401 | ✅ |
| Missing signature header | 401 | ✅ |
| Unknown referenceId | 404 | ✅ |
| Missing referenceId in body | 400 | ✅ |
| Body exceeds 64 KB | 413 | ✅ |
| Valid sig + paid status | 200 processed, link marked paid | ✅ |
| Amount mismatch | 400 | ✅ |
| Tampered body (sig over original, send modified) | 401 invalid signature | ✅ |
| Replay of valid paid webhook | 200 already processed (idempotent) | ✅ |
| Timestamp header unset → stale ts accepted | 200 | ✅ |
| Timestamp header set + stale (1h old) | 401 out of tolerance | ✅ |
| Timestamp header set + fresh | 200 processed | ✅ |
| Timestamp header set + unparsable | 401 out of tolerance | ✅ |

---

## Security — OTP / verification codes (added 2026-05-15)

Email-verification and password-reset codes are bcrypt-hashed at rest with brute-force protection. Flow:

1. **Code generation** — `crypto.randomInt(100000, 1000000)` (cryptographically secure RNG). Plaintext is exposed only to the caller of `UserModel.create()` / `resendVerificationCode()` / `setPasswordResetCode()` for the purpose of emailing it. The plaintext never lives in the database.
2. **Storage** — bcrypt hash in `users.verification_code` / `users.password_reset_code` (`TEXT`). Salt and rounds use the same `BCRYPT_ROUNDS` env var as password hashing.
3. **Verification** — `bcrypt.compare()` (constant-time) against the stored hash. Expiry checked first (`*_expires` columns).
4. **Brute-force defence** — per-code attempt counter `verification_code_attempts` / `password_reset_code_attempts`. Atomic increment on each wrong attempt. After `OTP_MAX_ATTEMPTS` (env, default 5) the code is **locked** — the user must request a new one via `/api/auth/resend-verification` or `/api/auth/request-password-reset`.
5. **Single-use** — on successful verification the code, expiry, and attempts counter are all wiped in one UPDATE. Replay attempts return `INVALID_CODE`.
6. **Anti-enumeration** — distinct internal failure reasons (`not_found`, `no_code`, `wrong`, `expired`, `locked`) surface only three user-facing error codes (`INVALID_CODE`, `EXPIRED`, `LOCKED`). Attackers can't tell whether an email is registered.

### Environment variables introduced

| Var | Default | Purpose |
|---|---|---|
| `OTP_MAX_ATTEMPTS` | `5` | Wrong codes per issued OTP before the code is locked. |
| `OTP_EXPIRY_MINUTES` | `10` | Minutes before a fresh OTP expires. |
| `BCRYPT_ROUNDS` (existing) | `12` | Used for both passwords and OTPs. |

### API contract

Unchanged from the frontend's perspective:
- `POST /api/auth/verify-email` body `{email, code}` → `{success, message, errors?}`
- `POST /api/auth/resend-verification` body `{email}`
- `POST /api/auth/request-password-reset` body `{email}`
- `POST /api/auth/reset-password` body `{email, code, newPassword}`

The error `errors[0]` field now uses machine-readable codes — `INVALID_CODE`, `EXPIRED`, `LOCKED` — instead of the previous Arabic-only strings. Existing clients that only consume `success` + `message` (Arabic) keep working.

### Migration

Forward-only via `032_hash_otp_codes.sql`. Any plaintext code that existed before the migration becomes invalid (bcrypt.compare on a plaintext stored value never matches). Users with a pending verification must request a new code via `/api/auth/resend-verification`. The local dev DB is recreated from scratch, so no in-flight codes are affected.

### What was NOT changed

- The JWT auth flow (login/logout/token storage) — separate concern.
- Email delivery (still NodeMailer/Gmail SMTP). The plaintext code is in the email only.
- The QR-code reuse path — unrelated.

---

## Root configuration files

### `package.json`
- **Purpose:** project metadata, deps, npm scripts.
- **Scripts:** `dev` (nodemon `src/index.ts`), `build` (tsc + copy migrations), `start`, `test` (jest), `lint`, `lint:fix`, `format`, `format:check`, `db:init` (runs `src/database/init.ts`).
- **Notable deps:** `@prisma/client` 6.15 is listed but the codebase doesn't import it — dead dependency.
- **Issues:** `postbuild` uses POSIX `mkdir -p` / `cp -r` — broken on Windows without WSL/MSYS unless `start.bat` handles it.

### `tsconfig.json`
- Strict mode on, `target: ES2020`, ESM-style imports compiled to CommonJS. `noUnusedLocals`, `noUnusedParameters`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess` are all on — good rigor.
- Path aliases mirror the directory layout for `@/*` imports.

### `jest.config.js`
- Jest with `ts-jest`, node test env, setup file at `src/test/setup.ts`, coverage reporters (text/lcov/html), module name mapper for `@/*`.

### `nodemon.json`
- Watches `src/`, restarts on `.ts` / `.json` change.

### `.eslintrc.js`
- `@typescript-eslint/recommended`, console allowed, `no-explicit-any` is `warn` (consider promoting to `error`).

### `.prettierrc` / `.prettierignore` / `.editorconfig`
- Standard Prettier formatting, no surprises.

### `env.example`
- Template for runtime config:
  - Server: `NODE_ENV`, `PORT` (3000)
  - DB: `DB_HOST/PORT/NAME/USER/PASSWORD`
  - Auth: `JWT_SECRET`, `JWT_EXPIRES_IN=4h`, `GOOGLE_CLIENT_ID`
  - Email (Gmail SMTP): `EMAIL_HOST/PORT/USER/PASS`
  - Security: `BCRYPT_ROUNDS=12`, `RATE_LIMIT_WINDOW_MS=900000`, `RATE_LIMIT_MAX_REQUESTS=100`
  - Geocoding: `OPENCAGE_API_KEY`
  - Timezone: `TZ=Asia/Baghdad`
  - OneSignal: `ONESIGNAL_APP_ID`, `ONESIGNAL_REST_API_KEY`
- **CRITICAL:** the agent flagged a real-looking password (`DB_PASSWORD=Mlak1212@Mlak1212`) inside `env.example`. Example files must contain only placeholders. Treat any matching value as compromised and rotate.

### `env.test`
- Test-environment overrides; should not contain production secrets.

### `Dockerfile`
- Multi-stage Node image, builds TS then runs `node dist/index.js`. Migrations are copied via `postbuild` step.

### `docker-compose.yml` / `docker-compose.prod.yml`
- Local dev orchestration (API + PostgreSQL); prod variant separates volumes/networks. Reads from `.env`; if `env.example` defaults leak in, prod could ship dev credentials.

### `nginx.conf`
- Reverse proxy in front of the API (TLS termination, gzip).

### `healthcheck.js`
- Docker `HEALTHCHECK` script — hits `/health` and exits 0/1.

### `drop-all-tables.js`
- Standalone Node script that wipes the schema. **Destructive** — should be guarded by env or a confirmation flag.

### `run_update_and_delete.ps1`
- Windows helper script (purpose: operational maintenance — re-run migrations and clear state).

### `start.bat` / `start.sh`
- Cross-platform launch wrappers.

### `test.js`
- Loose top-level smoke test (outside the Jest tree).

### `frontend-google-auth-example.js`
- Example snippet showing how a client should call `/auth/google-auth`. Should live in `docs/`, not the repo root.

### `.gitignore`, `.dockerignore`, `.gitattributes`, `.npmrc`, `.nvmrc`
- Standard. `.gitignore` must exclude `.env` (verify before pushing).

### `CHANGELOG.md`, `CONTRIBUTING.md`, `LICENSE`, `README.md`
- README is bilingual Arabic/English-ish and documents the auth surface. Useful but partially out of date with the current routes.

---

## `src/` per-file analysis

### `src/index.ts` — application entry
- **Purpose:** Express app bootstrap, middleware stack, route mounting, server startup, graceful shutdown.
- **Stack order:** CORS → manual CORS header override (bug — see below) → Helmet (CSP **disabled**, embedder policy disabled) → Morgan → compression → `express-rate-limit` (1000 req/15min, applies to all `/api/*`) → JSON/URL-encoded body parsers (`limit: 1000mb`) → static files (`/public`, `/uploads`) → routes → 404 → error handler.
- **Routes mounted:** `/api/auth`, `/api/super_admin/*`, `/api/teacher/*`, `/api/student/*`, `/api/public/*`, `/api/payments/*`, `/api/notifications`, `/health`.
- **Cron / external init:** OneSignal client created and stored on `app.set('notificationService', …)`; failure is logged but non-fatal.
- **Issues:**
  - Lines ~65–82 manually set `Access-Control-Allow-Origin: req.headers.origin || '*'`, **defeating** the cors() allowlist above it.
  - Helmet's CSP is disabled — every script source is allowed. Re-enable or supply a policy.
  - JSON body limit of `1000mb` is a DoS amplifier; cap at low MB (1–5).
  - Rate limit is global only — no stricter buckets for `/auth/login`, `/auth/request-password-reset`, etc.
  - Graceful shutdown just calls `process.exit()` without draining the pg pool.

### `src/config/database.ts`
- **Purpose:** PostgreSQL `Pool` instance.
- **Issues:**
  - Hard-coded password fallback at line 11 (same value as `env.example`). Must require `DB_PASSWORD` instead of providing a default.
  - On idle-client error the process exits — could cause restart loops behind a process manager.
  - No connection validation at startup.

### `src/config/email.ts`
- NodeMailer transporter, Gmail SMTP. Reads `EMAIL_USER`/`EMAIL_PASS`. Falls back to plain SMTP — prefer OAuth2 or app passwords.

### `src/middleware/auth.middleware.ts`
- **Exports:** `authenticateToken`, `requireSuperAdmin`, `requireTeacher`, `requireStudent`, `requireAuth`.
- **Flow:** verify JWT signature → look up token row in `tokens` table (revocation check) → load user → assert `status='active'` → attach `req.user`.
- **Issues:** assumes `req.headers.authorization` is well-formed (`split(' ')[1]`); a malformed header can throw before the 401 message is set.

### `src/middleware/optionalAuth.ts`
- **Exports:** `optionalAuth`.
- **Issue:** attaches user to `res.locals.user` instead of `req.user`, contradicting `authenticateToken`. Downstream handlers must remember which middleware ran. Pick one location.

### `src/types/index.ts`
- Central type definitions.
- **Enums:** `UserType`, `UserStatus`, `ReservationStatus`, `BookingStatus`, `Gender`, `EnrollmentRequestStatus`, `EnrollmentStatus`, `InvoiceStatus`, `InvoiceType`, `InstallmentStatus`, `PaymentMethod`, `NewsType`.
- **Interfaces:** `BaseUser`, `Teacher`, `Student`, `SuperAdmin`, `User`, `Token`, `LoginRequest`, `GoogleAuthRequest`, `RegisterTeacherRequest`, `RegisterStudentRequest`, `StudentCourse`, `Course`, `CourseBooking`, `CourseEnrollment`, `StudentCourseEnrollment`, `CourseInvoice`, `PaymentInstallment`, `AcademicYear`, `Subject`, `Grade`, `News`, plus request/response types and `ApiResponse<T>`.
- **Issues:** Many states would be better as discriminated unions (e.g., `CourseBooking` has multiple cancellation/rejection fields that should be mutually exclusive). Naming mismatches with DB (snake_case vs camelCase) require a mapping layer in every model.

### `src/database/init.ts`
- **Purpose:** sequential SQL migration runner.
- **Logic:** `fs.readdirSync('migrations').sort()` → run each file.
- **Issues:**
  - Filename sort is the only ordering signal. Multiple `001_*` files exist (e.g., `001_create_news_table.sql` vs `001_create_users_table.sql`), so the executed order is fragile.
  - No transaction wrapping; partial failure leaves a half-applied schema.
  - No idempotency log table — re-runs depend on `CREATE … IF NOT EXISTS` in every file.
  - On failure, the error message doesn't include the offending filename.

### `src/database/migrations/` — schema history

| File | Creates / changes |
|---|---|
| `001_create_users_table.sql` | `users` (UUID PK, all three roles, location, OAuth, verification codes, indexes on email/user_type/status/created_at/location). |
| `001_create_news_table.sql` | `news` table — **collides on `001_` prefix** with above; sort order is filesystem-dependent. |
| `002_create_tokens_table.sql` | `tokens` (user_id, token, expires_at, onesignal_player_id). |
| `003_create_academic_years_table.sql` | `academic_years` (year, is_active). |
| `004_create_subjects_table.sql` | `subjects` (teacher_id FK). |
| `005_create_grades_table.sql` | `grades`. |
| `006_create_courses_table.sql` | `courses` (UUID, teacher_id, grade_id, subject_id, study_year, course_name, course_images TEXT[], price, seats_count, has_reservation, reservation_amount, soft-delete, unique partial index). |
| `010_create_course_bookings_table.sql` | `course_bookings` (status enum). |
| `020_create_lecture_scheduling.sql` | weekly/daily session scheduling. |
| `022_create_assignments.sql` | `assignments`. |
| `023_create_exams.sql` | `exams`. |
| `026_create_course_invoices_table.sql` | `course_invoices`. |
| `031_create_teacher_expenses.sql` | `teacher_expenses`. |
| `037_create_wayl_payment_links_table.sql` | `wayl_payment_links` (payment gateway integration). |
| ... (others) | enrollments, installments, evaluations, attendance, notifications, subscription packages, teacher wallets. |

Common pattern: `updated_at` trigger functions, UUID PKs, soft delete via `is_deleted boolean`, `CREATE INDEX IF NOT EXISTS`. No PostGIS — geo search is by raw lat/lon math.

### `src/models/` — data access layer

All models use static class methods, parameterized queries (SQL injection generally prevented at the query level), and direct `pool.query()`. Some support transactions with explicit `BEGIN/COMMIT/ROLLBACK`.

- **`user.model.ts`** — `create`, `findByEmail`, `findById`, `verifyEmail`, `resetPassword`, `update` (allowlisted fields), `findAll` (paginated).
  - ⚠ `findAll`'s `ORDER BY ${sortBy?.key} ${sortOrder}` is interpolated, not parameterized. **SQL injection** if `sortBy.key` is user-controlled and not whitelisted upstream.
- **`token.model.ts`** — `create`, `findByToken`, `getPlayerId`, `getPlayerIdsByUserId`, `deleteByToken`, `deleteByUserId`.
  - No cap on concurrent tokens per user.
- **`grade.model.ts`**, **`subject.model.ts`** — straightforward CRUD.
- **`course.model.ts`** — CRUD with filtering, soft delete, partial unique index on (teacher_id, study_year, course_name, grade_id, subject_id).
- **`course-booking.model.ts`** — status workflow: `pending → pre_approved → confirmed → approved`, plus `rejected/cancelled`.
- **`student-course-enrollment.model.ts`** — paid enrollments with amount tracking.
- **`course-invoice.model.ts`** — invoice CRUD + status (pending/partial/paid/overdue).
- **`payment-installment.model.ts`** — installment plan rows.
- **`assignment.model.ts`** — assignment CRUD per course.
- **`exam.model.ts`** — exam CRUD.
- **`attendance.model.ts`** — student check-in records (QR-based).
- **`news.model.ts`** — CMS for announcements (web/mobile types).
- Additional: subscription packages, teacher subscriptions, teacher wallets, wallet transactions, teacher expenses, evaluations, notifications, OneSignal player IDs, Wayl payment links.

**Cross-cutting model issues:**
- Pagination sort keys not validated in callers; the same `ORDER BY ${key}` pattern likely recurs.
- No audit log of changes (who/when/what changed).
- Date columns are `TIMESTAMP` rather than `TIMESTAMPTZ` in some migrations — risky given `TZ=Asia/Baghdad` on the server but variable client timezones.

### `src/services/` — business logic

- **`auth.service.ts`** — registration, login, OAuth (Google/Apple), email verification, password reset, profile completion. `registerTeacher`/`registerStudent` are very long; consider splitting (validation → geocoding → user creation → email → response). `sanitizeUser` strips secrets before returning.
- **`google-auth.service.ts`** — exchanges Google auth code for tokens; verifies ID token. **No state/PKCE validation** on the callback path — vulnerable to CSRF account-linking.
- **`apple-auth.service.ts`** (implied) — Apple Sign In.
- **`notification.service.ts`** — OneSignal client wrapper. Silent failures if API keys missing.
- **`qr.service.ts`** — QR code generation (saves PNG to disk; no cleanup policy).
- **`geocoding.service.ts`** — OpenCage reverse/forward geocoding. No caching → expensive at scale.
- **`location.service.ts`** — nearby teacher search via raw lat/lon. Linear scan; should use PostGIS or `earthdistance` extension.
- **`assignment.service.ts`** — CRUD + grading workflow.
- **`exam.service.ts`** — CRUD + grading.
- **`course-reminder.service.ts`**, **`session-end-reminder.service.ts`** — `node-cron` jobs that push reminders. **Single-process** — if the API restarts, in-flight schedule slots are missed.
- **`student-evaluation.service.ts`** — bulk teacher → student evaluations.
- **`teacher-search.service.ts`** — search by location/subject/availability.
- **`news.service.ts`** — CMS.
- **`booking-usage-log.service.ts`** — analytics.
- **`payment.service.ts`** (implied) — Wayl payment integration.

### `src/controllers/` — HTTP layer

Controllers use `express-validator` (inconsistently), call services, return `ApiResponse<T>` JSON. User-facing messages are in Arabic. Common gaps:

- **`auth.controller.ts`** — very large (1000+ lines). All registration/login flows live here. Issues: user enumeration (different "user not found" vs "wrong password" messages and timings), no per-endpoint rate limit, `appleCallback` reads `userType` from query string (spoofable).
- **`teacher/course.controller.ts`** — create/update/delete/restore. ⚠ updates/deletes by `id` without `AND teacher_id = req.user.id`. Image uploads are base64 in the body — no size cap in the controller (relies on the 1000 MB body limit).
- **`teacher/course-booking.controller.ts`** — approval/rejection workflow. Status transitions not enforced as a state machine.
- **`teacher/invoice.controller.ts`** — bulk invoice creation. Could be slow; no background job.
- **`teacher/assignment.controller.ts`**, **`teacher/exam.controller.ts`** — CRUD + grading.
- **`student/course-booking.controller.ts`** — booking creation, cancel, reactivate. ⚠ no seat-capacity check; no duplicate-booking guard.
- **`student/invoice.controller.ts`** — list/details/stats.
- **`student/assignment.controller.ts`**, **`student/exam.controller.ts`** — view + submit.
- **`student/attendance.controller.ts`** — QR check-in.
- **`student/dashboard.controller.ts`** — student summary.
- **`super_admin/academic-year.controller.ts`**, **`grade.controller.ts`**, **`news.controller.ts`**, **`dashboard.controller.ts`** — CRUD + reports.
- **`payments/*`** — Wayl webhook + status. ⚠ webhook lacks HMAC signature verification.
- **`notification.controller.ts`** — list/mark-read.

### `src/routes/` — HTTP routing

| File | Mount | Notes |
|---|---|---|
| `auth.routes.ts` | `/api/auth` | Mostly public; `logout`, `complete-profile`, `update-profile` are protected by `authenticateToken`. |
| `teacher/course.routes.ts` | `/api/teacher/courses` | `requireTeacher`. |
| `teacher/course-booking.routes.ts` | `/api/teacher/course-bookings` | `requireTeacher`. |
| `teacher/invoice.routes.ts` | `/api/teacher/invoices` | `requireTeacher`. |
| `teacher/assignment.routes.ts` | `/api/teacher/assignments` | `requireTeacher`. |
| `teacher/exam.routes.ts` | `/api/teacher/exams` | `requireTeacher`. |
| `student/course-booking.routes.ts` | `/api/student/course-bookings` | `requireStudent`. |
| `student/invoice.routes.ts` | `/api/student/invoices` | `requireStudent`. |
| `student/assignment.routes.ts` | `/api/student/assignments` | `requireStudent`. |
| `student/enrollment.routes.ts` | `/api/student/enrollments` | `requireStudent`. |
| `super_admin/academic-year.routes.ts` | `/api/academic-years` | `requireSuperAdmin`. |
| `super_admin/grade.routes.ts` | `/api/grades` | `requireSuperAdmin`. |
| `super_admin/news.routes.ts` | `/api/news` | `requireSuperAdmin`. |
| `public/news.routes.ts` | `/api/public/news` | Open. |
| `payments/wayl.routes.ts` | `/api/payments/wayl/*` | Webhook is open. |

### `src/utils/`

- **`image.service.ts`** — base64 → file decoder, writes to local disk; no resizing or compression; no cleanup of orphans; no signed URLs.
- **`file.util.ts`** — path helpers, validation.
- Other helpers depending on feature.

### `src/scripts/`

- **`seed_free_subscriptions.ts`** — seeds the free tier package; idempotency depends on prior state.
- **`run_course_reminders.ts`** — standalone runner for the reminder cron logic.
- **`backfill-free-subscriptions.ts`** — one-shot migration script.

### `src/test/`

- **`setup.ts`** — Jest setup.
- **`auth.test.ts`** — auth flow tests. Coverage limited; no model/service tests, no edge-case battery (timing attacks, account enumeration, expired codes).

---

## Architecture overview

### Request lifecycle
1. **HTTP** → CORS → Helmet → Morgan → compression → rate limit (global) → body parsers.
2. **Routing** → role-prefixed router (`/api/{auth,teacher,student,super_admin,public,payments}/…`).
3. **Auth middleware** → `authenticateToken` reads `Authorization: Bearer …`, verifies signature, checks `tokens` row exists, loads `users` row, asserts status='active', attaches `req.user`.
4. **Role middleware** → `requireTeacher` / `requireStudent` / `requireSuperAdmin`.
5. **Validation** → mostly `express-validator` chains in the controller (not consistent).
6. **Controller → Service → Model** → service orchestrates external calls (Google, Apple, OneSignal, OpenCage, NodeMailer); model issues parameterized SQL.
7. **Response** → `ApiResponse<T>` JSON. `content_url` is injected into every JSON response via a custom wrapper.
8. **Errors** → global handler returns 500; stack trace only in non-prod.

### Auth model
- JWT signed with `JWT_SECRET`, default 4h expiry.
- Token row in `tokens` table — logout deletes it; this is what makes JWTs revocable.
- Same row carries `onesignal_player_id` for push targeting.
- Roles: `SUPER_ADMIN`, `TEACHER`, `STUDENT`.
- OAuth: Google + Apple. Local accounts use email + bcrypt password.

### Domain workflows

**Booking → enrollment**
1. Student `POST /api/student/course-bookings` → row in `course_bookings` with `status='pending'`.
2. Teacher reviews `GET /api/teacher/course-bookings` → `PATCH /api/teacher/course-bookings/:id/pre-approve` → status becomes `pre_approved`; student is now allowed to pay the reservation amount.
3. Student pays via Wayl → webhook flips status to `confirmed` (or an invoice record marks it paid).
4. Teacher `PATCH …/confirm` (or `…/approve`) → row in `student_course_enrollments` is created.
5. Course invoices and payment installments are generated.

**Attendance**
- QR code embeds a teacher identifier (`mulhimiq://attend?teacher=<id>` per the mobile scanner). Student scans on the mobile app; the API records attendance against the active session for that teacher and student.

**Reminders**
- `node-cron` jobs poll upcoming sessions/assignments and call `notification.service` to push via OneSignal and `email.config` to send emails.

---

## API surface (grouped)

### Public
- `GET /health`
- `POST /api/auth/register/{super-admin,teacher,student}`
- `POST /api/auth/login`, `/auth/logout`
- `POST /api/auth/google-auth`, `/auth/apple-auth`, `GET /api/auth/google/callback`, `GET /api/auth/apple-redirect`
- `POST /api/auth/verify-email`, `/resend-verification`, `/request-password-reset`, `/reset-password`
- `GET /api/public/news`

### Super admin (`requireSuperAdmin`)
- `POST/GET/PATCH /api/academic-years` and `/api/academic-years/:id/activate`
- `POST/GET/PATCH /api/grades`
- `POST/GET/PATCH /api/news`
- `GET /api/super-admin/dashboard`
- `GET/PATCH /api/super-admin/subscription-packages`

### Teacher (`requireTeacher`)
- Courses: `POST/GET/PATCH/DELETE /api/teacher/courses` (+ `/:id/restore`)
- Bookings: `GET/PATCH /api/teacher/course-bookings/*` (`pre-approve`, `confirm`, `reject`, etc.)
- Assignments: `POST/GET/PATCH /api/teacher/assignments` (+ `/:id/grade`)
- Exams: `POST/GET /api/teacher/exams` (+ `/:id/grade`)
- Invoices: `POST/GET/PATCH /api/teacher/invoices` (+ bulk)
- Subjects, academic years, expenses, reports, wallet, subscription activation.

### Student (`requireStudent`)
- Bookings: `POST/GET /api/student/course-bookings` (+ `/:id/cancel`, `/reactivate`, `/stats/summary`)
- Assignments: `GET /api/student/assignments` (+ `/:id/submission`, `/:id/submit`)
- Exams: `GET /api/student/exams` (+ `/:id/my-grade`, `/report/by-type`)
- Evaluations: `GET /api/student/evaluations` (+ `/:id`)
- Attendance: `POST /api/student/attendance/check-in` (+ `/by-course/:courseId`)
- Invoices: `GET /api/student/invoices` (+ `/:id/full`, `/installments`, `/entries`, `/installments/:id/full`)
- Enrollments: `GET /api/student/enrollments` (+ schedule)
- Dashboard, search, suggested teachers/courses, teacher details, news.

### Payments
- `POST /api/payments/wayl/webhook` — **no signature check observed**
- `GET /api/payments/wayl/status/:id`

### Notifications
- `GET /api/notifications/user/my-notifications`
- `PUT /api/notifications/:id/read`
- `POST /api/user/onesignal-player-id`

---

## Quality findings (prioritized)

### Critical security
1. **Hard-coded credentials**
   - `env.example` ships a real-looking DB password.
   - `src/config/database.ts:11` has the same value as a `||` fallback.
   - **Fix:** require `DB_PASSWORD`, crash startup if missing; remove the example value.
2. **CORS allowlist bypass** — `src/index.ts:65–82` manually echoes `Origin`, overriding cors() above it.
3. **CSP / frame-ancestors disabled** in helmet (`src/index.ts:87`).
4. **OAuth callbacks missing `state` validation** — Google and Apple callback paths are vulnerable to account-linking CSRF.
5. **SQL injection via sort key** — `user.model.findAll` interpolates `sortBy.key`. Whitelist required.
6. **Missing ownership checks** on teacher mutations (courses, invoices, assignments, exams).
7. **No webhook signature verification** on `/api/payments/wayl/webhook` — invoices can be forged paid.
8. **Per-endpoint rate limits missing** — login / password-reset / verification need their own buckets.
9. **JSON body limit of 1000 MB** is a DoS amplifier; base64 image uploads compound this.
10. **User enumeration** via distinct "user not found" vs "wrong password" errors and timing differences.

### Correctness
11. **Migration runner ordering** — multiple `001_*` files, no transactions, no idempotency table.
12. **No seat-capacity check** on booking creation.
13. **`TIMESTAMP` vs `TIMESTAMPTZ`** drift across migrations; client/server clock skew bugs.
14. **No idempotency on Wayl webhook** — duplicate deliveries double-credit invoices.
15. **`optionalAuth` writes to `res.locals.user`**, others write to `req.user`. Pick one.
16. **`tokens` table has no concurrent-session cap.**

### Maintainability
17. **`@prisma/client` declared but unused** — remove or actually migrate.
18. **Inconsistent validation** — some endpoints use `express-validator`, some Joi, many neither.
19. **Inconsistent response shape** — `ApiResponse<T>` mostly, but `data`/`data.items`/`data.records` drift.
20. **`auth.controller.ts` is 1000+ lines** — split by flow.
21. **No structured logging** — `console.log`/`console.error` with no correlation ID.
22. **No OpenAPI / Swagger spec.**
23. **Mixed Arabic/English comments and messages** — pick: code English, user-facing Arabic.
24. **`postbuild` script is POSIX-only** (`mkdir -p`, `cp -r`) — Windows local builds will fail without WSL.

### Low / nice-to-have
25. Filesystem image storage doesn't scale (move to S3/Cloudinary).
26. In-process `node-cron` loses jobs on restart (use BullMQ/Redis or a managed scheduler).
27. Geocoding has no cache layer; OpenCage credits will be burned at scale.
28. No request ID / correlation header.
29. Single test file; expand coverage especially on auth and billing.

---

## Tech debt / inconsistencies summary

- DB ↔ TS mapping is manual: `snake_case` in SQL, `camelCase` in TypeScript types, both leak into responses inconsistently.
- Two ways to attach auth context (`req.user` vs `res.locals.user`).
- Validation strategy unsettled: Joi vs express-validator vs ad-hoc.
- Response envelope drift forces clients to defensively probe nested keys.
- `postbuild` and several helper scripts assume POSIX; project also ships `.bat` / `.ps1` wrappers — pick one or document both.
- No environment-specific config files (`env.development`, `env.staging`, `env.production`).
- `package.json` lists `@prisma/client`, `multer`, and several `@types/*` packages but the codebase doesn't fully exercise them.
