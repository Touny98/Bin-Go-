import { Router } from 'express';
import { whatsappInboundQueue, paymentConfirmationQueue } from '../queue';
import { logger } from '../utils/logger';

const router = Router();

/**
 * Test endpoint to manually trigger WhatsApp inbound message processing
 * POST /test/whatsapp-message
 * Body: { from: "5491234567890", input: "Hola" }
 */
router.post('/whatsapp-message', async (req, res) => {
  try {
    const { from, input } = req.body;

    if (!from || !input) {
      return res.status(400).json({ error: 'from and input are required' });
    }

    logger.info({ from, input }, '[TestRoute] Enqueueing test WhatsApp message');

    // Enqueue the message directly to the inbound queue
    const job = await whatsappInboundQueue.add('inbound_message', { from, input });

    logger.info({ jobId: job.id, from, input }, '[TestRoute] Message enqueued successfully');

    res.json({
      success: true,
      jobId: job.id,
      message: 'WhatsApp inbound message enqueued for processing',
      details: { from, input }
    });
  } catch (error: any) {
    logger.error({ error: error.message }, '[TestRoute] Failed to enqueue test message');
    res.status(500).json({ error: error.message });
  }
});

/**
 * Check queue status
 * GET /test/queue-status
 */
router.get('/queue-status', async (req, res) => {
  try {
    const count = await whatsappInboundQueue.count();
    const waiting = await whatsappInboundQueue.getWaitingCount?.();
    const active = await whatsappInboundQueue.getActiveCount?.();
    const completed = await whatsappInboundQueue.getCompletedCount?.();
    const failed = await whatsappInboundQueue.getFailedCount?.();

    res.json({
      total: count,
      waiting,
      active,
      completed,
      failed
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * DEBUG: Simulate a MercadoPago payment confirmation
 * POST /test/simulate-payment
 * Body: { externalRef: "RES_..." }
 */
router.post('/simulate-payment', async (req, res) => {
  try {
    const { externalRef } = req.body;

    if (!externalRef) {
      return res.status(400).json({ error: 'externalRef is required' });
    }

    logger.info({ externalRef }, '[TestRoute] Simulating payment confirmation');

    // Simulate MercadoPago webhook by enqueueing payment confirmation
    // In real life, MercadoPago would send: { paymentId: "123456" }
    // But we'll simulate it directly by calling the confirmation logic
    const job = await paymentConfirmationQueue.add('payment.webhook', {
      paymentId: 'MOCK_' + externalRef
    });

    res.json({
      success: true,
      jobId: job.id,
      message: 'Payment confirmation queued for processing',
      details: { externalRef }
    });
  } catch (error: any) {
    logger.error({ error: error.message }, '[TestRoute] Failed to simulate payment');
    res.status(500).json({ error: error.message });
  }
});

export default router;
