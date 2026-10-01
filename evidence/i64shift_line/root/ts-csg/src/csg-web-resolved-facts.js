/**
 * Runtime-resolved browser facts collected from the UniMaker PWA truth route.
 *
 * This file intentionally does not extend the CSGC schema. The collector emits
 * JSONL facts for offline inspection and later schema design.
 */
export const UNIMAKER_CDP_RESOLVED_FACTS_SCHEMA = "unimaker.cdp.resolved_facts.v1";
export const UNIMAKER_CDP_RESOLVED_STYLE_PROPERTIES = [
    "display",
    "position",
    "box-sizing",
    "width",
    "height",
    "margin-top",
    "margin-right",
    "margin-bottom",
    "margin-left",
    "padding-top",
    "padding-right",
    "padding-bottom",
    "padding-left",
    "font-family",
    "font-size",
    "font-weight",
    "line-height",
    "color",
    "background-color",
    "border-top-width",
    "border-right-width",
    "border-bottom-width",
    "border-left-width",
    "border-radius",
    "opacity",
    "overflow-x",
    "overflow-y",
    "transform",
    "z-index",
];
