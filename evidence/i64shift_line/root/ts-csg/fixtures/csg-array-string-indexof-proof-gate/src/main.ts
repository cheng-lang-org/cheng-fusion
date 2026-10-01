type Channel = "home" | "games" | "profile";

const RING = ["north", "east", "south", "west"] as const;

type NamedNeedle = {
  key: string;
};

function stringArrayIndex(values: string[], needle: string): number {
  return values.indexOf(needle);
}

function readonlyStringArrayIndex(values: readonly string[], needle: string): number {
  return values.indexOf(needle);
}

function tupleStringIndex(needle: (typeof RING)[number]): number {
  return RING.indexOf(needle);
}

function unionStringIndex(values: Channel[], needle: Channel): number {
  return values.indexOf(needle);
}

function propertyNeedleIndex(values: string[], needle: NamedNeedle): number {
  return values.indexOf(needle.key);
}

function secondArgumentStaysOpen(values: string[], needle: string): number {
  return values.indexOf(needle, 1);
}

function numberArrayStaysOpen(values: number[], needle: number): number {
  return values.indexOf(needle);
}

function anyArrayStaysOpen(values: any[], needle: string): number {
  return values.indexOf(needle);
}

function optionalCallStaysOpen(values: string[] | undefined, needle: string): number {
  return values?.indexOf(needle) ?? -1;
}

function objectArrayStaysOpen(values: NamedNeedle[], needle: NamedNeedle): number {
  return values.indexOf(needle);
}

export function main(): number {
  const channels: Channel[] = ["home", "games", "profile"];
  const named = { key: "beta" };
  return stringArrayIndex(["alpha", "beta"], "beta") +
    readonlyStringArrayIndex(["alpha", "beta"] as const, "alpha") +
    tupleStringIndex("south") +
    unionStringIndex(channels, "profile") +
    propertyNeedleIndex(["alpha", "beta"], named) +
    secondArgumentStaysOpen(["alpha", "beta"], "beta") +
    numberArrayStaysOpen([1, 2], 2) +
    anyArrayStaysOpen(["alpha"], "alpha") +
    optionalCallStaysOpen(["alpha"], "alpha") +
    objectArrayStaysOpen([named], named);
}
