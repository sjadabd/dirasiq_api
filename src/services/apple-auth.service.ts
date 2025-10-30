import jwt, { JwtHeader } from 'jsonwebtoken';
import { createPublicKey, KeyObject } from 'crypto';

export class AppleAuthService {
  private static APPLE_KEYS_URL = 'https://appleid.apple.com/auth/keys';
  private static APPLE_TOKEN_URL = 'https://appleid.apple.com/auth/token';

  // Fetch Apple's JWKS
  private static async getAppleKeys(): Promise<any> {
    let _fetch: any = (globalThis as any).fetch;
    if (!_fetch) {
      try {
        const mod = await import('node-fetch');
        _fetch = (mod as any).default || mod;
      } catch (e) {
        throw new Error('Fetch API not available. Install node-fetch for Node<18');
      }
    }
    const res = await _fetch(this.APPLE_KEYS_URL as any);
    if (!res.ok) throw new Error('Failed to fetch Apple JWKS');
    return res.json();
  }

  // Generate client_secret JWT for Apple token exchange (ES256)
  private static generateClientSecret(): string {
    const teamId = process.env['APPLE_TEAM_ID'];
    const clientId = process.env['APPLE_CLIENT_ID'];
    const keyId = process.env['APPLE_KEY_ID'];
    const privateKey = process.env['APPLE_PRIVATE_KEY'];

    if (!teamId || !clientId || !keyId || !privateKey) {
      throw new Error('Missing Apple credentials (TEAM_ID / CLIENT_ID / KEY_ID / PRIVATE_KEY)');
    }

    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: teamId,
      iat: now,
      exp: now + 5 * 60, // 5 minutes
      aud: 'https://appleid.apple.com',
      sub: clientId,
    } as any;

    const token = jwt.sign(payload, privateKey.replace(/\\n/g, '\n'), {
      algorithm: 'ES256',
      keyid: keyId,
    } as any);

    return token;
  }

  // Exchange authorization code for Apple tokens
  static async exchangeAuthorizationCode(code: string, redirectUri?: string): Promise<{
    success: boolean;
    data?: any;
    error?: string;
  }> {
    try {
      let _fetch: any = (globalThis as any).fetch;
      if (!_fetch) {
        const mod = await import('node-fetch');
        _fetch = (mod as any).default || mod;
      }

      const clientSecret = this.generateClientSecret();
      const clientId = process.env['APPLE_CLIENT_ID'];
      if (!clientId) throw new Error('APPLE_CLIENT_ID is required');

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
      } as any);

      const json = await res.json();
      if (!res.ok || json.error) {
        return { success: false, error: json.error_description || json.error || 'Apple token exchange failed' };
      }

      return { success: true, data: json };
    } catch (e: any) {
      console.error('Apple code exchange error:', e);
      return { success: false, error: e.message || 'Apple code exchange error' };
    }
  }

  // Verify Apple identity token (JWT) and return payload
  static async verifyIdentityToken(idToken: string): Promise<{
    success: boolean;
    payload?: any;
    error?: string;
  }> {
    try {
      const decodedHeader = jwt.decode(idToken, { complete: true }) as { header: JwtHeader } | null;
      if (!decodedHeader || !decodedHeader.header || !decodedHeader.header.kid) {
        return { success: false, error: 'Invalid Apple token header' };
      }

      const { kid, alg } = decodedHeader.header as any;
      const jwks = await this.getAppleKeys();
      const key = jwks.keys.find((k: any) => k.kid === kid && (alg ? k.alg === alg : true));
      if (!key) {
        return { success: false, error: 'Apple public key not found' };
      }

      // Create a KeyObject directly from JWK (Node 15+)
      let publicKey: KeyObject;
      try {
        publicKey = createPublicKey({ key, format: 'jwk' as any });
      } catch (e) {
        return { success: false, error: 'Failed to construct Apple public key' };
      }

      const audienceCandidates = [
        process.env['APPLE_CLIENT_ID'],
        process.env['APPLE_BUNDLE_ID'],
      ].filter(Boolean);
      const verified = jwt.verify(idToken, publicKey, {
        algorithms: ['RS256'],
        issuer: 'https://appleid.apple.com',
        audience: audienceCandidates,
      } as any);

      return { success: true, payload: verified };
    } catch (e: any) {
      console.error('Apple token verification error:', e);
      return { success: false, error: e.message || 'Failed to verify Apple token' };
    }
  }
}
