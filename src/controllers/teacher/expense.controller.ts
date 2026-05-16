import type { Request, Response } from 'express';

import { AcademicYearModel } from '../../models/academic-year.model';
import { TeacherExpenseModel } from '../../models/teacher-expense.model';
import { ApiError, ErrorCodes } from '../../utils/api-error';
import { ok, okEmpty } from '../../utils/response.util';
import { buildPaginationMeta } from '../../utils/pagination';

export class TeacherExpenseController {
  static async create(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const { amount, note, expense_date } = req.body;
    const activeYear = await AcademicYearModel.getActive();
    const expense = await TeacherExpenseModel.create({
      teacherId,
      amount,
      note: note ?? null,
      expenseDate: expense_date ?? null,
      studyYear: activeYear?.year ?? null,
    });
    res.status(201).json(ok(expense, 'تم إنشاء المصروف'));
  }

  static async list(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    // After validate(), req.query holds Zod-coerced values.
    const query = req.query as unknown as {
      page?: number;
      limit?: number;
      from?: string;
      to?: string;
      studyYear?: string;
    };
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const result = await TeacherExpenseModel.list(
      teacherId,
      page,
      limit,
      query.from,
      query.to,
      query.studyYear
    );

    // Preserve the legacy `summary` block under `meta.summary` so dashboards
    // that already consume it keep working.
    res.status(200).json(
      ok(result.data, 'تم جلب المصروفات', {
        pagination: buildPaginationMeta(result.total, page, limit),
        summary: result.summary,
      })
    );
  }

  static async update(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const id = req.params['id'] as string;
    const { amount, note, expense_date } = req.body as {
      amount?: number;
      note?: string | null;
      expense_date?: string | null;
    };

    const patch: Record<string, unknown> = {};
    if (amount !== undefined) patch['amount'] = amount;
    if (note !== undefined) patch['note'] = note ?? null;
    if (expense_date !== undefined) patch['expenseDate'] = expense_date ?? null;

    const updated = await TeacherExpenseModel.update(id, teacherId, patch as any);
    if (!updated) {
      throw new ApiError(404, 'المصروف غير موجود', ErrorCodes.NOT_FOUND);
    }
    res.status(200).json(ok(updated, 'تم تحديث المصروف'));
  }

  static async remove(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const id = req.params['id'] as string;
    const success = await TeacherExpenseModel.softDelete(id, teacherId);
    if (!success) {
      throw new ApiError(404, 'المصروف غير موجود', ErrorCodes.NOT_FOUND);
    }
    res.status(200).json(okEmpty('تم حذف المصروف'));
  }
}
