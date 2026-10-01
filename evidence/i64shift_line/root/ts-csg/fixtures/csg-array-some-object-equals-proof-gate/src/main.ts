type Model = {
  id: string;
  name: string;
  enabled: boolean;
  kind: "codex" | "chat";
  baseUrl?: string;
  supportsImages?: boolean;
  meta?: { id: string };
};

enum Rank {
  SmallJoker = 16,
  BigJoker = 17,
}

type Card = {
  rank: Rank;
  suit: "joker" | "spade";
};

type CallableModel = (() => void) & {
  id: string;
  name: string;
};

function hasModelId(models: Model[], selectedId: string): boolean {
  return models.some((entry) => entry.id === selectedId);
}

function hasModelName(models: readonly Model[], selectedName: string): boolean {
  return models.some((entry) => selectedName === entry.name);
}

function hasEnabledModel(models: Model[]): boolean {
  return models.some((entry) => entry.enabled === true);
}

function hasTruthyEnabledModel(models: Model[]): boolean {
  return models.some((entry) => entry.enabled);
}

function hasCurrentModel(models: Model[], current: Model): boolean {
  return models.some((entry) => entry.id === current.id);
}

function hasBigJoker(cards: Card[]): boolean {
  return cards.some((card) => card.rank === Rank.BigJoker);
}

function hasCompoundModel(models: Model[], selectedId: string, selectedName: string): boolean {
  return models.some((entry) => entry.id === selectedId && entry.name === selectedName);
}

function hasCompoundModelReversed(models: Model[], current: Model): boolean {
  return models.some((entry) => current.id === entry.id && true === entry.enabled);
}

function hasCompoundModelBlock(models: Model[], selectedId: string): boolean {
  return models.some(function (entry) {
    return entry.id === selectedId && entry.kind === "codex" && entry.enabled === true;
  });
}

function hasCompoundCard(cards: Card[]): boolean {
  return cards.some((card) => card.rank === Rank.BigJoker && card.suit === "joker");
}

function hasOptionalScalarCompound(models: Model[], selectedId: string, selectedBaseUrl: string): boolean {
  return models.some((entry) => entry.id === selectedId && entry.baseUrl === selectedBaseUrl && entry.supportsImages === true);
}

function looseEqualsStaysOpen(models: Model[], selectedId: string): boolean {
  return models.some((entry) => entry.id == selectedId);
}

function notEqualsStaysOpen(models: Model[], selectedId: string): boolean {
  return models.some((entry) => entry.id !== selectedId);
}

function optionalChainStaysOpen(models: Model[], selectedId: string): boolean {
  return models.some((entry) => entry.meta?.id === selectedId);
}

function nestedFieldStaysOpen(models: Model[], selectedId: string): boolean {
  return models.some((entry) => entry.meta!.id === selectedId);
}

function rhsCallStaysOpen(models: Model[], selectedId: string): boolean {
  return models.some((entry) => entry.id === selectedId.trim());
}

function selfReferenceStaysOpen(models: Model[]): boolean {
  return models.some((entry) => entry.id === entry.name);
}

function orEqualsStaysOpen(models: Model[], selectedId: string, selectedName: string): boolean {
  return models.some((entry) => entry.id === selectedId || entry.name === selectedName);
}

function rhsCallCompoundStaysOpen(models: Model[], selectedId: string, selectedName: string): boolean {
  return models.some((entry) => entry.id === selectedId.trim() && entry.name === selectedName);
}

function nestedCompoundStaysOpen(models: Model[], selectedId: string, selectedName: string): boolean {
  return models.some((entry) => entry.meta!.id === selectedId && entry.name === selectedName);
}

function computedCompoundStaysOpen(models: Model[], selectedId: string, selectedName: string): boolean {
  return models.some((entry) => entry["id"] === selectedId && entry.name === selectedName);
}

function secondArgCompoundStaysOpen(models: Model[], selectedId: string, selectedName: string): boolean {
  return models.some((entry, index) => entry.id === selectedId && entry.name === `${selectedName}-${index}`);
}

function namedPredicate(entry: Model): boolean {
  return entry.id === "gpt-5.5" && entry.name === "GPT-5.5";
}

function namedPredicateStaysOpen(models: Model[]): boolean {
  return models.some(namedPredicate);
}

function callableElementStaysOpen(models: CallableModel[], selectedId: string, selectedName: string): boolean {
  return models.some((entry) => entry.id === selectedId && entry.name === selectedName);
}

function indexArgumentStaysOpen(models: Model[], selectedId: string): boolean {
  return models.some((entry, index) => entry.id === `${selectedId}-${index}`);
}

export function main(): number {
  const models: Model[] = [
    { id: "gpt-5.5", name: "GPT-5.5", enabled: true, kind: "codex", baseUrl: "https://chatgpt.com/backend-api/codex", supportsImages: true, meta: { id: "primary" } },
    { id: "deepseek-v4-pro", name: "DeepSeek V4 Pro", enabled: false, kind: "chat", baseUrl: "http://127.0.0.1:5001/v1", supportsImages: false },
  ];
  const cards: Card[] = [{ rank: Rank.SmallJoker, suit: "spade" }, { rank: Rank.BigJoker, suit: "joker" }];
  const callable = Object.assign(() => undefined, { id: "callable", name: "Callable" }) as CallableModel;
  return hasModelId(models, "gpt-5.5") &&
    hasModelName(models, "DeepSeek V4 Pro") &&
    hasEnabledModel(models) &&
    hasTruthyEnabledModel(models) &&
    hasCurrentModel(models, models[0]!) &&
    hasBigJoker(cards) &&
    hasCompoundModel(models, "deepseek-v4-pro", "DeepSeek V4 Pro") &&
    hasCompoundModelReversed(models, models[0]!) &&
    hasCompoundModelBlock(models, "gpt-5.5") &&
    hasCompoundCard(cards) &&
    hasOptionalScalarCompound(models, "gpt-5.5", "https://chatgpt.com/backend-api/codex") &&
    looseEqualsStaysOpen(models, "gpt-5.5") &&
    notEqualsStaysOpen(models, "missing") &&
    optionalChainStaysOpen(models, "primary") &&
    nestedFieldStaysOpen(models, "primary") &&
    rhsCallStaysOpen(models, " gpt-5.5 ") &&
    !selfReferenceStaysOpen(models) &&
    orEqualsStaysOpen(models, "missing", "GPT-5.5") &&
    rhsCallCompoundStaysOpen(models, " gpt-5.5 ", "GPT-5.5") &&
    nestedCompoundStaysOpen(models, "primary", "GPT-5.5") &&
    computedCompoundStaysOpen(models, "gpt-5.5", "GPT-5.5") &&
    secondArgCompoundStaysOpen([{ id: "m", name: "M-0", enabled: true, kind: "codex" }], "m", "M") &&
    namedPredicateStaysOpen(models) &&
    callableElementStaysOpen([callable], "callable", "Callable") &&
    indexArgumentStaysOpen([{ id: "m-0", name: "M", enabled: true, kind: "codex" }], "m") ? 1 : 0;
}
