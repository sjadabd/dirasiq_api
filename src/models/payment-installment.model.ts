import {
  CreateInstallmentRequest,
  InstallmentResponse,
  PaginatedResponse,
  PaginationParams,
  PaymentInstallment,
  PaymentMethod,
  UpdateInstallmentRequest
} from '@/types';
import { getMessage } from '@/utils/messages';
import { Pool } from 'pg';

export class PaymentInstallmentModel {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * إنشاء قسط جديد
   */
  async create(data: CreateInstallmentRequest): Promise<PaymentInstallment> {
    const { invoiceId, installmentNumber, installmentAmount, dueDate } = data;

    // التحقق من وجود الفاتورة
    const invoiceQuery = `
      SELECT * FROM course_invoices
      WHERE id = $1 AND deleted_at IS NULL
    `;
    const invoiceResult = await this.pool.query(invoiceQuery, [invoiceId]);

    if (invoiceResult.rows.length === 0) {
      throw new Error(getMessage('INSTALLMENT.INVOICE_NOT_FOUND'));
    }

    const invoice = invoiceResult.rows[0];

    // التحقق من أن الفاتورة نشطة
    if (invoice.invoiceStatus === 'cancelled') {
      throw new Error(getMessage('INSTALLMENT.INVOICE_NOT_ACTIVE'));
    }

    // التحقق من عدم وجود قسط بنفس الرقم
    const existingInstallmentQuery = `
      SELECT id FROM payment_installments
      WHERE invoice_id = $1 AND installment_number = $2 AND deleted_at IS NULL
    `;
    const existingInstallmentResult = await this.pool.query(existingInstallmentQuery, [invoiceId, installmentNumber]);

    if (existingInstallmentResult.rows.length > 0) {
      throw new Error(getMessage('INSTALLMENT.INSTALLMENT_NUMBER_EXISTS'));
    }

    // التحقق من أن مبلغ القسط لا يتجاوز المبلغ المتبقي في الفاتورة
    const totalInstallmentsQuery = `
      SELECT COALESCE(SUM(installment_amount), 0) as total_installments
      FROM payment_installments
      WHERE invoice_id = $1 AND deleted_at IS NULL
    `;
    const totalInstallmentsResult = await this.pool.query(totalInstallmentsQuery, [invoiceId]);
    const totalInstallments = parseFloat(totalInstallmentsResult.rows[0].total_installments);

    if (totalInstallments + installmentAmount > invoice.amountDue) {
      throw new Error(getMessage('INSTALLMENT.AMOUNT_PAID_TOO_HIGH'));
    }

    const query = `
      INSERT INTO payment_installments (
        invoice_id, installment_number, installment_amount, due_date
      ) VALUES ($1, $2, $3, $4)
      RETURNING *
    `;

    const result = await this.pool.query(query, [
      invoiceId, installmentNumber, installmentAmount, dueDate
    ]);

    return result.rows[0];
  }

  /**
   * إنشاء أقساط متعددة للفاتورة
   */
  async createMultipleForInvoice(
    invoiceId: string,
    installments: CreateInstallmentRequest[]
  ): Promise<PaymentInstallment[]> {
    const createdInstallments: PaymentInstallment[] = [];

    for (const installment of installments) {
      const created = await this.create({
        ...installment,
        invoiceId
      });
      createdInstallments.push(created);
    }

    return createdInstallments;
  }

  /**
   * الحصول على قسط بواسطة المعرف
   */
  async findById(id: string): Promise<PaymentInstallment | null> {
    const query = `
      SELECT * FROM payment_installments
      WHERE id = $1 AND deleted_at IS NULL
    `;

    const result = await this.pool.query(query, [id]);
    return result.rows[0] || null;
  }

  /**
   * الحصول على قسط مع البيانات المرتبطة
   */
  async findByIdWithDetails(id: string): Promise<InstallmentResponse | null> {
    const query = `
      SELECT
        pi.*,
        ci.invoice_number, ci.amount_due as invoice_amount_due,
        s.name as student_name, s.email as student_email,
        t.name as teacher_name, t.email as teacher_email,
        c.course_name
      FROM payment_installments pi
      JOIN course_invoices ci ON pi.invoice_id = ci.id
      JOIN users s ON ci.student_id = s.id
      JOIN users t ON ci.teacher_id = t.id
      JOIN courses c ON ci.course_id = c.id
      WHERE pi.id = $1 AND pi.deleted_at IS NULL
    `;

    const result = await this.pool.query(query, [id]);
    return result.rows[0] || null;
  }

  /**
   * الحصول على جميع أقساط الفاتورة
   */
  async findByInvoiceId(
    invoiceId: string,
    params: PaginationParams = {}
  ): Promise<PaginatedResponse<InstallmentResponse>> {
    const { page = 1, limit = 10, sortBy } = params;
    const offset = (page - 1) * limit;

    const whereClause = 'WHERE pi.invoice_id = $1 AND pi.deleted_at IS NULL';
    const orderBy = sortBy ? `ORDER BY pi.${sortBy.key} ${sortBy.order}` : 'ORDER BY pi.installment_number ASC';

    const countQuery = `
      SELECT COUNT(*)
      FROM payment_installments pi
      ${whereClause}
    `;

    const dataQuery = `
      SELECT
        pi.*,
        ci.invoice_number, ci.amount_due as invoice_amount_due,
        s.name as student_name, s.email as student_email,
        t.name as teacher_name, t.email as teacher_email,
        c.course_name
      FROM payment_installments pi
      JOIN course_invoices ci ON pi.invoice_id = ci.id
      JOIN users s ON ci.student_id = s.id
      JOIN users t ON ci.teacher_id = t.id
      JOIN courses c ON ci.course_id = c.id
      ${whereClause}
      ${orderBy}
      LIMIT $2 OFFSET $3
    `;

    const [countResult, dataResult] = await Promise.all([
      this.pool.query(countQuery, [invoiceId]),
      this.pool.query(dataQuery, [invoiceId, limit, offset])
    ]);

    const total = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(total / limit);

    return {
      data: dataResult.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages
      }
    };
  }

  /**
   * الحصول على جميع أقساط المعلم
   */
  async findByTeacherId(
    teacherId: string,
    params: PaginationParams = {}
  ): Promise<PaginatedResponse<InstallmentResponse>> {
    const { page = 1, limit = 10, search = '', sortBy } = params;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE ci.teacher_id = $1 AND pi.deleted_at IS NULL';
    const queryParams: any[] = [teacherId];
    let paramIndex = 2;

    if (search) {
      whereClause += ` AND (
        s.name ILIKE $${paramIndex} OR
        c.course_name ILIKE $${paramIndex} OR
        ci.invoice_number ILIKE $${paramIndex}
      )`;
      queryParams.push(`%${search}%`);
      paramIndex++;
    }

    const orderBy = sortBy ? `ORDER BY pi.${sortBy.key} ${sortBy.order}` : 'ORDER BY pi.due_date ASC';

    const countQuery = `
      SELECT COUNT(*)
      FROM payment_installments pi
      JOIN course_invoices ci ON pi.invoice_id = ci.id
      JOIN users s ON ci.student_id = s.id
      JOIN courses c ON ci.course_id = c.id
      ${whereClause}
    `;

    const dataQuery = `
      SELECT
        pi.*,
        ci.invoice_number, ci.amount_due as invoice_amount_due,
        s.name as student_name, s.email as student_email,
        t.name as teacher_name, t.email as teacher_email,
        c.course_name
      FROM payment_installments pi
      JOIN course_invoices ci ON pi.invoice_id = ci.id
      JOIN users s ON ci.student_id = s.id
      JOIN users t ON ci.teacher_id = t.id
      JOIN courses c ON ci.course_id = c.id
      ${whereClause}
      ${orderBy}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const [countResult, dataResult] = await Promise.all([
      this.pool.query(countQuery, queryParams),
      this.pool.query(dataQuery, [...queryParams, limit, offset])
    ]);

    const total = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(total / limit);

    return {
      data: dataResult.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages
      }
    };
  }

  /**
   * الحصول على جميع أقساط الطالب
   */
  async findByStudentId(
    studentId: string,
    params: PaginationParams = {}
  ): Promise<PaginatedResponse<InstallmentResponse>> {
    const { page = 1, limit = 10, search = '', sortBy } = params;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE ci.student_id = $1 AND pi.deleted_at IS NULL';
    const queryParams: any[] = [studentId];
    let paramIndex = 2;

    if (search) {
      whereClause += ` AND (
        t.name ILIKE $${paramIndex} OR
        c.course_name ILIKE $${paramIndex} OR
        ci.invoice_number ILIKE $${paramIndex}
      )`;
      queryParams.push(`%${search}%`);
      paramIndex++;
    }

    const orderBy = sortBy ? `ORDER BY pi.${sortBy.key} ${sortBy.order}` : 'ORDER BY pi.due_date ASC';

    const countQuery = `
      SELECT COUNT(*)
      FROM payment_installments pi
      JOIN course_invoices ci ON pi.invoice_id = ci.id
      JOIN users t ON ci.teacher_id = t.id
      JOIN courses c ON ci.course_id = c.id
      ${whereClause}
    `;

    const dataQuery = `
      SELECT
        pi.*,
        ci.invoice_number, ci.amount_due as invoice_amount_due,
        s.name as student_name, s.email as student_email,
        t.name as teacher_name, t.email as teacher_email,
        c.course_name
      FROM payment_installments pi
      JOIN course_invoices ci ON pi.invoice_id = ci.id
      JOIN users s ON ci.student_id = s.id
      JOIN users t ON ci.teacher_id = t.id
      JOIN courses c ON ci.course_id = c.id
      ${whereClause}
      ${orderBy}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const [countResult, dataResult] = await Promise.all([
      this.pool.query(countQuery, queryParams),
      this.pool.query(dataQuery, [...queryParams, limit, offset])
    ]);

    const total = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(total / limit);

    return {
      data: dataResult.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages
      }
    };
  }

  /**
   * تحديث القسط
   */
  async update(
    id: string,
    data: UpdateInstallmentRequest
  ): Promise<PaymentInstallment | null> {
    const {
      amountPaid,
      dueDate,
      paymentMethod,
      paymentNotes
    } = data;

    // التحقق من أن القسط قابل للتعديل
    const currentInstallment = await this.findById(id);
    if (!currentInstallment) {
      throw new Error(getMessage('INSTALLMENT.NOT_FOUND'));
    }

    if (currentInstallment.installmentStatus === 'paid') {
      throw new Error(getMessage('INSTALLMENT.CANNOT_MODIFY_PAID'));
    }

    // التحقق من المبلغ المدفوع
    if (amountPaid !== undefined && amountPaid > currentInstallment.installmentAmount) {
      throw new Error(getMessage('INSTALLMENT.AMOUNT_PAID_TOO_HIGH'));
    }

    // التحقق من طريقة الدفع
    if (paymentMethod && !Object.values(PaymentMethod).includes(paymentMethod)) {
      throw new Error(getMessage('INSTALLMENT.INVALID_PAYMENT_METHOD'));
    }

    const query = `
      UPDATE payment_installments
      SET
        amount_paid = COALESCE($1, amount_paid),
        due_date = COALESCE($2, due_date),
        payment_method = COALESCE($3, payment_method),
        payment_notes = COALESCE($4, payment_notes),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $5 AND deleted_at IS NULL
      RETURNING *
    `;

    const result = await this.pool.query(query, [
      amountPaid, dueDate, paymentMethod, paymentNotes, id
    ]);

    return result.rows[0] || null;
  }

  /**
   * حذف القسط (حذف ناعم)
   */
  async delete(id: string): Promise<boolean> {
    const query = `
      UPDATE payment_installments
      SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND deleted_at IS NULL
    `;

    const result = await this.pool.query(query, [id]);
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * الحصول على الأقساط المتأخرة
   */
  async getOverdueInstallments(): Promise<PaymentInstallment[]> {
    const query = `
      SELECT * FROM payment_installments
      WHERE due_date < CURRENT_DATE
      AND installment_status IN ('pending', 'partial')
      AND deleted_at IS NULL
    `;

    const result = await this.pool.query(query);
    return result.rows;
  }

  /**
   * تحديث حالة الأقساط المتأخرة
   */
  async updateOverdueInstallments(): Promise<number> {
    const query = `
      UPDATE payment_installments
      SET
        installment_status = 'overdue',
        updated_at = CURRENT_TIMESTAMP
      WHERE due_date < CURRENT_DATE
      AND installment_status = 'pending'
      AND deleted_at IS NULL
    `;

    const result = await this.pool.query(query);
    return result.rowCount ?? 0;
  }

  /**
   * الحصول على إجمالي الأقساط المدفوعة للفاتورة
   */
  async getTotalPaidByInvoiceId(invoiceId: string): Promise<number> {
    const query = `
      SELECT COALESCE(SUM(amount_paid), 0) as total_paid
      FROM payment_installments
      WHERE invoice_id = $1 AND deleted_at IS NULL
    `;

    const result = await this.pool.query(query, [invoiceId]);
    return parseFloat(result.rows[0].total_paid);
  }

  /**
   * الحصول على إجمالي الأقساط المطلوبة للفاتورة
   */
  async getTotalRequiredByInvoiceId(invoiceId: string): Promise<number> {
    const query = `
      SELECT COALESCE(SUM(installment_amount), 0) as total_required
      FROM payment_installments
      WHERE invoice_id = $1 AND deleted_at IS NULL
    `;

    const result = await this.pool.query(query, [invoiceId]);
    return parseFloat(result.rows[0].total_required);
  }

  /**
   * الحصول على عدد الأقساط المدفوعة للفاتورة
   */
  async getPaidInstallmentsCountByInvoiceId(invoiceId: string): Promise<number> {
    const query = `
      SELECT COUNT(*) FROM payment_installments
      WHERE invoice_id = $1 AND installment_status = 'paid' AND deleted_at IS NULL
    `;

    const result = await this.pool.query(query, [invoiceId]);
    return parseInt(result.rows[0].count);
  }

  /**
   * الحصول على عدد الأقساط الإجمالي للفاتورة
   */
  async getTotalInstallmentsCountByInvoiceId(invoiceId: string): Promise<number> {
    const query = `
      SELECT COUNT(*) FROM payment_installments
      WHERE invoice_id = $1 AND deleted_at IS NULL
    `;

    const result = await this.pool.query(query, [invoiceId]);
    return parseInt(result.rows[0].count);
  }

  /**
   * التحقق من إمكانية إنشاء المزيد من الأقساط للفاتورة
   */
  async canCreateMoreInstallments(invoiceId: string): Promise<boolean> {
    const invoiceQuery = `
      SELECT amount_due FROM course_invoices
      WHERE id = $1 AND deleted_at IS NULL
    `;
    const invoiceResult = await this.pool.query(invoiceQuery, [invoiceId]);

    if (invoiceResult.rows.length === 0) {
      return false;
    }

    const invoiceAmount = parseFloat(invoiceResult.rows[0].amount_due);
    const totalInstallments = await this.getTotalRequiredByInvoiceId(invoiceId);

    return totalInstallments < invoiceAmount;
  }
}
