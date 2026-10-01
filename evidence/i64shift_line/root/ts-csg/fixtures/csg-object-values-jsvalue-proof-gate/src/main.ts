type JsonRecord = Record<string, unknown>;

type FixedRecord = {
  alpha: number;
  beta: string;
};

type CallableRecord = (() => void) & {
  alpha: string;
};

const commandLabels = {
  run: "Run",
  stop: "Stop",
} as const;

function recordValues(record: JsonRecord): number {
  return Object.values(record).length;
}

function fixedValues(record: FixedRecord): number {
  return Object.values(record).length;
}

function guardedValues(value: unknown): number {
  if (!value || typeof value !== "object") return 0;
  return Object.values(value as JsonRecord).length;
}

function constMapValues(): boolean {
  return Object.values(commandLabels).includes("Run");
}

function arrayValues(values: number[]): boolean {
  return Object.values(values).includes(20);
}

function stringValues(value: string): boolean {
  return Object.values(value).includes("i");
}

function broadObjectStillOpen(value: object): number {
  return Object.values(value).length;
}

function emptyObjectStillOpen(value: {}): number {
  return Object.values(value).length;
}

function boxedObjectStillOpen(value: Object): number {
  return Object.values(value).length;
}

function anyStillOpen(value: any): number {
  return Object.values(value).length;
}

function callableStillOpen(value: CallableRecord): number {
  return Object.values(value).length;
}

function unionStillOpen(value: { alpha: number } | { beta: number }): number {
  return Object.values(value).length;
}

export function main(): number {
  const callable = Object.assign(() => undefined, { alpha: "callable" }) as CallableRecord;
  return recordValues({ one: 1, two: "two" }) +
    fixedValues({ alpha: 1, beta: "two" }) +
    guardedValues({ ok: true }) +
    (constMapValues() ? 1 : 0) +
    (arrayValues([10, 20, 30]) ? 1 : 0) +
    (stringValues("hi") ? 1 : 0) +
    broadObjectStillOpen({ wide: true }) +
    emptyObjectStillOpen({ empty: true }) +
    boxedObjectStillOpen({ boxed: true }) +
    anyStillOpen({ any: true }) +
    callableStillOpen(callable) +
    unionStillOpen({ alpha: 1 });
}
