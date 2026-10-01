export function main(value: object = { name: "cursor" }): number {
  const objectText = String({});
  const typedObjectText = String(value as object);
  const unknownText = String(value as unknown);
  const anyText = String(value as any);
  return objectText.length + typedObjectText.length + unknownText.length + anyText.length;
}
