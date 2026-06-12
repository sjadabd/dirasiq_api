import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export class ImageService {
  private static uploadsDir = path.join(
    process.cwd(),
    'public',
    'uploads',
    'courses'
  );

  // PRIVATE storage root — NOT under `public/`, so it is never served by the
  // static middleware. Used for sensitive documents (e.g. bank transfer
  // receipts) that must only be reachable through an auth + ownership-checked
  // streaming endpoint.
  private static privateDir = path.join(process.cwd(), 'private');

  /**
   * Save a base64 data-URL image into a PRIVATE sub-directory (outside
   * `public/`). Returns the storage KEY `"<subdir>/<filename>"` (NOT a public
   * URL). Read it back only via `readPrivateFile`. The filename suffix uses a
   * cryptographically strong random token so the key is unguessable.
   */
  static async saveBase64ImagePrivate(
    base64Data: string,
    subdir: string,
    filenamePrefix: string
  ): Promise<string> {
    const match = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!match) throw new Error('Invalid base64 image format');
    const [, mimeType, base64String] = match;
    if (!mimeType || !mimeType.startsWith('image/')) {
      throw new Error('Invalid image mime type');
    }
    if (!base64String) throw new Error('Invalid base64 data');

    const safeSub = subdir.replace(/[^a-z0-9_-]/gi, '');
    const dir = path.join(this.privateDir, safeSub);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const buffer = Buffer.from(base64String, 'base64');
    const token = crypto.randomBytes(16).toString('hex');
    const ext = (mimeType.split('/')[1] || 'png').replace(/[^a-z0-9]/gi, '');
    const filename = `${filenamePrefix}_${token}.${ext}`;
    fs.writeFileSync(path.join(dir, filename), buffer);
    return `${safeSub}/${filename}`;
  }

  /**
   * Resolve a private storage key to an absolute path, refusing any traversal.
   * Returns null if the key is malformed or the file is missing.
   */
  static resolvePrivatePath(key: string): string | null {
    if (!key || key.includes('..') || path.isAbsolute(key)) return null;
    const abs = path.join(this.privateDir, key);
    // Ensure the resolved path stays inside privateDir.
    const rel = path.relative(this.privateDir, abs);
    if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
    return fs.existsSync(abs) ? abs : null;
  }

  /** Best-effort delete of a private file by its storage key. */
  static deletePrivateFile(key: string): void {
    try {
      const abs = this.resolvePrivatePath(key);
      if (abs) fs.unlinkSync(abs);
    } catch {
      /* ignore */
    }
  }
  private static usersUploadsDir = path.join(
    process.cwd(),
    'public',
    'uploads',
    'users'
  );
  // Delete a user avatar file
  static async deleteUserAvatar(imagePath: string): Promise<void> {
    try {
      if (!imagePath) return;
      const absolutePath = path.join(process.cwd(), 'public', imagePath);
      if (fs.existsSync(absolutePath)) {
        fs.unlinkSync(absolutePath);
      }
    } catch (error) {
      console.error('Error deleting user avatar:', error);
    }
  }
  // Convert base64 to file and save
  static async saveBase64Image(
    base64Data: string,
    filename: string
  ): Promise<string> {
    try {
      // Ensure uploads directory exists
      if (!fs.existsSync(this.uploadsDir)) {
        fs.mkdirSync(this.uploadsDir, { recursive: true });
      }

      // Extract base64 data (remove data:image/...;base64, prefix)
      const base64Match = base64Data.match(
        /^data:([A-Za-z-+\/]+);base64,(.+)$/
      );
      if (!base64Match) {
        throw new Error('Invalid base64 image format');
      }

      const [, mimeType, base64String] = base64Match;

      // Validate mime type
      if (!mimeType || !mimeType.startsWith('image/')) {
        throw new Error('Invalid image mime type');
      }

      // Convert base64 to buffer
      if (!base64String) {
        throw new Error('Invalid base64 data');
      }
      const buffer = Buffer.from(base64String, 'base64');

      // Generate unique filename
      const timestamp = Date.now();
      const randomString = Math.random().toString(36).substring(2, 15);
      const extension = mimeType.split('/')[1];
      const uniqueFilename = `${filename}_${timestamp}_${randomString}.${extension}`;

      const filePath = path.join(this.uploadsDir, uniqueFilename);

      // Save file
      fs.writeFileSync(filePath, buffer);

      // Return relative path for database storage
      return `/uploads/courses/${uniqueFilename}`;
    } catch (error) {
      console.error('Error saving base64 image:', error);
      throw new Error('Failed to save image');
    }
  }

  // Save base64 user avatar under uploads/users
  static async saveUserAvatar(
    base64Data: string,
    filename: string
  ): Promise<string> {
    try {
      if (!fs.existsSync(this.usersUploadsDir)) {
        fs.mkdirSync(this.usersUploadsDir, { recursive: true });
      }

      const base64Match = base64Data.match(
        /^data:([A-Za-z-+\/]+);base64,(.+)$/
      );
      if (!base64Match) throw new Error('Invalid base64 image format');
      const [, mimeType, base64String] = base64Match;
      if (!mimeType || !mimeType.startsWith('image/'))
        throw new Error('Invalid image mime type');
      if (!base64String) throw new Error('Invalid base64 data');

      const buffer = Buffer.from(base64String, 'base64');
      const timestamp = Date.now();
      const randomString = Math.random().toString(36).substring(2, 15);
      const extension = mimeType.split('/')[1];
      const uniqueFilename = `${filename}_${timestamp}_${randomString}.${extension}`;
      const filePath = path.join(this.usersUploadsDir, uniqueFilename);
      fs.writeFileSync(filePath, buffer);
      return `/uploads/users/${uniqueFilename}`;
    } catch (error) {
      console.error('Error saving user avatar:', error);
      throw new Error('Failed to save user avatar');
    }
  }

  // Delete image file
  static async deleteImage(imagePath: string): Promise<void> {
    try {
      if (!imagePath) return;

      // Convert relative path to absolute path
      const absolutePath = path.join(process.cwd(), 'public', imagePath);

      // Check if file exists and delete
      if (fs.existsSync(absolutePath)) {
        fs.unlinkSync(absolutePath);
      }
    } catch (error) {
      console.error('Error deleting image:', error);
      // Don't throw error for deletion failures
    }
  }

  // Process course images (convert base64 to files)
  static async processCourseImages(images: string[]): Promise<string[]> {
    const savedPaths: string[] = [];

    for (let i = 0; i < images.length; i++) {
      const image = images[i];

      if (!image) continue;

      // Check if it's base64 data
      if (image.startsWith('data:image/')) {
        const filename = `course_image_${i}`;
        const savedPath = await this.saveBase64Image(image, filename);
        savedPaths.push(savedPath);
      } else {
        // It's already a file path, keep it as is
        savedPaths.push(image);
      }
    }

    return savedPaths;
  }

  // Update course images (handle both base64 and existing paths)
  // Update course images (handle both base64 and existing paths)
  static async updateCourseImages(
    newImages: string[],
    oldImages: string[]
  ): Promise<string[]> {
    const finalImages: string[] = [];
    const oldImagesSet = new Set(oldImages); // لتسهيل التحقق من الصور القديمة
    const keptImages: Set<string> = new Set();

    for (let i = 0; i < newImages.length; i++) {
      const image = newImages[i];

      if (!image) continue;

      if (image.startsWith('data:image/')) {
        // صورة جديدة → احفظها
        const filename = `course_image_${Date.now()}_${i}`;
        const savedPath = await this.saveBase64Image(image, filename);
        finalImages.push(savedPath);

        // إذا بنفس الموقع كانت قديمة → نحذفها
        const oldImage = oldImages[i];
        if (oldImage && oldImagesSet.has(oldImage)) {
          await this.deleteImage(oldImage);
        }
      } else {
        // صورة قديمة (رابط) → نحافظ عليها
        finalImages.push(image);
        keptImages.add(image);
      }
    }

    // حذف الصور القديمة التي لم يتم إرسالها نهائياً
    for (const oldImage of oldImages) {
      if (oldImage && !keptImages.has(oldImage)) {
        await this.deleteImage(oldImage);
      }
    }

    return finalImages;
  }

  // Delete all course images
  static async deleteCourseImages(imagePaths: string[]): Promise<void> {
    for (const imagePath of imagePaths) {
      if (imagePath) {
        await this.deleteImage(imagePath);
      }
    }
  }
}
