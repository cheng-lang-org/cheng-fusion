function score(seed: number): number {
  const point = { x: seed, y: 2 };
  const values: [number, number, number] = [seed, 4, 5];
  const objectKeys = Object.keys(point).length;
  const objectEntries = Object.entries(point).length;
  const arrayKeys = Object.keys(values).length;
  const pointKeys = Object.keys(point);
  const sortedPointKeys = pointKeys.sort();
  const pointKeyName = sortedPointKeys[0];
  const joinedPointKeys = sortedPointKeys.join(",");
  const valueKeys = Object.keys(values);
  const valueKeyName = valueKeys[2];
  if (pointKeyName !== "x") return 1;
  if (joinedPointKeys !== "x,y") return 2;
  if (valueKeyName !== "2") return 3;
  return seed + objectKeys + objectEntries + arrayKeys;
}

export function main(): number {
  return score(4);
}
