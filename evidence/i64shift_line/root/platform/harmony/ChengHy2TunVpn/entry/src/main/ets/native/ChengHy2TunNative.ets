import chengHy2TunVpn from 'libcheng_hy2_tun_vpn.so';

export interface ChengHy2TunNativeStartRequest {
  configJson: string;
  configPath: string;
  certDer: Uint8Array;
  keyPk8Der: Uint8Array;
  trustRootDer: Uint8Array;
  tunFd: number;
  protectTimeoutMs: number;
}

export interface ChengHy2TunNativeStartResult {
  connected: boolean;
  sessionId: number;
  tunFd: number;
}

export interface ChengHy2TunNativeStopResult {
  stopped: boolean;
}

export interface ChengHy2TunNativeStatus {
  state: string;
  connected: boolean;
  sessionId: number;
  tunFd: number;
  coreAvailable: boolean;
  rxBytes: number;
  txBytes: number;
  memAlloc: number;
  memFree: number;
  memLive: number;
  text: string;
  lastError: string;
}

export interface ChengHy2TunGuiSnapshotRequest {
  platform: string;
  configPath: string;
}

export type ChengHy2TunProtectHandler = (token: number, fd: number) => void;

interface ChengHy2TunNativeModule {
  coreAvailable(): boolean;
  guiSnapshot(request: ChengHy2TunGuiSnapshotRequest): string;
  start(request: ChengHy2TunNativeStartRequest, protectHandler: ChengHy2TunProtectHandler): Promise<ChengHy2TunNativeStartResult>;
  stop(): Promise<ChengHy2TunNativeStopResult>;
  status(): ChengHy2TunNativeStatus;
  completeProtect(token: number, allowed: boolean): boolean;
}

const nativeBridge = chengHy2TunVpn as ChengHy2TunNativeModule;

export default nativeBridge;
