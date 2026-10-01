// Regression fixture for compileBlockArrowHelper: a multi-statement,
// guard-clause block-bodied `.filter()` arrow (`if (...) return false; ...;
// return expr`), matching the real shape used by NodesPage.tsx's
// `filteredNodes = nodes.filter((node) => { ... })` (local-peer exclusion +
// category guard + a derived `const` + a final boolean return), scaled down
// to plain int32 values so the fixture stays focused on the arrow-body
// lowering itself rather than struct-array support.
function excludesLocal(localId: number, candidateId: number): boolean {
  return localId > 0 && candidateId === localId;
}

function matchesCategory(category: number, want: number): boolean {
  return category === want;
}

function score(seed: number): number {
  const localId = seed % 3;
  const want = 2;
  const values: [number, number, number, number] = [1, 2, 3, localId];
  const kept = values.filter((value) => {
    if (excludesLocal(localId, value)) return false;
    if (want !== 0 && !matchesCategory(value, want)) return false;
    const doubled = value * 2;
    return doubled > 2;
  });
  return kept.length + 100;
}

export function main(): number {
  return score(2);
}
