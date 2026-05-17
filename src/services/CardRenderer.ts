import { createCanvas } from 'canvas';
import fs from 'fs';
import path from 'path';

export class CardRenderer {
  /**
   * Generates a PNG image of a Bingo Card
   * @param cardMatrix The 3x9 matrix representing the card
   * @param markedNumbers Set of drawn numbers to highlight (auto-daubing)
   * @param cardId Identifier for the card to save the file
   * @returns Path to the saved image
   */
  static async renderCard(cardMatrix: (number | null)[][], markedNumbers: Set<number>, cardId: string | number): Promise<string> {
    const width = 900;
    const height = 400;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Background
    ctx.fillStyle = '#1e1e2f'; // Dark premium background
    ctx.fillRect(0, 0, width, height);

    // Branding / Header
    ctx.fillStyle = '#ffcc00'; // Gold
    ctx.font = 'bold 36px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('BINGO VIP', width / 2, 50);

    // Grid configuration
    const cols = 9;
    const rows = 3;
    const cellWidth = 80;
    const cellHeight = 80;
    const startX = (width - cols * cellWidth) / 2;
    const startY = 100;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Draw cells
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = startX + c * cellWidth;
        const y = startY + r * cellHeight;
        const num = cardMatrix[r][c];

        // Draw Cell Box
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, cellWidth, cellHeight);

        if (num !== null) {
          const isMarked = markedNumbers.has(num);

          if (isMarked) {
            // Highlight marked numbers (Daubing)
            ctx.fillStyle = '#ff4757'; // Coral red for daub
            ctx.beginPath();
            ctx.arc(x + cellWidth / 2, y + cellHeight / 2, 30, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#ffffff'; // White text
          } else {
            // Normal number
            ctx.fillStyle = '#ffffff';
          }

          ctx.font = 'bold 32px sans-serif';
          ctx.fillText(num.toString(), x + cellWidth / 2, y + cellHeight / 2);
        } else {
          // Empty cell fill (Optional, just leave dark)
          ctx.fillStyle = '#2a2a40';
          ctx.fillRect(x + 2, y + 2, cellWidth - 4, cellHeight - 4);
        }
      }
    }

    // Save to disk (temporarily, or to a public folder)
    const outDir = path.join(process.cwd(), 'public', 'cards');
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    const filePath = path.join(outDir, `card_${cardId}.png`);
    const out = fs.createWriteStream(filePath);
    const stream = canvas.createPNGStream();

    return new Promise((resolve, reject) => {
      stream.pipe(out);
      out.on('finish', () => resolve(filePath));
      out.on('error', reject);
    });
  }
}
