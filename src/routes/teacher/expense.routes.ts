import { Router } from 'express';

import { TeacherExpenseController } from '../../controllers/teacher/expense.controller';
import { validate } from '../../middleware/validate.middleware';
import { asyncHandler } from '../../utils/async-handler';
import { idParamSchema } from '../../schemas/common.schemas';
import {
  expenseCreateSchema,
  expenseListQuerySchema,
  expenseUpdateSchema,
} from '../../schemas/teacher.schemas';

const router = Router();

router.post(
  '/',
  validate({ body: expenseCreateSchema }),
  asyncHandler(TeacherExpenseController.create)
);

router.get(
  '/',
  validate({ query: expenseListQuerySchema }),
  asyncHandler(TeacherExpenseController.list)
);

router.patch(
  '/:id',
  validate({ params: idParamSchema, body: expenseUpdateSchema }),
  asyncHandler(TeacherExpenseController.update)
);

router.delete(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(TeacherExpenseController.remove)
);

export default router;
