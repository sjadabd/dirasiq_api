"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ImageService = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
class ImageService {
    static async deleteUserAvatar(imagePath) {
        try {
            if (!imagePath)
                return;
            const absolutePath = path_1.default.join(process.cwd(), 'public', imagePath);
            if (fs_1.default.existsSync(absolutePath)) {
                fs_1.default.unlinkSync(absolutePath);
            }
        }
        catch (error) {
            console.error('Error deleting user avatar:', error);
        }
    }
    static async saveBase64Image(base64Data, filename) {
        try {
            if (!fs_1.default.existsSync(this.uploadsDir)) {
                fs_1.default.mkdirSync(this.uploadsDir, { recursive: true });
            }
            const base64Match = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
            if (!base64Match) {
                throw new Error('Invalid base64 image format');
            }
            const [, mimeType, base64String] = base64Match;
            if (!mimeType || !mimeType.startsWith('image/')) {
                throw new Error('Invalid image mime type');
            }
            if (!base64String) {
                throw new Error('Invalid base64 data');
            }
            const buffer = Buffer.from(base64String, 'base64');
            const timestamp = Date.now();
            const randomString = Math.random().toString(36).substring(2, 15);
            const extension = mimeType.split('/')[1];
            const uniqueFilename = `${filename}_${timestamp}_${randomString}.${extension}`;
            const filePath = path_1.default.join(this.uploadsDir, uniqueFilename);
            fs_1.default.writeFileSync(filePath, buffer);
            return `/uploads/courses/${uniqueFilename}`;
        }
        catch (error) {
            console.error('Error saving base64 image:', error);
            throw new Error('Failed to save image');
        }
    }
    static async saveUserAvatar(base64Data, filename) {
        try {
            if (!fs_1.default.existsSync(this.usersUploadsDir)) {
                fs_1.default.mkdirSync(this.usersUploadsDir, { recursive: true });
            }
            const base64Match = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
            if (!base64Match)
                throw new Error('Invalid base64 image format');
            const [, mimeType, base64String] = base64Match;
            if (!mimeType || !mimeType.startsWith('image/'))
                throw new Error('Invalid image mime type');
            if (!base64String)
                throw new Error('Invalid base64 data');
            const buffer = Buffer.from(base64String, 'base64');
            const timestamp = Date.now();
            const randomString = Math.random().toString(36).substring(2, 15);
            const extension = mimeType.split('/')[1];
            const uniqueFilename = `${filename}_${timestamp}_${randomString}.${extension}`;
            const filePath = path_1.default.join(this.usersUploadsDir, uniqueFilename);
            fs_1.default.writeFileSync(filePath, buffer);
            return `/uploads/users/${uniqueFilename}`;
        }
        catch (error) {
            console.error('Error saving user avatar:', error);
            throw new Error('Failed to save user avatar');
        }
    }
    static async deleteImage(imagePath) {
        try {
            if (!imagePath)
                return;
            const absolutePath = path_1.default.join(process.cwd(), 'public', imagePath);
            if (fs_1.default.existsSync(absolutePath)) {
                fs_1.default.unlinkSync(absolutePath);
            }
        }
        catch (error) {
            console.error('Error deleting image:', error);
        }
    }
    static async processCourseImages(images) {
        const savedPaths = [];
        for (let i = 0; i < images.length; i++) {
            const image = images[i];
            if (!image)
                continue;
            if (image.startsWith('data:image/')) {
                const filename = `course_image_${i}`;
                const savedPath = await this.saveBase64Image(image, filename);
                savedPaths.push(savedPath);
            }
            else {
                savedPaths.push(image);
            }
        }
        return savedPaths;
    }
    static async updateCourseImages(newImages, oldImages) {
        const finalImages = [];
        const oldImagesSet = new Set(oldImages);
        const keptImages = new Set();
        for (let i = 0; i < newImages.length; i++) {
            const image = newImages[i];
            if (!image)
                continue;
            if (image.startsWith('data:image/')) {
                const filename = `course_image_${Date.now()}_${i}`;
                const savedPath = await this.saveBase64Image(image, filename);
                finalImages.push(savedPath);
                const oldImage = oldImages[i];
                if (oldImage && oldImagesSet.has(oldImage)) {
                    await this.deleteImage(oldImage);
                }
            }
            else {
                finalImages.push(image);
                keptImages.add(image);
            }
        }
        for (const oldImage of oldImages) {
            if (oldImage && !keptImages.has(oldImage)) {
                await this.deleteImage(oldImage);
            }
        }
        return finalImages;
    }
    static async deleteCourseImages(imagePaths) {
        for (const imagePath of imagePaths) {
            if (imagePath) {
                await this.deleteImage(imagePath);
            }
        }
    }
}
exports.ImageService = ImageService;
ImageService.uploadsDir = path_1.default.join(process.cwd(), 'public', 'uploads', 'courses');
ImageService.usersUploadsDir = path_1.default.join(process.cwd(), 'public', 'uploads', 'users');
//# sourceMappingURL=image.service.js.map