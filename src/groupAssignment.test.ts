import { describe, expect, it } from 'vitest';
import { assignNamesToSlots, type Pair } from './groupAssignment';
import { createRng } from './utils/rng';

/** Rebuilds the groups the app would display from an assignment. */
function groupsFromAssignment(names: string[], slotOf: number[], arrivalOrder: number[], groupSize: number) {
  const nameOfSlot = new Map<number, string>();
  names.forEach((name, i) => nameOfSlot.set(slotOf[i], name));
  const ranked = arrivalOrder.map((slot) => nameOfSlot.get(slot)!);
  const groups: string[][] = [];
  for (let i = 0; i < ranked.length; i += groupSize) {
    groups.push(ranked.slice(i, i + groupSize));
  }
  return groups;
}

function sameGroup(groups: string[][], a: string, b: string) {
  return groups.some((group) => group.includes(a) && group.includes(b));
}

const names6 = ['1번', '2번', '3번', '4번', '5번', '6번'];
const arrival6 = [3, 0, 5, 1, 4, 2];

describe('assignNamesToSlots', () => {
  it('should place a together-pair in the same group', () => {
    const result = assignNamesToSlots({
      names: names6,
      arrivalOrder: arrival6,
      groupSize: 3,
      togetherPairs: [['1번', '5번']],
      conflictPairs: [],
      rng: createRng(1),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const groups = groupsFromAssignment(names6, result.slotOf, arrival6, 3);
    expect(sameGroup(groups, '1번', '5번')).toBe(true);
  });

  it('should keep a conflict-pair in different groups', () => {
    const result = assignNamesToSlots({
      names: names6,
      arrivalOrder: arrival6,
      groupSize: 3,
      togetherPairs: [],
      conflictPairs: [['1번', '2번']],
      rng: createRng(2),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const groups = groupsFromAssignment(names6, result.slotOf, arrival6, 3);
    expect(sameGroup(groups, '1번', '2번')).toBe(false);
  });

  it('should satisfy together and conflict constraints at the same time', () => {
    const names = Array.from({ length: 12 }, (_, i) => `${i + 1}번`);
    const arrival = [7, 2, 11, 0, 5, 9, 3, 1, 8, 4, 10, 6];
    const together: Pair[] = [
      ['1번', '2번'],
      ['5번', '9번'],
    ];
    const conflict: Pair[] = [
      ['1번', '3번'],
      ['5번', '12번'],
    ];

    const result = assignNamesToSlots({
      names,
      arrivalOrder: arrival,
      groupSize: 4,
      togetherPairs: together,
      conflictPairs: conflict,
      rng: createRng(3),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const groups = groupsFromAssignment(names, result.slotOf, arrival, 4);
    expect(sameGroup(groups, '1번', '2번')).toBe(true);
    expect(sameGroup(groups, '5번', '9번')).toBe(true);
    expect(sameGroup(groups, '1번', '3번')).toBe(false);
    expect(sameGroup(groups, '5번', '12번')).toBe(false);
  });

  it('should chain transitive together-pairs into one group', () => {
    const result = assignNamesToSlots({
      names: names6,
      arrivalOrder: arrival6,
      groupSize: 3,
      togetherPairs: [
        ['1번', '2번'],
        ['2번', '3번'],
      ],
      conflictPairs: [],
      rng: createRng(4),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const groups = groupsFromAssignment(names6, result.slotOf, arrival6, 3);
    expect(sameGroup(groups, '1번', '3번')).toBe(true);
  });

  it('should give every name exactly one slot', () => {
    const result = assignNamesToSlots({
      names: names6,
      arrivalOrder: arrival6,
      groupSize: 3,
      togetherPairs: [['1번', '6번']],
      conflictPairs: [['2번', '3번']],
      rng: createRng(5),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(new Set(result.slotOf).size).toBe(names6.length);
    expect(result.slotOf.slice().sort((a, b) => a - b)).toEqual(arrival6.slice().sort((a, b) => a - b));
  });

  it('should reject a together-group larger than the group size', () => {
    const result = assignNamesToSlots({
      names: names6,
      arrivalOrder: arrival6,
      groupSize: 2,
      togetherPairs: [
        ['1번', '2번'],
        ['2번', '3번'],
      ],
      conflictPairs: [],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain('조 인원');
  });

  it('should reject a pair that is both together and in conflict', () => {
    const result = assignNamesToSlots({
      names: names6,
      arrivalOrder: arrival6,
      groupSize: 3,
      togetherPairs: [['1번', '2번']],
      conflictPairs: [['1번', '2번']],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain('갈등');
  });

  it('should reject conflicts that cannot fit in the available groups', () => {
    // 4명, 2인 1조 → 조는 2개뿐인데 서로 전부 갈등이면 배치 불가
    const names = ['가', '나', '다', '라'];
    const result = assignNamesToSlots({
      names,
      arrivalOrder: [0, 1, 2, 3],
      groupSize: 2,
      togetherPairs: [],
      conflictPairs: [
        ['가', '나'],
        ['가', '다'],
        ['가', '라'],
        ['나', '다'],
        ['나', '라'],
        ['다', '라'],
      ],
    });

    expect(result.ok).toBe(false);
  });

  it('should report names that are not in the participant list', () => {
    const result = assignNamesToSlots({
      names: names6,
      arrivalOrder: arrival6,
      groupSize: 3,
      togetherPairs: [['철수', '영희']],
      conflictPairs: [],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain('철수');
  });

  it('should handle a leftover group smaller than the group size', () => {
    const names = ['가', '나', '다', '라', '마'];
    const arrival = [4, 1, 0, 3, 2];
    const result = assignNamesToSlots({
      names,
      arrivalOrder: arrival,
      groupSize: 2,
      togetherPairs: [['가', '나']],
      conflictPairs: [],
      rng: createRng(6),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const groups = groupsFromAssignment(names, result.slotOf, arrival, 2);
    expect(sameGroup(groups, '가', '나')).toBe(true);
    expect(groups.map((g) => g.length)).toEqual([2, 2, 1]);
  });

  it('should spread constrained pairs across groups instead of always using the first ones', () => {
    // A pair that lands in group 1 every single race is a pattern an observer
    // would spot, so placement has to move around.
    const names = Array.from({ length: 15 }, (_, i) => `${i + 1}번`);
    const arrival = Array.from({ length: 15 }, (_, i) => i);
    const groupIndexes = new Set<number>();

    for (let seed = 0; seed < 40; seed++) {
      const result = assignNamesToSlots({
        names,
        arrivalOrder: arrival,
        groupSize: 3,
        togetherPairs: [['1번', '2번']],
        conflictPairs: [],
        rng: createRng(seed),
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const groups = groupsFromAssignment(names, result.slotOf, arrival, 3);
      const index = groups.findIndex((group) => group.includes('1번') && group.includes('2번'));
      expect(index).toBeGreaterThanOrEqual(0);
      groupIndexes.add(index);
    }

    expect(groupIndexes.size).toBeGreaterThan(2);
  });

  it('should work with no constraints at all', () => {
    const result = assignNamesToSlots({
      names: names6,
      arrivalOrder: arrival6,
      groupSize: 3,
      togetherPairs: [],
      conflictPairs: [],
      rng: createRng(7),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(new Set(result.slotOf).size).toBe(6);
  });
});
