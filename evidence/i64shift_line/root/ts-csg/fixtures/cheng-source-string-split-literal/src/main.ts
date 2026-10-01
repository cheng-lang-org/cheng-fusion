function score(): number {
  const text = "a,b,cd";
  const pieces = text.split(",");
  const count = pieces.length;
  const dotLen = "hello.world".split(".").length;
  return count + dotLen;
}

export function main(): number {
  return score();
}
