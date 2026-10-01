import { UIAbility, Want } from '@kit.AbilityKit';
import { fileIo } from '@kit.CoreFileKit';
import { window } from '@kit.ArkUI';
import { http } from '@kit.NetworkKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { CHENG_HY2_TUN_DEFAULT_DNS } from '../common/ChengHy2TunContract';
import hy2TunNative, { ChengHy2TunNativeStatus } from '../native/ChengHy2TunNative';

const DOMAIN = 0x5456;
const TAG = 'ChengHy2TunEntryAbility';
const GOOGLE_204_URL = 'https://www.google.com/generate_204';

export default class EntryAbility extends UIAbility {
  onCreate(want: Want): void {
    this.configureTransportIfRequested(want);
    this.runGoogleDiagnosticIfRequested(want);
  }

  onNewWant(want: Want): void {
    this.configureTransportIfRequested(want);
    this.runGoogleDiagnosticIfRequested(want);
  }

  onWindowStageCreate(windowStage: window.WindowStage): void {
    windowStage.loadContent('pages/Index', (err) => {
      if (err && err.code) {
        console.error('loadContent failed: ' + JSON.stringify(err));
      }
    });
  }

  private runGoogleDiagnosticIfRequested(want: Want): void {
    const parameters = want.parameters as Record<string, Object> | undefined;
    const raw = parameters === undefined ? undefined : parameters['chengHy2TunTestGoogle'];
    hilog.info(DOMAIN, TAG, 'google_diag_want raw=%{public}s', raw === undefined ? 'undefined' : JSON.stringify(raw));
    if (raw !== true && raw !== 'true' && raw !== 1 && raw !== '1') {
      return;
    }
    this.testGoogleFromAppProcess().catch((err: Error) => {
      hilog.error(DOMAIN, TAG, 'google_diag_unhandled error=%{public}s', err.message);
    });
  }

  private configureTransportIfRequested(want: Want): void {
    const parameters = want.parameters as Record<string, Object> | undefined;
    const raw = parameters === undefined ? undefined : parameters['chengHy2TunGateTransport'];
    if (raw === undefined) {
      return;
    }
    const transport = String(raw);
    this.configureTransport(transport).catch((err: Error) => {
      hilog.error(DOMAIN, TAG, 'gate_transport_error transport=%{public}s error=%{public}s', transport, err.message);
    });
  }

  private async configureTransport(transport: string): Promise<void> {
    if (transport !== 'udp-quic' && transport !== 'tcp-tls-forward') {
      throw new Error('unsupported transport: ' + transport);
    }
    const configPath = this.context.filesDir + '/cheng-hy2-tun/config.json';
    if (!fileIo.accessSync(configPath)) {
      throw new Error('config missing: ' + configPath);
    }
    const configJson = await fileIo.readText(configPath);
    const root = JSON.parse(configJson) as Record<string, Object>;
    const client = root['client'] as Record<string, Object>;
    if (typeof client !== 'object' || client === null || Array.isArray(client)) {
      throw new Error('client object missing');
    }
    client['mode'] = 'tun';
    const exitsValue = root['exits'];
    if (!Array.isArray(exitsValue) || exitsValue.length === 0) {
      throw new Error('exits[] missing');
    }
    for (let i = 0; i < exitsValue.length; i++) {
      const entry = exitsValue[i] as Record<string, Object>;
      if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
        throw new Error('exits[] entry is not object');
      }
      entry['transport'] = transport;
    }
    this.writeText(configPath, JSON.stringify(root));
    hilog.info(DOMAIN, TAG, 'gate_transport_configured transport=%{public}s', transport);
  }

  private writeText(path: string, value: string): void {
    const file = fileIo.openSync(path, fileIo.OpenMode.CREATE | fileIo.OpenMode.TRUNC | fileIo.OpenMode.WRITE_ONLY);
    try {
      fileIo.writeSync(file.fd, value);
    } finally {
      fileIo.closeSync(file);
    }
  }

  private async testGoogleFromAppProcess(): Promise<void> {
    const before = this.safeNativeStatus();
    hilog.info(DOMAIN, TAG,
      'google_diag_start state=%{public}s session=%{public}d tunFd=%{public}d rx=%{public}d tx=%{public}d',
      before.state, before.sessionId, before.tunFd, before.rxBytes, before.txBytes);
    const request = http.createHttp();
    try {
      const response = await request.request(GOOGLE_204_URL, {
        usingCache: false,
        connectTimeout: 8000,
        readTimeout: 8000,
        dnsServers: [CHENG_HY2_TUN_DEFAULT_DNS]
      });
      const after = this.safeNativeStatus();
      hilog.info(DOMAIN, TAG,
        'google_diag_result ok=1 code=%{public}d state=%{public}s rxDelta=%{public}d txDelta=%{public}d rx=%{public}d tx=%{public}d',
        Number(response.responseCode), after.state, after.rxBytes - before.rxBytes, after.txBytes - before.txBytes,
        after.rxBytes, after.txBytes);
    } catch (err) {
      const after = this.safeNativeStatus();
      hilog.error(DOMAIN, TAG,
        'google_diag_result ok=0 error=%{public}s state=%{public}s rxDelta=%{public}d txDelta=%{public}d rx=%{public}d tx=%{public}d',
        this.errorMessage(err), after.state, after.rxBytes - before.rxBytes, after.txBytes - before.txBytes,
        after.rxBytes, after.txBytes);
    } finally {
      request.destroy();
    }
  }

  private safeNativeStatus(): ChengHy2TunNativeStatus {
    try {
      return hy2TunNative.status();
    } catch (err) {
      return {
        state: 'status_error',
        connected: false,
        sessionId: 0,
        tunFd: -1,
        coreAvailable: false,
        rxBytes: 0,
        txBytes: 0,
        memAlloc: 0,
        memFree: 0,
        memLive: 0,
        text: '',
        lastError: this.errorMessage(err)
      };
    }
  }

  private errorMessage(err: Object): string {
    return err instanceof Error ? err.message : JSON.stringify(err);
  }
}
