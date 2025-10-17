"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GeocodingService = void 0;
const node_geocoder_1 = __importDefault(require("node-geocoder"));
class GeocodingService {
    constructor() {
        this.geocoder = (0, node_geocoder_1.default)({
            provider: 'opencage',
            apiKey: process.env['OPENCAGE_API_KEY'] || '',
            formatter: null,
            language: 'ar',
        });
    }
    async geocodeAddress(address) {
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
        }
        catch (error) {
            console.error('Geocoding error:', error);
            return null;
        }
    }
    async reverseGeocode(latitude, longitude) {
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
        }
        catch (error) {
            console.error('Reverse geocoding error:', error);
            return null;
        }
    }
    async getLocationDetails(latitude, longitude, address) {
        if (latitude && longitude) {
            const result = await this.reverseGeocode(latitude, longitude);
            if (result)
                return result;
        }
        if (address) {
            const result = await this.geocodeAddress(address);
            if (result)
                return result;
        }
        return null;
    }
}
exports.GeocodingService = GeocodingService;
//# sourceMappingURL=geocoding.service.js.map