function score(seed: number): number {
  const values: [number, number, number, number] = [seed, 4, 8, 16];
  const middle = values.slice(1, 3);
  const tail = values.slice(-2);
  return middle[0] + middle[1] + tail[0] + tail[1];
}

export function main(): number {
  return score(2);
}
