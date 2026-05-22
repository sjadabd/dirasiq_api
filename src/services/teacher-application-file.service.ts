// Teacher-application file ingest + read — Phase 3.
//
// Orchestrates the upload pipeline:
//   1. validate the buffer against the per-kind allowlist (MIME + size).
//   2. confirm magic bytes match the declared MIME (anti-spoofing).
//   3. write to the private store.
//   4. INSERT teacher_application_files row + UPDATE the denormalised
//      column on teacher_applications, both inside one pg transaction so a
//      DB hiccup doesn't leave an orphan file referencing nothing.
//   5. supersede any previous active file of the same kind for this
//      application (soft-delete the row + remove bytes after commit).
//
// All DB queries here use a single client / single transaction. The file
// system writes are best-effort to cleanup on rollback (deleted in catch).

import crypto from 'crypto';

import pool from '../config/database';
import {
  TeacherApplicationFileKind,
  type TeacherApplicationFile,
} from '../types';
import { ApiError, ErrorCodes } from '../utils/api-error';
import {
  detectFileFormat,
  mimeMatchesDetection,
} from '../utils/file-signature';
import { logger } from '../utils/logger';
import { PrivateStorageService } from './private-storage.service';

// ---------------------------------------------------------------------------
// Per-kind upload rules
// ---------------------------------------------------------------------------

interface KindRule {
  acceptedMimes: string[];
  maxBytes: number;
  // The column on teacher_applications we update with the latest file path
  // for this kind. Kept denormalised so the detail endpoint doesn't need a
  // join to render the application.
  denormalisedColumn: string;
}

const MB = 1024 * 1024;

const KIND_RULES: Record<TeacherApplicationFileKind, KindRule> = {
  [TeacherApplicationFileKind.PROFILE_IMAGE]: {
    acceptedMimes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
    maxBytes: 5 * MB,
    denormalisedColumn: 'profile_image',
  },
  [TeacherApplicationFileKind.CERTIFICATE_IMAGE]: {
    acceptedMimes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'],
    maxBytes: 10 * MB,
    denormalisedColumn: 'certificate_image',
  },
  [TeacherApplicationFileKind.NATIONAL_ID_IMAGE]: {
    acceptedMimes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
    maxBytes: 5 * MB,
    denormalisedColumn: 'national_id_image',
  },
  [TeacherApplicationFileKind.OPTIONAL_ATTACHMENT]: {
    acceptedMimes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'],
    maxBytes: 10 * MB,
    denormalisedColumn: 'optional_attachment',
  },
  [TeacherApplicationFileKind.INTRO_VIDEO]: {
    acceptedMimes: ['video/mp4'],
    maxBytes: 50 * MB,
    denormalisedColumn: 'intro_video_url',
  },
};

// Hard cap regardless of kind — extra guardrail against a wildly oversized
// upload that somehow slipped past the per-kind check. multer enforces the
// same limit at the route level.
export const ABSOLUTE_MAX_UPLOAD_BYTES = 50 * MB;

// ---------------------------------------------------------------------------
// Public selection: file columns sent to the client. We deliberately omit
// `storage_key` — it's a server-internal path.
// ---------------------------------------------------------------------------

const FILE_PUBLIC_COLUMNS = `
  id,
  application_id   AS "applicationId",
  kind,
  original_filename AS "originalFilename",
  mime_type        AS "mimeType",
  byte_size        AS "byteSize",
  magic_validated  AS "magicValidated",
  created_at       AS "createdAt",
  deleted_at       AS "deletedAt"
`;

type PublicFile = Omit<TeacherApplicationFile, 'storageKey'>;

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class TeacherApplicationFileService {
  /**
   * Ingest a single uploaded file. Throws ApiError on any validation
   * failure; the global error middleware translates to the canonical
   * envelope.
   */
  static async ingest(params: {
    applicationId: string;
    kind: TeacherApplicationFileKind;
    declaredMime: string | undefined;
    originalFilename: string | undefined;
    bytes: Buffer;
  }): Promise<PublicFile> {
    const rule = KIND_RULES[params.kind];
    if (!rule) {
      throw new ApiError(
        400,
        'نوع الملف غير معروف',
        ErrorCodes.VALIDATION_ERROR,
        { fields: [{ field: 'kind', message: 'invalid kind', code: 'invalid_kind' }] }
      );
    }

    // 1. Size guard (multer also enforces; this is defence in depth).
    if (params.bytes.byteLength === 0) {
      throw new ApiError(400, 'الملف فارغ', ErrorCodes.VALIDATION_ERROR);
    }
    if (params.bytes.byteLength > rule.maxBytes) {
      throw new ApiError(
        413,
        `الحجم يتجاوز الحد المسموح (${(rule.maxBytes / MB).toFixed(0)} ميغابايت)`,
        ErrorCodes.VALIDATION_ERROR,
        { maxBytes: rule.maxBytes }
      );
    }

    // 2. MIME allowlist for this kind.
    const declared = (params.declaredMime || '').toLowerCase();
    if (!rule.acceptedMimes.includes(declared)) {
      throw new ApiError(
        400,
        'نوع الملف غير مدعوم لهذا الحقل',
        ErrorCodes.VALIDATION_ERROR,
        { declaredMime: declared, acceptedMimes: rule.acceptedMimes }
      );
    }

    // 3. Magic-byte detection — refuse if the bytes don't match the
    //    declared MIME (a .jpg renamed to .png, or a PHP webshell trying
    //    to ride a "video/mp4" upload, fail here).
    const detected = detectFileFormat(params.bytes);
    if (!detected) {
      throw new ApiError(
        400,
        'تعذر التحقق من نوع الملف من المحتوى',
        ErrorCodes.VALIDATION_ERROR
      );
    }
    if (!mimeMatchesDetection(declared, detected.format)) {
      throw new ApiError(
        400,
        'محتوى الملف لا يتطابق مع النوع المُعلن',
        ErrorCodes.VALIDATION_ERROR,
        { declaredMime: declared, detected: detected.format }
      );
    }

    // 4. Confirm the application exists (cheap pre-check before opening a
    //    transaction). The transaction below also re-checks under FOR UPDATE.
    const appCheck = await pool.query<{ id: string; application_status: string }>(
      `SELECT id, application_status
         FROM teacher_applications
        WHERE id = $1 AND deleted_at IS NULL
        LIMIT 1`,
      [params.applicationId]
    );
    if (appCheck.rows.length === 0) {
      throw new ApiError(404, 'طلب الانضمام غير موجود', ErrorCodes.NOT_FOUND);
    }
    const appStatus = appCheck.rows[0]!.application_status;
    if (appStatus === 'approved' || appStatus === 'rejected') {
      throw new ApiError(
        409,
        'لا يمكن رفع ملفات على طلب تم البت فيه',
        ErrorCodes.ALREADY_PROCESSED,
        { currentStatus: appStatus }
      );
    }

    // 5. Generate the fileId before write so the disk file and the DB row
    //    share the same identifier — makes orphan cleanup trivial.
    const fileId = crypto.randomUUID();

    // 6. Write to disk first. If the DB transaction later rolls back, the
    //    catch block removes the on-disk bytes.
    const storageKey = await PrivateStorageService.writeApplicationFile({
      applicationId: params.applicationId,
      fileId,
      extension: detected.extension,
      bytes: params.bytes,
    });

    // 7. Transactional metadata write + denormalised column update +
    //    soft-deletion of any previous active file of the same kind.
    const client = await pool.connect();
    let supersededStorageKey: string | null = null;
    try {
      await client.query('BEGIN');

      // Lock the application row to serialise concurrent uploads for the
      // same kind. Cheap because uploads are sequential per Flutter session.
      const lockRes = await client.query<{ application_status: string }>(
        `SELECT application_status
           FROM teacher_applications
          WHERE id = $1 AND deleted_at IS NULL
          FOR UPDATE`,
        [params.applicationId]
      );
      const row = lockRes.rows[0];
      if (!row) {
        throw new ApiError(404, 'طلب الانضمام غير موجود', ErrorCodes.NOT_FOUND);
      }
      if (row.application_status === 'approved' || row.application_status === 'rejected') {
        throw new ApiError(
          409,
          'لا يمكن رفع ملفات على طلب تم البت فيه',
          ErrorCodes.ALREADY_PROCESSED
        );
      }

      // Soft-delete any previously active file of the same kind for this
      // application. We capture its storage_key so we can remove the bytes
      // AFTER the transaction commits (avoids deleting bytes that a
      // rolled-back transaction would have re-needed).
      const prevRes = await client.query<{ storage_key: string }>(
        `UPDATE teacher_application_files
            SET deleted_at = NOW()
          WHERE application_id = $1
            AND kind = $2
            AND deleted_at IS NULL
          RETURNING storage_key`,
        [params.applicationId, params.kind]
      );
      if (prevRes.rows.length > 0) {
        supersededStorageKey = prevRes.rows[0]!.storage_key;
      }

      // Insert the new file row.
      await client.query(
        `INSERT INTO teacher_application_files (
            id, application_id, kind,
            storage_key, original_filename, mime_type, byte_size, magic_validated
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, true)`,
        [
          fileId,
          params.applicationId,
          params.kind,
          storageKey,
          params.originalFilename ?? null,
          detected.mimeType, // store the canonical mime, not the declared one
          params.bytes.byteLength,
        ]
      );

      // Update the denormalised column on the application — we store the
      // fileId rather than the storage_key so the column reveals nothing
      // about the on-disk layout.
      await client.query(
        `UPDATE teacher_applications
            SET ${rule.denormalisedColumn} = $1
          WHERE id = $2`,
        [fileId, params.applicationId]
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      // Best-effort: remove the bytes we just wrote since the DB doesn't
      // know about them anymore.
      await PrivateStorageService.deleteIfExists(storageKey).catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }

    // Post-commit cleanup: remove superseded bytes (if any). Don't fail
    // the response if this fails — the row is already marked deleted and
    // an orphan file can be swept later.
    if (supersededStorageKey) {
      await PrivateStorageService.deleteIfExists(supersededStorageKey).catch(
        (err) => logger.warn({ err }, 'failed to delete superseded upload')
      );
    }

    return {
      id: fileId,
      applicationId: params.applicationId,
      kind: params.kind,
      originalFilename: params.originalFilename ?? null,
      mimeType: detected.mimeType,
      byteSize: params.bytes.byteLength,
      magicValidated: true,
      createdAt: new Date().toISOString(),
      deletedAt: null,
    };
  }

  /**
   * List active files for an application — used by the super-admin detail
   * page. Includes every kind currently held by this application.
   */
  static async listForApplication(applicationId: string): Promise<PublicFile[]> {
    const { rows } = await pool.query<PublicFile>(
      `SELECT ${FILE_PUBLIC_COLUMNS}
         FROM teacher_application_files
        WHERE application_id = $1
          AND deleted_at IS NULL
        ORDER BY created_at ASC`,
      [applicationId]
    );
    return rows;
  }

  /**
   * Resolve a file row + return data needed to stream it. Used by the
   * auth-gated streaming endpoint.
   */
  static async getForStream(
    applicationId: string,
    fileId: string
  ): Promise<{
    storageKey: string;
    mimeType: string;
    byteSize: number;
    originalFilename: string | null;
  }> {
    const { rows } = await pool.query<{
      storage_key: string;
      mime_type: string;
      byte_size: number;
      original_filename: string | null;
    }>(
      `SELECT storage_key, mime_type, byte_size, original_filename
         FROM teacher_application_files
        WHERE id = $1
          AND application_id = $2
          AND deleted_at IS NULL
        LIMIT 1`,
      [fileId, applicationId]
    );
    const row = rows[0];
    if (!row) {
      throw new ApiError(404, 'الملف غير موجود', ErrorCodes.NOT_FOUND);
    }
    return {
      storageKey: row.storage_key,
      mimeType: row.mime_type,
      byteSize: Number(row.byte_size),
      originalFilename: row.original_filename,
    };
  }
}
