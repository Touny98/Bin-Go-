import { query } from '../db';
import { logger } from '../utils/logger';
import { BingoEngine } from '../engine/BingoGame';
import { MercadoPagoService } from '../services/MercadoPagoService';
import { reservationExpireQueue } from '../queue';
import { WalletEngine } from '../finance/WalletEngine';

export class CardReservationService {
  public static async reserveCards(
    userId: string | number,
    gameId: number,
    quantity: number,
    pricePerCard: number
  ): Promise<any> {
    logger.info({ userId, gameId, quantity }, `[CardReservationService] Initiating reservation`);

    // Resolve internal user ID and phone from JID or legacy number
    let internalUserId: number;
    let phoneStr: string;
    const fullJid = typeof userId === 'string' ? userId : null;

    if (typeof userId === 'string') {
      // JID format: '173650393178254@lid' or '173650393178254@c.us'
      phoneStr = userId.replace(/@c\.us$/, '').replace(/@lid$/, '');
    } else {
      phoneStr = userId.toString();
    }

    const userRes = await query(
      'SELECT id FROM users WHERE phone_number = $1',
      [phoneStr]
    );
    if (userRes.rows.length > 0) {
      internalUserId = userRes.rows[0].id;
      // Update whatsapp_jid if we have a full JID
      if (fullJid) {
        await query('UPDATE users SET whatsapp_jid = $1 WHERE id = $2', [fullJid, internalUserId]);
      }
    } else {
      const insertRes = await query(
        'INSERT INTO users (phone_number, whatsapp_jid) VALUES ($1, $2) RETURNING id',
        [phoneStr, fullJid]
      );
      internalUserId = insertRes.rows[0].id;
    }
    logger.info({ userId: phoneStr, internalUserId }, '[CardReservationService] Resolved userId to DB id');

    // Validate room/session state and fetch fee config
    const sessionCheck = await query(
      `SELECT gs.status, gs.jackpot_amount, gs.room_id,
              r.platform_fee, r.jackpot_fee, r.game_mode
       FROM game_sessions gs
       JOIN rooms r ON r.id = gs.room_id
       WHERE gs.id = $1 AND gs.status IN ('CREATED', 'READY')`,
      [gameId]
    );
    if (
      sessionCheck.rows.length === 0 ||
      !['CREATED', 'READY'].includes(sessionCheck.rows[0].status)
    ) {
      throw new Error('La sala ya no acepta más compras.');
    }

    const { platform_fee, jackpot_fee, room_id, game_mode } = sessionCheck.rows[0];
    const jackpotContribution = quantity * parseFloat(jackpot_fee);
    const platformRevenue = quantity * parseFloat(platform_fee);

    // Generate cards with correct dimensions for the game mode (1-99 pool for all modes)
    const { cols, rows, maxNumber } = BingoEngine.getCardDimensions(game_mode ?? 'SALE_O_SALE');

    // Load existing card matrices for this session to guarantee uniqueness
    const existingRes = await query(
      `SELECT matrix FROM cards WHERE game_session_id = $1 AND status NOT IN ('cancelled')`,
      [gameId]
    );
    const usedMatrices = new Set<string>(
      existingRes.rows.map((r: any) => JSON.stringify(r.matrix))
    );

    const cardsData: any[] = [];
    for (let i = 0; i < quantity; i++) {
      let card: (number | null)[][];
      let attempts = 0;
      do {
        card = BingoEngine.generateSimpleCard(cols, rows, maxNumber);
        attempts++;
      } while (usedMatrices.has(JSON.stringify(card)) && attempts < 200);
      usedMatrices.add(JSON.stringify(card)); // registrar para los siguientes del mismo lote
      cardsData.push(card);
    }

    // Store full JID in externalRef so PaymentConfirmationWorker can reconstruct exact session key
    const externalRef = `RES_${Date.now()}_${fullJid ?? phoneStr}_${gameId}`;
    const reservationIds: number[] = [];
    const insertedCardIds: number[] = [];

    for (const matrix of cardsData) {
      const cardRes = await query(
        `INSERT INTO cards (user_id, game_session_id, matrix, status)
         VALUES ($1, $2, $3, 'unpaid') RETURNING id`,
        [internalUserId, gameId, JSON.stringify(matrix)]
      );
      const cardId = cardRes.rows[0].id;
      insertedCardIds.push(cardId);

      const resResult = await query(
        `INSERT INTO card_reservations (game_id, user_id, card_id, status, expires_at)
         VALUES ($1, $2, $3, 'RESERVED', NOW() + INTERVAL '15 minutes') RETURNING id`,
        [gameId, internalUserId, cardId]
      );
      reservationIds.push(resResult.rows[0].id);
    }

    // Actualizar jackpot de la sesión
    const balanceBefore = parseFloat(sessionCheck.rows[0].jackpot_amount);
    const balanceAfter = balanceBefore + jackpotContribution;

    await query(
      'UPDATE game_sessions SET jackpot_amount = $1 WHERE id = $2',
      [balanceAfter, gameId]
    );

    // Registrar en jackpot_audit (una entrada por cartón)
    const isoWeek = getISOWeek(new Date());
    for (const cardId of insertedCardIds) {
      await query(
        `INSERT INTO jackpot_audit
           (session_id, room_id, event_type, amount, card_id, user_id, balance_before, balance_after, week_number)
         VALUES ($1,$2,'CONTRIBUTION',$3,$4,$5,$6,$7,$8)`,
        [gameId, room_id, parseFloat(jackpot_fee), cardId, internalUserId,
         balanceBefore, balanceAfter, isoWeek]
      );
    }

    // Registrar revenue de plataforma en ledger
    await query(
      `INSERT INTO ledger_entries (wallet_id, entry_type, category, amount, reference_id, metadata)
       VALUES ('platform','CREDIT','FEE',$1,$2,$3)`,
      [platformRevenue, externalRef, JSON.stringify({ userId, gameId, quantity })]
    );

    // Crear preferencia de MercadoPago
    const mpPref = await MercadoPagoService.createPreference(
      `Cartones Bingo Sala #${gameId}`,
      quantity,
      pricePerCard,
      userId.toString(),
      externalRef
    );

    // Vincular externalRef a las reservaciones
    await query(
      `UPDATE card_reservations SET payment_id = $1 WHERE id = ANY($2::int[])`,
      [externalRef, reservationIds]
    );

    // Programar expiración en 15 minutos
    for (const resId of reservationIds) {
      await reservationExpireQueue.add(
        'expireReservation',
        { reservationId: resId, cardId: null },
        { delay: 900000 }
      );
    }

    logger.info(
      { userId, gameId, externalRef, jackpotContribution, platformRevenue },
      `[CardReservationService] Cards reserved successfully`
    );
    return mpPref;
  }

  /**
   * Reserva cartones y los paga instantáneamente usando el saldo de la billetera del usuario.
   * No requiere MercadoPago. Los cartones quedan activos de inmediato.
   */
  public static async reserveAndPayWithWallet(
    userId: string | number,
    gameId: number,
    quantity: number,
    pricePerCard: number
  ): Promise<void> {
    logger.info({ userId, gameId, quantity }, `[CardReservationService] Wallet payment initiated`);

    // Resolver userId interno igual que reserveCards
    let internalUserId: number;
    let phoneStr: string;
    const fullJid = typeof userId === 'string' ? userId : null;
    if (typeof userId === 'string') {
      phoneStr = userId.replace(/@c\.us$/, '').replace(/@lid$/, '');
    } else {
      phoneStr = userId.toString();
    }

    const userRes = await query('SELECT id FROM users WHERE phone_number = $1', [phoneStr]);
    if (userRes.rows.length > 0) {
      internalUserId = userRes.rows[0].id;
      if (fullJid) await query('UPDATE users SET whatsapp_jid = $1 WHERE id = $2', [fullJid, internalUserId]);
    } else {
      const insertRes = await query(
        'INSERT INTO users (phone_number, whatsapp_jid) VALUES ($1, $2) RETURNING id',
        [phoneStr, fullJid]
      );
      internalUserId = insertRes.rows[0].id;
    }

    // Verificar sesión
    const sessionCheck = await query(
      `SELECT gs.status, gs.jackpot_amount, gs.room_id,
              r.platform_fee, r.jackpot_fee, r.game_mode
       FROM game_sessions gs
       JOIN rooms r ON r.id = gs.room_id
       WHERE gs.id = $1 AND gs.status IN ('CREATED', 'READY')`,
      [gameId]
    );
    if (sessionCheck.rows.length === 0) throw new Error('La sala ya no acepta más compras.');

    const { platform_fee, jackpot_fee, room_id, game_mode } = sessionCheck.rows[0];
    const total = quantity * pricePerCard;
    const jackpotContribution = quantity * parseFloat(jackpot_fee);
    const platformRevenue = quantity * parseFloat(platform_fee);

    // Verificar saldo antes de operar (el WalletEngine también lo verifica con FOR UPDATE, pero chequeo temprano)
    const walletRes = await query('SELECT real_balance FROM wallets WHERE user_id = $1', [phoneStr]);
    const balance = parseFloat(walletRes.rows[0]?.real_balance ?? '0');
    if (balance < total) throw new Error(`Saldo insuficiente. Tenés ${balance} y necesitás ${total}.`);

    // Generar cartones únicos
    const { cols, rows, maxNumber } = BingoEngine.getCardDimensions(game_mode ?? 'SALE_O_SALE');
    const existingRes = await query(
      `SELECT matrix FROM cards WHERE game_session_id = $1 AND status NOT IN ('cancelled')`,
      [gameId]
    );
    const usedMatrices = new Set<string>(existingRes.rows.map((r: any) => JSON.stringify(r.matrix)));
    const cardsData: any[] = [];
    for (let i = 0; i < quantity; i++) {
      let card: (number | null)[][];
      let attempts = 0;
      do {
        card = BingoEngine.generateSimpleCard(cols, rows, maxNumber);
        attempts++;
      } while (usedMatrices.has(JSON.stringify(card)) && attempts < 200);
      usedMatrices.add(JSON.stringify(card));
      cardsData.push(card);
    }

    const externalRef = `WALLET_${Date.now()}_${phoneStr}_${gameId}`;
    const insertedCardIds: number[] = [];
    const reservationIds: number[] = [];

    for (const matrix of cardsData) {
      const cardRes = await query(
        `INSERT INTO cards (user_id, game_session_id, matrix, status)
         VALUES ($1, $2, $3, 'active') RETURNING id`,
        [internalUserId, gameId, JSON.stringify(matrix)]
      );
      const cardId = cardRes.rows[0].id;
      insertedCardIds.push(cardId);

      const resResult = await query(
        `INSERT INTO card_reservations (game_id, user_id, card_id, status, payment_id, expires_at)
         VALUES ($1, $2, $3, 'PAID', $4, NOW() + INTERVAL '30 days') RETURNING id`,
        [gameId, internalUserId, cardId, externalRef]
      );
      reservationIds.push(resResult.rows[0].id);
    }

    // Actualizar jackpot
    const balanceBefore = parseFloat(sessionCheck.rows[0].jackpot_amount);
    const balanceAfter = balanceBefore + jackpotContribution;
    await query('UPDATE game_sessions SET jackpot_amount = $1 WHERE id = $2', [balanceAfter, gameId]);

    const isoWeek = getISOWeek(new Date());
    for (const cardId of insertedCardIds) {
      await query(
        `INSERT INTO jackpot_audit
           (session_id, room_id, event_type, amount, card_id, user_id, balance_before, balance_after, week_number)
         VALUES ($1,$2,'CONTRIBUTION',$3,$4,$5,$6,$7,$8)`,
        [gameId, room_id, parseFloat(jackpot_fee), cardId, internalUserId, balanceBefore, balanceAfter, isoWeek]
      );
    }

    // Debitar saldo del usuario (registra entrada CARD_PURCHASE en ledger — es el ingreso real)
    // No se registra FEE por separado: la comisión ya está incluida en el monto total debitado.
    await WalletEngine.debit(phoneStr, total, 'CARD_PURCHASE', externalRef);

    // Registrar FEE como nota contable interna (no es ingreso adicional, es desglose de la comisión)
    await query(
      `INSERT INTO ledger_entries (wallet_id, entry_type, category, amount, reference_id, metadata)
       VALUES ('platform','CREDIT','FEE',$1,$2,$3)`,
      [platformRevenue, externalRef, JSON.stringify({ userId, gameId, quantity, method: 'WALLET', note: 'comision_incluida_en_CARD_PURCHASE' })]
    );

    logger.info({ userId, gameId, externalRef, quantity }, `[CardReservationService] Wallet payment completed, cards activated`);
  }

  public static async confirmPayment(externalRef: string): Promise<boolean> {
    logger.info({ externalRef }, `[CardReservationService] Confirming payment`);

    const result = await query(
      `SELECT id, card_id, status FROM card_reservations WHERE payment_id = $1`,
      [externalRef]
    );
    if (result.rows.length === 0) return false;

    const alreadyPaid = result.rows.every((r: any) => r.status === 'PAID');
    if (alreadyPaid) {
      logger.warn({ externalRef }, `[CardReservationService] Idempotency: ya PAID`);
      return true;
    }

    const cardIds = result.rows.map((r: any) => r.card_id);
    const resIds = result.rows.map((r: any) => r.id);

    await query(
      `UPDATE card_reservations SET status = 'PAID' WHERE id = ANY($1::int[])`,
      [resIds]
    );
    await query(
      `UPDATE cards SET status = 'active' WHERE id = ANY($1::int[])`,
      [cardIds]
    );

    logger.info(
      { externalRef, cards: cardIds.length },
      `[CardReservationService] Payment confirmed. Cards activated.`
    );
    return true;
  }

  /**
   * Expira una reserva sin pagar.
   * Devuelve el whatsapp_jid del usuario para que el worker pueda notificarlo,
   * o null si la reserva ya no estaba en estado RESERVED.
   */
  public static async expireReservation(reservationId: number): Promise<string | null> {
    const res = await query(
      `SELECT cr.status, cr.card_id, cr.user_id
       FROM card_reservations cr
       WHERE cr.id = $1`,
      [reservationId]
    );
    if (res.rows.length === 0) return null;
    if (res.rows[0].status !== 'RESERVED') return null;

    logger.info({ reservationId }, `[CardReservationService] Expiring reservation`);

    await query(
      `UPDATE card_reservations SET status = 'EXPIRED' WHERE id = $1`,
      [reservationId]
    );
    await query(
      `UPDATE cards SET status = 'cancelled' WHERE id = $1`,
      [res.rows[0].card_id]
    );

    // Devolver el JID del usuario para notificación
    const userRes = await query(
      `SELECT COALESCE(whatsapp_jid, phone_number || '@c.us') as chat_id
       FROM users WHERE id = $1`,
      [res.rows[0].user_id]
    );
    return userRes.rows[0]?.chat_id ?? null;
  }
}

function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}
