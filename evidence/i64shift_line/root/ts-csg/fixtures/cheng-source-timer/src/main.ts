function delay(): number {
  setTimeout(delay, 100);
  return 7;
}

export function main(): number {
  setTimeout(main, 50);
  clearTimeout(0);
  return delay();
}
