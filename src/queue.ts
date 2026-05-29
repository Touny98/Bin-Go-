import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

export const connection = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false
});

// Game Flow Queues
export const gameStartQueue = new Queue('game-start-queue', { connection });
export const ballDrawQueue = new Queue('ball-draw-queue', { connection });

// WhatsApp Message Processing
export const whatsappInboundQueue = new Queue('whatsapp-inbound-queue', { connection });
export const whatsappOutboundQueue = new Queue('whatsapp-outbound-queue', { connection });

// Notifications
// Reintentamos los envíos: Meta devuelve errores transitorios (#131000 /
// HTTP 5xx) cada tanto y, sin reintento, un mensaje crítico de juego se pierde
// y traba la partida (ej.: el rival nunca recibe "te cantaron real envido").
const NOTIFY_JOB_OPTS = {
  attempts: 4,
  backoff: { type: 'exponential' as const, delay: 1500 },
  removeOnComplete: 1000,
  removeOnFail: 2000,
};
export const notifyHighQueue = new Queue('notify-high-queue', {
  connection,
  defaultJobOptions: NOTIFY_JOB_OPTS,
});
export const notifyBulkQueue = new Queue('notify-bulk-queue', {
  connection,
  defaultJobOptions: NOTIFY_JOB_OPTS,
});
export const notificationsQueue = new Queue('notifications-queue', { connection });

// Payment/Transactions
export const paymentConfirmationQueue = new Queue('payment-confirmation-queue', { connection });
export const reservationExpireQueue = new Queue('reservation-expire-queue', { connection });
export const fraudQueue = new Queue('fraud-queue', { connection });

// Operations & Finance
export const campaignQueue = new Queue('campaign-queue', { connection });
export const payoutQueue = new Queue('payout-queue', { connection });
export const reconciliationQueue = new Queue('reconciliation-queue', { connection });

// Analytics & Monitoring
export const analyticsQueue = new Queue('analytics-queue', { connection });

// Truco
export const trucoMatchmakingQueue = new Queue('truco-matchmaking-queue', { connection });
export const trucoTurnTimeoutQueue = new Queue('truco-turn-timeout-queue', { connection });
export const trucoPayoutQueue = new Queue('truco-payout-queue', { connection });
