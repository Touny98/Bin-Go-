import { Queue, ConnectionOptions } from 'bullmq';
import { Redis } from 'ioredis';
import dotenv from 'dotenv';
import { Tracer } from '../infra/observability/Tracer';

dotenv.config();

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

// Reusable Redis connection for BullMQ
export const connection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
});

// Core Gameplay Queues
export const gameStartQueue = new Queue('game-start-queue', { connection });
export const ballDrawQueue = new Queue('ball-draw-queue', { connection });
export const whatsappInboundQueue = new Queue('whatsapp-inbound-queue', { connection });

// Auxiliary Queues
export const notifyHighQueue = new Queue('notify-high-queue', { connection });
export const notifyBulkQueue = new Queue('notify-bulk-queue', { connection });
export const paymentConfirmationQueue = new Queue('payment-confirmation-queue', { connection });
export const reservationExpireQueue = new Queue('reservation-expire-queue', { connection });
export const renderQueue = new Queue('render-queue', { connection });
export const mediaCleanupQueue = new Queue('media-cleanup-queue', { connection });
export const campaignQueue = new Queue('campaign-queue', { connection });
export const payoutQueue = new Queue('payout-queue', { connection });
export const reconciliationQueue = new Queue('reconciliation-queue', { connection });
export const fraudQueue = new Queue('fraud-queue', { connection });

console.log('BullMQ queues initialized.');
