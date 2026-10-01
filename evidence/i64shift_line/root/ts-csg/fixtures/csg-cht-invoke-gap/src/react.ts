// Minimal React-shaped stubs so the fixture extracts without a react dependency.
// Generic signatures mirror the real React hook types the pipeline relies on
// (useState tuple return instantiation, useCallback passthrough) — extraction-only.
export function useState<T>(initial: T): [T, (v: T) => void] {
    return [initial, (_v: T) => {}];
}

export function useCallback<T extends (...args: never[]) => unknown>(fn: T, deps: readonly unknown[]): T {
    return fn;
}
