import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const query = (text: string, params?: any[]) => pool.query(text, params);

export const getClient = () => pool.connect();

export const initDb = async () => {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        phone_number VARCHAR(20) UNIQUE NOT NULL,
        name VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS rooms (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        card_price DECIMAL(10,2) NOT NULL,
        platform_fee DECIMAL(10,2) NOT NULL DEFAULT 0,
        jackpot_fee DECIMAL(10,2) NOT NULL DEFAULT 0,
        jackpot_percentage DECIMAL(5,2) DEFAULT 0.70,
        game_mode VARCHAR(30) NOT NULL DEFAULT 'SALE_O_SALE',
        max_balls SMALLINT NOT NULL DEFAULT 75,
        tie_rule VARCHAR(20) NOT NULL DEFAULT 'SPLIT',
        accumulated_jackpot DECIMAL(12,2) NOT NULL DEFAULT 0,
        interval_minutes INTEGER DEFAULT NULL,
        daily_times JSONB DEFAULT '[]',
        weekly_day SMALLINT DEFAULT NULL,
        weekly_time VARCHAR(5) DEFAULT NULL,
        is_featured BOOLEAN DEFAULT FALSE,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS game_sessions (
        id SERIAL PRIMARY KEY,
        room_id INTEGER REFERENCES rooms(id),
        status VARCHAR(30) DEFAULT 'CREATED',
        scheduled_at TIMESTAMP,
        drawn_numbers JSONB DEFAULT '[]',
        pot_amount DECIMAL(10,2) DEFAULT 0.00,
        jackpot_amount DECIMAL(10,2) DEFAULT 0.00,
        jackpot_paid DECIMAL(12,2) DEFAULT 0,
        game_mode VARCHAR(30) DEFAULT 'SALE_O_SALE',
        max_balls SMALLINT DEFAULT 75,
        finish_reason VARCHAR(30) DEFAULT NULL,
        rollover_weeks SMALLINT DEFAULT 0,
        winner_id INTEGER REFERENCES users(id),
        winner_locked_at TIMESTAMP,
        version INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Migrations for existing installations (idempotent)
      ALTER TABLE rooms ADD COLUMN IF NOT EXISTS platform_fee DECIMAL(10,2) NOT NULL DEFAULT 0;
      ALTER TABLE rooms ADD COLUMN IF NOT EXISTS jackpot_fee DECIMAL(10,2) NOT NULL DEFAULT 0;
      ALTER TABLE rooms ADD COLUMN IF NOT EXISTS game_mode VARCHAR(30) NOT NULL DEFAULT 'SALE_O_SALE';
      ALTER TABLE rooms ADD COLUMN IF NOT EXISTS max_balls SMALLINT NOT NULL DEFAULT 75;
      ALTER TABLE rooms ADD COLUMN IF NOT EXISTS tie_rule VARCHAR(20) NOT NULL DEFAULT 'SPLIT';
      ALTER TABLE rooms ADD COLUMN IF NOT EXISTS accumulated_jackpot DECIMAL(12,2) NOT NULL DEFAULT 0;
      ALTER TABLE rooms ADD COLUMN IF NOT EXISTS interval_minutes INTEGER DEFAULT NULL;
      ALTER TABLE rooms ADD COLUMN IF NOT EXISTS daily_times JSONB DEFAULT '[]';
      ALTER TABLE rooms ADD COLUMN IF NOT EXISTS weekly_day SMALLINT DEFAULT NULL;
      ALTER TABLE rooms ADD COLUMN IF NOT EXISTS weekly_time VARCHAR(5) DEFAULT NULL;
      ALTER TABLE rooms ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT FALSE;
      ALTER TABLE rooms ADD COLUMN IF NOT EXISTS description TEXT;

      ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS jackpot_paid DECIMAL(12,2) DEFAULT 0;
      ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS game_mode VARCHAR(30) DEFAULT 'SALE_O_SALE';
      ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS max_balls SMALLINT DEFAULT 75;
      ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS finish_reason VARCHAR(30) DEFAULT NULL;
      ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS rollover_weeks SMALLINT DEFAULT 0;
      ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS reminder_sent BOOLEAN DEFAULT FALSE;

      -- Migrations for users table
      ALTER TABLE users ADD COLUMN IF NOT EXISTS name VARCHAR(100);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS whatsapp_jid VARCHAR(60);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name VARCHAR(100);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(200);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS real_phone VARCHAR(30);

      CREATE TABLE IF NOT EXISTS cards (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        game_session_id INTEGER REFERENCES game_sessions(id),
        matrix JSONB NOT NULL,
        payment_id VARCHAR(100),
        status VARCHAR(20) DEFAULT 'unpaid',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS jackpot_audit (
        id SERIAL PRIMARY KEY,
        session_id INTEGER REFERENCES game_sessions(id),
        room_id INTEGER NOT NULL,
        event_type VARCHAR(30) NOT NULL,
        amount DECIMAL(12,2) NOT NULL,
        card_id INTEGER REFERENCES cards(id),
        user_id INTEGER REFERENCES users(id),
        balance_before DECIMAL(12,2),
        balance_after DECIMAL(12,2),
        week_number SMALLINT,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS card_reservations (
        id SERIAL PRIMARY KEY,
        game_id INTEGER REFERENCES game_sessions(id),
        user_id INTEGER REFERENCES users(id),
        card_id INTEGER REFERENCES cards(id),
        status VARCHAR(20) DEFAULT 'RESERVED', -- RESERVED, PAID, EXPIRED, CANCELLED, REFUNDED
        payment_id VARCHAR(100),
        expires_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS transactions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        mp_preference_id VARCHAR(255),
        mp_payment_id VARCHAR(255),
        amount DECIMAL(10,2),
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS game_draws (
        id SERIAL PRIMARY KEY,
        game_id INTEGER REFERENCES game_sessions(id),
        number INTEGER NOT NULL,
        draw_order INTEGER NOT NULL,
        worker_id VARCHAR(100),
        job_id VARCHAR(100),
        processing_time_ms INTEGER,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(game_id, draw_order),
        UNIQUE(game_id, number)
      );

      CREATE TABLE IF NOT EXISTS game_events (
        id SERIAL PRIMARY KEY,
        game_id INTEGER REFERENCES game_sessions(id),
        event_type VARCHAR(50) NOT NULL,
        payload JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS notification_logs (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(50),
        event_type VARCHAR(50),
        provider VARCHAR(50),
        status VARCHAR(20) DEFAULT 'PENDING',
        payload TEXT,
        error_message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS conversation_logs (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(50),
        state_before VARCHAR(30),
        state_after VARCHAR(30),
        intent VARCHAR(30),
        payload JSONB,
        latency_ms INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS game_event_logs (
        id SERIAL PRIMARY KEY,
        game_id INTEGER,
        event_type VARCHAR(50),
        payload JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS leaderboards (
        user_id VARCHAR(50) PRIMARY KEY,
        total_wins INTEGER DEFAULT 0,
        total_jackpot_won DECIMAL(12, 2) DEFAULT 0,
        last_win_at TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS wallets (
        user_id VARCHAR(50) PRIMARY KEY,
        real_balance DECIMAL(12, 2) DEFAULT 0,
        bonus_balance DECIMAL(12, 2) DEFAULT 0,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS referrals (
        id SERIAL PRIMARY KEY,
        referrer_id VARCHAR(50),
        referred_id VARCHAR(50) UNIQUE,
        status VARCHAR(20) DEFAULT 'PENDING',
        reward_paid BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS player_stats (
        user_id VARCHAR(50) PRIMARY KEY,
        xp INTEGER DEFAULT 0,
        level INTEGER DEFAULT 1,
        current_streak INTEGER DEFAULT 0,
        last_play_at TIMESTAMP,
        vip_tier VARCHAR(20) DEFAULT 'BRONZE'
      );

      CREATE TABLE IF NOT EXISTS ledger_entries (
        id SERIAL PRIMARY KEY,
        wallet_id VARCHAR(50),
        entry_type VARCHAR(10),
        category VARCHAR(30),
        amount DECIMAL(12, 2),
        reference_id VARCHAR(100),
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS payout_requests (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR(50),
        amount DECIMAL(12, 2),
        fee_amount DECIMAL(12, 2) DEFAULT 0,
        status VARCHAR(20) DEFAULT 'REQUESTED',
        provider VARCHAR(30),
        provider_tx_id VARCHAR(100),
        destination VARCHAR(200),
        risk_score INTEGER DEFAULT 0,
        risk_notes TEXT,
        idempotency_key VARCHAR(100) UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS admin_users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE,
        password_hash TEXT,
        role VARCHAR(30),
        status VARCHAR(20) DEFAULT 'ACTIVE',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS admin_audit_logs (
        id SERIAL PRIMARY KEY,
        admin_id INTEGER,
        action VARCHAR(100),
        target_type VARCHAR(50),
        target_id VARCHAR(100),
        changes JSONB,
        ip_address VARCHAR(45),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS dynamic_configs (
        key VARCHAR(100) PRIMARY KEY,
        value JSONB,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_jackpot_audit_session ON jackpot_audit(session_id);
      CREATE INDEX IF NOT EXISTS idx_jackpot_audit_room    ON jackpot_audit(room_id);
      CREATE INDEX IF NOT EXISTS idx_game_sessions_room_status ON game_sessions(room_id, status);

      -- ============================================================
      -- Truco Argentino — tablas
      -- ============================================================
      CREATE TABLE IF NOT EXISTS truco_matches (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        player_a_phone VARCHAR(50) NOT NULL,
        player_b_phone VARCHAR(50) NOT NULL,
        bet_amount DECIMAL(12,2) NOT NULL,
        pot_amount DECIMAL(12,2) NOT NULL,
        fee_pct DECIMAL(5,4) NOT NULL,
        fee_amount DECIMAL(12,2),
        status VARCHAR(32) NOT NULL,
        score_a SMALLINT NOT NULL DEFAULT 0,
        score_b SMALLINT NOT NULL DEFAULT 0,
        target_score SMALLINT NOT NULL DEFAULT 15,
        current_hand_id UUID,
        mano_phone VARCHAR(50),
        current_turn_phone VARCHAR(50),
        winner_phone VARCHAR(50),
        abandoned_by_phone VARCHAR(50),
        deck_seed VARCHAR(128) NOT NULL,
        integrity_hash VARCHAR(128) NOT NULL,
        version INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        started_at TIMESTAMP,
        finished_at TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_truco_matches_status ON truco_matches(status);
      CREATE INDEX IF NOT EXISTS idx_truco_matches_player_a ON truco_matches(player_a_phone, finished_at DESC);
      CREATE INDEX IF NOT EXISTS idx_truco_matches_player_b ON truco_matches(player_b_phone, finished_at DESC);

      CREATE TABLE IF NOT EXISTS truco_hands (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        match_id UUID NOT NULL REFERENCES truco_matches(id) ON DELETE CASCADE,
        hand_number SMALLINT NOT NULL,
        mano_phone VARCHAR(50) NOT NULL,
        cards_a JSONB NOT NULL,
        cards_b JSONB NOT NULL,
        baza_winners JSONB NOT NULL DEFAULT '[]'::jsonb,
        envido_state JSONB,
        truco_level SMALLINT NOT NULL DEFAULT 1,
        truco_state JSONB,
        hand_winner_phone VARCHAR(50),
        points_truco SMALLINT,
        points_envido SMALLINT,
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        finished_at TIMESTAMP,
        UNIQUE (match_id, hand_number)
      );
      CREATE INDEX IF NOT EXISTS idx_truco_hands_match ON truco_hands(match_id, hand_number);

      CREATE TABLE IF NOT EXISTS truco_actions (
        id BIGSERIAL PRIMARY KEY,
        match_id UUID NOT NULL REFERENCES truco_matches(id) ON DELETE CASCADE,
        hand_id UUID REFERENCES truco_hands(id) ON DELETE CASCADE,
        user_phone VARCHAR(50) NOT NULL,
        action_type VARCHAR(32) NOT NULL,
        payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        sequence_number INTEGER NOT NULL,
        idempotency_key VARCHAR(128),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (match_id, sequence_number),
        UNIQUE (match_id, idempotency_key)
      );
      CREATE INDEX IF NOT EXISTS idx_truco_actions_match ON truco_actions(match_id, sequence_number);

      CREATE TABLE IF NOT EXISTS truco_queue (
        user_phone VARCHAR(50) PRIMARY KEY,
        bet_amount DECIMAL(12,2) NOT NULL,
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_truco_queue_bet ON truco_queue(bet_amount, joined_at);

      CREATE TABLE IF NOT EXISTS truco_leaderboards (
        user_phone VARCHAR(50) PRIMARY KEY,
        matches_played INTEGER NOT NULL DEFAULT 0,
        matches_won INTEGER NOT NULL DEFAULT 0,
        total_won DECIMAL(12,2) NOT NULL DEFAULT 0,
        current_streak INTEGER NOT NULL DEFAULT 0,
        best_streak INTEGER NOT NULL DEFAULT 0,
        last_match_at TIMESTAMP
      );
    `);
    console.log('Database schema initialized.');
  } catch (error) {
    console.error('Error initializing db schema:', error);
  } finally {
    client.release();
  }
};
