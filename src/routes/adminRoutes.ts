import { Router } from 'express';
import { RBACService } from '../ops/RBACService';
import { query } from '../db';
import { AdminAuditService } from '../ops/AdminAuditService';
import { payoutQueue } from '../queue';
import { SessionSchedulerService } from '../services/SessionSchedulerService';

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

// ── Rooms ─────────────────────────────────────────────────────────────────────

router.get('/rooms', RBACService.checkPermission('view_rooms'), async (req, res) => {
  try {
    const result = await query(`
      SELECT r.*,
        (SELECT COUNT(*) FROM game_sessions gs
         WHERE gs.room_id = r.id AND gs.status IN ('CREATED','READY')) AS active_sessions,
        (SELECT COUNT(*) FROM game_sessions gs
         WHERE gs.room_id = r.id AND gs.status = 'FINISHED') AS finished_sessions,
        (SELECT MAX(gs.jackpot_paid) FROM game_sessions gs
         WHERE gs.room_id = r.id) AS record_jackpot
      FROM rooms r ORDER BY r.id
    `);
    res.json(result.rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/rooms/:id', RBACService.checkPermission('view_rooms'), async (req, res) => {
  const id = req.params.id as string;
  const admin = (req as any).admin;
  const {
    name, description, card_price, platform_fee, jackpot_fee,
    game_mode, max_balls, tie_rule,
    interval_minutes, daily_times, weekly_day, weekly_time,
    is_featured,
  } = req.body;

  try {
    const dailyTimesJson = Array.isArray(daily_times)
      ? JSON.stringify(daily_times)
      : (daily_times ?? '[]');
    await query(
      `UPDATE rooms SET
        name=$1, description=$2, card_price=$3, platform_fee=$4, jackpot_fee=$5,
        game_mode=$6, max_balls=$7, tie_rule=$8,
        interval_minutes=$9, daily_times=$10::jsonb, weekly_day=$11, weekly_time=$12,
        is_featured=$13
       WHERE id=$14`,
      [name, description, card_price, platform_fee, jackpot_fee,
       game_mode, max_balls, tie_rule,
       interval_minutes, dailyTimesJson, weekly_day, weekly_time,
       is_featured, id]
    );
    await AdminAuditService.logAction(admin.id, 'UPDATE_ROOM', 'room', id, req.body, req.ip);
    // Forzar re-chequeo del scheduler
    await SessionSchedulerService.run();
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/rooms/:id/sessions', RBACService.checkPermission('view_rooms'), async (req, res) => {
  try {
    const result = await query(
      `SELECT gs.*, r.name as room_name
       FROM game_sessions gs
       JOIN rooms r ON r.id = gs.room_id
       WHERE gs.room_id = $1
       ORDER BY gs.created_at DESC LIMIT 50`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Jackpot Stats & Auditoría ──────────────────────────────────────────────────

router.get('/jackpot/stats', RBACService.checkPermission('view_rooms'), async (req, res) => {
  try {
    const stats = await query(`
      SELECT
        r.id, r.name, r.game_mode, r.accumulated_jackpot,
        COALESCE(
          (SELECT gs.jackpot_amount FROM game_sessions gs
           WHERE gs.room_id = r.id AND gs.status IN ('CREATED','READY')
           ORDER BY gs.scheduled_at ASC LIMIT 1), 0
        ) AS current_session_jackpot,
        COALESCE(
          (SELECT MAX(ja.amount) FROM jackpot_audit ja
           WHERE ja.room_id = r.id AND ja.event_type = 'PAYOUT'), 0
        ) AS record_payout,
        (SELECT COUNT(*) FROM jackpot_audit ja
         WHERE ja.room_id = r.id AND ja.event_type = 'ROLLOVER') AS total_rollovers
      FROM rooms r ORDER BY r.id
    `);
    res.json(stats.rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/jackpot/audit', RBACService.checkPermission('view_rooms'), async (req, res) => {
  const { room_id, event_type, from, to, limit = '100' } = req.query;
  try {
    const conditions: string[] = [];
    const params: any[] = [];
    if (room_id) { params.push(room_id); conditions.push(`ja.room_id = $${params.length}`); }
    if (event_type) { params.push(event_type); conditions.push(`ja.event_type = $${params.length}`); }
    if (from) { params.push(from); conditions.push(`ja.created_at >= $${params.length}`); }
    if (to) { params.push(to); conditions.push(`ja.created_at <= $${params.length}`); }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(parseInt(limit as string));
    const result = await query(
      `SELECT ja.*, r.name as room_name
       FROM jackpot_audit ja JOIN rooms r ON r.id = ja.room_id
       ${where} ORDER BY ja.created_at DESC LIMIT $${params.length}`,
      params
    );
    res.json(result.rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Users ─────────────────────────────────────────────────────────────────────

router.get('/users', RBACService.checkPermission('view_users'), async (req, res) => {
  try {
    const result = await query(`
      SELECT
        COALESCE(NULLIF(u.real_phone, ''), u.phone_number) AS phone_number,
        u.name,
        u.last_name,
        u.email,
        u.onboarding_completed,
        u.created_at,
        COALESCE(w.real_balance, 0) + COALESCE(w.bonus_balance, 0) AS balance,
        (SELECT COUNT(*) FROM cards c
          JOIN game_sessions gs ON gs.id = c.game_session_id
          WHERE c.user_id = u.id AND gs.status IN ('COMPLETED','FINISHED')) AS bingo_games,
        (SELECT COUNT(*) FROM truco_matches tm
          WHERE (tm.player_a_phone = SPLIT_PART(u.phone_number, '@', 1)
              OR tm.player_b_phone = SPLIT_PART(u.phone_number, '@', 1))
          AND tm.status IN ('PAYOUT_DONE','GAME_OVER')) AS truco_games
      FROM users u
      LEFT JOIN wallets w ON w.user_id = SPLIT_PART(u.phone_number, '@', 1)
      ORDER BY u.created_at DESC
      LIMIT 500
    `);
    res.json(result.rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
