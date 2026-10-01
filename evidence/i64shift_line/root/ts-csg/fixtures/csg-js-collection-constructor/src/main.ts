function score(): number {
  const counts = new Map<string, number>();
  const seen = new Set<string>();
  const labels = new Set(["alpha", "beta"]);
  counts.set("alpha", 1);
  seen.add("alpha");
  console.log(counts.get("alpha"));
  return (seen.has("alpha") ? 1 : 0) + (labels.has("beta") ? 1 : 0);
}

export function main(): number {
  return score();
}
