"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GoogleAuthService = void 0;
const google_auth_library_1 = require("google-auth-library");
class GoogleAuthService {
    static initialize() {
        this.client = new google_auth_library_1.OAuth2Client();
    }
    static async verifyGoogleToken(idToken) {
        try {
            if (!this.client) {
                this.initialize();
            }
            const ticket = await this.client.verifyIdToken({
                idToken,
                audience: process.env['GOOGLE_CLIENT_ID'] || '347174406018-8q0gaa0spce1hr7rsa1okge2or0sd6br.apps.googleusercontent.com'
            });
            const payload = ticket.getPayload();
            if (!payload) {
                return {
                    success: false,
                    error: 'Invalid Google token payload'
                };
            }
            const googleData = {
                iss: payload.iss,
                azp: payload.azp,
                aud: payload.aud,
                sub: payload.sub,
                email: payload.email,
                email_verified: payload.email_verified,
                nbf: payload.nbf,
                name: payload.name,
                picture: payload.picture,
                given_name: payload.given_name,
                family_name: payload.family_name,
                iat: payload.iat,
                exp: payload.exp,
                jti: payload.jti
            };
            return {
                success: true,
                data: googleData
            };
        }
        catch (error) {
            console.error('Google token verification error:', error);
            return {
                success: false,
                error: 'Failed to verify Google token'
            };
        }
    }
    static validateGoogleData(googleData) {
        const errors = [];
        const requiredFields = [
            'iss', 'azp', 'aud', 'sub', 'email', 'name'
        ];
        for (const field of requiredFields) {
            if (!googleData[field]) {
                errors.push(`Missing required field: ${field}`);
            }
        }
        if (googleData.email && !this.isValidEmail(googleData.email)) {
            errors.push('Invalid email format');
        }
        if (googleData.iss && googleData.iss !== 'https://accounts.google.com') {
            errors.push('Invalid token issuer');
        }
        const expectedAudience = process.env['GOOGLE_CLIENT_ID'] || '347174406018-8q0gaa0spce1hr7rsa1okge2or0sd6br.apps.googleusercontent.com';
        if (googleData.aud && googleData.aud !== expectedAudience) {
            errors.push('Invalid token audience');
        }
        if (googleData.email_verified === false) {
            errors.push('Email not verified by Google');
        }
        if (googleData.exp) {
            const currentTime = Math.floor(Date.now() / 1000);
            if (googleData.exp < currentTime) {
                errors.push('Token has expired');
            }
        }
        return {
            isValid: errors.length === 0,
            errors
        };
    }
    static isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }
    static async verifyGoogleDataWithSecurity(googleData) {
        const errors = [];
        const validation = this.validateGoogleData(googleData);
        if (!validation.isValid) {
            errors.push(...validation.errors);
        }
        if (googleData.sub) {
            if (googleData.sub.length < 10 || googleData.sub.length > 30) {
                errors.push('Invalid Google user ID format');
            }
        }
        if (googleData.nbf) {
            const currentTime = Math.floor(Date.now() / 1000);
            if (googleData.nbf > currentTime) {
                errors.push('Token not yet valid');
            }
        }
        if (googleData.iat) {
            const currentTime = Math.floor(Date.now() / 1000);
            const maxAge = 24 * 60 * 60;
            if (currentTime - googleData.iat > maxAge) {
                errors.push('Token too old');
            }
        }
        if (errors.length > 0) {
            return {
                success: false,
                errors
            };
        }
        return {
            success: true,
            data: googleData,
            errors: []
        };
    }
}
exports.GoogleAuthService = GoogleAuthService;
//# sourceMappingURL=google-auth.service.js.map