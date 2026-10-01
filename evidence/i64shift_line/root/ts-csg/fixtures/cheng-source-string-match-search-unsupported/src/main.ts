function dynamicReceiver(seed: number): number {
  const text = String(seed);
  if (text.match("a")) { return 1; }
  return 0;
}

function multiCharArg(): number {
  const text = "hello";
  if (text.match("ab")) { return 2; }
  return 0;
}

function multiCharSearch(): number {
  return "test".search("es");
}

function emptyMatch(): number {
  if ("abc".match("")) { return 3; }
  return 0;
}

export function main(): number {
  return dynamicReceiver(42) + multiCharArg() + multiCharSearch() + emptyMatch();
}
