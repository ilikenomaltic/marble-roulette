export type MapShape =
  | { type: 'box'; width: number; height: number; rotation: number }
  | { type: 'circle'; radius: number; rotation?: number }
  | { type: 'polyline'; points: [number, number][]; rotation: number };

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
