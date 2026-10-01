type Item = {
  label: string;
  count: number;
};

function score(seed: string): number {
  const values: Item[] = [{ label: "seed", count: 1 }];
  values.push({ label: seed, count: values.length + 1 });
  const labels = ["alpha", "beta"];
  const dynamic = labels[0];
  const hasDynamic = labels.includes(dynamic);
  const hasObject = values.includes({ label: seed, count: 2 });
  const merged = [...labels, dynamic];
  return values.length + labels.length + merged.length + dynamic.length + (hasDynamic ? 1 : 0) + (hasObject ? 1 : 0);
}

export function main(): number {
  return score("next");
}
