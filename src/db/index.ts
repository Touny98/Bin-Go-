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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS rooms (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        card_price DECIMAL(10,2) NOT NULL,
        jackpot_percentage DECIMAL(5,2) DEFAULT 0.05,
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
        winner_id INTEGER REFERENCES users(id),
        winner_locked_at TIMESTAMP,
        version INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS cards (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        game_session_id INTEGER REFERENCES game_sessions(id),
        matrix JSONB NOT NULL,
        payment_id VARCHAR(100),
        status VARCHAR(20) DEFAULT 'unpaid',
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
    `);
    console.log('Database schema initialized.');
  } catch (error) {
    console.error('Error initializing db schema:', error);
  } finally {
    client.release();
  }
};
