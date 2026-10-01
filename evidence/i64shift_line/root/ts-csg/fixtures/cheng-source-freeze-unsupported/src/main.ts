export function main(): number {
  const value = 3;
  const frozen = Object.freeze(value);
  if (Array.isArray(value)) {
    return frozen;
  }
  return 0;
}
