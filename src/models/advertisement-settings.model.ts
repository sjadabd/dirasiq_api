import pool from '../config/database';
import type { AdvertisementSettings } from '../types';

type SettingsRow = {
  id: string;
  cost_per_click: string;
  min_budget: string;
  max_budget: string;
  max_duration_days: number;
  auto_end_duration_days: number;
  allow_public: boolean;
  allow_governorate: boolean;
  require_approval: boolean;
  max_active_per_teacher: number;
  image_size_limit_bytes: number;
  max_title_length: number;
  max_description_length: number;
  refund_unused_budget: boolean;
  updated_at: Date;
  updated_by: string | null;
};

function mapRow(row: SettingsRow): AdvertisementSettings {
  return {
    id: row.id,
    costPerClick: Number(row.cost_per_click),
    minBudget: Number(row.min_budget),
    maxBudget: Number(row.max_budget),
    maxDurationDays: row.max_duration_days,
    autoEndDurationDays: row.auto_end_duration_days,
    allowPublic: row.allow_public,
    allowGovernorate: row.allow_governorate,
    requireApproval: row.require_approval,
    maxActivePerTeacher: row.max_active_per_teacher,
    imageSizeLimitBytes: row.image_size_limit_bytes,
    maxTitleLength: row.max_title_length,
    maxDescriptionLength: row.max_description_length,
    refundUnusedBudget: row.refund_unused_budget,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

export class AdvertisementSettingsModel {
  static async get(): Promise<AdvertisementSettings> {
    const { rows } = await pool.query<SettingsRow>(
      `SELECT * FROM advertisement_settings ORDER BY updated_at DESC LIMIT 1`,
    );
    if (!rows[0]) {
      throw new Error('advertisement_settings row missing — run migrations');
    }
    return mapRow(rows[0]);
  }

  static async update(
    patch: Partial<{
      costPerClick: number;
      minBudget: number;
      maxBudget: number;
      maxDurationDays: number;
      autoEndDurationDays: number;
      allowPublic: boolean;
      allowGovernorate: boolean;
      requireApproval: boolean;
      maxActivePerTeacher: number;
      imageSizeLimitBytes: number;
      maxTitleLength: number;
      maxDescriptionLength: number;
      refundUnusedBudget: boolean;
      updatedBy: string | null;
    }>,
  ): Promise<AdvertisementSettings> {
    const current = await this.get();
    const mapping: Array<[keyof typeof patch, string]> = [
      ['costPerClick', 'cost_per_click'],
      ['minBudget', 'min_budget'],
      ['maxBudget', 'max_budget'],
      ['maxDurationDays', 'max_duration_days'],
      ['autoEndDurationDays', 'auto_end_duration_days'],
      ['allowPublic', 'allow_public'],
      ['allowGovernorate', 'allow_governorate'],
      ['requireApproval', 'require_approval'],
      ['maxActivePerTeacher', 'max_active_per_teacher'],
      ['imageSizeLimitBytes', 'image_size_limit_bytes'],
      ['maxTitleLength', 'max_title_length'],
      ['maxDescriptionLength', 'max_description_length'],
      ['refundUnusedBudget', 'refund_unused_budget'],
      ['updatedBy', 'updated_by'],
    ];
    const sets: string[] = [];
    const params: unknown[] = [];
    let p = 1;
    for (const [key, col] of mapping) {
      if (patch[key] !== undefined) {
        sets.push(`${col} = $${p++}`);
        params.push(patch[key]);
      }
    }
    if (sets.length === 0) return current;
    params.push(current.id);
    const { rows } = await pool.query<SettingsRow>(
      `UPDATE advertisement_settings SET ${sets.join(', ')}, updated_at = now()
        WHERE id = $${p}
        RETURNING *`,
      params,
    );
    return mapRow(rows[0]!);
  }
}
