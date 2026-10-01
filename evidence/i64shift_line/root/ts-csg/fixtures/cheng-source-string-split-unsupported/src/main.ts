function score(seed: number): number {
  const dynamic = String(seed).split(",");
  return dynamic.length;
}

function regexSplit(): number {
  const text = "a,b,c";
  const pieces = text.split(/[,]/);
  return pieces.length;
}

function emptySep(): number {
  const text = "abc";
  const pieces = text.split("");
  return pieces.length;
}

function multiSep(): number {
  const text = "a,b,c";
  const pieces = text.split(",, ");
  return pieces.length;
}

export function main(): number {
  return score(37) + regexSplit() + emptySep() + multiSep();
}
