import { Request, Response } from 'express';
import { AcademicYearModel } from '../../models/academic-year.model';
import { TeacherExpenseModel } from '../../models/teacher-expense.model';

export class TeacherExpenseController {
  static async create(req: Request, res: Response): Promise<void> {
    try {
      const me = req.user;
      if (!me) { res.status(401).json({ success: false, message: 'غير مصادق' }); return; }
      const { amount, note, expense_date } = req.body || {};
      const num = Number(amount);
      if (!Number.isFinite(num) || num < 0) { res.status(400).json({ success: false, message: 'قيمة المبلغ غير صالحة' }); return; }
      const activeYear = await AcademicYearModel.getActive();
      const exp = await TeacherExpenseModel.create({ teacherId: String(me.id), amount: num, note: note ?? null, expenseDate: expense_date || null, studyYear: activeYear?.year ?? null });
      res.status(201).json({ success: true, data: exp });
    } catch (error) {
      console.error('Error create expense:', error);
      res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم' });
    }
  }

  static async list(req: Request, res: Response): Promise<void> {
    try {
      const me = req.user;
      if (!me) { res.status(401).json({ success: false, message: 'غير مصادق' }); return; }
      const page = parseInt(String((req.query as any).page ?? '1'), 10);
      const limit = parseInt(String((req.query as any).limit ?? '20'), 10);
      const from = (req.query as any).from ? String((req.query as any).from) : undefined;
      const to = (req.query as any).to ? String((req.query as any).to) : undefined;
      const studyYear = (req.query as any).studyYear ? String((req.query as any).studyYear) : undefined;
      const result = await TeacherExpenseModel.list(String(me.id), page, limit, from, to, studyYear);
      res.status(200).json({ success: true, data: result.data, pagination: { page, limit, total: result.total }, summary: result.summary });
    } catch (error) {
      console.error('Error list expenses:', error);
      res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم' });
    }
  }

  static async remove(req: Request, res: Response): Promise<void> {
    try {
      const me = req.user;
      if (!me) { res.status(401).json({ success: false, message: 'غير مصادق' }); return; }
      const id = String(req.params['id']);
      const ok = await TeacherExpenseModel.softDelete(id, String(me.id));
      if (!ok) { res.status(404).json({ success: false, message: 'غير موجود' }); return; }
      res.status(200).json({ success: true, message: 'تم الحذف' });
    } catch (error) {
      console.error('Error delete expense:', error);
      res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم' });
    }
  }

  static async update(req: Request, res: Response): Promise<void> {
    try {
      const me = req.user;
      if (!me) { res.status(401).json({ success: false, message: 'غير مصادق' }); return; }
      const id = String(req.params['id']);
      const { amount, note, expense_date } = req.body || {};
      let numericAmount: number | undefined = undefined;
      if (amount !== undefined) {
        numericAmount = Number(amount);
        if (!Number.isFinite(numericAmount) || numericAmount < 0) {
          res.status(400).json({ success: false, message: 'قيمة المبلغ غير صالحة' });
          return;
        }
      }
      const patch = {
        ...(numericAmount !== undefined ? { amount: numericAmount } : {}),
        ...(note !== undefined ? { note: note ?? null } : {}),
        ...(expense_date !== undefined ? { expenseDate: expense_date ?? null } : {}),
      };
      const updated = await TeacherExpenseModel.update(id, String(me.id), patch);
      if (!updated) { res.status(404).json({ success: false, message: 'غير موجود' }); return; }
      res.status(200).json({ success: true, data: updated });
    } catch (error) {
      console.error('Error update expense:', error);
      res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم' });
    }
  }
}
