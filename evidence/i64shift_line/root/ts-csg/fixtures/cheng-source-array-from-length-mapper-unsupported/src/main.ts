function score(): number {
  const bad = Array.from({ length: 2 }, () => undefined);
  return bad.length;
}

export function main(): number {
  return score();
}
