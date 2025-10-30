import jwt, { JwtHeader } from 'jsonwebtoken';
import { createPublicKey, KeyObject } from 'crypto';

export class AppleAuthService {
  private static APPLE_KEYS_URL = 'https://appleid.apple.com/auth/keys';

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
