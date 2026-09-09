import type { RenderParameters } from './rouletteRenderer';
import type { Rect } from './types/rect.type';

export interface MouseEventArgs {
  x: number;
  y: number;
  button?: number;
}

/** A screen-space overlay drawn on top of the scene (rank list, minimap, ...). */
export interface UIObject {
  update(deltaTime: number): void;
  render(ctx: CanvasRenderingContext2D, params: RenderParameters, width: number, height: number): void;
  /** Null means the object is not clickable / covers no area. */
  getBoundingBox(): Rect | null;

  onWheel?(e: WheelEvent): void;
  onMouseDown?(e?: MouseEventArgs): void;
  onMouseUp?(e?: MouseEventArgs): void;
  onMouseMove?(e?: MouseEventArgs): void;
  onDblClick?(e?: MouseEventArgs): void;
  onMessage?(func: (msg: string) => void): void;
}
