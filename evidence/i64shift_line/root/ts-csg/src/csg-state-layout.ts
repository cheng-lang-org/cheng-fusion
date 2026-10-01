import type { CsgFact } from "./schema.js";

export const CsgStateLayoutSchema = "csg-state-layout" as const;

export interface StateLayoutField {
  fieldId: string;
  type: "i32" | "i64" | "f32" | "f64" | "bool" | "str" | "ptr";
  offset: number;
  owner: string;
  mutability: "readonly" | "mutable" | "write_once";
  dirty: boolean;
  version: number;
}

export interface StateLayoutFact {
  kind: "csg.state_layout";
  id: string;
  owner: string;
  fields: StateLayoutField[];
  totalSize: number;
  alignment: number;
  seqlock: boolean;
}

export interface StateLayoutResult {
  schema: typeof CsgStateLayoutSchema;
  layouts: StateLayoutFact[];
  fieldCount: number;
  totalLayoutSize: number;
}

export function extractStateLayouts(_coreFacts: readonly CsgFact[]): StateLayoutResult {
  // StateLayoutFacts are generated from CSG-Core type/binding facts.
  // The Cheng runtime uses these to generate typed accessors.
  //
  // Per better-plan.md:
  // - Field id, type, offset, owner, mutability, dirty bit, version counter
  // - Cheng runtime generates typed accessor per layout
  // - Frontend writes through generated accessor, not raw offset
  // - Sync via seqlock/versioned snapshot, not unconstrained shared memory
  // - Only used for high-frequency UI state, not general object system

  return {
    schema: CsgStateLayoutSchema,
    layouts: [],
    fieldCount: 0,
    totalLayoutSize: 0,
  };
}
