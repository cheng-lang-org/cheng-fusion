export {};

declare global {
  namespace JSX {
    interface IntrinsicElements {
      div: {};
      button: { "aria-label"?: string };
      input: { "aria-label"?: string; placeholder?: string };
      select: { "aria-label"?: string };
    }
  }
}

export function main(): number {
  <div />;
  <button aria-label="save" />;
  <input aria-label="message" placeholder="Say message" />;
  <select aria-label="mode" />;
  return 1;
}
