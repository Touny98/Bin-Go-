import { Router } from 'express';
import { RBACService } from '../ops/RBACService';
import { query } from '../db';
import { AdminAuditService } from '../ops/AdminAuditService';
import { payoutQueue } from '../queue';

const router = Router();

// Financial Ops: View Pending Payouts
router.get('/payouts/pending', RBACService.checkPermission('view_payouts'), async (req, res) => {
  const result = await query("SELECT * FROM payout_requests WHERE status = 'PENDING_REVIEW' ORDER BY created_at ASC");
  res.json(result.rows);
});

// Financial Ops: Approve Payout
router.post('/payouts/:id/approve', RBACService.checkPermission('approve_payouts'), async (req, res) => {
  const { id } = req.params;
  const admin = (req as any).admin;

  await query("UPDATE payout_requests SET status = 'APPROVED', updated_at = NOW() WHERE id = $1", [id]);
  
  // Re-enqueue to processing queue
  const payoutRes = await query("SELECT user_id, amount FROM payout_requests WHERE id = $1", [id]);
  const payout = payoutRes.rows[0];

  await payoutQueue.add('process_approved_payout', {
    payoutId: id,
    userId: payout.user_id,
    amount: parseFloat(payout.amount)
  });

  await AdminAuditService.logAction(admin.id, 'APPROVE_PAYOUT', 'payout', id as string, {}, req.ip);
  
  res.json({ success: true, message: 'Payout approved and enqueued for processing' });
});

// Game Ops: List Game Sessions
router.get('/games/sessions', RBACService.checkPermission('view_rooms'), async (req, res) => {
  const result = await query("SELECT * FROM game_sessions ORDER BY created_at DESC LIMIT 50");
  res.json(result.rows);
});

// User Support: Timeline
router.get('/users/:id/timeline', RBACService.checkPermission('view_users'), async (req, res) => {
  const { id } = req.params;
  // Aggregate data from multiple tables (conversations, payments, stats, wins)
  const conversations = await query("SELECT * FROM conversation_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20", [id]);
  const ledger = await query("SELECT * FROM ledger_entries WHERE wallet_id = $1 ORDER BY created_at DESC LIMIT 20", [id]);
  
  res.json({
    userId: id,
    conversations: conversations.rows,
    ledger: ledger.rows
  });
});

export default router;
