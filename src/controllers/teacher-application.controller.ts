// Public controller for /api/teacher-applications/* — Phase 1.
//
// The only endpoint in this phase is `POST /` (submit a new application).
// Reads + actions live on the super-admin controller.

import type { Request, Response } from 'express';

import { TeacherApplicationService } from '../services/teacher-application.service';
import type { TeacherApplicationCreateInput } from '../schemas/teacher-application.schemas';
import { ok } from '../utils/response.util';

export class TeacherApplicationController {
  // POST /api/teacher-applications
  // Public. Rate-limited at the route layer.
  static async create(req: Request, res: Response): Promise<void> {
    const input = req.body as TeacherApplicationCreateInput;
    const result = await TeacherApplicationService.create(input);

    res.status(201).json(
      ok(
        result,
        'تم استلام طلبك بنجاح. سيتم مراجعته من قبل الإدارة وسنتواصل معك قريباً.'
      )
    );
  }
}
