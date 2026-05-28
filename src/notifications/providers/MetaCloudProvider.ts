import { readFile } from 'fs/promises';
import { extname } from 'path';
import { WhatsAppProvider } from './WhatsAppProvider';
import type { BingoButton, BingoListSection } from '../types/InteractiveMessage';
import { whatsappInboundQueue } from '../../queue';
import { logger } from '../../utils/logger';

const GRAPH_API_VERSION = 'v19.0';
const MEDIA_CACHE_TTL_MS = 25 * 24 * 60 * 60 * 1000; // 25 días (Meta expira a los 30)

const EXT_TO_MIME: Record<string, string> = {
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png':  'image/png',
  '.webp': 'image/webp',
  '.gif':  'image/gif',
  '.ogg':  'audio/ogg',
  '.mp3':  'audio/mpeg',
  '.aac':  'audio/aac',
  '.mp4':  'audio/mp4',
};

export class MetaCloudProvider implements WhatsAppProvider {
  private readonly token: string;
  private readonly phoneId: string;
  private readonly apiUrl: string;
  private readonly uploadUrl: string;
  private readonly messageCallbacks: Array<(from: string, body: string) => Promise<void>> = [];

  /** Cache: filePath → { mediaId, uploadedAt } — evita re-subir el mismo archivo */
  private readonly mediaCache = new Map<string, { id: string; at: number }>();

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

  /** Llamado por el webhook al recibir un mensaje de Meta */
  public async handleIncoming(from: string, body: string): Promise<void> {
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
   * Si recibe una URL pública la envía directo.
   * Si recibe un path local, sube el archivo a Meta primero y envía con el media_id.
   * El media_id se cachea 25 días para no re-subir el mismo archivo.
   */
  public async sendImage(to: string, mediaPath: string, caption?: string): Promise<boolean> {
    if (mediaPath.startsWith('http://') || mediaPath.startsWith('https://')) {
      return this.sendMedia(to, mediaPath, caption);
    }

    const mime = EXT_TO_MIME[extname(mediaPath).toLowerCase()] ?? 'image/jpeg';
    const mediaId = await this.uploadFromPath(mediaPath, mime);
    if (!mediaId) {
      logger.warn({ mediaPath }, '[MetaCloudProvider] Upload fallido — enviando caption como texto');
      return caption ? this.sendText(to, caption) : false;
    }

    return this.post({
      messaging_product: 'whatsapp',
      to: normalize(to),
      type: 'image',
      image: { id: mediaId, ...(caption && { caption }) },
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

  /** Sube un archivo local con caché por path */
  private async uploadFromPath(filePath: string, mimeType: string): Promise<string | null> {
    const cached = this.mediaCache.get(filePath);
    if (cached && Date.now() - cached.at < MEDIA_CACHE_TTL_MS) {
      logger.debug({ filePath }, '[MetaCloudProvider] Media cache hit');
      return cached.id;
    }

    try {
      const buffer = await readFile(filePath);
      return this.uploadBuffer(buffer, mimeType, filePath);
    } catch (e: any) {
      logger.error({ filePath, err: e.message }, '[MetaCloudProvider] Error leyendo archivo');
      return null;
    }
  }

  /** Sube un Buffer a Meta y devuelve el media_id */
  private async uploadBuffer(
    buffer: Buffer,
    mimeType: string,
    cacheKey?: string,
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

      if (cacheKey) this.mediaCache.set(cacheKey, { id, at: Date.now() });

      logger.info({ mediaId: id, cacheKey }, '[MetaCloudProvider] Media subido OK');
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
