import { InvoiceStatus, InvoiceType } from '../types';
export interface DbCourseInvoice {
    id: string;
    student_id: string;
    teacher_id: string;
    course_id: string;
    study_year: string;
    invoice_number: string | null;
    invoice_type: InvoiceType;
    payment_mode: 'cash' | 'installments';
    amount_due: number;
    discount_total: number;
    amount_paid: number;
    remaining_amount: number;
    invoice_status: InvoiceStatus;
    invoice_date: string;
    due_date: string | null;
    paid_date: string | null;
    notes: string | null;
    created_at: Date;
    updated_at: Date;
    deleted_at: Date | null;
}
export declare class CourseInvoiceModel {
    static create(data: {
        studentId: string;
        teacherId: string;
        courseId: string;
        studyYear: string;
        invoiceType: InvoiceType;
        paymentMode: 'cash' | 'installments';
        amountDue: number;
        invoiceDate?: string | null;
        dueDate?: string | null;
        notes?: string | null;
    }): Promise<DbCourseInvoice>;
    static findById(id: string): Promise<DbCourseInvoice | null>;
    static updateAggregates(id: string, delta: {
        amountPaid?: number;
        discountTotal?: number;
    }): Promise<DbCourseInvoice | null>;
    static updateStatusPaidIfZeroRemaining(id: string): Promise<DbCourseInvoice | null>;
    static listByTeacher(teacherId: string, studyYear: string, status?: InvoiceStatus): Promise<DbCourseInvoice[]>;
}
//# sourceMappingURL=course-invoice.model.d.ts.map