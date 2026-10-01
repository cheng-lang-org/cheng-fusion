function dynamicText(seed: number): string {
  return seed > 0 ? "###draft-value.json///" : "Value.";
}

export function main(): number {
  const text = dynamicText(1);
  const prefixRun = text.replace(/^#+/, "");
  const suffixRun = text.replace(/\/+$/, "");
  const prefixLiteral = text.replace(/^draft-/, "");
  const suffixLiteral = text.replace(/\.json$/, "");
  const dotSuffix = text.replace(/\.$/, "");
  const charSetPrefix = text.replace(/^[vV]/, "");
  const whitespace = text.replace(/\s+/g, " ");
  const rangeClass = text.replace(/^[a-z]/, "");
  const capture = text.replace(/^(draft)-/, "$1");
  const callback = text.replace(/^#+/, (match) => match.toLowerCase());
  const flagI = text.replace(/^draft/i, "");
  const flagG = text.replace(/^#+/g, "");
  const lookahead = text.replace(/:(?!\/)/, "/");
  const dynamicRegex = text.replace(new RegExp("^#+"), "");
  return prefixRun.length + suffixRun.length + prefixLiteral.length + suffixLiteral.length +
    dotSuffix.length + charSetPrefix.length + whitespace.length + rangeClass.length +
    capture.length + callback.length + flagI.length + flagG.length + lookahead.length +
    dynamicRegex.length;
}
