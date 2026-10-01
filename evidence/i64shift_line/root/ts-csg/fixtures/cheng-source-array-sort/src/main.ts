function cmp(left: number, right: number): number {
  return left - right;
}

function score(seed: number): number {
  const values = [seed + 3, 1, seed];
  const sorted = values.sort(cmp);
  return sorted[0] + sorted[1] + sorted[2] + values[0];
}

export function main(): number {
  return score(3);
}
