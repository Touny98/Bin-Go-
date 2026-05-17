import { Router, Request, Response } from 'express';
import { paymentConfirmationQueue } from '../queue';

const router = Router();

// Endpoint for MP Webhooks
router.post('/webhook', async (req: Request, res: Response) => {
  try {
    const { type, data } = req.body;

    if (type === 'payment') {
      // Respond to MP immediately to avoid retries/timeouts
      res.sendStatus(200);

      // Enqueue job for background verification
      await paymentConfirmationQueue.add('payment.webhook', {
        paymentId: data.id
      });
      console.log(`[Webhook] Enqueued payment ${data.id} for processing.`);
      return;
    }

    res.sendStatus(200);
  } catch (error) {
    console.error('Error handling payment webhook:', error);
    if (!res.headersSent) {
      res.sendStatus(500);
    }
  }
});

export default router;
