import { BaseHandler, HandlerResponse } from './BaseHandler';
import { UserSession } from '../SessionStore';
import { IntentType } from '../IntentRouter';
import { Templates, formatARS } from '../templates/MessageTemplates';
import { RoomCatalogService } from '../../domain/RoomCatalogService';
import type { ButtonsPayload } from '../../notifications/types/InteractiveMessage';
import { query } from '../../db';

function buildBingoMenuButtons(): Pick<HandlerResponse, 'message' | 'buttons'> {
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
    text: '🎡 *Salas disponibles* — Elegí una sala:',
    buttonLabel: 'Ver salas',
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

function bingoNavFollowUp(): ButtonsPayload {
  return {
    text: '⚙️',
    buttons: [
      { id: 'atras',        label: '⬅️ Volver atrás'    },
      { id: 'bingo_switch', label: '🔄 Cambiar de juego' },
    ],
  };
}

export class RoomBrowserHandler extends BaseHandler {
  public async handle(
    session: UserSession,
    intent: IntentType,
    rawInput: string
  ): Promise<HandlerResponse> {

    const inputLower = rawInput.trim().toLowerCase();

    // Atrás / menú → volver al menú de Bingo
    if (
      intent === 'GOTO_MENU' ||
      inputLower === 'atrás' || inputLower === 'atras' ||
      inputLower === 'volver' || inputLower === 'menu'
    ) {
      return { nextState: 'BINGO_MENU', nextContext: {}, ...buildBingoMenuButtons() };
    }

    // Buscar sala por índice numérico o por nombre (fallback si Meta envía el título)
    const rooms = await RoomCatalogService.getAvailableRooms();
    let selected: any = null;

    const numericIndex = parseInt(rawInput);
    if (!isNaN(numericIndex) && numericIndex > 0) {
      selected = rooms[numericIndex - 1];
      if (!selected) {
        return {
          message: `⚠️ Opción inválida. Elegí una sala de la lista:`,
          list: buildRoomList(rooms),
          followUp: bingoNavFollowUp(),
        };
      }
    }

    if (!selected) {
      selected = rooms.find(r => r.name.trim().toLowerCase() === inputLower);
    }

    if (selected) {
      let existingCardCount = 0;
      const phone = this.getPhone(session);
      const userRes = await query(`SELECT id FROM users WHERE phone_number = $1`, [phone]);
      const userId = userRes.rows[0]?.id;

      if (userId && selected.session_id) {
        const existing = await query(
          `SELECT COUNT(*) as cnt FROM cards WHERE user_id = $1 AND game_session_id = $2 AND status = 'active'`,
          [userId, selected.session_id]
        );
        existingCardCount = parseInt(existing.rows[0]?.cnt) || 0;
      }

      const detailText = Templates.ROOM_DETAIL(selected, existingCardCount);
      const cardPrice = selected.card_price;
      return {
        nextState: 'PURCHASING',
        nextContext: {
          selectedRoomId: selected.session_id,
          price: cardPrice,
          scheduledAt: selected.scheduled_at,
          roomName: selected.name,
          pendingQuantity: null,
          pendingPaymentChoice: null,
        },
        // message === list.text → el Orchestrator no envía texto por separado
        message: detailText,
        list: {
          text: detailText,
          buttonLabel: '🎟️ Elegir cantidad',
          sections: [{
            title: 'Cantidad de cartones',
            rows: [
              { id: '1', title: '1 cartón',   description: `Total: ${formatARS(cardPrice * 1)}` },
              { id: '2', title: '2 cartones', description: `Total: ${formatARS(cardPrice * 2)}` },
              { id: '3', title: '3 cartones', description: `Total: ${formatARS(cardPrice * 3)}` },
              { id: '4', title: '4 cartones', description: `Total: ${formatARS(cardPrice * 4)}` },
              { id: '5', title: '5 cartones', description: `Total: ${formatARS(cardPrice * 5)}` },
            ],
          }],
        },
      };
    }

    // Default: mostrar lista de salas
    return {
      message: Templates.ROOM_LIST(rooms),
      list: buildRoomList(rooms),
      followUp: bingoNavFollowUp(),
    };
  }
}
