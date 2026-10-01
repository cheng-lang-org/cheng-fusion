function score(raw: string): number {
  const trimmed = raw.trim();
  return trimmed.length;
}

export function main(): number {
  return score(" x ");
}
