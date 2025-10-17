import { InvoiceStatus, InvoiceType, PaymentMethod } from '../../types';
export declare class TeacherInvoiceService {
    static updateInvoice(teacherId: string, invoiceId: string, updates: {
        dueDate?: string | null;
        notes?: string | null;
        invoiceType?: InvoiceType;
        paymentMode?: 'cash' | 'installments';
        amountDue?: number;
        studentId?: string;
        invoiceDate?: string | null;
        discountAmount?: number;
        installments?: Array<{
            id?: string;
            installmentNumber: number;
            plannedAmount: number;
            dueDate: string;
            notes?: string | null;
            status?: 'pending' | 'partial' | 'paid';
            paidAmount?: number;
            paidDate?: string | null;
        }>;
        removeInstallmentIds?: string[];
    }): Promise<import("../../models/course-invoice.model").DbCourseInvoice | null>;
    static createInvoice(options: {
        teacherId: string;
        studentId: string;
        courseId: string;
        studyYear: string;
        invoiceType: InvoiceType;
        paymentMode: 'cash' | 'installments';
        amountDue: number;
        discountAmount?: number;
        invoiceDate?: string | null;
        dueDate?: string | null;
        notes?: string | null;
        installments?: Array<{
            installmentNumber: number;
            plannedAmount: number;
            dueDate: string;
            notes?: string;
            paid?: boolean;
            paidDate?: string;
        }>;
    }): Promise<import("../../models/course-invoice.model").DbCourseInvoice | null>;
    static addPayment(options: {
        invoiceId: string;
        amount: number;
        paymentMethod: PaymentMethod;
        installmentId?: string | null;
        paidAt?: Date | null;
        notes?: string | null;
    }): Promise<import("../../models/course-invoice.model").DbCourseInvoice | null>;
    static addDiscount(options: {
        invoiceId: string;
        amount: number;
        notes?: string | null;
    }): Promise<import("../../models/course-invoice.model").DbCourseInvoice | null>;
    static listTeacherInvoices(teacherId: string, studyYear: string, status?: InvoiceStatus, deleted?: 'true' | 'false' | 'all', page?: number, limit?: number): Promise<{
        items: any[];
        total: number;
    }>;
    static getTeacherInvoicesSummary(teacherId: string, studyYear: string, status?: InvoiceStatus, deleted?: 'true' | 'false' | 'all'): Promise<{
        totalAmount: number;
        totalPaid: number;
        partialPaidTotal: number;
        totalDiscount: number;
        totalRemaining: number;
        totalCount: number;
        paidCount: number;
        discountCount: number;
        remainingCount: number;
    }>;
    static getInvoiceForTeacher(teacherId: string, invoiceId: string): Promise<import("../../models/course-invoice.model").DbCourseInvoice | null>;
    static listInstallmentsByInvoice(teacherId: string, invoiceId: string): Promise<import("../../models/invoice-installment.model").DbInvoiceInstallment[] | null>;
    static softDeleteInvoice(teacherId: string, invoiceId: string): Promise<boolean>;
    static restoreInvoice(teacherId: string, invoiceId: string): Promise<boolean>;
}
//# sourceMappingURL=invoice.service.d.ts.map