// Using native fetch instead of axios

export interface LocationDetails {
  governorate: string | undefined;
  city: string | undefined;
  district: string | undefined;
  street: string | undefined;
  country_code: string | undefined;
  postcode: string | undefined;
}

export interface NominatimResponse {
  display_name: string;
  address: {
    state?: string;
    city?: string;
    town?: string;
    village?: string;
    suburb?: string;
    neighbourhood?: string;
    road?: string;
    country_code?: string;
    postcode?: string;
  };
}

export class LocationService {
  private static readonly NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org/reverse';
  private static readonly USER_AGENT = 'DirasiqApp/1.0';

  // Reverse geocoding using OpenStreetMap Nominatim
  static async getLocationFromCoordinates(
    latitude: number,
    longitude: number,
    language: string = 'ar'
  ): Promise<LocationDetails> {
    try {
      const params = new URLSearchParams({
        format: 'json',
        lat: latitude.toString(),
        lon: longitude.toString(),
        'accept-language': language,
        addressdetails: '1',
        zoom: '18' // High detail level
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

      const data = await response.json() as NominatimResponse;

      return this.parseNominatimResponse(data);
    } catch (error) {
      console.error('Error in reverse geocoding:', error);
      // Return empty location details if geocoding fails
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

  // Parse Nominatim response to extract location details
  private static parseNominatimResponse(response: NominatimResponse): LocationDetails {
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

  // Get available governorates from existing users
  static async getAvailableGovernorates(): Promise<string[]> {
    // This would be implemented in UserModel
    // For now, return Iraqi governorates
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

  // Get available cities for a specific governorate
  static async getAvailableCities(governorate: string): Promise<string[]> {
    // This would be implemented in UserModel
    // For now, return common cities for the given governorate
    const citiesMap: { [key: string]: string[] } = {
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

  // Calculate distance between two points using Haversine formula
  static calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371; // Earth's radius in kilometers
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);

    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c; // Distance in kilometers

    return Math.round(distance * 100) / 100; // Round to 2 decimal places
  }

  // Convert degrees to radians
  private static toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }
}
