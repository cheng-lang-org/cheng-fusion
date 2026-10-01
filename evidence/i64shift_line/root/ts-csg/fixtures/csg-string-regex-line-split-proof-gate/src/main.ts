function dynamicText(seed: number): string {
  return seed > 0 ? "alpha\r\nbeta\ngamma\rdelta" : "single";
}

export function main(): number {
  const text = dynamicText(1);
  const crlfOptLf = text.split(/\r?\n/);
  const anyLineBreak = text.split(/\r\n|\n|\r/);
  const literalLf = text.split("\n");
  const whitespace = text.split(/\s+/);
  const numericParts = "v1.2-3".split(/[^0-9]+/);
  const flagged = text.split(/\r?\n/g);
  const reordered = text.split(/\n|\r/);
  return crlfOptLf.length + anyLineBreak.length + literalLf.length +
    whitespace.length + numericParts.length + flagged.length + reordered.length;
}
