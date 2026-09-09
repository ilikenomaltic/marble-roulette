export interface EntityStyle {
  fill: string;
  outline: string;
  bloom: string;
  bloomRadius: number;
}

export interface ColorTheme {
  background: string;
  marbleLightness: number;
  marbleWinningBorder: string;
  skillColor: string;
  coolTimeIndicator: string;
  entity: {
    box: EntityStyle;
    circle: EntityStyle;
    polyline: EntityStyle;
  };
  rankStroke: string;
  minimapBackground: string;
  minimapViewport: string;
  winnerBackground: string;
  winnerOutline: string;
  winnerText: string;
}
