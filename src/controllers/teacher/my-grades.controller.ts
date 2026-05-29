// Teacher self-service grade management.
//
// PUT /api/teacher/my-grades is a replace-set sync: the body carries the
// full desired grade-id set for the teacher (req.user.id) scoped to the
// currently-active academic year, and the controller delegates to the
// service which:
//   1. Verifies every grade-id is active.
//   2. Looks up the active academic year.
//   3. In one tx: soft-deletes rows that fell out of the set, upserts
//      rows that joined the set (clearing deleted_at on revivals).
//   4. Returns the resulting list so the client can hydrate without a
//      second fetch.
//
// Ownership is enforced at the SQL layer (every WHERE includes
// teacher_id = $1 against the JWT subject). The route gate already
// guarantees req.user.userType === 'teacher'.
//
// GET /api/teacher/my-grades returns the same shape so the profile screen
// can preselect its FilterChips on open.

import type { Request, Response } from 'express';

import { TeacherMyGradesService } from '../../services/teacher/my-grades.service';
import type { TeacherSyncMyGradesInput } from '../../schemas/teacher.schemas';
import { ApiError, ErrorCodes } from '../../utils/api-error';
import { ok } from '../../utils/response.util';

export class TeacherMyGradesController {
  // GET /api/teacher/my-grades
  static async list(req: Request, res: Response): Promise<void> {
    const teacherId = req.user?.id;
    if (!teacherId) {
      throw new ApiError(401, 'مصادقة مطلوبة', ErrorCodes.UNAUTHORIZED);
    }
    const result = await TeacherMyGradesService.listForActiveYear(teacherId);
    res.status(200).json(ok(result, 'صفوفك للسنة الدراسية الفعّالة'));
  }

  // PUT /api/teacher/my-grades
  static async sync(req: Request, res: Response): Promise<void> {
    const teacherId = req.user?.id;
    if (!teacherId) {
      throw new ApiError(401, 'مصادقة مطلوبة', ErrorCodes.UNAUTHORIZED);
    }
    const { gradeIds } = req.body as TeacherSyncMyGradesInput;
    const result = await TeacherMyGradesService.syncForActiveYear(
      teacherId,
      gradeIds
    );
    res.status(200).json(ok(result, 'تم تحديث المراحل الدراسية بنجاح'));
  }
}
