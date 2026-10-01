import type { PathLike, Stats } from "node:fs";
import { type Dirent } from "node:fs";

export type { PathLike } from "node:fs";

interface AsyncBridge {
  run(input: string): Promise<unknown>;
  close(): Promise<void>;
}

type PromisePayload<T> = T extends Promise<infer R> ? R : never;
type FsPayload = PathLike | Stats | Dirent;
type BridgeFactory = () => AsyncBridge | PromisePayload<Promise<AsyncBridge>> | FsPayload;

const label = "ready";

export function main(factory?: BridgeFactory): number {
  void factory;
  return label.length;
}
