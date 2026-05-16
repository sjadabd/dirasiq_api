import type { Request, Response } from 'express';

import { TeacherSearchService } from '../services/teacher-search.service';
import { ok } from '../utils/response.util';

export class TeacherSearchController {
  // GET /api/teacher-search/search/coordinates
  static async searchByCoordinates(req: Request, res: Response): Promise<void> {
    const query = req.query as unknown as {
      latitude: number;
      longitude: number;
      maxDistance?: number;
      page?: number;
      limit?: number;
    };
    const data = await TeacherSearchService.searchTeachersByCoordinates(query);
    const message = data.teachers.length === 0 ? 'لم يتم العثور على معلمين' : 'تم العثور على معلمين';
    res.status(200).json(ok(data, message));
  }

  // GET /api/teacher-search/search/location
  static async searchByLocation(req: Request, res: Response): Promise<void> {
    const query = req.query as unknown as {
      governorate?: string;
      city?: string;
      district?: string;
      page?: number;
      limit?: number;
    };
    const data = await TeacherSearchService.searchTeachersByLocation(query);
    const message = data.teachers.length === 0 ? 'لم يتم العثور على معلمين' : 'تم العثور على معلمين';
    res.status(200).json(ok(data, message));
  }

  // GET /api/teacher-search/governorates
  static async getGovernorates(_req: Request, res: Response): Promise<void> {
    const data = await TeacherSearchService.getAvailableGovernorates();
    res.status(200).json(ok(data, 'تم العثور على المحافظات'));
  }

  // GET /api/teacher-search/cities/:governorate
  static async getCities(req: Request, res: Response): Promise<void> {
    const governorate = req.params['governorate'] as string;
    const data = await TeacherSearchService.getAvailableCities(governorate);
    res.status(200).json(ok(data, 'تم العثور على المدن'));
  }
}
