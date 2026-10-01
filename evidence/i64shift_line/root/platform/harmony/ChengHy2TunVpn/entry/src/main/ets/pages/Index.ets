import { common, Want } from '@kit.AbilityKit';
import { BusinessError, commonEventManager } from '@kit.BasicServicesKit';
import { fileIo, fileUri, picker } from '@kit.CoreFileKit';
import { connection, http, vpnExtension } from '@kit.NetworkKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import hy2TunNative, { ChengHy2TunNativeStatus } from '../native/ChengHy2TunNative';
import {
  CHENG_HY2_TUN_DEFAULT_DNS,
  CHENG_HY2_TUN_MODE_PAC,
  CHENG_HY2_TUN_MODE_TUN,
  CHENG_HY2_TUN_ROUTE_FAST,
  CHENG_HY2_TUN_ROUTE_GLOBAL,
  CHENG_HY2_TUN_TCP_TLS_FORWARD_PORT,
  CHENG_HY2_TUN_UDP_QUIC_PORT,
  CHENG_HY2_TUN_STATUS_EVENT,
  CHENG_HY2_TUN_STATUS_REQUEST_EVENT,
  CHENG_HY2_TUN_STOP_REQUEST_EVENT,
  ChengHy2TunPlatformConfig,
  chengHy2TunCanonicalConfigJson,
  chengHy2TunConfigFromJson,
  chengHy2TunIsManagedDefaultConfig,
  chengHy2TunRequireConfigPath,
  chengHy2TunWant
} from '../common/ChengHy2TunContract';

const DOMAIN = 0x5456;
const TAG = 'ChengHy2TunIndex';

interface StatusParameters {
  state?: string;
  configPath?: string;
  connected?: boolean | number | string;
  sessionId?: number | string;
  tunFd?: number | string;
  coreAvailable?: boolean | number | string;
  rxBytes?: number | string;
  txBytes?: number | string;
  memAlloc?: number | string;
  memFree?: number | string;
  memLive?: number | string;
  text?: string;
  lastError?: string;
}

interface ChengGuiComponent {
  id: string;
  kind: string;
  slot: string;
  text: string;
  action: string;
  style: string;
  enabled: boolean;
  minTouchDp: number;
  accessibility: string;
}

interface ChengGuiTheme {
  background: string;
  text: string;
  inverseText: string;
  muted: string;
  mutedDark: string;
  primary: string;
  success: string;
  warning: string;
  danger: string;
  dangerSoft: string;
  surface: string;
  disabled: string;
  disabledText: string;
  border: string;
}

@Entry
@Component
struct Index {
  @State guiTitle: string = '代理';
  @State guiSchemaError: string = '';
  @State guiRenderVersion: number = 0;
  @State configPath: string = '';
  @State configSummary: string = '';
  @State statusText: string = 'disconnected';
  @State sessionText: string = 'session: 0';
  @State tunText: string = 'tun: -1';
  @State trafficText: string = 'rx: 0 / tx: 0';
  @State coreText: string = 'core: unchecked';
  @State productMode: string = CHENG_HY2_TUN_MODE_TUN;
  @State modeText: string = 'mode: tun';
  @State transportText: string = 'transport: unknown';
  @State pacText: string = 'pac: inactive';
  @State googleTestText: string = 'google: not tested';
  @State errorText: string = '';
  private statusSubscriber?: commonEventManager.CommonEventSubscriber;
  private stopCompletionResolve?: () => void;
  private stopCompletionReject?: (err: Error) => void;
  private stopCompletionTimer: number = -1;
  @State nativeStopAvailable: boolean = false;
  @State stopControlAvailable: boolean = false;
  @State stopFinalizedLocal: boolean = false;
  private rxBytesValue: number = 0;
  private txBytesValue: number = 0;
  private sessionIdValue: number = 0;
  private tunFdValue: number = -1;
  @State guiComponents: Record<string, ChengGuiComponent> = {};
  @State guiMinTouchDp: number = 52;
  @State guiButtonRows: string[][] = [
    ['proxy_toggle'],
    ['test_google']
  ];
  @State guiTheme: ChengGuiTheme = {
    background: '#FFFFFF',
    text: '#0F172A',
    inverseText: '#FFFFFF',
    muted: '#475569',
    mutedDark: '#334155',
    primary: '#155EEF',
    success: '#16A34A',
    warning: '#D97706',
    danger: '#DC2626',
    dangerSoft: '#FEF2F2',
    surface: '#F8FAFC',
    disabled: '#F1F5F9',
    disabledText: '#94A3B8',
    border: '#E2E8F0'
  };

  aboutToAppear(): void {
    this.bindStatusEvents().catch((err: Error) => {
      this.errorText = err.message;
    });
    this.ensureDefaultConfigLoaded().then(() => {
      this.requestStatus();
    }).catch((err: Error) => {
      this.statusText = 'error';
      this.errorText = err.message;
    });
  }

  aboutToDisappear(): void {
    if (this.statusSubscriber) {
      commonEventManager.unsubscribe(this.statusSubscriber, (err: BusinessError) => {
        if (err) {
          console.error('unsubscribe status event failed: ' + JSON.stringify(err));
        }
      });
      this.statusSubscriber = undefined;
    }
  }

  private abilityContext(): common.UIAbilityContext {
    const context = this.getUIContext().getHostContext();
    if (context === undefined) {
      throw new Error('UIAbility context unavailable');
    }
    return context as common.UIAbilityContext;
  }

  private configDirectory(context: common.UIAbilityContext): string {
    return context.filesDir + '/cheng-hy2-tun';
  }

  private selectedConfigPath(context: common.UIAbilityContext): string {
    return this.configDirectory(context) + '/config.json';
  }

  private selectedConfigMarkerPath(context: common.UIAbilityContext): string {
    return this.selectedConfigPath(context) + '.managed-default';
  }

  private assetPath(context: common.UIAbilityContext, name: string): string {
    return this.configDirectory(context) + '/' + name;
  }

  private ensureConfigDirectory(context: common.UIAbilityContext): void {
    const dir = this.configDirectory(context);
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

  private async installRawFile(context: common.UIAbilityContext, rawName: string, destinationPath: string): Promise<void> {
    const data = await context.resourceManager.getRawFileContent(rawName);
    if (data.byteLength === 0) {
      throw new Error('empty rawfile: ' + rawName);
    }
    this.writeBytes(destinationPath, data);
  }

  private async installRawFileIfMissing(context: common.UIAbilityContext, rawName: string, destinationPath: string): Promise<void> {
    if (fileIo.accessSync(destinationPath)) {
      const stat = fileIo.statSync(destinationPath);
      if (stat.size > 0) {
        return;
      }
    }
    await this.installRawFile(context, rawName, destinationPath);
  }

  private async installManagedDefaultConfig(context: common.UIAbilityContext): Promise<void> {
    const configPath = this.selectedConfigPath(context);
    const markerPath = this.selectedConfigMarkerPath(context);
    const bundledConfig = await context.resourceManager.getRawFileContent('hy2-tun-client.example.json');
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

  private async ensureDefaultConfigLoaded(): Promise<void> {
    const context = this.abilityContext();
    this.ensureConfigDirectory(context);
    await this.installManagedDefaultConfig(context);
    await this.installRawFileIfMissing(context, 'auth.token', this.assetPath(context, 'auth.token'));
    await this.installRawFileIfMissing(context, 'transport.cert.der', this.assetPath(context, 'transport.cert.der'));
    await this.installRawFileIfMissing(context, 'transport.key.pk8', this.assetPath(context, 'transport.key.pk8'));
    await this.installRawFileIfMissing(context, 'transport.root.der', this.assetPath(context, 'transport.root.der'));
    await this.loadConfigPath(this.selectedConfigPath(context));
  }

  private async chooseConfig(): Promise<void> {
    try {
      this.errorText = '';
      const context = this.abilityContext();
      const documentPicker = new picker.DocumentViewPicker(context);
      const uris = await documentPicker.select({
        maxSelectNumber: 1,
        fileSuffixFilters: ['JSON|.json']
      });
      if (uris.length === 0) {
        return;
      }
      this.ensureConfigDirectory(context);
      const destinationPath = this.selectedConfigPath(context);
      await fileIo.copy(uris[0], fileUri.getUriFromPath(destinationPath));
      await this.loadConfigPath(destinationPath);
    } catch (err) {
      this.statusText = 'error';
      this.errorText = this.errorMessage(err);
    }
  }

  private async loadConfigPath(configPath: string): Promise<void> {
    const path = chengHy2TunRequireConfigPath(configPath);
    let configJson = await fileIo.readText(path);
    const canonicalConfigJson = chengHy2TunCanonicalConfigJson(configJson);
    if (canonicalConfigJson !== configJson) {
      this.writeText(path, canonicalConfigJson);
      configJson = canonicalConfigJson;
    }
    const parsed = chengHy2TunConfigFromJson(configJson);
    this.configPath = path;
    this.configSummary = this.configSummaryText(parsed);
    this.productMode = parsed.routeMode;
    this.modeText = 'mode: ' + parsed.routeMode;
    this.transportText = 'transport: ' + parsed.transport;
    this.refreshChengGuiModel(path);
  }

  private refreshChengGuiModel(configPath: string): void {
    try {
      const snapshot = hy2TunNative.guiSnapshot({
        platform: 'harmony',
        configPath: configPath
      });
      const parsed = JSON.parse(snapshot) as Record<string, Object>;
      if (parsed['format'] !== 'cheng_hy2_tun_mobile_gui_v2') {
        throw new Error('invalid Cheng GUI format');
      }
      if (parsed['source'] !== 'pure-cheng') {
        throw new Error('invalid Cheng GUI source');
      }
      if (parsed['host_role'] !== 'render-only') {
        throw new Error('invalid Cheng GUI host role');
      }
      if (parsed['button_layout'] !== 'top-fixed') {
        throw new Error('invalid Cheng GUI button layout');
      }
      if (parsed['status_layout'] !== 'below-buttons') {
        throw new Error('invalid Cheng GUI status layout');
      }
      const ux = parsed['ux'] as Record<string, Object>;
      if (typeof ux !== 'object' || ux === null) {
        throw new Error('missing Cheng GUI ux');
      }
      const minTouch = typeof ux['min_touch_dp'] === 'number' ? ux['min_touch_dp'] as number : 0;
      if (minTouch < 48) {
        throw new Error('invalid Cheng GUI touch target');
      }
      if (ux['stable_button_geometry'] !== true) {
        throw new Error('invalid Cheng GUI button geometry');
      }
      if (ux['no_screenshot_positioning'] !== true) {
        throw new Error('invalid Cheng GUI positioning contract');
      }
      const rawTheme = parsed['theme'];
      if (typeof rawTheme !== 'object' || rawTheme === null || Array.isArray(rawTheme)) {
        throw new Error('missing Cheng GUI theme');
      }
      const rawComponents = parsed['components'];
      if (!Array.isArray(rawComponents)) {
        throw new Error('missing Cheng GUI components');
      }
      const components: Record<string, ChengGuiComponent> = {};
      for (let i = 0; i < rawComponents.length; i++) {
        const raw = rawComponents[i] as Record<string, Object>;
        const id = typeof raw['id'] === 'string' ? raw['id'] as string : '';
        if (id.length === 0) {
          throw new Error('empty Cheng GUI component id');
        }
        components[id] = {
          id: id,
          kind: typeof raw['kind'] === 'string' ? raw['kind'] as string : '',
          slot: typeof raw['slot'] === 'string' ? raw['slot'] as string : '',
          text: typeof raw['text'] === 'string' ? raw['text'] as string : '',
          action: typeof raw['action'] === 'string' ? raw['action'] as string : '',
          style: typeof raw['style'] === 'string' ? raw['style'] as string : '',
          enabled: typeof raw['enabled'] === 'boolean' ? raw['enabled'] as boolean : true,
          minTouchDp: typeof raw['min_touch_dp'] === 'number' ? raw['min_touch_dp'] as number : 0,
          accessibility: typeof raw['accessibility'] === 'string' ? raw['accessibility'] as string : id
        };
      }
      const required = [
        'title',
        'proxy_toggle',
        'test_google',
        'google_status',
        'status_badge',
        'core_text',
        'detail_text',
        'traffic_text',
        'error_text'
      ];
      for (let i = 0; i < required.length; i++) {
        if (components[required[i]] === undefined) {
          throw new Error('missing Cheng GUI component: ' + required[i]);
        }
      }
      this.guiComponents = components;
      this.guiMinTouchDp = minTouch;
      this.guiTheme = this.parseGuiTheme(rawTheme as Record<string, Object>);
      this.guiButtonRows = this.parseGuiButtonRows(parsed['button_rows'], components);
      this.guiTitle = this.guiText('title', '代理');
      this.guiSchemaError = '';
      this.guiRenderVersion = this.guiRenderVersion + 1;
    } catch (err) {
      this.statusText = 'error';
      this.guiSchemaError = 'cheng gui contract: ' + this.errorMessage(err);
      this.errorText = this.guiSchemaError;
    }
  }

  private verifyChengGuiContract(configPath: string): void {
    this.refreshChengGuiModel(configPath);
  }

  private guiComponent(id: string): ChengGuiComponent {
    const component = this.guiComponents[id];
    if (component !== undefined) {
      return component;
    }
    return {
      id: id,
      kind: 'text',
      slot: '',
      text: id,
      action: '',
      style: 'body',
      enabled: false,
      minTouchDp: 0,
      accessibility: id
    };
  }

  private guiText(id: string, defaultText: string): string {
    const component = this.guiComponents[id];
    if (component !== undefined && component.text.length > 0) {
      return component.text;
    }
    return defaultText;
  }

  private guiEnabled(id: string): boolean {
    return this.guiComponent(id).enabled;
  }

  private guiRuntimeEnabled(id: string): boolean {
    const running = this.statusText === 'starting' || this.statusText === 'connected' || this.statusText === 'stopping';
    const visibleError = this.errorText.length > 0 || this.guiSchemaError.length > 0 ||
      this.statusText === 'error' || this.statusText === 'failed';
    const needsStopOrReset = running || this.nativeStopAvailable || this.stopControlAvailable ||
      visibleError;
    if (id === 'proxy_toggle') {
      return this.guiEnabled(id) && (needsStopOrReset || this.configPath.length > 0);
    }
    if (id === 'start') {
      return this.configPath.length > 0 && !needsStopOrReset;
    }
    if (id === 'stop') {
      return true;
    }
    if (id === 'test_google') {
      return this.statusText === 'connected';
    }
    if (id === 'mode_global' || id === 'mode_fast' || id === 'transport_udp_quic' || id === 'transport_tcp_forward') {
      return this.guiEnabled(id) && this.configPath.length > 0 && !running;
    }
    return this.guiEnabled(id);
  }

  private guiButtonHeight(id: string): number {
    const component = this.guiComponent(id);
    if (component.minTouchDp > 0) {
      return component.minTouchDp;
    }
    return this.guiMinTouchDp;
  }

  private parseGuiButtonRows(rawRows: Object | undefined, components: Record<string, ChengGuiComponent>): string[][] {
    if (!Array.isArray(rawRows) || rawRows.length === 0) {
      throw new Error('missing Cheng GUI button rows');
    }
    const rawRowsArray = rawRows as Array<Object>;
    const rows: string[][] = [];
    for (let rowIndex = 0; rowIndex < rawRowsArray.length; rowIndex++) {
      const rawRowValue = rawRowsArray[rowIndex];
      const rawRow = rawRowValue as Array<Object>;
      if (!Array.isArray(rawRow) || rawRow.length === 0) {
        throw new Error('invalid Cheng GUI button row');
      }
      const row: string[] = [];
      for (let columnIndex = 0; columnIndex < rawRow.length; columnIndex++) {
        const idValue: Object = rawRow[columnIndex];
        const id = idValue as string;
        if (typeof id !== 'string' || id.length === 0) {
          throw new Error('empty Cheng GUI button id');
        }
        const component = components[id];
        if (component === undefined) {
          throw new Error('missing Cheng GUI button component: ' + id);
        }
        if (component.kind !== 'button') {
          throw new Error('non-button in Cheng GUI button row: ' + id);
        }
        row.push(id);
      }
      rows.push(row);
    }
    return rows;
  }

  private parseGuiTheme(raw: Record<string, Object>): ChengGuiTheme {
    return {
      background: this.requireGuiColor(raw, 'background'),
      text: this.requireGuiColor(raw, 'text'),
      inverseText: this.requireGuiColor(raw, 'inverse_text'),
      muted: this.requireGuiColor(raw, 'muted'),
      mutedDark: this.requireGuiColor(raw, 'muted_dark'),
      primary: this.requireGuiColor(raw, 'primary'),
      success: this.requireGuiColor(raw, 'success'),
      warning: this.requireGuiColor(raw, 'warning'),
      danger: this.requireGuiColor(raw, 'danger'),
      dangerSoft: this.requireGuiColor(raw, 'danger_soft'),
      surface: this.requireGuiColor(raw, 'surface'),
      disabled: this.requireGuiColor(raw, 'disabled'),
      disabledText: this.requireGuiColor(raw, 'disabled_text'),
      border: this.requireGuiColor(raw, 'border')
    };
  }

  private requireGuiColor(raw: Record<string, Object>, key: string): string {
    const value = raw[key];
    if (typeof value !== 'string' || value.length !== 7 || value.charAt(0) !== '#') {
      throw new Error('invalid Cheng GUI theme color: ' + key);
    }
    for (let i = 1; i < value.length; i++) {
      const code = value.charCodeAt(i);
      const isDigit = code >= 48 && code <= 57;
      const isUpperHex = code >= 65 && code <= 70;
      const isLowerHex = code >= 97 && code <= 102;
      if (!isDigit && !isUpperHex && !isLowerHex) {
        throw new Error('invalid Cheng GUI theme color: ' + key);
      }
    }
    return value;
  }

  private async validateCurrentConfigPath(): Promise<string> {
    const path = chengHy2TunRequireConfigPath(this.configPath);
    await this.loadConfigPath(path);
    return path;
  }

  private async startVpn(): Promise<void> {
    try {
      this.errorText = '';
      await this.validateCurrentConfigPath();
      if (this.productMode !== CHENG_HY2_TUN_ROUTE_FAST && this.productMode !== CHENG_HY2_TUN_ROUTE_GLOBAL) {
        throw new Error('TUN start requires route_mode=fast/global');
      }
      this.pacText = 'pac: inactive';
      if (!hy2TunNative.coreAvailable()) {
        throw new Error('native Cheng hy2-tun core is missing');
      }
      this.statusText = 'starting';
      this.stopControlAvailable = true;
      this.stopFinalizedLocal = false;
      await vpnExtension.startVpnExtensionAbility(chengHy2TunWant());
      this.requestStatus();
    } catch (err) {
      this.statusText = 'error';
      this.errorText = this.errorMessage(err);
    }
  }

  private async startCurrentMode(): Promise<void> {
    try {
      await this.validateCurrentConfigPath();
      await this.startVpn();
    } catch (err) {
      this.statusText = 'error';
      this.errorText = this.errorMessage(err);
    }
  }

  private async startPacMode(): Promise<void> {
    try {
      this.errorText = '';
      await this.validateCurrentConfigPath();
      if (this.productMode !== CHENG_HY2_TUN_MODE_PAC) {
        throw new Error('PAC start requires mode=pac');
      }
      if (this.statusText === 'connected' || this.statusText === 'starting') {
        await this.stopVpn();
      }
      const currentPacFileUrl = connection.getPacFileUrl();
      this.pacText = currentPacFileUrl.length > 0 ? 'pac: existing system pac detected' : 'pac: system api readable';
      throw new Error('PAC mode unsupported: Harmony global PAC requires SET_PAC_URL system permission; system PAC URL was not changed');
    } catch (err) {
      this.statusText = 'error';
      this.pacText = 'pac: unsupported';
      this.errorText = this.errorMessage(err);
    }
  }

  private async setTransport(transport: string): Promise<void> {
    try {
      this.errorText = '';
      const configPath = await this.validateCurrentConfigPath();
      const configJson = await fileIo.readText(configPath);
      const root = JSON.parse(configJson) as Record<string, Object>;
      const exitsValue = root['exits'];
      if (!Array.isArray(exitsValue) || exitsValue.length === 0) {
        throw new Error('exits[] missing');
      }
      if (transport !== 'udp-quic' && transport !== 'tcp-tls-forward') {
        throw new Error('unsupported transport: ' + transport);
      }
      for (let i = 0; i < exitsValue.length; i++) {
        const entry = exitsValue[i] as Record<string, Object>;
        entry['transport'] = transport;
        // Preserve the operator-configured port: dosg serves both transports
        // on 7443, so a transport toggle must not stomp it back to 443.
        const currentPort = Number(entry['port']);
        if (!(Number.isFinite(currentPort) && currentPort > 0)) {
          entry['port'] = transport === 'tcp-tls-forward' ? CHENG_HY2_TUN_TCP_TLS_FORWARD_PORT : CHENG_HY2_TUN_UDP_QUIC_PORT;
        }
      }
      this.writeText(configPath, JSON.stringify(root));
      await this.loadConfigPath(configPath);
      if (this.statusText === 'connected') {
        await this.stopVpn();
        await this.startVpn();
      }
    } catch (err) {
      this.statusText = 'error';
      this.errorText = this.errorMessage(err);
    }
  }

  private async setProductMode(mode: string): Promise<void> {
    try {
      this.errorText = '';
      if (mode !== CHENG_HY2_TUN_ROUTE_FAST && mode !== CHENG_HY2_TUN_ROUTE_GLOBAL) {
        throw new Error('unsupported mode: ' + mode);
      }
      const configPath = await this.validateCurrentConfigPath();
      const configJson = await fileIo.readText(configPath);
      const root = JSON.parse(configJson) as Record<string, Object>;
      const client = this.requiredObject(root, 'client');
      client['mode'] = CHENG_HY2_TUN_MODE_TUN;
      const tun = this.requiredObject(client, 'tun');
      tun['route_mode'] = mode;
      this.writeText(configPath, JSON.stringify(root));
      await this.loadConfigPath(configPath);
      this.pacText = 'pac: inactive';
      if (this.statusText === 'connected') {
        await this.stopVpn();
        await this.startVpn();
      }
    } catch (err) {
      this.statusText = 'error';
      this.errorText = this.errorMessage(err);
    }
  }

  private async stopCurrentMode(): Promise<void> {
    await this.stopVpn();
  }

  private async stopVpn(): Promise<void> {
    try {
      this.errorText = '';
      this.statusText = 'stopping';
      this.stopControlAvailable = true;
      this.stopFinalizedLocal = false;
      hilog.info(DOMAIN, TAG, 'stop button accepted state=%{public}s', this.statusText);
      const stopWait = this.waitForStopDisconnected(20000);
      await this.publishStopRequest();
      hilog.info(DOMAIN, TAG, 'stop request event published');
      await vpnExtension.stopVpnExtensionAbility(chengHy2TunWant());
      hilog.info(DOMAIN, TAG, 'stopVpnExtensionAbility resolved');
      try {
        await stopWait;
      } catch (waitErr) {
        hilog.error(DOMAIN, TAG, 'stop wait failed error=%{public}s', this.errorMessage(waitErr));
      }
      this.nativeStopAvailable = false;
      this.stopControlAvailable = false;
      this.stopFinalizedLocal = true;
      this.statusText = 'disconnected';
      this.sessionText = 'session: 0';
      this.tunText = 'tun: -1';
      this.trafficText = 'rx: 0 / tx: 0';
      this.rxBytesValue = 0;
      this.txBytesValue = 0;
      this.pacText = 'pac: inactive';
      this.requestStatus();
    } catch (err) {
      this.statusText = 'error';
      this.errorText = this.errorMessage(err);
      hilog.error(DOMAIN, TAG, 'stop failed error=%{public}s', this.errorText);
    }
  }

  private publishStopRequest(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      commonEventManager.publish(CHENG_HY2_TUN_STOP_REQUEST_EVENT, {
        parameters: {
          reason: 'user'
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

  private waitForStopDisconnected(timeoutMs: number): Promise<void> {
    if (this.statusText === 'disconnected') {
      return Promise.resolve();
    }
    this.rejectPendingStopWait('superseded stop wait');
    return new Promise<void>((resolve, reject) => {
      this.stopCompletionResolve = resolve;
      this.stopCompletionReject = reject;
      this.stopCompletionTimer = setTimeout(() => {
        this.rejectPendingStopWait('stop timed out waiting for disconnected');
      }, timeoutMs);
    });
  }

  private rejectPendingStopWait(message: string): void {
    const reject = this.stopCompletionReject;
    this.clearPendingStopWait();
    if (reject !== undefined) {
      reject(new Error(message));
    }
  }

  private resolveStopWaitIfDisconnected(state: string): void {
    if (state !== 'disconnected') {
      return;
    }
    const resolve = this.stopCompletionResolve;
    this.clearPendingStopWait();
    if (resolve !== undefined) {
      resolve();
    }
  }

  private clearPendingStopWait(): void {
    if (this.stopCompletionTimer >= 0) {
      clearTimeout(this.stopCompletionTimer);
      this.stopCompletionTimer = -1;
    }
    this.stopCompletionResolve = undefined;
    this.stopCompletionReject = undefined;
  }

  private async testGoogle(): Promise<void> {
    // Tunnel lives in VpnExtension process. Refresh ONLY via CommonEvent STATUS_REQUEST —
    // UI-process hy2TunNative.status() has no session and must not clobber connected state.
    await this.refreshExtensionStatus(500);
    if (!this.isActiveTunnel()) {
      this.googleTestText = 'google: error not connected';
      return;
    }
    // [browser-parity] 与安卓同款: 跳系统浏览器做渲染验证。原因: 鸿蒙规定发起
    // VPN 的应用自身流量不走自己的 TUN(防回环), 应用内 @ohos.net.http 请求
    // 必然 2300028 超时(实测); 浏览器是第三方应用, 其流量必进 TUN。
    // 判定 = TUN 流量差分(20s 窗): rx>0 即浏览器流量过了隧道。
    const beforeRx = this.rxBytesValue;
    const beforeTx = this.txBytesValue;
    const startedMs = Date.now();
    this.googleTestText = 'google: launching browser';
    const want: Want = {
      action: 'ohos.want.action.viewData',
      uri: 'https://www.google.com/?cheng_hy2_tun=' + startedMs.toString(),
      type: 'text/html'
    };
    const launchRes: boolean = await (getContext(this) as common.UIAbilityContext).startAbility(want).then(() => true).catch(() => false);
    if (!launchRes) {
      this.googleTestText = 'google: error browser launch failed';
      return;
    }
    this.googleTestText = 'google: browser traffic watching rx=' + beforeRx.toString();
    for (let round = 0; round < 20; round++) {
      await this.sleep(1000);
      await this.refreshExtensionStatus(120);
      const rxDelta = this.rxBytesValue - beforeRx;
      const txDelta = this.txBytesValue - beforeTx;
      if (rxDelta > 2048) {
        this.googleTestText = 'google: ok browser rx=' + rxDelta.toString() + ' tx=' + txDelta.toString() + ' t=' + (Date.now() - startedMs).toString() + 'ms';
        return;
      }
      if (Date.now() - startedMs > 20000) {
        break;
      }
    }
    await this.refreshExtensionStatus(400);
    const rxFinal = this.rxBytesValue - beforeRx;
    const txFinal = this.txBytesValue - beforeTx;
    if (rxFinal <= 0 && txFinal <= 0) {
      this.googleTestText = 'google: error browser zero traffic (tunnel dead)';
      return;
    }
    this.googleTestText = 'google: error browser timeout rx=' + rxFinal.toString() + ' tx=' + txFinal.toString();
  }

  private async refreshExtensionStatus(waitMs: number): Promise<void> {
    this.requestStatus();
    await this.sleep(waitMs);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  private requestStatus(): void {
    // Only probe UI-process native when we are not already holding an extension session.
    // Connected tunnels live in VpnExtension; local status() would report sessionId=0.
    if (!this.isActiveTunnel() &&
      (this.statusText === 'disconnected' || this.statusText === 'error' || this.statusText === 'failed')) {
      this.refreshLocalStatus();
    }
    commonEventManager.publish(CHENG_HY2_TUN_STATUS_REQUEST_EVENT, {
      parameters: {
        configPath: this.configPath
      }
    }, (err: BusinessError) => {
      if (err) {
        this.errorText = JSON.stringify(err);
      }
    });
  }

  private refreshLocalStatus(): void {
    try {
      const status: ChengHy2TunNativeStatus = hy2TunNative.status();
      // Never let empty UI-process native overwrite an active VpnExtension session.
      if (this.isActiveTunnel() && !(status.connected && status.sessionId > 0 && status.tunFd >= 0)) {
        return;
      }
      this.applyNativeStatus(status, this.configPath);
    } catch (err) {
      this.statusText = 'error';
      this.errorText = this.errorMessage(err);
    }
  }

  private async bindStatusEvents(): Promise<void> {
    if (this.statusSubscriber !== undefined) {
      return;
    }
    this.statusSubscriber = await commonEventManager.createSubscriber({
      events: [
        CHENG_HY2_TUN_STATUS_EVENT
      ]
    });
    commonEventManager.subscribe(this.statusSubscriber, (err: BusinessError, data: commonEventManager.CommonEventData) => {
      if (err) {
        this.statusText = 'error';
        this.errorText = JSON.stringify(err);
        return;
      }
      this.applyStatusEvent(data);
    });
  }

  private asNumber(value: number | string | boolean | undefined | null, fallback: number): number {
    if (typeof value === 'number' && !Number.isNaN(value)) {
      return value;
    }
    if (typeof value === 'string' && value.length > 0) {
      const parsed = Number(value);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }
    if (typeof value === 'boolean') {
      return value ? 1 : 0;
    }
    return fallback;
  }

  private asBool(value: number | string | boolean | undefined | null, fallback: boolean): boolean {
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'number') {
      return value !== 0;
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'true' || normalized === '1') {
        return true;
      }
      if (normalized === 'false' || normalized === '0') {
        return false;
      }
    }
    return fallback;
  }

  private isActiveTunnel(): boolean {
    return this.statusText === 'connected' && this.sessionIdValue > 0 && this.tunFdValue >= 0;
  }

  private applyStatusEvent(data: commonEventManager.CommonEventData): void {
    const parameters = data.parameters as StatusParameters | undefined;
    if (parameters === undefined) {
      this.refreshLocalStatus();
      return;
    }
    let state = typeof parameters.state === 'string' ? parameters.state : this.statusText;
    if (this.stopFinalizedLocal && state !== 'disconnected') {
      return;
    }
    if (typeof parameters.configPath === 'string' && parameters.configPath.length > 0) {
      this.configPath = parameters.configPath;
    }
    const sessionId = this.asNumber(parameters.sessionId, 0);
    const tunFd = this.asNumber(parameters.tunFd, -1);
    const rxBytes = this.asNumber(parameters.rxBytes, 0);
    const txBytes = this.asNumber(parameters.txBytes, 0);
    const coreAvailable = this.asBool(parameters.coreAvailable, false);
    const connectedFlag = this.asBool(parameters.connected, state === 'connected');
    // CommonEvent may drop typed numbers; require a real session before claiming connected.
    if (state === 'connected' && !(connectedFlag && sessionId > 0 && tunFd >= 0)) {
      state = 'error';
      if (typeof parameters.lastError !== 'string' || parameters.lastError.length === 0) {
        this.errorText = 'vpn reported connected without active tun session';
      }
    }
    this.statusText = state;
    this.resolveStopWaitIfDisconnected(state);
    this.sessionIdValue = sessionId;
    this.tunFdValue = tunFd;
    const activeSession = this.isActiveTunnel();
    const runningState = state === 'starting' || state === 'connected' || state === 'stopping';
    this.nativeStopAvailable = state !== 'disconnected' && (runningState || sessionId > 0 || tunFd >= 0);
    if (state === 'disconnected') {
      this.stopControlAvailable = false;
    } else if (this.nativeStopAvailable) {
      this.stopControlAvailable = true;
    }
    // Always surface counters when we have a session; never hide traffic as 0 due to type loss.
    this.rxBytesValue = sessionId > 0 ? rxBytes : 0;
    this.txBytesValue = sessionId > 0 ? txBytes : 0;
    this.sessionText = 'session: ' + sessionId.toString();
    this.tunText = 'tun: ' + (activeSession ? tunFd : -1).toString();
    this.trafficText = 'rx: ' + this.rxBytesValue.toString() + ' / tx: ' + this.txBytesValue.toString();
    this.coreText = 'core: ' + (coreAvailable ? 'available' : 'missing');
    const memLive = this.asNumber(parameters.memLive, -1);
    if (memLive >= 0) {
      this.coreText = this.coreText + ' orc: live=' + memLive.toString();
    }
    if (typeof parameters.lastError === 'string' && parameters.lastError.length > 0) {
      this.errorText = parameters.lastError;
    } else if (state !== 'error' && state !== 'failed') {
      // keep previous error only for error states; clear on healthy connected
      if (activeSession) {
        this.errorText = '';
      }
    }
  }

  private applyNativeStatus(status: ChengHy2TunNativeStatus, configPath: string): void {
    if (this.stopFinalizedLocal && status.state !== 'disconnected') {
      return;
    }
    let state = status.state;
    this.sessionIdValue = status.sessionId;
    this.tunFdValue = status.tunFd;
    if (state === 'connected' && !(status.connected && status.sessionId > 0 && status.tunFd >= 0)) {
      state = 'error';
      if (status.lastError.length === 0) {
        this.errorText = 'vpn reported connected without active tun session';
      }
    }
    const activeSession = state === 'connected' && status.sessionId > 0 && status.tunFd >= 0;
    const runningState = state === 'starting' || state === 'connected' || state === 'stopping';
    this.nativeStopAvailable = state !== 'disconnected' &&
      (runningState || status.sessionId > 0 || status.tunFd >= 0);
    if (state === 'disconnected') {
      this.stopControlAvailable = false;
    } else if (this.nativeStopAvailable) {
      this.stopControlAvailable = true;
    }
    this.rxBytesValue = status.sessionId > 0 ? status.rxBytes : 0;
    this.txBytesValue = status.sessionId > 0 ? status.txBytes : 0;
    this.statusText = state;
    this.resolveStopWaitIfDisconnected(state);
    this.sessionText = 'session: ' + status.sessionId.toString();
    this.tunText = 'tun: ' + (activeSession ? status.tunFd : -1).toString();
    this.trafficText = 'rx: ' + this.rxBytesValue.toString() + ' / tx: ' + this.txBytesValue.toString();
    this.coreText = 'core: ' + (status.coreAvailable ? 'available' : 'missing') +
      ' orc: live=' + status.memLive.toString();
    if (status.lastError.length > 0) {
      this.errorText = status.lastError;
    } else if (activeSession) {
      this.errorText = '';
    }
    if (configPath.length > 0) {
      this.configPath = configPath;
    }
  }

  private configSummaryText(config: ChengHy2TunPlatformConfig): string {
    return 'tun: ' + config.tunAddress + '/' + config.tunPrefixLength.toString() +
      '  mtu: ' + config.mtu.toString() +
      '  mode: ' + config.routeMode +
      '  dns: ' + config.dnsAddress;
  }

  private requiredObject(node: Record<string, Object>, key: string): Record<string, Object> {
    const value = node[key];
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new Error('invalid object field: ' + key);
    }
    return value as Record<string, Object>;
  }

  private stageFailureText(err: Object): string {
    return 'error code=' + this.errorCode(err) +
      ' detail=' + this.redactSecrets(this.errorMessage(err)).substring(0, 120);
  }

  private errorCode(err: Object): string {
    const value = err as Record<string, Object>;
    const code = value['code'];
    if (typeof code === 'number') {
      return code.toString();
    }
    if (typeof code === 'string' && code.length > 0) {
      return code;
    }
    return err instanceof Error ? err.name : 'error';
  }

  private redactSecrets(text: string): string {
    return text.replace(/((auth|token|secret|key)[A-Za-z0-9_.-]*=)[^\s,}]+/ig, '$1<redacted>')
      .replace(/("(auth|token|secret|key_pk8_der|expected_auth_sha256)"\s*:\s*")[^"]*/ig, '$1<redacted>');
  }

  private errorMessage(err: Object): string {
    const message = err instanceof Error ? err.message : JSON.stringify(err);
    return this.redactSecrets(message);
  }

  private proxyToggleStops(): boolean {
    return this.isActiveTunnel() ||
      this.statusText === 'starting' ||
      this.statusText === 'connected' ||
      this.statusText === 'stopping' ||
      this.statusText === 'error' ||
      this.statusText === 'failed' ||
      this.nativeStopAvailable ||
      this.stopControlAvailable;
  }

  private statusDisplayLabel(): string {
    if (this.isActiveTunnel()) {
      return '已连接';
    }
    if (this.statusText === 'connected') {
      // Stale/incomplete session must not look healthy.
      return '异常';
    }
    if (this.statusText === 'starting') {
      return '连接中';
    }
    if (this.statusText === 'stopping') {
      return '正在关闭';
    }
    if (this.statusText === 'error' || this.statusText === 'failed') {
      return '错误';
    }
    return '已关闭';
  }

  private proxyToggleText(): string {
    if (this.isActiveTunnel()) {
      return '关闭代理';
    }
    if (this.statusText === 'starting') {
      return '停止启动';
    }
    if (this.statusText === 'stopping') {
      return '停止中';
    }
    if (this.statusText === 'error' || this.statusText === 'failed' || this.statusText === 'connected') {
      return '重置代理';
    }
    return '开启代理';
  }

  private guiRuntimeText(id: string): string {
    if (id === 'proxy_toggle') {
      return this.proxyToggleText();
    }
    return this.guiText(id, id);
  }

  private statusColor(): string {
    if (this.isActiveTunnel()) {
      return this.guiTheme.success;
    }
    if (this.statusText === 'connected' || this.statusText === 'error' || this.statusText === 'failed') {
      return this.guiTheme.danger;
    }
    if (this.statusText === 'starting' || this.statusText === 'stopping') {
      return this.guiTheme.warning;
    }
    if (this.statusText === 'error') {
      return this.guiTheme.danger;
    }
    return this.guiTheme.mutedDark;
  }

  private guiButtonSelected(id: string): boolean {
    if (id === 'mode_global') {
      return this.productMode === CHENG_HY2_TUN_ROUTE_GLOBAL;
    }
    if (id === 'mode_fast') {
      return this.productMode === CHENG_HY2_TUN_ROUTE_FAST;
    }
    if (id === 'transport_udp_quic') {
      return this.transportText.indexOf('udp-quic') >= 0;
    }
    if (id === 'transport_tcp_forward') {
      return this.transportText.indexOf('tcp-tls-forward') >= 0;
    }
    return false;
  }

  private guiButtonBackground(id: string): string {
    if (!this.guiRuntimeEnabled(id)) {
      return this.guiTheme.disabled;
    }
    if (id === 'stop' || (id === 'proxy_toggle' && this.proxyToggleStops())) {
      return this.guiTheme.dangerSoft;
    }
    if (id === 'start' || id === 'proxy_toggle' || id === 'test_google' || id === 'status_refresh' || this.guiButtonSelected(id)) {
      return this.guiTheme.primary;
    }
    return this.guiTheme.surface;
  }

  private guiButtonFontColor(id: string): string {
    if (!this.guiRuntimeEnabled(id)) {
      return this.guiTheme.disabledText;
    }
    if (id === 'stop' || (id === 'proxy_toggle' && this.proxyToggleStops())) {
      return this.guiTheme.danger;
    }
    if (id === 'start' || id === 'proxy_toggle' || id === 'test_google' || id === 'status_refresh' || this.guiButtonSelected(id)) {
      return this.guiTheme.inverseText;
    }
    return this.guiTheme.text;
  }

  private dispatchGuiButton(id: string): void {
    if (id === 'proxy_toggle') {
      if (this.proxyToggleStops()) {
        this.stopCurrentMode();
      } else {
        this.startCurrentMode();
      }
      return;
    }
    if (id === 'mode_global') {
      this.setProductMode(CHENG_HY2_TUN_ROUTE_GLOBAL);
      return;
    }
    if (id === 'mode_fast') {
      this.setProductMode(CHENG_HY2_TUN_ROUTE_FAST);
      return;
    }
    if (id === 'transport_udp_quic') {
      this.setTransport('udp-quic');
      return;
    }
    if (id === 'transport_tcp_forward') {
      this.setTransport('tcp-tls-forward');
      return;
    }
    if (id === 'start') {
      this.startCurrentMode();
      return;
    }
    if (id === 'stop') {
      this.stopCurrentMode();
      return;
    }
    if (id === 'test_google') {
      this.testGoogle();
      return;
    }
    if (id === 'status_refresh') {
      this.requestStatus();
    }
  }

  build() {
    Column({ space: 14 }) {
      Row() {
        Text(this.guiTitle)
          .fontSize(26)
          .fontWeight(FontWeight.Bold)
          .fontColor(this.guiTheme.text)
        Blank()
      }
      .width('100%')

      ForEach(this.guiButtonRows, (row: string[]) => {
        Row({ space: 12 }) {
          ForEach(row, (id: string) => {
            Button(this.guiRuntimeText(id))
              .layoutWeight(1)
              .height(this.guiButtonHeight(id))
              .enabled(this.guiRuntimeEnabled(id))
              .fontColor(this.guiButtonFontColor(id))
              .fontWeight(FontWeight.Bold)
              .backgroundColor(this.guiButtonBackground(id))
              .borderRadius(12)
              .onClick(() => {
                this.dispatchGuiButton(id);
              })
          }, (id: string) => id)
        }
        .width('100%')
      }, (row: string[], index: number) => row.join('|') + ':' + index.toString())

      Text(this.googleTestText)
        .fontSize(13)
        .fontColor(this.guiTheme.muted)
        .width('100%')

      Column({ space: 10 }) {
        Row({ space: 10 }) {
          Text(this.statusDisplayLabel())
            .fontSize(16)
            .fontWeight(FontWeight.Bold)
            .fontColor(this.guiTheme.inverseText)
            .padding({ left: 12, right: 12, top: 6, bottom: 6 })
            .backgroundColor(this.statusColor())
            .borderRadius(9)
          Text(this.coreText)
            .fontSize(14)
            .fontColor(this.guiTheme.mutedDark)
          Blank()
        }
        .width('100%')

        Column({ space: 6 }) {
          Text(this.trafficText)
            .fontSize(13)
            .fontColor(this.guiTheme.muted)
        }
        .alignItems(HorizontalAlign.Start)
        .width('100%')
      }
      .width('100%')
      .padding(16)
      .backgroundColor(this.guiTheme.surface)
      .borderRadius(14)
      .border({ width: 1, color: this.guiTheme.border })

      if (this.errorText.length > 0) {
        Text(this.errorText)
          .fontSize(14)
          .fontColor(this.guiTheme.danger)
          .width('100%')
      }
    }
    .width('100%')
    .height('100%')
    .padding(20)
    .backgroundColor(this.guiTheme.background)
  }
}
