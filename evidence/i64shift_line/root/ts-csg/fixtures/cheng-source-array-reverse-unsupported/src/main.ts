function score(input: number[]): number {
  const reversed = input.reverse();
  return reversed.length;
}

export function main(): number {
  return score([1, 2, 3]);
}
