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

type Tile = {
  suit: "bamboo" | "dot";
  value: number;
};

type CallableModel = (() => void) & {
  id: string;
  name: string;
};

function findModelId(models: Model[], selectedId: string): number {
  return models.findIndex((entry) => entry.id === selectedId);
}

function findModelName(models: readonly Model[], selectedName: string): number {
  return models.findIndex((entry) => selectedName === entry.name);
}

function findEnabledModel(models: Model[]): number {
  return models.findIndex((entry) => entry.enabled === true);
}

function findBigJoker(cards: Card[]): number {
  return cards.findIndex((card) => card.rank === Rank.BigJoker);
}

function findCompoundModel(models: Model[], selectedId: string, selectedName: string): number {
  return models.findIndex((entry) => entry.id === selectedId && entry.name === selectedName);
}

function findCompoundModelReversed(models: Model[], current: Model): number {
  return models.findIndex((entry) => current.id === entry.id && true === entry.enabled);
}

function findCompoundModelBlock(models: Model[], selectedId: string): number {
  return models.findIndex(function (entry) {
    return entry.id === selectedId && entry.kind === "codex" && entry.enabled === true;
  });
}

function findOptionalScalarCompound(models: Model[], selectedId: string, selectedBaseUrl: string): number {
  return models.findIndex((entry) => entry.id === selectedId && entry.baseUrl === selectedBaseUrl && entry.supportsImages === true);
}

function findNextTile(tiles: Tile[], first: Tile): number {
  return tiles.findIndex((tile) => tile.suit === first.suit && tile.value === first.value + 1);
}

function looseEqualsStaysOpen(models: Model[], selectedId: string): number {
  return models.findIndex((entry) => entry.id == selectedId);
}

function notEqualsStaysOpen(models: Model[], selectedId: string): number {
  return models.findIndex((entry) => entry.id !== selectedId);
}

function optionalChainStaysOpen(models: Model[], selectedId: string): number {
  return models.findIndex((entry) => entry.meta?.id === selectedId);
}

function nestedFieldStaysOpen(models: Model[], selectedId: string): number {
  return models.findIndex((entry) => entry.meta!.id === selectedId);
}

function rhsCallStaysOpen(models: Model[], selectedId: string): number {
  return models.findIndex((entry) => entry.id === selectedId.trim());
}

function selfReferenceStaysOpen(models: Model[]): number {
  return models.findIndex((entry) => entry.id === entry.name);
}

function findDisjunctiveModel(models: Model[], selectedId: string, selectedName: string): number {
  return models.findIndex((entry) => entry.id === selectedId || entry.name === selectedName);
}

function computedCompoundStaysOpen(models: Model[], selectedId: string, selectedName: string): number {
  return models.findIndex((entry) => entry["id"] === selectedId && entry.name === selectedName);
}

function secondArgCompoundStaysOpen(models: Model[], selectedId: string, selectedName: string): number {
  return models.findIndex((entry, index) => entry.id === selectedId && entry.name === `${selectedName}-${index}`);
}

function namedPredicate(entry: Model): boolean {
  return entry.id === "gpt-5.5" && entry.name === "GPT-5.5";
}

function namedPredicateStaysOpen(models: Model[]): number {
  return models.findIndex(namedPredicate);
}

function callableElementStaysOpen(models: CallableModel[], selectedId: string, selectedName: string): number {
  return models.findIndex((entry) => entry.id === selectedId && entry.name === selectedName);
}

function rangeStaysOpen(tiles: Tile[], value: number): number {
  return tiles.findIndex((tile) => tile.value > value);
}

export function main(): number {
  const models: Model[] = [
    { id: "gpt-5.5", name: "GPT-5.5", enabled: true, kind: "codex", baseUrl: "https://chatgpt.com/backend-api/codex", supportsImages: true, meta: { id: "primary" } },
    { id: "deepseek-v4-pro", name: "DeepSeek V4 Pro", enabled: false, kind: "chat", baseUrl: "http://127.0.0.1:5001/v1", supportsImages: false },
  ];
  const cards: Card[] = [{ rank: Rank.SmallJoker, suit: "spade" }, { rank: Rank.BigJoker, suit: "joker" }];
  const tiles: Tile[] = [{ suit: "bamboo", value: 1 }, { suit: "bamboo", value: 2 }];
  return findModelId(models, "gpt-5.5") === 0 &&
    findModelName(models, "DeepSeek V4 Pro") === 1 &&
    findEnabledModel(models) === 0 &&
    findBigJoker(cards) === 1 &&
    findCompoundModel(models, "deepseek-v4-pro", "DeepSeek V4 Pro") === 1 &&
    findCompoundModelReversed(models, models[0]!) === 0 &&
    findCompoundModelBlock(models, "gpt-5.5") === 0 &&
    findOptionalScalarCompound(models, "gpt-5.5", "https://chatgpt.com/backend-api/codex") === 0 &&
    findNextTile(tiles, tiles[0]!) === 1 &&
    looseEqualsStaysOpen(models, "gpt-5.5") === 0 &&
    notEqualsStaysOpen(models, "missing") === 0 &&
    optionalChainStaysOpen(models, "primary") === 0 &&
    nestedFieldStaysOpen(models, "primary") === 0 &&
    rhsCallStaysOpen(models, " gpt-5.5 ") === 0 &&
    selfReferenceStaysOpen(models) === -1 &&
    findDisjunctiveModel(models, "missing", "GPT-5.5") === 0 &&
    computedCompoundStaysOpen(models, "gpt-5.5", "GPT-5.5") === 0 &&
    secondArgCompoundStaysOpen([{ id: "m", name: "M-0", enabled: true, kind: "codex" }], "m", "M") === 0 &&
    namedPredicateStaysOpen(models) === 0 &&
    callableElementStaysOpen([] as CallableModel[], "callable", "Callable") === -1 &&
    rangeStaysOpen(tiles, 1) === 1 ? 1 : 0;
}
