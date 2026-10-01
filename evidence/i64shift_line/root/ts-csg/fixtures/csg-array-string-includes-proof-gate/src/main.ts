function allowed(action: string): boolean {
  const localActions = ["bid", "play", "pass"];
  return ["invite", "join", "sync"].includes(action) || localActions.includes(action);
}

function hasImageSuffix(name: string): boolean {
  return [".jpg", ".png", ".webp"].some((suffix) => name.endsWith(suffix));
}

function hasBlockedSubstring(name: string): boolean {
  return [".jpg", ".png", ".webp"].some((suffix) => name.includes(suffix));
}

function hasQuicCandidate(candidates: readonly string[], needle: string): boolean {
  return candidates.some((item) => item.includes(needle.trim()));
}

function hasIp4Candidate(candidates: string[]): boolean {
  return candidates.some((item) => item.startsWith("/ip4/"));
}

function hasPeerSuffix(candidates: string[]): boolean {
  return candidates.some((item) => item.endsWith("/p2p/peer"));
}

function hasCommandKeyword(normalized: string): boolean {
  const keywords = ["enable blur", "apply blur"];
  return keywords.some((word) => normalized.includes(word));
}

function optionalSomeStaysOpen(values: string[] | undefined, needle: string): boolean {
  return values?.some((item) => item.includes(needle)) ?? false;
}

function compoundPredicateStaysOpen(fields: (string | undefined)[], lower: string): boolean {
  return fields.some((field) => field !== undefined && field.toLowerCase().includes(lower));
}

type UploadFile = { type: string };

function fileTypeStaysOpen(files: UploadFile[]): boolean {
  return files.some((file) => file.type.startsWith("image/"));
}

function indexArgumentStaysOpen(values: string[]): boolean {
  return values.some((item, index) => item.includes(String(index)));
}

export function main(): number {
  const candidates = ["/ip4/127.0.0.1/tcp/1", "/ip4/127.0.0.1/udp/2/quic-v1/p2p/peer"];
  return allowed("join") &&
    hasImageSuffix("cover.png") &&
    !hasBlockedSubstring("cover.gif") &&
    hasQuicCandidate(candidates, " quic-v1 ") &&
    hasIp4Candidate(candidates) &&
    hasPeerSuffix(candidates) &&
    hasCommandKeyword("please enable blur now") &&
    !optionalSomeStaysOpen(undefined, "x") &&
    !compoundPredicateStaysOpen(["Alpha", undefined], "beta") &&
    fileTypeStaysOpen([{ type: "image/png" }]) &&
    !indexArgumentStaysOpen(["x"]) ? 1 : 0;
}
