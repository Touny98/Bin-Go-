import crypto from 'crypto';

export class BingoEngine {
  /**
   * Generates a 90-ball bingo card.
   * A card is a 3x9 grid.
   * Each row has exactly 5 numbers and 4 blanks (represented as 0 or null).
   * Column ranges:
   * Col 0: 1-9
   * Col 1: 10-19
   * Col 2: 20-29
   * Col 3: 30-39
   * Col 4: 40-49
   * Col 5: 50-59
   * Col 6: 60-69
   * Col 7: 70-79
   * Col 8: 80-90
   *
   * @returns A 2D array [3][9] representing the card
   */
  static generateCard(seedStr?: string): (number | null)[][] {
    const card: (number | null)[][] = [
      Array(9).fill(null),
      Array(9).fill(null),
      Array(9).fill(null),
    ];

    let random = Math.random;
    if (seedStr) {
      let seed = Array.from(seedStr).reduce((acc, char) => acc + char.charCodeAt(0), 0);
      random = () => {
        let t = seed += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
      };
    }

    const getRandomInt = (min: number, max: number) =>
      Math.floor(random() * (max - min + 1)) + min;

    const colCounts = Array(9).fill(0);
    const colNumbers: number[][] = Array.from({ length: 9 }, () => []);

    for (let c = 0; c < 9; c++) {
      let min = c === 0 ? 1 : c * 10;
      let max = c === 8 ? 90 : c * 10 + 9;
      let num = getRandomInt(min, max);
      colNumbers[c].push(num);
      colCounts[c]++;
    }

    let remaining = 6;
    while (remaining > 0) {
      const c = getRandomInt(0, 8);
      if (colCounts[c] < 3) {
        let min = c === 0 ? 1 : c * 10;
        let max = c === 8 ? 90 : c * 10 + 9;
        let num = getRandomInt(min, max);
        if (!colNumbers[c].includes(num)) {
          colNumbers[c].push(num);
          colCounts[c]++;
          remaining--;
        }
      }
    }

    for (let c = 0; c < 9; c++) {
      colNumbers[c].sort((a, b) => a - b);
    }

    const rowCounts = [0, 0, 0];
    
    for (let c = 0; c < 9; c++) {
      if (colCounts[c] === 3) {
        card[0][c] = colNumbers[c][0];
        card[1][c] = colNumbers[c][1];
        card[2][c] = colNumbers[c][2];
        rowCounts[0]++;
        rowCounts[1]++;
        rowCounts[2]++;
      } else if (colCounts[c] === 2) {
        let availableRows = [0, 1, 2].sort((a, b) => rowCounts[a] - rowCounts[b]);
        let r1 = availableRows[0];
        let r2 = availableRows[1];
        if (r1 > r2) [r1, r2] = [r2, r1];
        card[r1][c] = colNumbers[c][0];
        card[r2][c] = colNumbers[c][1];
        rowCounts[r1]++;
        rowCounts[r2]++;
      } else if (colCounts[c] === 1) {
        let availableRows = [0, 1, 2].sort((a, b) => rowCounts[a] - rowCounts[b]);
        let r = availableRows[0];
        card[r][c] = colNumbers[c][0];
        rowCounts[r]++;
      }
    }

    let attempts = 0;
    while ((rowCounts[0] !== 5 || rowCounts[1] !== 5 || rowCounts[2] !== 5) && attempts < 100) {
      let overRow = rowCounts.findIndex((c) => c > 5);
      let underRow = rowCounts.findIndex((c) => c < 5);
      
      if (overRow === -1 || underRow === -1) break;

      for (let c = 0; c < 9; c++) {
        if (card[overRow][c] !== null && card[underRow][c] === null && colCounts[c] < 3) {
          card[underRow][c] = card[overRow][c];
          card[overRow][c] = null;
          rowCounts[overRow]--;
          rowCounts[underRow]++;
          break;
        }
      }
      attempts++;
    }

    for (let c = 0; c < 9; c++) {
      let numsInCol = [];
      for (let r = 0; r < 3; r++) {
        if (card[r][c] !== null) numsInCol.push(card[r][c] as number);
      }
      numsInCol.sort((a, b) => a - b);
      let idx = 0;
      for (let r = 0; r < 3; r++) {
        if (card[r][c] !== null) {
          card[r][c] = numsInCol[idx++];
        }
      }
    }

    return card;
  }
  /**
   * Returns card dimensions and max number for a given game mode.
   */
  static getCardDimensions(gameMode: string): { cols: number; rows: number; maxNumber: number } {
    if (gameMode === 'ACCUMULATIVE') return { cols: 5, rows: 4, maxNumber: 99 };
    return { cols: 4, rows: 4, maxNumber: 99 }; // SALE_O_SALE y diario → cartón 4x4, números 1-99
  }

  /**
   * Generates a simple cols x rows card with unique random numbers from 1..maxNumber.
   */
  static generateSimpleCard(cols: number, rows: number, maxNumber: number): (number | null)[][] {
    const total = cols * rows;
    const pool = Array.from({ length: maxNumber }, (_, i) => i + 1);

    // Doble Fisher-Yates con semilla temporal para máxima aleatoriedad
    const shuffle = (arr: number[]) => {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
    };
    shuffle(pool);
    shuffle(pool); // segunda pasada para romper cualquier patrón residual

    const selected = pool.slice(0, total);
    const card: (number | null)[][] = [];
    for (let r = 0; r < rows; r++) {
      card.push(selected.slice(r * cols, (r + 1) * cols));
    }
    return card;
  }

  /**
   * Generates a randomized list of 90 numbers for extraction
   */
  /**
   * Generates a shuffled draw sequence from 1 to maxNumber.
   * Default 90 for standard bingo, 45 for SALE_O_SALE, 75 for ACCUMULATIVE.
   */
  static generateDrawSequence(seedStr?: string, maxNumber = 99): number[] {
    const sequence = Array.from({ length: maxNumber }, (_, i) => i + 1);

    if (seedStr) {
      // Deterministic Fisher-Yates using Mulberry32 seeded PRNG
      let seed = Array.from(seedStr).reduce((acc, char) => acc + char.charCodeAt(0), 0);
      const random = () => {
        let t = seed += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
      };
      for (let i = sequence.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [sequence[i], sequence[j]] = [sequence[j], sequence[i]];
      }
    } else {
      // Standard Fisher-Yates
      for (let i = sequence.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [sequence[i], sequence[j]] = [sequence[j], sequence[i]];
      }
    }
    return sequence;
  }

  /**
   * Generates the Integrity Hash for transparency (Anti-Fraud).
   */
  static generateIntegrityHash(gameId: number, sequence: number[], timestamp: Date): string {
    const secretSalt = process.env.GAME_SALT || 'bingo_secret_salt_123';
    const payload = `${gameId}-${sequence.join(',')}-${timestamp.toISOString()}-${secretSalt}`;
    return crypto.createHash('sha256').update(payload).digest('hex');
  }

  /**
   * Validates if a card has won 'Linea' (a single row completely drawn)
   * @param card The 2D array representation of the card
   * @param drawnNumbers Set or Array of drawn numbers
   */
  static checkLine(card: (number | null)[][], drawnNumbers: Set<number>): boolean {
    const rows = card.length;
    const cols = card[0]?.length ?? 0;
    for (let r = 0; r < rows; r++) {
      let isLine = true;
      let hasNumbers = false;
      for (let c = 0; c < cols; c++) {
        const num = card[r][c];
        if (num !== null) {
          hasNumbers = true;
          if (!drawnNumbers.has(num)) {
            isLine = false;
            break;
          }
        }
      }
      if (isLine && hasNumbers) return true;
    }
    return false;
  }

  /**
   * Validates if a card has won 'Bingo' (all numbers drawn)
   */
  static checkBingo(card: (number | null)[][], drawnNumbers: Set<number>): boolean {
    const rows = card.length;
    const cols = card[0]?.length ?? 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const num = card[r][c];
        if (num !== null && !drawnNumbers.has(num)) {
          return false;
        }
      }
    }
    return true;
  }
}
