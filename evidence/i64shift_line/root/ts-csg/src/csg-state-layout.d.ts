import type { CsgFact } from "./schema.js";
export declare const CsgStateLayoutSchema: "csg-state-layout";
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
export declare function extractStateLayouts(_coreFacts: readonly CsgFact[]): StateLayoutResult;
