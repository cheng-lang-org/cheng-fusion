function exprContext(): number {
  const emitted: void = console.log(42);
  return 0;
}

export function main(): number {
  return exprContext();
}
