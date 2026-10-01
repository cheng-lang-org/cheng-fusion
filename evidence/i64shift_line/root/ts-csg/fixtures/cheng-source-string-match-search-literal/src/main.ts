function matchScore(): number {
  const text = "hello world";
  if (text.match("o")) {
    return 10;
  }
  return 0;
}

function searchScore(): number {
  const text = "hello world";
  const posW: number = text.search("w");
  const posQ: number = text.search("q");
  const literalSearch: number = "abc".search("a");
  return posW + posQ + literalSearch;
}

export function main(): number {
  return matchScore() + searchScore();
}
