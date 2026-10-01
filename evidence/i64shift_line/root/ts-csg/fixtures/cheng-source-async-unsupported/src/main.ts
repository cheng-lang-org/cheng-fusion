async function addLater(a: number, b: number): Promise<number> {
  return a + b;
}

export async function main(): Promise<number> {
  const pending = addLater(4, 5);
  return 0;
}
