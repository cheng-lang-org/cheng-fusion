function stringMapValues(): number {
  const counts = new Map<string, number>([
    ["join", 1],
    ["invite", 2],
  ]);
  const values = Array.from(counts.values());
  return values.length + values[0] + values[1];
}

function stringSetValues(): number {
  const selected = new Set<string>(["join", "invite", "join"]);
  const values = Array.from(selected.values());
  return values.length;
}

function unsupportedNumberKeyMapValues(): number {
  const counts = new Map<number, number>([
    [1, 2],
  ]);
  return Array.from(counts.values()).length;
}

function unsupportedNumberSetValues(): number {
  return Array.from(new Set([1, 2]).values()).length;
}

export function main(): number {
  return stringMapValues() +
    stringSetValues() +
    unsupportedNumberKeyMapValues() +
    unsupportedNumberSetValues();
}
