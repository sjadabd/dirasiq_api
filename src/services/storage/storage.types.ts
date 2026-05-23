// Storage abstraction — Phase 10.1.B.
//
// Single interface around "where do we put non-video bytes" (cover images,
// thumbnails, future static teacher assets). Video bytes are NOT routed
// through this — they go direct to Bunny Stream via the dedicated upload
// URL flow, so this abstraction only sees small (<10 MB) blobs.
//
// Implementations live in sibling files:
//   - local-storage.backend.ts (default; writes to ./public/uploads/...)
//   - s3-storage.backend.ts    (stub for now; throws NotImplemented)
//
// Selection via env var STORAGE_BACKEND={local|s3}. Default 'local'.

export type StorageBackendKind = 'local' | 's3';

export interface StoragePutOptions {
  /** Logical key, e.g. "video-courses/<courseId>/cover.png". */
  key: string;
  /** Raw bytes (Buffer). */
  bytes: Buffer;
  /** MIME type (e.g. "image/png"). */
  contentType: string;
  /** Optional cache-control hint for CDN-backed backends. */
  cacheControl?: string;
}

export interface StorageObjectMeta {
  key: string;
  size: number;
  contentType: string;
  /**
   * Fully-resolved URL clients can fetch. For the local backend this is a
   * relative `/public/...` path served by Express static (resolved against
   * `content_url` by the response wrapper). For S3 backends this is the
   * public CDN URL (or a signed URL if the bucket is private).
   */
  url: string;
}

export interface StorageBackend {
  readonly kind: StorageBackendKind;

  /**
   * Persist bytes under `key`. Caller is responsible for collision-free key
   * generation (typically: `<area>/<entityId>/<uuid>.<ext>`).
   *
   * Implementations MUST reject keys containing `..` or absolute paths to
   * prevent path-traversal even though the safeKey() helper exists upstream.
   */
  put(opts: StoragePutOptions): Promise<StorageObjectMeta>;

  /**
   * Delete the object at `key`. Treats "key not found" as success — the
   * caller's intent is "ensure this key is gone".
   */
  delete(key: string): Promise<void>;

  /**
   * Return the URL clients should use to fetch the object. Pure function —
   * does not hit the storage to verify existence.
   */
  publicUrl(key: string): string;
}
