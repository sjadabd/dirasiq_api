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
export declare class LocationService {
    private static readonly NOMINATIM_BASE_URL;
    private static readonly USER_AGENT;
    static getLocationFromCoordinates(latitude: number, longitude: number, language?: string): Promise<LocationDetails>;
    private static parseNominatimResponse;
    static getAvailableGovernorates(): Promise<string[]>;
    static getAvailableCities(governorate: string): Promise<string[]>;
    static calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number;
    private static toRadians;
}
//# sourceMappingURL=location.service.d.ts.map