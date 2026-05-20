import type { Request, Response } from 'express';

import { AcademicYearModel } from '../../models/academic-year.model';
import {
  TeacherExpenseModel,
  type ExpenseCategory,
  type ExpensePaymentMethod,
} from '../../models/teacher-expense.model';
import { ApiError, ErrorCodes } from '../../utils/api-error';
import { ok, okEmpty } from '../../utils/response.util';
import { buildPaginationMeta } from '../../utils/pagination';

export class TeacherExpenseController {
  static async create(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const { amount, note, expense_date, category, paymentMethod } = req.body as {
      amount: number;
      note?: string | null;
      expense_date?: string | null;
      category?: ExpenseCategory;
      paymentMethod?: ExpensePaymentMethod;
    };
    const activeYear = await AcademicYearModel.getActive();
    const createOpts: Parameters<typeof TeacherExpenseModel.create>[0] = {
      teacherId,
      amount,
      note: note ?? null,
      expenseDate: expense_date ?? null,
      studyYear: activeYear?.year ?? null,
    };
    if (category) createOpts.category = category;
    if (paymentMethod) createOpts.paymentMethod = paymentMethod;
    const expense = await TeacherExpenseModel.create(createOpts);
    res.status(201).json(ok(expense, 'تم إنشاء المصروف'));
  }

  static async list(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const query = req.query as unknown as {
      page?: number;
      limit?: number;
      from?: string;
      to?: string;
      studyYear?: string;
      category?: ExpenseCategory;
      paymentMethod?: ExpensePaymentMethod;
      search?: string;
      deleted?: boolean;
    };
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const filters: Parameters<typeof TeacherExpenseModel.list>[1] = { page, limit };
    if (query.from !== undefined)          filters.from = query.from;
    if (query.to !== undefined)            filters.to = query.to;
    if (query.studyYear !== undefined)     filters.studyYear = query.studyYear;
    if (query.category !== undefined)      filters.category = query.category;
    if (query.paymentMethod !== undefined) filters.paymentMethod = query.paymentMethod;
    if (query.search !== undefined)        filters.search = query.search;
    if (query.deleted !== undefined)       filters.deleted = query.deleted;

    const result = await TeacherExpenseModel.list(teacherId, filters);

    res.status(200).json(
      ok(result.data, 'تم جلب المصروفات', {
        pagination: buildPaginationMeta(result.total, page, limit),
        summary: result.summary,
      }),
    );
  }

  static async update(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const id = req.params['id'] as string;
    const { amount, note, expense_date, category, paymentMethod } = req.body as {
      amount?: number;
      note?: string | null;
      expense_date?: string | null;
      category?: ExpenseCategory;
      paymentMethod?: ExpensePaymentMethod;
    };

    const patch: Parameters<typeof TeacherExpenseModel.update>[2] = {};
    if (amount !== undefined)        patch.amount = amount;
    if (note !== undefined)          patch.note = note ?? null;
    if (expense_date !== undefined)  patch.expenseDate = expense_date ?? null;
    if (category !== undefined)      patch.category = category;
    if (paymentMethod !== undefined) patch.paymentMethod = paymentMethod;

    const updated = await TeacherExpenseModel.update(id, teacherId, patch);
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

  static async restore(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const id = req.params['id'] as string;
    const restored = await TeacherExpenseModel.restore(id, teacherId);
    if (!restored) {
      throw new ApiError(404, 'المصروف غير موجود أو غير محذوف', ErrorCodes.NOT_FOUND);
    }
    res.status(200).json(ok(restored, 'تم استرجاع المصروف'));
  }
}
