export {};

declare global {
  namespace JSX {
    interface IntrinsicElements {
      div: Record<string, unknown>;
      button: Record<string, unknown>;
      input: Record<string, unknown>;
      select: Record<string, unknown>;
      option: Record<string, unknown>;
    }
  }
}
