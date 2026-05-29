import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import path from 'path';
import fs from 'fs';
import { logger } from '../utils/logger';

ffmpeg.setFfmpegPath(ffmpegStatic as string);

const AUDIO_BASE = path.resolve(process.cwd(), 'assets', 'audio');
const CLOSING_COUNT = 3;

export class AudioService {
  /**
   * Concatena los audios de las bolillas indicadas + un cierre aleatorio,
   * y devuelve un Buffer OGG/OPUS listo para enviarse como nota de voz (PTT).
   *
   * @param numbers        Bolillas del batch (ej. [14, 37, 82])
   * @param sessionId      ID de la sesión de juego (para nombre del archivo tmp)
   * @param drawOrder      Orden del sorteo (para nombre del archivo tmp)
   * @param narratorFolder Subcarpeta del narrador (ej. "narrador-1")
   */
  /**
   * Convierte un MP3 estático a OGG/OPUS y devuelve el Buffer listo para PTT.
   * Útil para audios de evento único (ej. "bingo.mp3").
   */
  public static async getStaticAudio(
    filename: string,
    narratorFolder = 'narrador-1',
  ): Promise<Buffer | null> {
    const filePath = path.join(AUDIO_BASE, narratorFolder, `${filename}.mp3`);
    if (!fs.existsSync(filePath)) {
      logger.warn(`[AudioService] Missing static audio: ${narratorFolder}/${filename}.mp3`);
      return null;
    }

    const tmpDir = path.resolve(process.cwd(), 'tmp');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const outputPath = path.resolve(tmpDir, `${filename}_${Date.now()}.ogg`);

    // Usa el mismo patrón de complexFilter que concatBallsAudio (probado en producción)
    return new Promise((resolve, reject) => {
      const cmd = ffmpeg();
      cmd.input(filePath);
      cmd
        .complexFilter('[0:a]concat=n=1:v=0:a=1[out]')
        .outputOptions(['-map [out]', '-c:a libopus', '-b:a 32k', '-vbr on'])
        .output(outputPath)
        .on('end', () => {
          try {
            const buf = fs.readFileSync(outputPath);
            fs.unlinkSync(outputPath);
            resolve(buf);
          } catch (e) {
            if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
            reject(e);
          }
        })
        .on('error', (err) => {
          logger.error({ error: err.message }, '[AudioService] ffmpeg static audio error');
          if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
          reject(err);
        })
        .run();
    });
  }

  public static async concatBallsAudio(
    numbers: number[],
    sessionId: number,
    drawOrder: number,
    narratorFolder = 'narrador-1',
  ): Promise<Buffer | null> {
    const tmpDir = path.resolve(process.cwd(), 'tmp');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    const narratorDir = path.join(AUDIO_BASE, narratorFolder);
    const files: string[] = [];

    for (const n of numbers) {
      const p = path.join(narratorDir, `${n}.mp3`);
      if (fs.existsSync(p)) {
        files.push(p);
      } else {
        logger.warn(`[AudioService] Missing audio: ${narratorFolder}/${n}.mp3`);
      }
    }

    // Agregar cierre aleatorio al final del batch
    const closingIdx = Math.floor(Math.random() * CLOSING_COUNT) + 1;
    const closingPath = path.join(narratorDir, `cierre_${closingIdx}.mp3`);
    if (fs.existsSync(closingPath)) {
      files.push(closingPath);
    } else {
      logger.warn(`[AudioService] Missing closing: ${narratorFolder}/cierre_${closingIdx}.mp3`);
    }

    if (files.length === 0) return null;

    const outputPath = path.resolve(tmpDir, `audio_${sessionId}_${drawOrder}_${Date.now()}.ogg`);

    return new Promise((resolve, reject) => {
      const cmd = ffmpeg();
      files.forEach(f => cmd.input(f));

      // concat filter: encadena N inputs de audio en secuencia
      const filterInputs = files.map((_, i) => `[${i}:a]`).join('');

      cmd
        .complexFilter(`${filterInputs}concat=n=${files.length}:v=0:a=1[out]`)
        .outputOptions(['-map [out]', '-c:a libopus', '-b:a 32k', '-vbr on'])
        .output(outputPath)
        .on('end', () => {
          try {
            const buf = fs.readFileSync(outputPath);
            fs.unlinkSync(outputPath);
            resolve(buf);
          } catch (e) {
            if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
            reject(e);
          }
        })
        .on('error', (err) => {
          logger.error({ error: err.message }, '[AudioService] ffmpeg concat error');
          if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
          reject(err);
        })
        .run();
    });
  }
}
