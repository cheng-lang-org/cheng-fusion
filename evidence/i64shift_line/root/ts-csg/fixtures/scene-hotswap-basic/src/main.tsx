export {};

declare global {
  namespace JSX {
    interface Element {}
    interface IntrinsicElements {
      div: { style?: Record<string, string | number>; children?: unknown };
    }
  }
}

const element = (
  <div style={{ width: 390, height: 844, backgroundColor: "#101418" }}>
    <div style={{ width: 390, height: 120, backgroundColor: "#3366cc" }} />
    <div style={{ width: 390, height: 240, backgroundColor: "#33cc66" }} />
    <div style={{ width: 390, height: 180, backgroundColor: "#cc3333" }} />
  </div>
);

export function main(): number {
  void element;
  return 0;
}
