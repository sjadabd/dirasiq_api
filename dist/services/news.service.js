"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NewsService = void 0;
const news_model_1 = require("../models/news.model");
class NewsService {
    static async createNews(data) {
        return await news_model_1.NewsModel.create(data);
    }
    static async getNewsById(id) {
        const exists = await news_model_1.NewsModel.exists(id);
        if (!exists)
            return null;
        return await news_model_1.NewsModel.findById(id);
    }
    static async getAllNews(page = 1, limit = 10, search, isActive, newsTypes) {
        const { news, total } = await news_model_1.NewsModel.findAll(page, limit, search, isActive, newsTypes);
        return {
            data: news,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        };
    }
    static async updateNews(id, data) {
        const exists = await news_model_1.NewsModel.exists(id);
        if (!exists)
            return null;
        return await news_model_1.NewsModel.update(id, data);
    }
    static async deleteNews(id) {
        const exists = await news_model_1.NewsModel.exists(id);
        if (!exists)
            return false;
        return await news_model_1.NewsModel.delete(id);
    }
    static async publishNews(id) {
        const exists = await news_model_1.NewsModel.exists(id);
        if (!exists)
            return null;
        return await news_model_1.NewsModel.publish(id);
    }
}
exports.NewsService = NewsService;
//# sourceMappingURL=news.service.js.map