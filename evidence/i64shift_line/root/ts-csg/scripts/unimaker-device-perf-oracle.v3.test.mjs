// unimaker-device-perf-oracle.v3.test.mjs
//
// 离线单测: 合成 "adb logcat -v epoch" 格式的 logcat 夹具, 直接喂给 v3 新增的纯解析
// 函数(publishTrace / openToFirstMediaFrame / playbackSmoothness), 断言解析正确。
// 不碰 adb / 真机 —— import 这个模块本身不会跑 main() (见 oracle 文件底部的
// isMainModule 守卫), 只加载纯函数。
//
// 用法: node scripts/unimaker-device-perf-oracle.v3.test.mjs

import assert from "node:assert/strict";
import {
  parseLines,
  collectPublishTrace,
  collectOpenToFirstMediaFrame,
  collectPlaybackSmoothness,
  pickCardOpenFrameSample,
} from "./unimaker-device-perf-oracle.mjs";

// 构造一行 "logcat -v epoch" 格式的原始文本, 与 oracle 里 RE_EPOCH_LINE 严格匹配:
//   "         1783239714.320  8811 16322 I cheng-mobile-shell: <message>"
function line(ts, msg) {
  return `         ${ts.toFixed(3)}  8811 16322 I cheng-mobile-shell: ${msg}`;
}

function parse(lines) {
  return parseLines(lines.join("\n") + "\n");
}

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  process.stdout.write(`  ok - ${name}\n`);
}

process.stdout.write("[oracle-v3-test] 夹具 1/9: happy path (发布+poster 先于 video+干净播放)\n");
{
  const lines = parse([
    line(1000.0, "tap_trace t0 pointer=0 app_milli=540,1200"),
    line(1000.05, "publish_trace t_pub0 kind=video"), // t_pub0
    line(1000.25, "prepare_media_surface video_poster_only_ok asset=abc poster=def texture=8 decoded=360x640 hashes=1,2,3,4 playback=0"),
    line(1000.35, "publish_trace t_pub1 kind=video"), // t_pub1, Δ=300ms
    line(1000.65, "publish_trace t_pub2 content_id=cafe01"), // t_pub2, Δ from t1=300ms, total=600ms
    line(1001.2, "prepare_media_surface ok asset=abc texture=13 decoded=1304x2320 rotation=0 hashes=1,2,3,4 presentation_us=0 receipt=1,2,3,4,5,6"),
    line(1001.2, "media_playback_frame asset=abc frame=1 update=1 presentation_us=0 playback=1"),
    line(1001.23, "media_playback_frame asset=abc frame=2 update=1 presentation_us=30000 playback=1"),
    line(1001.26, "media_playback_frame asset=abc frame=3 update=1 presentation_us=60000 playback=1"),
    line(1001.29, "media_playback_frame asset=abc frame=4 update=1 presentation_us=90000 playback=1"),
    line(1001.3, "media_playback_eos asset=abc frames=4 presentation_us=90000"),
  ]);

  const pubC = collectPublishTrace(lines);
  const pub = pubC.samples;
  check("publish: 1 个样本, 三段都 available", () => {
    assert.equal(pub.length, 1);
    assert.equal(pub[0].tPub1Available, true);
    assert.equal(pub[0].tPub2Available, true);
  });
  check("publish: t_pub0→t_pub1=300ms, t_pub1→t_pub2=300ms, t_pub0→t_pub2=600ms", () => {
    assert.equal(pub[0].tPub0ToTPub1Ms, 300);
    assert.equal(pub[0].tPub1ToTPub2Ms, 300);
    assert.equal(pub[0].tPub0ToTPub2Ms, 600);
    assert.equal(pub[0].contentId, "cafe01");
    assert.equal(pubC.orphanedT2Count, 0);
  });

  const openFrame = collectOpenToFirstMediaFrame(lines);
  check("openToFirstMediaFrame: poster 先于 video 出现, 判定 kind=poster ms=250", () => {
    assert.equal(openFrame.length, 1);
    assert.equal(openFrame[0].available, true);
    assert.equal(openFrame[0].kind, "poster");
    assert.equal(openFrame[0].ms, 250);
  });

  const playback = collectPlaybackSmoothness(lines);
  check("playbackSmoothness: 1 个 asset session, 4 帧 3 间隔全部 30ms, stall=0, 播完=true", () => {
    assert.equal(playback.length, 1);
    assert.equal(playback[0].assetCid, "abc");
    assert.equal(playback[0].frameCount, 4);
    assert.equal(playback[0].intervalCount, 3);
    assert.equal(playback[0].p50Ms, 30);
    assert.equal(playback[0].p95Ms, 30);
    assert.equal(playback[0].maxMs, 30);
    assert.equal(playback[0].stallCount, 0);
    assert.equal(playback[0].playbackComplete, true);
    assert.equal(playback[0].durationMs, 90);
  });
}

process.stdout.write("[oracle-v3-test] 夹具 2/9: 背靠背 tap (两次快速 tap 各自正确关联, 不串扰)\n");
{
  const lines = parse([
    line(2000.0, "tap_trace t0 pointer=0 app_milli=100,200"),
    line(2000.1, "prepare_media_surface ok asset=tapA texture=1 decoded=100x100 rotation=0 hashes=1,2,3,4 presentation_us=0 receipt=1,2,3,4,5,6"),
    line(2000.2, "tap_trace t0 pointer=1 app_milli=300,400"), // 200ms 后, 紧跟着上一次窗口结束点
    line(2000.45, "prepare_media_surface ok asset=tapB texture=2 decoded=100x100 rotation=0 hashes=1,2,3,4 presentation_us=0 receipt=1,2,3,4,5,6"),
  ]);

  const openFrame = collectOpenToFirstMediaFrame(lines);
  check("背靠背 tap: 各自 1 个样本, 各自关联到自己的媒体就绪标记(不串到对方窗口)", () => {
    assert.equal(openFrame.length, 2);
    assert.equal(openFrame[0].kind, "video");
    assert.equal(openFrame[0].ms, 100);
    assert.equal(openFrame[1].kind, "video");
    assert.equal(openFrame[1].ms, 250);
  });
}

process.stdout.write("[oracle-v3-test] 夹具 3/9: 标记缺失 (发布 t_pub1/t_pub2 缺失; tap 未命中媒体)\n");
{
  const lines = parse([
    line(3000.0, "publish_trace t_pub0 kind=video"), // t_pub0 only, 没有后续 t_pub1/t_pub2
    line(3000.0, "tap_trace t0 pointer=0 app_milli=50,60"), // tap 命中非视频元素, 无任何媒体就绪标记
  ]);

  const pub = collectPublishTrace(lines).samples;
  check("publish: t_pub0 有, t_pub1/t_pub2 诚实 unavailable, 不用 0 填充", () => {
    assert.equal(pub.length, 1);
    assert.equal(pub[0].tPub1Available, false);
    assert.equal(pub[0].tPub2Available, false);
    assert.equal(pub[0].tPub0ToTPub1Ms, null);
    assert.equal(pub[0].tPub0ToTPub2Ms, null);
  });

  const openFrame = collectOpenToFirstMediaFrame(lines);
  check("openToFirstMediaFrame: tap 存在但无媒体就绪标记, kind=null available=false, 不猜测", () => {
    assert.equal(openFrame.length, 1);
    assert.equal(openFrame[0].available, false);
    assert.equal(openFrame[0].kind, null);
    assert.equal(openFrame[0].ms, null);
  });
}

process.stdout.write("[oracle-v3-test] 夹具 4/9: 播放中断 (有 stall, 无 eos, 不伪造播完)\n");
{
  const lines = parse([
    line(4000.0, "media_playback_frame asset=brokenAsset frame=1 update=1 presentation_us=0 playback=1"),
    line(4000.03, "media_playback_frame asset=brokenAsset frame=2 update=1 presentation_us=30000 playback=1"),
    line(4000.25, "media_playback_frame asset=brokenAsset frame=3 update=1 presentation_us=250000 playback=1"), // Δ=220ms > 200ms 阈值
    line(4000.28, "media_playback_frame asset=brokenAsset frame=4 update=1 presentation_us=280000 playback=1"),
    // 中途 force-stop / 崩溃截断: 无 media_playback_eos
  ]);

  const playback = collectPlaybackSmoothness(lines);
  check("playbackSmoothness: 1 次 220ms stall, playbackComplete=false, durationMs 退回最后一帧 presentation_us", () => {
    assert.equal(playback.length, 1);
    assert.equal(playback[0].frameCount, 4);
    assert.equal(playback[0].intervalCount, 3);
    assert.equal(playback[0].stallCount, 1);
    assert.equal(playback[0].maxMs, 220);
    assert.equal(playback[0].playbackComplete, false);
    assert.equal(playback[0].durationMs, 280);
  });
}

process.stdout.write("[oracle-v3-test] 夹具 5/9: 重播同一 assetCid(EOS 分隔) - 不拼成一条假 stall, 各会话独立统计\n");
{
  const lines = parse([
    line(7000.0, "media_playback_frame asset=replayAsset frame=1 update=1 presentation_us=0 playback=1"),
    line(7000.03, "media_playback_frame asset=replayAsset frame=2 update=1 presentation_us=30000 playback=1"),
    line(7000.06, "media_playback_frame asset=replayAsset frame=3 update=1 presentation_us=60000 playback=1"),
    line(7000.09, "media_playback_eos asset=replayAsset frames=3 presentation_us=60000"), // 第一次播完
    line(7015.0, "media_playback_frame asset=replayAsset frame=1 update=1 presentation_us=0 playback=1"), // 15s 静默后用户重播, 帧号从 1 重新开始
    line(7015.03, "media_playback_frame asset=replayAsset frame=2 update=1 presentation_us=30000 playback=1"),
    line(7015.06, "media_playback_frame asset=replayAsset frame=3 update=1 presentation_us=60000 playback=1"),
    line(7015.09, "media_playback_eos asset=replayAsset frames=3 presentation_us=60000"),
  ]);
  const playback = collectPlaybackSmoothness(lines);
  check("重播切分(EOS 边界): 2 个独立会话, 各自 stallCount=0(15s 静默不计入任何会话的帧间隔)", () => {
    assert.equal(playback.length, 2);
    assert.equal(playback[0].sessionIndex, 0);
    assert.equal(playback[0].frameCount, 3);
    assert.equal(playback[0].stallCount, 0);
    assert.equal(playback[0].playbackComplete, true);
    assert.equal(playback[1].sessionIndex, 1);
    assert.equal(playback[1].frameCount, 3);
    assert.equal(playback[1].stallCount, 0);
    assert.equal(playback[1].playbackComplete, true);
  });
}

process.stdout.write("[oracle-v3-test] 夹具 6/9: 中断后重进(无 EOS, 帧号回绕) - 新帧号<=上一帧号即视为新会话\n");
{
  const lines = parse([
    line(8000.0, "media_playback_frame asset=crashAsset frame=1 update=1 presentation_us=0 playback=1"),
    line(8000.03, "media_playback_frame asset=crashAsset frame=2 update=1 presentation_us=30000 playback=1"),
    // 中途 kill/崩溃, 无 eos
    line(8000.5, "media_playback_frame asset=crashAsset frame=1 update=1 presentation_us=0 playback=1"), // 用户立即重进, 帧号回绕(1<=2)
    line(8000.53, "media_playback_frame asset=crashAsset frame=2 update=1 presentation_us=30000 playback=1"),
    line(8000.56, "media_playback_frame asset=crashAsset frame=3 update=1 presentation_us=60000 playback=1"),
    line(8000.59, "media_playback_eos asset=crashAsset frames=3 presentation_us=60000"),
  ]);
  const playback = collectPlaybackSmoothness(lines);
  check("帧号回绕切会话: 第一段(2 帧, 无 eos, playbackComplete=false)与第二段(3 帧, 有 eos, true)独立, 470ms 静默不计入任何会话间隔", () => {
    assert.equal(playback.length, 2);
    assert.equal(playback[0].frameCount, 2);
    assert.equal(playback[0].intervalCount, 1);
    assert.equal(playback[0].playbackComplete, false);
    assert.equal(playback[1].frameCount, 3);
    assert.equal(playback[1].intervalCount, 2);
    assert.equal(playback[1].playbackComplete, true);
  });
}

process.stdout.write("[oracle-v3-test] 夹具 7/9: 窗口封顶(capMs) - 下一个 tap 很久之后才发生, 不再无界延伸到下一个 t0\n");
{
  const lines = parse([
    line(6000.0, "tap_trace t0 pointer=0 app_milli=200000,200000"),
    // 9s 后, 超过默认 capMs=8000ms, 与本次 tap 无关(如首页 feed 自渲染触发的缩略图预览)
    line(6009.0, "prepare_media_surface video_poster_only_ok asset=unrelated poster=p texture=1 decoded=1x1 hashes=1,2,3,4 playback=0"),
    line(6010.0, "tap_trace t0 pointer=1 app_milli=800000,800000"), // 10s 后才是下一次真实 tap
  ]);
  const openFrame = collectOpenToFirstMediaFrame(lines); // 默认 capMs=8000
  check("窗口封顶: 远处(9s 后)的标记既不在 tap0 窗口(封顶 8s)内也不在 tap1 窗口内(在其之前), 两次 tap 都诚实 unavailable, 不误配给 tap0", () => {
    assert.equal(openFrame.length, 2);
    assert.equal(openFrame[0].available, false);
    assert.equal(openFrame[0].kind, null);
    assert.equal(openFrame[0].ambiguous, false);
    assert.equal(openFrame[1].available, false);
  });
}

process.stdout.write("[oracle-v3-test] 夹具 8/9: 跨窗口冲突(ambiguous) - 媒体就绪日志时间戳恰好等于下一个 tap 的 t0, 只能计入较早窗口, 后者诚实标 ambiguous 不误配\n");
{
  const lines = parse([
    line(5000.0, "tap_trace t0 pointer=0 app_milli=100000,100000"),
    line(5000.1, "prepare_media_surface ok asset=onlyOne texture=1 decoded=100x100 rotation=0 hashes=1,2,3,4 presentation_us=0 receipt=1,2,3,4,5,6"),
    line(5000.1, "tap_trace t0 pointer=1 app_milli=900000,900000"), // 与上面媒体就绪日志同一时间戳, 恰好是 tap0 窗口右边界 = tap1 窗口起点
  ]);
  const openFrame = collectOpenToFirstMediaFrame(lines);
  check("ambiguous: tap0 正常认领该媒体日志, tap1 的候选已被认领, 诚实标 ambiguous 不误配", () => {
    assert.equal(openFrame.length, 2);
    assert.equal(openFrame[0].kind, "video");
    assert.equal(openFrame[0].available, true);
    assert.equal(openFrame[0].ambiguous, false);
    assert.equal(openFrame[1].kind, null);
    assert.equal(openFrame[1].available, false);
    assert.equal(openFrame[1].ambiguous, true);
  });
}

process.stdout.write("[oracle-v3-test] 夹具 9/9: E2E 坐标匹配 - 一轮里发布 tap 与卡片 tap 各产生一条 t0, 按坐标最近邻挑出卡片 tap 那条(不取数组第 0 项)\n");
{
  // 发布 tap 在物理像素 (610,2500), 卡片 tap 在 (540,1200); app_milli = px*1000 (present==source 场景)。
  const lines = parse([
    line(9000.0, "tap_trace t0 pointer=0 app_milli=610000,2500000"), // 发布 tap, 数组第 0 项
    line(9000.5, "tap_trace t0 pointer=1 app_milli=540000,1200000"), // 卡片 tap, 数组第 1 项(最后一个)
    line(9000.6, "prepare_media_surface ok asset=cardAsset texture=1 decoded=100x100 rotation=0 hashes=1,2,3,4 presentation_us=0 receipt=1,2,3,4,5,6"),
  ]);
  const samples = collectOpenToFirstMediaFrame(lines);
  const picked = pickCardOpenFrameSample(samples, 540, 1200);
  check("坐标匹配: 挑中卡片 tap(数组第 1 项), 不是数组第 0 项(发布 tap)", () => {
    assert.equal(samples.length, 2);
    assert.equal(picked.pointer, 1);
    assert.equal(picked.kind, "video");
  });

  const emptyPicked = pickCardOpenFrameSample([], 540, 1200);
  check("坐标匹配 fallback: 无样本时返回 null(不是伪造结果)", () => {
    assert.equal(emptyPicked, null);
  });
}

process.stdout.write("[oracle-v3-test] 夹具 10: 双击发布(门禁拒绝的孤立 t0 不许漏接真实 t_pub2)\n");
{
  const lines = parse([
    line(9000.0, "publish_trace t_pub0 kind=video"),
    line(9000.02, "publish_trace t_pub1 kind=video"),
    line(9001.5, "publish_trace t_pub0 kind=video"), // 门禁拒绝的双击, 永远没有 t1/t2
    line(9002.9, "publish_trace t_pub2 content_id=deadbeef"),
  ]);
  const pubC = collectPublishTrace(lines);
  check("double-tap: 样本0 认领到 t2(不被第二条 t0 截断), contentId 正确", () => {
    assert.equal(pubC.samples.length, 2);
    assert.equal(pubC.samples[0].tPub2Available, true);
    assert.equal(pubC.samples[0].contentId, "deadbeef");
    assert.equal(pubC.samples[0].tPub0ToTPub2Ms, 2900);
  });
  check("double-tap: 样本1(门禁拒绝) 诚实 unavailable, 无孤儿无警告", () => {
    assert.equal(pubC.samples[1].tPub1Available, false);
    assert.equal(pubC.samples[1].tPub2Available, false);
    assert.equal(pubC.orphanedT2Count, 0);
    assert.equal(pubC.warnings.length, 0);
  });
}

process.stdout.write("[oracle-v3-test] 夹具 11: 孤儿 t_pub2(无任何 t0) 显式告警不静默消失\n");
{
  const lines = parse([
    line(9100.0, "publish_trace t_pub2 content_id=deadbeef"),
  ]);
  const pubC = collectPublishTrace(lines);
  check("orphan-t2: 零样本 + orphanedT2Count=1 + warning", () => {
    assert.equal(pubC.samples.length, 0);
    assert.equal(pubC.orphanedT2Count, 1);
    assert.equal(pubC.warnings.length, 1);
    assert.ok(pubC.warnings[0].includes("orphaned t_pub2"));
  });
}

process.stdout.write(`\nunimaker-device-perf-oracle v3 offline test ok (${passed} 断言组全过)\n`);
