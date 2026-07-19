import type { PoolClient } from 'pg';

import pool from '../config/database';
import { AdvertisementClickModel } from '../models/advertisement-click.model';
import { AdvertisementModel } from '../models/advertisement.model';
import { AdvertisementSettingsModel } from '../models/advertisement-settings.model';
import { AdvertisementWalletTransactionModel } from '../models/advertisement-wallet-transaction.model';
import { UserModel } from '../models/user.model';
import {
  Advertisement,
  AdvertisementStatus,
  AdvertisementVisibility,
  UserType,
} from '../types';
import { ApiError, ErrorCodes } from '../utils/api-error';
import { AdvertisementNotifyService } from './advertisement-notify.service';
import { AdvertisementWalletService } from './advertisement-wallet.service';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function computeRefundSplit(
  remaining: number,
  reservedFromBalance: number,
  reservedFromPending: number,
): { fromBalance: number; fromPending: number } {
  const totalReserved = round2(reservedFromBalance + reservedFromPending);
  if (totalReserved <= 0 || remaining <= 0) {
    return { fromBalance: 0, fromPending: 0 };
  }
  const ratio = remaining / totalReserved;
  const fromBalance = round2(reservedFromBalance * ratio);
  const fromPending = round2(remaining - fromBalance);
  return { fromBalance, fromPending };
}

export class AdvertisementService {
  static async getSettings() {
    return AdvertisementSettingsModel.get();
  }

  static async updateSettings(
    patch: Parameters<typeof AdvertisementSettingsModel.update>[0],
  ) {
    return AdvertisementSettingsModel.update(patch);
  }

  static async createDraft(
    teacherId: string,
    input: {
      title: string;
      description: string;
      coverImageUrl?: string | null;
      visibility: AdvertisementVisibility;
      budgetTotal: number;
    },
  ): Promise<Advertisement> {
    const settings = await AdvertisementSettingsModel.get();
    this.validateContent(input.title, input.description, settings);
    const budget = settings.freeClicksEnabled ? 0 : input.budgetTotal;
    this.validateBudget(budget, settings);
    this.validateVisibility(input.visibility, settings);

    if (input.visibility === AdvertisementVisibility.GOVERNORATE_ONLY) {
      const teacher = await UserModel.findById(teacherId);
      if (!teacher?.state?.trim()) {
        throw new ApiError(
          400,
          'يجب تحديد المحافظة في ملفك الشخصي لإنشاء إعلان محلي',
          ErrorCodes.BUSINESS_RULE,
        );
      }
    }

    return AdvertisementModel.create({
      teacherId,
      title: input.title.trim(),
      description: input.description.trim(),
      coverImageUrl: input.coverImageUrl ?? null,
      visibility: input.visibility,
      budgetTotal: round2(budget),
    });
  }

  static async updateDraft(
    teacherId: string,
    id: string,
    input: Partial<{
      title: string;
      description: string;
      coverImageUrl: string | null;
      visibility: AdvertisementVisibility;
      budgetTotal: number;
    }>,
  ): Promise<Advertisement> {
    const ad = await AdvertisementModel.findByIdForTeacher(id, teacherId);
    if (!ad) throw new ApiError(404, 'الإعلان غير موجود', ErrorCodes.NOT_FOUND);
    if (!['draft', 'pending_review'].includes(ad.status)) {
      throw new ApiError(400, 'لا يمكن تعديل الإعلان في حالته الحالية', ErrorCodes.BUSINESS_RULE);
    }

    const settings = await AdvertisementSettingsModel.get();
    if (input.title) this.validateTitle(input.title, settings);
    if (input.description) this.validateDescription(input.description, settings);
    // Never rewrite budget on pending_review: wallet funds may already be
    // reserved and must stay consistent with budget_remaining / reservations.
    const mayEditBudget = ad.status === AdvertisementStatus.DRAFT;
    if (mayEditBudget && input.budgetTotal !== undefined) {
      this.validateBudget(settings.freeClicksEnabled ? 0 : input.budgetTotal, settings);
    }
    if (input.visibility) this.validateVisibility(input.visibility, settings);

    const patch: Parameters<typeof AdvertisementModel.update>[2] = {};
    if (input.title !== undefined) patch.title = input.title.trim();
    if (input.description !== undefined) patch.description = input.description.trim();
    if (input.coverImageUrl !== undefined) patch.coverImageUrl = input.coverImageUrl;
    if (input.visibility !== undefined) patch.visibility = input.visibility;
    if (mayEditBudget && (input.budgetTotal !== undefined || settings.freeClicksEnabled)) {
      patch.budgetTotal = settings.freeClicksEnabled
        ? 0
        : round2(input.budgetTotal ?? ad.budgetTotal);
    }

    const updated = await AdvertisementModel.update(id, teacherId, patch);
    if (!updated) throw new ApiError(404, 'الإعلان غير موجود', ErrorCodes.NOT_FOUND);
    return updated;
  }

  static async deleteDraft(teacherId: string, id: string): Promise<void> {
    const ad = await AdvertisementModel.findByIdForTeacher(id, teacherId);
    if (!ad) throw new ApiError(404, 'الإعلان غير موجود', ErrorCodes.NOT_FOUND);
    if (!['draft', 'pending_review'].includes(ad.status)) {
      throw new ApiError(400, 'لا يمكن حذف الإعلان في حالته الحالية', ErrorCodes.BUSINESS_RULE);
    }
    if (ad.status === AdvertisementStatus.PENDING_REVIEW) {
      await this.refundFull(ad);
    }
    await AdvertisementModel.softDelete(id, teacherId);
  }

  static async submit(teacherId: string, id: string): Promise<Advertisement> {
    const ad = await AdvertisementModel.findByIdForTeacher(id, teacherId);
    if (!ad) throw new ApiError(404, 'الإعلان غير موجود', ErrorCodes.NOT_FOUND);
    if (ad.status !== AdvertisementStatus.DRAFT) {
      throw new ApiError(400, 'تم تقديم هذا الإعلان مسبقاً', ErrorCodes.BUSINESS_RULE);
    }

    const settings = await AdvertisementSettingsModel.get();
    const active = await AdvertisementModel.countActiveForTeacher(teacherId);
    if (active >= settings.maxActivePerTeacher) {
      throw new ApiError(
        400,
        `الحد الأقصى للإعلانات النشطة هو ${settings.maxActivePerTeacher}`,
        ErrorCodes.BUSINESS_RULE,
      );
    }

    const teacher = await UserModel.findById(teacherId);
    const governorate =
      ad.visibility === AdvertisementVisibility.GOVERNORATE_ONLY
        ? teacher?.state?.trim() ?? null
        : null;

    const freeClicks = settings.freeClicksEnabled;
    const budget = freeClicks ? 0 : round2(ad.budgetTotal);
    this.validateBudget(budget, settings);
    const now = new Date();
    const endDate = new Date(now.getTime() + settings.autoEndDurationDays * 86400000);

    const result = await AdvertisementWalletService.withTransaction(async (client) => {
      const reserve = freeClicks
        ? { fromBalance: 0, fromPending: 0 }
        : await AdvertisementWalletService.reserveBudget(client, {
            teacherId,
            amount: budget,
            advertisementId: id,
            budgetBefore: 0,
          });

      const nextStatus = settings.requireApproval
        ? AdvertisementStatus.PENDING_REVIEW
        : AdvertisementStatus.APPROVED;

      const { rows } = await client.query(
        `UPDATE advertisements SET
           status = $2,
           budget_total = $3,
           budget_remaining = $3,
           reserved_from_balance = $4,
           reserved_from_pending = $5,
           teacher_governorate = $6,
           cost_per_click = $7,
           submitted_at = now(),
           start_date = CASE WHEN $8::boolean THEN now() ELSE start_date END,
           end_date = $9,
           approved_at = CASE WHEN $8::boolean THEN now() ELSE NULL END
         WHERE id = $1 AND teacher_id = $10 AND status = 'draft' AND deleted_at IS NULL
         RETURNING id`,
        [
          id,
          nextStatus,
          budget,
          reserve.fromBalance,
          reserve.fromPending,
          governorate,
          freeClicks ? 0 : settings.costPerClick,
          !settings.requireApproval,
          endDate,
          teacherId,
        ],
      );
      if (!rows[0]) {
        throw new ApiError(409, 'تعذر تقديم الإعلان', ErrorCodes.CONFLICT);
      }
      return nextStatus;
    });

    const updated = await AdvertisementModel.findByIdForTeacher(id, teacherId);
    if (!updated) throw new ApiError(500, 'خطأ داخلي', ErrorCodes.INTERNAL_ERROR);

    void AdvertisementNotifyService.onSubmitted(updated, teacher?.name ?? '');
    void AdvertisementNotifyService.emitStatusChanged(updated);
    if (result === AdvertisementStatus.APPROVED) {
      await this.promoteApprovedToRunning(id);
    }
    return (await AdvertisementModel.findByIdForTeacher(id, teacherId))!;
  }

  static async approve(
    _adminId: string,
    id: string,
    input?: { adminNotes?: string | null; startDate?: Date; endDate?: Date },
  ): Promise<Advertisement> {
    const ad = await AdvertisementModel.findById(id);
    if (!ad) throw new ApiError(404, 'الإعلان غير موجود', ErrorCodes.NOT_FOUND);
    if (ad.status !== AdvertisementStatus.PENDING_REVIEW) {
      throw new ApiError(400, 'لا يمكن الموافقة على الإعلان في حالته الحالية', ErrorCodes.BUSINESS_RULE);
    }

    const settings = await AdvertisementSettingsModel.get();
    const now = new Date();
    const startDate = input?.startDate ?? now;
    const endDate =
      input?.endDate ??
      new Date(startDate.getTime() + settings.autoEndDurationDays * 86400000);

    const approvePatch: Parameters<typeof AdvertisementModel.adminUpdate>[1] = {
      status: AdvertisementStatus.APPROVED,
      // Pricing is snapshotted at submit time; changing global settings must
      // not strand a reserved budget or turn an existing free ad into paid.
      costPerClick: ad.costPerClick ?? (settings.freeClicksEnabled ? 0 : settings.costPerClick),
      startDate,
      endDate,
      approvedAt: now,
    };
    if (input?.adminNotes !== undefined) approvePatch.adminNotes = input.adminNotes;
    await AdvertisementModel.adminUpdate(id, approvePatch);

    await this.promoteApprovedToRunning(id);
    const updated = await AdvertisementModel.findById(id);
    if (updated) {
      void AdvertisementNotifyService.onApproved(updated);
      void AdvertisementNotifyService.emitStatusChanged(updated);
    }
    return updated!;
  }

  static async reject(_adminId: string, id: string, reason: string): Promise<Advertisement> {
    const ad = await AdvertisementModel.findById(id);
    if (!ad) throw new ApiError(404, 'الإعلان غير موجود', ErrorCodes.NOT_FOUND);
    if (ad.status !== AdvertisementStatus.PENDING_REVIEW) {
      throw new ApiError(400, 'لا يمكن رفض الإعلان في حالته الحالية', ErrorCodes.BUSINESS_RULE);
    }

    await this.refundFull(ad);
    await AdvertisementModel.adminUpdate(id, {
      status: AdvertisementStatus.REJECTED,
      rejectionReason: reason,
      rejectedAt: new Date(),
      budgetRemaining: 0,
    });

    const updated = await AdvertisementModel.findById(id);
    if (updated) {
      void AdvertisementNotifyService.onRejected(updated, reason);
      void AdvertisementNotifyService.emitStatusChanged(updated);
    }
    return updated!;
  }

  static async cancelByTeacher(teacherId: string, id: string): Promise<Advertisement> {
    const ad = await AdvertisementModel.findByIdForTeacher(id, teacherId);
    if (!ad) throw new ApiError(404, 'الإعلان غير موجود', ErrorCodes.NOT_FOUND);

    if (![AdvertisementStatus.APPROVED, AdvertisementStatus.RUNNING].includes(ad.status)) {
      throw new ApiError(400, 'لا يمكن إيقاف الإعلان في حالته الحالية', ErrorCodes.BUSINESS_RULE);
    }

    await AdvertisementWalletService.withTransaction(async (client) => {
      const refreshed = await AdvertisementModel.findById(id, client);
      if (!refreshed || refreshed.teacherId !== teacherId) {
        throw new ApiError(404, 'الإعلان غير موجود', ErrorCodes.NOT_FOUND);
      }
      if (
        refreshed.status !== AdvertisementStatus.APPROVED &&
        refreshed.status !== AdvertisementStatus.RUNNING
      ) {
        throw new ApiError(400, 'لا يمكن إيقاف الإعلان في حالته الحالية', ErrorCodes.BUSINESS_RULE);
      }
      if (refreshed.budgetRemaining > 0) {
        await this.refundRemaining(refreshed, 'refund_unused', client);
      }
      await AdvertisementModel.adminUpdate(
        id,
        { status: AdvertisementStatus.FINISHED, budgetRemaining: 0 },
        client,
      );
    });

    const updated = await AdvertisementModel.findByIdForTeacher(id, teacherId);
    if (!updated) throw new ApiError(404, 'الإعلان غير موجود', ErrorCodes.NOT_FOUND);
    void AdvertisementNotifyService.emitStatusChanged(updated);
    return updated;
  }

  static async adminDelete(id: string): Promise<void> {
    const ad = await AdvertisementModel.findById(id);
    if (!ad) throw new ApiError(404, 'الإعلان غير موجود', ErrorCodes.NOT_FOUND);
    if (ad.budgetRemaining > 0 && ad.status !== AdvertisementStatus.DRAFT) {
      await this.refundRemaining(ad, 'refund_full');
    }
    await AdvertisementModel.adminSoftDelete(id);
  }

  static async getForStudent(id: string, studentId: string): Promise<Advertisement> {
    const ad = await AdvertisementModel.findById(id);
    if (!ad || ad.status !== AdvertisementStatus.RUNNING) {
      throw new ApiError(404, 'الإعلان غير متاح', ErrorCodes.NOT_FOUND);
    }
    const student = await UserModel.findById(studentId);
    if (!this.isVisibleToStudent(ad, student?.state ?? null)) {
      throw new ApiError(404, 'الإعلان غير متاح', ErrorCodes.NOT_FOUND);
    }
    return ad;
  }

  static async recordView(
    studentId: string,
    advertisementId: string,
  ): Promise<{ charged: boolean; alreadyViewed: boolean; advertisement: Advertisement }> {
    const ad = await AdvertisementModel.findById(advertisementId);
    if (!ad || ad.status !== AdvertisementStatus.RUNNING) {
      throw new ApiError(404, 'الإعلان غير متاح', ErrorCodes.NOT_FOUND);
    }

    const student = await UserModel.findById(studentId);
    if (!student || student.userType !== UserType.STUDENT) {
      throw new ApiError(403, 'غير مسموح', ErrorCodes.FORBIDDEN);
    }
    if (!this.isVisibleToStudent(ad, student.state ?? null)) {
      throw new ApiError(404, 'الإعلان غير متاح', ErrorCodes.NOT_FOUND);
    }

    const cpc = round2(ad.costPerClick ?? 0);
    if (cpc <= 0) {
      let recorded = false;
      await AdvertisementWalletService.withTransaction(async (client) => {
        const clickId = await AdvertisementClickModel.tryInsert({
          advertisementId,
          studentId,
          amountCharged: 0,
          client,
        });
        if (!clickId) return;
        await client.query(
          `UPDATE advertisements
             SET unique_clicks = unique_clicks + 1
           WHERE id = $1 AND status = 'running'`,
          [advertisementId],
        );
        recorded = true;
      });
      const fresh = await AdvertisementModel.findById(advertisementId);
      return {
        charged: false,
        alreadyViewed: !recorded,
        advertisement: fresh!,
      };
    }
    if (ad.budgetRemaining < cpc) {
      return { charged: false, alreadyViewed: false, advertisement: ad };
    }

    let charged = false;
    await AdvertisementWalletService.withTransaction(async (client) => {
      const clickId = await AdvertisementClickModel.tryInsert({
        advertisementId,
        studentId,
        amountCharged: cpc,
        client,
      });
      if (!clickId) return;

      const lock = await client.query<{
        budget_remaining: string;
        unique_clicks: number;
        cost_per_click: string;
        status: string;
        teacher_id: string;
      }>(
        `SELECT budget_remaining, unique_clicks, cost_per_click, status, teacher_id
           FROM advertisements WHERE id = $1 FOR UPDATE`,
        [advertisementId],
      );
      const row = lock.rows[0];
      if (!row || row.status !== AdvertisementStatus.RUNNING) return;

      const remaining = Number(row.budget_remaining);
      const charge = round2(Number(row.cost_per_click));
      if (remaining < charge) return;

      const budgetAfter = round2(remaining - charge);
      const newStatus =
        budgetAfter < charge
          ? AdvertisementStatus.BUDGET_EXHAUSTED
          : AdvertisementStatus.RUNNING;

      await client.query(
        `UPDATE advertisements SET
           budget_remaining = $2,
           unique_clicks = unique_clicks + 1,
           status = $3
         WHERE id = $1`,
        [advertisementId, budgetAfter, newStatus],
      );

      await AdvertisementWalletTransactionModel.insert(
        {
          advertisementId,
          teacherId: row.teacher_id,
          txnType: 'click_charge',
          amount: -charge,
          budgetBefore: remaining,
          budgetAfter,
        },
        client,
      );

      charged = true;

      if (newStatus === AdvertisementStatus.BUDGET_EXHAUSTED) {
        const refreshed = await AdvertisementModel.findById(advertisementId, client);
        if (refreshed) {
          const settings = await AdvertisementSettingsModel.get();
          if (settings.refundUnusedBudget && budgetAfter > 0) {
            await this.refundRemaining(refreshed, 'refund_unused', client);
          }
          void AdvertisementNotifyService.onBudgetExhausted(refreshed);
        }
      }
    });

    const fresh = await AdvertisementModel.findById(advertisementId);
    return {
      charged,
      alreadyViewed: !charged,
      advertisement: fresh!,
    };
  }

  static isVisibleToStudent(ad: Advertisement, studentState: string | null): boolean {
    if (ad.visibility === AdvertisementVisibility.PUBLIC) return true;
    if (!studentState?.trim() || !ad.teacherGovernorate?.trim()) return false;
    return studentState.trim().toLowerCase() === ad.teacherGovernorate.trim().toLowerCase();
  }

  static async promoteApprovedToRunning(id: string): Promise<void> {
    const ad = await AdvertisementModel.findById(id);
    if (!ad || ad.status !== AdvertisementStatus.APPROVED) return;
    const start = ad.startDate ?? new Date();
    if (start > new Date()) return;
    await AdvertisementModel.adminUpdate(id, { status: AdvertisementStatus.RUNNING });
    const updated = await AdvertisementModel.findById(id);
    if (updated) void AdvertisementNotifyService.emitStatusChanged(updated);
  }

  static async processCronTransitions(): Promise<void> {
    await AdvertisementWalletService.withTransaction(async (client) => {
      const toStart = await AdvertisementModel.findDueToStart(client);
      for (const ad of toStart) {
        await AdvertisementModel.adminUpdate(ad.id, { status: AdvertisementStatus.RUNNING }, client);
        const updated = await AdvertisementModel.findById(ad.id, client);
        if (updated) void AdvertisementNotifyService.emitStatusChanged(updated);
      }

      const toFinish = await AdvertisementModel.findDueToFinish(client);
      for (const ad of toFinish) {
        await this.finishAd(ad, client);
      }
    });
  }

  private static async finishAd(ad: Advertisement, client?: PoolClient): Promise<void> {
    const settings = await AdvertisementSettingsModel.get();
    if (settings.refundUnusedBudget && ad.budgetRemaining > 0) {
      await this.refundRemaining(ad, 'refund_unused', client);
    }
    await AdvertisementModel.adminUpdate(
      ad.id,
      { status: AdvertisementStatus.FINISHED, budgetRemaining: 0 },
      client,
    );
    const updated = await AdvertisementModel.findById(ad.id, client);
    if (updated) {
      void AdvertisementNotifyService.onFinished(updated);
      void AdvertisementNotifyService.emitStatusChanged(updated);
    }
  }

  private static async refundFull(ad: Advertisement): Promise<void> {
    if (ad.budgetRemaining <= 0) return;
    await this.refundRemaining(ad, 'refund_full');
    await AdvertisementModel.adminUpdate(ad.id, { budgetRemaining: 0 });
  }

  private static async refundRemaining(
    ad: Advertisement,
    txnType: 'refund_full' | 'refund_unused',
    client?: PoolClient,
  ): Promise<void> {
    const remaining = round2(ad.budgetRemaining);
    if (remaining <= 0) return;
    const split = computeRefundSplit(
      remaining,
      ad.reservedFromBalance,
      ad.reservedFromPending,
    );

    const run = async (c: PoolClient) => {
      await AdvertisementWalletService.refundToWallet(c, {
        teacherId: ad.teacherId,
        fromBalance: split.fromBalance,
        fromPending: split.fromPending,
        advertisementId: ad.id,
        txnType,
        budgetBefore: remaining,
        budgetAfter: 0,
      });
    };

    if (client) {
      await run(client);
    } else {
      await AdvertisementWalletService.withTransaction(async (c) => run(c));
    }
  }

  static async teacherStatistics(teacherId: string) {
    const { rows } = await pool.query<{
      total: string;
      running: string;
      pending: string;
      rejected: string;
      clicks: string;
      remaining: string;
    }>(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status IN ('running','approved'))::int AS running,
         COUNT(*) FILTER (WHERE status = 'pending_review')::int AS pending,
         COUNT(*) FILTER (WHERE status = 'rejected')::int AS rejected,
         COALESCE(SUM(unique_clicks), 0)::int AS clicks,
         COALESCE(SUM(budget_remaining) FILTER (WHERE status IN ('running','approved','pending_review')), 0)::decimal AS remaining
       FROM advertisements
       WHERE teacher_id = $1 AND deleted_at IS NULL`,
      [teacherId],
    );
    const r = rows[0]!;
    const clicks = Number(r.clicks);
    const spent = await AdvertisementWalletTransactionModel.sumClickChargesByTeacher(teacherId);
    return {
      totalAdvertisements: Number(r.total),
      runningAdvertisements: Number(r.running),
      pendingAdvertisements: Number(r.pending),
      rejectedAdvertisements: Number(r.rejected),
      uniqueStudentClicks: clicks,
      totalMoneySpent: spent,
      remainingBudget: Number(r.remaining),
      averageCpc: clicks > 0 ? round2(spent / clicks) : 0,
      studentsReached: clicks,
    };
  }

  static async adminRevenueStatistics() {
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [today, month, total, counts] = await Promise.all([
      AdvertisementWalletTransactionModel.sumRevenueSince(startOfDay),
      AdvertisementWalletTransactionModel.sumRevenueSince(startOfMonth),
      AdvertisementWalletTransactionModel.sumTotalRevenue(),
      pool.query<{
        total: string;
        running: string;
        pending: string;
        rejected: string;
        exhausted: string;
      }>(
        `SELECT
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE status = 'running')::int AS running,
           COUNT(*) FILTER (WHERE status = 'pending_review')::int AS pending,
           COUNT(*) FILTER (WHERE status = 'rejected')::int AS rejected,
           COUNT(*) FILTER (WHERE status = 'budget_exhausted')::int AS exhausted
         FROM advertisements WHERE deleted_at IS NULL`,
      ),
    ]);

    const topAds = await pool.query(
      `SELECT id, title, unique_clicks FROM advertisements
        WHERE deleted_at IS NULL ORDER BY unique_clicks DESC LIMIT 5`,
    );
    const topTeachers = await pool.query(
      `SELECT u.name, SUM(a.unique_clicks)::int AS clicks
         FROM advertisements a JOIN users u ON u.id = a.teacher_id
        WHERE a.deleted_at IS NULL
        GROUP BY u.name ORDER BY clicks DESC LIMIT 5`,
    );

    return {
      revenueToday: today,
      revenueMonth: month,
      revenueTotal: total,
      totalAdvertisements: Number(counts.rows[0]?.total ?? 0),
      running: Number(counts.rows[0]?.running ?? 0),
      pending: Number(counts.rows[0]?.pending ?? 0),
      rejected: Number(counts.rows[0]?.rejected ?? 0),
      budgetExhausted: Number(counts.rows[0]?.exhausted ?? 0),
      mostViewedAdvertisements: topAds.rows,
      topTeachers: topTeachers.rows,
    };
  }

  private static validateContent(title: string, description: string, settings: Awaited<ReturnType<typeof AdvertisementSettingsModel.get>>) {
    this.validateTitle(title, settings);
    this.validateDescription(description, settings);
  }

  private static validateTitle(title: string, settings: Awaited<ReturnType<typeof AdvertisementSettingsModel.get>>) {
    const t = title.trim();
    if (!t) throw new ApiError(400, 'العنوان مطلوب', ErrorCodes.VALIDATION_ERROR);
    if (t.length > settings.maxTitleLength) {
      throw new ApiError(400, 'العنوان طويل جداً', ErrorCodes.VALIDATION_ERROR);
    }
  }

  private static validateDescription(description: string, settings: Awaited<ReturnType<typeof AdvertisementSettingsModel.get>>) {
    const d = description.trim();
    if (!d) throw new ApiError(400, 'الوصف مطلوب', ErrorCodes.VALIDATION_ERROR);
    if (d.length > settings.maxDescriptionLength) {
      throw new ApiError(400, 'الوصف طويل جداً', ErrorCodes.VALIDATION_ERROR);
    }
  }

  private static validateBudget(budget: number, settings: Awaited<ReturnType<typeof AdvertisementSettingsModel.get>>) {
    if (settings.freeClicksEnabled) return;
    const b = round2(budget);
    if (b < settings.minBudget || b > settings.maxBudget) {
      throw new ApiError(
        400,
        `الميزانية يجب أن تكون بين ${settings.minBudget} و ${settings.maxBudget} د.ع`,
        ErrorCodes.VALIDATION_ERROR,
      );
    }
  }

  private static validateVisibility(
    visibility: AdvertisementVisibility,
    settings: Awaited<ReturnType<typeof AdvertisementSettingsModel.get>>,
  ) {
    if (visibility === AdvertisementVisibility.PUBLIC && !settings.allowPublic) {
      throw new ApiError(400, 'الإعلانات العامة غير مسموحة حالياً', ErrorCodes.BUSINESS_RULE);
    }
    if (visibility === AdvertisementVisibility.GOVERNORATE_ONLY && !settings.allowGovernorate) {
      throw new ApiError(400, 'إعلانات المحافظة غير مسموحة حالياً', ErrorCodes.BUSINESS_RULE);
    }
  }
}
