import crypto from 'crypto';

export class WaylService {
  static getApiBaseUrl(): string {
    return process.env['WAYL_API_BASE_URL'] || 'https://api.thewayl.com';
  }

  static getAuthHeaderName(): string {
    return process.env['WAYL_AUTH_HEADER'] || 'X-WAYL-AUTHENTICATION-KEY';
  }

  static getMerchantToken(): string {
    const t = process.env['WAYL_MERCHANT_TOKEN'] || '';
    if (!t) throw new Error('WAYL_MERCHANT_TOKEN is not configured');
    return t;
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
        [this.getAuthHeaderName()]: this.getMerchantToken(),
      },
      body: JSON.stringify(payload),
    } as any);

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(json?.message || 'Wayl create link failed');
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
