import pool from '../config/database';
import type { ContentFeedItem } from '../types';
import { STUDENT_MOBILE_VISIBLE_NEWS_TYPES } from '../utils/news-targeting.util';
import { TeacherVisibility } from '../utils/teacher-visibility.util';

type FeedRow = {
  id: string;
  item_type: 'news' | 'advertisement';
  title: string;
  description: string | null;
  cover_image_url: string | null;
  publisher_name: string;
  badge: 'news' | 'ad';
  published_at: Date;
  governorate: string | null;
};

export class ContentFeedService {
  static async listForStudent(args: {
    studentId: string;
    studentState: string | null;
    limit: number;
    offset: number;
  }): Promise<{ items: ContentFeedItem[]; total: number }> {
    const studentState = args.studentState?.trim() ?? null;
    const studentNewsTypes = [...STUDENT_MOBILE_VISIBLE_NEWS_TYPES];

    const adHide = await TeacherVisibility.sqlHideUnlessAllowed({
      teacherIdExpr: 'a.teacher_id',
      viewerStudentId: args.studentId,
      nextParam: 5,
    });
    const countHide = await TeacherVisibility.sqlHideUnlessAllowed({
      teacherIdExpr: 'a.teacher_id',
      viewerStudentId: args.studentId,
      nextParam: 3,
    });

    const countSql = `
      SELECT COUNT(*)::int AS count FROM (
        SELECT n.id FROM news n
         WHERE n.deleted_at IS NULL AND n.is_active = TRUE
           AND n.news_type = ANY($2::text[])
        UNION ALL
        SELECT a.id FROM advertisements a
         WHERE a.deleted_at IS NULL AND a.status = 'running'
           AND (a.start_date IS NULL OR a.start_date <= now())
           AND (a.end_date IS NULL OR a.end_date > now())
           AND (
             a.visibility = 'public'
             OR (
               a.visibility = 'governorate_only'
               AND $1::text IS NOT NULL
               AND lower(a.teacher_governorate) = lower($1::text)
             )
           )
           ${countHide.clause}
      ) feed`;

    const dataSql = `
      SELECT * FROM (
        SELECT
          n.id,
          'news'::text AS item_type,
          n.title,
          n.details AS description,
          n.image_url AS cover_image_url,
          'MulhimIQ'::text AS publisher_name,
          'news'::text AS badge,
          COALESCE(n.published_at, n.created_at) AS published_at,
          NULL::text AS governorate
        FROM news n
        WHERE n.deleted_at IS NULL AND n.is_active = TRUE
          AND n.news_type = ANY($2::text[])
        UNION ALL
        SELECT
          a.id,
          'advertisement'::text AS item_type,
          a.title,
          a.description,
          a.cover_image_url,
          u.name AS publisher_name,
          'ad'::text AS badge,
          COALESCE(a.start_date, a.approved_at, a.created_at) AS published_at,
          a.teacher_governorate AS governorate
        FROM advertisements a
        JOIN users u ON u.id = a.teacher_id
        WHERE a.deleted_at IS NULL AND a.status = 'running'
          AND (a.start_date IS NULL OR a.start_date <= now())
          AND (a.end_date IS NULL OR a.end_date > now())
          AND (
            a.visibility = 'public'
            OR (
              a.visibility = 'governorate_only'
              AND $1::text IS NOT NULL
              AND lower(a.teacher_governorate) = lower($1::text)
            )
          )
          ${adHide.clause}
      ) feed
      ORDER BY published_at DESC
      LIMIT $3 OFFSET $4`;

    const [countR, dataR] = await Promise.all([
      pool.query<{ count: number }>(countSql, [
        studentState,
        studentNewsTypes,
        ...countHide.params,
      ]),
      pool.query<FeedRow>(dataSql, [
        studentState,
        studentNewsTypes,
        args.limit,
        args.offset,
        ...adHide.params,
      ]),
    ]);

    const items: ContentFeedItem[] = dataR.rows.map((r) => {
      const item: ContentFeedItem = {
        id: r.id,
        itemType: r.item_type,
        title: r.title,
        coverImageUrl: r.cover_image_url,
        publisherName: r.publisher_name,
        badge: r.badge,
        publishedAt: r.published_at,
        governorate: r.governorate,
      };
      if (r.description) item.description = r.description;
      return item;
    });

    return { items, total: countR.rows[0]?.count ?? 0 };
  }

  static async getNewsDetail(id: string) {
    const studentNewsTypes = [...STUDENT_MOBILE_VISIBLE_NEWS_TYPES];
    const { rows } = await pool.query(
      `SELECT id, title, details AS description, image_url AS cover_image_url,
              COALESCE(published_at, created_at) AS published_at
         FROM news
        WHERE id = $1 AND deleted_at IS NULL AND is_active = TRUE
          AND news_type = ANY($2::text[])`,
      [id, studentNewsTypes],
    );
    return rows[0] ?? null;
  }
}
