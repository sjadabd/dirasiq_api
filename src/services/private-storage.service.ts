// Private file storage for teacher-application uploads (Phase 3).
//
// Writes bytes OUTSIDE the public /uploads tree so express.static can never
// serve them. The only way to fetch a stored file is through an auth-gated
// streaming endpoint (super-admin only — see the routes module).
//
// Path layout:
//   <PRIVATE_STORAGE_DIR>/teacher-applications/<applicationId>/<fileId><ext>
//
// PRIVATE_STORAGE_DIR is read from env once at startup. In production it
// should point at a docker volume that survives container restarts (the
// containers are immutable, the data is not).

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

import { logger } from '../utils/logger';

const PRIVATE_STORAGE_DIR = path.resolve(
  process.env['PRIVATE_STORAGE_DIR'] ||
    // Default keeps everything inside the container (or repo root in dev).
    path.join(process.cwd(), 'private')
);

const APPLICATIONS_ROOT = path.join(PRIVATE_STORAGE_DIR, 'teacher-applications');

// Ensure the root exists once at module load. fs.mkdirSync is a no-op when
// the directory already exists.
fs.mkdirSync(APPLICATIONS_ROOT, { recursive: true });

/**
 * Resolve a storage key (a relative path) to an absolute filesystem path,
 * rejecting any attempt to traverse outside the applications root.
 *
 * Storage keys are produced by this service and always rooted at
 * `teacher-applications/<applicationId>/<fileId><ext>`. We re-validate the
 * resolved path against the root so a bad DB row or a misconfigured caller
 * cannot reach `/etc/passwd`.
 */
function resolveSafe(storageKey: string): string {
  if (!storageKey || storageKey.includes('\x00')) {
    throw new Error('invalid storage key');
  }
  const abs = path.resolve(PRIVATE_STORAGE_DIR, storageKey);
  const root = PRIVATE_STORAGE_DIR + path.sep;
  if (!abs.startsWith(root)) {
    throw new Error(`storage key escapes root: ${storageKey}`);
  }
  return abs;
}

export class PrivateStorageService {
  /**
   * Write a buffer to the private store under
   * `teacher-applications/<applicationId>/<fileId><ext>` and return the
   * relative storage_key. Caller passes a fileId so the on-disk filename
   * matches the DB row.
   */
  static async writeApplicationFile(params: {
    applicationId: string;
    fileId: string;
    extension: string;
    bytes: Buffer;
  }): Promise<string> {
    const safeExt = params.extension.startsWith('.')
      ? params.extension
      : `.${params.extension}`;
    const relativeKey = path.posix.join(
      'teacher-applications',
      params.applicationId,
      `${params.fileId}${safeExt}`
    );
    const absolutePath = resolveSafe(relativeKey);

    await fs.promises.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.promises.writeFile(absolutePath, params.bytes, { mode: 0o600 });
    return relativeKey;
  }

  /**
   * Read a file back. The caller (the streaming endpoint) is responsible
   * for auth — this method does not enforce access control.
   */
  static absolutePathFor(storageKey: string): string {
    return resolveSafe(storageKey);
  }

  /**
   * Open a read stream. Throws if the file is missing.
   */
  static streamFor(storageKey: string): fs.ReadStream {
    const abs = resolveSafe(storageKey);
    if (!fs.existsSync(abs)) {
      throw new Error(`file not found: ${storageKey}`);
    }
    return fs.createReadStream(abs);
  }

  /**
   * Delete bytes from disk (used when a re-upload supersedes an earlier
   * file). Best-effort: a missing file logs a warning but does not throw.
   * DB row marking happens in the service layer.
   */
  static async deleteIfExists(storageKey: string): Promise<void> {
    try {
      const abs = resolveSafe(storageKey);
      await fs.promises.unlink(abs);
    } catch (err: unknown) {
      const code = (err as { code?: string } | null)?.code;
      if (code === 'ENOENT') {
        return; // already gone — fine
      }
      logger.warn({ err, storageKey }, 'private storage: delete failed');
    }
  }

  /**
   * Compute a SHA-256 of the bytes for opportunistic integrity logging.
   * Not used as content-addressing — file ids are still UUIDs.
   */
  static digestSha256(bytes: Buffer): string {
    return crypto.createHash('sha256').update(bytes).digest('hex');
  }
}

export const PRIVATE_STORAGE_PATHS = {
  root: PRIVATE_STORAGE_DIR,
  applications: APPLICATIONS_ROOT,
};
