function label(seed: number): string {
  return seed > 0 ? "files" : "branch";
}

export function closedFreeze(seed: number): number {
  const localItems = ["local", seed > 0, null] as const;
  const frozenLocalItems = Object.freeze(localItems);
  const frozenInlineItems = Object.freeze(["files", true, null, undefined, 42] as const);
  const localConfig = { title: label(seed), visible: true } as const;
  const frozenLocalConfig = Object.freeze(localConfig);
  const frozenInlineConfig = Object.freeze({
    command: label(seed),
    args: Object.freeze(["files", true]),
    enabled: seed > 0,
    count: seed,
  });
  return frozenLocalItems.length +
    frozenInlineItems.length +
    frozenLocalConfig.title.length +
    frozenInlineConfig.command.length +
    (frozenInlineConfig.enabled ? 1 : 0);
}

export function openValue(value: string[]): readonly string[] {
  return Object.freeze(value);
}

export function openSpread(details: Record<string, unknown>): Readonly<Record<string, unknown>> {
  return Object.freeze({ ...details });
}

export function openLogical(tabs: readonly string[] | undefined): readonly string[] {
  return Object.freeze(tabs || []);
}

export function openMapped(items: readonly string[]): readonly string[] {
  return Object.freeze(items.map((item) => item));
}

export function main(): number {
  return closedFreeze(1) + openValue(["x"]).length + openLogical(undefined).length + openMapped(["y"]).length;
}
