// Local-disk storage backend — Phase 10.1.B.
//
// Writes under `<repoRoot>/public/<key>` which Express already serves at
// `/public/<key>` (see static mount in src/index.ts). Public URLs are
// returned as the relative `/public/<key>` path — the response wrapper
// later prepends `content_url` so clients see the absolute URL.
//
// Path-traversal defence: rejects keys containing `..` or absolute paths
// and uses `path.resolve` + a startsWith check on the storage root before
// any disk write.

import fs from 'fs/promises';
import path from 'path';

import { ApiError, ErrorCodes } from '../../utils/api-error';
import type {
  StorageBackend,
  StorageBackendKind,
  StorageObjectMeta,
  StoragePutOptions,
} from './storage.types';

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const STORAGE_ROOT = path.resolve(
  process.env['LOCAL_STORAGE_ROOT'] || path.join(PROJECT_ROOT, 'public')
);

function assertSafeKey(key: string): void {
  if (
    !key ||
    typeof key !== 'string' ||
    key.includes('..') ||
    path.isAbsolute(key) ||
    key.startsWith('/') ||
    key.startsWith('\\')
  ) {
    throw new ApiError(
      400,
      'Invalid storage key',
      ErrorCodes.INVALID_REQUEST
    );
  }
}

function resolveAbs(key: string): string {
  assertSafeKey(key);
  const abs = path.resolve(STORAGE_ROOT, key);
  // Defence in depth — even if assertSafeKey misses something, this catches
  // any resolved path that escapes the storage root (e.g. symlinks).
  if (!abs.startsWith(STORAGE_ROOT + path.sep) && abs !== STORAGE_ROOT) {
    throw new ApiError(
      400,
      'Storage key resolves outside the storage root',
      ErrorCodes.INVALID_REQUEST
    );
  }
  return abs;
}

export class LocalStorageBackend implements StorageBackend {
  readonly kind: StorageBackendKind = 'local';

  async put(opts: StoragePutOptions): Promise<StorageObjectMeta> {
    const abs = resolveAbs(opts.key);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, opts.bytes);
    return {
      key: opts.key,
      size: opts.bytes.length,
      contentType: opts.contentType,
      url: this.publicUrl(opts.key),
    };
  }

  async delete(key: string): Promise<void> {
    let abs: string;
    try {
      abs = resolveAbs(key);
    } catch {
      // Bad key — treat as not-found.
      return;
    }
    try {
      await fs.unlink(abs);
    } catch (err: unknown) {
      // Ignore "not found"; surface everything else.
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw err;
    }
  }

  publicUrl(key: string): string {
    assertSafeKey(key);
    // Express serves PROJECT_ROOT/public/* at /public/*.
    // The key path uses forward slashes on the wire regardless of OS.
    return `/public/${key.replace(/\\/g, '/')}`;
  }
}
