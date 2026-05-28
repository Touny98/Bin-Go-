import { BaseHandler, HandlerResponse } from './BaseHandler';
import { UserSession } from '../SessionStore';
import { IntentType } from '../IntentRouter';
import { TrucoMsg, formatARS } from '../templates/TrucoMessages';
import { Templates } from '../templates/MessageTemplates';
import type { ButtonsPayload } from '../../notifications/types/InteractiveMessage';
import { query } from '../../db';
import { logger } from '../../utils/logger';
import { TrucoMatchmakingService } from '../../domain/truco/TrucoMatchmakingService';
import { TrucoSettlementService } from '../../finance/TrucoSettlementService';
import { TrucoGameOrchestrator } from '../../domain/truco/TrucoGameOrchestrator';
import { TrucoNotifier } from './TrucoNotifier';
import { WalletDepositService } from '../../domain/WalletDepositService';

interface TrucoTable {
  id: string;
  bet: number;
  label: string;
}

const TRUCO_TABLES: TrucoTable[] = [
  { id: 'mesa_500',  bet: 5,    label: 'Mesa $5'     },
  { id: 'mesa_1000', bet: 1000, label: 'Mesa $1.000' },
  { id: 'mesa_3000', bet: 3000, label: 'Mesa $3.000' },
];

const FEE_PCT = parseFloat(process.env.TRUCO_FEE_PCT || '') || 0.10;

function buildMainMenu(): Pick<HandlerResponse, 'message' | 'buttons'> {
  const text = TrucoMsg.TRUCO_MAIN_MENU();
  return {
    message: text,
    buttons: {
      text,
      buttons: [
        { id: 'truco_rooms',  label: '🎡 Ver mesas'        },
        { id: 'truco_perfil', label: '👤 Mi perfil'         },
        { id: 'truco_switch', label: '🔄 Cambiar de juego'  },
      ],
      footer: 'TIMBA — tu plataforma de juegos',
    },
  };
}

function buildMainMenuFollowUp(): ButtonsPayload {
  const text = TrucoMsg.TRUCO_MAIN_MENU();
  return {
    text,
    buttons: [
      { id: 'truco_rooms',  label: '🎡 Ver mesas'        },
      { id: 'truco_perfil', label: '👤 Mi perfil'         },
      { id: 'truco_switch', label: '🔄 Cambiar de juego'  },
    ],
    footer: 'TIMBA — tu plataforma de juegos',
  };
}

function buildRoomList(): Pick<HandlerResponse, 'message' | 'list'> {
  const text = `🎡 *MESAS DISPONIBLES*\n\nElegí la mesa que querés jugar:`;
  return {
    message: text,
    list: {
      text,
      buttonLabel: 'Elegir mesa',
      title: 'Mesas de Truco',
      sections: [
        {
          title: 'Disponibles ahora',
          rows: TRUCO_TABLES.map((t) => ({
            id: t.id,
            title: t.label,
            description: `Entrada ${formatARS(t.bet)} | Te llevás ${formatARS(t.bet * 2 * (1 - FEE_PCT))}`,
          })),
        },
      ],
    },
  };
}

function trucoNavFollowUp(): ButtonsPayload {
  return {
    text: '⚙️',
    buttons: [
      { id: 'truco_back',   label: '⬅️ Volver atrás'    },
      { id: 'truco_switch', label: '🔄 Cambiar de juego' },
    ],
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

export class TrucoLobbyHandler extends BaseHandler {
  public async handle(
    session: UserSession,
    intent: IntentType,
    rawInput: string
  ): Promise<HandlerResponse> {
    const phone = this.getPhone(session);
    const input = rawInput.trim().toLowerCase();
    const state = session.state;

    const isBack = input === 'atrás' || input === 'atras' || input === 'volver';
    const isTrucoBack = input === 'truco_back';
    const isSwitch = input === 'truco_switch' || input === '4' || input === 'cambiar de juego';

    // truco_back: volver al menú de Truco desde cualquier sub-estado
    if (isTrucoBack) {
      return this.showMainMenu(phone);
    }

    // ── Salida universal ──────────────────────────────────────────────
    if (intent === 'GOTO_MENU' || intent === 'CANCEL' || input === 'menu' || input === 'salir' || isBack || isSwitch) {
      if (state === 'TRUCO_QUEUED') {
        await TrucoMatchmakingService.dequeue(phone);
        return { nextState: 'MAIN_MENU', nextContext: {}, ...buildPlatformMenu(), message: TrucoMsg.QUEUE_LEFT() };
      }
      // Desde sub-estados de Truco, "atrás" vuelve al menú de Truco (no al de plataforma)
      if (isBack && (state === 'TRUCO_PROFILE' || state === 'TRUCO_DEPOSIT')) {
        return this.showMainMenu(phone);
      }
      return { nextState: 'MAIN_MENU', nextContext: {}, ...buildPlatformMenu() };
    }

    // ── TRUCO_QUEUED: el usuario ya está esperando rival ──────────────
    if (state === 'TRUCO_QUEUED') {
      const bet = session.context?.trucoBetAmount ?? 0;
      const tableName = session.context?.trucoTableName ?? 'mesa';
      return { message: TrucoMsg.QUEUE_ALREADY(tableName, bet) };
    }

    // ── TRUCO_PROFILE: vista de perfil dentro de Truco ────────────────
    if (state === 'TRUCO_PROFILE') {
      // Cargar saldo (movido desde el menú principal)
      if (input === 'truco_saldo' || input === 'cargar saldo') {
        return this.showDepositAmounts(phone);
      }
      // Transferir saldo
      if (input === 'truco_withdraw' || input === 'retirar' || input === '1') {
        const balRes = await query(
          'SELECT COALESCE(real_balance, 0) AS bal FROM wallets WHERE user_id = $1',
          [phone]
        );
        const balance = parseFloat(balRes.rows[0]?.bal || '0');
        if (balance <= 0) {
          return { message: `❌ No tenés saldo disponible para retirar.\n\nEscribí *atrás* para volver.` };
        }
        return {
          nextState: 'WITHDRAWAL',
          nextContext: { withdrawalStep: 'AMOUNT', walletBalance: balance },
          message: `💳 *RETIRO DE FONDOS*\n\nTenés *${formatARS(balance)}* disponible.\n\n¿Cuánto querés retirar? (ingresá solo el número):`,
        };
      }
      // Cualquier otra acción → volver al menú de Truco
      return this.showMainMenu(phone);
    }

    // ── TRUCO_DEPOSIT: el usuario ingresó un monto ───────────────────
    if (state === 'TRUCO_DEPOSIT') {
      return this.handleDepositAmountInput(phone, input);
    }

    // ── TRUCO_LOBBY ───────────────────────────────────────────────────

    // Ver mesas
    if (['truco_rooms', 'mesas', 'ver mesas', '1'].includes(input)) {
      const roomListResponse = buildRoomList();
      return { ...roomListResponse, followUp: trucoNavFollowUp() };
    }

    // Cargar saldo → flujo de depósito
    if (['truco_saldo', 'saldo', 'cargar saldo', '2'].includes(input)) {
      return this.showDepositAmounts(phone);
    }

    // Ver perfil
    if (['truco_perfil', 'perfil', 'ver perfil', '3', 'mi perfil'].includes(input) || intent === 'VIEW_PROFILE') {
      return this.showProfile(phone);
    }

    // Selección de mesa
    const table = parseMesaInput(input);
    if (table) {
      return this.handleTableSelection(phone, table);
    }

    // Default: menú principal de Truco
    return this.showMainMenu(phone);
  }

  // ─────────────────────────────────────────────────────────────────────

  private async showMainMenu(_phone: string): Promise<HandlerResponse> {
    return { nextState: 'TRUCO_LOBBY', nextContext: {}, ...buildMainMenu() };
  }

  private async showProfile(phone: string): Promise<HandlerResponse> {
    const res = await query(
      `SELECT u.name, COALESCE(w.real_balance, 0) AS balance
       FROM users u LEFT JOIN wallets w ON w.user_id = $1
       WHERE u.phone_number = $1`,
      [phone]
    );
    const name: string | null = res.rows[0]?.name ?? null;
    const balance = parseFloat(res.rows[0]?.balance || '0');
    const text = TrucoMsg.TRUCO_PROFILE(name, balance);
    return {
      nextState: 'TRUCO_PROFILE',
      nextContext: {},
      message: text,
      buttons: {
        text,
        buttons: [
          { id: 'truco_saldo',    label: '💳 Cargar saldo'     },
          { id: 'truco_withdraw', label: '💰 Transferir saldo'  },
        ],
        footer: 'TIMBA Truco 🃏',
      },
      followUp: trucoNavFollowUp(),
    };
  }

  private async showDepositAmounts(phone: string): Promise<HandlerResponse> {
    const balRes = await query(
      'SELECT COALESCE(real_balance, 0) AS bal FROM wallets WHERE user_id = $1',
      [phone]
    );
    const balance = parseFloat(balRes.rows[0]?.bal || '0');
    return {
      nextState: 'TRUCO_DEPOSIT',
      nextContext: {},
      message: TrucoMsg.DEPOSIT_ASK_AMOUNT(balance),
      followUp: trucoNavFollowUp(),
    };
  }

  private async handleDepositAmountInput(phone: string, input: string): Promise<HandlerResponse> {
    const n = parseFloat(input.replace(/[$.,]/g, '').trim());
    const amount = !isNaN(n) && n >= 500 ? n : null;

    if (amount === null) {
      return { message: TrucoMsg.DEPOSIT_INVALID_AMOUNT() };
    }

    try {
      const { init_point } = await WalletDepositService.createDepositLink(phone, amount);
      const depositText = TrucoMsg.DEPOSIT_LINK(amount, init_point);
      return {
        nextState: 'TRUCO_LOBBY',
        nextContext: {},
        message: depositText,
        followUp: buildMainMenuFollowUp(),
      };
    } catch (e: any) {
      logger.error({ err: e.message, phone, amount }, '[TrucoLobby] createDepositLink failed');
      return {
        nextState: 'TRUCO_LOBBY',
        nextContext: {},
        message: '❌ No se pudo generar el link de pago. Intentá de nuevo más tarde.',
      };
    }
  }

  private async handleTableSelection(phone: string, table: TrucoTable): Promise<HandlerResponse> {
    // Verificar saldo
    const balRes = await query(
      'SELECT COALESCE(real_balance, 0) AS bal FROM wallets WHERE user_id = $1',
      [phone]
    );
    const balance = parseFloat(balRes.rows[0]?.bal || '0');
    if (balance < table.bet) {
      return { message: TrucoMsg.LOBBY_INSUFFICIENT_BALANCE(balance, table.bet) };
    }

    // Encolar
    await TrucoMatchmakingService.enqueue(phone, table.bet);

    // Intentar match inmediato
    let match;
    try {
      match = await TrucoMatchmakingService.tryMatchForPlayer(phone, FEE_PCT);
    } catch (e: any) {
      logger.error({ err: e.message, phone, bet: table.bet }, '[TrucoLobby] tryMatch failed');
      const queueMsg = TrucoMsg.QUEUED_WAITING(table.label, table.bet);
      return {
        nextState: 'TRUCO_QUEUED',
        nextContext: { trucoBetAmount: table.bet, trucoTableName: table.label },
        message: queueMsg,
        buttons: {
          text: queueMsg,
          buttons: [
            { id: 'menu', label: '❌ Cancelar' },
          ],
        },
      };
    }

    if (!match) {
      const queueMsg = TrucoMsg.QUEUED_WAITING(table.label, table.bet);
      return {
        nextState: 'TRUCO_QUEUED',
        nextContext: { trucoBetAmount: table.bet, trucoTableName: table.label },
        message: queueMsg,
        buttons: {
          text: queueMsg,
          buttons: [
            { id: 'menu', label: '❌ Cancelar' },
          ],
        },
      };
    }

    // ¡Match encontrado! Hold bets → deal → push turn
    await TrucoNotifier.pushMatchFound(match.id);
    try {
      await TrucoSettlementService.holdBets(match.id);
    } catch (e: any) {
      logger.error({ err: e.message, matchId: match.id }, '[TrucoLobby] holdBets failed');
      return {
        nextState: 'MAIN_MENU',
        nextContext: {},
        message: '❌ No se pudo bloquear el saldo. Probá de nuevo.',
      };
    }
    const desc = await TrucoGameOrchestrator.dealNewHand(match.id);
    await TrucoNotifier.pushTurnDescriptor(desc);

    return {
      nextState: 'TRUCO_PLAYING',
      nextContext: { matchId: match.id, resolvedPhone: phone },
    };
  }
}

function parseMesaInput(input: string): TrucoTable | null {
  const fromId = TRUCO_TABLES.find((t) => t.id === input);
  if (fromId) return fromId;
  const n = parseInt(input.replace(/\D/g, ''), 10);
  return TRUCO_TABLES.find((t) => t.bet === n) ?? null;
}
