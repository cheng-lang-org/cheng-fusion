function score(seed: number): number {
  const raw: [number, number, number] = [3, 5, 7];
  const values = Object.freeze(raw);
  const alias = Object.freeze(values);
  const point: { readonly x: number; readonly y: number } = Object.freeze({ x: seed + alias[0], y: alias[2] });
  const same: { readonly x: number; readonly y: number } = Object.freeze(point);
  if (Array.isArray(values)) {
    if (Array.isArray(alias)) {
      return same.x + same.y + values.length + alias[1];
    }
  }
  return 0;
}

export function main(): number {
  return score(11);
}
