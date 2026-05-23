// S3-compatible storage backend — Phase 10.1.B stub.
//
// Placeholder. When the project eventually moves cover-image / asset storage
// off the VPS disk (e.g. to Wasabi, Cloudflare R2, or AWS S3), this class
// gets a real implementation using `@aws-sdk/client-s3` (which is intentionally
// NOT added to package.json yet — we don't pay the dependency weight until
// the swap is actually planned).
//
// Until then, instantiating this class throws on every call so a stray
// `STORAGE_BACKEND=s3` in the env fails fast instead of silently dropping
// uploads.

import { ApiError, ErrorCodes } from '../../utils/api-error';
import type {
  StorageBackend,
  StorageBackendKind,
  StorageObjectMeta,
  StoragePutOptions,
} from './storage.types';

export class S3StorageBackend implements StorageBackend {
  readonly kind: StorageBackendKind = 's3';

  async put(_opts: StoragePutOptions): Promise<StorageObjectMeta> {
    throw new ApiError(
      503,
      'S3 storage backend is not implemented yet (stub)',
      ErrorCodes.SERVICE_UNAVAILABLE
    );
  }

  async delete(_key: string): Promise<void> {
    throw new ApiError(
      503,
      'S3 storage backend is not implemented yet (stub)',
      ErrorCodes.SERVICE_UNAVAILABLE
    );
  }

  publicUrl(_key: string): string {
    throw new ApiError(
      503,
      'S3 storage backend is not implemented yet (stub)',
      ErrorCodes.SERVICE_UNAVAILABLE
    );
  }
}
