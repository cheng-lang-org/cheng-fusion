function score(seed: number): number {
  const point = Object.freeze({ x: seed, y: 5, z: seed + 2 });
  const values = Object.values(point);
  const frozen = Object.isFrozen(point);
  const valuesFrozen = Object.isFrozen(values);
  if (frozen) {
    if (valuesFrozen) {
      return 0;
    }
    return values[0] + values[1] + values[2];
  }
  return 0;
}

export function main(): number {
  return score(7);
}
