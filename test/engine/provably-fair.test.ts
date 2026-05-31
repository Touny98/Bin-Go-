import { describe, it, expect } from 'vitest';
import { ProvablyFair } from '../../src/engine/ProvablyFair';

// WS2 · Primitivo provably-fair (commit-reveal). Módulo aislado, no toca el flujo en vivo.

describe('ProvablyFair', () => {
  it('commit es sha256(serverSeed) en hex (64 chars)', () => {
    const seed = ProvablyFair.generateServerSeed();
    const hash = ProvablyFair.commit(seed);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(ProvablyFair.commit(seed)).toBe(hash); // estable
  });

  it('generateServerSeed produce 64 hex (32 bytes) y no se repite', () => {
    const a = ProvablyFair.generateServerSeed();
    const b = ProvablyFair.generateServerSeed();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });

  it('drawSequence es determinista: misma seed → misma secuencia', () => {
    const seed = 'a'.repeat(64);
    const s1 = ProvablyFair.drawSequence(seed, 99);
    const s2 = ProvablyFair.drawSequence(seed, 99);
    expect(s1).toEqual(s2);
  });

  it('drawSequence es una permutación válida de 1..maxNumber', () => {
    const seed = ProvablyFair.generateServerSeed();
    for (const max of [45, 60, 75, 99]) {
      const seq = ProvablyFair.drawSequence(seed, max);
      expect(seq).toHaveLength(max);
      expect(new Set(seq).size).toBe(max);        // sin repetidos
      expect(Math.min(...seq)).toBe(1);
      expect(Math.max(...seq)).toBe(max);
    }
  });

  it('seeds distintas dan secuencias distintas', () => {
    const s1 = ProvablyFair.drawSequence(ProvablyFair.generateServerSeed(), 99);
    const s2 = ProvablyFair.drawSequence(ProvablyFair.generateServerSeed(), 99);
    expect(s1).not.toEqual(s2);
  });

  it('publicSeed cambia el resultado (provably-fair completo)', () => {
    const seed = 'b'.repeat(64);
    const sinPublic = ProvablyFair.drawSequence(seed, 99);
    const conPublic = ProvablyFair.drawSequence(seed, 99, 'cliente-xyz');
    expect(sinPublic).not.toEqual(conPublic);
  });

  it('verify acepta el sorteo correcto y rechaza el manipulado', () => {
    const seed = ProvablyFair.generateServerSeed();
    const hash = ProvablyFair.commit(seed);
    const seq = ProvablyFair.drawSequence(seed, 99);

    expect(ProvablyFair.verify(seed, hash, 99, seq)).toBe(true);

    // hash manipulado
    expect(ProvablyFair.verify(seed, 'deadbeef'.repeat(8), 99, seq)).toBe(false);
    // secuencia manipulada (swap de dos posiciones)
    const tampered = [...seq];
    [tampered[0], tampered[1]] = [tampered[1], tampered[0]];
    expect(ProvablyFair.verify(seed, hash, 99, tampered)).toBe(false);
    // seed equivocada
    expect(ProvablyFair.verify(ProvablyFair.generateServerSeed(), hash, 99, seq)).toBe(false);
  });

  it('distribución sin sesgo grosero: la primera bolilla varía entre seeds', () => {
    const firsts = new Set<number>();
    for (let i = 0; i < 60; i++) {
      firsts.add(ProvablyFair.drawSequence(ProvablyFair.generateServerSeed(), 99)[0]);
    }
    // con 60 seeds distintas, la primera bolilla no puede ser siempre la misma
    expect(firsts.size).toBeGreaterThan(20);
  });
});
