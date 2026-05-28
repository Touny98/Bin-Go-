import { Router, Request, Response } from 'express';
import { metaCloudProvider } from '../notifications/providers/MetaCloudProvider';

const router = Router();

// Meta verifica el webhook con un GET al registrarlo en el portal
router.get('/', (req: Request, res: Response) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WA_VERIFY_TOKEN) {
    console.log('[MetaWebhook] Webhook verificado por Meta');
    res.status(200).send(challenge);
  } else {
    console.warn('[MetaWebhook] Verificación fallida — token incorrecto o mode inválido');
    res.sendStatus(403);
  }
});

// Meta envía los mensajes entrantes con un POST
router.post('/', async (req: Request, res: Response) => {
  const body = req.body;

  // Responder 200 inmediatamente — Meta reintenta si no recibe respuesta rápida
  res.sendStatus(200);

  if (body.object !== 'whatsapp_business_account') return;

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== 'messages') continue;

      const value    = change.value;
      const messages = value?.messages ?? [];
      const statuses = value?.statuses ?? [];

      // Procesar mensajes entrantes
      for (const msg of messages) {
        const from  = msg.from as string;  // número en formato internacional, ej: "5491112345678"
        const input = extractText(msg);

        if (!input) continue;

        console.log(`[MetaWebhook] Mensaje de ${from}: ${input}`);
        await metaCloudProvider.handleIncoming(from, input);
      }

      // Loggear actualizaciones de estado (enviado, entregado, leído) sin bloquear
      for (const status of statuses) {
        console.log(`[MetaWebhook] Estado mensaje ${status.id}: ${status.status} (para ${status.recipient_id})`);
      }
    }
  }
});

function extractText(msg: any): string | null {
  switch (msg.type) {
    case 'text':
      return msg.text?.body ?? null;
    case 'interactive': {
      const ia = msg.interactive;
      if (ia?.type === 'button_reply')  return ia.button_reply?.id   ?? ia.button_reply?.title   ?? null;
      if (ia?.type === 'list_reply')    return ia.list_reply?.id      ?? ia.list_reply?.title     ?? null;
      return null;
    }
    case 'button':
      return msg.button?.payload ?? msg.button?.text ?? null;
    default:
      return null;
  }
}

export default router;
