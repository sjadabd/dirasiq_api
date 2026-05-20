// One-shot backfill: replace SVG news images with a safe raster placeholder.
//
// Context: an earlier seed dropped three SVG files under public/uploads/news/.
// SVG cannot be rendered by Flutter's `Image.network` on Android (the platform
// `ImageDecoder` returns "unimplemented"), so the student-app news carousel
// fell back to its gradient placeholder. Since 2026-05-19 the upload pipeline
// rejects SVG at both the Zod and the controller layer — this script is the
// data-side counterpart that fixes the legacy rows.
//
// Strategy:
//   1. Pick a stable raster placeholder already on disk
//      (`news_1759516541167_o0xpp1.png`, 870 KB, real image from an earlier
//      seed) and copy it to a deterministic filename so the rewrite is
//      idempotent.
//   2. UPDATE every news row whose `image_url` ends with `.svg` OR is a
//      `data:image/svg` URI to point at the placeholder.
//   3. Delete the orphaned SVG files from disk.
//
// Safe to re-run: idempotent on both the filesystem (copy is no-op if the
// placeholder exists) and the DB (rows already pointing at the placeholder
// won't match the SVG filter).
//
// Run with: npx ts-node src/scripts/backfill_news_svg_to_png.ts

import fs from 'fs';
import path from 'path';

import pool from '../config/database';
import { logger } from '../utils/logger';

const UPLOAD_DIR = path.resolve(process.cwd(), 'public', 'uploads', 'news');
const SOURCE_FILE = 'news_1759516541167_o0xpp1.png';
const PLACEHOLDER_FILE = 'placeholder_news.png';
const PLACEHOLDER_URL = `/uploads/news/${PLACEHOLDER_FILE}`;

async function ensurePlaceholderOnDisk(): Promise<void> {
  const sourcePath = path.join(UPLOAD_DIR, SOURCE_FILE);
  const destPath = path.join(UPLOAD_DIR, PLACEHOLDER_FILE);
  if (fs.existsSync(destPath)) {
    logger.info({ destPath }, 'placeholder already present on disk');
    return;
  }
  if (!fs.existsSync(sourcePath)) {
    throw new Error(
      `Source placeholder missing: ${sourcePath}. Provide a raster PNG/JPG/WEBP at this path before re-running.`
    );
  }
  await fs.promises.copyFile(sourcePath, destPath);
  logger.info({ sourcePath, destPath }, 'placeholder created');
}

async function rewriteSvgRows(): Promise<{ rows: number; updated: Array<{ id: string; before: string }> }> {
  const select = await pool.query<{ id: string; image_url: string }>(
    `SELECT id, image_url
       FROM news
      WHERE image_url IS NOT NULL
        AND (image_url ILIKE '%.svg'
             OR image_url ILIKE 'data:image/svg%')`
  );
  if (select.rowCount === 0) {
    return { rows: 0, updated: [] };
  }
  const update = await pool.query<{ id: string; image_url: string }>(
    `UPDATE news
        SET image_url = $1,
            updated_at = now()
      WHERE image_url IS NOT NULL
        AND (image_url ILIKE '%.svg'
             OR image_url ILIKE 'data:image/svg%')
    RETURNING id, image_url`,
    [PLACEHOLDER_URL]
  );
  return {
    rows: update.rowCount ?? 0,
    updated: select.rows.map((r) => ({ id: r.id, before: r.image_url })),
  };
}

async function deleteOrphanSvgFiles(): Promise<string[]> {
  const removed: string[] = [];
  if (!fs.existsSync(UPLOAD_DIR)) return removed;
  for (const file of await fs.promises.readdir(UPLOAD_DIR)) {
    if (!file.toLowerCase().endsWith('.svg')) continue;
    const full = path.join(UPLOAD_DIR, file);
    try {
      await fs.promises.unlink(full);
      removed.push(file);
    } catch (err) {
      logger.warn({ err, file }, 'failed to delete orphan svg');
    }
  }
  return removed;
}

async function main(): Promise<void> {
  logger.info('news SVG → PNG backfill starting');
  await ensurePlaceholderOnDisk();
  const { rows, updated } = await rewriteSvgRows();
  const removedFiles = await deleteOrphanSvgFiles();
  logger.info(
    { rowsRewritten: rows, before: updated, filesDeleted: removedFiles, placeholder: PLACEHOLDER_URL },
    'news SVG → PNG backfill complete'
  );
}

main()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async (err) => {
    logger.error({ err }, 'news SVG → PNG backfill failed');
    try {
      await pool.end();
    } catch {
      /* ignore */
    }
    process.exit(1);
  });
