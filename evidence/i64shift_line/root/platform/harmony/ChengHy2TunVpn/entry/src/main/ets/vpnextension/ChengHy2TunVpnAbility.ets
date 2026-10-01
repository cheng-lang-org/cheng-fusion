import { Want } from '@kit.AbilityKit';
import { BusinessError, commonEventManager } from '@kit.BasicServicesKit';
import { fileIo } from '@kit.CoreFileKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { VpnExtensionAbility, vpnExtension } from '@kit.NetworkKit';
import hy2TunNative, { ChengHy2TunNativeStatus } from '../native/ChengHy2TunNative';
import {
  CHENG_HY2_TUN_BUNDLE,
  CHENG_HY2_TUN_MODE_TUN,
  CHENG_HY2_TUN_STATUS_EVENT,
  CHENG_HY2_TUN_STATUS_REQUEST_EVENT,
  CHENG_HY2_TUN_STOP_REQUEST_EVENT,
  ChengHy2TunPlatformConfig,
  ChengHy2TunStatusEventPayload,
  chengHy2TunCanonicalConfigJson,
  chengHy2TunConfigFromJson,
  chengHy2TunIsManagedDefaultConfig,
  chengHy2TunRequireConfigPath,
  chengHy2TunVpnConfig
} from '../common/ChengHy2TunContract';

const DOMAIN = 0x5456;
const TAG = 'ChengHy2TunVpnAbility';

interface ChengHy2TunIdentityFiles {
  certDer: Uint8Array;
  keyPk8Der: Uint8Array;
  trustRootDer: Uint8Array;
}

export default class ChengHy2TunVpnAbility extends VpnExtensionAbility {
  private vpnConnection?: vpnExtension.VpnConnection;
  private statusRequestSubscriber?: commonEventManager.CommonEventSubscriber;
  private stopRequestSubscriber?: commonEventManager.CommonEventSubscriber;
  private startPromise?: Promise<void>;
  private stopPromise?: Promise<void>;
  private activeConfigPath: string = '';
  private tunFd: number = -1;

  onCreate(want: Want): void {
    this.bindControlEvents().catch((err: Error) => {
      hilog.error(DOMAIN, TAG, 'control event bind failed: %{public}s', err.message);
    });
    this.beginStart(want);
  }

  onRequest(want: Want, startId: number): void {
    void startId;
    this.bindControlEvents().catch((err: Error) => {
      hilog.error(DOMAIN, TAG, 'control event bind failed: %{public}s', err.message);
    });
    this.beginStart(want);
  }

  private beginStart(want: Want): void {
    if (this.startPromise !== undefined) {
      this.publishState('starting', '', this.tunFd).catch((err: Error) => {
        hilog.error(DOMAIN, TAG, 'publish duplicate start state failed: %{public}s', err.message);
      });
      return;
    }
    this.startPromise = this.runStart(want);
    this.startPromise.catch((err: Error) => {
      if (err.message === 'native start cancelled by stop request') {
        this.publishState('disconnected', '', -1).catch((publishErr: Error) => {
          hilog.error(DOMAIN, TAG, 'publish cancelled start failed: %{public}s', publishErr.message);
        });
        return;
      }
      this.failClosed(err);
    }).finally(() => {
      this.startPromise = undefined;
    });
  }

  private async runStart(want: Want): Promise<void> {
    // Never race a new create against an in-flight stop: that republishes stale native
    // "connected" after OS VpnConnection is already destroyed (fake-ip DNS → 2300006).
    if (this.stopPromise !== undefined) {
      await this.stopPromise;
    }
    await this.startFromWant(want);
  }

  onDestroy(): void {
    hilog.info(DOMAIN, TAG, 'onDestroy stop begin');
    this.stopNativeAndVpnOnce().catch((err: Error) => {
      hilog.error(DOMAIN, TAG, 'stop failed: %{public}s', err.message);
    });
    this.unbindControlEvents();
  }

  private ownsActiveVpnSession(status: ChengHy2TunNativeStatus): boolean {
    return this.vpnConnection !== undefined &&
      this.tunFd >= 0 &&
      status.state === 'connected' &&
      status.connected &&
      status.sessionId > 0 &&
      status.tunFd === this.tunFd;
  }

  private async startFromWant(want: Want): Promise<void> {
    void want;
    hilog.info(DOMAIN, TAG, 'start request accepted');
    if (!hy2TunNative.coreAvailable()) {
      throw new Error('native Cheng hy2-tun core is missing');
    }
    const currentStatus = hy2TunNative.status();
    // Only reuse when THIS Ability still owns the OS VpnConnection. Native "connected"
    // alone is not enough: destroyVpnConnection can leave g_status connected with a dead TUN.
    if (this.ownsActiveVpnSession(currentStatus)) {
      await this.publishNativeStatus();
      return;
    }
    if (currentStatus.state === 'starting' || currentStatus.state === 'connected' ||
      currentStatus.state === 'stopping' || this.vpnConnection !== undefined || this.tunFd >= 0) {
      hilog.warn(DOMAIN, TAG,
        'start reclaiming stale session native=%{public}s tunFd=%{public}d ownsVpn=%{public}d',
        currentStatus.state, this.tunFd, this.vpnConnection !== undefined ? 1 : 0);
      await this.stopNativeAndVpnOnce();
    }
    await this.ensureDefaultFiles();
    const configPath = this.readSelectedConfigPath();
    let configJson = await fileIo.readText(configPath);
    const canonicalConfigJson = chengHy2TunCanonicalConfigJson(configJson);
    if (canonicalConfigJson !== configJson) {
      this.writeText(configPath, canonicalConfigJson);
      configJson = canonicalConfigJson;
    }
    const platformConfig = chengHy2TunConfigFromJson(configJson);
    if (platformConfig.productMode !== CHENG_HY2_TUN_MODE_TUN) {
      throw new Error('PAC mode does not start VpnExtension; Harmony global PAC requires SET_PAC_URL system permission');
    }
    const runtimeConfigJson = await this.configJsonWithResolvedAuthFiles(configPath, configJson);
    const identityFiles = this.loadIdentityFiles(configPath, platformConfig);
    const vpnConfig = chengHy2TunVpnConfig(platformConfig);
    this.activeConfigPath = configPath;
    await this.publishState('starting', '', -1);
    let sessionStarted = false;
    try {
      this.vpnConnection = vpnExtension.createVpnConnection(this.context);
      const tunFd = await this.vpnConnection.create(vpnConfig);
      if (tunFd < 0) {
        throw new Error('VpnConnection.create returned invalid tun fd');
      }
      this.tunFd = tunFd;
      await hy2TunNative.start({
        configJson: runtimeConfigJson,
        configPath: configPath,
        certDer: identityFiles.certDer,
        keyPk8Der: identityFiles.keyPk8Der,
        trustRootDer: identityFiles.trustRootDer,
        tunFd: tunFd,
        protectTimeoutMs: 15000
      }, (token: number, fd: number): void => {
        this.protectNativeFd(token, fd);
      });
      sessionStarted = true;
      await this.publishNativeStatus();
      hilog.info(DOMAIN, TAG, 'native hy2-tun started tunFd=%{public}d', tunFd);
    } finally {
      if (!sessionStarted) {
        await this.destroyVpnConnection();
      }
    }
  }

  private configDirectory(): string {
    return this.context.filesDir + '/cheng-hy2-tun';
  }

  private selectedConfigPath(): string {
    return this.configDirectory() + '/config.json';
  }

  private selectedConfigMarkerPath(): string {
    return this.selectedConfigPath() + '.managed-default';
  }

  private assetPath(name: string): string {
    return this.configDirectory() + '/' + name;
  }

  private ensureConfigDirectory(): void {
    const dir = this.configDirectory();
    if (!fileIo.accessSync(dir)) {
      fileIo.mkdirSync(dir, true);
    }
  }

  private bufferSlice(data: Uint8Array): ArrayBuffer {
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  }

  private writeBytes(path: string, data: Uint8Array): void {
    const file = fileIo.openSync(path, fileIo.OpenMode.CREATE | fileIo.OpenMode.TRUNC | fileIo.OpenMode.WRITE_ONLY);
    try {
      fileIo.writeSync(file.fd, this.bufferSlice(data), {
        length: data.byteLength
      });
    } finally {
      fileIo.closeSync(file);
    }
  }

  private writeText(path: string, value: string): void {
    const file = fileIo.openSync(path, fileIo.OpenMode.CREATE | fileIo.OpenMode.TRUNC | fileIo.OpenMode.WRITE_ONLY);
    try {
      fileIo.writeSync(file.fd, value);
    } finally {
      fileIo.closeSync(file);
    }
  }

  private readBytesIfFile(path: string): Uint8Array | undefined {
    if (!fileIo.accessSync(path)) {
      return undefined;
    }
    const stat = fileIo.statSync(path);
    if (stat.size <= 0) {
      return new Uint8Array();
    }
    const file = fileIo.openSync(path, fileIo.OpenMode.READ_ONLY);
    try {
      const buffer = new ArrayBuffer(stat.size);
      const readBytes = fileIo.readSync(file.fd, buffer, {
        length: stat.size
      });
      if (readBytes !== stat.size) {
        throw new Error('short read: ' + path);
      }
      return new Uint8Array(buffer);
    } finally {
      fileIo.closeSync(file);
    }
  }

  private bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
    if (left.byteLength !== right.byteLength) {
      return false;
    }
    for (let i = 0; i < left.byteLength; i++) {
      if (left[i] !== right[i]) {
        return false;
      }
    }
    return true;
  }

  private async installRawFileIfMissing(rawName: string, destinationPath: string): Promise<void> {
    if (fileIo.accessSync(destinationPath)) {
      const stat = fileIo.statSync(destinationPath);
      if (stat.size > 0) {
        return;
      }
    }
    const data = await this.context.resourceManager.getRawFileContent(rawName);
    if (data.byteLength === 0) {
      throw new Error('empty rawfile: ' + rawName);
    }
    this.writeBytes(destinationPath, data);
  }

  private async installManagedDefaultConfig(): Promise<void> {
    const configPath = this.selectedConfigPath();
    const markerPath = this.selectedConfigMarkerPath();
    const bundledConfig = await this.context.resourceManager.getRawFileContent('hy2-tun-client.example.json');
    if (bundledConfig.byteLength === 0) {
      throw new Error('empty rawfile: hy2-tun-client.example.json');
    }
    const currentConfig = this.readBytesIfFile(configPath);
    if (currentConfig === undefined || currentConfig.byteLength === 0) {
      this.writeBytes(configPath, bundledConfig);
      this.writeBytes(markerPath, bundledConfig);
      return;
    }
    const markerConfig = this.readBytesIfFile(markerPath);
    if (markerConfig !== undefined) {
      if (this.bytesEqual(currentConfig, markerConfig) && !this.bytesEqual(currentConfig, bundledConfig)) {
        this.writeBytes(configPath, bundledConfig);
        this.writeBytes(markerPath, bundledConfig);
      }
      return;
    }
    const currentText = await fileIo.readText(configPath);
    if (chengHy2TunIsManagedDefaultConfig(currentText)) {
      this.writeBytes(configPath, bundledConfig);
      this.writeBytes(markerPath, bundledConfig);
    }
  }

  private async ensureDefaultFiles(): Promise<void> {
    this.ensureConfigDirectory();
    await this.installManagedDefaultConfig();
    await this.installRawFileIfMissing('auth.token', this.assetPath('auth.token'));
    await this.installRawFileIfMissing('transport.cert.der', this.assetPath('transport.cert.der'));
    await this.installRawFileIfMissing('transport.key.pk8', this.assetPath('transport.key.pk8'));
    await this.installRawFileIfMissing('transport.root.der', this.assetPath('transport.root.der'));
  }

  private readSelectedConfigPath(): string {
    const configPath = chengHy2TunRequireConfigPath(this.selectedConfigPath());
    const stat = fileIo.statSync(configPath);
    if (stat.size <= 0) {
      throw new Error('config_path file is empty');
    }
    return configPath;
  }

  private loadIdentityFiles(configPath: string, config: ChengHy2TunPlatformConfig): ChengHy2TunIdentityFiles {
    return {
      certDer: this.readConfigSiblingFile(configPath, config.certDerName, 'client.cert_der'),
      keyPk8Der: this.readConfigSiblingFile(configPath, config.keyPk8DerName, 'client.key_pk8_der'),
      trustRootDer: this.readConfigSiblingFile(configPath, config.trustRootDerName, 'client.trust_root_der')
    };
  }

  private async configJsonWithResolvedAuthFiles(configPath: string, configJson: string): Promise<string> {
    const root = JSON.parse(configJson) as Record<string, Object>;
    const exitsValue = root['exits'];
    if (!Array.isArray(exitsValue) || exitsValue.length === 0) {
      throw new Error('exits[] missing');
    }
    for (let i = 0; i < exitsValue.length; i++) {
      const entry = exitsValue[i] as Record<string, Object>;
      const authValue = entry['auth'];
      if (typeof authValue === 'string' && authValue.length > 0) {
        continue;
      }
      const authFileValue = entry['auth_file'];
      if (typeof authFileValue !== 'string' || authFileValue.length === 0) {
        throw new Error('exit auth missing: set auth_file or import a config with auth');
      }
      const tokenText = await fileIo.readText(this.configSiblingPath(configPath, authFileValue, 'exits[].auth_file'));
      entry['auth'] = this.authTokenFromText(tokenText, 'exits[].auth_file');
    }
    return JSON.stringify(root);
  }

  private configSiblingPath(configPath: string, name: string, label: string): string {
    if (name.indexOf('/') >= 0 || name.indexOf('\\') >= 0 || name.indexOf('..') >= 0 || name.indexOf('://') >= 0) {
      throw new Error(label + ' must be a file name in config directory');
    }
    const slash = configPath.lastIndexOf('/');
    if (slash <= 0) {
      throw new Error('invalid config path');
    }
    return configPath.substring(0, slash + 1) + name;
  }

  private authTokenFromText(raw: string, label: string): string {
    let token = raw;
    if (token.endsWith('\n')) {
      token = token.substring(0, token.length - 1);
      if (token.endsWith('\r')) {
        token = token.substring(0, token.length - 1);
      }
    }
    if (token.indexOf('\n') >= 0 || token.indexOf('\r') >= 0 || token.indexOf('\t') >= 0 || token.indexOf(' ') >= 0) {
      throw new Error(label + ' token contains whitespace');
    }
    if (token.length < 32) {
      throw new Error(label + ' token must be at least 32 bytes');
    }
    return token;
  }

  private readConfigSiblingFile(configPath: string, name: string, label: string): Uint8Array {
    const path = this.configSiblingPath(configPath, name, label);
    const stat = fileIo.statSync(path);
    if (stat.size <= 0 || stat.size > 1048576) {
      throw new Error(label + ' size is invalid');
    }
    const file = fileIo.openSync(path, fileIo.OpenMode.READ_ONLY);
    try {
      const buffer = new ArrayBuffer(stat.size);
      const readBytes = fileIo.readSync(file.fd, buffer, {
        length: stat.size
      });
      if (readBytes !== stat.size) {
        throw new Error(label + ' short read');
      }
      return new Uint8Array(buffer);
    } finally {
      fileIo.closeSync(file);
    }
  }

  private protectNativeFd(token: number, fd: number): void {
    if (!this.vpnConnection) {
      hy2TunNative.completeProtect(token, false);
      this.failClosed(new Error('protect failed: vpn connection is not active'));
      return;
    }
    this.vpnConnection.protect(fd).then(() => {
      hy2TunNative.completeProtect(token, true);
    }).catch((err: BusinessError) => {
      hilog.error(DOMAIN, TAG, 'protect failed fd=%{public}d err=%{public}s', fd, JSON.stringify(err));
      hy2TunNative.completeProtect(token, false);
      this.failClosed(new Error('protect failed: ' + JSON.stringify(err)));
    });
  }

  private stopNativeAndVpnOnce(): Promise<void> {
    if (this.stopPromise !== undefined) {
      return this.stopPromise;
    }
    this.stopPromise = this.stopNativeAndVpn().finally(() => {
      this.stopPromise = undefined;
    });
    return this.stopPromise;
  }

  private async stopNativeAndVpn(): Promise<void> {
    const activeTunFd = this.tunFd;
    hilog.info(DOMAIN, TAG, 'stopNativeAndVpn begin tunFd=%{public}d', activeTunFd);
    await this.publishState('stopping', '', activeTunFd);
    // Stop native first so g_status cannot stay "connected" after OS TUN is gone.
    hilog.info(DOMAIN, TAG, 'stopNativeAndVpn native stop request');
    await hy2TunNative.stop();
    hilog.info(DOMAIN, TAG, 'stopNativeAndVpn native stop join');
    await hy2TunNative.stop();
    hilog.info(DOMAIN, TAG, 'stopNativeAndVpn destroy vpn connection');
    // Publish disconnected BEFORE destroying the connection: the system may
    // terminate this extension process during destroy(), and the UI waits for
    // the disconnected state event to leave its "stopping" spinner.
    await this.publishState('disconnected', '', -1);
    await this.destroyVpnConnection();
    hilog.info(DOMAIN, TAG, 'stopNativeAndVpn disconnected');
  }

  private async destroyVpnConnection(): Promise<void> {
    const connection = this.vpnConnection;
    this.vpnConnection = undefined;
    this.tunFd = -1;
    if (connection !== undefined) {
      await connection.destroy();
    }
  }

  private failClosed(err: Error): void {
    hilog.error(DOMAIN, TAG, 'start failed: %{public}s', this.redactSecrets(err.message));
    this.stopNativeAndVpnOnce().catch((stopErr: Error) => {
      hilog.error(DOMAIN, TAG, 'fail-closed destroy failed: %{public}s', stopErr.message);
    }).finally(() => {
      this.publishState('error', this.redactSecrets(err.message), -1).catch((publishErr: Error) => {
        hilog.error(DOMAIN, TAG, 'publish failure failed: %{public}s', publishErr.message);
      });
    });
  }

  private async bindControlEvents(): Promise<void> {
    await this.bindStatusRequestEvents();
    await this.bindStopRequestEvents();
  }

  private async bindStatusRequestEvents(): Promise<void> {
    if (this.statusRequestSubscriber !== undefined) {
      return;
    }
    this.statusRequestSubscriber = await commonEventManager.createSubscriber({
      events: [
        CHENG_HY2_TUN_STATUS_REQUEST_EVENT
      ]
    });
    commonEventManager.subscribe(this.statusRequestSubscriber,
      (err: BusinessError, _data: commonEventManager.CommonEventData) => {
        if (err) {
          hilog.error(DOMAIN, TAG, 'status request event failed: %{public}s', JSON.stringify(err));
          return;
        }
        this.publishNativeStatus().catch((publishErr: Error) => {
          hilog.error(DOMAIN, TAG, 'status response publish failed: %{public}s', publishErr.message);
        });
      });
  }

  private async bindStopRequestEvents(): Promise<void> {
    if (this.stopRequestSubscriber !== undefined) {
      return;
    }
    this.stopRequestSubscriber = await commonEventManager.createSubscriber({
      events: [
        CHENG_HY2_TUN_STOP_REQUEST_EVENT
      ]
    });
    commonEventManager.subscribe(this.stopRequestSubscriber,
      (err: BusinessError, _data: commonEventManager.CommonEventData) => {
        if (err) {
          hilog.error(DOMAIN, TAG, 'stop request event failed: %{public}s', JSON.stringify(err));
          return;
        }
        hilog.info(DOMAIN, TAG, 'stop request event accepted');
        this.stopNativeAndVpnOnce().catch((stopErr: Error) => {
          hilog.error(DOMAIN, TAG, 'stop request failed: %{public}s', stopErr.message);
          this.publishState('error', this.redactSecrets(stopErr.message), -1).catch((publishErr: Error) => {
            hilog.error(DOMAIN, TAG, 'publish stop failure failed: %{public}s', publishErr.message);
          });
        });
      });
  }

  private unbindControlEvents(): void {
    this.unbindStatusRequestEvents();
    this.unbindStopRequestEvents();
  }

  private unbindStatusRequestEvents(): void {
    if (this.statusRequestSubscriber === undefined) {
      return;
    }
    commonEventManager.unsubscribe(this.statusRequestSubscriber, (err: BusinessError) => {
      if (err) {
        hilog.error(DOMAIN, TAG, 'status request unsubscribe failed: %{public}s', JSON.stringify(err));
      }
    });
    this.statusRequestSubscriber = undefined;
  }

  private unbindStopRequestEvents(): void {
    if (this.stopRequestSubscriber === undefined) {
      return;
    }
    commonEventManager.unsubscribe(this.stopRequestSubscriber, (err: BusinessError) => {
      if (err) {
        hilog.error(DOMAIN, TAG, 'stop request unsubscribe failed: %{public}s', JSON.stringify(err));
      }
    });
    this.stopRequestSubscriber = undefined;
  }

  private async publishNativeStatus(): Promise<void> {
    const status: ChengHy2TunNativeStatus = hy2TunNative.status();
    // Never mirror native "connected" when Ability no longer owns VpnConnection —
    // that is the zombie UI state (已连接 + rx/tx=0 + fake-ip DNS 2300006).
    if ((status.state === 'connected' || status.connected) && !this.ownsActiveVpnSession(status)) {
      await this.publishState('error', 'vpn reported connected without owned VpnConnection', -1);
      return;
    }
    await this.publishStatus({
      state: status.state,
      configPath: this.activeConfigPath,
      connected: status.connected,
      sessionId: status.sessionId,
      tunFd: status.tunFd,
      coreAvailable: status.coreAvailable,
      rxBytes: status.rxBytes,
      txBytes: status.txBytes,
      memAlloc: status.memAlloc,
      memFree: status.memFree,
      memLive: status.memLive,
      text: status.text,
      lastError: status.lastError
    });
  }

  private async publishState(state: string, lastError: string, tunFd: number): Promise<void> {
    await this.publishStatus({
      state: state,
      configPath: this.activeConfigPath,
      connected: state === 'connected',
      sessionId: 0,
      tunFd: tunFd,
      coreAvailable: hy2TunNative.coreAvailable(),
      rxBytes: 0,
      txBytes: 0,
      memAlloc: 0,
      memFree: 0,
      memLive: 0,
      text: state,
      lastError: lastError
    });
  }

  private async publishStatus(status: ChengHy2TunStatusEventPayload): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      commonEventManager.publish(CHENG_HY2_TUN_STATUS_EVENT, {
        bundleName: CHENG_HY2_TUN_BUNDLE,
        parameters: {
          state: status.state,
          configPath: status.configPath,
          connected: status.connected ? 1 : 0,
          sessionId: status.sessionId,
          tunFd: status.tunFd,
          coreAvailable: status.coreAvailable ? 1 : 0,
          rxBytes: status.rxBytes,
          txBytes: status.txBytes,
          memAlloc: status.memAlloc,
          memFree: status.memFree,
          memLive: status.memLive,
          text: status.text,
          lastError: this.redactSecrets(status.lastError)
        }
      }, (err: BusinessError) => {
        if (err) {
          reject(new Error(JSON.stringify(err)));
          return;
        }
        resolve();
      });
    });
  }

  private redactSecrets(text: string): string {
    return text.replace(/((auth|token|secret|key)[A-Za-z0-9_.-]*=)[^\s,}]+/ig, '$1<redacted>')
      .replace(/("(auth|token|secret|key_pk8_der|expected_auth_sha256)"\s*:\s*")[^"]*/ig, '$1<redacted>');
  }
}
