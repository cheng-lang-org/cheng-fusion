export {};

declare global {
  namespace JSX {
    interface Element {}

    interface IntrinsicElements {
      a: { id?: string; className?: string; title?: string; role?: string; type?: string; href?: string; target?: string; name?: string; value?: string; placeholder?: string; datetime?: string; colspan?: string; rowspan?: string; children?: unknown }
      body: { id?: string; className?: string; title?: string; role?: string; type?: string; href?: string; target?: string; name?: string; value?: string; placeholder?: string; datetime?: string; colspan?: string; rowspan?: string; children?: unknown }
      div: { id?: string; className?: string; title?: string; role?: string; type?: string; href?: string; target?: string; name?: string; value?: string; placeholder?: string; datetime?: string; colspan?: string; rowspan?: string; children?: unknown }
      li: { id?: string; className?: string; title?: string; role?: string; type?: string; href?: string; target?: string; name?: string; value?: string; placeholder?: string; datetime?: string; colspan?: string; rowspan?: string; children?: unknown }
      style: { id?: string; className?: string; title?: string; role?: string; type?: string; href?: string; target?: string; name?: string; value?: string; placeholder?: string; datetime?: string; colspan?: string; rowspan?: string; children?: unknown }
      ul: { id?: string; className?: string; title?: string; role?: string; type?: string; href?: string; target?: string; name?: string; value?: string; placeholder?: string; datetime?: string; colspan?: string; rowspan?: string; children?: unknown }
    }
  }
}

const element = (
  <div id="html-root">
  <body className="inline-0">
    <div className="inline-1">
      <a className="inline-2" data-csg-rect="48,100,153,22" href="#" id="l">
        {"Information Guide"}
      </a>
      <ul className="dd inline-3" data-csg-rect="48,122,1014,22">
        <li className="inline-4" data-csg-rect="88,122,149,22">
          <a className="di inline-5" data-csg-rect="88,122,89,19" href="#x">
            {"Home Portal"}
          </a>
        </li>
        <li className="inline-6" data-csg-rect="246,122,117,22">
          <a className="di inline-5" data-csg-rect="246,122,80,19" href="#y">
            {"Explore"}
          </a>
        </li>
      </ul>
    </div>
  </body>
  </div>
);

export function main(): number {
  return 0;
}
