import NodeGeocoder from 'node-geocoder';

export interface GeocodingResult {
  formattedAddress: string;
  latitude: number;
  longitude: number;
  country: string;
  city: string;
  state: string;
  zipcode: string;
  streetName: string;
  suburb: string;
  confidence: number;
}

export class GeocodingService {
  private geocoder: NodeGeocoder.Geocoder;

  constructor() {
    // Use OpenCage as the geocoding provider
    this.geocoder = NodeGeocoder({
      provider: 'opencage',
      apiKey: process.env['OPENCAGE_API_KEY'] || '',
      formatter: null,
      language: 'ar', // Arabic language
    } as any);
  }

  /**
 * Geocode an address string to get location details
 */
  async geocodeAddress(address: string): Promise<GeocodingResult | null> {
    try {
      const results = await this.geocoder.geocode(address);

      if (results && results.length > 0) {
        const result = results[0];

        if (result && result.latitude && result.longitude) {
          return {
            formattedAddress: result.formattedAddress || address,
            latitude: result.latitude,
            longitude: result.longitude,
            country: result.country || 'العراق',
            city: result.city || '',
            state: result.state || '',
            zipcode: result.zipcode || '',
            streetName: result.streetName || result.streetNumber || '',
            suburb: '',
            confidence: 0.8,
          };
        }
      }

      return null;
    } catch (error) {
      console.error('Geocoding error:', error);
      return null;
    }
  }

  /**
 * Reverse geocode coordinates to get address details
 */
  async reverseGeocode(latitude: number, longitude: number): Promise<GeocodingResult | null> {
    try {
      const results = await this.geocoder.reverse({ lat: latitude, lon: longitude });

      if (results && results.length > 0) {
        const result = results[0];

        if (result && result.latitude && result.longitude) {
          return {
            formattedAddress: result.formattedAddress || '',
            latitude: result.latitude,
            longitude: result.longitude,
            country: result.country || 'العراق',
            city: result.city || '',
            state: result.state || '',
            zipcode: result.zipcode || '',
            streetName: result.streetName || result.streetNumber || '',
            suburb: '',
            confidence: 0.9,
          };
        }
      }

      return null;
    } catch (error) {
      console.error('Reverse geocoding error:', error);
      return null;
    }
  }

  /**
   * Get location details from coordinates or address
   */
  async getLocationDetails(
    latitude?: number,
    longitude?: number,
    address?: string
  ): Promise<GeocodingResult | null> {
    // If we have coordinates, use reverse geocoding
    if (latitude && longitude) {
      const result = await this.reverseGeocode(latitude, longitude);
      if (result) return result;
    }

    // If we have address, use forward geocoding
    if (address) {
      const result = await this.geocodeAddress(address);
      if (result) return result;
    }

    return null;
  }
}
