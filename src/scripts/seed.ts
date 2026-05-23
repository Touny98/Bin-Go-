import { query, initDb } from '../db';
import { logger } from '../utils/logger';
import { AdminAuthService } from '../auth/AdminAuthService';

async function seed() {
  logger.info('🌱 Starting BinGo! Database Seeding...');
  
  try {
    // 0. Initialize DB Schema
    logger.info('Initializing DB Schema...');
    await initDb();
    // 1. Seed Rooms
    logger.info('Seeding rooms...');
    const roomSeeds = [
      { id: 1, name: 'Bingo Express ⚡', card_price: 5.00, jackpot_percentage: 0.05 },
      { id: 2, name: 'Mega Sábado 🏆', card_price: 15.00, jackpot_percentage: 0.10 },
      { id: 3, name: 'High Roller Room 🔥', card_price: 50.00, jackpot_percentage: 0.15 },
    ];

    for (const r of roomSeeds) {
      await query(`
        INSERT INTO rooms (id, name, card_price, jackpot_percentage)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (id) DO UPDATE 
        SET name = EXCLUDED.name, card_price = EXCLUDED.card_price, jackpot_percentage = EXCLUDED.jackpot_percentage
      `, [r.id, r.name, r.card_price, r.jackpot_percentage]);
    }

    // 2. Seed Scheduled Game Sessions
    logger.info('Seeding game sessions...');
    const sessionSeeds = [
      { id: 1, room_id: 1, status: 'READY', scheduled_at: new Date(Date.now() + 5 * 60000), pot_amount: 500.00, jackpot_amount: 45000.00 },
      { id: 2, room_id: 2, status: 'CREATED', scheduled_at: new Date(Date.now() + 24 * 3600000), pot_amount: 2500.00, jackpot_amount: 120000.00 },
      { id: 3, room_id: 3, status: 'CREATED', scheduled_at: new Date(Date.now() + 2 * 3600000), pot_amount: 5000.00, jackpot_amount: 250000.00 },
    ];

    for (const s of sessionSeeds) {
      await query(`
        INSERT INTO game_sessions (id, room_id, status, scheduled_at, pot_amount, jackpot_amount)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (id) DO UPDATE
        SET status = EXCLUDED.status, scheduled_at = EXCLUDED.scheduled_at, pot_amount = EXCLUDED.pot_amount, jackpot_amount = EXCLUDED.jackpot_amount
      `, [s.id, s.room_id, s.status, s.scheduled_at, s.pot_amount, s.jackpot_amount]);
    }

    // 3. Seed Dynamic Configs
    logger.info('Seeding dynamic configs...');
    const configs = [
      { key: 'referral_reward_percentage', value: { value: 10 } },
      { key: 'auto_payout_threshold', value: { value: 50.00 } },
      { key: 'whatsapp_welcome_message', value: { value: '¡Hola! Bienvenido a BinGo! 🌟 Envía BINGO para unirte al juego en vivo.' } },
      { key: 'maintenance_mode', value: { value: false } },
    ];

    for (const c of configs) {
      await query(`
        INSERT INTO dynamic_configs (key, value)
        VALUES ($1, $2)
        ON CONFLICT (key) DO UPDATE
        SET value = EXCLUDED.value
      `, [c.key, JSON.stringify(c.value)]);
    }

    // 4. Seed Admin User
    logger.info('Seeding admin user...');
    const defaultPassword = process.env.ADMIN_DEFAULT_PASSWORD || 'BinGo!Admin2024';
    const passwordHash = await AdminAuthService.hashPassword(defaultPassword);
    await query(`
      INSERT INTO admin_users (id, username, password_hash, role, status)
      VALUES (1, 'admin', $1, 'SUPER_ADMIN', 'ACTIVE')
      ON CONFLICT (id) DO UPDATE SET password_hash = EXCLUDED.password_hash
    `, [passwordHash]);
    logger.info({ username: 'admin', password: defaultPassword }, '🔑 Admin credentials (change after first login)');

    logger.info('✅ BinGo! Database Seeding completed successfully!');
    process.exit(0);
  } catch (error) {
    logger.error(error, '❌ BinGo! Database Seeding failed!');
    process.exit(1);
  }
}

seed();
