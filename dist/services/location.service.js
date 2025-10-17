"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocationService = void 0;
class LocationService {
    static async getLocationFromCoordinates(latitude, longitude, language = 'ar') {
        try {
            const params = new URLSearchParams({
                format: 'json',
                lat: latitude.toString(),
                lon: longitude.toString(),
                'accept-language': language,
                addressdetails: '1',
                zoom: '18'
            });
            const url = `${this.NOMINATIM_BASE_URL}?${params.toString()}`;
            const response = await fetch(url, {
                headers: {
                    'User-Agent': this.USER_AGENT
                }
            });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            return this.parseNominatimResponse(data);
        }
        catch (error) {
            console.error('Error in reverse geocoding:', error);
            return {
                governorate: undefined,
                city: undefined,
                district: undefined,
                street: undefined,
                country_code: undefined,
                postcode: undefined
            };
        }
    }
    static parseNominatimResponse(response) {
        const address = response.address;
        return {
            governorate: address.state || undefined,
            city: address.city || address.town || address.village || undefined,
            district: address.suburb || address.neighbourhood || undefined,
            street: address.road || undefined,
            country_code: address.country_code?.toUpperCase() || 'SA',
            postcode: address.postcode || undefined
        };
    }
    static async getAvailableGovernorates() {
        return [
            'بغداد',
            'البصرة',
            'الموصل',
            'أربيل',
            'السليمانية',
            'دهوك',
            'كركوك',
            'الأنبار',
            'النجف',
            'كربلاء',
            'بابل',
            'واسط',
            'صلاح الدين',
            'ديالى',
            'القادسية',
            'ذي قار',
            'ميسان',
            'الحلة',
            'الزبير',
            'الزبير'
        ];
    }
    static async getAvailableCities(governorate) {
        const citiesMap = {
            'بغداد': ['بغداد', 'الكرخ', 'الرصافة', 'الأعظمية', 'الزعفرانية', 'أبو غريب', 'المحمودية', 'اللطيفية', 'الطارمية', 'الطارمية'],
            'البصرة': ['البصرة', 'الزبير', 'أبو الخصيب', 'القرنة', 'شط العرب', 'الهارثة', 'الفحيثة', 'الطويلة', 'الطويلة'],
            'الموصل': ['الموصل', 'الحمدانية', 'تلعفر', 'سنجار', 'الشيخان', 'البعاج', 'الحمدانية', 'الحمدانية'],
            'أربيل': ['أربيل', 'كويه', 'مخمور', 'خبات', 'سوران', 'ميركه سور', 'ميركه سور'],
            'السليمانية': ['السليمانية', 'بنجوين', 'قلادزي', 'رانية', 'دوكان', 'بنجوين', 'بنجوين'],
            'دهوك': ['دهوك', 'زاخو', 'عمادية', 'زاخو', 'زاخو'],
            'كركوك': ['كركوك', 'داقوق', 'الحويجة', 'داقوق', 'داقوق'],
            'الأنبار': ['الرمادي', 'الفلوجة', 'هيت', 'حديثة', 'القائم', 'الرطبة', 'الرطبة'],
            'النجف': ['النجف', 'الكوفة', 'المناذرة', 'الكوفة', 'الكوفة'],
            'كربلاء': ['كربلاء', 'عين التمر', 'عين التمر', 'عين التمر'],
            'بابل': ['الحلة', 'المحمودية', 'المسيب', 'الهندية', 'المحمودية', 'المحمودية'],
            'واسط': ['الكوت', 'بدرة', 'الزبيرية', 'بدرة', 'بدرة'],
            'صلاح الدين': ['تكريت', 'بيجي', 'بلد', 'دجيل', 'بيجي', 'بيجي'],
            'ديالى': ['بعقوبة', 'الخالص', 'بلدروز', 'خانقين', 'الخالص', 'الخالص'],
            'القادسية': ['الديوانية', 'الشنافية', 'الشنافية', 'الشنافية'],
            'ذي قار': ['الناصرية', 'الشطرة', 'الرفاعي', 'الشطرة', 'الشطرة'],
            'ميسان': ['العمارة', 'المجر الكبير', 'الكحلاء', 'المجر الكبير', 'المجر الكبير'],
            'الحلة': ['الحلة', 'المحمودية', 'المسيب', 'الهندية', 'المحمودية', 'المحمودية'],
            'الزبير': ['الزبير', 'أبو الخصيب', 'القرنة', 'شط العرب', 'الهارثة', 'الفحيثة', 'الطويلة', 'الطويلة']
        };
        return citiesMap[governorate] || [];
    }
    static calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371;
        const dLat = this.toRadians(lat2 - lat1);
        const dLon = this.toRadians(lon2 - lon1);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
                Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distance = R * c;
        return Math.round(distance * 100) / 100;
    }
    static toRadians(degrees) {
        return degrees * (Math.PI / 180);
    }
}
exports.LocationService = LocationService;
LocationService.NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org/reverse';
LocationService.USER_AGENT = 'DirasiqApp/1.0';
//# sourceMappingURL=location.service.js.map