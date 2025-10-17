import { InstallmentStatus } from '../types';
export interface DbInvoiceInstallment {
    id: string;
    invoice_id: string;
    installment_number: number;
    planned_amount: number;
    paid_amount: number;
    remaining_amount: number;
    installment_status: InstallmentStatus;
    due_date: string;
    paid_date: string | null;
    notes: string | null;
    created_at: Date;
    updated_at: Date;
    deleted_at: Date | null;
}
export declare class InvoiceInstallmentModel {
    static createMany(invoiceId: string, installments: Array<{
        installmentNumber: number;
        plannedAmount: number;
        dueDate: string;
        notes?: string;
    }>): Promise<DbInvoiceInstallment[]>;
    static listByInvoice(invoiceId: string): Promise<DbInvoiceInstallment[]>;
    static addPayment(installmentId: string, amount: number, paidAt?: Date): Promise<DbInvoiceInstallment | null>;
}
//# sourceMappingURL=invoice-installment.model.d.ts.map