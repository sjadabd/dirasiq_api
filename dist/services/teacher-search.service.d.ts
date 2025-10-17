import { ApiResponse } from '../types';
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
export declare class TeacherSearchService {
    static searchTeachersByCoordinates(params: TeacherSearchParams): Promise<ApiResponse>;
    static searchTeachersByLocation(params: TeacherSearchParams): Promise<ApiResponse>;
    static getAvailableGovernorates(): Promise<ApiResponse>;
    static getAvailableCities(governorate: string): Promise<ApiResponse>;
}
//# sourceMappingURL=teacher-search.service.d.ts.map