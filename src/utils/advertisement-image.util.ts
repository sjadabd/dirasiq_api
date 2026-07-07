import fs from 'fs';
import path from 'path';

import { ApiError, ErrorCodes } from '../utils/api-error';

const UPLOAD_DIR = path.resolve(process.cwd(), 'public', 'uploads', 'advertisements');

const ALLOWED_IMAGE_MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

export async function saveAdvertisementBase64Image(
  base64Data: string,
  maxBytes: number,
): Promise<string> {
  const matches = base64Data.match(/^data:(image\/[-+\w.]+);base64,(.+)$/i);
  if (!matches) {
    throw new ApiError(400, 'بيانات الصورة غير صحيحة', ErrorCodes.VALIDATION_ERROR);
  }
  const mimeType = (matches[1] as string).toLowerCase();
  const base64String = matches[2] as string;
  const ext = ALLOWED_IMAGE_MIME_TO_EXT[mimeType];
  if (!ext) {
    throw new ApiError(400, 'صيغة الصورة غير مدعومة', ErrorCodes.VALIDATION_ERROR);
  }
  const buffer = Buffer.from(base64String, 'base64');
  if (buffer.byteLength > maxBytes) {
    throw new ApiError(400, 'حجم الصورة كبير جداً', ErrorCodes.VALIDATION_ERROR);
  }
  const fileName = `ad_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
  const filePath = path.join(UPLOAD_DIR, fileName);
  await fs.promises.mkdir(UPLOAD_DIR, { recursive: true });
  await fs.promises.writeFile(filePath, buffer);
  return `/uploads/advertisements/${fileName}`;
}

export async function maybeSaveAdvertisementImage(
  imageUrl: string | null | undefined,
  maxBytes: number,
): Promise<string | null | undefined> {
  if (imageUrl == null) return imageUrl;
  if (typeof imageUrl === 'string' && imageUrl.startsWith('data:image')) {
    return saveAdvertisementBase64Image(imageUrl, maxBytes);
  }
  return imageUrl;
}
