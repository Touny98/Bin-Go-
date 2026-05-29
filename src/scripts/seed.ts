import { query, initDb } from '../db';
import { logger } from '../utils/logger';
import { AdminAuthService } from '../auth/AdminAuthService';

async function seed() {
  logger.info('🌱 Starting BinGo! Database Seeding...');

  try {
    await initDb();

    // ─── SALAS ───────────────────────────────────────────────────────────────
    logger.info('Seeding rooms...');
    const roomSeeds = [
      {
        id: 1,
        name: 'Sale o Sale! ⚡',
        description: 'Rápida, dinámica y adictiva. Una partida cada 30 minutos. ¡Siempre hay un ganador!',
        card_price: 5.00,
        platform_fee: 2.00,
        jackpot_fee: 3.00,
        jackpot_percentage: 0.70,
        game_mode: 'SALE_O_SALE',
        max_balls: 45,
        tie_rule: 'SPLIT',
        interval_minutes: 30,
        daily_times: '[]',
        weekly_day: null,
        weekly_time: null,
        is_featured: false,
        accumulated_jackpot: 0,
      },
      {
        id: 2,
        name: 'La Diaria 🎯',
        description: 'Dos sorteos por día: 14:00 y 23:00 hs. Más tensión, más premio.',
        card_price: 1500.00,
        platform_fee: 400.00,
        jackpot_fee: 1100.00,
        jackpot_percentage: 0.733,
        game_mode: 'SALE_O_SALE',
        max_balls: 60,
        tie_rule: 'SPLIT',
        interval_minutes: null,
        daily_times: '["14:00","23:00"]',
        weekly_day: null,
        weekly_time: null,
        is_featured: false,
        accumulated_jackpot: 0,
      },
      {
        id: 3,
        name: 'Domingo Millonario 🏆',
        description: 'El bingo más grande de la semana. Jackpot acumulativo que crece si nadie gana.',
        card_price: 4000.00,
        platform_fee: 1200.00,
        jackpot_fee: 2800.00,
        jackpot_percentage: 0.70,
        game_mode: 'ACCUMULATIVE',
        max_balls: 75,
        tie_rule: 'SPLIT',
        interval_minutes: null,
        daily_times: '[]',
        weekly_day: 0,
        weekly_time: '18:30',
        is_featured: true,
        accumulated_jackpot: 0,
      },
    ];

    for (const r of roomSeeds) {
      await query(`
        INSERT INTO rooms (
          id, name, description, card_price, platform_fee, jackpot_fee,
          jackpot_percentage, game_mode, max_balls, tie_rule,
          interval_minutes, daily_times, weekly_day, weekly_time,
          is_featured, accumulated_jackpot
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14,$15,$16)
        ON CONFLICT (id) DO UPDATE SET
          name               = EXCLUDED.name,
          description        = EXCLUDED.description,
          card_price         = EXCLUDED.card_price,
          platform_fee       = EXCLUDED.platform_fee,
          jackpot_fee        = EXCLUDED.jackpot_fee,
          jackpot_percentage = EXCLUDED.jackpot_percentage,
          game_mode          = EXCLUDED.game_mode,
          max_balls          = EXCLUDED.max_balls,
          tie_rule           = EXCLUDED.tie_rule,
          interval_minutes   = EXCLUDED.interval_minutes,
          daily_times        = EXCLUDED.daily_times,
          weekly_day         = EXCLUDED.weekly_day,
          weekly_time        = EXCLUDED.weekly_time,
          is_featured        = EXCLUDED.is_featured
      `, [
        r.id, r.name, r.description, r.card_price, r.platform_fee, r.jackpot_fee,
        r.jackpot_percentage, r.game_mode, r.max_balls, r.tie_rule,
        r.interval_minutes, r.daily_times, r.weekly_day, r.weekly_time,
        r.is_featured, r.accumulated_jackpot,
      ]);
    }

    // ─── GAME SESSIONS ────────────────────────────────────────────────────────
    // Crear sesiones de juego para que las salas sean visibles inmediatamente
    logger.info('Seeding game sessions...');
    const now = new Date();

    // Sale o Sale - cada 30 minutos
    for (let i = 0; i < 3; i++) {
      const scheduledAt = new Date(now.getTime() + (i + 1) * 30 * 60 * 1000);
      await query(`
        INSERT INTO game_sessions (room_id, status, scheduled_at, game_mode, max_balls)
        VALUES ($1, 'CREATED', $2, 'SALE_O_SALE', 45)
        ON CONFLICT DO NOTHING
      `, [1, scheduledAt]);
    }

    // La Diaria - 14:00 y 23:00
    const diaria1 = new Date(now);
    diaria1.setHours(14, 0, 0, 0);
    if (diaria1 < now) diaria1.setDate(diaria1.getDate() + 1);

    const diaria2 = new Date(now);
    diaria2.setHours(23, 0, 0, 0);
    if (diaria2 < now) diaria2.setDate(diaria2.getDate() + 1);

    await query(`
      INSERT INTO game_sessions (room_id, status, scheduled_at, game_mode, max_balls)
      VALUES ($1, 'CREATED', $2, 'SALE_O_SALE', 60)
      ON CONFLICT DO NOTHING
    `, [2, diaria1]);

    await query(`
      INSERT INTO game_sessions (room_id, status, scheduled_at, game_mode, max_balls)
      VALUES ($1, 'CREATED', $2, 'SALE_O_SALE', 60)
      ON CONFLICT DO NOTHING
    `, [2, diaria2]);

    // Domingo Millonario - próximo domingo a las 18:30
    const domingo = new Date(now);
    const daysUntilSunday = (0 - domingo.getDay() + 7) % 7 || 7;
    domingo.setDate(domingo.getDate() + daysUntilSunday);
    domingo.setHours(18, 30, 0, 0);

    await query(`
      INSERT INTO game_sessions (room_id, status, scheduled_at, game_mode, max_balls)
      VALUES ($1, 'CREATED', $2, 'ACCUMULATIVE', 75)
      ON CONFLICT DO NOTHING
    `, [3, domingo]);

    // ─── DYNAMIC CONFIGS ──────────────────────────────────────────────────────
    logger.info('Seeding dynamic configs...');
    const configs = [
      { key: 'referral_reward_percentage', value: { value: 10 } },
      { key: 'auto_payout_threshold', value: { value: 50.00 } },
      { key: 'whatsapp_welcome_message', value: { value: '¡Hola! Bienvenido a BinGo! 🌟 Envía MENU para ver las salas disponibles.' } },
      { key: 'maintenance_mode', value: { value: false } },
    ];

    for (const c of configs) {
      await query(`
        INSERT INTO dynamic_configs (key, value)
        VALUES ($1, $2)
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
      `, [c.key, JSON.stringify(c.value)]);
    }

    // ─── ADMIN USER ───────────────────────────────────────────────────────────
    logger.info('Seeding admin user...');
    const defaultPassword = process.env.ADMIN_DEFAULT_PASSWORD || 'BinGo!Admin2024';
    const passwordHash = await AdminAuthService.hashPassword(defaultPassword);
    await query(`
      INSERT INTO admin_users (id, username, password_hash, role, status)
      VALUES (1, 'admin', $1, 'SUPER_ADMIN', 'ACTIVE')
      ON CONFLICT (id) DO UPDATE SET password_hash = EXCLUDED.password_hash
    `, [passwordHash]);

    // Reset sequences so auto-increment doesn't collide with seeded explicit IDs
    await query(`SELECT setval('rooms_id_seq', (SELECT MAX(id) FROM rooms))`);
    await query(`SELECT setval('admin_users_id_seq', (SELECT MAX(id) FROM admin_users))`);

    logger.info({ username: 'admin', password: defaultPassword }, '🔑 Admin credentials');
    logger.info('✅ BinGo! Database Seeding completed successfully!');
    process.exit(0);
  } catch (error) {
    logger.error(error, '❌ BinGo! Database Seeding failed!');
    process.exit(1);
  }
}

seed();
