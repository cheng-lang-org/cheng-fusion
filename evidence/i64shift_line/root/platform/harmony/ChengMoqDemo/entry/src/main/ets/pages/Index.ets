import { hilog } from '@kit.PerformanceAnalysisKit';
import moqNative from '../native/ChengMoqNative';

const DOMAIN = 0;
const TAG = 'ChengMoqDemo';

@Entry
@Component
struct Index {
  @State resultText: string = 'starting 麦田 publisher ...';
  @State statusColor: string = '#334155';

  aboutToAppear(): void {
    this.runMoq();
  }

  private runMoq(): void {
    this.resultText = 'publishing 麦田 over MoQ-over-QUIC (0.0.0.0:38000) ...';
    this.statusColor = '#D97706';
    try {
      const result: number = moqNative.publishServe(getContext(this).resourceManager);
      if (result >= 0) {
        this.resultText = '秒发: publisher serving 麦田 on 0.0.0.0:38000';
        this.statusColor = '#16A34A';
        hilog.info(DOMAIN, TAG, '秒发 publisher started rc=%{public}d', result);
      } else {
        this.resultText = 'FAIL code=' + result.toString();
        this.statusColor = '#DC2626';
        hilog.error(DOMAIN, TAG, '秒发 publisher start FAIL rc=%{public}d', result);
      }
    } catch (err) {
      const message: string = err instanceof Error ? err.message : JSON.stringify(err);
      this.resultText = 'native error: ' + message;
      this.statusColor = '#DC2626';
      hilog.error(DOMAIN, TAG, '秒发秒开 result=native_error error=%{public}s', message);
    }
  }

  build() {
    Column({ space: 18 }) {
      Text('Cheng MoQ-over-QUIC')
        .fontSize(24)
        .fontWeight(FontWeight.Bold)
        .fontColor('#0F172A')
        .width('100%')

      Text('pure-Cheng native transport · 秒发秒开')
        .fontSize(14)
        .fontColor('#475569')
        .width('100%')

      Text(this.resultText)
        .fontSize(16)
        .fontWeight(FontWeight.Bold)
        .fontColor(Color.White)
        .padding({ left: 14, right: 14, top: 10, bottom: 10 })
        .backgroundColor(this.statusColor)
        .borderRadius(8)
        .width('100%')

      Button('RUN MOQ')
        .width('100%')
        .onClick(() => {
          this.runMoq();
        })
    }
    .width('100%')
    .height('100%')
    .padding(24)
    .backgroundColor('#FFFFFF')
  }
}
