import { randomUUID } from 'crypto';
import { connection } from '../queue';
import { logger } from './logger';

/**
 * Lock distribuido con *fencing token* sobre Redis.
 *
 * El problema del patrón `SET key 'locked' NX` + `DEL key` es que el `DEL` es
 * incondicional: si el TTL expira mientras el dueño todavía trabaja y otro
 * proceso re-adquiere el lock, el dueño original borra un lock que ya no es
 * suyo. Acá cada `acquire` devuelve un token único y `release`/`extend` sólo
 * actúan si el token sigue siendo el del dueño (compare-and-set vía Lua), así
 * nadie pisa el lock de otro.
 *
 * Reutilizado por:
 *  - el lock de conversación por usuario (ConversationOrchestrator)
 *  - el lock de entrega por destinatario (NotificationWorker)
 */

// DEL sólo si el valor coincide con el token del dueño.
const RELEASE_LUA = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('del', KEYS[1])
else
  return 0
end`;

// PEXPIRE (renovar TTL) sólo si el token sigue siendo del dueño.
const EXTEND_LUA = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('pexpire', KEYS[1], ARGV[2])
else
  return 0
end`;

/**
 * Intenta tomar el lock. Devuelve el token del dueño si lo consiguió, o `null`
 * si ya estaba tomado. El token debe pasarse luego a `releaseLock`/`extendLock`.
 */
export async function acquireLock(
  key: string,
  ttlMs: number
): Promise<string | null> {
  const token = randomUUID();
  // ioredis: SET key value PX <ttl> NX  → 'OK' | null
  const res = await connection.set(key, token, 'PX', ttlMs, 'NX');
  return res === 'OK' ? token : null;
}

/**
 * Libera el lock sólo si seguimos siendo el dueño (token coincide).
 * Devuelve true si efectivamente lo borró.
 */
export async function releaseLock(key: string, token: string): Promise<boolean> {
  try {
    const res = (await connection.eval(RELEASE_LUA, 1, key, token)) as number;
    return res === 1;
  } catch (e: any) {
    logger.warn({ key, err: e.message }, '[redisLock] release falló');
    return false;
  }
}

/**
 * Renueva el TTL del lock si seguimos siendo el dueño. Útil para operaciones
 * largas que no quieren perder el lock a mitad de camino.
 */
export async function extendLock(
  key: string,
  token: string,
  ttlMs: number
): Promise<boolean> {
  try {
    const res = (await connection.eval(EXTEND_LUA, 1, key, token, ttlMs)) as number;
    return res === 1;
  } catch (e: any) {
    logger.warn({ key, err: e.message }, '[redisLock] extend falló');
    return false;
  }
}
