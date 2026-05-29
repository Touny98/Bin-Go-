import { BaseHandler, HandlerResponse } from './BaseHandler';
import { UserSession } from '../SessionStore';
import { IntentType } from '../IntentRouter';
import { Templates } from '../templates/MessageTemplates';
import { TrucoMsg } from '../templates/TrucoMessages';
import { query } from '../../db';

const PLATFORM_MENU_BUTTONS = (): Pick<HandlerResponse, 'message' | 'buttons'> => {
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
};

export class MainMenuHandler extends BaseHandler {
  public async handle(
    session: UserSession,
    intent: IntentType,
    rawInput: string
  ): Promise<HandlerResponse> {

    if (session.state === 'IDLE' || session.state === 'MAIN_MENU') {
      const phone = this.getPhone(session);
      const userCheck = await query(`
        SELECT u.onboarding_completed,
               (
                 (SELECT COUNT(*) FROM cards c
                  JOIN game_sessions gs ON gs.id = c.game_session_id
                  WHERE c.user_id = u.id AND gs.status IN ('COMPLETED', 'FINISHED'))
                 +
                 (SELECT COUNT(*) FROM truco_matches tm
                  WHERE (tm.player_a_phone = u.phone_number OR tm.player_b_phone = u.phone_number)
                  AND tm.status IN ('PAYOUT_DONE', 'GAME_OVER'))
               ) AS finished_games
        FROM users u
        WHERE u.phone_number = $1
      `, [phone]);

      if (userCheck.rows.length > 0) {
        const { onboarding_completed, finished_games } = userCheck.rows[0];
        if (parseInt(finished_games) > 0 && !onboarding_completed) {
          return {
            nextState: 'COLLECTING_PROFILE',
            nextContext: { profileStep: 'NAME' },
            message: Templates.ASK_PROFILE_NAME(),
          };
        }
      }
    }

    switch (intent) {
      case 'PLAY_TRUCO': {
        const text = TrucoMsg.TRUCO_MAIN_MENU();
        return {
          nextState: 'TRUCO_LOBBY',
          nextContext: {},
          message: text,
          buttons: {
            text,
            buttons: [
              { id: 'truco_rooms',  label: '🎡 Ver mesas'         },
              { id: 'truco_perfil', label: '👤 Mi perfil'          },
              { id: 'truco_switch', label: '🔄 Cambiar de juego'   },
            ],
            footer: 'TIMBA — tu plataforma de juegos',
          },
        };
      }

      case 'VIEW_ROOMS':
      case 'BUY_CARDS': {
        const bingoMenuText = Templates.BINGO_MAIN_MENU();
        return {
          nextState: 'BINGO_MENU',
          nextContext: {},
          message: bingoMenuText,
          buttons: {
            text: bingoMenuText,
            buttons: [
              { id: 'bingo_rooms',   label: '🎡 Ver Salas'        },
              { id: 'bingo_profile', label: '👤 Mi Perfil'         },
              { id: 'bingo_switch',  label: '🔄 Cambiar de juego'  },
            ],
            footer: 'TIMBA — tu plataforma de juegos',
          },
        };
      }

      case 'VIEW_PROFILE': {
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
        };
      }

      default:
        return { nextState: 'MAIN_MENU', nextContext: {}, ...PLATFORM_MENU_BUTTONS() };
    }
  }
}
