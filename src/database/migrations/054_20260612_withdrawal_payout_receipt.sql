-- ============================================================================
-- 054_20260612_withdrawal_payout_receipt.sql
-- ----------------------------------------------------------------------------
-- Wallet withdrawals — capture the transfer-receipt image at payout time.
--
-- When the super-admin marks a withdrawal request `paid`, they upload a photo
-- of the bank/Wayl transfer receipt. The teacher then sees that receipt next to
-- the confirmed withdrawal in their wallet's "السحوبات" (withdrawals) section.
--
-- The image is stored on disk via ImageService and the public URL is recorded
-- here (consistent with how course / news images are handled). This is a plain
-- additive column — no data path concern.
--
-- Idempotent:    yes (ADD COLUMN IF NOT EXISTS)
-- Transactional: BEGIN/COMMIT (runner does not wrap)
-- ============================================================================

BEGIN;

ALTER TABLE teacher_withdrawal_requests
    ADD COLUMN IF NOT EXISTS payout_receipt_url   TEXT,
    -- Split of the held amount across the two wallet buckets, captured at
    -- request time so a reject restores each bucket exactly and the video
    -- earnings report can attribute "withdrawn" precisely.
    ADD COLUMN IF NOT EXISTS held_from_video_iqd  DECIMAL(14,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS held_from_topup_iqd  DECIMAL(14,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN teacher_withdrawal_requests.payout_receipt_url IS
    'Public URL of the transfer-receipt image uploaded by the super-admin at payout time. Shown to the teacher next to the confirmed (paid) withdrawal.';
COMMENT ON COLUMN teacher_withdrawal_requests.held_from_video_iqd IS
    'Portion of amount_iqd debited from the video-earnings bucket (teacher_wallets.pending_balance) at request time.';
COMMENT ON COLUMN teacher_withdrawal_requests.held_from_topup_iqd IS
    'Portion of amount_iqd debited from the top-up bucket (teacher_wallets.balance) at request time.';

COMMIT;
