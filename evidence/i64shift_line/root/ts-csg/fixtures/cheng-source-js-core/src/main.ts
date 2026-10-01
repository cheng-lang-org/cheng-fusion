function score(left: number, right: number): number {
  const high = Math.max(left, right, 7);
  const low = Math.min(left, right, 3);
  const magnitude = Math.abs(0 - low);
  const normalized = Math.floor(high) + Math.ceil(low) + Math.trunc(4) + Math.round(5);
  return normalized + magnitude;
}

export function main(): number {
  return score(9, 4);
}
