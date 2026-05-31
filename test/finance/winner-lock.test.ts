import { describe, it, expect } from 'vitest';
import { query } from '../../src/db';
import { GameSessionService } from '../../src/domain/GameSessionService';

// WS1 · Tarea 1.4 (parte winner-lock) — Bingo: dos jugadores no pueden ganar el
// mismo pozo. lockWinner usa SELECT ... FOR UPDATE para serializar la carrera.

async function seedSession(): Promise<number> {
  const room = await query(
    `INSERT INTO rooms (name, card_price, platform_fee, jackpot_fee) VALUES ('Test',100,20,80) RETURNING id`
  );
  const sess = await query(
    `INSERT INTO game_sessions (room_id, status) VALUES ($1,'CREATED') RETURNING id`,
    [room.rows[0].id]
  );
  return sess.rows[0].id;
}

async function seedUser(phone: string): Promise<number> {
  const u = await query(`INSERT INTO users (phone_number) VALUES ($1) RETURNING id`, [phone]);
  return u.rows[0].id;
}

describe('GameSessionService.lockWinner', () => {
  it('lockea al ganador en una sesión sin ganador', async () => {
    const sid = await seedSession();
    const uid = await seedUser('5491190000001');

    expect(await GameSessionService.lockWinner(sid, '5491190000001')).toBe(true);

    const r = await query('SELECT winner_id FROM game_sessions WHERE id = $1', [sid]);
    expect(parseInt(r.rows[0].winner_id)).toBe(uid);
  });

  it('un segundo intento (otro jugador) falla: el ganador ya está lockeado', async () => {
    const sid = await seedSession();
    const uid1 = await seedUser('5491190000011');
    await seedUser('5491190000012');

    expect(await GameSessionService.lockWinner(sid, '5491190000011')).toBe(true);
    expect(await GameSessionService.lockWinner(sid, '5491190000012')).toBe(false);

    const r = await query('SELECT winner_id FROM game_sessions WHERE id = $1', [sid]);
    expect(parseInt(r.rows[0].winner_id)).toBe(uid1); // sigue siendo el primero
  });

  it('bajo dos lockWinner concurrentes, gana exactamente UNO', async () => {
    const sid = await seedSession();
    await seedUser('5491190000021');
    await seedUser('5491190000022');

    const results = await Promise.all([
      GameSessionService.lockWinner(sid, '5491190000021'),
      GameSessionService.lockWinner(sid, '5491190000022'),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1); // un solo ganador del pozo
  });
});
