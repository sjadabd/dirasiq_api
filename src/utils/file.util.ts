import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

function ensureDirSync(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function parseBase64(input: string): { mime: string | null; data: string } {
  const dataUrlMatch = /^data:([\w\/\-\.\+]+);base64,(.*)$/i.exec(input);
  if (dataUrlMatch) {
    return { mime: dataUrlMatch[1] as string, data: dataUrlMatch[2] as string };
  }
  return { mime: null, data: input };
}

function extFromMime(mime: string | null, fallback: string): string {
  if (!mime) return fallback;
  if (mime === 'application/pdf') return '.pdf';
  if (mime === 'image/jpeg') return '.jpg';
  if (mime === 'image/png') return '.png';
  if (mime === 'image/webp') return '.webp';
  if (mime === 'image/gif') return '.gif';
  const slash = mime.indexOf('/');
  if (slash > 0) return '.' + mime.slice(slash + 1);
  return fallback;
}

export async function saveBase64File(base64: string, baseDir: string, fileName?: string): Promise<string> {
  const { mime, data } = parseBase64(base64);
  const buffer = Buffer.from(data, 'base64');
  const ext = fileName ? path.extname(fileName) : extFromMime(mime, '.bin');
  const safeName = fileName && path.basename(fileName) !== '' ? fileName : `${Date.now()}_${crypto.randomBytes(6).toString('hex')}${ext}`;
  ensureDirSync(baseDir);
  const fullPath = path.join(baseDir, safeName);
  await fs.promises.writeFile(fullPath, buffer);
  return fullPath; // adjust to public URL mapping if needed
}

export async function saveMultipleBase64Images(imagesBase64: string[], baseDir: string): Promise<string[]> {
  const results: string[] = [];
  ensureDirSync(baseDir);
  for (const img of imagesBase64) {
    const { mime, data } = parseBase64(img);
    const ext = extFromMime(mime, '.jpg');
    const name = `${Date.now()}_${crypto.randomBytes(6).toString('hex')}${ext}`;
    const fullPath = path.join(baseDir, name);
    await fs.promises.writeFile(fullPath, Buffer.from(data, 'base64'));
    results.push(fullPath);
  }
  return results;
}
