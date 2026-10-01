type JsonRecord = Record<string, unknown>;

type FixedRecord = {
  alpha?: number;
  beta?: string;
};

function recordLength(record: JsonRecord): number {
  return Object.keys(record).length;
}

function recordEntriesLength(record: JsonRecord): number {
  return Object.entries(record).length;
}

function fixedLength(record: FixedRecord): number {
  return Object.keys(record).length;
}

function fixedEntriesLength(record: FixedRecord): number {
  return Object.entries(record).length;
}

function guardedLength(value: unknown): number {
  if (!value || typeof value !== "object") return 0;
  return Object.keys(value as JsonRecord).length;
}

function guardedEntriesLength(value: unknown): number {
  if (!value || typeof value !== "object") return 0;
  return Object.entries(value as JsonRecord).length;
}

function broadObjectStillOpen(value: object): number {
  return Object.keys(value).length;
}

function broadObjectEntriesStillOpen(value: object): number {
  return Object.entries(value).length;
}

export function main(): number {
  return recordLength({ one: 1, two: 2 }) +
    recordEntriesLength({ one: 1, two: 2 }) +
    fixedLength({ alpha: 1 }) +
    fixedEntriesLength({ alpha: 1 }) +
    guardedLength({ ok: true }) +
    guardedEntriesLength({ ok: true }) +
    broadObjectStillOpen({ wide: true }) +
    broadObjectEntriesStillOpen({ wide: true });
}
