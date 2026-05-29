// Wallet engine — Phase 7.
//
// Every wallet mutation MUST go through this service. It owns the invariant:
//
//   teacher_wallets.pending_balance      = SUM of pending side of ledger
//   teacher_wallets.withdrawable_balance = SUM of withdrawable side of ledger
//
// Concurrency model:
//   - SELECT … FOR UPDATE on the teacher_wallets row before touching balances.
//   - INSERT into wallet_ledger inside the same pg transaction.
//   - UPDATE teacher_wallets to the new snapshot.
//
// Idempotency:
//   - Every public method accepts an optional `idempotencyKey`. When passed,
//     wallet_ledger.idempotency_key is the unique key. A retry with the same
//     key returns the existing entry without double-charging.

import type { PoolClient } from 'pg';

import pool from '../config/database';
import {
  type WalletLedgerEntry,
  WalletLedgerEntryType,
} from '../types';
import { ApiError, ErrorCodes } from '../utils/api-error';
import { CommissionService, type CommissionBreakdown } from './commission.service';

interface WalletSnapshot {
  pendingBalance: number;
  withdrawableBalance: number;
  lifetimeEarnings: number;
  lifetimeWithdrawn: number;
}

export class WalletService {
  /**
   * Ensure a wallet row exists for this teacher. Returns the current snapshot.
   */
  static async ensureWallet(teacherId: string): Promise<WalletSnapshot> {
    await pool.query(
      `INSERT INTO teacher_wallets (teacher_id) VALUES ($1)
       ON CONFLICT (teacher_id) DO NOTHING`,
      [teacherId],
    );
    return this.getSnapshot(teacherId);
  }

  /**
   * Read the wallet snapshot without locking. Safe to use outside a transaction.
   */
  static async getSnapshot(teacherId: string): Promise<WalletSnapshot> {
    const { rows } = await pool.query<{
      pending_balance: string;
      withdrawable_balance: string;
      lifetime_earnings: string;
      lifetime_withdrawn: string;
    }>(
      `SELECT pending_balance, withdrawable_balance, lifetime_earnings, lifetime_withdrawn
         FROM teacher_wallets
        WHERE teacher_id = $1`,
      [teacherId],
    );
    const row = rows[0];
    if (!row) {
      return { pendingBalance: 0, withdrawableBalance: 0, lifetimeEarnings: 0, lifetimeWithdrawn: 0 };
    }
    return {
      pendingBalance: Number(row.pending_balance),
      withdrawableBalance: Number(row.withdrawable_balance),
      lifetimeEarnings: Number(row.lifetime_earnings),
      lifetimeWithdrawn: Number(row.lifetime_withdrawn),
    };
  }

  /**
   * Credit a paid enrollment to the teacher's PENDING balance after
   * subtracting the platform commission. Writes:
   *   - 1 ledger entry  enrollment_credit (+netToTeacher)
   *   - 1 ledger entry  platform_commission (-commission) — informational
   *                                                          (no balance impact;
   *                                                           tracked via the
   *                                                           snapshot delta of 0)
   *   - 1 ledger entry  gateway_fee (-gatewayFee)         — informational
   *
   * `idempotencyKey` makes retries safe — pass `enrollment:<id>` from the
   * webhook handler.
   */
  static async creditEnrollment(args: {
    teacherId: string;
    enrollmentId?: string;
    waylLinkId?: string;
    grossSalePriceIqd: number;
    actorUserId?: string;
    idempotencyKey?: string;
    notes?: string;
  }): Promise<{
    ledgerEntryId: string;
    breakdown: CommissionBreakdown;
    snapshot: WalletSnapshot;
  }> {
    const breakdown = await CommissionService.computeFor({
      teacherId: args.teacherId,
      grossSalePriceIqd: args.grossSalePriceIqd,
    });

    return this.runInTx(args.teacherId, async (client, snapshot) => {
      // Idempotency short-circuit.
      if (args.idempotencyKey) {
        const dup = await this.findByIdempotencyKey(client, args.idempotencyKey);
        if (dup) {
          return {
            ledgerEntryId: dup.id,
            breakdown,
            snapshot,
          };
        }
      }

      // 1. Net credit to pending.
      const newPending = round2(snapshot.pendingBalance + breakdown.netToTeacherIqd);
      const newLifetimeEarnings = round2(snapshot.lifetimeEarnings + breakdown.netToTeacherIqd);

      const ledgerId = await this.insertLedger(client, {
        teacherId: args.teacherId,
        entryType: WalletLedgerEntryType.ENROLLMENT_CREDIT,
        amount: breakdown.netToTeacherIqd,
        balancePendingAfter: newPending,
        balanceWithdrawableAfter: snapshot.withdrawableBalance,
        relatedEnrollmentId: args.enrollmentId ?? null,
        relatedWithdrawalId: null,
        relatedWaylLinkId: args.waylLinkId ?? null,
        relatedVideoCoursePurchaseId: null,
        actorUserId: args.actorUserId ?? null,
        idempotencyKey: args.idempotencyKey ?? null,
        notes: args.notes ?? null,
      });

      // 2. Informational commission entry — does NOT touch balances.
      await this.insertLedger(client, {
        teacherId: args.teacherId,
        entryType: WalletLedgerEntryType.PLATFORM_COMMISSION,
        amount: -breakdown.commissionAmountIqd,
        balancePendingAfter: newPending,
        balanceWithdrawableAfter: snapshot.withdrawableBalance,
        relatedEnrollmentId: args.enrollmentId ?? null,
        relatedWithdrawalId: null,
        relatedWaylLinkId: args.waylLinkId ?? null,
        relatedVideoCoursePurchaseId: null,
        actorUserId: args.actorUserId ?? null,
        idempotencyKey: args.idempotencyKey ? `${args.idempotencyKey}#commission` : null,
        notes: `tier=${breakdown.appliedTierName ?? breakdown.source} percent=${breakdown.commissionPercent}`,
      });

      // 3. Informational gateway-fee entry — does NOT touch balances.
      if (breakdown.gatewayFeeIqd > 0) {
        await this.insertLedger(client, {
          teacherId: args.teacherId,
          entryType: WalletLedgerEntryType.GATEWAY_FEE,
          amount: -breakdown.gatewayFeeIqd,
          balancePendingAfter: newPending,
          balanceWithdrawableAfter: snapshot.withdrawableBalance,
          relatedEnrollmentId: args.enrollmentId ?? null,
          relatedWithdrawalId: null,
          relatedWaylLinkId: args.waylLinkId ?? null,
          relatedVideoCoursePurchaseId: null,
          actorUserId: args.actorUserId ?? null,
          idempotencyKey: args.idempotencyKey ? `${args.idempotencyKey}#fee` : null,
          notes: 'wayl_fee_internal',
        });
      }

      // 4. Snapshot.
      await this.persistSnapshot(client, args.teacherId, {
        pendingBalance: newPending,
        withdrawableBalance: snapshot.withdrawableBalance,
        lifetimeEarnings: newLifetimeEarnings,
        lifetimeWithdrawn: snapshot.lifetimeWithdrawn,
      });

      return {
        ledgerEntryId: ledgerId,
        breakdown,
        snapshot: {
          ...snapshot,
          pendingBalance: newPending,
          lifetimeEarnings: newLifetimeEarnings,
        },
      };
    });
  }

  /**
   * Phase 1 marketplace — credit a paid video_course_purchase to the
   * teacher's PENDING balance. Mirrors `creditEnrollment` but:
   *
   *   - Writes entry_type='video_course_purchase_credit' (not
   *     'enrollment_credit') so revenue reports split video sales
   *     from live-course enrollments cleanly.
   *   - Wires related_video_course_purchase_id so analytics can join
   *     ledger → purchase → video_course directly.
   *   - Takes the commission breakdown from the PURCHASE SNAPSHOT (not
   *     a fresh CommissionService.computeFor call) so the credit
   *     honours the percent + IQD numbers the student agreed to at
   *     purchase time, even if the tier table or per-teacher override
   *     changed between purchase + paid webhook.
   *
   * `idempotencyKey` should be `vcp:<purchaseId>` from the webhook
   * handler. A retry collapses to a no-op by returning the existing
   * ledger entry.
   *
   * Gateway-fee informational entry is still written (recomputed
   * fresh from current env). It does NOT touch balances.
   */
  static async creditVideoCoursePurchase(args: {
    teacherId: string;
    purchaseId: string;
    waylLinkId?: string | null;
    snapshot: {
      grossSalePriceIqd: number;
      commissionPercent: number;
      commissionAmountIqd: number;
      netToTeacherIqd: number;
    };
    actorUserId?: string;
    idempotencyKey: string;
  }): Promise<{
    ledgerEntryId: string;
    snapshot: WalletSnapshot;
  }> {
    // Recompute gateway fee from current env. Informational only — does
    // not change balances. The teacher_net we credit is the snapshot
    // value, not (gross - commission - fee).
    const gatewayBreakdown = await CommissionService.computeFor({
      teacherId: args.teacherId,
      grossSalePriceIqd: args.snapshot.grossSalePriceIqd,
    });

    return this.runInTx(args.teacherId, async (client, walletSnapshot) => {
      // Idempotency short-circuit.
      const dup = await this.findByIdempotencyKey(client, args.idempotencyKey);
      if (dup) {
        return { ledgerEntryId: dup.id, snapshot: walletSnapshot };
      }

      // 1. Net credit to pending.
      const newPending = round2(
        walletSnapshot.pendingBalance + args.snapshot.netToTeacherIqd
      );
      const newLifetimeEarnings = round2(
        walletSnapshot.lifetimeEarnings + args.snapshot.netToTeacherIqd
      );

      const ledgerId = await this.insertLedger(client, {
        teacherId: args.teacherId,
        entryType: WalletLedgerEntryType.VIDEO_COURSE_PURCHASE_CREDIT,
        amount: args.snapshot.netToTeacherIqd,
        balancePendingAfter: newPending,
        balanceWithdrawableAfter: walletSnapshot.withdrawableBalance,
        relatedEnrollmentId: null,
        relatedWithdrawalId: null,
        relatedWaylLinkId: args.waylLinkId ?? null,
        relatedVideoCoursePurchaseId: args.purchaseId,
        actorUserId: args.actorUserId ?? null,
        idempotencyKey: args.idempotencyKey,
        notes: null,
      });

      // 2. Informational commission entry — does NOT touch balances.
      await this.insertLedger(client, {
        teacherId: args.teacherId,
        entryType: WalletLedgerEntryType.PLATFORM_COMMISSION,
        amount: -args.snapshot.commissionAmountIqd,
        balancePendingAfter: newPending,
        balanceWithdrawableAfter: walletSnapshot.withdrawableBalance,
        relatedEnrollmentId: null,
        relatedWithdrawalId: null,
        relatedWaylLinkId: args.waylLinkId ?? null,
        relatedVideoCoursePurchaseId: args.purchaseId,
        actorUserId: args.actorUserId ?? null,
        idempotencyKey: `${args.idempotencyKey}#commission`,
        notes: `vcp percent=${args.snapshot.commissionPercent}`,
      });

      // 3. Informational gateway-fee entry — does NOT touch balances.
      if (gatewayBreakdown.gatewayFeeIqd > 0) {
        await this.insertLedger(client, {
          teacherId: args.teacherId,
          entryType: WalletLedgerEntryType.GATEWAY_FEE,
          amount: -gatewayBreakdown.gatewayFeeIqd,
          balancePendingAfter: newPending,
          balanceWithdrawableAfter: walletSnapshot.withdrawableBalance,
          relatedEnrollmentId: null,
          relatedWithdrawalId: null,
          relatedWaylLinkId: args.waylLinkId ?? null,
          relatedVideoCoursePurchaseId: args.purchaseId,
          actorUserId: args.actorUserId ?? null,
          idempotencyKey: `${args.idempotencyKey}#fee`,
          notes: 'wayl_fee_internal',
        });
      }

      // 4. Snapshot.
      await this.persistSnapshot(client, args.teacherId, {
        pendingBalance: newPending,
        withdrawableBalance: walletSnapshot.withdrawableBalance,
        lifetimeEarnings: newLifetimeEarnings,
        lifetimeWithdrawn: walletSnapshot.lifetimeWithdrawn,
      });

      return {
        ledgerEntryId: ledgerId,
        snapshot: {
          ...walletSnapshot,
          pendingBalance: newPending,
          lifetimeEarnings: newLifetimeEarnings,
        },
      };
    });
  }

  /**
   * Phase 1 marketplace — claw back a refunded video_course_purchase.
   * Debits the teacher's wallet by `amountIqd` (the teacher_net stored
   * on the purchase row).
   *
   * Refund debit strategy when the funds may have crossed the T+7
   * settlement window:
   *   - Try `pending_balance` first (within 7 days, the credit is
   *     guaranteed to still be in pending because the settlement sweep
   *     hasn't fired).
   *   - Spill over to `withdrawable_balance` for any remainder
   *     (defensive — covers race vs. a hypothetical sweep cron).
   *   - Throw INSUFFICIENT_FUNDS if the teacher's total < refund.
   *     This blocks the refund cleanly; the admin must coordinate
   *     out-of-band (e.g. wait for withdrawals to clear, or
   *     compensate).
   *
   * `idempotencyKey` is `vcp_refund:<purchaseId>` so a double-click
   * doesn't double-debit.
   */
  static async debitVideoCoursePurchaseRefund(args: {
    teacherId: string;
    purchaseId: string;
    amountIqd: number;
    actorUserId?: string;
    notes?: string;
  }): Promise<WalletSnapshot> {
    const idempotencyKey = `vcp_refund:${args.purchaseId}`;

    return this.runInTx(args.teacherId, async (client, snapshot) => {
      // Idempotency short-circuit.
      const dup = await this.findByIdempotencyKey(client, idempotencyKey);
      if (dup) return snapshot;

      const refund = round2(args.amountIqd);
      const totalAvailable = round2(
        snapshot.pendingBalance + snapshot.withdrawableBalance
      );
      if (totalAvailable < refund) {
        throw new ApiError(
          400,
          'الرصيد غير كافٍ لاسترداد هذا الشراء',
          ErrorCodes.INSUFFICIENT_FUNDS,
          {
            requestedIqd: refund,
            availableIqd: totalAvailable,
            pendingIqd: snapshot.pendingBalance,
            withdrawableIqd: snapshot.withdrawableBalance,
          }
        );
      }

      const debitFromPending = Math.min(refund, snapshot.pendingBalance);
      const debitFromWithdrawable = round2(refund - debitFromPending);

      const newPending = round2(snapshot.pendingBalance - debitFromPending);
      const newWithdrawable = round2(
        snapshot.withdrawableBalance - debitFromWithdrawable
      );
      // lifetime_earnings is the cumulative "ever credited" total; the
      // refund subtracts from it so the teacher's "lifetime" reflects
      // what they actually kept.
      const newLifetimeEarnings = Math.max(
        0,
        round2(snapshot.lifetimeEarnings - refund)
      );

      const ledgerId = await this.insertLedger(client, {
        teacherId: args.teacherId,
        entryType: WalletLedgerEntryType.VIDEO_COURSE_PURCHASE_REFUND,
        amount: -refund,
        balancePendingAfter: newPending,
        balanceWithdrawableAfter: newWithdrawable,
        relatedEnrollmentId: null,
        relatedWithdrawalId: null,
        relatedWaylLinkId: null,
        relatedVideoCoursePurchaseId: args.purchaseId,
        actorUserId: args.actorUserId ?? null,
        idempotencyKey,
        notes:
          args.notes ??
          `refund vcp:${args.purchaseId} (pending=${debitFromPending}, withdrawable=${debitFromWithdrawable})`,
      });
      void ledgerId;

      await this.persistSnapshot(client, args.teacherId, {
        pendingBalance: newPending,
        withdrawableBalance: newWithdrawable,
        lifetimeEarnings: newLifetimeEarnings,
        lifetimeWithdrawn: snapshot.lifetimeWithdrawn,
      });

      return {
        ...snapshot,
        pendingBalance: newPending,
        withdrawableBalance: newWithdrawable,
        lifetimeEarnings: newLifetimeEarnings,
      };
    });
  }

  /**
   * Sweep — move pending entries older than `holdDays` into withdrawable.
   * Designed to be called by a periodic job (cron in Phase 19). We compute
   * the matured-pending amount from the ledger to stay deterministic; the
   * snapshot columns are reconciled in the same transaction.
   */
  static async settleMaturedPending(args: {
    teacherId: string;
    olderThanDate: Date;
    actorUserId?: string;
  }): Promise<{
    settledAmount: number;
    snapshot: WalletSnapshot;
  }> {
    return this.runInTx(args.teacherId, async (client, snapshot) => {
      // Sum of enrollment_credit older than threshold, minus refund_debits,
      // minus prior pending_to_withdrawable sweeps.
      const matured = await client.query<{ amount: string }>(
        `SELECT COALESCE(SUM(amount), 0) AS amount
           FROM wallet_ledger
          WHERE teacher_id = $1
            AND created_at <= $2
            AND entry_type IN ('enrollment_credit','refund_debit','pending_to_withdrawable','manual_adjustment_credit','manual_adjustment_debit')`,
        [args.teacherId, args.olderThanDate],
      );
      // The matured sum represents the pending TOTAL up to that timestamp.
      // We've already moved earlier batches into withdrawable via prior
      // pending_to_withdrawable entries (which appear with NEGATIVE amount
      // in the same query above to net them out).
      const settleable = Math.max(0, round2(Number(matured.rows[0]!.amount)));

      // Defensive clamp: never move more than what's actually still in
      // pending right now (e.g. a refund processed today against a pre-cutoff
      // enrollment would have already debited pending; the SUM above doesn't
      // model "current pending", just "matured net").
      const movable = Math.min(settleable, snapshot.pendingBalance);
      if (movable <= 0) {
        return { settledAmount: 0, snapshot };
      }

      const newPending = round2(snapshot.pendingBalance - movable);
      const newWithdrawable = round2(snapshot.withdrawableBalance + movable);

      await this.insertLedger(client, {
        teacherId: args.teacherId,
        entryType: WalletLedgerEntryType.PENDING_TO_WITHDRAWABLE,
        amount: movable,
        balancePendingAfter: newPending,
        balanceWithdrawableAfter: newWithdrawable,
        relatedEnrollmentId: null,
        relatedWithdrawalId: null,
        relatedWaylLinkId: null,
        relatedVideoCoursePurchaseId: null,
        actorUserId: args.actorUserId ?? null,
        idempotencyKey: `settle:${args.teacherId}:${args.olderThanDate.toISOString().slice(0,10)}`,
        notes: 'T+settlement sweep',
      });

      await this.persistSnapshot(client, args.teacherId, {
        pendingBalance: newPending,
        withdrawableBalance: newWithdrawable,
        lifetimeEarnings: snapshot.lifetimeEarnings,
        lifetimeWithdrawn: snapshot.lifetimeWithdrawn,
      });

      return {
        settledAmount: movable,
        snapshot: {
          ...snapshot,
          pendingBalance: newPending,
          withdrawableBalance: newWithdrawable,
        },
      };
    });
  }

  /**
   * Place a hold on withdrawable when a withdrawal request is created.
   * Returns ApiError(400 INSUFFICIENT_FUNDS) if balance can't cover.
   */
  static async holdForWithdrawal(args: {
    teacherId: string;
    withdrawalId: string;
    amountIqd: number;
    actorUserId?: string;
  }): Promise<WalletSnapshot> {
    return this.runInTx(args.teacherId, async (client, snapshot) => {
      if (snapshot.withdrawableBalance < args.amountIqd) {
        throw new ApiError(
          400,
          'الرصيد القابل للسحب غير كافٍ',
          ErrorCodes.INSUFFICIENT_FUNDS,
          {
            requestedIqd: args.amountIqd,
            availableIqd: snapshot.withdrawableBalance,
          },
        );
      }
      const newWithdrawable = round2(snapshot.withdrawableBalance - args.amountIqd);
      await this.insertLedger(client, {
        teacherId: args.teacherId,
        entryType: WalletLedgerEntryType.WITHDRAWAL_HOLD,
        amount: -args.amountIqd,
        balancePendingAfter: snapshot.pendingBalance,
        balanceWithdrawableAfter: newWithdrawable,
        relatedEnrollmentId: null,
        relatedWithdrawalId: args.withdrawalId,
        relatedWaylLinkId: null,
        relatedVideoCoursePurchaseId: null,
        actorUserId: args.actorUserId ?? null,
        idempotencyKey: `withdrawal_hold:${args.withdrawalId}`,
        notes: null,
      });
      await this.persistSnapshot(client, args.teacherId, {
        ...snapshot,
        withdrawableBalance: newWithdrawable,
      });
      return { ...snapshot, withdrawableBalance: newWithdrawable };
    });
  }

  /**
   * Release a held amount back to withdrawable. Used when a previously-
   * approved withdrawal is rejected by the admin.
   */
  static async releaseWithdrawalHold(args: {
    teacherId: string;
    withdrawalId: string;
    amountIqd: number;
    actorUserId?: string;
  }): Promise<WalletSnapshot> {
    return this.runInTx(args.teacherId, async (client, snapshot) => {
      const newWithdrawable = round2(snapshot.withdrawableBalance + args.amountIqd);
      await this.insertLedger(client, {
        teacherId: args.teacherId,
        entryType: WalletLedgerEntryType.WITHDRAWAL_RELEASE,
        amount: args.amountIqd,
        balancePendingAfter: snapshot.pendingBalance,
        balanceWithdrawableAfter: newWithdrawable,
        relatedEnrollmentId: null,
        relatedWithdrawalId: args.withdrawalId,
        relatedWaylLinkId: null,
        relatedVideoCoursePurchaseId: null,
        actorUserId: args.actorUserId ?? null,
        idempotencyKey: `withdrawal_release:${args.withdrawalId}`,
        notes: null,
      });
      await this.persistSnapshot(client, args.teacherId, {
        ...snapshot,
        withdrawableBalance: newWithdrawable,
      });
      return { ...snapshot, withdrawableBalance: newWithdrawable };
    });
  }

  /**
   * Mark a previously-held withdrawal as paid. No balance change (hold
   * already debited withdrawable); writes an audit entry + bumps
   * lifetime_withdrawn.
   */
  static async markWithdrawalPaid(args: {
    teacherId: string;
    withdrawalId: string;
    amountIqd: number;
    actorUserId?: string;
  }): Promise<WalletSnapshot> {
    return this.runInTx(args.teacherId, async (client, snapshot) => {
      const newLifetimeWithdrawn = round2(snapshot.lifetimeWithdrawn + args.amountIqd);
      await this.insertLedger(client, {
        teacherId: args.teacherId,
        entryType: WalletLedgerEntryType.WITHDRAWAL_PAID,
        amount: 0,
        balancePendingAfter: snapshot.pendingBalance,
        balanceWithdrawableAfter: snapshot.withdrawableBalance,
        relatedEnrollmentId: null,
        relatedWithdrawalId: args.withdrawalId,
        relatedWaylLinkId: null,
        relatedVideoCoursePurchaseId: null,
        actorUserId: args.actorUserId ?? null,
        idempotencyKey: `withdrawal_paid:${args.withdrawalId}`,
        notes: null,
      });
      await this.persistSnapshot(client, args.teacherId, {
        ...snapshot,
        lifetimeWithdrawn: newLifetimeWithdrawn,
      });
      return { ...snapshot, lifetimeWithdrawn: newLifetimeWithdrawn };
    });
  }

  // ---------------------------------------------------------------------------
  // internals
  // ---------------------------------------------------------------------------

  private static async runInTx<T>(
    teacherId: string,
    fn: (client: PoolClient, snapshot: WalletSnapshot) => Promise<T>,
  ): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Ensure wallet exists then lock it.
      await client.query(
        `INSERT INTO teacher_wallets (teacher_id) VALUES ($1) ON CONFLICT DO NOTHING`,
        [teacherId],
      );
      const lock = await client.query<{
        pending_balance: string;
        withdrawable_balance: string;
        lifetime_earnings: string;
        lifetime_withdrawn: string;
      }>(
        `SELECT pending_balance, withdrawable_balance, lifetime_earnings, lifetime_withdrawn
           FROM teacher_wallets
          WHERE teacher_id = $1
          FOR UPDATE`,
        [teacherId],
      );
      const row = lock.rows[0]!;
      const snapshot: WalletSnapshot = {
        pendingBalance: Number(row.pending_balance),
        withdrawableBalance: Number(row.withdrawable_balance),
        lifetimeEarnings: Number(row.lifetime_earnings),
        lifetimeWithdrawn: Number(row.lifetime_withdrawn),
      };
      const result = await fn(client, snapshot);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  private static async insertLedger(
    client: PoolClient,
    entry: Omit<WalletLedgerEntry, 'id' | 'createdAt'>,
  ): Promise<string> {
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO wallet_ledger (
         teacher_id, entry_type, amount,
         balance_pending_after, balance_withdrawable_after,
         related_enrollment_id, related_withdrawal_id, related_wayl_link_id,
         related_video_course_purchase_id,
         actor_user_id, idempotency_key, notes
       ) VALUES (
         $1, $2, $3,
         $4, $5,
         $6, $7, $8,
         $9,
         $10, $11, $12
       )
       RETURNING id`,
      [
        entry.teacherId,
        entry.entryType,
        entry.amount,
        entry.balancePendingAfter,
        entry.balanceWithdrawableAfter,
        entry.relatedEnrollmentId,
        entry.relatedWithdrawalId,
        entry.relatedWaylLinkId,
        entry.relatedVideoCoursePurchaseId,
        entry.actorUserId,
        entry.idempotencyKey,
        entry.notes,
      ],
    );
    return rows[0]!.id;
  }

  private static async persistSnapshot(
    client: PoolClient,
    teacherId: string,
    s: WalletSnapshot,
  ): Promise<void> {
    await client.query(
      `UPDATE teacher_wallets
          SET pending_balance      = $2,
              withdrawable_balance = $3,
              lifetime_earnings    = $4,
              lifetime_withdrawn   = $5
        WHERE teacher_id = $1`,
      [teacherId, s.pendingBalance, s.withdrawableBalance, s.lifetimeEarnings, s.lifetimeWithdrawn],
    );
  }

  private static async findByIdempotencyKey(
    client: PoolClient,
    key: string,
  ): Promise<{ id: string } | null> {
    const { rows } = await client.query<{ id: string }>(
      `SELECT id FROM wallet_ledger WHERE idempotency_key = $1 LIMIT 1`,
      [key],
    );
    return rows[0] ?? null;
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
