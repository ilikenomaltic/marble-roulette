import type { StageDef } from './data/maps';
import type { MapEntityState } from './types/MapEntity.type';

export interface IPhysics {
  init(): Promise<void>;
  /** Fixes every physics-affecting random draw, keyed by marble slot id. */
  setSeed(seed: number): void;
  clear(): void;
  clearMarbles(): void;
  createStage(stage: StageDef): void;
  createMarble(id: number, x: number, y: number): void;
  shakeMarble(id: number): void;
  removeMarble(id: number): void;
  getMarblePosition(id: number): { x: number; y: number; angle: number };
  getEntities(): MapEntityState[];
  impact(id: number): void;
  applyImpulse(id: number, forceX: number, forceY: number): void;
  start(): void;
  step(deltaSeconds: number): void;
}
