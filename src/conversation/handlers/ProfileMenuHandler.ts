import { BaseHandler, HandlerResponse } from './BaseHandler';
import { UserSession } from '../SessionStore';
import { IntentType } from '../IntentRouter';
import { Templates } from '../templates/MessageTemplates';
import { query } from '../../db';
import { buildCardBlock, getNearWinThreshold } from '../../utils/cardFormatter';

function buildProfileList(profileText: string): HandlerResponse['list'] {
  return {
    text: profileText,
    buttonLabel: 'Elegir opción',
    title: 'Mi Perfil 👤',
    footer: 'BinGo! 🎰',
    sections: [{
      title: '¿Qué querés hacer?',
      rows: [
        { id: '1', title: '💳 Retirar dinero',   description: 'Transferí fondos a tu cuenta' },
        { id: '2', title: '🎟️ Ver mis cartones', description: 'Tus cartones activos'         },
      ],
    }],
  };
}

export class ProfileMenuHandler extends BaseHandler {
  public async handle(
    session: UserSession,
    intent: IntentType,
    rawInput: string
  ): Promise<HandlerResponse> {

    const text = rawInput.trim();

    if (text === '0' || text === 'atrás' || text === 'atras' || text === 'volver' || intent === 'GOTO_MENU') {
      const bingoMenuText = Templates.BINGO_MAIN_MENU();
      return {
        nextState: 'BINGO_MENU',
        nextContext: {},
        message: bingoMenuText,
        list: {
          text: bingoMenuText,
          buttonLabel: 'Elegir opción',
          title: 'BinGo! 🎰',
          footer: 'BinGo! — tu plataforma de juegos',
          sections: [{
            title: '¿Qué querés hacer?',
            rows: [
              { id: 'bingo_rooms',   title: '1. Ver Salas Disponibles 🎰',  description: 'Explorá las salas activas y próximas'      },
              { id: 'bingo_buy',     title: '2. Comprar Cartones 🎟️',       description: 'Comprá cartones para la próxima sala'      },
              { id: 'bingo_profile', title: '3. Ver mi Perfil 👤',           description: 'Tu saldo, cartones activos y retiros'      },
              { id: 'bingo_switch',  title: '4. Cambiar de juego 🔄',       description: 'Volver al menú principal de la plataforma' },
            ],
          }],
        },
      };
    }

    if (text === '1') {
      const phone = this.getPhone(session);
      const walletRes = await query(
        `SELECT COALESCE(real_balance, 0) + COALESCE(bonus_balance, 0) AS balance FROM wallets WHERE user_id = $1`,
        [phone]
      );
      const balance = parseFloat(walletRes.rows[0]?.balance || '0');

      if (balance <= 0) {
        return {
          message: `❌ No tenés saldo disponible para retirar.\n\nEscribí *atrás* para volver al perfil.`,
          buttons: {
            text: `❌ No tenés saldo disponible para retirar.`,
            buttons: [{ id: '0', label: '🔙 Volver al perfil' }],
            footer: 'BinGo! 🎰',
          },
        };
      }

      return {
        nextState: 'WITHDRAWAL',
        nextContext: { withdrawalStep: 'AMOUNT', walletBalance: balance },
        message: Templates.WITHDRAWAL_ASK_AMOUNT(balance),
      };
    }

    if (text === '2') {
      const phone = this.getPhone(session);
      const userRes = await query(`SELECT id FROM users WHERE phone_number = $1`, [phone]);
      const userId = userRes.rows[0]?.id;

      if (!userId) return {
        message: `❌ No pudimos identificar tu usuario.\n\nEscribí *0* para volver.`,
        buttons: { text: `❌ No pudimos identificar tu usuario.`, buttons: [{ id: '0', label: '🔙 Volver' }], footer: 'BinGo! 🎰' },
      };

      const cardsRes = await query(`
        SELECT c.id, c.matrix,
               r.name as room_name,
               gs.scheduled_at,
               gs.status as session_status,
               gs.drawn_numbers,
               gs.game_mode,
               gs.max_balls
        FROM cards c
        JOIN game_sessions gs ON gs.id = c.game_session_id
        JOIN rooms r ON r.id = gs.room_id
        WHERE c.user_id = $1 AND c.status = 'active'
        ORDER BY gs.scheduled_at ASC
      `, [userId]);

      if (cardsRes.rows.length === 0) {
        return {
          message: `🎟️ *MIS CARTONES ACTIVOS*\n\nNo tenés cartones activos en este momento.\n\nEscribí *atrás* para volver al perfil.`,
          buttons: {
            text: `🎟️ No tenés cartones activos en este momento.`,
            buttons: [
              { id: 'bingo_rooms', label: '🎰 Comprar cartones' },
              { id: '0',           label: '🔙 Volver al perfil'  },
            ],
            footer: 'BinGo! 🎰',
          },
        };
      }

      let msg = `🎟️ *MIS CARTONES ACTIVOS* (${cardsRes.rows.length})\n\n`;
      for (const row of cardsRes.rows) {
        const scheduledAt = row.scheduled_at ? new Date(row.scheduled_at) : null;
        const drawnNumbers: number[] = Array.isArray(row.drawn_numbers)
          ? row.drawn_numbers : JSON.parse(row.drawn_numbers || '[]');
        const drawnSet = new Set<number>(drawnNumbers);
        const threshold = drawnSet.size > 0
          ? getNearWinThreshold(row.game_mode ?? 'SALE_O_SALE', row.max_balls ?? 75) : 0;
        const matrix: (number | null)[][] = Array.isArray(row.matrix)
          ? row.matrix : JSON.parse(row.matrix || '[]');

        msg += `*Cartón #${row.id}* — ${row.room_name}\n`;
        if (scheduledAt) {
          msg += `🕐 Sorteo: ${scheduledAt.toLocaleString('es-AR', {
            timeZone: 'America/Argentina/Buenos_Aires',
            weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit',
          })}\n`;
        }
        if (row.session_status === 'RUNNING') msg += `🔴 *¡En juego ahora!*\n`;
        msg += `\n${buildCardBlock(matrix, drawnSet, threshold)}\n\n`;
      }
      return {
        message: msg,
        buttons: {
          text: msg,
          buttons: [
            { id: 'bingo_rooms', label: '🎰 Comprar más' },
            { id: '0',           label: '🔙 Volver al perfil' },
          ],
          footer: 'BinGo! 🎰',
        },
      };
    }

    // Re-mostrar perfil
    const phone = this.getPhone(session);
    const profileRes = await query(`
      SELECT u.name,
             COALESCE(w.real_balance, 0) + COALESCE(w.bonus_balance, 0) AS balance,
             (SELECT COUNT(*) FROM cards c WHERE c.user_id = u.id AND c.status = 'active') AS active_cards
      FROM users u LEFT JOIN wallets w ON w.user_id = $1
      WHERE u.phone_number = $1
    `, [phone]);

    const data = profileRes.rows[0];
    const balance = parseFloat(data?.balance || '0');
    const activeCards = parseInt(data?.active_cards || '0');
    const name = data?.name || null;
    const profileText = Templates.PROFILE(phone, name, balance, activeCards);

    return { message: profileText, list: buildProfileList(profileText) };
  }
}
