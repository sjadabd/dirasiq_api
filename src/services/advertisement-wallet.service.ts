import type { PoolClient } from 'pg';

import pool from '../config/database';
import { AdvertisementWalletTransactionModel } from '../models/advertisement-wallet-transaction.model';
import { ApiError, ErrorCodes } from '../utils/api-error';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

type WalletSnapshot = {
  balance: number;
  pendingBalance: number;
};

export type ReserveResult = {
  fromBalance: number;
  fromPending: number;
};

export class AdvertisementWalletService {
  static async lockWallet(
    client: PoolClient,
    teacherId: string,
  ): Promise<WalletSnapshot> {
    await client.query(
      `INSERT INTO teacher_wallets (teacher_id, balance, pending_balance)
       VALUES ($1, 0, 0)
       ON CONFLICT (teacher_id) DO NOTHING`,
      [teacherId],
    );
    const { rows } = await client.query<{ balance: string; pending_balance: string }>(
      `SELECT balance, pending_balance FROM teacher_wallets WHERE teacher_id = $1 FOR UPDATE`,
      [teacherId],
    );
    return {
      balance: Number(rows[0]?.balance ?? 0),
      pendingBalance: Number(rows[0]?.pending_balance ?? 0),
    };
  }

  /** Debit topup (balance) first, then pending_balance. */
  static async reserveBudget(
    client: PoolClient,
    args: {
      teacherId: string;
      amount: number;
      advertisementId: string;
      budgetBefore: number;
    },
  ): Promise<ReserveResult> {
    const amount = round2(args.amount);
    const wallet = await this.lockWallet(client, args.teacherId);
    const available = round2(wallet.balance + wallet.pendingBalance);
    if (available < amount) {
      throw new ApiError(
        400,
        'رصيد المحفظة غير كافٍ لتمويل هذا الإعلان',
        ErrorCodes.INSUFFICIENT_FUNDS,
        { requestedIqd: amount, availableIqd: available },
      );
    }

    const fromBalance = round2(Math.min(wallet.balance, amount));
    const fromPending = round2(amount - fromBalance);
    const newBalance = round2(wallet.balance - fromBalance);
    const newPending = round2(wallet.pendingBalance - fromPending);

    await client.query(
      `UPDATE teacher_wallets SET balance = $2, pending_balance = $3, updated_at = now()
        WHERE teacher_id = $1`,
      [args.teacherId, newBalance, newPending],
    );

    if (fromBalance > 0) {
      await client.query(
        `INSERT INTO teacher_wallet_transactions (
           teacher_id, txn_type, amount, balance_before, balance_after, reference_type, reference_id
         ) VALUES ($1, 'debit', $2, $3, $4, 'advertisement_reserve', $5)`,
        [args.teacherId, -fromBalance, wallet.balance, newBalance, args.advertisementId],
      );
    }

    await AdvertisementWalletTransactionModel.insert(
      {
        advertisementId: args.advertisementId,
        teacherId: args.teacherId,
        txnType: 'reserve',
        amount: amount,
        budgetBefore: args.budgetBefore,
        budgetAfter: round2(args.budgetBefore + amount),
        referenceId: `reserve:${fromBalance}:${fromPending}`,
      },
      client,
    );

    return { fromBalance, fromPending };
  }

  static async refundToWallet(
    client: PoolClient,
    args: {
      teacherId: string;
      fromBalance: number;
      fromPending: number;
      advertisementId: string;
      txnType: 'refund_full' | 'refund_unused';
      budgetBefore: number;
      budgetAfter: number;
    },
  ): Promise<void> {
    const refundBalance = round2(args.fromBalance);
    const refundPending = round2(args.fromPending);
    const total = round2(refundBalance + refundPending);
    if (total <= 0) return;

    const wallet = await this.lockWallet(client, args.teacherId);
    const newBalance = round2(wallet.balance + refundBalance);
    const newPending = round2(wallet.pendingBalance + refundPending);

    await client.query(
      `UPDATE teacher_wallets SET balance = $2, pending_balance = $3, updated_at = now()
        WHERE teacher_id = $1`,
      [args.teacherId, newBalance, newPending],
    );

    if (refundBalance > 0) {
      await client.query(
        `INSERT INTO teacher_wallet_transactions (
           teacher_id, txn_type, amount, balance_before, balance_after, reference_type, reference_id
         ) VALUES ($1, 'topup', $2, $3, $4, $5, $6)`,
        [
          args.teacherId,
          refundBalance,
          wallet.balance,
          newBalance,
          `advertisement_${args.txnType}`,
          args.advertisementId,
        ],
      );
    }

    await AdvertisementWalletTransactionModel.insert(
      {
        advertisementId: args.advertisementId,
        teacherId: args.teacherId,
        txnType: args.txnType,
        amount: -total,
        budgetBefore: args.budgetBefore,
        budgetAfter: args.budgetAfter,
      },
      client,
    );
  }

  static async withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }
}
