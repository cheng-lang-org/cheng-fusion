function aggregate(seed: number): number {
  const values: [number, number, number] = [2, 4, 6];
  const point = { x: seed + values[0], y: values[2] };
  return point["x"] + point["y"] + values.length + values[1];
}

export function main(): number {
  return aggregate(5);
}
