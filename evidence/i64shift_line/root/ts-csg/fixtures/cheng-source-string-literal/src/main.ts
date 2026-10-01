function score(): number {
  const raw = "  Cheng-Lang  ";
  const trimmed = raw.trim();
  const lower = trimmed.toLowerCase();
  const upper = trimmed.toUpperCase();
  const probe = "cheng";
  const suffix = "LANG";
  const segment = "lang";
  const lastNeedle = "g";
  const repeatBase = "ab";
  const codeBase = "AZ";
  const sliced = lower.slice(6);
  const compact = lower.replace("-", "");
  const padded = compact.padStart(12, "0");
  const prefix = compact.substring(0, 5);
  const ended = prefix.padEnd(7, "!");
  const repeated = repeatBase.repeat(3);
  const second = codeBase.charAt(1);
  const same = compact.toString();
  const code = codeBase.charCodeAt(0);
  const has = lower.includes(probe);
  const starts = lower.startsWith(probe);
  const ends = upper.endsWith(suffix);
  const index = lower.indexOf(segment);
  const last = lower.lastIndexOf(lastNeedle);
  if (has) {
    if (starts) {
      if (ends) {
        return index + lower.length + last + sliced.length + compact.length + padded.length + ended.length + repeated.length + second.length + same.length + code;
      }
    }
  }
  return 0;
}

export function main(): number {
  return score();
}
