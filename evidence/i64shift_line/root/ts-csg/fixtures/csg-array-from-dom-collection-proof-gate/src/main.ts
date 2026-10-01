export function fromScopedQuery(scope: ParentNode, selector: string): number {
  return Array.from(scope.querySelectorAll(selector)).length;
}

export function fromDocumentQuery(selector: string): number {
  return Array.from(document.querySelectorAll(selector)).length;
}

export function fromChildNodes(node: Node): number {
  return Array.from(node.childNodes).length;
}

export function fromAttributes(element: Element): number {
  const attrs = Array.from(element.attributes);
  return attrs.length;
}

export function fromFiles(files: FileList): number {
  return Array.from(files).length;
}

export function fromMaybeFiles(input: HTMLInputElement): number {
  return Array.from(input.files || []).length;
}

export function fromTransferItems(items: DataTransferItemList): number {
  return Array.from(items).length;
}

export function unsupportedMapper(nodes: NodeListOf<Element>): number {
  return Array.from(nodes, (node) => node.nodeName).length;
}

export function unsupportedString(raw: string): number {
  return Array.from(raw).length;
}

export function unsupportedIterable(values: Iterable<Element>): number {
  return Array.from(values).length;
}

export function main(): number {
  return fromDocumentQuery("div") +
    unsupportedString("abc");
}
