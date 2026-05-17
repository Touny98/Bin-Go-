export interface PayoutResponse {
  success: boolean;
  providerTxId?: string;
  error?: string;
}

export interface IPayoutProvider {
  /**
   * Processes a real payout via an external provider
   */
  process(payoutId: string, userId: string, amount: number, metadata: any): Promise<PayoutResponse>;
}

export class MercadoPagoPayoutProvider implements IPayoutProvider {
  public async process(payoutId: string, userId: string, amount: number, metadata: any): Promise<PayoutResponse> {
    // In a real implementation, we would call MP API here
    // We use payoutId as the Idempotency Key
    console.log(`[MercadoPagoPayoutProvider] Processing payout ${payoutId} for ${amount}...`);
    
    // Simulate API call
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          success: true,
          providerTxId: `mp_tx_${Math.random().toString(36).substring(7)}`
        });
      }, 1000);
    });
  }
}
