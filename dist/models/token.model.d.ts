import { Token } from '../types';
export declare class TokenModel {
    static create(userId: string, token: string, expiresAt: Date, oneSignalPlayerId?: string): Promise<Token>;
    static getPlayerIdsByUserId(userId: string): Promise<string[]>;
    static updatePlayerId(userId: string, token: string, playerId: string): Promise<boolean>;
    static getPlayerId(userId: string): Promise<string | null>;
    static findByToken(token: string): Promise<Token | null>;
    static findByUserId(userId: string): Promise<Token[]>;
    static deleteByToken(token: string): Promise<boolean>;
    static deleteByUserId(userId: string): Promise<boolean>;
    static cleanExpiredTokens(): Promise<number>;
    static getTokenCount(userId: string): Promise<number>;
    private static mapDatabaseTokenToToken;
}
//# sourceMappingURL=token.model.d.ts.map