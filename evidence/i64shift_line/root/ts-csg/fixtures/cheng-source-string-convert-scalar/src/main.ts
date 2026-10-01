function seedNumber(seed: number): number {
  return seed - 74;
}

function seedBool(seed: number): boolean {
  return seed > 0;
}

function seedString(seed: number): string {
  if (seed > 0) {
    return "live";
  }
  return "cold";
}

function score(seed: number): number {
  const numberText = String(seedNumber(seed));
  const boolText = String(seedBool(seed));
  const stringText = String(seedString(seed));
  const literalText = String("abc");
  const nullText = String(null);
  const undefinedText = String(undefined);
  const emptyText = String();
  if (numberText !== "-37") return 1;
  if (boolText !== "true") return 2;
  if (stringText !== "live") return 3;
  if (literalText !== "abc") return 4;
  if (nullText !== "null") return 5;
  if (undefinedText !== "undefined") return 6;
  if (emptyText !== "") return 7;
  return 0;
}

export function main(): number {
  return score(37);
}
