import { whatsappOutboundQueue } from '../../queue';
import { logger } from '../../utils/logger';

export class JackpotEffect {
  /**
   * Analyzes if a jackpot increase crosses a psychological threshold and triggers FOMO
   */
  static async analyzePurchase(roomId: number, currentJackpotAmount: number, recentPurchasesCount: number) {
    const HOT_THRESHOLD = 500000; // Example: $500,000 ARS

    if (currentJackpotAmount > HOT_THRESHOLD) {
      logger.info({ roomId, jackpot: currentJackpotAmount }, '[Analytics] Jackpot crossed hot threshold. Evaluating FOMO campaign...');

      // Very simple mock logic: If we have high volume and high jackpot, trigger urgency
      if (recentPurchasesCount > 10) {
        logger.info('[Analytics] Triggering FOMO broadcasts (Jackpot Effect).');
        
        // In reality, we would broadcast to users who haven't bought a ticket today
        // await whatsappOutboundQueue.add('sendNotification', {
        //   to: 'some_user_phone',
        //   text: `🚨 ¡El pozo de la Sala VIP acaba de superar los $${currentJackpotAmount}! 🚨\n\nQuedan pocos cartones para el próximo sorteo. ¿Te lo vas a perder?`
        // });
      }
    }
  }
}
