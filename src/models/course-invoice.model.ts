import {
  BulkInvoiceCreationRequest,
  BulkInvoiceCreationResponse,
  CourseInvoice,
  CreateInvoiceRequest,
  InvoiceResponse,
  InvoiceType,
  PaginatedResponse,
  PaginationParams,
  UpdateInvoiceRequest
} from '@/types';
import { getMessage } from '@/utils/messages';
import { Pool } from 'pg';

export class CourseInvoiceModel {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * إنشاء فاتورة جديدة
   */
  async create(data: CreateInvoiceRequest): Promise<CourseInvoice> {
    const { enrollmentId, invoiceType, amountDue, dueDate, notes } = data;

    // التحقق من وجود التسجيل
    const enrollmentQuery = `
      SELECT sce.*, c.teacher_id, c.id as course_id
      FROM student_course_enrollments sce
      JOIN courses c ON sce.course_id = c.id
      WHERE sce.id = $1 AND sce.deleted_at IS NULL
    `;
    const enrollmentResult = await this.pool.query(enrollmentQuery, [enrollmentId]);

    if (enrollmentResult.rows.length === 0) {
      throw new Error(getMessage('INVOICE.ENROLLMENT_NOT_FOUND'));
    }

    const enrollment = enrollmentResult.rows[0];

    // التحقق من أن التسجيل نشط
    if (enrollment.enrollment_status !== 'active') {
      throw new Error(getMessage('INVOICE.ENROLLMENT_NOT_ACTIVE'));
    }

    // إنشاء رقم فاتورة فريد
    const invoiceNumber = await this.generateInvoiceNumber();

    const query = `
      INSERT INTO course_invoices (
        enrollment_id, student_id, teacher_id, course_id,
        invoice_number, invoice_type, amount_due, due_date, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;

    const result = await this.pool.query(query, [
      enrollmentId, enrollment.student_id, enrollment.teacher_id, enrollment.course_id,
      invoiceNumber, invoiceType, amountDue, dueDate, notes
    ]);

    return result.rows[0];
  }

  /**
   * إنشاء فواتير متعددة
   */
  async createBulk(data: BulkInvoiceCreationRequest): Promise<BulkInvoiceCreationResponse> {
    const { enrollmentIds, invoiceType, amountDue, dueDate, notes, installments } = data;

    if (enrollmentIds.length === 0) {
      throw new Error(getMessage('BULK_OPERATIONS.NO_ITEMS_SELECTED'));
    }

    if (enrollmentIds.length > 100) {
      throw new Error(getMessage('BULK_OPERATIONS.TOO_MANY_ITEMS'));
    }

    const createdInvoices: InvoiceResponse[] = [];
    const errors: string[] = [];

    for (const enrollmentId of enrollmentIds) {
      try {
        const invoice = await this.create({
          enrollmentId,
          invoiceType,
          amountDue,
          dueDate,
          notes: notes || ''
        });

        // إنشاء الأقساط إذا تم تحديدها
        if (installments && installments.length > 0) {
          await this.createInstallmentsForInvoice(invoice.id, installments);
        }

        const invoiceWithDetails = await this.findByIdWithDetails(invoice.id);
        if (invoiceWithDetails) {
          createdInvoices.push(invoiceWithDetails);
        }
      } catch (error) {
        errors.push(`Enrollment ${enrollmentId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return {
      success: errors.length === 0,
      createdInvoices,
      errors
    };
  }

  /**
   * إنشاء أقساط للفاتورة
   */
  private async createInstallmentsForInvoice(
    invoiceId: string,
    installments: { installmentNumber: number; installmentAmount: number; dueDate: string }[]
  ): Promise<void> {
    for (const installment of installments) {
      const query = `
        INSERT INTO payment_installments (
          invoice_id, installment_number, installment_amount, due_date
        ) VALUES ($1, $2, $3, $4)
      `;

      await this.pool.query(query, [
        invoiceId,
        installment.installmentNumber,
        installment.installmentAmount,
        installment.dueDate
      ]);
    }
  }

  /**
   * إنشاء فاتورة حجز
   */
  async createReservationInvoice(
    enrollmentId: string,
    reservationAmount: number,
    dueDate: string
  ): Promise<CourseInvoice> {
    return this.create({
      enrollmentId,
      invoiceType: InvoiceType.RESERVATION,
      amountDue: reservationAmount,
      dueDate,
      notes: 'فاتورة حجز الكورس'
    });
  }

  /**
   * إنشاء فاتورة الكورس
   */
  async createCourseInvoice(
    enrollmentId: string,
    courseAmount: number,
    dueDate: string,
    notes?: string
  ): Promise<CourseInvoice> {
    return this.create({
      enrollmentId,
      invoiceType: InvoiceType.COURSE,
      amountDue: courseAmount,
      dueDate,
      notes: notes || 'فاتورة الكورس'
    });
  }

  /**
   * إنشاء فاتورة قسط
   */
  async createInstallmentInvoice(
    enrollmentId: string,
    installmentAmount: number,
    dueDate: string,
    installmentNumber: number
  ): Promise<CourseInvoice> {
    const invoice = await this.create({
      enrollmentId,
      invoiceType: InvoiceType.INSTALLMENT,
      amountDue: installmentAmount,
      dueDate,
      notes: `فاتورة القسط رقم ${installmentNumber}`
    });

    // إنشاء قسط واحد
    await this.createInstallmentsForInvoice(invoice.id, [{
      installmentNumber,
      installmentAmount,
      dueDate
    }]);

    return invoice;
  }

  /**
   * الحصول على فاتورة بواسطة المعرف
   */
  async findById(id: string): Promise<CourseInvoice | null> {
    const query = `
      SELECT * FROM course_invoices
      WHERE id = $1 AND deleted_at IS NULL
    `;

    const result = await this.pool.query(query, [id]);
    return result.rows[0] || null;
  }

  /**
   * الحصول على فاتورة مع البيانات المرتبطة
   */
  async findByIdWithDetails(id: string): Promise<InvoiceResponse | null> {
    const query = `
      SELECT
        ci.*,
        s.name as student_name, s.email as student_email,
        t.name as teacher_name, t.email as teacher_email,
        c.course_name, c.price
      FROM course_invoices ci
      JOIN users s ON ci.student_id = s.id
      JOIN users t ON ci.teacher_id = t.id
      JOIN courses c ON ci.course_id = c.id
      WHERE ci.id = $1 AND ci.deleted_at IS NULL
    `;

    const result = await this.pool.query(query, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    const invoice = result.rows[0];

    // الحصول على الأقساط
    const installmentsQuery = `
      SELECT * FROM payment_installments
      WHERE invoice_id = $1 AND deleted_at IS NULL
      ORDER BY installment_number
    `;
    const installmentsResult = await this.pool.query(installmentsQuery, [id]);

    return {
      ...invoice,
      installments: installmentsResult.rows
    };
  }

  /**
   * الحصول على جميع فواتير المعلم
   */
  async findByTeacherId(
    teacherId: string,
    params: PaginationParams = {}
  ): Promise<PaginatedResponse<InvoiceResponse>> {
    const { page = 1, limit = 10, search = '', sortBy } = params;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE ci.teacher_id = $1 AND ci.deleted_at IS NULL';
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

    const orderBy = sortBy ? `ORDER BY ci.${sortBy.key} ${sortBy.order}` : 'ORDER BY ci.created_at DESC';

    const countQuery = `
      SELECT COUNT(*)
      FROM course_invoices ci
      JOIN users s ON ci.student_id = s.id
      JOIN courses c ON ci.course_id = c.id
      ${whereClause}
    `;

    const dataQuery = `
      SELECT
        ci.*,
        s.name as student_name, s.email as student_email,
        t.name as teacher_name, t.email as teacher_email,
        c.course_name, c.price
      FROM course_invoices ci
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

    // الحصول على الأقساط لكل فاتورة
    const invoicesWithInstallments = await Promise.all(
      dataResult.rows.map(async (invoice) => {
        const installmentsQuery = `
          SELECT * FROM payment_installments
          WHERE invoice_id = $1 AND deleted_at IS NULL
          ORDER BY installment_number
        `;
        const installmentsResult = await this.pool.query(installmentsQuery, [invoice.id]);

        return {
          ...invoice,
          installments: installmentsResult.rows
        };
      })
    );

    return {
      data: invoicesWithInstallments,
      pagination: {
        page,
        limit,
        total,
        totalPages
      }
    };
  }

  /**
   * الحصول على جميع فواتير الطالب
   */
  async findByStudentId(
    studentId: string,
    params: PaginationParams = {}
  ): Promise<PaginatedResponse<InvoiceResponse>> {
    const { page = 1, limit = 10, search = '', sortBy } = params;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE ci.student_id = $1 AND ci.deleted_at IS NULL';
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

    const orderBy = sortBy ? `ORDER BY ci.${sortBy.key} ${sortBy.order}` : 'ORDER BY ci.created_at DESC';

    const countQuery = `
      SELECT COUNT(*)
      FROM course_invoices ci
      JOIN users t ON ci.teacher_id = t.id
      JOIN courses c ON ci.course_id = c.id
      ${whereClause}
    `;

    const dataQuery = `
      SELECT
        ci.*,
        s.name as student_name, s.email as student_email,
        t.name as teacher_name, t.email as teacher_email,
        c.course_name, c.price
      FROM course_invoices ci
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

    // الحصول على الأقساط لكل فاتورة
    const invoicesWithInstallments = await Promise.all(
      dataResult.rows.map(async (invoice) => {
        const installmentsQuery = `
          SELECT * FROM payment_installments
          WHERE invoice_id = $1 AND deleted_at IS NULL
          ORDER BY installment_number
        `;
        const installmentsResult = await this.pool.query(installmentsQuery, [invoice.id]);

        return {
          ...invoice,
          installments: installmentsResult.rows
        };
      })
    );

    return {
      data: invoicesWithInstallments,
      pagination: {
        page,
        limit,
        total,
        totalPages
      }
    };
  }

  /**
   * تحديث الفاتورة
   */
  async update(
    id: string,
    data: UpdateInvoiceRequest
  ): Promise<CourseInvoice | null> {
    const { amountPaid, dueDate, notes } = data;

    // التحقق من أن الفاتورة قابلة للتعديل
    const currentInvoice = await this.findById(id);
    if (!currentInvoice) {
      throw new Error(getMessage('INVOICE.NOT_FOUND'));
    }

    if (currentInvoice.invoiceStatus === 'paid') {
      throw new Error(getMessage('INVOICE.CANNOT_MODIFY_PAID'));
    }

    if (currentInvoice.invoiceStatus === 'cancelled') {
      throw new Error(getMessage('INVOICE.CANNOT_MODIFY_CANCELLED'));
    }

    // التحقق من المبلغ المدفوع
    if (amountPaid !== undefined && amountPaid > currentInvoice.amountDue) {
      throw new Error(getMessage('INVOICE.AMOUNT_PAID_TOO_HIGH'));
    }

    const query = `
      UPDATE course_invoices
      SET
        amount_paid = COALESCE($1, amount_paid),
        due_date = COALESCE($2, due_date),
        notes = COALESCE($3, notes),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $4 AND deleted_at IS NULL
      RETURNING *
    `;

    const result = await this.pool.query(query, [amountPaid, dueDate, notes, id]);
    return result.rows[0] || null;
  }

  /**
   * حذف الفاتورة (حذف ناعم)
   */
  async delete(id: string): Promise<boolean> {
    const query = `
      UPDATE course_invoices
      SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND deleted_at IS NULL
    `;

    const result = await this.pool.query(query, [id]);
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * الحصول على إجمالي الإيرادات للمعلم
   */
  async getTotalRevenueByTeacherId(teacherId: string): Promise<number> {
    const query = `
      SELECT COALESCE(SUM(amount_paid), 0) as total_revenue
      FROM course_invoices
      WHERE teacher_id = $1 AND deleted_at IS NULL
    `;

    const result = await this.pool.query(query, [teacherId]);
    return parseFloat(result.rows[0].total_revenue);
  }

  /**
   * الحصول على إجمالي المدفوعات المعلقة للمعلم
   */
  async getPendingPaymentsByTeacherId(teacherId: string): Promise<number> {
    const query = `
      SELECT COALESCE(SUM(amount_due - amount_paid), 0) as pending_payments
      FROM course_invoices
      WHERE teacher_id = $1 AND invoice_status IN ('pending', 'partial') AND deleted_at IS NULL
    `;

    const result = await this.pool.query(query, [teacherId]);
    return parseFloat(result.rows[0].pending_payments);
  }

  /**
   * الحصول على إجمالي المدفوعات المعلقة للطالب
   */
  async getPendingPaymentsByStudentId(studentId: string): Promise<number> {
    const query = `
      SELECT COALESCE(SUM(amount_due - amount_paid), 0) as pending_payments
      FROM course_invoices
      WHERE student_id = $1 AND invoice_status IN ('pending', 'partial') AND deleted_at IS NULL
    `;

    const result = await this.pool.query(query, [studentId]);
    return parseFloat(result.rows[0].pending_payments);
  }

  /**
   * إنشاء رقم فاتورة فريد
   */
  private async generateInvoiceNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, '0');

    const query = `
      SELECT COUNT(*) FROM course_invoices
      WHERE EXTRACT(YEAR FROM created_at) = $1
      AND EXTRACT(MONTH FROM created_at) = $2
    `;

    const result = await this.pool.query(query, [year, month]);
    const count = parseInt(result.rows[0].count) + 1;

    return `INV-${year}-${month}-${String(count).padStart(6, '0')}`;
  }

  /**
   * تحديث حالة الفواتير المتأخرة
   */
  async updateOverdueInvoices(): Promise<number> {
    const query = `
      UPDATE course_invoices
      SET
        invoice_status = 'overdue',
        updated_at = CURRENT_TIMESTAMP
      WHERE due_date < CURRENT_TIMESTAMP
      AND invoice_status = 'pending'
      AND deleted_at IS NULL
    `;

    const result = await this.pool.query(query);
    return result.rowCount ?? 0;
  }

  /**
   * الحصول على الفواتير المتأخرة
   */
  async getOverdueInvoices(): Promise<CourseInvoice[]> {
    const query = `
      SELECT * FROM course_invoices
      WHERE due_date < CURRENT_TIMESTAMP
      AND invoice_status IN ('pending', 'partial')
      AND deleted_at IS NULL
    `;

    const result = await this.pool.query(query);
    return result.rows;
  }
}
