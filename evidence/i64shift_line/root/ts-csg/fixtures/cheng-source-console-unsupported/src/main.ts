function multiArgs(): number {
  console.log(1, 2);
  return 0;
}

function stringArg(): number {
  console.log("hello");
  return 0;
}

export function main(): number {
  return multiArgs() + stringArg();
}
