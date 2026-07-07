import pool from '../config/database';
import {
  Advertisement,
  AdvertisementStatus,
  AdvertisementVisibility,
} from '../types';

export type AdvertisementRow = {
  id: string;
  teacher_id: string;
  title: string;
  description: string;
  cover_image_url: string | null;
  visibility: AdvertisementVisibility;
  teacher_governorate: string | null;
  status: AdvertisementStatus;
  budget_total: string;
  budget_remaining: string;
  reserved_from_balance: string;
  reserved_from_pending: string;
  cost_per_click: string | null;
  unique_clicks: number;
  rejection_reason: string | null;
  admin_notes: string | null;
  start_date: Date | null;
  end_date: Date | null;
  submitted_at: Date | null;
  approved_at: Date | null;
  rejected_at: Date | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
  teacher_name?: string;
};

function mapRow(row: AdvertisementRow): Advertisement {
  const ad: Advertisement = {
    id: row.id,
    teacherId: row.teacher_id,
    title: row.title,
    description: row.description,
    coverImageUrl: row.cover_image_url,
    visibility: row.visibility,
    teacherGovernorate: row.teacher_governorate,
    status: row.status,
    budgetTotal: Number(row.budget_total),
    budgetRemaining: Number(row.budget_remaining),
    reservedFromBalance: Number(row.reserved_from_balance),
    reservedFromPending: Number(row.reserved_from_pending),
    costPerClick: row.cost_per_click != null ? Number(row.cost_per_click) : null,
    uniqueClicks: row.unique_clicks,
    rejectionReason: row.rejection_reason,
    adminNotes: row.admin_notes,
    startDate: row.start_date,
    endDate: row.end_date,
    submittedAt: row.submitted_at,
    approvedAt: row.approved_at,
    rejectedAt: row.rejected_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
  if (row.teacher_name) ad.teacherName = row.teacher_name;
  return ad;
}

const SELECT_COLS = `
  a.id, a.teacher_id, a.title, a.description, a.cover_image_url,
  a.visibility, a.teacher_governorate, a.status,
  a.budget_total, a.budget_remaining, a.reserved_from_balance, a.reserved_from_pending,
  a.cost_per_click, a.unique_clicks, a.rejection_reason, a.admin_notes,
  a.start_date, a.end_date, a.submitted_at, a.approved_at, a.rejected_at,
  a.created_at, a.updated_at, a.deleted_at
`;

export class AdvertisementModel {
  static mapRow = mapRow;

  static async create(input: {
    teacherId: string;
    title: string;
    description: string;
    coverImageUrl?: string | null;
    visibility: AdvertisementVisibility;
    budgetTotal: number;
  }): Promise<Advertisement> {
    const { rows } = await pool.query<AdvertisementRow>(
      `INSERT INTO advertisements (
         teacher_id, title, description, cover_image_url, visibility, budget_total
       ) VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${SELECT_COLS.replace(/a\./g, '')}`,
      [
        input.teacherId,
        input.title,
        input.description,
        input.coverImageUrl ?? null,
        input.visibility,
        input.budgetTotal,
      ],
    );
    return mapRow(rows[0]!);
  }

  static async findById(id: string, client?: { query: typeof pool.query }): Promise<Advertisement | null> {
    const db = client ?? pool;
    const { rows } = await db.query<AdvertisementRow>(
      `SELECT ${SELECT_COLS}, u.name AS teacher_name
         FROM advertisements a
         JOIN users u ON u.id = a.teacher_id
        WHERE a.id = $1 AND a.deleted_at IS NULL`,
      [id],
    );
    return rows[0] ? mapRow(rows[0]) : null;
  }

  static async findByIdForTeacher(
    id: string,
    teacherId: string,
    client?: { query: typeof pool.query },
  ): Promise<Advertisement | null> {
    const db = client ?? pool;
    const { rows } = await db.query<AdvertisementRow>(
      `SELECT ${SELECT_COLS}
         FROM advertisements a
        WHERE a.id = $1 AND a.teacher_id = $2 AND a.deleted_at IS NULL`,
      [id, teacherId],
    );
    return rows[0] ? mapRow(rows[0]) : null;
  }

  static async update(
    id: string,
    teacherId: string,
    patch: Partial<{
      title: string;
      description: string;
      coverImageUrl: string | null;
      visibility: AdvertisementVisibility;
      budgetTotal: number;
      teacherGovernorate: string | null;
      status: AdvertisementStatus;
      budgetRemaining: number;
      reservedFromBalance: number;
      reservedFromPending: number;
      costPerClick: number;
      rejectionReason: string | null;
      adminNotes: string | null;
      startDate: Date | null;
      endDate: Date | null;
      submittedAt: Date | null;
      approvedAt: Date | null;
      rejectedAt: Date | null;
      uniqueClicks: number;
    }>,
    client?: { query: typeof pool.query },
  ): Promise<Advertisement | null> {
    const sets: string[] = [];
    const params: unknown[] = [];
    let p = 1;

    const add = (col: string, val: unknown) => {
      sets.push(`${col} = $${p++}`);
      params.push(val);
    };

    if (patch.title !== undefined) add('title', patch.title);
    if (patch.description !== undefined) add('description', patch.description);
    if (patch.coverImageUrl !== undefined) add('cover_image_url', patch.coverImageUrl);
    if (patch.visibility !== undefined) add('visibility', patch.visibility);
    if (patch.budgetTotal !== undefined) add('budget_total', patch.budgetTotal);
    if (patch.teacherGovernorate !== undefined) add('teacher_governorate', patch.teacherGovernorate);
    if (patch.status !== undefined) add('status', patch.status);
    if (patch.budgetRemaining !== undefined) add('budget_remaining', patch.budgetRemaining);
    if (patch.reservedFromBalance !== undefined) add('reserved_from_balance', patch.reservedFromBalance);
    if (patch.reservedFromPending !== undefined) add('reserved_from_pending', patch.reservedFromPending);
    if (patch.costPerClick !== undefined) add('cost_per_click', patch.costPerClick);
    if (patch.rejectionReason !== undefined) add('rejection_reason', patch.rejectionReason);
    if (patch.adminNotes !== undefined) add('admin_notes', patch.adminNotes);
    if (patch.startDate !== undefined) add('start_date', patch.startDate);
    if (patch.endDate !== undefined) add('end_date', patch.endDate);
    if (patch.submittedAt !== undefined) add('submitted_at', patch.submittedAt);
    if (patch.approvedAt !== undefined) add('approved_at', patch.approvedAt);
    if (patch.rejectedAt !== undefined) add('rejected_at', patch.rejectedAt);
    if (patch.uniqueClicks !== undefined) add('unique_clicks', patch.uniqueClicks);

    if (sets.length === 0) return this.findByIdForTeacher(id, teacherId, client);

    params.push(id, teacherId);
    const db = client ?? pool;
    const { rows } = await db.query<AdvertisementRow>(
      `UPDATE advertisements SET ${sets.join(', ')}
        WHERE id = $${p++} AND teacher_id = $${p++} AND deleted_at IS NULL
        RETURNING ${SELECT_COLS.replace(/a\./g, '')}`,
      params,
    );
    return rows[0] ? mapRow(rows[0]) : null;
  }

  static async adminUpdate(
    id: string,
    patch: Parameters<typeof AdvertisementModel.update>[2],
    client?: { query: typeof pool.query },
  ): Promise<Advertisement | null> {
    const sets: string[] = [];
    const params: unknown[] = [];
    let p = 1;
    const add = (col: string, val: unknown) => {
      sets.push(`${col} = $${p++}`);
      params.push(val);
    };
    const fields = patch as Record<string, unknown>;
    const mapping: Record<string, string> = {
      title: 'title',
      description: 'description',
      coverImageUrl: 'cover_image_url',
      visibility: 'visibility',
      budgetTotal: 'budget_total',
      teacherGovernorate: 'teacher_governorate',
      status: 'status',
      budgetRemaining: 'budget_remaining',
      reservedFromBalance: 'reserved_from_balance',
      reservedFromPending: 'reserved_from_pending',
      costPerClick: 'cost_per_click',
      rejectionReason: 'rejection_reason',
      adminNotes: 'admin_notes',
      startDate: 'start_date',
      endDate: 'end_date',
      submittedAt: 'submitted_at',
      approvedAt: 'approved_at',
      rejectedAt: 'rejected_at',
      uniqueClicks: 'unique_clicks',
    };
    for (const [k, col] of Object.entries(mapping)) {
      if (fields[k] !== undefined) add(col, fields[k]);
    }
    if (sets.length === 0) return this.findById(id, client);
    params.push(id);
    const db = client ?? pool;
    const { rows } = await db.query<AdvertisementRow>(
      `UPDATE advertisements SET ${sets.join(', ')}
        WHERE id = $${p++} AND deleted_at IS NULL
        RETURNING ${SELECT_COLS.replace(/a\./g, '')}`,
      params,
    );
    return rows[0] ? mapRow(rows[0]) : null;
  }

  static async softDelete(id: string, teacherId: string): Promise<boolean> {
    const { rowCount } = await pool.query(
      `UPDATE advertisements SET deleted_at = now()
        WHERE id = $1 AND teacher_id = $2 AND deleted_at IS NULL`,
      [id, teacherId],
    );
    return (rowCount ?? 0) > 0;
  }

  static async adminSoftDelete(id: string): Promise<boolean> {
    const { rowCount } = await pool.query(
      `UPDATE advertisements SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    return (rowCount ?? 0) > 0;
  }

  static async listForTeacher(args: {
    teacherId: string;
    status?: AdvertisementStatus;
    limit: number;
    offset: number;
  }): Promise<Advertisement[]> {
    const conds = ['a.teacher_id = $1', 'a.deleted_at IS NULL'];
    const params: unknown[] = [args.teacherId];
    let p = 2;
    if (args.status) {
      conds.push(`a.status = $${p++}`);
      params.push(args.status);
    }
    params.push(args.limit, args.offset);
    const { rows } = await pool.query<AdvertisementRow>(
      `SELECT ${SELECT_COLS}
         FROM advertisements a
        WHERE ${conds.join(' AND ')}
        ORDER BY a.created_at DESC
        LIMIT $${p++} OFFSET $${p++}`,
      params,
    );
    return rows.map(mapRow);
  }

  static async countForTeacher(teacherId: string, status?: AdvertisementStatus): Promise<number> {
    const params: unknown[] = [teacherId];
    const statusClause = status ? `AND status = $2` : '';
    if (status) params.push(status);
    const { rows } = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM advertisements
        WHERE teacher_id = $1 AND deleted_at IS NULL ${statusClause}`,
      params,
    );
    return Number(rows[0]?.count ?? 0);
  }

  static async listForAdmin(args: {
    status?: AdvertisementStatus;
    teacherId?: string;
    limit: number;
    offset: number;
  }): Promise<Advertisement[]> {
    const conds = ['a.deleted_at IS NULL'];
    const params: unknown[] = [];
    let p = 1;
    if (args.status) {
      conds.push(`a.status = $${p++}`);
      params.push(args.status);
    }
    if (args.teacherId) {
      conds.push(`a.teacher_id = $${p++}`);
      params.push(args.teacherId);
    }
    params.push(args.limit, args.offset);
    const { rows } = await pool.query<AdvertisementRow>(
      `SELECT ${SELECT_COLS}, u.name AS teacher_name
         FROM advertisements a
         JOIN users u ON u.id = a.teacher_id
        WHERE ${conds.join(' AND ')}
        ORDER BY a.created_at DESC
        LIMIT $${p++} OFFSET $${p++}`,
      params,
    );
    return rows.map(mapRow);
  }

  static async countForAdmin(status?: AdvertisementStatus, teacherId?: string): Promise<number> {
    const conds = ['deleted_at IS NULL'];
    const params: unknown[] = [];
    let p = 1;
    if (status) {
      conds.push(`status = $${p++}`);
      params.push(status);
    }
    if (teacherId) {
      conds.push(`teacher_id = $${p++}`);
      params.push(teacherId);
    }
    const { rows } = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM advertisements WHERE ${conds.join(' AND ')}`,
      params,
    );
    return Number(rows[0]?.count ?? 0);
  }

  static async countActiveForTeacher(teacherId: string): Promise<number> {
    const { rows } = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM advertisements
        WHERE teacher_id = $1 AND deleted_at IS NULL
          AND status IN ('pending_review', 'approved', 'running')`,
      [teacherId],
    );
    return Number(rows[0]?.count ?? 0);
  }

  static async findDueToStart(client: { query: typeof pool.query }): Promise<Advertisement[]> {
    const { rows } = await client.query<AdvertisementRow>(
      `SELECT ${SELECT_COLS.replace(/a\./g, '')}
         FROM advertisements
        WHERE deleted_at IS NULL AND status = 'approved'
          AND (start_date IS NULL OR start_date <= now())`,
    );
    return rows.map(mapRow);
  }

  static async findDueToFinish(client: { query: typeof pool.query }): Promise<Advertisement[]> {
    const { rows } = await client.query<AdvertisementRow>(
      `SELECT ${SELECT_COLS.replace(/a\./g, '')}
         FROM advertisements
        WHERE deleted_at IS NULL AND status = 'running'
          AND end_date IS NOT NULL AND end_date <= now()`,
    );
    return rows.map(mapRow);
  }
}
