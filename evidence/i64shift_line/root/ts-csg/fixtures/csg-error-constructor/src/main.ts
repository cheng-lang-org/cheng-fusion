export function makeErrorMessage(input: string): string {
  const err = new Error(input);
  return err.message;
}

export function makeEmptyErrorMessage(): string {
  const err = new Error();
  return err.message;
}

export function isNativeError(value: unknown): boolean {
  return value instanceof Error;
}
