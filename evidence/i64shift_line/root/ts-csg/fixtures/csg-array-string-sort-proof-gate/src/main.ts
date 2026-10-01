function localDefaultSort(): number {
  const values = ["beta", "alpha-2", "gamma", "alpha"];
  const sorted = values.sort();
  return sorted.length + values.length;
}

function denseDefaultSorts(): number {
  const fromKeys = Object.keys({ beta: 2, alpha: 1 }).sort();
  const handlers = new Map<string, number>([
    ["join", 1],
    ["invite", 2],
  ]);
  const aliases = new Map<string, number>([
    ["sync", 3],
  ]);
  const fromArray = Array.from(handlers.keys()).sort();
  const fromSpread = [...handlers.keys(), ...aliases.keys()].sort();
  return fromKeys.length + fromArray.length + fromSpread.length;
}

function passthroughStrings(values: string[]): string[] {
  return values;
}

function typedStringArrayDefaultSort(values: string[]): number {
  const sorted = values.sort();
  return sorted.length;
}

function typedStringCallDefaultSort(values: string[]): number {
  const sorted = passthroughStrings(values).sort();
  return sorted.length;
}

function compareStringDefault(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}

function inlineStringComparatorDefaultSort(values: string[]): number {
  const sorted = values.sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
  return sorted.length;
}

function namedStringComparatorDefaultSort(left: string, right: string): number {
  const sorted = [left, right].sort(compareStringDefault);
  return sorted.length;
}

function dynamicMapCopyOpen(): number {
  const base = new Map<string, number>([
    ["join", 1],
  ]);
  const copy = new Map(base);
  return copy.size;
}

function unsupportedComparator(): number {
  const values = ["beta", "alpha"];
  return values.sort((left, right) => left.localeCompare(right)).length;
}

export function main(): number {
  return localDefaultSort() +
    denseDefaultSorts() +
    typedStringArrayDefaultSort(["delta", "alpha"]) +
    typedStringCallDefaultSort(["echo", "bravo"]) +
    inlineStringComparatorDefaultSort(["charlie", "alpha"]) +
    namedStringComparatorDefaultSort("foxtrot", "alpha") +
    dynamicMapCopyOpen() +
    unsupportedComparator();
}
