function score(): number {
  const values = Object.values("x");
  return values.length;
}

export function main(): number {
  return score();
}
