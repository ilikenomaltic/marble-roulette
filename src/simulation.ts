import type { StageDef } from './data/maps';
import { Marble } from './marble';
import { UNIFORM_MARBLE_WEIGHT } from './marbleEntries';
import { Box2dPhysics } from './physics-box2d';
import { RaceCore } from './raceCore';

/** Safety valve: ~10 minutes of race time. A normal race is far shorter. */
const MAX_STEPS = 60000;

export interface SimulationResult {
  /** Spawn slot ids, first place first. */
  arrival: number[];
  steps: number;
  /** False when the race hit MAX_STEPS with marbles still in play. */
  completed: boolean;
}

/**
 * Runs a race with no rendering, to learn which spawn slots finish where.
 *
 * The marbles here are anonymous — only their slot matters — which is exactly
 * why the prediction is usable: with uniform weights the physics is a pure
 * function of (seed, marble count, stage), so the visible race that follows
 * reproduces this arrival order regardless of which name sits on which slot.
 */
export class RaceSimulator {
  private physics: Box2dPhysics | null = null;

  get isReady(): boolean {
    return this.physics !== null;
  }

  async init(): Promise<void> {
    if (this.physics) return;
    const physics = new Box2dPhysics();
    await physics.init();
    this.physics = physics;
  }

  simulate(opts: { seed: number; marbleCount: number; stage: StageDef; winnerRank?: number }): SimulationResult {
    const physics = this.physics;
    if (!physics) throw new Error('RaceSimulator.init() must be awaited before simulate()');

    const { seed, marbleCount, stage } = opts;

    // clear() rebuilds the world, which is what makes repeated runs comparable.
    physics.clear();
    physics.setSeed(seed);
    physics.createStage(stage);

    const core = new RaceCore(physics);
    core.stage = stage;
    core.totalMarbleCount = marbleCount;
    core.winnerRank = Math.min(opts.winnerRank ?? 0, Math.max(0, marbleCount - 1));

    for (let slot = 0; slot < marbleCount; slot++) {
      core.marbles.push(new Marble(physics, slot, marbleCount, undefined, UNIFORM_MARBLE_WEIGHT, seed));
    }

    core.start();

    let steps = 0;
    while (!core.finished && steps < MAX_STEPS) {
      core.step();
      steps++;
    }

    return {
      arrival: core.winners.map((marble) => marble.id),
      steps,
      completed: core.finished,
    };
  }
}
