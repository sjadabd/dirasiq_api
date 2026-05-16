import { createPublicKey, type KeyObject } from 'crypto';
import jwt, { type JwtHeader } from 'jsonwebtoken';

import { ApiError, ErrorCodes } from '../utils/api-error';

export class AppleAuthService {
  private static APPLE_KEYS_URL = 'https://appleid.apple.com/auth/keys';
  private static APPLE_TOKEN_URL = 'https://appleid.apple.com/auth/token';

  private static async getAppleKeys(): Promise<any> {
    let _fetch: any = (globalThis as any).fetch;
    if (!_fetch) {
      try {
        const mod = await import('node-fetch');
        _fetch = (mod as any).default || mod;
      } catch {
        throw new Error('Fetch API not available. Install node-fetch for Node<18');
      }
    }
    const res = await _fetch(this.APPLE_KEYS_URL);
    if (!res.ok) throw new Error('Failed to fetch Apple JWKS');
    return res.json();
  }

  /** Generate the ES256 client_secret JWT for Apple's token endpoint. */
  private static generateClientSecret(): string {
    const teamId = process.env['APPLE_TEAM_ID'];
    const clientId = process.env['APPLE_CLIENT_ID'];
    const keyId = process.env['APPLE_KEY_ID'];
    const privateKey = process.env['APPLE_PRIVATE_KEY'];

    if (!teamId || !clientId || !keyId || !privateKey) {
      throw new ApiError(
        500,
        'Missing Apple credentials (TEAM_ID / CLIENT_ID / KEY_ID / PRIVATE_KEY)',
        ErrorCodes.SERVICE_UNAVAILABLE
      );
    }

    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: teamId,
      iat: now,
      exp: now + 5 * 60,
      aud: 'https://appleid.apple.com',
      sub: clientId,
    } as Record<string, unknown>;

    return jwt.sign(payload, privateKey.replace(/\\n/g, '\n'), {
      algorithm: 'ES256',
      keyid: keyId,
    } as any);
  }

  /**
   * Exchange an authorization code for Apple tokens. Throws `ApiError` on any
   * Apple-side failure.
   */
  static async exchangeAuthorizationCode(code: string, redirectUri?: string): Promise<any> {
    let _fetch: any = (globalThis as any).fetch;
    if (!_fetch) {
      const mod = await import('node-fetch');
      _fetch = (mod as any).default || mod;
    }

    const clientSecret = this.generateClientSecret();
    const clientId = process.env['APPLE_CLIENT_ID'];
    if (!clientId) {
      throw new ApiError(500, 'APPLE_CLIENT_ID is required', ErrorCodes.SERVICE_UNAVAILABLE);
    }

    const body = new URLSearchParams();
    body.set('grant_type', 'authorization_code');
    body.set('code', code);
    body.set('client_id', clientId);
    body.set('client_secret', clientSecret);
    if (redirectUri) body.set('redirect_uri', redirectUri);

    const res = await _fetch(this.APPLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    const json = await res.json();
    if (!res.ok || json.error) {
      throw new ApiError(
        400,
        json.error_description || json.error || 'Apple token exchange failed',
        ErrorCodes.UNAUTHORIZED,
        { provider: 'apple', appleError: json.error }
      );
    }
    return json;
  }

  /** Verify Apple's identity token (RS256 JWT). Throws on failure. */
  static async verifyIdentityToken(idToken: string): Promise<any> {
    let decodedHeader: { header: JwtHeader } | null;
    try {
      decodedHeader = jwt.decode(idToken, { complete: true }) as { header: JwtHeader } | null;
    } catch (err) {
      throw new ApiError(
        400,
        'Invalid Apple token header',
        ErrorCodes.UNAUTHORIZED,
        { provider: 'apple', cause: err instanceof Error ? err.message : String(err) }
      );
    }

    if (!decodedHeader?.header?.kid) {
      throw new ApiError(400, 'Invalid Apple token header', ErrorCodes.UNAUTHORIZED);
    }

    const { kid, alg } = decodedHeader.header as { kid: string; alg: string };
    const jwks = await this.getAppleKeys();
    const key = jwks.keys.find((k: any) => k.kid === kid && (alg ? k.alg === alg : true));
    if (!key) {
      throw new ApiError(400, 'Apple public key not found', ErrorCodes.UNAUTHORIZED);
    }

    let publicKey: KeyObject;
    try {
      publicKey = createPublicKey({ key, format: 'jwk' as any });
    } catch {
      throw new ApiError(
        400,
        'Failed to construct Apple public key',
        ErrorCodes.UNAUTHORIZED
      );
    }

    const audienceCandidates = [
      process.env['APPLE_CLIENT_ID'],
      process.env['APPLE_BUNDLE_ID'],
    ].filter(Boolean) as string[];

    try {
      return jwt.verify(idToken, publicKey, {
        algorithms: ['RS256'],
        issuer: 'https://appleid.apple.com',
        audience: audienceCandidates as any,
      });
    } catch (err) {
      throw new ApiError(
        400,
        err instanceof Error ? err.message : 'Failed to verify Apple token',
        ErrorCodes.UNAUTHORIZED,
        { provider: 'apple' }
      );
    }
  }
}
