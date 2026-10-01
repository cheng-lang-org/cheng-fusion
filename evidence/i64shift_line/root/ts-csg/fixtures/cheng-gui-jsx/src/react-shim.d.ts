// JSX type shim for Cheng GUI — provides intrinsic element types without React dependency.
// TypeScript resolves JSX types from this namespace regardless of jsxImportSource.

declare namespace JSX {
  interface IntrinsicElements {
    div: any;
    span: any;
    button: any;
    p: any;
    h1: any;
    h2: any;
    h3: any;
    input: any;
    section: any;
    main: any;
    header: any;
    footer: any;
    a: any;
    label: any;
  }
  interface Element {}
  interface ElementChildrenAttribute { children: any; }
}

// Satisfy TypeScript's jsx-runtime module resolution for the "react-jsx" transform.
// These declarations allow the compiler to resolve the synthetic import added
// by the "react-jsx" JSX transform without requiring the actual react package.
declare module "react/jsx-runtime" {
  export function jsx(type: any, props: any, key?: any): any;
  export function jsxs(type: any, props: any, key?: any): any;
  export function Fragment(props: any): any;
}

declare module "react/jsx-dev-runtime" {
  export function jsxDEV(type: any, props: any, key?: any): any;
}
