// Magic-byte file-type detection for the small set of formats the
// teacher-application uploads accept. We do this in-house instead of pulling
// `file-type` (an ESM-only package that doesn't play nicely with the current
// CJS tsconfig) because the supported set is tiny and the signatures are
// stable across decades.
//
// Returned `format` strings line up with the MIME types we accept upstream.
//
// All checks read at most the first ~16 bytes of the buffer.

export type DetectedFormat = 'jpeg' | 'png' | 'webp' | 'pdf' | 'mp4';

export type DetectedFile = {
  format: DetectedFormat;
  mimeType: string;
  extension: string;
};

const startsWith = (buf: Buffer, sig: number[]): boolean => {
  if (buf.length < sig.length) return false;
  for (let i = 0; i < sig.length; i++) {
    if (buf[i] !== sig[i]) return false;
  }
  return true;
};

const equalsAt = (buf: Buffer, offset: number, sig: number[]): boolean => {
  if (buf.length < offset + sig.length) return false;
  for (let i = 0; i < sig.length; i++) {
    if (buf[offset + i] !== sig[i]) return false;
  }
  return true;
};

/**
 * Detect a file's true format from its first bytes. Returns `null` if the
 * format is not in our allowlist — callers must treat that as a hard reject.
 *
 * Signatures (RFC + Wikipedia):
 *   JPEG : FF D8 FF
 *   PNG  : 89 50 4E 47 0D 0A 1A 0A
 *   WebP : "RIFF"....."WEBP"  (52 49 46 46 ?? ?? ?? ?? 57 45 42 50)
 *   PDF  : "%PDF-" (25 50 44 46 2D)
 *   MP4  : at offset 4, "ftyp" (66 74 79 70)
 */
export function detectFileFormat(buf: Buffer): DetectedFile | null {
  if (startsWith(buf, [0xff, 0xd8, 0xff])) {
    return { format: 'jpeg', mimeType: 'image/jpeg', extension: '.jpg' };
  }
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { format: 'png', mimeType: 'image/png', extension: '.png' };
  }
  if (
    startsWith(buf, [0x52, 0x49, 0x46, 0x46]) &&
    equalsAt(buf, 8, [0x57, 0x45, 0x42, 0x50])
  ) {
    return { format: 'webp', mimeType: 'image/webp', extension: '.webp' };
  }
  if (startsWith(buf, [0x25, 0x50, 0x44, 0x46, 0x2d])) {
    return { format: 'pdf', mimeType: 'application/pdf', extension: '.pdf' };
  }
  if (equalsAt(buf, 4, [0x66, 0x74, 0x79, 0x70])) {
    return { format: 'mp4', mimeType: 'video/mp4', extension: '.mp4' };
  }
  return null;
}

// Map a declared client MIME to the format(s) that may legitimately back it.
// Used to verify "the bytes are what the client claimed".
const MIME_TO_FORMAT: Record<string, DetectedFormat[]> = {
  'image/jpeg': ['jpeg'],
  'image/jpg': ['jpeg'],
  'image/pjpeg': ['jpeg'],
  'image/png': ['png'],
  'image/webp': ['webp'],
  'application/pdf': ['pdf'],
  'video/mp4': ['mp4'],
};

/**
 * True if the detected magic-byte format matches one of the formats expected
 * for the declared MIME type. Compares case-insensitively to be lenient with
 * client headers.
 */
export function mimeMatchesDetection(
  declaredMime: string | undefined | null,
  detected: DetectedFormat
): boolean {
  if (!declaredMime) return false;
  const allowed = MIME_TO_FORMAT[declaredMime.toLowerCase()];
  return Array.isArray(allowed) && allowed.includes(detected);
}
