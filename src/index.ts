import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import basicAuth from 'express-basic-auth';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import client from 'prom-client';

import paymentRoutes from './routes/paymentRoutes';
import { 
  gameStartQueue, ballDrawQueue, whatsappInboundQueue, 
  notifyHighQueue, notifyBulkQueue, paymentConfirmationQueue, 
  reservationExpireQueue, fraudQueue, renderQueue, mediaCleanupQueue,
  campaignQueue, payoutQueue, reconciliationQueue
} from './queue';
import { EventSubscribers } from './notifications/EventSubscribers';
import { whatsAppProvider } from './notifications/providers/WhatsAppWebProvider';
import { SocketServer } from './realtime/SocketServer';
import { RealtimeGateway } from './realtime/RealtimeGateway';
import { ReplayService } from './realtime/ReplayService';
import { AdminRealtimeGateway } from './realtime/AdminRealtimeGateway';
import { MetricsAggregationService } from './services/metrics/MetricsAggregationService';
import { createServer } from 'http';
import adminRoutes from './routes/adminRoutes';
import adminMetricsRoutes from './routes/adminMetrics';
import adminFinanceRoutes from './routes/adminFinance';
import { HealthCheck } from './infra/HealthCheck';
import { WorkerFactory } from './runtime/WorkerFactory';
import { Tracer } from './infra/observability/Tracer';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Tracing Middleware
app.use((req, res, next) => {
  Tracer.runWithTraceId(next, req.header('x-correlation-id'));
});

app.use(cors());
app.use(express.json());

// Health Checks
app.get('/health/liveness', HealthCheck.liveness);
app.get('/health/readiness', HealthCheck.readiness);

// Set up Bull Board for queue monitoring
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

createBullBoard({
  queues: [
    new BullMQAdapter(gameStartQueue),
    new BullMQAdapter(ballDrawQueue),
    new BullMQAdapter(whatsappInboundQueue),
    new BullMQAdapter(renderQueue),
    new BullMQAdapter(mediaCleanupQueue),
    new BullMQAdapter(notifyHighQueue),
    new BullMQAdapter(notifyBulkQueue),
    new BullMQAdapter(paymentConfirmationQueue),
    new BullMQAdapter(reservationExpireQueue),
    new BullMQAdapter(fraudQueue),
    new BullMQAdapter(campaignQueue),
    new BullMQAdapter(payoutQueue),
    new BullMQAdapter(reconciliationQueue)
  ],
  serverAdapter: serverAdapter,
});

app.use(
  '/admin/queues',
  basicAuth({
    users: { admin: process.env.ADMIN_PASSWORD || 'supersecret' },
    challenge: true,
  }),
  serverAdapter.getRouter()
);

// Prometheus metrics endpoint
const collectDefaultMetrics = client.collectDefaultMetrics;
collectDefaultMetrics();

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.send(await client.register.metrics());
});

app.use('/api/payments', paymentRoutes);

// Mock Admin Auth Middleware (For testing Phase 13)
app.use('/api/admin', (req, res, next) => {
  // In a real app, this would verify a JWT and fetch the admin user from DB
  (req as any).admin = { 
    id: 1, 
    username: 'superadmin', 
    role: 'SUPER_ADMIN',
    operatorId: 'admin-1',
    operatorName: 'superadmin'
  };
  next();
});
app.use('/api/admin', adminRoutes);
app.use('/api/admin/metrics', adminMetricsRoutes);
app.use('/api/admin/finance', adminFinanceRoutes);

app.get('/', (req, res) => {
  res.send('Bingo! API is running. WhatsApp is connected via QR.');
});

const httpServer = createServer(app);

// Initialize Realtime Infrastructure
SocketServer.initialize(httpServer);
RealtimeGateway.initialize();
ReplayService.initialize();
AdminRealtimeGateway.initialize();

httpServer.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  
  // Initialize Domain Event Listeners
  EventSubscribers.initialize();

  // Selective Worker Booting
  await WorkerFactory.boot();

  // Initialize Provider
  try {
    await whatsAppProvider.initialize();
  } catch (error) {
    console.error('Failed to initialize WhatsApp Provider:', error);
  }
});

// Graceful Shutdown
const shutdown = async (signal: string) => {
  console.log(`\n${signal} received. Starting graceful shutdown...`);
  
  httpServer.close(async () => {
    console.log('HTTP server closed.');
    
    // Close Redis & DB
    const { connection } = await import('./queue');
    await connection.quit();
    console.log('Redis connection closed.');
    
    process.exit(0);
  });

  // Timeout for shutdown
  setTimeout(() => {
    console.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
