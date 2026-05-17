import { createCanvas, registerFont } from 'canvas';
import { logger } from '../utils/logger';

export interface RenderOptions {
  highlightedNumbers?: Set<number>;
  overlayText?: string;
  integrityHash?: string;
}

export class CardRenderer {
  private static readonly CARD_WIDTH = 800;
  private static readonly CARD_HEIGHT = 400;
  private static readonly ROWS = 3;
  private static readonly COLS = 9;

  /**
   * Renders a professional Bingo card to a Buffer
   */
  public static async render(cardMatrix: (number | null)[][], options: RenderOptions = {}): Promise<Buffer> {
    const canvas = createCanvas(this.CARD_WIDTH, this.CARD_HEIGHT);
    const ctx = canvas.getContext('2d');

    // 1. Background (Premium Dark Theme)
    ctx.fillStyle = '#1e1e2e';
    ctx.fillRect(0, 0, this.CARD_WIDTH, this.CARD_HEIGHT);

    // 2. Card Border & Title
    ctx.strokeStyle = '#f5e0dc';
    ctx.lineWidth = 4;
    ctx.strokeRect(10, 10, this.CARD_WIDTH - 20, this.CARD_HEIGHT - 20);

    // 3. Draw Grid
    const cellWidth = (this.CARD_WIDTH - 40) / this.COLS;
    const cellHeight = (this.CARD_HEIGHT - 100) / this.ROWS;
    const offsetX = 20;
    const offsetY = 60;

    ctx.font = 'bold 32px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let r = 0; r < this.ROWS; r++) {
      for (let c = 0; c < this.COLS; c++) {
        const val = cardMatrix[r][c];
        const x = offsetX + c * cellWidth;
        const y = offsetY + r * cellHeight;

        // Draw Cell Background
        ctx.fillStyle = val === null ? '#313244' : '#45475a';
        ctx.fillRect(x + 5, y + 5, cellWidth - 10, cellHeight - 10);

        // Draw Number
        if (val !== null) {
          const isMarked = options.highlightedNumbers?.has(val);
          
          if (isMarked) {
            // Highlighted state (Hit!)
            ctx.fillStyle = '#f38ba8'; // Reddish highlight
            ctx.beginPath();
            ctx.arc(x + cellWidth / 2, y + cellHeight / 2, cellHeight / 2.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#1e1e2e';
          } else {
            ctx.fillStyle = '#cdd6f4';
          }
          
          ctx.fillText(val.toString(), x + cellWidth / 2, y + cellHeight / 2);
        }
      }
    }

    // 4. Header & Integrity Info
    ctx.fillStyle = '#f5e0dc';
    ctx.font = '24px Arial';
    ctx.fillText('BinGo! Live Ticket', this.CARD_WIDTH / 2, 35);

    if (options.integrityHash) {
      ctx.font = '12px Courier';
      ctx.fillStyle = '#a6adc8';
      ctx.textAlign = 'left';
      ctx.fillText(`Integrity Hash: ${options.integrityHash}`, 25, this.CARD_HEIGHT - 25);
    }

    // 5. Overlay Text (e.g., "CASI GANAS!")
    if (options.overlayText) {
      ctx.save();
      ctx.translate(this.CARD_WIDTH / 2, this.CARD_HEIGHT / 2);
      ctx.rotate(-Math.PI / 12);
      ctx.font = 'bold 80px Arial';
      ctx.fillStyle = 'rgba(243, 139, 168, 0.4)';
      ctx.strokeStyle = '#f38ba8';
      ctx.lineWidth = 2;
      ctx.textAlign = 'center';
      ctx.strokeText(options.overlayText, 0, 0);
      ctx.fillText(options.overlayText, 0, 0);
      ctx.restore();
    }

    return canvas.toBuffer('image/png');
  }
}
