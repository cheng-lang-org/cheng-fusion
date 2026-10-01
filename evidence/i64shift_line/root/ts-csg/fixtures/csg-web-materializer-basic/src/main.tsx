export {};

declare global {
  namespace JSX {
    interface Element {}

    interface IntrinsicElements {
      section: { "data-testid"?: string; children?: unknown };
      h1: { role?: string; children?: string };
      button: { id?: string; className?: string; children?: string };
    }
  }
}

const element = <section data-testid="root"><h1 role="heading">Title</h1><button id="run" className="primary">Run</button></section>;

export function main(): number {
  return 0;
}
