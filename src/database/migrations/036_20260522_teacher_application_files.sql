-- ============================================================================
-- 036_20260522_teacher_application_files.sql
-- ----------------------------------------------------------------------------
-- Teacher Onboarding — Phase 3: secure private uploads.
--
-- Holds metadata for files attached to a teacher_application. The file bytes
-- themselves live OUTSIDE the public /uploads tree (under
-- $PRIVATE_STORAGE_DIR/teacher-applications/<applicationId>/) so they can
-- never be served by express.static. Access goes exclusively through the
-- auth-gated streaming endpoint in the super-admin router.
--
-- One row per uploaded file. The denormalised path columns on
-- teacher_applications (profile_image, certificate_image, national_id_image,
-- optional_attachment, intro_video_url) are kept and point at the *current*
-- file for each kind — useful for the detail endpoint. When a teacher
-- re-uploads the same kind we mark the old row deleted_at and overwrite the
-- application column with the new fileId.
--
-- Idempotent:    yes
-- Transactional: handled by the runner.
-- ============================================================================

CREATE TABLE IF NOT EXISTS teacher_application_files (
    id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id      UUID         NOT NULL
        REFERENCES teacher_applications(id) ON DELETE CASCADE,

    -- Which slot does this file belong to.
    kind                VARCHAR(30)  NOT NULL CHECK (kind IN (
        'profile_image',
        'certificate_image',
        'national_id_image',
        'optional_attachment',
        'intro_video'
    )),

    -- Where the bytes live, relative to PRIVATE_STORAGE_DIR. Never a URL,
    -- never a /uploads/ path — the storage service resolves to an absolute
    -- path internally and refuses to traverse out of the root.
    storage_key         VARCHAR(500) NOT NULL,

    -- Provenance + integrity.
    original_filename   VARCHAR(500),
    mime_type           VARCHAR(100) NOT NULL,
    byte_size           BIGINT       NOT NULL CHECK (byte_size > 0),

    -- True once magic-byte validation has confirmed the declared MIME at
    -- ingest time. We never set this to true after the row is created — it's
    -- a one-shot proof, not a live check.
    magic_validated     BOOLEAN      NOT NULL DEFAULT false,

    created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    deleted_at          TIMESTAMPTZ
);

COMMENT ON TABLE  teacher_application_files IS 'Metadata for files attached to a teacher_application. Bytes live in PRIVATE_STORAGE_DIR; access is auth-gated.';
COMMENT ON COLUMN teacher_application_files.storage_key IS 'Path relative to PRIVATE_STORAGE_DIR/teacher-applications/. Resolved server-side.';
COMMENT ON COLUMN teacher_application_files.magic_validated IS 'Set true at ingest after first-bytes signature matches the declared mime_type.';

-- Hot path: super-admin opens an application, we render the file list.
CREATE INDEX IF NOT EXISTS idx_teacher_application_files_application
    ON teacher_application_files (application_id, kind)
    WHERE deleted_at IS NULL;

-- Sweep stale rows from the same kind on re-upload (service uses this).
CREATE INDEX IF NOT EXISTS idx_teacher_application_files_kind_active
    ON teacher_application_files (application_id, kind, created_at DESC)
    WHERE deleted_at IS NULL;
