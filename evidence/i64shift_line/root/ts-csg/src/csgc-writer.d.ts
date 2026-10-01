import type { CsgFact } from "./schema.js";
export interface CsgcWriteStats {
    factCount: number;
    byteSize: number;
    headerSize: number;
    flags: number;
    canonicalJsonlBytes: number;
}
export interface CsgcWriteOptions {
    /** Exclude debug-map facts from the main semantic fact set. */
    includeDebugMaps?: boolean;
    /** Exclude debug-map facts and top-level source locations from the main fact set. */
    separateDebug?: boolean;
    /** Skip returning the companion debug payload when the caller writes it separately. */
    writeSeparateDebugBuffer?: boolean;
}
export interface CsgcOutput {
    factsBuffer: Buffer;
    debugBuffer: Buffer | undefined;
    stats: CsgcWriteStats;
}
export declare function csgcWriteDebugFile(facts: readonly CsgFact[]): Buffer;
export declare function csgcWriteFacts(facts: readonly CsgFact[], _options?: CsgcWriteOptions): CsgcOutput;
