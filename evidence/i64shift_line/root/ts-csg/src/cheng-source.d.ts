import type { ExtractOptions } from "./schema.js";
export interface ChengSourceOptions extends ExtractOptions {
    runtime?: string[];
}
export interface ChengSourceResult {
    diagnostics: string[];
    unsupported: string[];
    text: string;
    functionCount: number;
}
export declare function emitChengSourceFromTs(options: ChengSourceOptions): ChengSourceResult;
