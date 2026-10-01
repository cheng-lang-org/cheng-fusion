function numberValue(seed: number): number {
  return seed + 1;
}

function boolValue(seed: number): boolean {
  return seed > 0;
}

function stringValue(seed: number): string {
  return seed > 0 ? "yes" : "no";
}

export function main(): number {
  const numberText = String(numberValue(1));
  const boolText = String(boolValue(1));
  const stringText = String(stringValue(1));
  const nullText = String(null);
  const undefinedText = String(undefined);
  return numberText.length + boolText.length + stringText.length + nullText.length + undefinedText.length;
}
