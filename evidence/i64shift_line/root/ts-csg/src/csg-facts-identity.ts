import {
  chengCsgFactIdentitiesThroughRootCli,
  requireChengCsgHeldExecLauncherIdentity,
} from "./csg-cheng-bridge.js";
import type { CsgFact } from "./schema.js";

export interface ChengCsgFactIdentity {
  factHash: string;
  subgraphCid: string;
}

export function chengCsgFactIdentities(
  facts: readonly CsgFact[],
): ChengCsgFactIdentity[] {
  requireChengCsgHeldExecLauncherIdentity();
  return chengCsgFactIdentitiesThroughRootCli(facts);
}
