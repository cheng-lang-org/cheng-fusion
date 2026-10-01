function score(seed: number): number {
  const values = [seed, 4];
  const pushed = values.push(9, seed + 1);
  const popped = values.pop();
  const shifted = values.shift();
  const unshifted = values.unshift(2);
  const filled = values.fill(seed);
  return pushed + popped + shifted + unshifted + filled[0] + values[1] + filled[2];
}

export function main(): number {
  return score(3);
}
