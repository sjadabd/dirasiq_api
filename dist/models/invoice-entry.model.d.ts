import { PaymentMethod } from '../types';
export type EntryType = 'payment' | 'discount' | 'refund' | 'adjustment';
export interface DbInvoiceEntry {
    id: string;
    invoice_id: string;
    entry_type: EntryType;
    amount: number;
    installment_id: string | null;
    payment_method: PaymentMethod | null;
    installment_status: string | null;
    paid_at: string | null;
    notes: string | null;
    created_at: Date;
    updated_at: Date;
    deleted_at: Date | null;
}
export declare class InvoiceEntryModel {
    static create(data: {
        invoiceId: string;
        entryType: EntryType;
        amount: number;
        installmentId?: string | null;
        paymentMethod?: PaymentMethod | null;
        paidAt?: Date | null;
        notes?: string | null;
    }): Promise<DbInvoiceEntry>;
    static listByInvoice(invoiceId: string): Promise<DbInvoiceEntry[]>;
}
//# sourceMappingURL=invoice-entry.model.d.ts.map