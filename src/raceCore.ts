import { Skills, zoomThreshold } from './data/constants';
import type { StageDef } from './data/maps';
import type { IPhysics } from './IPhysics';
import { Marble } from './marble';

/** One simulation tick, in milliseconds of race time. */
export const UPDATE_INTERVAL = 10;

/** Wall-clock delay the original code used before despawning a finished marble. */
const REMOVAL_DELAY_STEPS = 50;

export interface RaceCoreHooks {
  /** A marble triggered its Impact skill (physics is applied by the core). */
  onSkill?(marble: Marble): void;
  /** The marble that settles the configured winning rank crossed the goal. */
  onWinner?(marble: Marble): void;
  /** Every marble has crossed the goal. */
  onAllFinished?(winners: Marble[]): void;
}

/**
 * The deterministic part of a race: physics stepping, skills, goal detection.
 *
 * Both the visible race and the headless pre-simulation drive this same class,
 * so a prediction made headlessly holds for the race the user actually watches.
 * Nothing in here may depend on wall-clock time or frame rate — the state
 * sequence must be a pure function of (seed, marble count, stage).
 */
export class RaceCore {
  marbles: Marble[] = [];
  winners: Marble[] = [];
  stage: StageDef | null = null;
  winnerRank = 0;
  totalMarbleCount = 0;

  timeScale = 1;
  goalDist = Infinity;

  private stepCount = 0;
  private pendingRemovals: { id: number; atStep: number }[] = [];
  private allFinishedFired = false;
  private isRunning = false;

  constructor(
    readonly physics: IPhysics,
    private hooks: RaceCoreHooks = {}
  ) {}

  get finished(): boolean {
    return this.allFinishedFired;
  }

  /** Arrival order, first place first. */
  get arrivalOrder(): Marble[] {
    return this.winners;
  }

  reset() {
    this.marbles = [];
    this.winners = [];
    this.stepCount = 0;
    this.pendingRemovals = [];
    this.allFinishedFired = false;
    this.isRunning = false;
    this.timeScale = 1;
    this.goalDist = Infinity;
  }

  start() {
    this.isRunning = true;
    this.physics.start();
    this.marbles.forEach((marble) => (marble.isActive = true));
  }

  stop() {
    this.isRunning = false;
  }

  /** Advances the race by exactly one UPDATE_INTERVAL. */
  step() {
    if (!this.stage) return;

    // Recomputed every step (not once per frame) so the step sequence cannot
    // depend on how many steps a given frame happened to run.
    const interval = (UPDATE_INTERVAL / 1000) * this.timeScale;
    this.physics.step(interval);

    if (this.marbles.length > 1) {
      this.marbles.sort((a, b) => b.y - a.y);
    }

    this.updateMarbles(UPDATE_INTERVAL);

    this.stepCount++;
    this.processPendingRemovals();
  }

  private updateMarbles(deltaTime: number) {
    const stage = this.stage;
    if (!stage) return;

    for (let i = 0; i < this.marbles.length; i++) {
      const marble = this.marbles[i];
      marble.update(deltaTime);

      if (marble.skill === Skills.Impact) {
        this.hooks.onSkill?.(marble);
        this.physics.impact(marble.id);
      }

      if (marble.y > stage.goalY) {
        this.winners.push(marble);

        if (this.isRunning && this.winners.length === this.winnerRank + 1) {
          this.isRunning = false;
          this.hooks.onWinner?.(marble);
        } else if (
          this.isRunning &&
          this.winnerRank === this.winners.length &&
          this.winnerRank === this.totalMarbleCount - 1
        ) {
          this.isRunning = false;
          this.hooks.onWinner?.(this.marbles[i + 1]);
        }

        this.pendingRemovals.push({ id: marble.id, atStep: this.stepCount + REMOVAL_DELAY_STEPS });

        if (!this.allFinishedFired && this.winners.length >= this.totalMarbleCount) {
          this.allFinishedFired = true;
          this.hooks.onAllFinished?.(this.winners);
        }
      }
    }

    const targetIndex = this.winnerRank - this.winners.length;
    const topY = this.marbles[targetIndex] ? this.marbles[targetIndex].y : 0;
    this.goalDist = Math.abs(stage.zoomY - topY);
    this.timeScale = this.calcTimeScale();

    this.marbles = this.marbles.filter((marble) => marble.y <= stage.goalY);
  }

  /** Slows the race down as the decisive marble approaches the goal. */
  private calcTimeScale(): number {
    const stage = this.stage;
    if (!stage) return 1;
    const targetIndex = this.winnerRank - this.winners.length;
    if (this.winners.length < this.winnerRank + 1 && this.goalDist < zoomThreshold) {
      if (
        this.marbles[targetIndex] &&
        this.marbles[targetIndex].y > stage.zoomY - zoomThreshold * 1.2 &&
        (this.marbles[targetIndex - 1] || this.marbles[targetIndex + 1])
      ) {
        return Math.max(0.2, this.goalDist / zoomThreshold);
      }
    }
    return 1;
  }

  /**
   * Despawns marbles a fixed number of steps after they finish. The original
   * code used setTimeout, which never fires inside a headless loop and made the
   * result depend on wall-clock timing.
   */
  private processPendingRemovals() {
    if (this.pendingRemovals.length === 0) return;
    const due = this.pendingRemovals.filter((entry) => entry.atStep <= this.stepCount);
    if (due.length === 0) return;
    due.forEach((entry) => this.physics.removeMarble(entry.id));
    this.pendingRemovals = this.pendingRemovals.filter((entry) => entry.atStep > this.stepCount);
  }
}
