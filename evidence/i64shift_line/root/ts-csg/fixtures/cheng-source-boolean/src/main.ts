function score(value: number): number {
  const present = Boolean(value);
  const confirmed = Boolean(present);
  if (present) {
    if (confirmed) {
      return value + 5;
    }
  }
  return 0;
}

export function main(): number {
  return score(7) + score(0);
}
