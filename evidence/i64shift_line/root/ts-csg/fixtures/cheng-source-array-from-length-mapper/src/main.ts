function score(): number {
  const range = Array.from({ length: 4 }, (_, index) => index);
  const constants = Array.from({ length: 3 }, () => 7);
  const shifted = Array.from({ length: 3 }, (_, index) => index + 2);
  return range[3] + constants[2] + shifted[1] + range.length + constants.length + shifted.length;
}

export function main(): number {
  return score();
}
