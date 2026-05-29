import { Card, cardTag } from '../../engine/truco/types';

export const formatARS = (n: number) =>
  `$${n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

export const TrucoMsg = {
  // ─── Menú principal Truco ──────────────────────────────────────────
  TRUCO_MAIN_MENU: (_name?: string) =>
    `🃏 *TRUCO ARGENTINO*\n\n` +
    `¿Qué querés hacer?`,

  TRUCO_PROFILE: (name: string | null, balance: number) =>
    `👤 *MI PERFIL*\n\n` +
    `👤 Nombre: ${name || 'No registrado'}\n` +
    `💰 Saldo disponible: ${formatARS(balance)}\n\n` +
    `¿Qué querés hacer?`,

  DEPOSIT_ASK_AMOUNT: (balance: number) =>
    `💳 *CARGAR SALDO*\n\n` +
    `Saldo actual: *${formatARS(balance)}*\n\n` +
    `Ingresá el monto a cargar.\n` +
    `La carga mínima es de *$500*.`,

  DEPOSIT_LINK: (amount: number, url: string) =>
    `💳 *Pago de ${formatARS(amount)}*\n\n` +
    `Hacé click para pagar con Mercado Pago:\n${url}\n\n` +
    `_Una vez confirmado, tu saldo se acredita automáticamente._`,

  DEPOSIT_INVALID_AMOUNT: () =>
    `❌ Monto inválido. Ingresá un número mayor a $500.\nEjemplo: *500*`,

  // ─── Lobby (legacy compat) ─────────────────────────────────────────
  LOBBY_WELCOME: () =>
    `🃏 *TRUCO ARGENTINO*\n\n` +
    `Mesa abierta. Desafiá a otro jugador, mejor de 15 puntos.\n` +
    `El mejor de la ronda se lleva el fondo.\n\n` +
    `¿Con qué valor querés entrar?`,

  LOBBY_AMOUNT_INVALID: () =>
    `❌ No te entendí el monto. Elegí una opción de la lista o tipeá el número.`,

  LOBBY_INSUFFICIENT_BALANCE: (balance: number, needed: number) =>
    `💸 Te falta saldo para esa entrada.\n` +
    `Necesitás ${formatARS(needed)}, tenés ${formatARS(balance)}.\n\n` +
    `Cargá saldo desde el menú de Truco.`,

  QUEUED_WAITING: (tableName: string, bet: number) =>
    `🔍 *Estás en la cola — ${tableName}*\n\n` +
    `Entrada: ${formatARS(bet)} por persona\n` +
    `Fondo: ${formatARS(bet * 2)} → te llevás ${formatARS(bet * 2 * 0.9)}\n\n` +
    `Estamos buscando un rival... Te avisamos cuando aparezca uno.`,

  QUEUE_ALREADY: (tableName: string, bet: number) =>
    `⏳ Ya estás en la cola de ${tableName} (${formatARS(bet)}). Aguantá un poquito 🃏\n\n` +
    `Escribí *menu* si querés salir.`,

  QUEUE_LEFT: () => `🚪 Saliste de la cola de Truco.`,

  // ─── Match found ───────────────────────────────────────────────────
  MATCH_FOUND: (rivalName: string | null, prize: number) =>
    `⚔️ *¡ENCONTRAMOS RIVAL!*\n\n` +
    `🆚 Rival: ${rivalName ?? 'Todavía no registró su nombre'}\n` +
    `🏆 Fondo: ${formatARS(prize)} para el primero\n\n` +
    `Reservando saldo y repartiendo...`,

  BET_LOCKED: () => `💰 Saldo bloqueado. Repartiendo cartas...`,

  // ─── Reparto ───────────────────────────────────────────────────────
  // Cabecera de mano: score + nº de mano. Se envía en mensaje aparte al
  // inicio de cada mano (no en cada turno) para no saturar la pantalla.
  // Una "mano" = las 3 bazas; cada baza la llamamos "ronda" en el resumen.
  ROUND_HEADER: (handNumber: number, scoreYou: number, scoreRival: number) =>
    `🎯 *Mano ${handNumber}*\n` +
    `📊 Vos *${scoreYou}* – Rival *${scoreRival}*`,

  // Resumen del estado de la mano: se envía a ambos al cerrarse cada baza.
  // `outcome` es desde el punto de vista del destinatario.
  BAZA_TALLY: (
    bazaNumber: number,
    outcome: 'you' | 'rival' | 'parda',
    rivalName: string | null,
    youWins: number,
    rivalWins: number
  ) => {
    const ord = bazaNumber === 1 ? '1º' : bazaNumber === 2 ? '2º' : '3º';
    const line =
      outcome === 'parda'
        ? `🤝 ${ord} Ronda: Empardada`
        : outcome === 'you'
        ? `🏆 ${ord} Ronda: Ganaste vos`
        : `🏆 ${ord} Ronda: Ganó ${rivalName ?? 'el rival'}`;
    const r = (n: number) => (n === 1 ? 'ronda' : 'rondas');
    return (
      `📊 *Estado de la mano:*\n\n` +
      `${line}\n\n` +
      `Vos: ${youWins} ${r(youWins)}\n` +
      `Rival: ${rivalWins} ${r(rivalWins)}`
    );
  },

  // Mensaje limpio para el que acaba de jugar: NO reenviamos cartas ni cantos,
  // solo avisamos que el turno pasó al rival. (Ritmo de mesa real.)
  RIVAL_TURN_WAIT: (_rivalName?: string | null) =>
    `⏳ Rival jugando. Espera tu turno`,

  YOUR_CARDS: (cards: Card[]) => {
    const cardLines = cards
      .map((c) => cardTag(c))
      .join('\n');
    return (
      `🃏 *Tus cartas:*\n\n` +
      `${cardLines}\n\n` +
      `Tocá la carta que querés jugar 👇`
    );
  },

  // Igual que YOUR_CARDS pero sin el call-to-action de jugar: lo ve el rival
  // mientras espera (no es su turno, no debe "elegir jugar").
  YOUR_CARDS_WAITING: (cards: Card[]) => {
    const cardLines = cards.map((c) => cardTag(c)).join('\n');
    return `🃏 *Tus cartas:*\n\n${cardLines}`;
  },

  // Encabezado del mensaje aparte de cantos (lista interactiva).
  CANTOS_PROMPT: () => `🗣️ *Cantos disponibles*\n\n¿Querés cantar algo?`,

  YOUR_TURN_HEADER: () => `🎯 *Tu turno.*`,

  WAITING_RIVAL: () =>
    `⏳ *El rival está pensando...*\n` +
    `Aguantá, va a jugar pronto.`,

  // ─── Jugadas ───────────────────────────────────────────────────────
  CARD_PLAYED_BY_YOU: (card: Card) =>
    `✓ Jugaste *${cardTag(card)}*`,

  CARD_PLAYED_BY_RIVAL: (card: Card) =>
    `🃏 *EL RIVAL JUGÓ: ${cardTag(card)}*`,

  // ─── Cantos truco ──────────────────────────────────────────────────
  RIVAL_CALLED_TRUCO: (rivalName: string | null, level: 2 | 3 | 4) => {
    const label = level === 2 ? 'TRUCO' : level === 3 ? 'RETRUCO' : 'VALE 4';
    const emoji = level === 4 ? '🚨' : '🔥';
    return `${emoji} *${rivalName ?? 'El Rival'} CANTÓ ${label}* ${emoji}`;
  },

  YOU_CALLED_TRUCO: (level: 2 | 3 | 4) => {
    const label = level === 2 ? 'TRUCO' : level === 3 ? 'RETRUCO' : 'VALE 4';
    return `🔥 *Cantaste ${label}*. Esperando respuesta...`;
  },

  TRUCO_ACCEPTED: (vale: number) =>
    `✓ Truco aceptado. Vale *${vale}* puntos.`,

  TRUCO_DECLINED: (rivalName: string | null, pointsAwarded: number) =>
    `🚪 ${rivalName ?? 'El Rival'} *no quiso*. Te llevás *${pointsAwarded}* punto${pointsAwarded === 1 ? '' : 's'}.`,

  YOU_DECLINED_TRUCO: (pointsLost: number) =>
    `🏳️ Te quedaste afuera. Perdés *${pointsLost}* punto${pointsLost === 1 ? '' : 's'}.`,

  // ─── Cantos envido ─────────────────────────────────────────────────
  RIVAL_CALLED_ENVIDO: (rivalName: string | null, level: string) =>
    `🎯 *${rivalName ?? 'El Rival'} cantó ${level}* 🎯\n\n¿Qué hacés?`,

  YOU_CALLED_ENVIDO: (level: string) =>
    `🎯 *Cantaste ${level}*. Esperando respuesta del rival...`,

  ENVIDO_ACCEPTED_RESULT: (scoreYou: number, scoreRival: number, youWon: boolean, points: number) =>
    youWon
      ? `🏆 ¡Ganaste el envido! *${scoreYou}* contra *${scoreRival}*. Te llevás *${points}* punto${points === 1 ? '' : 's'}.`
      : `😔 Perdiste el envido: *${scoreYou}* contra *${scoreRival}*. Rival se lleva *${points}* punto${points === 1 ? '' : 's'}.`,

  ENVIDO_DECLINED_WIN: (points: number) =>
    `✓ Rival dijo *son buenas*. Te llevás *${points}* punto${points === 1 ? '' : 's'}.`,

  YOU_DECLINED_ENVIDO: () =>
    `🏳️ *Son buenas*. Perdés 1 punto.`,

  // ─── Mazo ──────────────────────────────────────────────────────────
  YOU_GO_MAZO: (pointsLost: number) =>
    `🃏 Te fuiste al mazo. Perdés *${pointsLost}* punto${pointsLost === 1 ? '' : 's'}.`,

  RIVAL_GO_MAZO: (rivalName: string | null, pointsWon: number) =>
    `🃏 ${rivalName ?? 'El Rival'} *se fue al mazo*. Te llevás *${pointsWon}* punto${pointsWon === 1 ? '' : 's'}.`,

  // ─── Resolución mano y partida ─────────────────────────────────────
  HAND_RESOLVED_WIN: (points: number, scoreYou: number, scoreRival: number) =>
    `🏆 *Ganaste la mano.* +${points}\n` +
    `📊 Score: Vos *${scoreYou}* – Rival *${scoreRival}*\n\n` +
    `Repartiendo la próxima mano...`,

  HAND_RESOLVED_LOSE: (points: number, scoreYou: number, scoreRival: number) =>
    `😔 *Te ganaron la mano.* Rival +${points}\n` +
    `📊 Score: Vos *${scoreYou}* – Rival *${scoreRival}*\n\n` +
    `Repartiendo la próxima mano...`,

  GAME_OVER_WIN: (prize: number, scoreYou: number, scoreRival: number) =>
    `🏆🏆🏆\n` +
    `*¡EL FONDO ES TUYO!*\n` +
    `${scoreYou} – ${scoreRival}\n\n` +
    `💰 *+${formatARS(prize)}* acreditados a tu saldo.\n` +
    `🃏 ¿Otra mano?`,

  GAME_OVER_LOSE: (scoreYou: number, scoreRival: number) =>
    `😔\n` +
    `*Perdiste la partida.*\n` +
    `${scoreYou} – ${scoreRival}\n\n` +
    `Así es el Truco, capo. ¿Revancha?`,

  TURN_TIMEOUT_WARNING: () =>
    `⏰ *¡ATENCIÓN!*\n\n` +
    `Hace 1 minuto que es tu turno. Si no jugás en los próximos *30 segundos*, ` +
    `perdés la partida por abandono.`,

  ABANDONED_OPPONENT_WIN: (rivalName: string | null, prize: number) =>
    `⏰ ${rivalName ?? 'El Rival'} se durmió y se fue.\n` +
    `El fondo es tuyo. *+${formatARS(prize)}* a tu saldo.`,

  ABANDONED_YOU_LOSE: () =>
    `⏰ Te dormiste. Perdiste el match por timeout.\n` +
    `Tu entrada queda con el rival.`,

  // ─── Errores ───────────────────────────────────────────────────────
  ERR_NOT_YOUR_TURN: () => `🚦 No es tu turno, capo. Esperá.`,
  ERR_INVALID_ACTION: () => `❌ Esa jugada no se puede hacer ahora.`,
  ERR_NO_ACTIVE_MATCH: () => `🃏 No tenés partida activa de truco. Volvé al menú.`,
  ERR_UNKNOWN: () => `❓ No te entendí. Probá con los botones.`,
};

/**
 * Enmascara un teléfono para mostrar al rival sin exponer el número completo.
 * Ej: '+5491123456789' → '+549...6789'
 */
export function maskPhone(phone: string): string {
  const cleaned = phone.replace(/[^0-9]/g, '');
  if (cleaned.length < 7) return 'Rival';
  return `${cleaned.substring(0, 4)}...${cleaned.substring(cleaned.length - 4)}`;
}
