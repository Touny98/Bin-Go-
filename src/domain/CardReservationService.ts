import { query } from '../db';
import { logger } from '../utils/logger';
import { BingoEngine } from '../engine/BingoGame';
import { MercadoPagoService } from '../services/MercadoPagoService';
import { reservationExpireQueue } from '../queue';

export class CardReservationService {
  /**
   * Generates cards, reserves them, and creates a payment preference
   */
  public static async reserveCards(userId: number, gameId: number, quantity: number, pricePerCard: number): Promise<any> {
    logger.info({ userId, gameId, quantity }, `[CardReservationService] Initiating reservation`);

    // 0. Validate Room State
    const sessionCheck = await query('SELECT status FROM game_sessions WHERE id = $1', [gameId]);
    if (sessionCheck.rows.length === 0 || !['CREATED', 'READY'].includes(sessionCheck.rows[0].status)) {
      throw new Error('La sala ya no acepta más compras.');
    }

    // 0.1 Update Progressive Jackpot (e.g. 5% of purchase goes to Jackpot)
    const jackpotContribution = (quantity * pricePerCard) * 0.05;
    await query('UPDATE game_sessions SET jackpot_amount = jackpot_amount + $1 WHERE id = $2', [jackpotContribution, gameId]);
    
    // 1. Generate Cards
      cardsData.push(BingoEngine.generateCard()); // Using deterministic RNG if implemented
    }

    // 2. Insert into DB and reserve
    const reservationIds: number[] = [];
    let externalRef = `RES_${Date.now()}_${userId}_${gameId}`;

    for (const matrix of cardsData) {
      // Create unpaid card
      const cardRes = await query(
        `INSERT INTO cards (user_id, game_session_id, matrix, status) VALUES ($1, $2, $3, 'unpaid') RETURNING id`,
        [userId, gameId, JSON.stringify(matrix)]
      );
      const cardId = cardRes.rows[0].id;

      // Create reservation
      const resResult = await query(
        `INSERT INTO card_reservations (game_id, user_id, card_id, status, expires_at) 
         VALUES ($1, $2, $3, 'RESERVED', NOW() + INTERVAL '15 minutes') RETURNING id`,
        [gameId, userId, cardId]
      );
      reservationIds.push(resResult.rows[0].id);
    }

    // 3. Create MercadoPago Preference
    const mpPref = await MercadoPagoService.createPreference(
      `Cartones Bingo Sala #${gameId}`, 
      quantity, 
      pricePerCard, 
      userId.toString(), 
      externalRef
    );

    // Update reservations with external_ref so we can trace it back
    await query(
      `UPDATE card_reservations SET payment_id = $1 WHERE id = ANY($2::int[])`,
      [externalRef, reservationIds]
    );

    // 4. Schedule Expiration Job (15 minutes = 900000 ms)
    for (const resId of reservationIds) {
      await reservationExpireQueue.add('expireReservation', { reservationId: resId, cardId: null }, { delay: 900000 });
    }

    logger.info({ userId, gameId, externalRef }, `[CardReservationService] Cards reserved successfully`);
    return mpPref;
  }

  /**
   * Called by the Payment Webhook worker.
   */
  public static async confirmPayment(externalRef: string): Promise<boolean> {
    logger.info({ externalRef }, `[CardReservationService] Confirming payment`);
    
    // Find reservations
    const result = await query(
      `SELECT id, card_id, status FROM card_reservations WHERE payment_id = $1`,
      [externalRef]
    );

    if (result.rows.length === 0) return false;

    // Check if already paid (Idempotency)
    const alreadyPaid = result.rows.every(r => r.status === 'PAID');
    if (alreadyPaid) {
      logger.warn({ externalRef }, `[CardReservationService] Idempotency catch: Reservation already PAID`);
      return true;
    }

    const cardIds = result.rows.map(r => r.card_id);
    const resIds = result.rows.map(r => r.id);

    // Update Status atomically
    await query(`UPDATE card_reservations SET status = 'PAID' WHERE id = ANY($1::int[])`, [resIds]);
    await query(`UPDATE cards SET status = 'active' WHERE id = ANY($1::int[])`, [cardIds]);

    logger.info({ externalRef, cards: cardIds.length }, `[CardReservationService] Payment confirmed. Cards activated.`);
    return true;
  }

  /**
   * Called by the Expiration Worker.
   */
  public static async expireReservation(reservationId: number): Promise<void> {
    // Check if it's still reserved
    const res = await query(`SELECT status, card_id FROM card_reservations WHERE id = $1`, [reservationId]);
    if (res.rows.length === 0) return;

    if (res.rows[0].status === 'RESERVED') {
      logger.info({ reservationId }, `[CardReservationService] Expiring reservation`);
      await query(`UPDATE card_reservations SET status = 'EXPIRED' WHERE id = $1`, [reservationId]);
      await query(`UPDATE cards SET status = 'cancelled' WHERE id = $1`, [res.rows[0].card_id]);
    } else {
      logger.debug({ reservationId }, `[CardReservationService] Reservation ${res.rows[0].status}, skipping expiration.`);
    }
  }
}
