import type { CsgFact } from "./schema.js";
export interface ChengCsgFactIdentity {
    factHash: string;
    subgraphCid: string;
}
export declare function chengCsgFactIdentities(facts: readonly CsgFact[]): ChengCsgFactIdentity[];
