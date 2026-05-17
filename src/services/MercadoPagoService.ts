import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN || '';

export class MercadoPagoService {
  /**
   * Create a payment preference (checkout link)
   */
  static async createPreference(title: string, quantity: number, unitPrice: number, userId: string, externalReference: string) {
    try {
      const response = await axios({
        method: 'POST',
        url: 'https://api.mercadopago.com/checkout/preferences',
        headers: {
          Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        data: {
          items: [
            {
              title: title,
              description: 'Cartones de Bingo',
              quantity: quantity,
              currency_id: 'ARS',
              unit_price: unitPrice,
            },
          ],
          payer: {
            // we can put user identifier here if needed
          },
          external_reference: externalReference, // very important to match webhook
          back_urls: {
            success: 'https://tusitio.com/success',
            pending: 'https://tusitio.com/pending',
            failure: 'https://tusitio.com/failure',
          },
          auto_return: 'approved',
          notification_url: 'https://tusitio.com/api/payments/webhook', // Should be an env var
        },
      });

      return {
        id: response.data.id,
        init_point: response.data.init_point, // The URL to send to the user
      };
    } catch (error: any) {
      console.error('Error creating MP preference:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Verify payment status from webhook data
   */
  static async getPaymentInfo(paymentId: string) {
    try {
      const response = await axios({
        method: 'GET',
        url: `https://api.mercadopago.com/v1/payments/${paymentId}`,
        headers: {
          Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
        },
      });
      return response.data;
    } catch (error: any) {
      console.error('Error getting MP payment info:', error.response?.data || error.message);
      throw error;
    }
  }
}
