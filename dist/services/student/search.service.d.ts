import { ApiResponse } from '../../types';
interface UnifiedSearchParams {
    q?: string;
    maxDistance?: number;
    page?: number;
    limit?: number;
}
export declare class StudentUnifiedSearchService {
    static unifiedSearch(studentId: string, params: UnifiedSearchParams): Promise<ApiResponse>;
}
export {};
//# sourceMappingURL=search.service.d.ts.map