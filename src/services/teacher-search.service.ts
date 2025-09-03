import { UserModel } from '@/models/user.model';
import { ApiResponse } from '@/types';
import { getMessage } from '@/utils/messages';
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

export class TeacherSearchService {
  // Search teachers by coordinates (with distance calculation)
  static async searchTeachersByCoordinates(
    params: TeacherSearchParams
  ): Promise<ApiResponse> {
    try {
      const { latitude, longitude, maxDistance = 5, page = 1, limit = 10 } = params;

      if (!latitude || !longitude) {
        return {
          success: false,
          message: getMessage('VALIDATION.COORDINATES_REQUIRED'),
          errors: [getMessage('VALIDATION.COORDINATES_REQUIRED')]
        };
      }

      const offset = (page - 1) * limit;

      // Get teachers within the specified distance
      const teachers = await UserModel.findTeachersByLocation(
        latitude,
        longitude,
        maxDistance,
        limit,
        offset
      );

      if (!teachers || teachers.length === 0) {
        return {
          success: true,
          message: getMessage('TEACHER.NO_TEACHERS_FOUND'),
          data: { teachers: [], count: 0 },
          count: 0
        };
      }

      // Calculate distances and format results
      const results: TeacherSearchResult[] = teachers.map(teacher => ({
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
        )
      }));

      // Sort by distance
      results.sort((a, b) => (a.distance || 0) - (b.distance || 0));

      return {
        success: true,
        message: getMessage('TEACHER.TEACHERS_FOUND'),
        data: { teachers: results },
        count: results.length
      };
    } catch (error) {
      console.error('Error searching teachers by coordinates:', error);
      return {
        success: false,
        message: getMessage('GENERAL.OPERATION_FAILED'),
        errors: [getMessage('SERVER.INTERNAL_ERROR')]
      };
    }
  }

  // Search teachers by location names (without coordinates)
  static async searchTeachersByLocation(
    params: TeacherSearchParams
  ): Promise<ApiResponse> {
    try {
      const { governorate, city, district, page = 1, limit = 10 } = params;

      if (!governorate && !city && !district) {
        return {
          success: false,
          message: getMessage('VALIDATION.LOCATION_REQUIRED'),
          errors: [getMessage('VALIDATION.LOCATION_REQUIRED')]
        };
      }

      const offset = (page - 1) * limit;

      // Get teachers by location names
      const teachers = await UserModel.findTeachersByLocationNames(
        limit,
        offset,
        governorate,
        city,
        district
      );

      if (!teachers || teachers.length === 0) {
        return {
          success: true,
          message: getMessage('TEACHER.NO_TEACHERS_FOUND'),
          data: { teachers: [], count: 0 },
          count: 0
        };
      }

      // Format results
      const results: TeacherSearchResult[] = teachers.map(teacher => ({
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
        district: (teacher as any).district
      }));

      return {
        success: true,
        message: getMessage('TEACHER.TEACHERS_FOUND'),
        data: { teachers: results },
        count: results.length
      };
    } catch (error) {
      console.error('Error searching teachers by location:', error);
      return {
        success: false,
        message: getMessage('GENERAL.OPERATION_FAILED'),
        errors: [getMessage('SERVER.INTERNAL_ERROR')]
      };
    }
  }

  // Get available governorates
  static async getAvailableGovernorates(): Promise<ApiResponse> {
    try {
      const governorates = await LocationService.getAvailableGovernorates();

      return {
        success: true,
        message: getMessage('LOCATION.GOVERNORATES_FOUND'),
        data: { governorates },
        count: governorates.length
      };
    } catch (error) {
      console.error('Error getting available governorates:', error);
      return {
        success: false,
        message: getMessage('GENERAL.OPERATION_FAILED'),
        errors: [getMessage('SERVER.INTERNAL_ERROR')]
      };
    }
  }

  // Get available cities for a governorate
  static async getAvailableCities(governorate: string): Promise<ApiResponse> {
    try {
      const cities = await LocationService.getAvailableCities(governorate);

      return {
        success: true,
        message: getMessage('LOCATION.CITIES_FOUND'),
        data: { cities },
        count: cities.length
      };
    } catch (error) {
      console.error('Error getting available cities:', error);
      return {
        success: false,
        message: getMessage('GENERAL.OPERATION_FAILED'),
        errors: [getMessage('SERVER.INTERNAL_ERROR')]
      };
    }
  }
}
