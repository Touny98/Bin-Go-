export interface NarratorConfig {
  narrator: string;
  alternateNarrator?: string;
  rotateEveryWeeks?: number;
}

export const NARRATOR_CONFIG: Record<string, NarratorConfig> = {
  'SALE_O_SALE':  { narrator: 'narrador-1' },
  'DIARIA':       { narrator: 'narrador-1' },
  'ACCUMULATIVE': {
    narrator:           'narrador-1',
    // Cuando tengas una segunda voz, descomentá estas dos líneas:
    // alternateNarrator: 'narrador-2',
    // rotateEveryWeeks:  2,
  },
};

export function getNarratorFolder(gameMode: string): string {
  const cfg = NARRATOR_CONFIG[gameMode];
  if (!cfg) return 'narrador-1';

  if (cfg.alternateNarrator && cfg.rotateEveryWeeks) {
    const week = getISOWeek(new Date());
    const period = Math.floor(week / cfg.rotateEveryWeeks);
    return period % 2 === 0 ? cfg.narrator : cfg.alternateNarrator;
  }

  return cfg.narrator;
}

function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}
