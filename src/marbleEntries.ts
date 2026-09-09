import { parseName } from './utils/utils';

export interface MarbleEntry {
  name: string;
  /** Normalized weight actually handed to Marble (drives skill rate/cooldown). */
  weight: number;
}

/** The weight every marble gets when no name carries a `/n` weight suffix. */
export const UNIFORM_MARBLE_WEIGHT = 0.1;

/**
 * Expands the raw textarea lines into one entry per marble.
 *
 * `이름*3` produces three entries, `이름/2` raises that name's weight. Weights
 * are normalized the same way the original setMarbles did, so a headless
 * simulation using UNIFORM_MARBLE_WEIGHT matches the live race exactly whenever
 * no explicit weights are present.
 */
export function expandNames(names: string[]): MarbleEntry[] {
  let maxWeight = -Infinity;
  let minWeight = Infinity;

  const members = names
    .map((nameString) => parseName(nameString))
    .filter((member): member is NonNullable<typeof member> => !!member)
    .map((member) => {
      if (member.weight > maxWeight) maxWeight = member.weight;
      if (member.weight < minWeight) minWeight = member.weight;
      return member;
    });

  const gap = maxWeight - minWeight;

  const entries: MarbleEntry[] = [];
  members.forEach((member) => {
    const weight = UNIFORM_MARBLE_WEIGHT + (gap ? (member.weight - minWeight) / gap : 0);
    for (let i = 0; i < member.count; i++) {
      entries.push({ name: member.name, weight });
    }
  });

  return entries;
}

/**
 * True when every marble has the same weight, which is what makes a name purely
 * cosmetic: the physics then depends only on the spawn slot, so names can be
 * assigned to slots freely without changing the race.
 */
export function hasUniformWeights(entries: MarbleEntry[]): boolean {
  return entries.every((entry) => entry.weight === UNIFORM_MARBLE_WEIGHT);
}
