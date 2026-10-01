function inlineAscending(): number {
  const values = [10, 2, 7, -1];
  const sorted = values.sort((left, right) => left - right);
  return sorted[0] + values[3];
}

function inlineDescending(): number {
  const values = [10, 2, 7, -1];
  const sorted = values.sort((left, right) => right - left);
  return sorted[0] + values[3];
}

function objectFieldAscending(): number {
  const rows = [
    { score: 3 },
    { score: 1 },
    { score: 2 },
  ];
  const sorted = rows.sort((left, right) => left.score - right.score);
  return sorted[0]!.score;
}

function objectFieldDescending(): number {
  const rows = [
    { score: 1 },
    { score: 3 },
    { score: 2 },
  ];
  const sorted = rows.sort((left, right) => right.score - left.score);
  return sorted[0]!.score;
}

function arrayIndexAscending(): number {
  const rows = [
    [3, 30],
    [1, 10],
    [2, 20],
  ];
  const sorted = rows.sort((left, right) => left[0] - right[0]);
  return sorted[0]![1]!;
}

function destructuredArrayIndexAscending(): number {
  const rows: Array<[number, number]> = [
    [3, 30],
    [1, 10],
    [2, 20],
  ];
  const sorted = rows.sort(([left], [right]) => left - right);
  return sorted[0]![1];
}

function destructuredArrayIndexDescending(): number {
  const rows: Array<[number, number]> = [
    [1, 10],
    [3, 30],
    [2, 20],
  ];
  const sorted = rows.sort(([left], [right]) => right - left);
  return sorted[0]![1];
}

function optionalFieldDescending(): number {
  const rows: Array<{ score?: number | null }> = [
    { score: 1 },
    {},
    { score: null },
    { score: 3 },
  ];
  const sorted = rows.sort((left, right) => (right.score ?? 0) - (left.score ?? 0));
  return sorted[0]!.score ?? 0;
}

function optionalFieldAscending(): number {
  const rows: Array<{ score?: number | null | undefined }> = [
    { score: 3 },
    {},
    { score: undefined },
    { score: 1 },
  ];
  const sorted = rows.sort((left, right) => (left.score ?? 0) - (right.score ?? 0));
  return sorted[sorted.length - 1]!.score ?? 0;
}

function optionalArrayIndexAscending(): number {
  const rows: Array<Array<number | null | undefined>> = [
    [3],
    [],
    [1],
    [null],
    [undefined],
  ];
  const sorted = rows.sort((left, right) => (left[0] ?? 0) - (right[0] ?? 0));
  return sorted[sorted.length - 1]![0] ?? 0;
}

function optionalArrayIndexDescending(): number {
  const rows: Array<Array<number | null | undefined>> = [
    [1],
    [],
    [3],
    [null],
    [undefined],
  ];
  const sorted = rows.sort((left, right) => (right[0] ?? 0) - (left[0] ?? 0));
  return sorted[0]![0] ?? 0;
}

function logicalOrFieldDescending(): number {
  const rows: Array<{ score?: number | null }> = [
    { score: 1 },
    {},
    { score: null },
    { score: 3 },
  ];
  const sorted = rows.sort((left, right) => (right.score || 0) - (left.score || 0));
  return sorted[0]!.score || 0;
}

function logicalOrFieldAscending(): number {
  const rows: Array<{ score?: number | null | undefined }> = [
    { score: 3 },
    {},
    { score: undefined },
    { score: 1 },
  ];
  const sorted = rows.sort((left, right) => (left.score || 0) - (right.score || 0));
  return sorted[sorted.length - 1]!.score || 0;
}

function logicalOrArrayIndexAscending(): number {
  const rows: Array<Array<number | null | undefined>> = [
    [3],
    [],
    [1],
    [null],
    [undefined],
  ];
  const sorted = rows.sort((left, right) => (left[0] || 0) - (right[0] || 0));
  return sorted[sorted.length - 1]![0] || 0;
}

function logicalOrArrayIndexDescending(): number {
  const rows: Array<Array<number | null | undefined>> = [
    [1],
    [],
    [3],
    [null],
    [undefined],
  ];
  const sorted = rows.sort((left, right) => (right[0] || 0) - (left[0] || 0));
  return sorted[0]![0] || 0;
}

function keyCastSortStillOpen(): number {
  const rows: Array<{ score?: number | null }> = [
    { score: 1 },
    {},
  ];
  const sorted = rows.sort((left, right) => (right.score as number) - (left.score as number));
  return sorted.length;
}

function numberCallSortStillOpen(): number {
  const rows: Array<{ score?: number | null }> = [
    { score: 1 },
    {},
  ];
  const sorted = rows.sort((left, right) => Number(right.score ?? 0) - Number(left.score ?? 0));
  return sorted.length;
}

function asNumber(value: number | null | undefined): number {
  return value ?? 0;
}

function asNumberCallSortStillOpen(): number {
  const rows: Array<{ score?: number | null }> = [
    { score: 1 },
    {},
  ];
  const sorted = rows.sort((left, right) => asNumber(right.score) - asNumber(left.score));
  return sorted.length;
}

function nestedPathNullishStillOpen(): number {
  const rows: Array<{ meta: { score?: number | null } }> = [
    { meta: { score: 1 } },
    { meta: {} },
  ];
  const sorted = rows.sort((left, right) => (right.meta.score ?? 0) - (left.meta.score ?? 0));
  return sorted.length;
}

function optionalChainNullishStillOpen(): number {
  const rows: Array<{ score?: number | null }> = [
    { score: 1 },
    {},
  ];
  const sorted = rows.sort((left, right) => (right?.score ?? 0) - (left?.score ?? 0));
  return sorted.length;
}

function nonI32LiteralNullishStillOpen(): number {
  const rows: Array<{ score?: 1.5 | null }> = [
    { score: 1.5 },
    {},
  ];
  const sorted = rows.sort((left, right) => (right.score ?? 0) - (left.score ?? 0));
  return sorted.length;
}

function blockReturnComparatorStillOpen(): number {
  const rows: Array<{ score?: number | null }> = [
    { score: 1 },
    {},
  ];
  const sorted = rows.sort((left, right) => {
    return (right.score ?? 0) - (left.score ?? 0);
  });
  return sorted.length;
}

function comparatorCastStillOpen(): number {
  const rows: Array<{ score?: number | null }> = [
    { score: 1 },
    {},
  ];
  const sorted = rows.sort(((left: { score?: number | null }, right: { score?: number | null }) => (right.score ?? 0) - (left.score ?? 0)) as any);
  return sorted.length;
}

function logicalOrOneStillOpen(): number {
  const rows: Array<{ score?: number | null }> = [
    { score: 1 },
    {},
  ];
  const sorted = rows.sort((left, right) => (right.score || 1) - (left.score || 1));
  return sorted.length;
}

function logicalOrNonI32LiteralStillOpen(): number {
  const rows: Array<{ score?: 1.5 | null }> = [
    { score: 1.5 },
    {},
  ];
  const sorted = rows.sort((left, right) => (right.score || 0) - (left.score || 0));
  return sorted.length;
}

function destructuredDefaultStillOpen(): number {
  const rows: Array<[number | undefined, number]> = [
    [3, 30],
    [undefined, 10],
  ];
  const sorted = rows.sort(([left = 0], [right = 0]) => left - right);
  return sorted.length;
}

function destructuredMultiElementStillOpen(): number {
  const rows: Array<[number, number]> = [
    [3, 30],
    [1, 10],
  ];
  const sorted = rows.sort(([left, leftPayload], [right, rightPayload]) => left - right + leftPayload - rightPayload);
  return sorted.length;
}

export function main(): number {
  return inlineAscending() +
    inlineDescending() +
    objectFieldAscending() +
    objectFieldDescending() +
    arrayIndexAscending() +
    destructuredArrayIndexAscending() +
    destructuredArrayIndexDescending() +
    optionalFieldDescending() +
    optionalFieldAscending() +
    optionalArrayIndexAscending() +
    optionalArrayIndexDescending() +
    logicalOrFieldDescending() +
    logicalOrFieldAscending() +
    logicalOrArrayIndexAscending() +
    logicalOrArrayIndexDescending() +
    keyCastSortStillOpen() +
    numberCallSortStillOpen() +
    asNumberCallSortStillOpen() +
    nestedPathNullishStillOpen() +
    optionalChainNullishStillOpen() +
    nonI32LiteralNullishStillOpen() +
    blockReturnComparatorStillOpen() +
    comparatorCastStillOpen() +
    logicalOrOneStillOpen() +
    logicalOrNonI32LiteralStillOpen() +
    destructuredDefaultStillOpen() +
    destructuredMultiElementStillOpen();
}
