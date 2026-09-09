import type { ColorTheme } from './types/ColorTheme';

/** Something that lives for a while on the scene and then destroys itself. */
export interface GameObject {
  isDestroy: boolean;
  update(deltaTime: number): void;
  render(ctx: CanvasRenderingContext2D, zoom: number, theme: ColorTheme): void;
}
