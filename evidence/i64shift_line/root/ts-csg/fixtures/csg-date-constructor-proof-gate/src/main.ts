function fromCurrentTime(): number {
  new Date();
  return 1;
}

function unsupportedFromTimestamp(ms: number): number {
  new Date(ms);
  return 1;
}

function fromLocalDateTimeString(value: string): number {
  new Date(value);
  return 1;
}

export function main(): number {
  return fromCurrentTime() + fromLocalDateTimeString("2026-05-30T11:56");
}
