"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InvoiceEntryModel = void 0;
const database_1 = __importDefault(require("../config/database"));
class InvoiceEntryModel {
    static async create(data) {
        const q = `
      INSERT INTO invoice_entries (invoice_id, entry_type, amount, installment_id, payment_method, paid_at, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING *
    `;
        const v = [
            data.invoiceId,
            data.entryType,
            data.amount,
            data.installmentId || null,
            data.paymentMethod || null,
            data.paidAt || null,
            data.notes || null,
        ];
        const r = await database_1.default.query(q, v);
        return r.rows[0];
    }
    static async listByInvoice(invoiceId) {
        const r = await database_1.default.query('SELECT * FROM invoice_entries WHERE invoice_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC', [invoiceId]);
        return r.rows;
    }
}
exports.InvoiceEntryModel = InvoiceEntryModel;
//# sourceMappingURL=invoice-entry.model.js.map