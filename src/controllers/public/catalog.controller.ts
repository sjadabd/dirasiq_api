// Public reference-data endpoints used by pre-auth screens (the Flutter
// teacher-application form). No DB hit — the lists are static.

import type { Request, Response } from 'express';

import {
  TEACHER_APPLICATION_SUBJECTS,
  TEACHER_APPLICATION_TEACHING_STAGES,
} from '../../data/teacher-application-catalog';
import { ok } from '../../utils/response.util';

export class PublicCatalogController {
  // GET /api/public/subjects
  static async subjects(_req: Request, res: Response): Promise<void> {
    res.status(200).json(ok([...TEACHER_APPLICATION_SUBJECTS], 'قائمة المواد'));
  }

  // GET /api/public/teaching-stages
  static async teachingStages(_req: Request, res: Response): Promise<void> {
    res
      .status(200)
      .json(ok([...TEACHER_APPLICATION_TEACHING_STAGES], 'قائمة المراحل التعليمية'));
  }
}
