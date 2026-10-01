import { chengCsgPackFacts, requireChengCsgHeldExecLauncherIdentity, } from "./csg-cheng-bridge.js";
export function csgcWriteDebugFile(facts) {
    requireChengCsgHeldExecLauncherIdentity();
    return chengCsgPackFacts(facts).bytes;
}
export function csgcWriteFacts(facts, _options) {
    requireChengCsgHeldExecLauncherIdentity();
    const packed = chengCsgPackFacts(facts);
    return {
        factsBuffer: packed.bytes,
        debugBuffer: undefined,
        stats: {
            factCount: packed.factCount,
            byteSize: packed.bytes.length,
            headerSize: packed.headerSize,
            flags: packed.flags,
            canonicalJsonlBytes: packed.canonicalJsonlBytes,
        },
    };
}
