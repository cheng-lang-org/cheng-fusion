import { UIAbility, Want } from '@kit.AbilityKit';
import { window } from '@kit.ArkUI';
import { hilog } from '@kit.PerformanceAnalysisKit';
import moqNative from '../native/ChengMoqNative';

const DOMAIN = 0;
const TAG = 'ChengMoqDemo';

export default class EntryAbility extends UIAbility {
  onWindowStageCreate(windowStage: window.WindowStage): void {
    // The Index page's aboutToAppear starts the publisher (it has a reliable
    // resourceManager via getContext) — no native call here.
    windowStage.loadContent('pages/Index', (err) => {
      if (err && err.code) {
        hilog.error(DOMAIN, TAG, 'loadContent failed: %{public}s', JSON.stringify(err));
      }
    });
  }
}
