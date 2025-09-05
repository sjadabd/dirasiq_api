import { OAuth2Client } from 'google-auth-library';

export class GoogleAuthService {
  private static client: OAuth2Client;

  // Initialize Google OAuth client
  static initialize() {
    this.client = new OAuth2Client();
  }

  // Verify Google JWT token
  static async verifyGoogleToken(idToken: string): Promise<{
    success: boolean;
    data?: any;
    error?: string;
  }> {
    try {
      if (!this.client) {
        this.initialize();
      }

      // Verify the token
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

      // Extract required data
      const googleData = {
        iss: payload.iss,
        azp: payload.azp,
        aud: payload.aud,
        sub: payload.sub,
        email: payload.email,
        email_verified: payload.email_verified,
        nbf: (payload as any).nbf,
        name: payload.name,
        picture: payload.picture,
        given_name: payload.given_name,
        family_name: payload.family_name,
        iat: payload.iat,
        exp: payload.exp,
        jti: (payload as any).jti
      };

      return {
        success: true,
        data: googleData
      };
    } catch (error) {
      console.error('Google token verification error:', error);
      return {
        success: false,
        error: 'Failed to verify Google token'
      };
    }
  }

  // Verify Google data structure (basic validation)
  static validateGoogleData(googleData: any): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    // Required fields
    const requiredFields = [
      'iss', 'azp', 'aud', 'sub', 'email', 'name'
    ];

    for (const field of requiredFields) {
      if (!googleData[field]) {
        errors.push(`Missing required field: ${field}`);
      }
    }

    // Validate email
    if (googleData.email && !this.isValidEmail(googleData.email)) {
      errors.push('Invalid email format');
    }

    // Validate issuer
    if (googleData.iss && googleData.iss !== 'https://accounts.google.com') {
      errors.push('Invalid token issuer');
    }

    // Validate audience (client ID)
    const expectedAudience = process.env['GOOGLE_CLIENT_ID'] || '347174406018-8q0gaa0spce1hr7rsa1okge2or0sd6br.apps.googleusercontent.com';
    if (googleData.aud && googleData.aud !== expectedAudience) {
      errors.push('Invalid token audience');
    }

    // Validate email verification
    if (googleData.email_verified === false) {
      errors.push('Email not verified by Google');
    }

    // Validate token expiration
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

  // Helper method to validate email format
  private static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  // Verify Google data with additional security checks
  static async verifyGoogleDataWithSecurity(googleData: any): Promise<{
    success: boolean;
    data?: any;
    errors: string[];
  }> {
    const errors: string[] = [];

    // Basic validation
    const validation = this.validateGoogleData(googleData);
    if (!validation.isValid) {
      errors.push(...validation.errors);
    }

    // Additional security checks
    if (googleData.sub) {
      // Check if sub (Google user ID) is reasonable length
      if (googleData.sub.length < 10 || googleData.sub.length > 30) {
        errors.push('Invalid Google user ID format');
      }
    }

    // Check token timing (not before)
    if (googleData.nbf) {
      const currentTime = Math.floor(Date.now() / 1000);
      if (googleData.nbf > currentTime) {
        errors.push('Token not yet valid');
      }
    }

    // Check issued at time (not too old)
    if (googleData.iat) {
      const currentTime = Math.floor(Date.now() / 1000);
      const maxAge = 24 * 60 * 60; // 24 hours
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
