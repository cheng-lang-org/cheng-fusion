function score(): number {
  const parts = ["ab", "c", "def"];
  const dashLen = parts.join("-").length;
  const emptyLen = parts.join("").length;
  const defaultLen = parts.join().length;
  const joined = parts.join(":");
  const localLen = joined.length;
  return dashLen + emptyLen + defaultLen + localLen;
}

export function main(): number {
  return score();
}
