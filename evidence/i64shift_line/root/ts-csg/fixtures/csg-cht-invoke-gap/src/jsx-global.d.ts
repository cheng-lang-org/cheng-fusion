// Global JSX intrinsic element stubs (extraction-only fixture).
declare global {
    namespace JSX {
        interface Element {}

        interface IntrinsicElements {
            div: { className?: string; children?: unknown };
            button: { id?: string; className?: string; onClick?: () => void; children?: unknown };
        }
    }
}

export {};
