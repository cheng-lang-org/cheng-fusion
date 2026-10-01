export function main(): number {
  const target = { x: 1 };
  const merged = Object.assign(target, { y: 2 });
  return merged.x;
}
