// Internal endpoints — consumed by the chat service (and future internal
// services), NOT by end-user clients. Header-gated by `X-Internal-Secret`.
//
// Mounted at `/api/internal` from `src/index.ts`. The gate is applied at
// router level so every endpoint inherits it.

import { Router } from 'express';
import { z } from 'zod';

import pool from '../config/database';
import { requireInternalSecret } from '../middleware/internal-secret.middleware';
import { validate } from '../middleware/validate.middleware';
import { uuidSchema } from '../schemas/common.schemas';
import { ApiError, ErrorCodes } from '../utils/api-error';
import { asyncHandler } from '../utils/async-handler';
import { ok } from '../utils/response.util';

const router = Router();

router.use(requireInternalSecret);

// GET /api/internal/users/:id/profile
//
// Returns the minimal user shape the chat service needs to cache locally:
// id, name, profile_image_path, user_type, and the most-recent OneSignal
// player id (used for push fan-out in chat Phase 5). Soft-deleted users are
// surfaced as 404 so the chat side can tombstone its cache entry.
router.get(
  '/users/:id/profile',
  validate({ params: z.object({ id: uuidSchema }) }),
  asyncHandler(async (req, res) => {
    const { id } = req.params as { id: string };

    const userR = await pool.query<{
      id: string;
      name: string;
      user_type: 'super_admin' | 'teacher' | 'student';
      profile_image_path: string | null;
      deleted_at: Date | null;
      status: string;
    }>(
      `SELECT id, name, user_type, profile_image_path, deleted_at, status
         FROM users
        WHERE id = $1
        LIMIT 1`,
      [id]
    );

    const user = userR.rows[0];
    if (!user || user.deleted_at) {
      throw new ApiError(404, 'User not found', ErrorCodes.NOT_FOUND);
    }
    if (user.status !== 'active') {
      throw new ApiError(404, 'User not active', ErrorCodes.NOT_FOUND);
    }

    // Latest device's OneSignal player id (any session). Optional.
    const playerR = await pool.query<{ onesignal_player_id: string }>(
      `SELECT onesignal_player_id
         FROM tokens
        WHERE user_id = $1 AND onesignal_player_id IS NOT NULL
        ORDER BY created_at DESC
        LIMIT 1`,
      [id]
    );
    const oneSignalPlayerId = playerR.rows[0]?.onesignal_player_id ?? null;

    res.status(200).json(
      ok(
        {
          id: user.id,
          name: user.name,
          profileImagePath: user.profile_image_path,
          userType: user.user_type,
          oneSignalPlayerId,
        },
        'user profile'
      )
    );
  })
);

export default router;
