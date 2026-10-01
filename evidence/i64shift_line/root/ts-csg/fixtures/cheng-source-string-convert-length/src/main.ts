function score(seed: number): number {
  const numberLen = String(seed).length;
  const negativeLen = String(0 - seed).length;
  const zeroLen = String(0).length;
  const boolLen = String(seed > 0).length;
  const literalLen = String("abc").length;
  return numberLen + negativeLen + zeroLen + boolLen + literalLen;
}

export function main(): number {
  return score(37);
}
