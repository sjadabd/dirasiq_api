"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InvoiceInstallmentModel = void 0;
const database_1 = __importDefault(require("../config/database"));
class InvoiceInstallmentModel {
    static async createMany(invoiceId, installments) {
        const client = await database_1.default.connect();
        try {
            await client.query('BEGIN');
            const out = [];
            for (const inst of installments) {
                const q = `
          INSERT INTO invoice_installments (invoice_id, installment_number, planned_amount, due_date, notes)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING *
        `;
                const r = await client.query(q, [invoiceId, inst.installmentNumber, inst.plannedAmount, inst.dueDate, inst.notes || null]);
                out.push(r.rows[0]);
            }
            await client.query('COMMIT');
            return out;
        }
        catch (e) {
            await client.query('ROLLBACK');
            throw e;
        }
        finally {
            client.release();
        }
    }
    static async listByInvoice(invoiceId) {
        const r = await database_1.default.query('SELECT * FROM invoice_installments WHERE invoice_id = $1 AND deleted_at IS NULL ORDER BY installment_number ASC', [invoiceId]);
        return r.rows;
    }
    static async addPayment(installmentId, amount, paidAt) {
        const paidStr = (paidAt ? new Date(paidAt) : new Date()).toISOString().slice(0, 10);
        const q = `
      UPDATE invoice_installments
      SET paid_amount = GREATEST(paid_amount + $1, 0),
          installment_status = CASE
            WHEN (planned_amount - (paid_amount + $1)) <= 0 THEN 'paid'
            WHEN (paid_amount + $1) > 0 THEN 'partial'
            ELSE 'pending'
          END,
          paid_date = CASE WHEN (planned_amount - (paid_amount + $1)) <= 0 THEN $2 ELSE paid_date END,
          updated_at = NOW()
      WHERE id = $3
      RETURNING *
    `;
        const r = await database_1.default.query(q, [amount, paidStr, installmentId]);
        return r.rows[0] || null;
    }
}
exports.InvoiceInstallmentModel = InvoiceInstallmentModel;
//# sourceMappingURL=invoice-installment.model.js.map