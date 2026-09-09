/** Optional per-entity rendering overrides; physics ignores these. */
interface ShapeStyle {
  color?: string;
  bloomColor?: string;
}

export type MapShape =
  | ({ type: 'box'; width: number; height: number; rotation: number } & ShapeStyle)
  | ({ type: 'circle'; radius: number; rotation?: number } & ShapeStyle)
  | ({ type: 'polyline'; points: [number, number][]; rotation: number } & ShapeStyle);

export type MapEntityProps = {
  density: number;
  restitution: number;
  angularVelocity: number;
  life?: number;
};

export type MapEntity = {
  type: 'static' | 'kinematic';
  position: { x: number; y: number };
  shape: MapShape;
  props: MapEntityProps;
};

export type MapEntityState = {
  x: number;
  y: number;
  angle: number;
  shape: MapShape;
  life: number;
};
