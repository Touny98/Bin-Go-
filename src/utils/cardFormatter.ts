/**
 * cardFormatter.ts
 * Shared card rendering utility for WhatsApp messages.
 * Produces a box-drawing bordered card that renders cleanly
 * inside WhatsApp code blocks (```...```).
 */

/**
 * Returns the "near-win" threshold for a given room:
 * - Sale o Sale  (max_balls = 45): fire when ≤ 3 remaining
 * - La Diaria    (max_balls = 60): fire when ≤ 4 remaining
 * - Domingo Millonario (ACCUMULATIVE): fire when ≤ 5 remaining
 */
export function getNearWinThreshold(gameMode: string, maxBalls: number): number {
  if (gameMode === 'ACCUMULATIVE') return 5;
  if (maxBalls >= 60)              return 4; // La Diaria
  return 3;                                  // Sale o Sale
}

/**
 * Renders a bingo card with Unicode box-drawing borders.
 *
 * Cell states:
 *   - Not drawn  →  " 08 "  (zero-padded, 2 digits, framed by spaces)
 *   - Drawn, not near win  →  " ✅ "
 *   - Drawn, near win (remaining ≤ nearWinThreshold)  →  " 🔥 "
 *   - Null / blank  →  "    "  (4 spaces)
 *
 * Example output (5 cols):
 *   ╔════╦════╦════╦════╦════╗
 *   ║ 08 ║ 17 ║ 29 ║ 41 ║ 77 ║
 *   ╠════╬════╬════╬════╬════╣
 *   ║ ✅ ║ 13 ║ 🔥 ║ 58 ║ 69 ║
 *   ╚════╩════╩════╩════╩════╝
 */
export function buildCardBlock(
  matrix: (number | null)[][],
  drawnSet: Set<number>,
  nearWinThreshold = 0,
): string {
  const cols = matrix[0]?.length ?? 4;

  // How many numbers on this card are still undrawn?
  const remaining = matrix
    .flat()
    .filter(n => n !== null && !drawnSet.has(n)).length;

  const useFlame =
    drawnSet.size > 0 && remaining > 0 && remaining <= nearWinThreshold;
  const drawnMarker = useFlame ? '🔥' : '✅';

  // Each cell occupies 4 visual characters: " XX " or " ✅ " etc.
  const seg = '════'; // 4 × ═
  const top = '╔' + Array(cols).fill(seg).join('╦') + '╗';
  const mid = '╠' + Array(cols).fill(seg).join('╬') + '╣';
  const bot = '╚' + Array(cols).fill(seg).join('╩') + '╝';

  const lines: string[] = [top];

  for (let r = 0; r < matrix.length; r++) {
    const cells = matrix[r].map(n => {
      if (n === null)      return '    ';                          // blank
      if (drawnSet.has(n)) return ` ${drawnMarker} `;             // drawn marker
      return ` ${String(n).padStart(2, '0')} `;                   // undrawn number
    });
    lines.push('║' + cells.join('║') + '║');
    if (r < matrix.length - 1) lines.push(mid);
  }

  lines.push(bot);
  return '```\n' + lines.join('\n') + '\n```';
}
