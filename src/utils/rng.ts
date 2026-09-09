/**
 * Seeded RNG utilities.
 *
 * The race outcome must be reproducible: a headless pre-simulation predicts the
 * finishing order, and the visible race has to reproduce it exactly. Every
 * random draw that affects physics therefore has to come from a seed instead of
 * Math.random().
 *
 * Draws are keyed by spawn slot id, never by creation order, so that changing
 * which name sits on which marble cannot perturb the simulation.
 */

/** Mixes two 32-bit integers into a well-distributed 32-bit hash. */
export function hashInt(a: number, b: number): number {
  let h = (a ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ b, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

/** A single stateless draw in [0, 1) for a (seed, key) pair. */
export function hashRandom(seed: number, key: number): number {
  return hashInt(seed, key) / 4294967296;
}

export type Rng = () => number;

/** mulberry32 — small, fast, good enough for simulation jitter. */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** An independent stream per (seed, slot), so marbles never share state. */
export function createSlotRng(seed: number, slot: number): Rng {
  return createRng(hashInt(seed, slot));
}

export function randomSeed(): number {
  return (Math.random() * 0xffffffff) >>> 0;
}
