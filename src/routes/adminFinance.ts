import { Router } from 'express';
import { OperatorActionLockService } from '../services/admin/OperatorActionLockService';
import { logger } from '../utils/logger';
import { query } from '../db';
import { notifyHighQueue } from '../queue';
import { WalletEngine } from '../finance/WalletEngine';

const router = Router();

/**
 * POST /api/admin/finance/lock/:resourceId
 * Attempts to acquire a lock for a resource.
 */
router.post('/lock/:resourceId', async (req, res) => {
  const { resourceId } = req.params;
  const { operatorId, operatorName } = (req as any).admin; // From auth middleware

  try {
    const success = await OperatorActionLockService.acquire(resourceId, operatorId, operatorName);
    
    if (success) {
      res.json({ success: true, message: 'Lock acquired' });
    } else {
      const status = await OperatorActionLockService.getStatus(resourceId);
      res.status(409).json({ 
        success: false, 
        message: 'Resource is already locked by another operator',
        lockedBy: status.operatorName,
        expiresAt: status.expiresAt
      });
    }
  } catch (error: any) {
    logger.error({ error: error.message, resourceId }, '[AdminFinanceRoute] Lock acquisition failed');
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * DELETE /api/admin/finance/lock/:resourceId
 * Releases a lock.
 */
router.delete('/lock/:resourceId', async (req, res) => {
  const { resourceId } = req.params;
  const { operatorId } = (req as any).admin;

  try {
    const success = await OperatorActionLockService.release(resourceId, operatorId);
    res.json({ success });
  } catch (error: any) {
    logger.error({ error: error.message, resourceId }, '[AdminFinanceRoute] Lock release failed');
    res.status(500).json({ success: false });
  }
});

/**
 * GET /api/admin/finance/lock/status/:resourceId
 */
router.get('/lock/status/:resourceId', async (req, res) => {
  const { resourceId } = req.params;
  try {
    const status = await OperatorActionLockService.getStatus(resourceId);
    res.json(status);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/admin/finance/payouts/pending
 * Obtener retiros pendientes de pago manual (PENDING_PAYMENT)
 */
router.get('/payouts/pending', async (req, res) => {
  try {
    const payoutsRes = await query(`
      SELECT
        id, user_id, amount, fee_amount, destination, status,
        risk_score, created_at, updated_at
      FROM payout_requests
      WHERE status = 'PENDING_PAYMENT'
      ORDER BY created_at DESC
    `);
    res.json(payoutsRes.rows);
  } catch (error: any) {
    logger.error({ error: error.message }, '[AdminFinanceRoute] Failed to fetch pending payouts');
    res.status(500).json({ error: 'Failed to fetch payouts' });
  }
});

/**
 * POST /api/admin/finance/payouts/:payoutId/mark-paid
 * Marcar un retiro como pagado y notificar al usuario
 */
router.post('/payouts/:payoutId/mark-paid', async (req, res) => {
  const { payoutId } = req.params;
  const { operatorId } = (req as any).admin;

  try {
    // Obtener datos del retiro y usuario
    const payoutRes = await query(
      `SELECT pr.user_id, pr.amount, u.whatsapp_jid, u.phone_number
       FROM payout_requests pr
       LEFT JOIN users u ON u.phone_number = pr.user_id
                         OR u.whatsapp_jid = pr.user_id
       WHERE pr.id = $1`,
      [payoutId]
    );

    if (!payoutRes.rows.length) {
      return res.status(404).json({ error: 'Payout not found' });
    }

    const { user_id, amount, whatsapp_jid, phone_number } = payoutRes.rows[0];
    const chatId = whatsapp_jid || `${phone_number}@c.us`;

    // Marcar como PAID
    await query(
      `UPDATE payout_requests SET status = $1, updated_at = NOW() WHERE id = $2`,
      ['PAID', payoutId]
    );

    // Notificar al usuario
    const montoStr = new Intl.NumberFormat('es-AR').format(amount);
    const winMsg =
      `✅ *¡Tu retiro fue acreditado!*\n\n` +
      `Monto: *$${montoStr}*\n` +
      `El dinero ya fue transferido a tu cuenta. 💸\n\n` +
      `Gracias por jugar en BinGo! 🎰`;

    await notifyHighQueue.add('send_notification', { to: chatId, text: winMsg });

    logger.info({ payoutId, userId: user_id, operatorId }, '[AdminFinanceRoute] Payout marked as PAID');
    res.json({ success: true, message: 'Payout marked as paid and user notified' });
  } catch (error: any) {
    logger.error({ payoutId, error: error.message }, '[AdminFinanceRoute] Failed to mark payout as paid');
    res.status(500).json({ error: 'Failed to mark payout as paid' });
  }
});

/**
 * POST /api/admin/finance/payouts/:payoutId/reject
 * Rechazar un retiro y notificar al usuario
 */
router.post('/payouts/:payoutId/reject', async (req, res) => {
  const { payoutId } = req.params;
  const { reason } = req.body;
  const { operatorId } = (req as any).admin;

  try {
    // Obtener datos del retiro y usuario
    const payoutRes = await query(
      `SELECT pr.user_id, pr.amount, u.whatsapp_jid, u.phone_number
       FROM payout_requests pr
       LEFT JOIN users u ON u.phone_number = pr.user_id
                         OR u.whatsapp_jid = pr.user_id
       WHERE pr.id = $1`,
      [payoutId]
    );

    if (!payoutRes.rows.length) {
      return res.status(404).json({ error: 'Payout not found' });
    }

    const { user_id, amount, whatsapp_jid, phone_number } = payoutRes.rows[0];
    const chatId = whatsapp_jid || `${phone_number}@c.us`;

    // Claim atómico del rechazo: evita doble-rechazo (y por ende doble-notificación).
    const claim = await query(
      `UPDATE payout_requests SET status = 'FAILED', risk_notes = $1, updated_at = NOW()
       WHERE id = $2 AND status NOT IN ('PAID','FAILED') RETURNING id`,
      [reason || 'Rechazado por el administrador', payoutId]
    );
    if (claim.rowCount === 0) {
      return res.status(409).json({ error: 'El retiro ya está en estado terminal (PAID o FAILED)' });
    }

    // Reembolso vía ledger (sin drift), idempotente y SÓLO si realmente se había
    // debitado el saldo. Un retiro en PENDING_REVIEW nunca se debitó → no se crea dinero.
    const { refunded } = await WalletEngine.refundWithdrawal(user_id, amount, payoutId);

    // Notificar al usuario
    const montoStr = new Intl.NumberFormat('es-AR').format(amount);
    const rejectMsg =
      `❌ *Tu solicitud de retiro fue rechazada*\n\n` +
      `Monto: *$${montoStr}*\n` +
      `Razón: ${reason || 'No especificada'}\n\n` +
      (refunded
        ? `El dinero fue devuelto a tu billetera. Podés intentar nuevamente después.`
        : `Si se había descontado saldo, ya quedó regularizado.`);

    await notifyHighQueue.add('send_notification', { to: chatId, text: rejectMsg });

    logger.info({ payoutId, userId: user_id, reason, refunded, operatorId }, '[AdminFinanceRoute] Payout rejected');
    res.json({ success: true, message: 'Payout rejected and user notified', refunded });
  } catch (error: any) {
    logger.error({ payoutId, error: error.message }, '[AdminFinanceRoute] Failed to reject payout');
    res.status(500).json({ error: 'Failed to reject payout' });
  }
});

/**
 * GET /api/admin/finance/revenue/daily
 * Retorna los ingresos por día (FEE) de los últimos 7 días + ventas confirmadas
 */
router.get('/revenue/daily', async (req, res) => {
  try {
    // Ventas confirmadas (card_reservations PAID) por día
    const salesRes = await query(`
      SELECT
        TO_CHAR(cr.created_at AT TIME ZONE 'America/Argentina/Buenos_Aires', 'Dy') as day_label,
        DATE(cr.created_at AT TIME ZONE 'America/Argentina/Buenos_Aires') as day,
        COALESCE(SUM(r.card_price), 0) as revenue,
        COUNT(cr.id) as card_count
      FROM card_reservations cr
      JOIN cards c ON c.id = cr.card_id
      JOIN game_sessions gs ON gs.id = c.game_session_id
      JOIN rooms r ON r.id = gs.room_id
      WHERE cr.status = 'PAID'
        AND cr.created_at > NOW() - INTERVAL '7 days'
      GROUP BY DATE(cr.created_at AT TIME ZONE 'America/Argentina/Buenos_Aires'),
               TO_CHAR(cr.created_at AT TIME ZONE 'America/Argentina/Buenos_Aires', 'Dy')
      ORDER BY day ASC
    `);

    // Fees de plataforma por día
    const feeRes = await query(`
      SELECT
        DATE(created_at AT TIME ZONE 'America/Argentina/Buenos_Aires') as day,
        COALESCE(SUM(amount), 0) as fee
      FROM ledger_entries
      WHERE category = 'FEE'
        AND created_at > NOW() - INTERVAL '7 days'
      GROUP BY DATE(created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')
      ORDER BY day ASC
    `);

    // Combinar en mapa por día
    const feeByDay: Record<string, number> = {};
    for (const row of feeRes.rows) {
      feeByDay[row.day] = parseFloat(row.fee);
    }

    const chartData = salesRes.rows.map((row: any) => ({
      name: row.day_label,
      revenue: parseFloat(row.revenue),
      fees: feeByDay[row.day] ?? 0,
      cards: parseInt(row.card_count),
    }));

    res.json({ chartData });
  } catch (error: any) {
    logger.error({ error: error.message }, '[AdminFinanceRoute] Failed to fetch daily revenue');
    res.status(500).json({ error: 'Failed to fetch daily revenue' });
  }
});

/**
 * GET /api/admin/finance/revenue/summary
 * Resumen financiero del período actual (últimos 30 días)
 */
router.get('/revenue/summary', async (req, res) => {
  try {
    const [totalSalesRes, totalFeesRes, totalCardsRes, activePlayers] = await Promise.all([
      query(`
        SELECT COALESCE(SUM(r.card_price), 0) as total
        FROM card_reservations cr
        JOIN cards c ON c.id = cr.card_id
        JOIN game_sessions gs ON gs.id = c.game_session_id
        JOIN rooms r ON r.id = gs.room_id
        WHERE cr.status = 'PAID'
          AND cr.created_at > NOW() - INTERVAL '30 days'
      `),
      query(`
        SELECT COALESCE(SUM(amount), 0) as total
        FROM ledger_entries WHERE category = 'FEE'
          AND created_at > NOW() - INTERVAL '30 days'
      `),
      query(`
        SELECT COUNT(*) as total FROM card_reservations
        WHERE status = 'PAID' AND created_at > NOW() - INTERVAL '30 days'
      `),
      query(`
        SELECT COUNT(DISTINCT user_id) as total FROM card_reservations
        WHERE status = 'PAID' AND created_at > NOW() - INTERVAL '30 days'
      `),
    ]);

    const totalSales = parseFloat(totalSalesRes.rows[0]?.total ?? '0');
    const totalFees = parseFloat(totalFeesRes.rows[0]?.total ?? '0');
    const totalCards = parseInt(totalCardsRes.rows[0]?.total ?? '0');
    const activePlCount = parseInt(activePlayers.rows[0]?.total ?? '0');

    res.json({
      totalSales,            // GGR (ventas brutas)
      platformFees: totalFees, // Ingresos netos de plataforma
      totalCards,
      activePlayers: activePlCount,
    });
  } catch (error: any) {
    logger.error({ error: error.message }, '[AdminFinanceRoute] Failed to fetch revenue summary');
    res.status(500).json({ error: 'Failed to fetch revenue summary' });
  }
});

/**
 * GET /api/admin/finance/ledger
 * Libro mayor real — últimas 100 entradas
 */
router.get('/ledger', async (req, res) => {
  const { limit = 100, offset = 0, category, type } = req.query;
  try {
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (category) {
      conditions.push(`category = $${idx++}`);
      params.push(category);
    }
    if (type) {
      conditions.push(`entry_type = $${idx++}`);
      params.push(type);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(parseInt(limit as string), parseInt(offset as string));

    const ledgerRes = await query(`
      SELECT id, wallet_id, entry_type, category, amount, reference_id, metadata, created_at
      FROM ledger_entries
      ${where}
      ORDER BY created_at DESC
      LIMIT $${idx++} OFFSET $${idx}
    `, params);

    const totalRes = await query(
      `SELECT COUNT(*) as total FROM ledger_entries ${where}`,
      params.slice(0, params.length - 2)
    );

    res.json({
      entries: ledgerRes.rows.map((row: any) => ({
        id: String(row.id),
        walletId: row.wallet_id,
        type: row.entry_type as 'CREDIT' | 'DEBIT',
        category: row.category,
        amount: parseFloat(row.amount),
        referenceId: row.reference_id,
        metadata: row.metadata,
        timestamp: row.created_at,
        status: 'COMPLETED' as const,
      })),
      total: parseInt(totalRes.rows[0]?.total ?? '0'),
    });
  } catch (error: any) {
    logger.error({ error: error.message }, '[AdminFinanceRoute] Failed to fetch ledger');
    res.status(500).json({ error: 'Failed to fetch ledger' });
  }
});

export default router;
