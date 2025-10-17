import { CreateNewsRequest, News, NewsType, PaginatedResponse, UpdateNewsRequest } from '../types';
export declare class NewsService {
    static createNews(data: CreateNewsRequest): Promise<News>;
    static getNewsById(id: string): Promise<News | null>;
    static getAllNews(page?: number, limit?: number, search?: string, isActive?: boolean, newsTypes?: NewsType[]): Promise<PaginatedResponse<News>>;
    static updateNews(id: string, data: UpdateNewsRequest): Promise<News | null>;
    static deleteNews(id: string): Promise<boolean>;
    static publishNews(id: string): Promise<News | null>;
}
//# sourceMappingURL=news.service.d.ts.map