function formatDrawTime(date?: Date | null): string | null {
  if (!date) return null;
  return date.toLocaleString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatNextSession(date?: Date | null): string | null {
  if (!date) return null;
  const tz = 'America/Argentina/Buenos_Aires';

  const timeStr = date.toLocaleTimeString('es-AR', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const now = new Date();
  const todayStr = now.toLocaleDateString('es-AR', { timeZone: tz });
  const sessionDateStr = date.toLocaleDateString('es-AR', { timeZone: tz });

  if (todayStr === sessionDateStr) {
    return `hoy a las ${timeStr}`;
  }

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toLocaleDateString('es-AR', { timeZone: tz });
  if (tomorrowStr === sessionDateStr) {
    return `mañana a las ${timeStr}`;
  }

  const dayStr = date.toLocaleDateString('es-AR', {
    timeZone: tz,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  return `el ${dayStr} a las ${timeStr}`;
}

export function formatARS(n: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(n);
}

export const Templates = {
  WELCOME: (data: { name?: string }) =>
    `¡Hola ${data.name || 'Jugador'}! 👋 Bienvenido a *BinGo!* el bingo más grande de WhatsApp.\n\n` +
    `¿Qué querés hacer?\n\n` +
    `1. Ver Salas Disponibles 🎰\n` +
    `2. Comprar Cartones 🎟️\n` +
    `3. Ver mi Perfil 👤\n` +
    `4. Ayuda / Soporte 🛠️`,

  WELCOME_WITH_NAME: (name: string) =>
    `¡Hola ${name}! 👋 Bienvenido a *BinGo!* el bingo más grande de WhatsApp.\n\n` +
    `¿Qué querés hacer?\n\n` +
    `1. Ver Salas Disponibles 🎰\n` +
    `2. Comprar Cartones 🎟️\n` +
    `3. Ver mi Perfil 👤\n` +
    `4. Ayuda / Soporte 🛠️`,

  MAIN_MENU: () =>
    `*MENÚ PRINCIPAL*\n\n` +
    `1. Ver Salas Disponibles 🎰\n` +
    `2. Comprar Cartones 🎟️\n` +
    `3. Ver mi Perfil 👤\n` +
    `4. Ayuda / Soporte 🛠️`,

  UNKNOWN_COMMAND: () =>
    `🤔 No entendí ese comando. Escribí *MENU* para volver al inicio.`,

  ASK_NAME: () =>
    `👋 ¡Hola! Para personalizar tu experiencia, ¿cuál es tu *nombre completo*?\n\n` +
    `_Respondé con tu nombre y apellido._`,

  PROFILE: (phone: string, name: string | null, balance: number, activeCards: number) =>
    `👤 *TU PERFIL*\n\n` +
    `👤 Nombre: ${name || 'No registrado'}\n` +
    `📱 Teléfono: +${phone}\n` +
    `💰 Saldo disponible: ${formatARS(balance)}\n` +
    `🎟️ Cartones activos: ${activeCards}\n\n` +
    `¿Qué querés hacer?\n` +
    `1. Retirar dinero 💳\n` +
    `2. Ver mis cartones 🎟️\n` +
    `0. Volver al menú`,

  WITHDRAWAL_ASK_AMOUNT: (balance: number) =>
    `💳 *RETIRO DE FONDOS*\n\n` +
    `Tenés *${formatARS(balance)}* disponible.\n\n` +
    `¿Cuánto querés retirar? (ingresá solo el número):`,

  WITHDRAWAL_ASK_CBU: (amount: number) =>
    `✅ Monto: *${formatARS(amount)}*\n\n` +
    `¿Cuál es tu *CBU, CVU o alias* de MercadoPago para recibir el dinero?`,

  WITHDRAWAL_CONFIRM: (amount: number, cbu: string) =>
    `📋 *Confirmación de retiro*\n\n` +
    `Monto: *${formatARS(amount)}*\n` +
    `Destino: *${cbu}*\n\n` +
    `¿Confirmás el retiro? Respondé *SI* o *NO*.`,

  WITHDRAWAL_SUCCESS: () =>
    `✅ *¡Solicitud de retiro enviada!*\n\n` +
    `Te avisaremos cuando el dinero sea procesado y acreditado.\n\n` +
    `Escribí *MENU* para volver al inicio.`,

  WITHDRAWAL_INSUFFICIENT: (balance: number) =>
    `❌ El monto supera tu saldo disponible de *${formatARS(balance)}*.\n\n` +
    `Ingresá un monto menor o escribí *NO* para cancelar.`,

  ROOM_LIST: (rooms: any[]) => {
    let msg = `*SALAS DISPONIBLES* 🎰\n\n`;
    rooms.forEach((r, i) => {
      const nextSession = formatNextSession(r.scheduled_at ? new Date(r.scheduled_at) : null);
      const totalJackpot = (r.total_jackpot ?? r.jackpot_amount ?? 0);
      const jackpotStr = formatARS(totalJackpot);

      msg += `${i + 1}. *${r.name}*\n`;
      msg += `   💰 Entrada: ${formatARS(r.card_price)}`;

      if (r.game_mode === 'ACCUMULATIVE') {
        msg += `  |  🔥 *JACKPOT: ${jackpotStr}*`;
        if (r.rollover_weeks > 0) {
          msg += ` _(${r.rollover_weeks} sem. acum.)_`;
        }
      } else {
        msg += `  |  🏆 Pozo: ${jackpotStr}`;
      }
      msg += `\n`;

      if (nextSession) msg += `   🕐 Próxima mesa: ${nextSession}\n`;
      msg += `\n`;
    });
    msg += `Enviá el número de sala para ver más detalles y comprar cartones.`;
    return msg;
  },

  ROOM_DETAIL: (room: any, existingCards = 0) => {
    const totalJackpot = room.total_jackpot ?? room.jackpot_amount ?? 0;
    const isSaleOSale = room.game_mode === 'SALE_O_SALE';
    const isAccumulative = room.game_mode === 'ACCUMULATIVE';

    let msg = `📍 *${room.name}*\n\n`;
    msg += `💰 Entrada: ${formatARS(room.card_price)}\n`;

    if (isAccumulative) {
      msg += `🔥 *JACKPOT ACUMULADO: ${formatARS(totalJackpot)}*\n`;
      if (room.rollover_weeks > 0) {
        msg += `   _(¡Lleva ${room.rollover_weeks} semana${room.rollover_weeks > 1 ? 's' : ''} sin ganador!)_\n`;
      }
    } else {
      msg += `🏆 Pozo: ${formatARS(totalJackpot)}\n`;
    }

    msg += `👥 Jugadores: ${room.players_count}\n`;

    if (isSaleOSale) {
      msg += `\n⚡ *Modalidad Sale o Sale* — Máx. ${room.max_balls} bolillas.\n`;
      msg += `Si nadie canta bingo, gana el jugador con más aciertos.\n`;
    } else if (isAccumulative) {
      msg += `\n🏆 *Jackpot Acumulativo* — El pozo crece semana a semana si nadie gana.\n`;
    }

    const nextSession = formatNextSession(room.scheduled_at ? new Date(room.scheduled_at) : null);
    if (nextSession) {
      msg += `\n🕐 *Próxima mesa: ${nextSession}*\n`;
    }

    if (existingCards > 0) {
      msg += `\n✅ Ya tenés *${existingCards} cartón${existingCards !== 1 ? 'es' : ''}* en esta sala.\n`;
    }

    msg += `\n¿Cuántos cartones querés comprar? (1 a 10)`;
    return msg;
  },

  PURCHASE_CONFIRMATION: (data: { quantity: number; total: number }) =>
    `📝 *Confirmación de Reserva*\n\n` +
    `Vas a comprar *${data.quantity} cartón${data.quantity !== 1 ? 'es' : ''}* ` +
    `por un total de *${formatARS(data.total)}*.\n\n` +
    `¿Confirmás el pedido? (SI / NO)`,

  PAYMENT_LINK: (url: string) =>
    `💳 *¡Genial! Tu reserva está lista.*\n\n` +
    `Pagá de forma segura acá: ${url}\n\n` +
    `_Tenés 15 minutos para completar el pago antes de que expire la reserva._`,

  PURCHASE_DRAW_REMINDER: (data: {
    roomName: string;
    quantity: number;
    scheduledAt?: Date | null;
  }) => {
    const drawTime = formatNextSession(data.scheduledAt);
    let msg = `✅ *¡Compra confirmada!* 🎉\n\n`;
    msg += `Tenés *${data.quantity} cartón${data.quantity !== 1 ? 'es' : ''}* para *${data.roomName}*.\n`;
    if (drawTime) {
      msg += `\n🕐 *Recordá que el sorteo es ${drawTime}.*\n`;
      msg += `¡No te lo pierdas! Recibirás tus cartones en breve.\n`;
    } else {
      msg += `\n¡Buena suerte! Recibirás tus cartones en breve.\n`;
    }
    return msg;
  },

  MY_ACTIVE_CARDS: (cards: Array<{ id: number; roomName: string; scheduledAt: Date | null; sessionStatus: string }>) => {
    if (cards.length === 0) return `🎟️ *MIS CARTONES ACTIVOS*\n\nNo tenés cartones activos en este momento.\n\nEscribí *0* para volver al perfil.`;
    let msg = `🎟️ *MIS CARTONES ACTIVOS* (${cards.length})\n\n`;
    cards.forEach((c, i) => {
      const drawTime = formatDrawTime(c.scheduledAt);
      msg += `${i + 1}. *Cartón #${c.id}* — ${c.roomName}\n`;
      if (drawTime) msg += `   🕐 Sorteo: ${drawTime}\n`;
      msg += `\n`;
    });
    msg += `Escribí *0* para volver al perfil.`;
    return msg;
  },

  SESSION_REMINDER: (data: { roomName: string; scheduledAt: Date | null; cardCount: number }) => {
    const drawTime = formatDrawTime(data.scheduledAt);
    return `🔔 *¡El bingo está por empezar!*\n\n` +
      `La sala *${data.roomName}* arranca en *5 minutos*.\n` +
      `Tenés *${data.cardCount} cartón${data.cardCount !== 1 ? 'es' : ''}* en juego.\n\n` +
      (drawTime ? `🕐 Hora del sorteo: ${drawTime}\n\n` : '') +
      `¡Preparate para ganar! 🎰✨`;
  },
};
