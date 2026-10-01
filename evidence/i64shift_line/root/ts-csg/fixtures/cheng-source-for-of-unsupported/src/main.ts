export function main(): number {
  for (const char of "abc") {
    if (char === "a") {
      return 1;
    }
  }
  return 0;
}
