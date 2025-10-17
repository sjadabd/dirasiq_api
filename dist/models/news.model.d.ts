import { CreateNewsRequest, News, NewsType, UpdateNewsRequest } from '../types';
export declare class NewsModel {
    private static mapRowToNews;
    static create(data: CreateNewsRequest): Promise<News>;
    static findById(id: string): Promise<News | null>;
    static findAll(page?: number, limit?: number, search?: string, isActive?: boolean, newsTypes?: NewsType[]): Promise<{
        news: News[];
        total: number;
    }>;
    static update(id: string, data: UpdateNewsRequest): Promise<News | null>;
    static delete(id: string): Promise<boolean>;
    static exists(id: string): Promise<boolean>;
    static publish(id: string): Promise<News | null>;
}
//# sourceMappingURL=news.model.d.ts.map