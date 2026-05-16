import { UserModel } from '../models/user.model';
import { ApiError, ErrorCodes } from '../utils/api-error';
import { LocationService } from './location.service';

export interface TeacherSearchParams {
  latitude?: number;
  longitude?: number;
  governorate?: string;
  city?: string;
  district?: string;
  maxDistance?: number;
  page?: number;
  limit?: number;
}

export interface TeacherSearchResult {
  id: string;
  name: string;
  phone: string;
  address: string;
  bio: string;
  experienceYears: number;
  latitude: number;
  longitude: number;
  governorate?: string;
  city?: string;
  district?: string;
  distance?: number;
}

export interface TeacherSearchResponse {
  teachers: TeacherSearchResult[];
  count: number;
}

export class TeacherSearchService {
  static async searchTeachersByCoordinates(
    params: TeacherSearchParams
  ): Promise<TeacherSearchResponse> {
    const { latitude, longitude, maxDistance = 5, page = 1, limit = 10 } = params;

    if (latitude == null || longitude == null) {
      throw new ApiError(400, 'الإحداثيات مطلوبة', ErrorCodes.VALIDATION_ERROR);
    }

    const offset = (page - 1) * limit;
    const teachers = await UserModel.findTeachersByLocation(
      latitude,
      longitude,
      maxDistance,
      limit,
      offset
    );

    if (!teachers || teachers.length === 0) {
      return { teachers: [], count: 0 };
    }

    const results: TeacherSearchResult[] = teachers.map((teacher) => ({
      id: teacher.id,
      name: teacher.name,
      phone: (teacher as any).phone,
      address: (teacher as any).address,
      bio: (teacher as any).bio,
      experienceYears: (teacher as any).experienceYears,
      latitude: teacher.latitude!,
      longitude: teacher.longitude!,
      governorate: (teacher as any).governorate,
      city: (teacher as any).city,
      district: (teacher as any).district,
      distance: LocationService.calculateDistance(
        latitude,
        longitude,
        teacher.latitude!,
        teacher.longitude!
      ),
    }));

    results.sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0));
    return { teachers: results, count: results.length };
  }

  static async searchTeachersByLocation(
    params: TeacherSearchParams
  ): Promise<TeacherSearchResponse> {
    const { governorate, city, district, page = 1, limit = 10 } = params;

    if (!governorate && !city && !district) {
      throw new ApiError(400, 'الموقع مطلوب', ErrorCodes.VALIDATION_ERROR);
    }

    const offset = (page - 1) * limit;
    const teachers = await UserModel.findTeachersByLocationNames(
      limit,
      offset,
      governorate,
      city,
      district
    );

    if (!teachers || teachers.length === 0) {
      return { teachers: [], count: 0 };
    }

    const results: TeacherSearchResult[] = teachers.map((teacher) => ({
      id: teacher.id,
      name: teacher.name,
      phone: (teacher as any).phone,
      address: (teacher as any).address,
      bio: (teacher as any).bio,
      experienceYears: (teacher as any).experienceYears,
      latitude: teacher.latitude!,
      longitude: teacher.longitude!,
      governorate: (teacher as any).governorate,
      city: (teacher as any).city,
      district: (teacher as any).district,
    }));

    return { teachers: results, count: results.length };
  }

  static async getAvailableGovernorates(): Promise<{
    governorates: string[];
    count: number;
  }> {
    const governorates = await LocationService.getAvailableGovernorates();
    return { governorates, count: governorates.length };
  }

  static async getAvailableCities(
    governorate: string
  ): Promise<{ cities: string[]; count: number }> {
    const cities = await LocationService.getAvailableCities(governorate);
    return { cities, count: cities.length };
  }
}
