import { Request, Response } from 'express';
export declare class NewsController {
    private static saveBase64Image;
    private static deleteLocalNewsImageIfExists;
    static create(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
    static getById(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
    static getAll(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
    static update(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
    static delete(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
    static publish(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
}
//# sourceMappingURL=news.controller.d.ts.map