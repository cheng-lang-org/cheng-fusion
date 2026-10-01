function positive(value: number): boolean {
  return value > 0;
}

function truthyScore(): number {
  const mixedValues = [0, "", false, "ready"];
  const allFlags = [true, 1, "yes"];
  const hasTruthy = mixedValues.some(Boolean);
  const allTruthy = allFlags.every(Boolean);
  const shadowedBoolean = (value: unknown): boolean => value === "ready";
  const shadowedStillOpen = mixedValues.some(shadowedBoolean);
  if (!hasTruthy || !allTruthy || !shadowedStillOpen) {
    return 100;
  }
  return 0;
}

function score(seed: number): number {
  const values: [number, number, number] = [seed, 2, 3];
  const any = values.some(positive);
  const all = values.every(positive);
  if (any) {
    if (all) {
      return 11;
    }
  }
  return 2;
}

export function main(): number {
  return score(7) + truthyScore();
}
