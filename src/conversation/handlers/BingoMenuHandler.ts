import { BaseHandler, HandlerResponse } from './BaseHandler';
import { UserSession } from '../SessionStore';
import { IntentType } from '../IntentRouter';
import { Templates, formatARS } from '../templates/MessageTemplates';
import { RoomCatalogService } from '../../domain/RoomCatalogService';
import type { ButtonsPayload } from '../../notifications/types/InteractiveMessage';
import { query } from '../../db';

function buildBingoMenu(): Pick<HandlerResponse, 'message' | 'buttons'> {
  const text = Templates.BINGO_MAIN_MENU();
  return {
    message: text,
    buttons: {
      text,
      buttons: [
        { id: 'bingo_rooms',   label: '🎡 Ver Salas'        },
        { id: 'bingo_profile', label: '👤 Mi Perfil'         },
        { id: 'bingo_switch',  label: '🔄 Cambiar de juego'  },
      ],
      footer: 'TIMBA — tu plataforma de juegos',
    },
  };
}

function buildPlatformMenu(): Pick<HandlerResponse, 'message' | 'buttons'> {
  const text = Templates.MAIN_MENU();
  return {
    message: text,
    buttons: {
      text,
      buttons: [
        { id: 'bingo',      label: '🎡 Bingo' },
        { id: 'play_truco', label: '🃏 Truco'  },
      ],
      footer: 'TIMBA — tu plataforma de juegos',
    },
  };
}

function bingoNavFollowUp(): ButtonsPayload {
  return {
    text: '⚙️',
    buttons: [
      { id: 'atras',        label: '⬅️ Volver atrás'    },
      { id: 'bingo_switch', label: '🔄 Cambiar de juego' },
    ],
  };
}

function formatScheduleDisplay(room: any): string | null {
  if (!room.scheduled_at) return null;

  const date = new Date(room.scheduled_at);
  const tz = 'America/Argentina/Buenos_Aires';

  const timeStr = date.toLocaleTimeString('es-AR', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const dayStr = date.toLocaleDateString('es-AR', {
    timeZone: tz,
    weekday: 'short',
    day: '2-digit',
  });

  return `${dayStr} a las ${timeStr}`;
}

function buildRoomList(rooms: any[]) {
  if (!rooms.length) return undefined;
  return {
    text: '🎡 *Salas Disponibles* — Elegí una para ver los detalles y comprar cartones:',
    buttonLabel: 'Ver salas',
    title: 'Salas Disponibles',
    sections: [{
      title: 'Disponibles ahora',
      rows: rooms.map((r, i) => {
        const jackpot = formatARS(r.total_jackpot ?? r.jackpot_amount ?? 0);
        const price = formatARS(r.card_price);
        const schedule = formatScheduleDisplay(r);
        const desc = r.game_mode === 'ACCUMULATIVE'
          ? `${price} entrada | 🔥 GRAN FONDO ${jackpot}`
          : `${price} entrada | 🏆 Fondo ${jackpot}`;
        const fullDesc = schedule ? `${desc}\n🕐 ${schedule}` : desc;
        return { id: String(i + 1), title: r.name, description: fullDesc };
      }),
    }],
  };
}

export class BingoMenuHandler extends BaseHandler {
  public async handle(
    session: UserSession,
    intent: IntentType,
    rawInput: string
  ): Promise<HandlerResponse> {
    const phone = this.getPhone(session);
    const input = rawInput.trim().toLowerCase();

    // Cambiar de juego / salir / atrás → menú principal de plataforma
    if (
      intent === 'GOTO_MENU' || input === 'menu' || input === 'salir' ||
      input === 'bingo_switch' || input === '4' || input === '0' ||
      input === 'cambiar de juego' || input === 'cambiar' ||
      input === 'atrás' || input === 'atras' || input === 'volver'
    ) {
      return { nextState: 'MAIN_MENU', nextContext: {}, ...buildPlatformMenu() };
    }

    // Ver salas
    if (
      ['bingo_rooms', '1', 'ver salas', 'salas'].includes(input) ||
      intent === 'VIEW_ROOMS' || intent === 'BUY_CARDS'
    ) {
      const rooms = await RoomCatalogService.getAvailableRooms();
      return {
        nextState: 'ROOM_BROWSER',
        list: buildRoomList(rooms),
        followUp: bingoNavFollowUp(),
      };
    }

    // Ver perfil
    if (
      ['bingo_profile', '3', 'perfil', 'mi perfil', 'ver perfil', 'mi cuenta'].includes(input) ||
      intent === 'VIEW_PROFILE'
    ) {
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

      return {
        nextState: 'PROFILE_MENU',
        nextContext: { walletBalance: balance },
        message: profileText,
        buttons: {
          text: profileText,
          buttons: [
            { id: '1', label: '💳 Transferir saldo' },
            { id: '2', label: '🎟️ Mis cartones'    },
          ],
          footer: 'TIMBA 🎡',
        },
        followUp: bingoNavFollowUp(),
      };
    }

    return { nextState: 'BINGO_MENU', nextContext: {}, ...buildBingoMenu() };
  }
}
