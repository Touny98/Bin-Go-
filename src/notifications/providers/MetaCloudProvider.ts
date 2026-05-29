import { WhatsAppProvider } from './WhatsAppProvider';
import type { BingoButton, BingoListSection } from '../types/InteractiveMessage';
import { whatsappInboundQueue, connection } from '../../queue';
import { logger } from '../../utils/logger';

const GRAPH_API_VERSION = 'v19.0';

export class MetaCloudProvider implements WhatsAppProvider {
  private readonly token: string;
  private readonly phoneId: string;
  private readonly apiUrl: string;
  private readonly uploadUrl: string;
  private readonly messageCallbacks: Array<(from: string, body: string) => Promise<void>> = [];

  constructor() {
    this.token     = process.env.WA_TOKEN!;
    this.phoneId   = process.env.WA_PHONE_NUMBER_ID!;
    this.apiUrl    = `https://graph.facebook.com/${GRAPH_API_VERSION}/${this.phoneId}/messages`;
    this.uploadUrl = `https://graph.facebook.com/${GRAPH_API_VERSION}/${this.phoneId}/media`;
  }

  public async initialize(): Promise<void> {
    logger.info('[MetaCloudProvider] Ready — mensajes via Meta Cloud API');
  }

  // ── Inbound ────────────────────────────────────────────────────────────────

  public onMessage(callback: (from: string, body: string) => Promise<void>): void {
    this.messageCallbacks.push(callback);
  }

  /**
   * Llamado por el webhook al recibir un mensaje de Meta.
   *
   * `messageId` es el `message.id` de Meta (wamid…). Lo usamos para dedupear
   * re-entregas del webhook (Meta reintenta si el ACK tarda) de dos formas
   * complementarias: una marca en Redis (`wa:seen:*`) y el `jobId` de BullMQ.
   * Sin esto, una re-entrega se procesaría dos veces y podría re-ejecutar una
   * acción de juego.
   */
  public async handleIncoming(from: string, body: string, messageId?: string): Promise<void> {
    const phone = from.replace(/@.*$/, '');

    // Dedupe de ingreso: la primera vez que vemos este message.id seguimos; si
    // ya lo procesamos (re-entrega de Meta), es no-op. TTL 10 min: cubre la
    // ventana de reintentos de Meta sin acumular claves para siempre.
    if (messageId) {
      const fresh = await connection.set(`wa:seen:${messageId}`, '1', 'PX', 600_000, 'NX');
      if (fresh !== 'OK') {
        logger.info({ from: phone, messageId }, '[MetaCloudProvider] inbound duplicado ignorado');
        return;
      }
    }

    await whatsappInboundQueue.add(
      'inbound_message',
      { from: phone, input: body, messageId },
      {
        // jobId determinista (sin ':' — BullMQ lo usa como separador interno)
        // → dedupe adicional a nivel cola. attempts:1: un fallo del handler NO
        // debe re-ejecutar una acción ya aplicada (processMessage ya captura y
        // responde ante error por su cuenta).
        ...(messageId ? { jobId: `wa-${messageId}` } : {}),
        attempts: 1,
        removeOnComplete: 1000,
        removeOnFail: 1000,
      }
    );

    for (const cb of this.messageCallbacks) {
      try { await cb(phone, body); } catch (e: any) {
        logger.error({ err: e.message }, '[MetaCloudProvider] Error en onMessage callback');
      }
    }
  }

  // ── Outbound ───────────────────────────────────────────────────────────────

  public async sendMessage(to: string, text: string): Promise<boolean> {
    return this.sendText(to, text);
  }

  public async sendText(to: string, text: string): Promise<boolean> {
    return this.post({
      messaging_product: 'whatsapp',
      to: normalize(to),
      type: 'text',
      text: { body: text, preview_url: false },
    });
  }

  /**
   * Sube el buffer de audio a Meta y lo envía como nota de voz.
   * Meta requiere OGG Opus; otros formatos se envían como audio normal.
   */
  public async sendAudio(to: string, buffer: Buffer): Promise<boolean> {
    const mediaId = await this.uploadBuffer(buffer, 'audio/ogg; codecs=opus');
    if (!mediaId) {
      logger.warn('[MetaCloudProvider] Upload de audio fallido');
      return false;
    }

    return this.post({
      messaging_product: 'whatsapp',
      to: normalize(to),
      type: 'audio',
      audio: { id: mediaId },
    });
  }

  public async sendButtons(
    to: string,
    text: string,
    buttons: BingoButton[],
    footer?: string,
  ): Promise<boolean> {
    if (buttons.length > 3) {
      return this.sendList(
        to, text, 'Ver opciones',
        [{ rows: buttons.map(b => ({ id: b.id, title: b.label })) }],
        undefined, footer,
      );
    }

    return this.post({
      messaging_product: 'whatsapp',
      to: normalize(to),
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text },
        ...(footer && { footer: { text: footer } }),
        action: {
          buttons: buttons.map(b => ({
            type: 'reply',
            reply: { id: b.id, title: truncate(b.label, 20) },
          })),
        },
      },
    });
  }

  public async sendList(
    to: string,
    text: string,
    buttonLabel: string,
    sections: BingoListSection[],
    title?: string,
    footer?: string,
  ): Promise<boolean> {
    return this.post({
      messaging_product: 'whatsapp',
      to: normalize(to),
      type: 'interactive',
      interactive: {
        type: 'list',
        ...(title && { header: { type: 'text', text: truncate(title, 60) } }),
        body: { text },
        ...(footer && { footer: { text: footer } }),
        action: {
          button: truncate(buttonLabel, 20),
          sections: sections.map(s => ({
            ...(s.title && { title: s.title }),
            rows: s.rows.map(r => ({
              id: r.id,
              title: truncate(r.title, 24),
              ...(r.description && { description: truncate(r.description, 72) }),
            })),
          })),
        },
      },
    });
  }

  // ── Media upload ───────────────────────────────────────────────────────────

  /** Sube un Buffer a Meta y devuelve el media_id */
  private async uploadBuffer(
    buffer: Buffer,
    mimeType: string,
  ): Promise<string | null> {
    try {
      const form = new FormData();
      form.append('messaging_product', 'whatsapp');
      form.append('type', mimeType);
      const ab = buffer.buffer instanceof SharedArrayBuffer
        ? new Uint8Array(buffer).buffer
        : buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
      form.append('file', new Blob([ab], { type: mimeType }), 'media');

      const res = await fetch(this.uploadUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.token}` },
        body: form,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        logger.error({ status: res.status, err }, '[MetaCloudProvider] Error en upload de media');
        return null;
      }

      const { id } = await res.json() as { id: string };

      logger.info({ mediaId: id }, '[MetaCloudProvider] Media subido OK');
      return id;
    } catch (e: any) {
      logger.error({ err: e.message }, '[MetaCloudProvider] Error de red en upload');
      return null;
    }
  }

  // ── HTTP helper ────────────────────────────────────────────────────────────

  private async post(payload: object): Promise<boolean> {
    try {
      const res = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        logger.error({ status: res.status, err }, '[MetaCloudProvider] Error de API');
        return false;
      }

      return true;
    } catch (e: any) {
      logger.error({ err: e.message }, '[MetaCloudProvider] Error de red');
      return false;
    }
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function normalize(phone: string): string {
  return phone.replace(/@.*$/, '');
}

function truncate(str: string, max: number): string {
  return str.length <= max ? str : str.slice(0, max - 1) + '…';
}

export const metaCloudProvider = new MetaCloudProvider();
