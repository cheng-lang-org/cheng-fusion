type Channel = "join" | "sync";

function uniqueNames(values: string[]): number {
  const unique = Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
  return unique.length;
}

function selectedCount(selected: Set<string>): number {
  const ids = Array.from(selected);
  return ids.length;
}

function channelCount(selected: Set<Channel>): number {
  return Array.from(selected).length;
}

function unsupportedNumbers(values: number[]): number {
  return Array.from(new Set(values)).length;
}

export function main(): number {
  return uniqueNames([" alpha ", "alpha", "beta"]) +
    selectedCount(new Set(["join", "sync"])) +
    channelCount(new Set<Channel>(["join"])) +
    unsupportedNumbers([1, 1, 2]);
}
