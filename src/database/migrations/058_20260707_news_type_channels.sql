-- Migration: document expanded news_type channel values
-- Created: 2026-07-07
-- Description: Super-admin can target web, student mobile, teacher mobile, or combos.

BEGIN;

COMMENT ON COLUMN news.news_type IS
  'Platform targeting: web | mobile | web_and_mobile | teacher_mobile | web_and_teacher_mobile | all_platforms';

COMMIT;
