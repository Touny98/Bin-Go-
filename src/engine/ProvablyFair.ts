import crypto from 'crypto';

/**
 * Sorteo *provably-fair* por compromiso-revelación (commit-reveal).
 *
 * Flujo:
 *  1) Al crear/empezar la partida: serverSeed = CSPRNG; seedHash = sha256(serverSeed).
 *     Se publica seedHash a los jugadores ANTES de la primera bolilla (compromiso).
 *  2) La secuencia de sorteo se deriva de forma determinista del serverSeed con un
 *     keystream HMAC-SHA256 (CSPRNG) + Fisher-Yates con rejection sampling (sin sesgo).
 *  3) Al finalizar: se REVELA el serverSeed. Cualquiera verifica que
 *     sha256(serverSeed) == seedHash y que recomputar la secuencia da el mismo orden.
 *
 * `publicSeed` (opcional) permite mezclar entropía pública/del cliente para
 * provably-fair completo (que ni el operador predetermine el resultado).
 *
 * Reemplaza a BingoEngine.generateDrawSequence (Math.random / Mulberry32 sembrado con
 * la suma de char codes — débil, no verificable).
 */
export class ProvablyFair {
  /** Semilla del servidor: 32 bytes CSPRNG → 64 hex. */
  static generateServerSeed(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /** Compromiso público: sha256(serverSeed). Se publica ANTES del sorteo. */
  static commit(serverSeed: string): string {
    return crypto.createHash('sha256').update(serverSeed).digest('hex');
  }

  /**
   * Secuencia de sorteo determinista y verificable: una permutación de 1..maxNumber.
   * Fisher-Yates alimentado por un keystream HMAC-SHA256 derivado del serverSeed
   * (y opcionalmente publicSeed).
   */
  static drawSequence(serverSeed: string, maxNumber: number, publicSeed = ''): number[] {
    const seq = Array.from({ length: maxNumber }, (_, i) => i + 1);
    const nextInt = this.uniformIntGenerator(serverSeed, publicSeed);
    for (let i = seq.length - 1; i > 0; i--) {
      const j = nextInt(i + 1); // entero uniforme en [0, i]
      [seq[i], seq[j]] = [seq[j], seq[i]];
    }
    return seq;
  }

  /**
   * Verifica un sorteo revelado: el hash coincide y la secuencia se reproduce.
   */
  static verify(
    serverSeed: string,
    seedHash: string,
    maxNumber: number,
    expectedSequence: number[],
    publicSeed = ''
  ): boolean {
    if (this.commit(serverSeed) !== seedHash) return false;
    const seq = this.drawSequence(serverSeed, maxNumber, publicSeed);
    if (seq.length !== expectedSequence.length) return false;
    return seq.every((v, i) => v === expectedSequence[i]);
  }

  /**
   * Generador de enteros uniformes en [0, n) a partir de un keystream HMAC-SHA256
   * counter-mode. Usa rejection sampling sobre 48 bits para eliminar el sesgo de módulo.
   */
  private static uniformIntGenerator(serverSeed: string, publicSeed: string): (n: number) => number {
    let counter = 0;
    let pool = Buffer.alloc(0);

    const refill = () => {
      const block = crypto
        .createHmac('sha256', serverSeed)
        .update(`${publicSeed}:${counter++}`)
        .digest(); // 32 bytes
      pool = Buffer.concat([pool, block]);
    };

    const nextBytes = (k: number): Buffer => {
      while (pool.length < k) refill();
      const out = pool.subarray(0, k);
      pool = pool.subarray(k);
      return out;
    };

    return (n: number): number => {
      if (n <= 1) return 0;
      const TWO48 = 0x1000000000000; // 2^48
      const maxUnbiased = Math.floor(TWO48 / n) * n;
      // rejection sampling: descarta el rango que introduciría sesgo de módulo
      // (probabilidad de rechazo despreciable para n <= ~10^5)
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const x = nextBytes(6).readUIntBE(0, 6); // entero de 48 bits
        if (x < maxUnbiased) return x % n;
      }
    };
  }
}
