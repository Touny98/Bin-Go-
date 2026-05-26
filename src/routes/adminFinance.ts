import { Router } from 'express';
import { OperatorActionLockService } from '../services/admin/OperatorActionLockService';
import { logger } from '../utils/logger';
import { query } from '../db';
import { notifyHighQueue } from '../queue';

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

    // Marcar como FAILED y guardar razón
    await query(
      `UPDATE payout_requests SET status = $1, risk_notes = $2, updated_at = NOW() WHERE id = $3`,
      ['FAILED', reason || 'Rechazado por el administrador', payoutId]
    );

    // Devolver dinero a la billetera del usuario
    const phoneNumber = phone_number;
    await query(
      `INSERT INTO wallets (user_id, real_balance)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE
       SET real_balance = wallets.real_balance + $2`,
      [phoneNumber, amount]
    );

    // Notificar al usuario
    const montoStr = new Intl.NumberFormat('es-AR').format(amount);
    const rejectMsg =
      `❌ *Tu solicitud de retiro fue rechazada*\n\n` +
      `Monto: *$${montoStr}*\n` +
      `Razón: ${reason || 'No especificada'}\n\n` +
      `El dinero fue devuelto a tu billetera. Podés intentar nuevamente después.`;

    await notifyHighQueue.add('send_notification', { to: chatId, text: rejectMsg });

    logger.info({ payoutId, userId: user_id, reason, operatorId }, '[AdminFinanceRoute] Payout rejected');
    res.json({ success: true, message: 'Payout rejected and user notified' });
  } catch (error: any) {
    logger.error({ payoutId, error: error.message }, '[AdminFinanceRoute] Failed to reject payout');
    res.status(500).json({ error: 'Failed to reject payout' });
  }
});

export default router;
