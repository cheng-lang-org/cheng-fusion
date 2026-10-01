function score(seed: number): number {
  const numbers = [seed, 4, 8];
  const copied = Array.from(numbers);
  const frozen = Object.freeze(copied);
  const words = ["alpha", "beta", "gamma"];
  const fromParam: number[] = numbers;
  const emptySlots = Array.from({ length: 4 });
  const mappedSlots = Array.from({ length: 4 }, (_, index) => index);
  return numbers.length + copied.length + frozen.length + words.length + emptySlots.length + mappedSlots.length + Math.max(fromParam.length, 0);
}

export function main(): number {
  return score(5);
}
