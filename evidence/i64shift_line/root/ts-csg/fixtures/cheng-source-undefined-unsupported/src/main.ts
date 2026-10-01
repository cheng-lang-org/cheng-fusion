export function main(): number {
  const obj: Record<string, number> = {};
  const val = obj["missing"];
  return val === undefined ? 1 : 0;
}
