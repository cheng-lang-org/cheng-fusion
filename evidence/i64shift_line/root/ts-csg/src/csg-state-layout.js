export const CsgStateLayoutSchema = "csg-state-layout";
export function extractStateLayouts(_coreFacts) {
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
