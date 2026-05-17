import { GameScheduler } from './GameScheduler';
import { RecoveryManager } from './RecoveryManager';
import { logger } from '../utils/logger';

logger.info('Starting Game Orchestrator...');

const scheduler = new GameScheduler();
const recovery = new RecoveryManager();

// Start Recovery Manager polling every 60 seconds
recovery.start(60000);

// Mock force start a game for testing (simulate 2 players)
setTimeout(() => {
  logger.info('[Orchestrator] Simulating game start...');
  scheduler.forceStartGame(1, 101, ['5491112345678', '5491187654321']);
}, 5000);
