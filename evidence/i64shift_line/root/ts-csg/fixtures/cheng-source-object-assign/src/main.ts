function score(seed: number): number {
  const base = { x: seed, y: 2 };
  const merged = Object.assign({}, base, { y: 5, z: 3 });
  return merged.x + merged.y + merged.z;
}

export function main(): number {
  return score(11);
}
