/**
 * cardFormatter.ts
 *
 * Celda de número:  " 08 " — espacio + número zero-padded + espacio (4 chars)
 * Celda de emoji:   " ✅"  — 1 espacio + emoji wide (3 cols en WhatsApp) = 4 cols visuales
 *                   " 🔥"  — ídem
 * Celda vacía:      "    " — 4 espacios
 * Borde:            "═" × (cols×5−4) — 3 chars menos que la fila de contenido (cols×5+1)
 *
 * Diseño (4 cols):
 *   ╔════════════════╗       ← 18 chars  (cols×5−4 + 2 esquinas)
 *   ║ 08 ║ 17 ║ 29 ║ 41 ║  ← 21 chars  (cols×5+1)
 *   ╠════════════════╣
 *   " 08 " → número pendiente  (espacio + número + espacio)
 *   " ✅"   → salido normal     (espacio + emoji — sin espacio final)
 *   " 🔥"   → casi bingo        (espacio + emoji — sin espacio final)
 *   ╚════════════════╝
 */

export function getNearWinThreshold(gameMode: string, maxBalls: number): number {
  if (gameMode === 'ACCUMULATIVE') return 5;  // Domingo Millonario
  if (maxBalls >= 60)              return 4;  // La Diaria
  return 3;                                   // Sale o Sale
}

export function isCardNearWin(
  matrix: (number | null)[][],
  drawnSet: Set<number>,
  threshold: number,
): boolean {
  if (drawnSet.size === 0 || threshold === 0) return false;
  const remaining = matrix.flat().filter(n => n !== null && !drawnSet.has(n)).length;
  return remaining > 0 && remaining <= threshold;
}

/**
 * Renderiza el cartón con bordes doble línea y celdas de 4 cols visuales:
 *   " 08 " → número pendiente  (espacio + número + espacio)
 *   " ✅"   → salido normal     (espacio + emoji)
 *   " 🔥"   → casi bingo        (espacio + emoji)
 *   "    " → celda vacía        (4 espacios)
 *
 * Ejemplo 4 columnas:
 *   ╔════════════════╗
 *   ║ 08 ║ 17 ║ 29 ║ 41 ║
 *   ╠════════════════╣
 *   ║ ✅║ 13 ║ 35 ║ 58 ║
 *   ╠════════════════╣
 *   ║ 12 ║ 27 ║ 54 ║ 83 ║
 *   ╠════════════════╣
 *   ║ 06 ║ ✅║ 39 ║ 66 ║
 *   ╚════════════════╝
 */
export function buildCardBlock(
  matrix: (number | null)[][],
  drawnSet: Set<number>,
  nearWinThreshold = 0,
): string {
  const cols = matrix[0]?.length ?? 4;
  const nearWin = isCardNearWin(matrix, drawnSet, nearWinThreshold);

  // Bordes sólidos: una línea continua sin conectores internos (╦╬╩)
  // Fila de contenido mide cols×5 + 1 chars. Los bordes tienen 3 chars menos en total,
  // es decir (cols×5 + 1) - 3 = cols×5 - 2 chars totales → hline = cols×5 - 4 (sin las 2 esquinas)
  const hline = '═'.repeat(cols * 5 - 4);
  const top = '╔' + hline + '╗';
  const mid = '╠' + hline + '╣';
  const bot = '╚' + hline + '╝';

  const lines: string[] = [top];

  for (let r = 0; r < matrix.length; r++) {
    const cells = matrix[r].map(n => {
      if (n === null)        return '    ';                               // 4 espacios
      if (!drawnSet.has(n)) return ' ' + String(n).padStart(2, '0') + ' '; // " 08 " (4 chars)
      return nearWin ? ' 🔥' : ' ✅';                                         // espacio + emoji (4 cols visuales)
    });
    lines.push('║' + cells.join('║') + '║');
    if (r < matrix.length - 1) lines.push(mid);
  }

  lines.push(bot);
  return '```\n' + lines.join('\n') + '\n```';
}
