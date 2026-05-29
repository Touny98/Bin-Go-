import { BaseHandler, HandlerResponse } from './BaseHandler';
import { UserSession } from '../SessionStore';
import { IntentType } from '../IntentRouter';
import { Templates } from '../templates/MessageTemplates';
import { query } from '../../db';

export class CollectProfileHandler extends BaseHandler {
  public async handle(
    session: UserSession,
    intent: IntentType,
    rawInput: string
  ): Promise<HandlerResponse> {

    const step = session.context.profileStep ?? 'NAME';
    const phone = this.getPhone(session);

    // ── Paso 1: nombre y apellido ────────────────────────────────────────────
    if (step === 'NAME') {
      const fullName = rawInput.trim();
      const parts = fullName.split(/\s+/).filter(Boolean);

      if (parts.length < 2 || fullName.length < 4 || fullName.length > 120) {
        return {
          message:
            `Por favor ingresá tu *nombre y apellido completo* (ej: Juan Pérez).\n\n` +
            `_Necesitamos al menos nombre y apellido para continuar._`,
        };
      }

      const firstName = parts[0];
      const lastName = parts.slice(1).join(' ');

      await query(
        `UPDATE users SET name = $1, last_name = $2 WHERE phone_number = $3`,
        [firstName, lastName, phone]
      );

      return {
        nextContext: { profileStep: 'EMAIL', profileFirstName: firstName },
        message: Templates.ASK_PROFILE_EMAIL(firstName),
      };
    }

    // ── Paso 2: email ─────────────────────────────────────────────────────────
    if (step === 'EMAIL') {
      const firstName = session.context.profileFirstName ?? 'jugador';
      const emailInput = rawInput.trim().toLowerCase();

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(emailInput)) {
        return {
          message:
            `Ese email no parece válido. Ingresá una dirección correcta.\n\n` +
            `_Ejemplo: juan@gmail.com_`,
        };
      }

      await query(
        `UPDATE users SET email = $1, onboarding_completed = TRUE WHERE phone_number = $2`,
        [emailInput, phone]
      );

      return {
        nextState: 'MAIN_MENU',
        nextContext: { profileStep: null, profileFirstName: null },
        message: Templates.PROFILE_COMPLETE(firstName),
      };
    }

    // Fallback
    return {
      nextState: 'MAIN_MENU',
      nextContext: { profileStep: null },
      message: Templates.MAIN_MENU(),
    };
  }
}
