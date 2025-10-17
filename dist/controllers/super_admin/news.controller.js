"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NewsController = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const news_service_1 = require("../../services/news.service");
const types_1 = require("../../types");
class NewsController {
    static async saveBase64Image(base64Data) {
        const matches = base64Data.match(/^data:(image\/[-+\w.]+);base64,(.+)$/i);
        if (!matches) {
            throw new Error('Invalid base64 image data');
        }
        const mimeType = matches[1];
        const base64String = matches[2];
        const ext = (() => {
            const map = {
                'image/jpeg': '.jpg',
                'image/jpg': '.jpg',
                'image/png': '.png',
                'image/gif': '.gif',
                'image/webp': '.webp',
                'image/bmp': '.bmp',
                'image/svg+xml': '.svg'
            };
            return map[mimeType] || '.png';
        })();
        const fileName = `news_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
        const uploadDir = path_1.default.resolve(process.cwd(), 'public', 'uploads', 'news');
        const filePath = path_1.default.join(uploadDir, fileName);
        await fs_1.default.promises.mkdir(uploadDir, { recursive: true });
        const buffer = Buffer.from(base64String, 'base64');
        await fs_1.default.promises.writeFile(filePath, buffer);
        return `/uploads/news/${fileName}`;
    }
    static async deleteLocalNewsImageIfExists(publicPath) {
        try {
            if (!publicPath || typeof publicPath !== 'string')
                return;
            if (!publicPath.startsWith('/uploads/news/'))
                return;
            const relative = publicPath.replace(/^\//, '');
            const fileOnDisk = path_1.default.resolve(process.cwd(), 'public', relative.replace(/^uploads\//, 'uploads/'));
            await fs_1.default.promises.unlink(fileOnDisk).catch(() => { });
        }
        catch {
        }
    }
    static async create(req, res) {
        try {
            const data = req.body;
            if (data.newsType && !Object.values(types_1.NewsType).includes(data.newsType)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid newsType value'
                });
            }
            if (data.imageUrl && typeof data.imageUrl === 'string' && data.imageUrl.startsWith('data:image')) {
                try {
                    const savedPath = await NewsController.saveBase64Image(data.imageUrl);
                    data.imageUrl = savedPath;
                }
                catch (e) {
                    return res.status(400).json({
                        success: false,
                        message: 'Invalid image data provided',
                        errors: [e.message]
                    });
                }
            }
            const news = await news_service_1.NewsService.createNews(data);
            return res.status(201).json({
                success: true,
                message: 'تم إنشاء الخبر بنجاح',
                data: news,
            });
        }
        catch (error) {
            console.error('❌ Error creating news:', error);
            return res.status(500).json({
                success: false,
                message: 'حدث خطأ أثناء إنشاء الخبر',
                errors: [error.message],
            });
        }
    }
    static async getById(req, res) {
        try {
            const { id } = req.params;
            if (!id) {
                return res.status(400).json({
                    success: false,
                    message: 'معرف الخبر مفقود',
                });
            }
            const news = await news_service_1.NewsService.getNewsById(id);
            if (!news) {
                return res.status(404).json({
                    success: false,
                    message: 'الخبر غير موجود',
                });
            }
            return res.json({
                success: true,
                data: news,
            });
        }
        catch (error) {
            console.error('❌ Error fetching news by ID:', error);
            return res.status(500).json({
                success: false,
                message: 'حدث خطأ أثناء جلب الخبر',
                errors: [error.message],
            });
        }
    }
    static async getAll(req, res) {
        try {
            const page = parseInt(req.query['page']) || 1;
            const limit = parseInt(req.query['limit']) || 10;
            const search = req.query['search'];
            const isActive = req.query['isActive'] !== undefined
                ? req.query['isActive'] === 'true'
                : undefined;
            const newsTypeParam = req.query['newsType'];
            let newsTypes = undefined;
            if (newsTypeParam && Object.values(types_1.NewsType).includes(newsTypeParam)) {
                const nt = newsTypeParam;
                if (nt === types_1.NewsType.WEB) {
                    newsTypes = [types_1.NewsType.WEB, types_1.NewsType.WEB_AND_MOBILE];
                }
                else if (nt === types_1.NewsType.MOBILE) {
                    newsTypes = [types_1.NewsType.MOBILE, types_1.NewsType.WEB_AND_MOBILE];
                }
                else if (nt === types_1.NewsType.WEB_AND_MOBILE) {
                    newsTypes = [types_1.NewsType.WEB_AND_MOBILE];
                }
            }
            const result = await news_service_1.NewsService.getAllNews(page, limit, search, isActive, newsTypes);
            return res.json({
                success: true,
                ...result,
            });
        }
        catch (error) {
            console.error('❌ Error fetching all news:', error);
            return res.status(500).json({
                success: false,
                message: 'حدث خطأ أثناء جلب الأخبار',
                errors: [error.message],
            });
        }
    }
    static async update(req, res) {
        try {
            const { id } = req.params;
            if (!id) {
                return res.status(400).json({
                    success: false,
                    message: 'معرف الخبر مفقود',
                });
            }
            const data = req.body;
            if (data.imageUrl && typeof data.imageUrl === 'string' && data.imageUrl.startsWith('data:image')) {
                try {
                    const current = await news_service_1.NewsService.getNewsById(id);
                    if (!current) {
                        return res.status(404).json({
                            success: false,
                            message: 'الخبر غير موجود',
                        });
                    }
                    if (current.imageUrl) {
                        await NewsController.deleteLocalNewsImageIfExists(current.imageUrl);
                    }
                    const savedPath = await NewsController.saveBase64Image(data.imageUrl);
                    data.imageUrl = savedPath;
                }
                catch (e) {
                    return res.status(400).json({
                        success: false,
                        message: 'Invalid image data provided',
                        errors: [e.message]
                    });
                }
            }
            const news = await news_service_1.NewsService.updateNews(id, data);
            if (!news) {
                return res.status(404).json({
                    success: false,
                    message: 'الخبر غير موجود',
                });
            }
            return res.json({
                success: true,
                message: 'تم تحديث الخبر بنجاح',
                data: news,
            });
        }
        catch (error) {
            console.error('❌ Error updating news:', error);
            return res.status(500).json({
                success: false,
                message: 'حدث خطأ أثناء تحديث الخبر',
                errors: [error.message],
            });
        }
    }
    static async delete(req, res) {
        try {
            const { id } = req.params;
            if (!id) {
                return res.status(400).json({
                    success: false,
                    message: 'معرف الخبر مفقود',
                });
            }
            const deleted = await news_service_1.NewsService.deleteNews(id);
            if (!deleted) {
                return res.status(404).json({
                    success: false,
                    message: 'الخبر غير موجود أو تم حذفه مسبقاً',
                });
            }
            return res.json({
                success: true,
                message: 'تم حذف الخبر بنجاح',
            });
        }
        catch (error) {
            console.error('❌ Error deleting news:', error);
            return res.status(500).json({
                success: false,
                message: 'حدث خطأ أثناء حذف الخبر',
                errors: [error.message],
            });
        }
    }
    static async publish(req, res) {
        try {
            const { id } = req.params;
            if (!id) {
                return res.status(400).json({
                    success: false,
                    message: 'معرف الخبر مفقود',
                });
            }
            const news = await news_service_1.NewsService.publishNews(id);
            if (!news) {
                return res.status(404).json({
                    success: false,
                    message: 'الخبر غير موجود',
                });
            }
            return res.json({
                success: true,
                message: 'تم نشر الخبر بنجاح',
                data: news,
            });
        }
        catch (error) {
            console.error('❌ Error publishing news:', error);
            return res.status(500).json({
                success: false,
                message: 'حدث خطأ أثناء نشر الخبر',
                errors: [error.message],
            });
        }
    }
}
exports.NewsController = NewsController;
//# sourceMappingURL=news.controller.js.map