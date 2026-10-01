function dynamicText(seed: number): string {
  return seed > 0 ? "alpha-beta" : "beta";
}

function marker(): string {
  return "-";
}

function pad(): string {
  return "0";
}

export function main(): number {
  const text = dynamicText(1);
  const sliced = text.slice(1, text.length - 1);
  const replaced = text.replace(marker(), "/");
  const substituted = text.replace("beta", "$&");
  const regexLiteral = text.replace(/-/g, "/");
  const regexWhitespace = text.replace(/\s+/g, " ");
  const regexDigits = text.replace(/\D/g, "");
  const regexOpen = text.replace(/\w+/g, "/");
  const parts = text.split(marker());
  const padded = replaced.padStart(16, pad());
  const repeated = marker().repeat(2);
  const code = text.charCodeAt(0);
  const betaAt = text.indexOf("beta", 2);
  const alphaLast = text.lastIndexOf("alpha", 6);
  const startsAt = text.startsWith("beta", 6);
  const includesAt = text.includes("beta", 6);
  const openEndsWith = text.endsWith("beta", 4);
  return sliced.length + replaced.length + substituted.length + regexLiteral.length +
    regexWhitespace.length + regexDigits.length + regexOpen.length + parts.length +
    padded.length + repeated.length + code + betaAt + alphaLast +
    (text.includes("alpha") ? 1 : 0) + (startsAt ? 1 : 0) + (includesAt ? 1 : 0) + (openEndsWith ? 1 : 0);
}
