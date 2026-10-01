import type { CsgFact } from "./schema.js";
export declare const CsgRelfactsSchema: "csg_relfacts::v1";
export interface CsgRelfact {
    kind: "csg.relfact";
    predicate: string;
    args: string[];
}
export interface RuntimeOpenRequirementTop {
    domain: string;
    kind: string;
    name: string;
    count: number;
}
export declare function buildRelationFactsFromFacts(facts: readonly CsgFact[]): CsgRelfact[];
export declare function countRelationFactsFromFacts(facts: readonly CsgFact[]): number;
export declare function runtimeOpenRequirementTop(allFacts: readonly CsgFact[], limit?: number): RuntimeOpenRequirementTop[];
