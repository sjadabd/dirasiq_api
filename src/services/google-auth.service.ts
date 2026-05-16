import { OAuth2Client } from 'google-auth-library';

import { ApiError, ErrorCodes } from '../utils/api-error';

export interface GoogleUser {
  id: string | undefined;
  name: string | undefined;
  email: string | undefined;
  picture: string | undefined;
  email_verified: boolean | undefined;
}

export interface GoogleTokenData {
  iss: string | undefined;
  azp: string | undefined;
  aud: string | undefined;
  sub: string | undefined;
  email: string | undefined;
  email_verified: boolean | undefined;
  nbf: number | undefined;
  name: string | undefined;
  picture: string | undefined;
  given_name: string | undefined;
  family_name: string | undefined;
  iat: number | undefined;
  exp: number | undefined;
  jti: string | undefined;
}

export class GoogleAuthService {
  private static client: OAuth2Client;

  static initialize(): void {
    const clientId = process.env['GOOGLE_CLIENT_ID'] || '';
    const clientSecret = process.env['GOOGLE_CLIENT_SECRET'] || '';
    const redirectUri = process.env['GOOGLE_REDIRECT_URI'] || '';
    this.client = new OAuth2Client(clientId, clientSecret, redirectUri);
  }

  /**
   * Exchange an authorization code for access + id tokens.
   * Throws `ApiError` on any Google failure — the caller's `asyncHandler`
   * propagates it to the canonical envelope.
   */
  static async exchangeCodeForTokens(
    code: string
  ): Promise<{ tokens: unknown; user: GoogleUser }> {
    if (!this.client) this.initialize();

    let tokens;
    try {
      ({ tokens } = await this.client.getToken(code));
    } catch (err) {
      throw new ApiError(
        400,
        'Failed to exchange Google code',
        ErrorCodes.UNAUTHORIZED,
        { provider: 'google', cause: err instanceof Error ? err.message : String(err) }
      );
    }
    this.client.setCredentials(tokens);

    if (!tokens.id_token) {
      throw new ApiError(400, 'Missing id_token from Google', ErrorCodes.UNAUTHORIZED);
    }

    const ticket = await this.client.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env['GOOGLE_CLIENT_ID'] || '',
    });
    const payload = ticket.getPayload();
    if (!payload) {
      throw new ApiError(400, 'No payload found in token', ErrorCodes.UNAUTHORIZED);
    }

    const user: GoogleUser = {
      id: payload.sub,
      name: payload.name,
      email: payload.email,
      picture: payload.picture,
      email_verified: payload.email_verified,
    };
    return { tokens, user };
  }

  /** Verify a Google ID token. Throws on any failure. */
  static async verifyGoogleToken(idToken: string): Promise<GoogleTokenData> {
    if (!this.client) this.initialize();

    let payload;
    try {
      const ticket = await this.client.verifyIdToken({
        idToken,
        audience:
          process.env['GOOGLE_CLIENT_ID'] ||
          '347174406018-8q0gaa0spce1hr7rsa1okge2or0sd6br.apps.googleusercontent.com',
      });
      payload = ticket.getPayload();
    } catch (err) {
      throw new ApiError(
        400,
        'Failed to verify Google token',
        ErrorCodes.UNAUTHORIZED,
        { provider: 'google', cause: err instanceof Error ? err.message : String(err) }
      );
    }

    if (!payload) {
      throw new ApiError(400, 'Invalid Google token payload', ErrorCodes.UNAUTHORIZED);
    }

    return {
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
      jti: (payload as any).jti,
    };
  }

  // Pure-data structural check; doesn't throw.
  static validateGoogleData(googleData: any): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    const requiredFields = ['iss', 'azp', 'aud', 'sub', 'email', 'name'];
    for (const field of requiredFields) {
      if (!googleData[field]) errors.push(`Missing required field: ${field}`);
    }
    if (googleData.email && !this.isValidEmail(googleData.email)) {
      errors.push('Invalid email format');
    }
    if (googleData.iss && googleData.iss !== 'https://accounts.google.com') {
      errors.push('Invalid token issuer');
    }
    const expectedAudience =
      process.env['GOOGLE_CLIENT_ID'] ||
      '347174406018-8q0gaa0spce1hr7rsa1okge2or0sd6br.apps.googleusercontent.com';
    if (googleData.aud && googleData.aud !== expectedAudience) {
      errors.push('Invalid token audience');
    }
    if (googleData.email_verified === false) {
      errors.push('Email not verified by Google');
    }
    if (googleData.exp) {
      const currentTime = Math.floor(Date.now() / 1000);
      if (googleData.exp < currentTime) errors.push('Token has expired');
    }
    return { isValid: errors.length === 0, errors };
  }

  private static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Verify-with-security-checks. Throws `ApiError(400, ..., UNAUTHORIZED, {legacyErrors})`
   * on any validation failure so the caller propagates a stable envelope. On
   * success returns the verified data.
   */
  static async verifyGoogleDataWithSecurity(googleData: any): Promise<any> {
    const errors: string[] = [];
    const validation = this.validateGoogleData(googleData);
    if (!validation.isValid) errors.push(...validation.errors);

    if (googleData.sub) {
      if (googleData.sub.length < 10 || googleData.sub.length > 30) {
        errors.push('Invalid Google user ID format');
      }
    }
    if (googleData.nbf) {
      const currentTime = Math.floor(Date.now() / 1000);
      if (googleData.nbf > currentTime) errors.push('Token not yet valid');
    }
    if (googleData.iat) {
      const currentTime = Math.floor(Date.now() / 1000);
      const maxAge = 24 * 60 * 60;
      if (currentTime - googleData.iat > maxAge) errors.push('Token too old');
    }

    if (errors.length > 0) {
      throw new ApiError(400, 'بيانات Google غير صحيحة', ErrorCodes.UNAUTHORIZED, {
        legacyErrors: errors,
      });
    }
    return googleData;
  }
}
