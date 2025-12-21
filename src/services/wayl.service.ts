import crypto from 'crypto';

export class WaylService {
  static getApiBaseUrl(): string {
    return process.env['WAYL_API_BASE_URL'] || 'https://api.thewayl.com';
  }

  static getAuthHeaderName(): string {
    return process.env['WAYL_AUTH_HEADER'] || 'X-WAYL-AUTHENTICATION';
  }

  static getMerchantToken(): string {
    const t = process.env['WAYL_MERCHANT_TOKEN'] || '';
    if (!t) throw new Error('WAYL_MERCHANT_TOKEN is not configured');
    return t;
  }

  private static buildAuthHeaders(): Record<string, string> {
    const token = this.getMerchantToken();
    const configured = this.getAuthHeaderName();

    // Wayl docs/examples sometimes vary in header naming.
    // Send the token using multiple common header names to avoid env misconfig.
    const headers: Record<string, string> = {
      [configured]: token,
      'X-WAYL-AUTHENTICATION-KEY': token,
      'X-WAYL-AUTHENTICATION': token,
    };

    return headers;
  }

  static async createLink(payload: any): Promise<any> {
    let _fetch: any = (globalThis as any).fetch;
    if (!_fetch) {
      const mod = await import('node-fetch');
      _fetch = (mod as any).default || mod;
    }

    const url = `${this.getApiBaseUrl()}/api/v1/links`;
    const res = await _fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...this.buildAuthHeaders(),
      },
      body: JSON.stringify(payload),
    } as any);

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg =
        json?.message ||
        json?.error?.message ||
        json?.error ||
        'Wayl create link failed';
      const details = (() => {
        try {
          return JSON.stringify(json);
        } catch {
          return String(json);
        }
      })();
      throw new Error(`${msg} (status=${res.status}) body=${details}`);
    }
    return json;
  }

  static verifyWebhookSignature(options: {
    data: string;
    signature: string;
    secret: string;
  }): boolean {
    const calculatedSignature = crypto
      .createHmac('sha256', options.secret)
      .update(options.data)
      .digest('hex');

    const signatureBuffer = Buffer.from(options.signature, 'hex');
    const calculatedSignatureBuffer = Buffer.from(calculatedSignature, 'hex');

    if (signatureBuffer.length !== calculatedSignatureBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(signatureBuffer, calculatedSignatureBuffer);
  }

  static generateSecret(): string {
    return crypto.randomBytes(32).toString('hex');
  }
}
