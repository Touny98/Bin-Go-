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
    `¡Hola ${data.name ? `*${data.name}*` : 'Jugador'}! 👋\n\n` +
    `Bienvenido a *TIMBA* 🎡🃏\n` +
    `La plataforma de juegos de WhatsApp.\n\n` +
    `¿A qué querés jugar?`,

  WELCOME_WITH_NAME: (name: string) =>
    `¡Hola *${name}*! 👋\n\n` +
    `Bienvenido a *TIMBA* 🎡🃏\n` +
    `La plataforma de juegos de WhatsApp.\n\n` +
    `¿A qué querés jugar?`,

  MAIN_MENU: () =>
    `*TIMBA* 🎡🃏\n\n` +
    `¿A qué querés jugar?`,

  BINGO_MAIN_MENU: () =>
    `*MENÚ BINGO* 🎡\n\n` +
    `¿Qué querés hacer?`,

  UNKNOWN_COMMAND: () =>
    `🤔 No entendí ese comando. Escribí *MENU* para volver al inicio.`,

  ASK_NAME: () =>
    `👋 ¡Hola! Para personalizar tu experiencia, ¿cuál es tu *nombre completo*?\n\n` +
    `_Respondé con tu nombre y apellido._`,

  PROFILE: (phone: string, name: string | null, balance: number, activeCards: number) =>
    `👤 *MI PERFIL*\n\n` +
    `👤 Nombre: ${name || 'No registrado'}\n` +
    `💰 Saldo disponible: ${formatARS(balance)}\n` +
    `🎟️ Cartones activos: ${activeCards}\n\n` +
    `¿Qué querés hacer?`,

  WITHDRAWAL_ASK_AMOUNT: (balance: number) =>
    `💳 *TRANSFERENCIA DE SALDO*\n\n` +
    `Tenés *${formatARS(balance)}* disponible.\n\n` +
    `¿Cuánto querés transferir? (ingresá solo el número):`,

  WITHDRAWAL_ASK_CBU: (amount: number) =>
    `✅ Monto: *${formatARS(amount)}*\n\n` +
    `¿Cuál es tu *CBU, CVU o alias* de MercadoPago para recibir la transferencia?`,

  WITHDRAWAL_CONFIRM: (amount: number, cbu: string) =>
    `📋 *Confirmación de transferencia*\n\n` +
    `Monto: *${formatARS(amount)}*\n` +
    `Destino: *${cbu}*\n\n` +
    `¿Confirmás la transferencia? Respondé *SI* o *NO*.`,

  WITHDRAWAL_SUCCESS: () =>
    `✅ *¡Solicitud enviada!*\n\n` +
    `Te avisaremos cuando tu saldo sea procesado y acreditado.\n\n` +
    `Escribí *MENU* para volver al inicio.`,

  WITHDRAWAL_INSUFFICIENT: (balance: number) =>
    `❌ El monto supera tu saldo disponible de *${formatARS(balance)}*.\n\n` +
    `Ingresá un monto menor o escribí *NO* para cancelar.`,

  ROOM_LIST: (rooms: any[]) => {
    let msg = `*SALAS DISPONIBLES* 🎡\n\n`;
    rooms.forEach((r, i) => {
      const nextSession = formatNextSession(r.scheduled_at ? new Date(r.scheduled_at) : null);
      const totalJackpot = (r.total_jackpot ?? r.jackpot_amount ?? 0);
      const jackpotStr = formatARS(totalJackpot);

      msg += `${i + 1}. *${r.name}*\n`;
      msg += `   💰 Entrada: ${formatARS(r.card_price)}`;

      if (r.game_mode === 'ACCUMULATIVE') {
        msg += `  |  🔥 *GRAN FONDO: ${jackpotStr}*`;
        if (r.rollover_weeks > 0) {
          msg += ` _(${r.rollover_weeks} sem. acum.)_`;
        }
      } else {
        msg += `  |  🏆 Fondo: ${jackpotStr}`;
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
      msg += `🔥 *GRAN FONDO ACUMULADO: ${formatARS(totalJackpot)}*\n`;
      if (room.rollover_weeks > 0) {
        msg += `   _(¡Lleva ${room.rollover_weeks} semana${room.rollover_weeks > 1 ? 's' : ''} sin completar!)_\n`;
      }
    } else {
      msg += `🏆 Fondo: ${formatARS(totalJackpot)}\n`;
    }

    msg += `👥 Jugadores: ${room.players_count}\n`;

    if (isSaleOSale) {
      msg += `\n⚡ *Modalidad Sale o Sale* — Máx. ${room.max_balls} bolillas.\n`;
      msg += `Si nadie completa, el jugador con más aciertos se lleva el fondo.\n`;
    } else if (isAccumulative) {
      msg += `\n🏆 *Gran Fondo Acumulativo* — El fondo crece semana a semana.\n`;
    }

    const nextSession = formatNextSession(room.scheduled_at ? new Date(room.scheduled_at) : null);
    if (nextSession) {
      msg += `\n🕐 *Próxima mesa: ${nextSession}*\n`;
    }

    if (existingCards > 0) {
      msg += `\n✅ Ya tenés *${existingCards} cartón${existingCards !== 1 ? 'es' : ''}* en esta sala.\n`;
    }

    msg += `\n¿Cuántos cartones querés comprar?`;
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

  PAYMENT_METHOD_CHOICE: (data: { total: number; walletBalance: number }) =>
    `💰 *Elegí cómo pagar*\n\n` +
    `Total: *${formatARS(data.total)}*\n` +
    `Tu saldo disponible: *${formatARS(data.walletBalance)}*\n\n` +
    `¿Con qué querés pagar?`,

  WALLET_PAYMENT_SUCCESS: (data: { quantity: number; total: number; roomName: string; newBalance: number }) =>
    `✅ *¡Cartones comprados!* 🎉\n\n` +
    `Compraste *${data.quantity} cartón${data.quantity !== 1 ? 'es' : ''}* para *${data.roomName}*.\n` +
    `Total descontado: *${formatARS(data.total)}*\n` +
    `Saldo restante: *${formatARS(data.newBalance)}*\n\n` +
    `¡Tus cartones ya están activos! 🎡\n\n` +
    `Escribí *MENU* para volver al inicio.`,

  PURCHASE_DRAW_REMINDER: (data: {
    roomName: string;
    quantity: number;
    scheduledAt?: Date | null;
  }) => {
    const drawTime = formatNextSession(data.scheduledAt);
    let msg = `✅ *¡Compra confirmada!* 🎉\n\n`;
    msg += `Tenés *${data.quantity} cartón${data.quantity !== 1 ? 'es' : ''}* para *${data.roomName}*.\n`;
    if (drawTime) {
      msg += `\n🕐 *Recordá que el evento es ${drawTime}.*\n`;
      msg += `¡No te lo pierdas! Recibirás tus cartones en breve.\n`;
    } else {
      msg += `\n¡Mucho ánimo! Recibirás tus cartones en breve.\n`;
    }
    return msg;
  },

  MY_ACTIVE_CARDS: (cards: Array<{ id: number; roomName: string; scheduledAt: Date | null; sessionStatus: string }>) => {
    if (cards.length === 0) return `🎟️ *MIS CARTONES ACTIVOS*\n\nNo tenés cartones activos en este momento.`;
    let msg = `🎟️ *MIS CARTONES ACTIVOS* (${cards.length})\n\n`;
    cards.forEach((c, i) => {
      const drawTime = formatDrawTime(c.scheduledAt);
      msg += `${i + 1}. *Cartón #${c.id}* — ${c.roomName}\n`;
      if (drawTime) msg += `   🕐 Evento: ${drawTime}\n`;
      msg += `\n`;
    });
    return msg;
  },

  RESERVATION_EXPIRED: () =>
    `⏰ *Tu reserva expiró*\n\n` +
    `Los 15 minutos para completar el pago vencieron y los cartones fueron liberados.\n\n` +
    `Podés volver a comprar cuando quieras.\n` +
    `Escribí *1* para ver las salas disponibles o *MENU* para volver al inicio.`,

  ASK_PROFILE_NAME: () =>
    `📋 *Completá tu registro*\n\n` +
    `Para poder usar la plataforma necesitamos tus datos de contacto.\n\n` +
    `¿Cuál es tu *nombre y apellido*?\n\n` +
    `_Ejemplo: Juan Pérez_`,

  ASK_PROFILE_PHONE: (firstName: string) =>
    `📱 *Un dato más, ${firstName}.*\n\n` +
    `¿Cuál es tu *número de WhatsApp*?\n\n` +
    `_Escribí solo los números, sin el 15 ni el código de país._\n` +
    `_Ejemplo: 1162345678_`,

  ASK_PROFILE_EMAIL: (firstName: string) =>
    `¡Perfecto, ${firstName}! 📧\n\n` +
    `Último paso: ¿cuál es tu *dirección de email*?\n\n` +
    `_Ejemplo: juan@gmail.com_`,

  PROFILE_COMPLETE: (firstName: string) =>
    `✅ *¡Registro completo, ${firstName}!*\n\n` +
    `Tus datos quedaron guardados. Podés actualizarlos en cualquier momento ` +
    `escribiendo *3* → *Mi Perfil*.\n\n` +
    `¡Mucho ánimo en el próximo evento! 🎡`,

  SESSION_REMINDER: (data: { roomName: string; scheduledAt: Date | null; cardCount: number }) => {
    const drawTime = formatDrawTime(data.scheduledAt);
    return `🔔 *¡El evento está por empezar!*\n\n` +
      `La sala *${data.roomName}* arranca en *5 minutos*.\n` +
      `Tenés *${data.cardCount} cartón${data.cardCount !== 1 ? 'es' : ''}* en la ronda.\n\n` +
      (drawTime ? `🕐 Hora del evento: ${drawTime}\n\n` : '') +
      `¡Preparate para brillar! 🎡✨`;
  },
};
