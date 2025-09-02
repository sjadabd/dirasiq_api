import fs from 'fs';
import path from 'path';

export class ImageService {
  private static uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'courses');

  // Convert base64 to file and save
  static async saveBase64Image(base64Data: string, filename: string): Promise<string> {
    try {
      // Ensure uploads directory exists
      if (!fs.existsSync(this.uploadsDir)) {
        fs.mkdirSync(this.uploadsDir, { recursive: true });
      }

      // Extract base64 data (remove data:image/...;base64, prefix)
      const base64Match = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
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
  static async updateCourseImages(newImages: string[], existingImages: string[]): Promise<string[]> {
    const updatedPaths: string[] = [];
    const imagesToDelete: string[] = [];

    for (let i = 0; i < newImages.length; i++) {
      const image = newImages[i];

      if (!image) continue;

      // Check if it's base64 data
      if (image.startsWith('data:image/')) {
        // Save new image
        const filename = `course_image_${i}`;
        const savedPath = await this.saveBase64Image(image, filename);
        updatedPaths.push(savedPath);

        // Mark existing image for deletion if it exists
        const existingImage = existingImages[i];
        if (existingImage) {
          imagesToDelete.push(existingImage);
        }
      } else {
        // It's an existing path, keep it
        updatedPaths.push(image);
      }
    }

    // Delete old images that were replaced
    for (const imagePath of imagesToDelete) {
      if (imagePath) {
        await this.deleteImage(imagePath);
      }
    }

    return updatedPaths;
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
