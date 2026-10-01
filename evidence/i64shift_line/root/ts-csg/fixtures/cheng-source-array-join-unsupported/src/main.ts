function score(): number {
  const parts = [1, 2, 3];
  const joined = parts.join("-");
  return joined.length;
}

export function main(): number {
  return score();
}
