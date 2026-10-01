/**
 * csg-web-types.ts
 *
 * TypeScript type definitions for the CSG-Web fact schema.
 * Mirrors `src/core/ir/csg_web_facts.cheng` as the single source
 * of truth. Every fact kind used by ts-csg's --emit csg-web is
 * formalised as a TypeScript interface.
 *
 * Conventions:
 *   - Interface names match the Cheng type names (CsgWeb*).
 *   - Optional fields use `?:` — the same field may be absent or
 *     `undefined` at runtime, matching the Cheng `?` suffix.
 *   - `readonly` is applied where the runtime treats the fact as
 *     immutable after emission.
 */
// ---------------------------------------------------------------------------
// Module header / schema metadata
// ---------------------------------------------------------------------------
export const CSG_WEB_SCHEMA_VERSION = 1;
export const CSG_WEB_FEATURE_JS = 0x01;
export const CSG_WEB_FEATURE_REACT = 0x02;
export const CSG_WEB_FEATURE_DOM = 0x04;
export const CSG_WEB_FEATURE_CSS = 0x08;
export const CSG_WEB_FEATURE_EVENT = 0x10;
export const CSG_WEB_FEATURE_LAYOUT = 0x20;
export const CSG_WEB_FEATURE_PAINT = 0x40;
