"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TeacherSearchService = void 0;
const user_model_1 = require("../models/user.model");
const location_service_1 = require("./location.service");
class TeacherSearchService {
    static async searchTeachersByCoordinates(params) {
        try {
            const { latitude, longitude, maxDistance = 5, page = 1, limit = 10 } = params;
            if (!latitude || !longitude) {
                return {
                    success: false,
                    message: 'الإحداثيات مطلوبة',
                    errors: ['الإحداثيات مطلوبة']
                };
            }
            const offset = (page - 1) * limit;
            const teachers = await user_model_1.UserModel.findTeachersByLocation(latitude, longitude, maxDistance, limit, offset);
            if (!teachers || teachers.length === 0) {
                return {
                    success: true,
                    message: 'لم يتم العثور على معلمين',
                    data: { teachers: [], count: 0 },
                    count: 0
                };
            }
            const results = teachers.map(teacher => ({
                id: teacher.id,
                name: teacher.name,
                phone: teacher.phone,
                address: teacher.address,
                bio: teacher.bio,
                experienceYears: teacher.experienceYears,
                latitude: teacher.latitude,
                longitude: teacher.longitude,
                governorate: teacher.governorate,
                city: teacher.city,
                district: teacher.district,
                distance: location_service_1.LocationService.calculateDistance(latitude, longitude, teacher.latitude, teacher.longitude)
            }));
            results.sort((a, b) => (a.distance || 0) - (b.distance || 0));
            return {
                success: true,
                message: 'تم العثور على معلمين',
                data: { teachers: results },
                count: results.length
            };
        }
        catch (error) {
            console.error('Error searching teachers by coordinates:', error);
            return {
                success: false,
                message: 'فشلت العملية',
                errors: ['خطأ داخلي في الخادم']
            };
        }
    }
    static async searchTeachersByLocation(params) {
        try {
            const { governorate, city, district, page = 1, limit = 10 } = params;
            if (!governorate && !city && !district) {
                return {
                    success: false,
                    message: 'الموقع مطلوب',
                    errors: ['الموقع مطلوب']
                };
            }
            const offset = (page - 1) * limit;
            const teachers = await user_model_1.UserModel.findTeachersByLocationNames(limit, offset, governorate, city, district);
            if (!teachers || teachers.length === 0) {
                return {
                    success: true,
                    message: 'لم يتم العثور على معلمين',
                    data: { teachers: [], count: 0 },
                    count: 0
                };
            }
            const results = teachers.map(teacher => ({
                id: teacher.id,
                name: teacher.name,
                phone: teacher.phone,
                address: teacher.address,
                bio: teacher.bio,
                experienceYears: teacher.experienceYears,
                latitude: teacher.latitude,
                longitude: teacher.longitude,
                governorate: teacher.governorate,
                city: teacher.city,
                district: teacher.district
            }));
            return {
                success: true,
                message: 'تم العثور على معلمين',
                data: { teachers: results },
                count: results.length
            };
        }
        catch (error) {
            console.error('Error searching teachers by location:', error);
            return {
                success: false,
                message: 'فشلت العملية',
                errors: ['خطأ داخلي في الخادم']
            };
        }
    }
    static async getAvailableGovernorates() {
        try {
            const governorates = await location_service_1.LocationService.getAvailableGovernorates();
            return {
                success: true,
                message: 'تم العثور على المحافظات',
                data: { governorates },
                count: governorates.length
            };
        }
        catch (error) {
            console.error('Error getting available governorates:', error);
            return {
                success: false,
                message: 'فشلت العملية',
                errors: ['خطأ داخلي في الخادم']
            };
        }
    }
    static async getAvailableCities(governorate) {
        try {
            const cities = await location_service_1.LocationService.getAvailableCities(governorate);
            return {
                success: true,
                message: 'تم العثور على المدن',
                data: { cities },
                count: cities.length
            };
        }
        catch (error) {
            console.error('Error getting available cities:', error);
            return {
                success: false,
                message: 'فشلت العملية',
                errors: ['خطأ داخلي في الخادم']
            };
        }
    }
}
exports.TeacherSearchService = TeacherSearchService;
//# sourceMappingURL=teacher-search.service.js.map