export function main(): number {
  const values: [number, number, number] = [1, 2, 3];
  return values.reduce((acc, value) => acc + value, 0);
}
