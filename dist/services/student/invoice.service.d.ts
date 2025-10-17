import { DbCourseInvoice } from '../../models/course-invoice.model';
import { DbInvoiceInstallment } from '../../models/invoice-installment.model';
import { InvoiceStatus } from '../../types';
export declare class StudentInvoiceService {
    static listInvoices(studentId: string, options: {
        studyYear?: string;
        courseId?: string;
        status?: InvoiceStatus;
    }, page?: number, limit?: number): Promise<{
        invoices: (DbCourseInvoice & {
            teacher_name?: string;
            course_name?: string;
        })[];
        report: {
            total_amount_due: number;
            total_discount: number;
            total_paid: number;
            total_remaining: number;
            by_invoices: any[];
        };
    }>;
    static getInvoice(studentId: string, invoiceId: string): Promise<DbCourseInvoice | null>;
    static getInvoiceFull(studentId: string, invoiceId: string): Promise<any | null>;
    static listInstallments(studentId: string, invoiceId: string): Promise<DbInvoiceInstallment[] | null>;
    static getInstallmentFull(studentId: string, invoiceId: string, installmentId: string): Promise<any | null>;
}
//# sourceMappingURL=invoice.service.d.ts.map