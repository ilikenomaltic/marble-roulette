import type { Rng } from './utils/rng';

export type Pair = [string, string];

export interface AssignmentRequest {
  /** One entry per marble, in the order the caller will hand them to Roulette. */
  names: string[];
  /** Spawn slot ids in finishing order, first place first. */
  arrivalOrder: number[];
  groupSize: number;
  /** Names that must share a group. */
  togetherPairs: Pair[];
  /** Names that must not share a group. */
  conflictPairs: Pair[];
  rng?: Rng;
}

export type AssignmentResult =
  | { ok: true; slotOf: number[]; groups: string[][] }
  | { ok: false; reason: string };

/**
 * Decides which spawn slot each name starts from.
 *
 * The race itself is never touched: with uniform weights the physics depends
 * only on the slot, so the finishing order of *slots* is already fixed by the
 * pre-simulation. Choosing which name occupies which slot therefore decides the
 * groups without altering a single rank — the displayed order stays exactly
 * what the marbles did, and grouping stays plain consecutive chunks.
 */
export function assignNamesToSlots(request: AssignmentRequest): AssignmentResult {
  const { names, arrivalOrder, groupSize, togetherPairs, conflictPairs } = request;
  const rng = request.rng ?? Math.random;

  if (groupSize < 1) return { ok: false, reason: '조 인원은 1명 이상이어야 합니다.' };
  if (names.length !== arrivalOrder.length) {
    return { ok: false, reason: '참가자 수와 시뮬레이션 결과 수가 다릅니다.' };
  }

  const nameSet = new Set(names);
  const duplicated = names.length !== nameSet.size;

  const relevant = [...togetherPairs, ...conflictPairs].flat();
  const unknown = relevant.filter((name) => !nameSet.has(name));
  if (unknown.length > 0) {
    return { ok: false, reason: `참가자 명단에 없는 이름이 있습니다: ${[...new Set(unknown)].join(', ')}` };
  }
  if (duplicated && relevant.length > 0) {
    return { ok: false, reason: '중복된 이름이 있으면 짝/갈등 설정을 적용할 수 없습니다.' };
  }

  // Bins are the consecutive chunks the finishing order already forms.
  const bins: number[][] = [];
  for (let i = 0; i < arrivalOrder.length; i += groupSize) {
    bins.push(arrivalOrder.slice(i, i + groupSize));
  }

  const clusters = buildClusters(names, togetherPairs);

  const oversized = clusters.find((cluster) => cluster.length > groupSize);
  if (oversized) {
    return {
      ok: false,
      reason: `같은 조로 묶인 인원(${oversized.length}명)이 조 인원(${groupSize}명)보다 많습니다: ${oversized.join(', ')}`,
    };
  }

  const conflicts = buildConflictMap(conflictPairs);
  const internalConflict = clusters.find((cluster) =>
    cluster.some((a) => cluster.some((b) => a !== b && conflicts.get(a)?.has(b)))
  );
  if (internalConflict) {
    return {
      ok: false,
      reason: `같은 조로 묶여야 하는데 동시에 갈등 쌍으로 지정된 이름이 있습니다: ${internalConflict.join(', ')}`,
    };
  }

  const placement = placeClusters(clusters, bins, conflicts, rng);
  if (!placement) {
    return { ok: false, reason: '설정한 조건을 모두 만족하는 조 편성을 찾지 못했습니다. 조건을 줄여 주세요.' };
  }

  const slotOf = new Array<number>(names.length);
  const indicesByName = new Map<string, number[]>();
  names.forEach((name, index) => {
    const list = indicesByName.get(name);
    if (list) list.push(index);
    else indicesByName.set(name, [index]);
  });

  const groups: string[][] = [];
  placement.forEach((members, binIndex) => {
    const slots = shuffled(bins[binIndex], rng);
    groups.push(members.slice());
    members.forEach((name, i) => {
      const queue = indicesByName.get(name)!;
      slotOf[queue.shift()!] = slots[i];
    });
  });

  return { ok: true, slotOf, groups };
}

/** Union-find over the together-pairs: each cluster must land in one bin. */
function buildClusters(names: string[], togetherPairs: Pair[]): string[][] {
  const parent = new Map<string, string>();
  names.forEach((name) => parent.set(name, name));

  const find = (name: string): string => {
    let root = name;
    while (parent.get(root) !== root) root = parent.get(root)!;
    let cursor = name;
    while (parent.get(cursor) !== root) {
      const next = parent.get(cursor)!;
      parent.set(cursor, root);
      cursor = next;
    }
    return root;
  };

  togetherPairs.forEach(([a, b]) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent.set(rootA, rootB);
  });

  const byRoot = new Map<string, string[]>();
  const seen = new Set<string>();
  names.forEach((name) => {
    if (seen.has(name)) return;
    seen.add(name);
    const root = find(name);
    const list = byRoot.get(root);
    if (list) list.push(name);
    else byRoot.set(root, [name]);
  });

  return [...byRoot.values()];
}

function buildConflictMap(conflictPairs: Pair[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  const add = (a: string, b: string) => {
    const set = map.get(a);
    if (set) set.add(b);
    else map.set(a, new Set([b]));
  };
  conflictPairs.forEach(([a, b]) => {
    add(a, b);
    add(b, a);
  });
  return map;
}

/**
 * Places clusters into bins, largest first, backtracking when a bin cannot take
 * a cluster because of a conflict. Class-sized inputs make this instant.
 */
function placeClusters(
  clusters: string[][],
  bins: number[][],
  conflicts: Map<string, Set<string>>,
  rng: Rng
): string[][] | null {
  const constrained = clusters.filter((cluster) => cluster.length > 1 || hasConflict(cluster[0], conflicts));
  const free = clusters.filter((cluster) => !constrained.includes(cluster));

  // Bigger and more-constrained clusters first: they are the hardest to place.
  // Shuffled before the sort so equally sized clusters do not keep the same
  // relative order between races.
  const ordered = shuffled(constrained, rng).sort((a, b) => b.length - a.length);
  const result: string[][] = bins.map(() => []);

  const place = (index: number): boolean => {
    if (index >= ordered.length) return true;
    const cluster = ordered[index];
    // Bins are tried in a random order: filling from the front every time would
    // park the configured pairs in the first groups race after race, which is
    // exactly the kind of pattern an observer would notice.
    for (const binIndex of shuffled(
      bins.map((_, i) => i),
      rng
    )) {
      const bin = result[binIndex];
      if (bin.length + cluster.length > bins[binIndex].length) continue;
      if (bin.some((existing) => cluster.some((candidate) => conflicts.get(existing)?.has(candidate)))) continue;
      bin.push(...cluster);
      if (place(index + 1)) return true;
      bin.length -= cluster.length;
    }
    return false;
  };

  if (!place(0)) return null;

  // Unconstrained names fill whatever room is left, in random order so the
  // line-up still looks arbitrary.
  const leftovers = shuffled(free.flat(), rng);
  let cursor = 0;
  for (let binIndex = 0; binIndex < result.length && cursor < leftovers.length; binIndex++) {
    while (result[binIndex].length < bins[binIndex].length && cursor < leftovers.length) {
      result[binIndex].push(leftovers[cursor++]);
    }
  }

  return cursor === leftovers.length ? result : null;
}

function hasConflict(name: string, conflicts: Map<string, Set<string>>): boolean {
  return (conflicts.get(name)?.size ?? 0) > 0;
}

function shuffled<T>(items: T[], rng: Rng): T[] {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
