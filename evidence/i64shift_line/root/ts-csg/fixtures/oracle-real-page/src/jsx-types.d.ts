// JSX type declarations for ts-csg pipeline
// With jsx: "preserve", TS needs JSX.IntrinsicElements for type checking

type JsxChild = string | number | boolean | null | undefined | JsxElement | JsxChild[];
interface JsxElement {
  type: string;
  props: Record<string, unknown>;
  key: string | null;
}

declare namespace JSX {
  interface IntrinsicElements {
    [elemName: string]: Record<string, unknown>;
  }
  type Element = JsxElement;
}
