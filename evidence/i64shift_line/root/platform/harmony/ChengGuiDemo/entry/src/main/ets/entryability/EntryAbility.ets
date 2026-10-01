import { AbilityConstant, UIAbility, Want } from '@kit.AbilityKit';
import { window } from '@kit.ArkUI';
import { hilog } from '@kit.PerformanceAnalysisKit';

const DOMAIN = 0;
const TAG = 'ChengGuiDemo';

// #14 NAPI media control dispatch — Want-parameter media-action surface. This is the
// OHOS mirror of the Android host's Intent-extra convention (mobile_shell_codegen.cheng
// handleMediaActionIntent, same four keys: cheng.media_slot / cheng.media_action /
// cheng.media_actions / cheng.media_payload), so the same driver tooling shape works on
// both platforms (hdc: aa start ... --ps cheng.media_slot <slot> --ps cheng.media_action
// Seek --ps cheng.media_payload 4000). The ability layer only forwards; the actual
// guiHost.applyMediaAction call lives in pages/Index.ets (the page owns the guiHost
// wiring, mirroring the startMediaBlockCache placement convention), reached through an
// AppStorage watcher. seq makes repeated identical commands distinct so the @Watch
// fires every time. The JSON contract must stay in sync with interface
// ChengMediaActionRequest in pages/Index.ets.
interface ChengMediaActionRequest {
  seq: number;
  slot: string;
  actions: string[];
  payload: string;
}

let chengMediaActionSeq = 0;

function forwardChengMediaActionWant(want: Want): void {
  const params = want.parameters;
  if (params === undefined) {
    return;
  }
  const slot = params['cheng.media_slot'];
  if (typeof slot !== 'string') {
    return; // no media action in this Want — a normal launch
  }
  const action = params['cheng.media_action'];
  const actionsCsv = params['cheng.media_actions'];
  const payload = params['cheng.media_payload'];
  // Same precedence as the Android twin: a non-empty cheng.media_actions CSV list wins,
  // otherwise the single cheng.media_action.
  let actions: string[] = [];
  if (typeof actionsCsv === 'string' && actionsCsv.trim().length > 0) {
    actions = actionsCsv.split(',').map((value: string): string => value.trim());
  } else if (typeof action === 'string') {
    actions = [action.trim()];
  }
  if (actions.length === 0) {
    return;
  }
  chengMediaActionSeq += 1;
  const request: ChengMediaActionRequest = {
    seq: chengMediaActionSeq,
    slot: slot.trim(),
    actions: actions,
    payload: typeof payload === 'string' ? payload : '',
  };
  hilog.info(DOMAIN, TAG, 'media action want: slot=%{public}s actions=%{public}s', request.slot, actions.join(','));
  AppStorage.setOrCreate('chengMediaActionRequest', JSON.stringify(request));
}

export default class EntryAbility extends UIAbility {
  onCreate(want: Want): void {
    hilog.info(DOMAIN, TAG, 'EntryAbility onCreate');
    // Cold-start media Want: forwarded for parity with Android's onCreate-time
    // handleMediaActionIntent; the native dispatcher honestly drops it (logged) if the
    // host has not begun yet — same shape as Android's runtimeHandle==0 early return.
    forwardChengMediaActionWant(want);
  }

  onNewWant(want: Want, launchParam: AbilityConstant.LaunchParam): void {
    hilog.info(DOMAIN, TAG, 'EntryAbility onNewWant');
    forwardChengMediaActionWant(want);
  }

  onWindowStageCreate(windowStage: window.WindowStage): void {
    windowStage.loadContent('pages/Index', (err) => {
      if (err && err.code) {
        hilog.error(DOMAIN, TAG, 'loadContent failed: %{public}s', JSON.stringify(err));
      }
    });
  }
}
