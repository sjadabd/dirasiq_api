// Storage backend factory — Phase 10.1.B.
//
// One process-wide singleton selected by the STORAGE_BACKEND env var.
// Default 'local'. Unknown values fail-fast at boot so a typo in prod
// never silently routes uploads to the wrong place.

import { LocalStorageBackend } from './local-storage.backend';
import { S3StorageBackend } from './s3-storage.backend';
import type { StorageBackend, StorageBackendKind } from './storage.types';

export type { StorageBackend, StorageObjectMeta, StoragePutOptions } from './storage.types';

let cached: StorageBackend | null = null;

export function getStorageBackend(): StorageBackend {
  if (cached) return cached;

  const raw = (process.env['STORAGE_BACKEND'] || 'local').toLowerCase();
  if (raw !== 'local' && raw !== 's3') {
    throw new Error(
      `Invalid STORAGE_BACKEND=${raw}. Must be 'local' or 's3'.`
    );
  }
  const kind = raw as StorageBackendKind;

  cached = kind === 's3' ? new S3StorageBackend() : new LocalStorageBackend();
  return cached;
}

/** Test-only — reset the cached singleton so per-test env mutations land. */
export function resetStorageBackendForTests(): void {
  cached = null;
}
