async function addLater(a: number, b: number): Promise<number> {
  return a + b;
}

async function choose(value: number): Promise<number> {
  if (value > 10) {
    return await addLater(value, 3);
  }
  return await addLater(value, 7);
}

export async function main(): Promise<number> {
  const base = await addLater(4, 5);
  const picked = await choose(base);
  return picked + 1;
}
