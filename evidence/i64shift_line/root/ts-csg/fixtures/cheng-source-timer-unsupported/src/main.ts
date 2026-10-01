function stringDelay(): number {
  setTimeout("hello");
  return 0;
}

function noArgs(): number {
  setTimeout();
  return 0;
}

export function main(): number {
  return stringDelay() + noArgs();
}
