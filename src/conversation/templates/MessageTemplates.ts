export const Templates = {
  WELCOME: (data: { name?: string }) => 
    `¡Hola ${data.name || 'Jugador'}! 👋 Bienvenido a *BinGo!* el bingo más grande de WhatsApp.\n\n` +
    `¿Qué te gustaría hacer hoy?\n\n` +
    `1. Ver Salas Disponibles 🎰\n` +
    `2. Comprar Cartones 🎟️\n` +
    `3. Ver mi Perfil / Saldo 👤\n` +
    `4. Ayuda / Soporte 🛠️`,

  MAIN_MENU: () => 
    `*MENÚ PRINCIPAL*\n\n` +
    `1. Ver Salas Disponibles 🎰\n` +
    `2. Comprar Cartones 🎟️\n` +
    `3. Ver mi Perfil / Saldo 👤\n` +
    `4. Ayuda / Soporte 🛠️`,

  UNKNOWN_COMMAND: () => 
    `🤔 No entendí ese comando. Escribe *MENU* para volver al inicio.`,

  ROOM_LIST: (rooms: any[]) => {
    let msg = `*SALAS DISPONIBLES* 🎰\n\n`;
    rooms.forEach((r, i) => {
      msg += `${i + 1}. *${r.name}* - Precio: $${r.card_price}\n`;
    });
    msg += `\nEnvía el número de sala para ver más detalles.`;
    return msg;
  },

  PURCHASE_CONFIRMATION: (data: { quantity: number, total: number }) => 
    `📝 *Confirmación de Reserva*\n\n` +
    `Vas a comprar *${data.quantity} cartones* por un total de *$${data.total}*.\n\n` +
    `¿Confirmas el pedido? (SI/NO)`,

  PAYMENT_LINK: (url: string) => 
    `💳 *¡Genial! Tu reserva está lista.*\n\n` +
    `Paga de forma segura aquí: ${url}\n\n` +
    `_Tienes 15 minutos para completar el pago antes de que expire la reserva._`,
};
