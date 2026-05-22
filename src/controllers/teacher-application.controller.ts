// Public controller for /api/teacher-applications/* — Phases 1 + 3.
//
// Phase 1: POST /             (submit application)
// Phase 3: POST /:id/files    (upload one file, gated by upload-token)
//
// Reads + actions live on the super-admin controller.

import type { Request, Response } from 'express';

import { TeacherApplicationFileService } from '../services/teacher-application-file.service';
import { TeacherApplicationService } from '../services/teacher-application.service';
import type { TeacherApplicationCreateInput } from '../schemas/teacher-application.schemas';
import {
  TeacherApplicationFileKind,
  type TeacherApplicationFileKind as TFileKind,
} from '../types';
import { ApiError, ErrorCodes } from '../utils/api-error';
import { ok } from '../utils/response.util';

const VALID_KINDS = new Set<TFileKind>([
  TeacherApplicationFileKind.PROFILE_IMAGE,
  TeacherApplicationFileKind.CERTIFICATE_IMAGE,
  TeacherApplicationFileKind.NATIONAL_ID_IMAGE,
  TeacherApplicationFileKind.OPTIONAL_ATTACHMENT,
  TeacherApplicationFileKind.INTRO_VIDEO,
]);

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

  // POST /api/teacher-applications/:id/files
  // Public — gated by the upload-token middleware (anti-spam) AND
  // applicationId in the URL must match the `aid` claim in the token.
  // Multer (memoryStorage) populated `req.file`; the multipart body has
  // exactly one `kind` field and exactly one `file` part.
  static async uploadFile(req: Request, res: Response): Promise<void> {
    const applicationId = req.params['id'] as string;

    const file = (req as unknown as { file?: Express.Multer.File }).file;
    if (!file) {
      throw new ApiError(
        400,
        'لم يتم إرفاق ملف',
        ErrorCodes.VALIDATION_ERROR,
        { fields: [{ field: 'file', message: 'file is required', code: 'missing_file' }] }
      );
    }

    const kindRaw = (req.body?.kind as string | undefined)?.trim();
    if (!kindRaw || !VALID_KINDS.has(kindRaw as TFileKind)) {
      throw new ApiError(
        400,
        'نوع الملف غير صحيح',
        ErrorCodes.VALIDATION_ERROR,
        {
          fields: [
            {
              field: 'kind',
              message: 'kind must be one of: profile_image, certificate_image, national_id_image, optional_attachment, intro_video',
              code: 'invalid_kind',
            },
          ],
        }
      );
    }

    const ingested = await TeacherApplicationFileService.ingest({
      applicationId,
      kind: kindRaw as TFileKind,
      declaredMime: file.mimetype,
      originalFilename: file.originalname,
      bytes: file.buffer,
    });

    res.status(201).json(ok(ingested, 'تم رفع الملف بنجاح'));
  }
}
