type Point = {
  x: number;
  y: number;
  [key: string]: number;
};

export function mutate(seed: number): number {
  const point: Point = { x: seed, y: 0 };
  point.x = seed + 1;
  point["y"] = point.x + 2;
  return point.x + point["y"];
}
