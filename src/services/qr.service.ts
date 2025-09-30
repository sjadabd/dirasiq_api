import fs from 'fs';
import path from 'path';
import QRCode from 'qrcode';
import { UserModel } from '@/models/user.model';

export class QrService {
  // Ensure a reusable teacher QR exists. If missing, generate and persist path.
  static async ensureTeacherQr(teacherId: string): Promise<{ imagePath: string; publicUrl: string }> {
    // Determine paths
    const uploadsRoot = path.resolve(process.cwd(), 'public', 'uploads', 'teachers', teacherId);
    const fileName = 'qr.png';
    const filePath = path.join(uploadsRoot, fileName);

    // Ensure directory exists
    await fs.promises.mkdir(uploadsRoot, { recursive: true });

    // Check if already exists in DB
    const user = await UserModel.findById(teacherId);
    const existing = (user as any)?.teacher_qr_image_path as string | undefined;
    if (existing && fs.existsSync(path.resolve(process.cwd(), existing))) {
      return { imagePath: existing, publicUrl: QrService.toPublicUrl(existing) };
    }

    // Build payload URL (students app reads it and calls backend)
    const baseUrl = process.env['PUBLIC_BASE_URL'] || '';
    const payload = baseUrl
      ? `${baseUrl.replace(/\/$/, '')}/a?c=${encodeURIComponent(teacherId)}`
      : `dirasiq://attend?teacher=${encodeURIComponent(teacherId)}`;

    // Generate PNG
    await QRCode.toFile(filePath, payload, {
      errorCorrectionLevel: 'M',
      type: 'png',
      margin: 1,
      width: 512,
      color: { dark: '#000000', light: '#FFFFFF' }
    });

    // Store relative path under public/
    const relPath = path.join('public', 'uploads', 'teachers', teacherId, fileName).replace(/\\/g, '/');
    await UserModel.update(teacherId, { teacher_qr_image_path: relPath } as any);

    return { imagePath: relPath, publicUrl: QrService.toPublicUrl(relPath) };
  }

  private static toPublicUrl(relPath: string): string {
    const base = process.env['PUBLIC_BASE_URL'] || '';
    if (!base) return `/${relPath.replace(/^public\//, '')}`;
    return `${base.replace(/\/$/, '')}/${relPath.replace(/^public\//, '')}`;
  }
}
