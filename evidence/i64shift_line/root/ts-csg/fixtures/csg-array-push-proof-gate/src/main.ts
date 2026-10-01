function score(seed: number): number {
  let values = [seed];
  const pushed = values.push(seed + 1);
  let popValues = [seed, 4];
  const popped = popValues.pop();
  let shiftValues = [seed, 5];
  const shifted = shiftValues.shift();
  let unshiftValues = [seed];
  const unshifted = unshiftValues.unshift(seed + 2);
  return pushed + popped + shifted + unshifted;
}

export function main(): number {
  return score(3);
}
