import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN || '';

// MP_MOCK se activa solo cuando el token está ausente o es un placeholder.
// WHATSAPP_MOCK controla únicamente WhatsApp, no pagos.
function isMockToken(paymentId?: string): boolean {
  if (!MP_ACCESS_TOKEN) return true;
  if (MP_ACCESS_TOKEN.includes('placeholder') || MP_ACCESS_TOKEN.includes('your_')) return true;
  if (paymentId?.startsWith('MOCK_')) return true;
  return false;
}

export class MercadoPagoService {
  static async createPreference(
    title: string,
    quantity: number,
    unitPrice: number,
    userId: string,
    externalReference: string
  ) {
    if (isMockToken()) {
      const mockPrefId = `MOCK_PREF_${Date.now()}`;
      return {
        id: mockPrefId,
        init_point: `https://sandbox.mercadopago.com.ar/checkout/v1/redirect?pref_id=${mockPrefId}`,
      };
    }

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
              title,
              description: 'Cartones de Bingo',
              quantity,
              currency_id: 'ARS',
              unit_price: unitPrice,
            },
          ],
          payer: {},
          external_reference: externalReference,
          back_urls: {
            success: process.env.MP_BACK_URL_SUCCESS || 'https://localhost/success',
            pending: process.env.MP_BACK_URL_PENDING || 'https://localhost/pending',
            failure: process.env.MP_BACK_URL_FAILURE || 'https://localhost/failure',
          },
          auto_return: 'approved',
          notification_url: process.env.MP_WEBHOOK_URL || 'https://localhost/api/payments/webhook',
        },
      });

      return {
        id: response.data.id,
        init_point: response.data.init_point,
      };
    } catch (error: any) {
      console.error('Error creating MP preference:', error.response?.data || error.message);
      throw error;
    }
  }

  static async getPaymentInfo(paymentId: string) {
    if (isMockToken(paymentId)) {
      // In mock mode, extract the externalRef from the paymentId that was passed (format: MOCK_RES_...)
      // The test endpoint creates it as: await paymentConfirmationQueue.add('payment.webhook', { paymentId: 'MOCK_' + externalRef })
      // So we need to reverse it: MOCK_RES_... -> RES_...
      const externalRef = paymentId.startsWith('MOCK_') ? paymentId.substring(5) : paymentId;

      return {
        id: paymentId,
        status: 'approved',
        external_reference: externalRef,
        transaction_amount: 10,
      };
    }

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
