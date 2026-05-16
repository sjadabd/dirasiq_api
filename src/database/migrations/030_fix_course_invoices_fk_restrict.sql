-- ============================================================================
-- 030_fix_course_invoices_fk_restrict.sql
-- ----------------------------------------------------------------------------
-- Correct the FK ON DELETE behaviour on course_invoices.
--
-- This was a v2 drift: the v2 plan §4 delta #5 said all financial-table FKs
-- (course_invoices, invoice_installments, teacher_wallets, …) should
-- *RESTRICT* deletes from users so that financial / audit data survives a
-- user being deleted. teacher_wallets and teacher_wallet_transactions were
-- authored correctly in 027; wayl_payment_links in 028; but 024_course_invoices
-- was authored with ON DELETE CASCADE — a leftover from the legacy schema.
--
-- This migration fixes the drift forward (does not edit 024, preserves the
-- schema_migrations checksum for 024).
--
-- v2 contract restored:
--   • course_invoices.student_id  → users.id     ON DELETE RESTRICT
--   • course_invoices.teacher_id  → users.id     ON DELETE RESTRICT
--   • course_invoices.course_id   → courses.id   ON DELETE RESTRICT
--     (financial record outlives a deleted course; soft-delete courses
--      instead — courses already has is_deleted)
--
-- invoice_installments.invoice_id → course_invoices.id is left as CASCADE
-- because deleting the parent invoice should remove its installment plan
-- (the installments aren't independently meaningful).
--
-- Idempotent:    yes (the DROP CONSTRAINT IF EXISTS pattern)
-- Transactional: handled by the runner
-- Reversible:    yes (DROP and re-add with CASCADE if needed)
-- ============================================================================

ALTER TABLE course_invoices
    DROP CONSTRAINT IF EXISTS course_invoices_student_id_fkey,
    DROP CONSTRAINT IF EXISTS course_invoices_teacher_id_fkey,
    DROP CONSTRAINT IF EXISTS course_invoices_course_id_fkey;

ALTER TABLE course_invoices
    ADD CONSTRAINT course_invoices_student_id_fkey
        FOREIGN KEY (student_id) REFERENCES users(id)   ON DELETE RESTRICT,
    ADD CONSTRAINT course_invoices_teacher_id_fkey
        FOREIGN KEY (teacher_id) REFERENCES users(id)   ON DELETE RESTRICT,
    ADD CONSTRAINT course_invoices_course_id_fkey
        FOREIGN KEY (course_id)  REFERENCES courses(id) ON DELETE RESTRICT;
