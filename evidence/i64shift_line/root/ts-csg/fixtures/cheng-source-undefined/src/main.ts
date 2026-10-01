function check(value: number): number {
  if (value === undefined) {
    return 1;
  }
  return 0;
}

function directUndef(): number {
  if (undefined === undefined) {
    return 7;
  }
  return 0;
}

function localUndef(): number {
  const value = undefined;
  if (value === undefined) {
    return 11;
  }
  return 0;
}

export function main(): number {
  return check(7) + directUndef() + localUndef();
}
