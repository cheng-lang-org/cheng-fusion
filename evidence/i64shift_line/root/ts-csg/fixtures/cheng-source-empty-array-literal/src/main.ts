function score(): number {
  const emptyNumbers: number[] = [];
  const emptyStrings: string[] = [];
  const stringValues = ["open"];
  const dynamicString = String(7);
  const dynamicStrings = [dynamicString];
  const mixedScalars = [1, true, "ok", null, undefined];
  void emptyNumbers;
  void emptyStrings;
  void stringValues;
  void dynamicStrings;
  void mixedScalars;
  return 7;
}

export function main(): number {
  return score();
}
