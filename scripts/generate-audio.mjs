#!/usr/bin/env node
/**
 * scripts/generate-audio.mjs
 * Genera los 99 audios de bolillas + 3 cierres usando la API de ElevenLabs.
 *
 * Uso:
 *   node scripts/generate-audio.mjs --narrator=narrador-1 --voice=D09EpJbk4um1HKSpeTSc
 *   node scripts/generate-audio.mjs --narrator=narrador-2 --voice=OTRO_ID --force
 *
 * Lee ELEVENLABS_API_KEY del .env en la raíz del proyecto.
 * Guarda en: assets/audio/<narrator>/1.mp3 ... 99.mp3, cierre_1.mp3 ... cierre_3.mp3
 * Si un archivo ya existe, lo saltea (usá --force para regenerar todo).
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.join(__dirname, '..');

// ── Carga .env sin dependencias externas ─────────────────────────────────────
function loadEnv() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    const val = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnv();

// ── Args CLI ─────────────────────────────────────────────────────────────────
const args = Object.fromEntries(
  process.argv.slice(2)
    .filter(a => a.startsWith('--'))
    .map(a => { const [k, ...v] = a.slice(2).split('='); return [k, v.join('=') || true]; })
);
const narratorName = args.narrator;
const voiceId      = args.voice;
const forceRegen   = 'force' in args;

if (!narratorName || !voiceId) {
  console.error('Uso: node scripts/generate-audio.mjs --narrator=narrador-1 --voice=VOICE_ID [--force]');
  process.exit(1);
}

const API_KEY = process.env.ELEVENLABS_API_KEY;
if (!API_KEY) {
  console.error('Error: ELEVENLABS_API_KEY no encontrada en .env');
  process.exit(1);
}

const MODEL_ID   = 'eleven_multilingual_v2';
const DELAY_MS   = 350;
const OUTPUT_DIR = path.join(ROOT, 'assets', 'audio', narratorName);
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// ── Scripts: 99 bolillas ─────────────────────────────────────────────────────
// Formato con apodo: "¡Número! ¡Apodo! ¡Dígito... dígito!"
// Formato sin apodo: "¡Número! ¡Dígito... dígito!"
// Números 1-9: sin lectura de dígitos (son de un solo dígito)

const SCRIPTS = {
  1:  "¡El uno!",
  2:  "¡El dos!",
  3:  "¡El tres!",
  4:  "¡El cuatro!",
  5:  "¡El cinco!",
  6:  "¡El seis!",
  7:  "¡El siete! ¡La suerte!",
  8:  "¡El ocho!",
  9:  "¡El nueve!",
  10: "¡El diez! ¡Uno... cero!",
  11: "¡Once! ¡Las piernas! ¡Uno... uno!",
  12: "¡Doce! ¡Uno... dos!",
  13: "¡Trece! ¡La mala suerte! ¡Uno... tres!",
  14: "¡Catorce! ¡Uno... cuatro!",
  15: "¡Quince! ¡Uno... cinco!",
  16: "¡Dieciséis! ¡Uno... seis!",
  17: "¡Diecisiete! ¡Uno... siete!",
  18: "¡Dieciocho! ¡Uno... ocho!",
  19: "¡Diecinueve! ¡Uno... nueve!",
  20: "¡Veinte! ¡Dos... cero!",
  21: "¡Veintiuno! ¡El blackjack! ¡Dos... uno!",
  22: "¡Veintidós! ¡Los patitos! ¡Dos... dos!",
  23: "¡Veintitrés! ¡Dos... tres!",
  24: "¡Veinticuatro! ¡Dos... cuatro!",
  25: "¡Veinticinco! ¡Las bodas de plata! ¡Dos... cinco!",
  26: "¡Veintiséis! ¡Dos... seis!",
  27: "¡Veintisiete! ¡Dos... siete!",
  28: "¡Veintiocho! ¡Dos... ocho!",
  29: "¡Veintinueve! ¡Dos... nueve!",
  30: "¡Treinta! ¡Tres... cero!",
  31: "¡Treinta y uno! ¡Tres... uno!",
  32: "¡Treinta y dos! ¡Tres... dos!",
  33: "¡Treinta y tres! ¡El Cristo! ¡Tres... tres!",
  34: "¡Treinta y cuatro! ¡Tres... cuatro!",
  35: "¡Treinta y cinco! ¡Tres... cinco!",
  36: "¡Treinta y seis! ¡Tres... seis!",
  37: "¡Treinta y siete! ¡Tres... siete!",
  38: "¡Treinta y ocho! ¡Tres... ocho!",
  39: "¡Treinta y nueve! ¡Tres... nueve!",
  40: "¡Cuarenta! ¡La cuarentena! ¡Cuatro... cero!",
  41: "¡Cuarenta y uno! ¡Cuatro... uno!",
  42: "¡Cuarenta y dos! ¡Cuatro... dos!",
  43: "¡Cuarenta y tres! ¡Cuatro... tres!",
  44: "¡Cuarenta y cuatro! ¡Las cuatro esquinas! ¡Cuatro... cuatro!",
  45: "¡Cuarenta y cinco! ¡Cuatro... cinco!",
  46: "¡Cuarenta y seis! ¡Cuatro... seis!",
  47: "¡Cuarenta y siete! ¡Cuatro... siete!",
  48: "¡Cuarenta y ocho! ¡Cuatro... ocho!",
  49: "¡Cuarenta y nueve! ¡Cuatro... nueve!",
  50: "¡Cincuenta! ¡La mitad del camino! ¡Cinco... cero!",
  51: "¡Cincuenta y uno! ¡Cinco... uno!",
  52: "¡Cincuenta y dos! ¡Cinco... dos!",
  53: "¡Cincuenta y tres! ¡Cinco... tres!",
  54: "¡Cincuenta y cuatro! ¡Cinco... cuatro!",
  55: "¡Cincuenta y cinco! ¡El doble cinco! ¡Cinco... cinco!",
  56: "¡Cincuenta y seis! ¡Cinco... seis!",
  57: "¡Cincuenta y siete! ¡Cinco... siete!",
  58: "¡Cincuenta y ocho! ¡Cinco... ocho!",
  59: "¡Cincuenta y nueve! ¡Cinco... nueve!",
  60: "¡Sesenta! ¡Seis... cero!",
  61: "¡Sesenta y uno! ¡Seis... uno!",
  62: "¡Sesenta y dos! ¡Seis... dos!",
  63: "¡Sesenta y tres! ¡Seis... tres!",
  64: "¡Sesenta y cuatro! ¡Seis... cuatro!",
  65: "¡Sesenta y cinco! ¡El jubilado! ¡Seis... cinco!",
  66: "¡Sesenta y seis! ¡Las patas del diablo! ¡Seis... seis!",
  67: "¡Sesenta y siete! ¡Seis... siete!",
  68: "¡Sesenta y ocho! ¡Seis... ocho!",
  69: "¡Sesenta y nueve! ¡Los enamorados! ¡Seis... nueve!",
  70: "¡Setenta! ¡Siete... cero!",
  71: "¡Setenta y uno! ¡Siete... uno!",
  72: "¡Setenta y dos! ¡Siete... dos!",
  73: "¡Setenta y tres! ¡Siete... tres!",
  74: "¡Setenta y cuatro! ¡Siete... cuatro!",
  75: "¡Setenta y cinco! ¡Siete... cinco!",
  76: "¡Setenta y seis! ¡Siete... seis!",
  77: "¡Setenta y siete! ¡El doble siete! ¡Siete... siete!",
  78: "¡Setenta y ocho! ¡Siete... ocho!",
  79: "¡Setenta y nueve! ¡Siete... nueve!",
  80: "¡Ochenta! ¡Ocho... cero!",
  81: "¡Ochenta y uno! ¡Ocho... uno!",
  82: "¡Ochenta y dos! ¡Ocho... dos!",
  83: "¡Ochenta y tres! ¡Ocho... tres!",
  84: "¡Ochenta y cuatro! ¡Ocho... cuatro!",
  85: "¡Ochenta y cinco! ¡Ocho... cinco!",
  86: "¡Ochenta y seis! ¡Ocho... seis!",
  87: "¡Ochenta y siete! ¡Ocho... siete!",
  88: "¡Ochenta y ocho! ¡Los viejitos! ¡Ocho... ocho!",
  89: "¡Ochenta y nueve! ¡Ocho... nueve!",
  90: "¡Noventa! ¡Nueve... cero!",
  91: "¡Noventa y uno! ¡Nueve... uno!",
  92: "¡Noventa y dos! ¡Nueve... dos!",
  93: "¡Noventa y tres! ¡Nueve... tres!",
  94: "¡Noventa y cuatro! ¡Nueve... cuatro!",
  95: "¡Noventa y cinco! ¡Nueve... cinco!",
  96: "¡Noventa y seis! ¡Nueve... seis!",
  97: "¡Noventa y siete! ¡Nueve... siete!",
  98: "¡Noventa y ocho! ¡Nueve... ocho!",
  99: "¡Noventa y nueve! ¡El rey de los números! ¡Nueve... nueve!",
};

// ── Especiales: audios de evento único ───────────────────────────────────────
const SPECIAL = {
  bingo: "¡¡BINGO!! ¡Felicitaciones! ¡Lo lograste, ganaste el sorteo de hoy! ¡Que lo disfrutes mucho!",
};

// ── Cierres: 3 variantes, tono ameno y humano ─────────────────────────────────
const CLOSINGS = {
  cierre_1: "¡Y ahí van las bolillas! Mirá bien tu cartón... a veces el bingo está justo ahí y uno no lo ve.",
  cierre_2: "¡Qué buena partida! El bingo tiene eso especial... te tiene ahí, pendiente, y nunca sabés cuándo te va a sorprender.",
  cierre_3: "La suerte no avisa, che... en el bingo cualquier número puede cambiar todo de un momento a otro. ¡Ahí está la gracia!",
};

// ── ElevenLabs API ────────────────────────────────────────────────────────────
async function generateAudio(text, outputPath) {
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: MODEL_ID,
        voice_settings: {
          stability:         0.50,
          similarity_boost:  0.75,
          style:             0.40,
          use_speaker_boost: true,
        },
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API ${res.status}: ${err.slice(0, 200)}`);
  }

  const buf = await res.arrayBuffer();
  fs.writeFileSync(outputPath, Buffer.from(buf));
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const entries = [
    ...Object.entries(SCRIPTS).map(([n, s]) => ({ file: `${n}.mp3`, script: s })),
    ...Object.entries(CLOSINGS).map(([n, s]) => ({ file: `${n}.mp3`, script: s })),
    ...Object.entries(SPECIAL).map(([n, s]) => ({ file: `${n}.mp3`, script: s })),
  ];

  const total = entries.length;
  console.log(`\n🎙  Narrador : ${narratorName}`);
  console.log(`🔊  Voz ID   : ${voiceId}`);
  console.log(`📁  Carpeta  : ${OUTPUT_DIR}`);
  console.log(`📊  Total    : ${total} audios\n`);

  let generated = 0, skipped = 0, errors = 0;

  for (let i = 0; i < entries.length; i++) {
    const { file, script } = entries[i];
    const idx        = i + 1;
    const outputPath = path.join(OUTPUT_DIR, file);

    if (!forceRegen && fs.existsSync(outputPath)) {
      console.log(`[${idx}/${total}] ⏭  ${file} (ya existe)`);
      skipped++;
      continue;
    }

    try {
      await generateAudio(script, outputPath);
      console.log(`[${idx}/${total}] ✅ ${file}`);
      generated++;
      await sleep(DELAY_MS);
    } catch (e) {
      console.error(`[${idx}/${total}] ❌ ${file} — ${e.message}`);
      errors++;
    }
  }

  console.log('\n─────────────────────────────────────────');
  console.log(`✅ Generados : ${generated}`);
  console.log(`⏭  Saltados  : ${skipped}`);
  console.log(`❌ Errores   : ${errors}`);
  console.log(`📁 ${OUTPUT_DIR}`);
  if (errors > 0) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
