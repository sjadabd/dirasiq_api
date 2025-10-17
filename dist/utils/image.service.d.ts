export declare class ImageService {
    private static uploadsDir;
    private static usersUploadsDir;
    static deleteUserAvatar(imagePath: string): Promise<void>;
    static saveBase64Image(base64Data: string, filename: string): Promise<string>;
    static saveUserAvatar(base64Data: string, filename: string): Promise<string>;
    static deleteImage(imagePath: string): Promise<void>;
    static processCourseImages(images: string[]): Promise<string[]>;
    static updateCourseImages(newImages: string[], oldImages: string[]): Promise<string[]>;
    static deleteCourseImages(imagePaths: string[]): Promise<void>;
}
//# sourceMappingURL=image.service.d.ts.map