function score(value: number): number {
  const finite = Number.isFinite(value);
  const same = Number(value);
  const flag = Number(finite);
  if (finite) {
    if (Number.isInteger(value)) {
      if (Number.isSafeInteger(value)) {
        return same + flag + 3;
      }
    }
  }
  return 0;
}

export function main(): number {
  return score(21);
}
