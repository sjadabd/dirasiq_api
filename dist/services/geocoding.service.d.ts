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
export declare class GeocodingService {
    private geocoder;
    constructor();
    geocodeAddress(address: string): Promise<GeocodingResult | null>;
    reverseGeocode(latitude: number, longitude: number): Promise<GeocodingResult | null>;
    getLocationDetails(latitude?: number, longitude?: number, address?: string): Promise<GeocodingResult | null>;
}
//# sourceMappingURL=geocoding.service.d.ts.map