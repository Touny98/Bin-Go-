import { WhatsAppProvider } from './WhatsAppProvider';
import type { BingoButton, BingoListSection } from '../types/InteractiveMessage';
import { whatsappInboundQueue } from '../../queue';
import { logger } from '../../utils/logger';

const GRAPH_API_VERSION = 'v19.0';

export class MetaCloudProvider implements WhatsAppProvider {
  private readonly apiUrl: string;
  private readonly token: string;
  private readonly messageCallbacks: Array<(from: string, body: string) => Promise<void>> = [];

  constructor() {
    this.token         = process.env.WA_TOKEN!;
    const phoneId      = process.env.WA_PHONE_NUMBER_ID!;
    this.apiUrl        = `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneId}/messages`;
  }

  public async initialize(): Promise<void> {
    logger.info('[MetaCloudProvider] Ready — mensajes via Meta Cloud API');
  }

  // ── Inbound ────────────────────────────────────────────────────────────────

  public onMessage(callback: (from: string, body: string) => Promise<void>): void {
    this.messageCallbacks.push(callback);
  }

  /** Llamado por el webhook al recibir un mensaje de Meta */
  public async handleIncoming(from: string, body: string): Promise<void> {
    // Normalizar número: sacar @s.whatsapp.net si viene con sufijo
    const phone = from.replace(/@.*$/, '');

    await whatsappInboundQueue.add('inbound_message', { from: phone, input: body });

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

  public async sendMedia(to: string, mediaUrl: string, caption?: string): Promise<boolean> {
    return this.post({
      messaging_product: 'whatsapp',
      to: normalize(to),
      type: 'image',
      image: { link: mediaUrl, ...(caption && { caption }) },
    });
  }

  /**
   * Meta Cloud API necesita una URL pública, no un path local.
   * Si recibe un path local manda el caption como texto.
   */
  public async sendImage(to: string, mediaPath: string, caption?: string): Promise<boolean> {
    if (mediaPath.startsWith('http://') || mediaPath.startsWith('https://')) {
      return this.sendMedia(to, mediaPath, caption);
    }
    logger.warn({ mediaPath }, '[MetaCloudProvider] sendImage con path local — enviando texto');
    return this.sendText(to, caption ?? mediaPath);
  }

  /** Meta requiere subir el audio primero — no implementado aún */
  public async sendAudio(_to: string, _buffer: Buffer): Promise<boolean> {
    logger.warn('[MetaCloudProvider] sendAudio no soportado aún via Meta Cloud API');
    return false;
  }

  public async sendButtons(
    to: string,
    text: string,
    buttons: BingoButton[],
    footer?: string,
  ): Promise<boolean> {
    // Meta permite máximo 3 botones; si hay más usamos lista
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

/** Elimina sufijo @s.whatsapp.net o similar */
function normalize(phone: string): string {
  return phone.replace(/@.*$/, '');
}

/** Recorta string al límite de Meta sin romper palabras a mitad */
function truncate(str: string, max: number): string {
  return str.length <= max ? str : str.slice(0, max - 1) + '…';
}

export const metaCloudProvider = new MetaCloudProvider();
