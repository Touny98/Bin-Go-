import { describe, it, expect } from 'vitest';
import { query } from '../../src/db';
import { WalletDepositService } from '../../src/domain/WalletDepositService';
import { CardReservationService } from '../../src/domain/CardReservationService';

// WS1 · Tarea 1.3 — Webhook de pago idempotente.
// Los webhooks de MercadoPago son "at-least-once": el mismo pago puede llegar
// dos veces. Ningún flujo de dinero debe aplicarse dos veces.

async function realBalance(userId: string): Promise<number> {
  const res = await query('SELECT real_balance FROM wallets WHERE user_id = $1', [userId]);
  return parseFloat(res.rows[0]?.real_balance ?? '0');
}

async function depositLedgerCount(ref: string): Promise<number> {
  const res = await query(
    `SELECT COUNT(*)::int AS n FROM ledger_entries WHERE reference_id = $1 AND category = 'DEPOSIT'`,
    [ref]
  );
  return res.rows[0].n;
}

describe('WalletDepositService.confirmDeposit · idempotencia (anti doble-crédito)', () => {
  const phone = '5491155550000';
  // Formato: DEPOSIT_{timestamp}_{phone}_{cents}
  const ref = `DEPOSIT_1700000000000_${phone}_500000`; // 5000.00

  it('un webhook acredita el saldo una vez', async () => {
    await WalletDepositService.confirmDeposit(ref);
    expect(await realBalance(phone)).toBeCloseTo(5000, 2);
    expect(await depositLedgerCount(ref)).toBe(1);
  });

  it('un webhook DUPLICADO no vuelve a acreditar', async () => {
    await WalletDepositService.confirmDeposit(ref); // primer webhook
    await WalletDepositService.confirmDeposit(ref); // webhook repetido (reintento de MP)

    expect(await realBalance(phone)).toBeCloseTo(5000, 2); // sigue 5000, NO 10000
    expect(await depositLedgerCount(ref)).toBe(1);          // un solo asiento
  });
});

describe('CardReservationService.confirmPayment · idempotencia', () => {
  async function seedReservation(externalRef: string, status = 'RESERVED') {
    const room = await query(
      `INSERT INTO rooms (name, card_price, platform_fee, jackpot_fee) VALUES ('Test',100,20,80) RETURNING id`
    );
    const roomId = room.rows[0].id;
    const sess = await query(
      `INSERT INTO game_sessions (room_id, status) VALUES ($1,'CREATED') RETURNING id`,
      [roomId]
    );
    const sessId = sess.rows[0].id;
    const user = await query(
      `INSERT INTO users (phone_number) VALUES ('5491166660000') RETURNING id`
    );
    const userId = user.rows[0].id;
    const card = await query(
      `INSERT INTO cards (user_id, game_session_id, matrix, status) VALUES ($1,$2,$3,'unpaid') RETURNING id`,
      [userId, sessId, JSON.stringify([[1, 2, 3]])]
    );
    const cardId = card.rows[0].id;
    const res = await query(
      `INSERT INTO card_reservations (game_id, user_id, card_id, status, payment_id)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [sessId, userId, cardId, status, externalRef]
    );
    return { resId: res.rows[0].id, cardId };
  }

  it('marca reserva PAID + cartón activo, y es idempotente ante webhook repetido', async () => {
    const ref = 'RES_1700000000000_5491166660000_1';
    const { resId, cardId } = await seedReservation(ref);

    expect(await CardReservationService.confirmPayment(ref)).toBe(true);
    let r = await query(`SELECT status FROM card_reservations WHERE id=$1`, [resId]);
    let c = await query(`SELECT status FROM cards WHERE id=$1`, [cardId]);
    expect(r.rows[0].status).toBe('PAID');
    expect(c.rows[0].status).toBe('active');

    // Segundo webhook: idempotente, sin cambios ni error.
    expect(await CardReservationService.confirmPayment(ref)).toBe(true);
    r = await query(`SELECT status FROM card_reservations WHERE id=$1`, [resId]);
    expect(r.rows[0].status).toBe('PAID');
  });

  it('devuelve false ante un externalRef desconocido', async () => {
    expect(await CardReservationService.confirmPayment('RES_inexistente_0_0')).toBe(false);
  });
});
