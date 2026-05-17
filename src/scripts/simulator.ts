import { GameScheduler } from '../orchestrator/GameScheduler';
import { logger } from '../utils/logger';

// Import workers to start them
import '../workers/GameStartWorker';
import '../workers/BallDrawWorker';

async function runSimulation() {
  logger.info("🚀 Starting massive Bingo Simulation");

  const scheduler = new GameScheduler();

  // Create mock players (e.g., 100 players)
  const mockPlayers = Array.from({ length: 100 }, (_, i) => `+5491100000${i.toString().padStart(3, '0')}`);

  logger.info(`Simulating game with ${mockPlayers.length} players...`);

  // Start game: SessionId = 999, RoomId = 1
  await scheduler.forceStartGame(999, 1, mockPlayers);

  logger.info("Simulation initialized. Watch the console for BullMQ worker logs.");
}

runSimulation().catch(e => {
  logger.error(e);
  process.exit(1);
});
