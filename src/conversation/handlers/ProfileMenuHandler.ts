import { BaseHandler, HandlerResponse } from './BaseHandler';
import { UserSession } from '../SessionStore';
import { IntentType } from '../IntentRouter';
import { Templates } from '../templates/MessageTemplates';
import { query } from '../../db';

export class ProfileMenuHandler extends BaseHandler {
  public async handle(
    session: UserSession,
    intent: IntentType,
    rawInput: string
  ): Promise<HandlerResponse> {

    const text = rawInput.trim();

    if (text === '0' || intent === 'GOTO_MENU') {
      return { nextState: 'MAIN_MENU', message: Templates.MAIN_MENU() };
    }

    if (text === '1') {
      const phone = session.userId.replace('@c.us', '').replace('@lid', '');
      const walletRes = await query(
        `SELECT COALESCE(real_balance, 0) + COALESCE(bonus_balance, 0) AS balance
         FROM wallets WHERE user_id = $1`,
        [phone]
      );
      const balance = parseFloat(walletRes.rows[0]?.balance || '0');

      if (balance <= 0) {
        return {
          message: `❌ No tenés saldo disponible para retirar.\n\nEscribí *0* para volver al perfil.`
        };
      }

      return {
        nextState: 'WITHDRAWAL',
        nextContext: { withdrawalStep: 'AMOUNT', walletBalance: balance },
        message: Templates.WITHDRAWAL_ASK_AMOUNT(balance)
      };
    }

    if (text === '2') {
      const phone = session.userId.replace('@c.us', '').replace('@lid', '');
      const userRes = await query(`SELECT id FROM users WHERE phone_number = $1`, [phone]);
      const userId = userRes.rows[0]?.id;

      if (!userId) {
        return { message: `❌ No pudimos identificar tu usuario.\n\nEscribí *0* para volver al perfil.` };
      }

      const cardsRes = await query(`
        SELECT c.id, r.name as room_name, gs.scheduled_at, gs.status as session_status
        FROM cards c
        JOIN game_sessions gs ON gs.id = c.game_session_id
        JOIN rooms r ON r.id = gs.room_id
        WHERE c.user_id = $1 AND c.status = 'active'
        ORDER BY gs.scheduled_at ASC
      `, [userId]);

      return {
        message: Templates.MY_ACTIVE_CARDS(cardsRes.rows.map(r => ({
          id: r.id,
          roomName: r.room_name,
          scheduledAt: r.scheduled_at ? new Date(r.scheduled_at) : null,
          sessionStatus: r.session_status
        })))
      };
    }

    // Re-mostrar perfil para cualquier otra entrada
    const phone = session.userId.replace('@c.us', '').replace('@lid', '');
    const profileRes = await query(`
      SELECT
        u.name,
        COALESCE(w.real_balance, 0) + COALESCE(w.bonus_balance, 0) AS balance,
        (SELECT COUNT(*) FROM cards c WHERE c.user_id = u.id AND c.status = 'active') AS active_cards
      FROM users u
      LEFT JOIN wallets w ON w.user_id = $1
      WHERE u.phone_number = $1
    `, [phone]);

    const data = profileRes.rows[0];
    const balance = parseFloat(data?.balance || '0');
    const activeCards = parseInt(data?.active_cards || '0');
    const name = data?.name || null;

    return {
      message: Templates.PROFILE(phone, name, balance, activeCards)
    };
  }
}
