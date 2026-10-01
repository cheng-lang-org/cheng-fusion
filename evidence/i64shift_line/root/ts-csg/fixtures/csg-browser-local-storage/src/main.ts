function shadow(localStorage: { getItem(key: string): string | null }): number {
  const value = localStorage.getItem("shadow");
  return value ? value.length : 0;
}

export function main(): number {
  const key = "theme";
  const value = "dark";
  const storageHasGet = typeof localStorage.getItem === "function";
  const storageHasSet = typeof localStorage.setItem === "function";
  localStorage.setItem(key, value);
  const stored = localStorage.getItem(key);
  window.localStorage.removeItem("old-theme");
  localStorage.clear();
  return (stored ? stored.length : 0) + (storageHasGet && storageHasSet ? 1 : 0) + shadow({ getItem: () => "x" });
}
