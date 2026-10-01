import { chengCsgFactIdentitiesThroughRootCli, requireChengCsgHeldExecLauncherIdentity, } from "./csg-cheng-bridge.js";
export function chengCsgFactIdentities(facts) {
    requireChengCsgHeldExecLauncherIdentity();
    return chengCsgFactIdentitiesThroughRootCli(facts);
}
