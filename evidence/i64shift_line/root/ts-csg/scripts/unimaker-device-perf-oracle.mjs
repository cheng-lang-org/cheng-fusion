#!/usr/bin/env node
// unimaker-device-perf-oracle.mjs
//
// Android 真机运行时性能基线采集器 (schema unimaker.device_perf_oracle.v3)。
//
// 采集 src/core/tooling/mobile_shell_codegen.cheng 生成的 host C 埋点(tag=cheng-mobile-shell):
//   - 冷启动:  "native_create app_init_begin"  ->  "native_create init_done ..."
//   - 首帧:    首个帧 present 日志
//   - 帧节奏:  连续 present 日志的时间戳间隔
//   - 触摸:    "input_touch action=<n> dur_us=<微秒> ..."
//   - tap→首帧拆段(v2 新增): "tap_trace t0 ..." -> "tap_trace t1" -> "tap_trace t2"。
//     host 只为当前 pending tap 发射 t1/t2, 不复用有日志限额的通用帧标记。
//
// 实测(2026-07-05, GBJ0222B24021692 / org.cheng.unimaker.scene 当前 build):
//   * 当前 build 使用 compositor present 路径, 帧标记是 "present_compositor frame=N",
//     "present_gpu frame=N" 完全不发射 -> present_gpu 会如实标注为 unavailable。
//   * logcat ring buffer 会被海量 per-command 日志(cmd[N]/draw_icon)冲刷,
//     "logcat -d" 事后 dump 抓不到冷启动标记 -> 必须在 am start 之前就流式写文件。
//
// v1→v2: 新增 tapReactionTrace 字段(t0/t1/t2 拆段), 老字段(coldStart/firstFrame/
// frameCadence/touchLatency/openToFirstFrame/...)结构与含义不变, 消费方无需改动。
//
// v2→v3 (视频端到端验收仪表, 老字段结构与含义完全不变):
//   1) publishTrace: 发布链路 t_pub0/t_pub1/t_pub2 三段。
//      ★真实落地约定(v1-publish 已入 HEAD, mobile_shell_codegen.cheng 实测格式):
//        t_pub0: "publish_trace t_pub0 kind=<kind>"      (:17758 native 桥入口, __android_log_print)
//        t_pub1: "publish_trace t_pub1 kind=<category>"  (:2258  Kotlin, 本地 post JSON 物化完成)
//        t_pub2: "publish_trace t_pub2 content_id=<cid>" (:2285  Kotlin, enqueue ok 回 contentId)
//      三者 tag 都是 cheng-mobile-shell。历史订正: 本采集器初版自定义了 app_trace
//      step=975002-975004 约定, 与真实落地不符(全仓零发射), 验收车道钉死后已改为
//      解析上述真实标记(与鸿蒙采集器 unimaker-harmony-device-perf-oracle.mjs 同构)。
//      ★配对语义: t_pub0 在原生防重入门禁【之前】无条件发射, 发布进行中重复点击会产生
//      永远没有 t1/t2 的孤立 t0 —— 用认领式配对(t1 受 next-t0 截断防跨样本误配; t2 只受
//      capMs 窗约束不被 next-t0 截断, 真发布串行性由门禁保证), 未认领 t1/t2 显式
//      orphaned+warning 绝不静默消失。
//   2) openToFirstMediaFrame: 复用既有 tap_trace t0(真实 tap-up 派发), 在其窗口内找
//      第一条媒体就绪日志并按 poster/video 分类(格式已用 grep 逐条核对
//      src/core/tooling/mobile_shell_codegen.cheng:14343-14952):
//        poster: "prepare_media_surface video_poster_ok" 或 "..._only_ok"
//        video:  "prepare_media_surface ok asset=" 或 "local_video_ok asset=" 或
//                "ES ok decoded="
//   3) playbackSmoothness: 用逐解码帧日志 "media_playback_frame asset=... presentation_us=..."
//      (mobile_shell_codegen.cheng:13785/13925, 每解码帧必发) 按 assetCid 分组算相邻墙钟
//      间隔, 而不是通用 UI "present_compositor frame=N" —— 这是 v1-baseline-evidence.md
//      (2026-07-10 真机实测)已验证生效的方法论(183 条日志, p50 34ms/p95 49ms/max 91ms/
//      >200ms=0), 比 present_compositor 更准(不受其余 UI 重绘噪声干扰)。用
//      "media_playback_eos" 判定是否自然播完(否则 durationMs 退回最后一帧的 presentation_us,
//      playbackComplete=false, 不伪造)。
//   4) e2eScenario (--e2e-rounds N 开启, 默认 0=跳过不影响老默认耗时): 每轮 冷启动→
//      尝试点发布→点开视频卡→等播完(或超时)→取纯函数复算这一轮数字; N 轮汇总取
//      中位数, 输出验收表(目标: 发布/秒开 各 ≤1000ms、stall=0、播放完整)。
//
// v3 定谳修复(本采集器上一版四个已知缺陷, 均已修正, 老字段结构/含义不变):
//   ①media_playback_frame 在生成器侧被 cheng_android_media_trace_enabled() 门控(读
//     debug.cheng.media.trace), media_playback_eos/prepare_media_surface 则不受门控
//     —— 已用 grep 逐行核对 mobile_shell_codegen.cheng confirm。旧版从未 setprop 这个
//     属性, 导致 playbackSmoothness 永远采不到任何一帧, 恒 unavailable。现在 main()
//     顶部仿 unimaker-android-playback-smoke.mjs:42 / unimaker-android-publish-cancel-
//     smoke.mjs 的既有约定: 先 getprop 记录原值, setprop 1, 全程结束 finally/exit 钩子
//     恢复原值(不是硬写 0)。
//   ②collectPlaybackSmoothness 按 assetCid 分组后一律拼成一条帧序列, 同一 asset 重播
//     两次(或中断重进)会把两个会话之间的静默间隔当成一次巨大 stall。现在按
//     media_playback_eos 或帧号回绕(新帧号<=上一帧号)切会话边界, 会话内部独立算
//     p50/p95/max/stallCount/durationMs/playbackComplete, 新增 sessionIndex 字段。
//   ③collectOpenToFirstMediaFrame 的窗口右边界在有下一个 t0 时不封顶, 相邻两次 tap 相隔
//     很久时窗口会一直延伸到下一个 t0, 把无关的远处标记(如首页 feed 自渲染触发的
//     video_poster_only_ok)错配进来。现在右边界钉 min(下一个 t0, capMs); 并给每条媒体
//     就绪日志加认领(claim)机制, 一条日志只能被最早匹配到它的 tap 窗口计入 —— 若某
//     tap 本该匹配的候选已被更早窗口抢先认领(边界时间戳相等等场景), 诚实标记
//     ambiguous=true(available=false, kind=null), 不静默把它塞给当前 tap。
//   ④runE2EScenario 里从 collectOpenToFirstMediaFrame(lines) 取 [0], 但一轮里发布 tap
//     与卡片 tap 都各自产生一条 tap_trace t0, 数组第 0 项其实是发布 tap(与视频无关)。
//     新增 pickCardOpenFrameSample(): 用 tap_trace t0 自带的 app_milli 坐标(与
//     input_touch 的 app_milli 同源同单位, /1000 换算物理像素)与 --card-tap-x/y 做
//     最近邻匹配; 坐标不可用时诚实退化为取数组最后一个(卡片 tap 总在发布 tap 之后)。
//
// 用法:
//   node scripts/unimaker-device-perf-oracle.mjs --device GBJ0222B24021692 --out-dir tmp/device-perf-current
//   node scripts/unimaker-device-perf-oracle.mjs --device <serial> --out-dir <dir> --e2e-rounds 3
//
// 幂等可重跑; 设备不在/包不在 -> 明确报错并以非 0 退出。

import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, createWriteStream } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const TAG = "cheng-mobile-shell";
const DEFAULT_PACKAGE = "org.cheng.unimaker.scene";
const DEFAULT_ACTIVITY = ".ChengMainActivity";
const TOUCH_TRACE_PROP = "debug.cheng.touch.trace";
// v3 修复①: media_playback_frame 生成器侧门控开关(见文件头注释), 逐解码帧日志必须
// 先 setprop 这个属性=1 才会发射(media_playback_eos/prepare_media_surface 不受影响)。
const MEDIA_TRACE_PROP = "debug.cheng.media.trace";

// 埋点消息子串(先 grep 生成器确认过的确切格式)
const MARK_INIT_BEGIN = "native_create app_init_begin";
const MARK_INIT_DONE = "native_create init_done";
const RE_INIT_BEGIN = /native_create app_init_begin/;
const RE_INIT_DONE = /native_create init_done/;
// 首选 present_gpu(计划里的 :14640), 若不发射则退到实际的 compositor 帧标记。
const RE_FRAME_GPU = /present_gpu frame=(\d+)/;
const RE_FRAME_COMPOSITOR = /present_compositor frame=(\d+)/;
const RE_INPUT_TOUCH = /input_touch action=(-?\d+) dur_us=(-?\d+)/;
// tap→首帧 秒开 拆段 (host cheng_gui_host.c open_to_first_frame 一次性行). 分段:
//   spawn_ms   路由激活→fetch 线程起步
//   dial_ms    QUIC dial + negotiate + announce (冷开真敌)
//   index_ms   ES index 学习 + 解码器创建
//   fetch_decode_ms  首解码帧到达 sink
//   present_ms 首帧上屏合成
const RE_OPEN_TO_FIRST_FRAME =
  /open_to_first_frame route=(-?\d+) total_ms=(-?\d+) spawn_ms=(-?\d+) dial_ms=(-?\d+) index_ms=(-?\d+) fetch_decode_ms=(-?\d+) present_ms=(-?\d+)/;
// tap→首帧拆段: t0(tap 派发)/t1(paint commands 就绪)/t2(present_compositor 首帧)。
// t0 只在真实派发的 tap-up 上发射一次(排除 move/滚动释放), 见 mobile_shell_codegen.cheng
// cheng_android_drain_input_ring; t1/t2 是 host 为当前 pending tap 发射的专用标记,
// 避免通用 app_trace / bounded present 日志与相邻帧误配。
const RE_TAP_T0 = /tap_trace t0 pointer=(-?\d+) app_milli=(-?\d+),(-?\d+)/;
const RE_TAP_T1 = /tap_trace t1/;
const RE_TAP_T2 = /tap_trace t2 frame=(\d+)/;

// v3 新增标记(约定见文件头注释)。
// 发布拆段 t_pub0/t_pub1/t_pub2: 复用 app_trace step=N 一次性里程碑机制, 顺号新增。
const RE_PUB_T0 = /publish_trace t_pub0 kind=(\S*)/;
const RE_PUB_T1 = /publish_trace t_pub1 kind=(\S*)/;
const RE_PUB_T2 = /publish_trace t_pub2 content_id=(\S*)/;
// tap→首媒体帧: poster 快路径 vs 完整 video 解码(格式已用 grep 核对 mobile_shell_codegen.cheng)。
const RE_MEDIA_SURFACE_POSTER = /prepare_media_surface video_poster_(?:only_)?ok\b/;
const RE_MEDIA_SURFACE_VIDEO = /prepare_media_surface (?:ok asset=|local_video_ok asset=|ES ok decoded=)/;
// 播放平滑度: 逐解码帧 / 自然播完标记。
const RE_MEDIA_PLAYBACK_FRAME =
  /media_playback_frame asset=(\S+) frame=(-?\d+) update=(-?\d+) presentation_us=(-?\d+) playback=(-?\d+)/;
const RE_MEDIA_PLAYBACK_EOS = /media_playback_eos asset=(\S+) frames=(-?\d+) presentation_us=(-?\d+)/;

// logcat -v epoch 行格式:
//   "         1783239714.320  8811 16322 I cheng-mobile-shell: <message>"
const RE_EPOCH_LINE = /^\s*(\d+\.\d+)\s+\d+\s+\d+\s+[A-Z]\s+cheng-mobile-shell:\s+(.*)$/;

// ---------------------------------------------------------------------------
// CLI 解析
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const opts = {
    device: null,
    outDir: null,
    package: DEFAULT_PACKAGE,
    activity: DEFAULT_ACTIVITY,
    coldRuns: 3,
    idleWindowMs: 5000,
    taps: 5,
    tapGapMs: 600,
    tapPoints: [],
    e2eRounds: 0,
    publishTapX: null,
    publishTapY: null,
    cardTapX: null,
    cardTapY: null,
    publishWaitMs: 8000,
    playbackTimeoutMs: 90000,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) fail(`选项 ${a} 缺少参数值`);
      return v;
    };
    switch (a) {
      case "--device": opts.device = next(); break;
      case "--out-dir": opts.outDir = next(); break;
      case "--package": opts.package = next(); break;
      case "--activity": opts.activity = next(); break;
      case "--cold-runs": opts.coldRuns = parseInt(next(), 10); break;
      case "--idle-window-ms": opts.idleWindowMs = parseInt(next(), 10); break;
      case "--taps": opts.taps = parseInt(next(), 10); break;
      case "--tap-gap-ms": opts.tapGapMs = parseInt(next(), 10); break;
      case "--tap-points": {
        const raw = next();
        opts.tapPoints = raw.split(";").filter(Boolean).map((point) => {
          const [xRaw, yRaw, ...rest] = point.split(",");
          const x = Number.parseInt(xRaw, 10);
          const y = Number.parseInt(yRaw, 10);
          if (rest.length > 0 || !Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0) {
            fail(`--tap-points 坐标格式无效: ${point}`);
          }
          return { x, y };
        });
        if (opts.tapPoints.length === 0) fail("--tap-points 至少需要一个 x,y 坐标");
        break;
      }
      case "--e2e-rounds": opts.e2eRounds = parseInt(next(), 10); break;
      case "--publish-tap-x": opts.publishTapX = parseInt(next(), 10); break;
      case "--publish-tap-y": opts.publishTapY = parseInt(next(), 10); break;
      case "--card-tap-x": opts.cardTapX = parseInt(next(), 10); break;
      case "--card-tap-y": opts.cardTapY = parseInt(next(), 10); break;
      case "--publish-wait-ms": opts.publishWaitMs = parseInt(next(), 10); break;
      case "--playback-timeout-ms": opts.playbackTimeoutMs = parseInt(next(), 10); break;
      case "-h":
      case "--help": printHelp(); process.exit(0); break;
      default: fail(`未知选项: ${a}`);
    }
  }
  if (!opts.outDir) fail("必须提供 --out-dir <dir>");
  if (!Number.isInteger(opts.coldRuns) || opts.coldRuns < 1) fail("--cold-runs 必须是正整数");
  if (!Number.isInteger(opts.e2eRounds) || opts.e2eRounds < 0) fail("--e2e-rounds 必须是非负整数");
  return opts;
}

function printHelp() {
  process.stdout.write(
    [
      "unimaker-device-perf-oracle — Android 真机运行时性能基线采集器",
      "",
      "用法:",
      "  node scripts/unimaker-device-perf-oracle.mjs --device <serial> --out-dir <dir> [选项]",
      "",
      "选项:",
      "  --device <serial>       adb 设备序列号 (省略则自动选唯一在线设备)",
      "  --out-dir <dir>         报告与原始 logcat 输出目录 (必填)",
      `  --package <pkg>         应用包名 (默认 ${DEFAULT_PACKAGE})`,
      `  --activity <name>       主 Activity (默认 ${DEFAULT_ACTIVITY})`,
      "  --cold-runs <N>         冷启动重复次数 (默认 3)",
      "  --idle-window-ms <ms>   帧节奏静置观测窗口 (默认 5000)",
      "  --taps <N>              触摸采样点击次数 (默认 5)",
      "  --tap-gap-ms <ms>       两次点击间隔 (默认 600)",
      "  --tap-points <x,y;...>   按顺序循环使用物理像素坐标 (默认屏幕中央偏下)",
      "  --e2e-rounds <N>        v3 E2E 一键剧本轮数 (默认 0=跳过; 发布→点开→播完 × N 轮取中位数)",
      "  --publish-tap-x <px>    E2E 剧本发布按钮点击 x 坐标 (默认猜测: 屏宽 50%)",
      "  --publish-tap-y <px>    E2E 剧本发布按钮点击 y 坐标 (默认猜测: 屏高 96.5%, 底部导航栏)",
      "  --card-tap-x <px>       E2E 剧本视频卡点击 x 坐标 (默认同触摸采样点)",
      "  --card-tap-y <px>       E2E 剧本视频卡点击 y 坐标 (默认同触摸采样点)",
      "  --publish-wait-ms <ms>  E2E 剧本等发布 t_pub2 超时 (默认 8000)",
      "  --playback-timeout-ms <ms>  E2E 剧本等播完(EOS)超时 (默认 90000)",
      "",
    ].join("\n") + "\n",
  );
}

function fail(msg) {
  process.stderr.write(`[perf-oracle] 错误: ${msg}\n`);
  process.exit(2);
}

// ---------------------------------------------------------------------------
// adb 辅助
// ---------------------------------------------------------------------------
function adbGlobal(args) {
  return execFileSync("adb", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function adb(device, args, opts = {}) {
  return execFileSync("adb", ["-s", device, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", opts.inheritErr ? "inherit" : "pipe"],
    ...opts,
  });
}

function adbTry(device, args) {
  try {
    return { ok: true, out: adb(device, args) };
  } catch (e) {
    return { ok: false, out: (e.stdout || "") + (e.stderr || ""), err: e };
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// 预检: adb 可用, 设备在线, 包已安装, Activity 可解析
// ---------------------------------------------------------------------------
function preflight(opts) {
  // adb 存在
  try {
    execFileSync("adb", ["version"], { encoding: "utf8" });
  } catch {
    fail("找不到 adb, 请确认 Android platform-tools 在 PATH 中");
  }

  // 设备列表
  let devicesOut;
  try {
    devicesOut = adbGlobal(["devices"]);
  } catch (e) {
    fail(`adb devices 失败: ${e.message}`);
  }
  const online = devicesOut
    .split("\n")
    .slice(1)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.split(/\s+/))
    .filter((cols) => cols[1] === "device")
    .map((cols) => cols[0]);

  let device = opts.device;
  if (!device) {
    if (online.length === 1) device = online[0];
    else if (online.length === 0) fail("没有在线的 adb 设备");
    else fail(`检测到多个在线设备 [${online.join(", ")}], 请用 --device 指定`);
  } else if (!online.includes(device)) {
    fail(`设备 ${device} 不在线 (在线设备: [${online.join(", ") || "无"}])`);
  }

  // 包已安装
  const pkgList = adb(device, ["shell", "pm", "list", "packages", opts.package]);
  if (!pkgList.split("\n").some((l) => l.trim() === `package:${opts.package}`)) {
    fail(`包 ${opts.package} 未安装在设备 ${device} 上`);
  }

  // Activity 可解析
  const fq = `${opts.package}/${opts.activity}`;
  const resolveOut = adbTry(device, [
    "shell", "cmd", "package", "resolve-activity", "--brief",
    "-c", "android.intent.category.LAUNCHER", opts.package,
  ]);
  const resolvedComponent = resolveOut.ok
    ? resolveOut.out.split("\n").map((s) => s.trim()).filter(Boolean).pop()
    : "";
  if (resolvedComponent && !resolvedComponent.includes("/")) {
    fail(`包 ${opts.package} 未解析出 LAUNCHER Activity (输出: ${resolvedComponent})`);
  }

  return { device, launchComponent: fq, resolvedComponent };
}

// ---------------------------------------------------------------------------
// 设备 / APK 元信息
// ---------------------------------------------------------------------------
function getprop(device, key) {
  try {
    return adb(device, ["shell", "getprop", key]).trim();
  } catch {
    return null;
  }
}

function collectDeviceMeta(device) {
  const meta = {
    serial: device,
    model: getprop(device, "ro.product.model"),
    product: getprop(device, "ro.product.name") || getprop(device, "ro.product.device"),
    manufacturer: getprop(device, "ro.product.manufacturer"),
    androidRelease: getprop(device, "ro.build.version.release"),
    sdk: getprop(device, "ro.build.version.sdk"),
    buildFingerprint: getprop(device, "ro.build.fingerprint"),
    screen: null,
  };
  const wm = adbTry(device, ["shell", "wm", "size"]);
  if (wm.ok) {
    const m = wm.out.match(/Physical size:\s*(\d+)x(\d+)/);
    if (m) meta.screen = { widthPx: parseInt(m[1], 10), heightPx: parseInt(m[2], 10) };
  }
  return meta;
}

function collectApkMeta(device, pkg) {
  const dump = adbTry(device, ["shell", "dumpsys", "package", pkg]);
  const apk = {
    package: pkg,
    versionName: null,
    versionCode: null,
    firstInstallTime: null,
    lastUpdateTime: null,
  };
  if (dump.ok) {
    const text = dump.out;
    const grab = (re) => {
      const m = text.match(re);
      return m ? m[1].trim() : null;
    };
    apk.versionName = grab(/versionName=([^\s]+)/);
    apk.versionCode = grab(/versionCode=([^\s]+)/);
    apk.firstInstallTime = grab(/firstInstallTime=([0-9: -]+)/);
    apk.lastUpdateTime = grab(/lastUpdateTime=([0-9: -]+)/);
  }
  return apk;
}

// ---------------------------------------------------------------------------
// 流式 logcat 捕获 (在 am start 之前启动, 避免 ring buffer 冲刷)
// ---------------------------------------------------------------------------
class Capture {
  constructor(device, filePath) {
    this.device = device;
    this.filePath = filePath;
    this.buffer = "";
    this.file = createWriteStream(filePath);
    this.child = spawn("adb", ["-s", device, "logcat", "-v", "epoch", "-s", TAG], {
      stdio: ["ignore", "pipe", "ignore"],
    });
    this.child.stdout.setEncoding("utf8");
    this.child.stdout.on("data", (chunk) => {
      this.buffer += chunk;
      this.file.write(chunk);
    });
    this.stopped = false;
  }

  // 事件驱动等待: 一有匹配立即 resolve, 超时 resolve(false)
  waitFor(regex, timeoutMs) {
    return new Promise((resolve) => {
      if (regex.test(this.buffer)) return resolve(true);
      const onData = () => {
        if (regex.test(this.buffer)) {
          cleanup();
          resolve(true);
        }
      };
      const timer = setTimeout(() => {
        cleanup();
        resolve(false);
      }, timeoutMs);
      const cleanup = () => {
        this.child.stdout.removeListener("data", onData);
        clearTimeout(timer);
      };
      this.child.stdout.on("data", onData);
    });
  }

  stop() {
    if (this.stopped) return;
    this.stopped = true;
    try {
      this.child.kill("SIGTERM");
    } catch {
      /* ignore */
    }
    try {
      this.file.end();
    } catch {
      /* ignore */
    }
  }
}

// 解析捕获文本 -> [{ts, msg}]
function parseLines(text) {
  const out = [];
  for (const line of text.split("\n")) {
    const m = line.match(RE_EPOCH_LINE);
    if (m) out.push({ ts: parseFloat(m[1]), msg: m[2] });
  }
  return out;
}

// tap→首帧 秒开 拆段样本收集: 扫描已解析的日志行, 抓 host 的 open_to_first_frame 一次性行。
function collectOpenToFirstFrame(lines) {
  const samples = [];
  for (const l of lines) {
    const m = l.msg.match(RE_OPEN_TO_FIRST_FRAME);
    if (!m) continue;
    samples.push({
      tsEpoch: l.ts,
      route: parseInt(m[1], 10),
      totalMs: parseInt(m[2], 10),
      spawnMs: parseInt(m[3], 10),
      dialMs: parseInt(m[4], 10),
      indexMs: parseInt(m[5], 10),
      fetchDecodeMs: parseInt(m[6], 10),
      presentMs: parseInt(m[7], 10),
    });
  }
  return samples;
}

// tap→首帧拆段样本收集(v2): 对每个 t0(tap_trace)行, 在其到下一个 t0 行(或 t0+capMs)
// 的窗口内, 顺序找当前 pending tap 的专用 t1 与 t2 行。
// t1/t2 缺失是诚实结果(如: tap 命中已渲染态, 无需重建/未在窗口内 present) —— 不是错误,
// 逐样本标注 t1Available/t2Available, 不用 0 填充伪造。
function collectTapReactionSamples(lines, capMs = 2000) {
  const t0Lines = lines.filter((l) => RE_TAP_T0.test(l.msg)).sort((a, b) => a.ts - b.ts);
  const t1Lines = lines.filter((l) => RE_TAP_T1.test(l.msg));
  const t2Lines = lines.filter((l) => RE_TAP_T2.test(l.msg));
  const samples = [];
  for (let i = 0; i < t0Lines.length; i++) {
    const t0 = t0Lines[i];
    const windowEndTs = i + 1 < t0Lines.length ? t0Lines[i + 1].ts : t0.ts + capMs / 1000;
    const t0Match = t0.msg.match(RE_TAP_T0);
    const t1Line = t1Lines.find((l) => l.ts >= t0.ts && l.ts <= windowEndTs);
    const afterTs = t1Line ? t1Line.ts : t0.ts;
    const t2Line = t2Lines.find((l) => l.ts >= afterTs && l.ts <= windowEndTs);
    const sample = {
      pointer: parseInt(t0Match[1], 10),
      appMilliX: parseInt(t0Match[2], 10),
      appMilliY: parseInt(t0Match[3], 10),
      t0TsEpoch: t0.ts,
      t1Available: !!t1Line,
      t2Available: !!t2Line,
      t0ToT1Ms: t1Line ? round2((t1Line.ts - t0.ts) * 1000) : null,
      t1ToT2Ms: t1Line && t2Line ? round2((t2Line.ts - t1Line.ts) * 1000) : null,
      t0ToT2Ms: t2Line ? round2((t2Line.ts - t0.ts) * 1000) : null,
    };
    samples.push(sample);
  }
  return samples;
}

// 发布链路 t_pub0→t_pub1→t_pub2 拆段(v3, 真实落地标记+认领式配对, 语义见文件头注释;
// 与鸿蒙采集器 collectPublishTrace 同构)。t_pub0 在原生防重入门禁之前无条件发射, 双击
// 发布会产生孤立 t0; t1 与 t0 同一次同步调用毫秒级间隔, next-t0 截断安全; t2 可晚数秒
// 且中间可插孤立 t0, 只受 capMs 窗+未认领约束。未认领 t1/t2 显式 orphaned+warning。
// 任一段缺失是诚实结果(unavailable), 不用 0 填充伪造。
function collectPublishTrace(lines, capMs = 8000) {
  const t0s = lines.filter((l) => RE_PUB_T0.test(l.msg)).sort((a, b) => a.ts - b.ts);
  const t1s = lines.filter((l) => RE_PUB_T1.test(l.msg)).sort((a, b) => a.ts - b.ts);
  const t2s = lines.filter((l) => RE_PUB_T2.test(l.msg)).sort((a, b) => a.ts - b.ts);
  const t1Claimed = new Array(t1s.length).fill(false);
  const t2Claimed = new Array(t2s.length).fill(false);
  const samples = [];
  for (let i = 0; i < t0s.length; i++) {
    const t0 = t0s[i];
    const capEnd = t0.ts + capMs / 1000;
    const t1End = i + 1 < t0s.length ? Math.min(t0s[i + 1].ts, capEnd) : capEnd;
    let t1 = undefined;
    for (let j = 0; j < t1s.length; j++) {
      if (!t1Claimed[j] && t1s[j].ts >= t0.ts && t1s[j].ts <= t1End) {
        t1 = t1s[j];
        t1Claimed[j] = true;
        break;
      }
    }
    let t2 = undefined;
    if (t1) {
      for (let j = 0; j < t2s.length; j++) {
        if (!t2Claimed[j] && t2s[j].ts >= t1.ts && t2s[j].ts <= capEnd) {
          t2 = t2s[j];
          t2Claimed[j] = true;
          break;
        }
      }
    }
    samples.push({
      kind: t0.msg.match(RE_PUB_T0)[1],
      contentId: t2 ? t2.msg.match(RE_PUB_T2)[1] : null,
      tPub0TsEpoch: t0.ts,
      tPub1Available: !!t1,
      tPub2Available: !!t2,
      tPub0ToTPub1Ms: t1 ? round2((t1.ts - t0.ts) * 1000) : null,
      tPub1ToTPub2Ms: t1 && t2 ? round2((t2.ts - t1.ts) * 1000) : null,
      tPub0ToTPub2Ms: t2 ? round2((t2.ts - t0.ts) * 1000) : null,
    });
  }
  const orphanedT1Count = t1Claimed.filter((c) => !c).length;
  const orphanedT2Count = t2Claimed.filter((c) => !c).length;
  const warnings = [];
  if (orphanedT1Count > 0)
    warnings.push(`orphaned t_pub1 x${orphanedT1Count}: 存在未被任何 t_pub0 认领的 t1 行, 配对可能失真, 请人工核对原始 logcat`);
  if (orphanedT2Count > 0)
    warnings.push(`orphaned t_pub2 x${orphanedT2Count}: 存在未被任何样本认领的 t2 行(真实发布结果被漏接), 请人工核对原始 logcat`);
  return { samples, orphanedT1Count, orphanedT2Count, warnings };
}

// tap→首媒体帧拆段(v3): 复用既有 tap_trace t0(同一触发源), 在窗口内找第一条媒体就绪
// 日志(poster 快路径 或 完整 video 解码, 见文件头注释), 按到达时间戳判定哪一种先出现。
// 两者都没出现是诚实结果(tap 命中非视频元素), kind=null 不猜测。
//
// v3 修复③(窗口互斥, 见文件头注释): 右边界钉 min(下一个 t0, capMs) —— 有下一个 t0
// 但相隔很久时不再无界延伸, 避免把与本次 tap 无关的远处标记错配进来; 每条候选日志一旦
// 被某个 tap 窗口认领(claim)就不能再被另一个窗口计入, 认领冲突(候选本在窗口内但已被
// 更早的 tap 抢先认领, 典型于边界时间戳相等)诚实标 ambiguous=true, 不静默归属。
function collectOpenToFirstMediaFrame(lines, capMs = 8000) {
  const t0Lines = lines.filter((l) => RE_TAP_T0.test(l.msg)).sort((a, b) => a.ts - b.ts);
  const posterLines = lines.filter((l) => RE_MEDIA_SURFACE_POSTER.test(l.msg)).sort((a, b) => a.ts - b.ts);
  const videoLines = lines.filter((l) => RE_MEDIA_SURFACE_VIDEO.test(l.msg)).sort((a, b) => a.ts - b.ts);
  const posterClaimed = new Array(posterLines.length).fill(false);
  const videoClaimed = new Array(videoLines.length).fill(false);
  const samples = [];
  for (let i = 0; i < t0Lines.length; i++) {
    const t0 = t0Lines[i];
    const t0Match = t0.msg.match(RE_TAP_T0);
    const nextT0Ts = i + 1 < t0Lines.length ? t0Lines[i + 1].ts : Infinity;
    const windowEnd = Math.min(nextT0Ts, t0.ts + capMs / 1000);
    const inWindow = (l) => l.ts >= t0.ts && l.ts <= windowEnd;
    const posterIdx = posterLines.findIndex((l, idx) => !posterClaimed[idx] && inWindow(l));
    const videoIdx = videoLines.findIndex((l, idx) => !videoClaimed[idx] && inWindow(l));
    const posterConflict = posterIdx < 0 && posterLines.some((l, idx) => posterClaimed[idx] && inWindow(l));
    const videoConflict = videoIdx < 0 && videoLines.some((l, idx) => videoClaimed[idx] && inWindow(l));
    const poster = posterIdx >= 0 ? posterLines[posterIdx] : null;
    const video = videoIdx >= 0 ? videoLines[videoIdx] : null;
    let kind = null;
    let matchTs = null;
    if (poster && video) {
      if (poster.ts <= video.ts) { kind = "poster"; matchTs = poster.ts; posterClaimed[posterIdx] = true; }
      else { kind = "video"; matchTs = video.ts; videoClaimed[videoIdx] = true; }
    } else if (poster) {
      kind = "poster"; matchTs = poster.ts; posterClaimed[posterIdx] = true;
    } else if (video) {
      kind = "video"; matchTs = video.ts; videoClaimed[videoIdx] = true;
    }
    samples.push({
      pointer: parseInt(t0Match[1], 10),
      appMilliX: parseInt(t0Match[2], 10),
      appMilliY: parseInt(t0Match[3], 10),
      t0TsEpoch: t0.ts,
      kind,
      available: matchTs != null,
      ambiguous: matchTs == null && (posterConflict || videoConflict),
      ms: matchTs != null ? round2((matchTs - t0.ts) * 1000) : null,
    });
  }
  return samples;
}

// 播放窗口帧节奏(v3): 用逐解码帧日志(非通用 UI present_compositor, 理由见文件头注释)
// 按 assetCid 分组; 组内再按 media_playback_eos 或帧号回绕拆成独立"会话"(v3 修复②,
// 见文件头注释) —— 同一 assetCid 重播两次(或中断后重进)不再被拼成一条序列, 会话之间
// 的静默间隔不计入任何会话的相邻帧间隔, 不会被误算成 stall。会话内部独立算
// p50/p95/max/stallCount; media_playback_eos 判定该会话是否自然播完, 没等到 eos 就
// 退回最后一帧的 presentation_us 作 durationMs, playbackComplete=false(不伪造播完)。
function collectPlaybackSmoothness(lines, stallThresholdMs = 200) {
  const frameLines = [];
  for (const l of lines) {
    const m = l.msg.match(RE_MEDIA_PLAYBACK_FRAME);
    if (m) frameLines.push({ ts: l.ts, asset: m[1], frame: parseInt(m[2], 10), presentationUs: parseInt(m[4], 10) });
  }
  const eosLines = [];
  for (const l of lines) {
    const m = l.msg.match(RE_MEDIA_PLAYBACK_EOS);
    if (m) eosLines.push({ ts: l.ts, asset: m[1], frames: parseInt(m[2], 10), presentationUs: parseInt(m[3], 10) });
  }
  const assets = [...new Set(frameLines.map((f) => f.asset))];
  const result = [];
  for (const asset of assets) {
    const fs = frameLines.filter((f) => f.asset === asset).sort((a, b) => a.ts - b.ts);
    const eos = eosLines.filter((e) => e.asset === asset).sort((a, b) => a.ts - b.ts);
    // 合并帧/eos 成单一按时间排序的时间线, 单遍扫描切会话边界。
    const timeline = [
      ...fs.map((f) => ({ ts: f.ts, type: "frame", frame: f })),
      ...eos.map((e) => ({ ts: e.ts, type: "eos", eos: e })),
    ].sort((a, b) => a.ts - b.ts);

    let current = [];
    let sessionIndex = 0;
    const closeSession = (eosEvent) => {
      if (current.length === 0) return;
      const intervals = [];
      for (let i = 1; i < current.length; i++) intervals.push(round2((current[i].ts - current[i - 1].ts) * 1000));
      const sorted = [...intervals].sort((a, b) => a - b);
      const last = current[current.length - 1];
      result.push({
        assetCid: asset,
        sessionIndex: sessionIndex++,
        startTsEpoch: current[0].ts,
        endTsEpoch: last.ts,
        frameCount: current.length,
        intervalCount: intervals.length,
        p50Ms: intervals.length ? round2(percentile(sorted, 50)) : null,
        p95Ms: intervals.length ? round2(percentile(sorted, 95)) : null,
        maxMs: intervals.length ? round2(Math.max(...intervals)) : null,
        stallThresholdMs,
        stallCount: intervals.filter((v) => v > stallThresholdMs).length,
        playbackComplete: !!eosEvent,
        durationMs: eosEvent ? round2(eosEvent.presentationUs / 1000) : round2(last.presentationUs / 1000),
      });
      current = [];
    };

    for (const ev of timeline) {
      if (ev.type === "eos") {
        closeSession(ev.eos);
        continue;
      }
      // 帧号回绕(新帧号<=会话内上一帧号): 未经 eos 的会话边界, 典型于中断后重进。
      if (current.length > 0 && ev.frame.frame <= current[current.length - 1].frame) {
        closeSession(null);
      }
      current.push(ev.frame);
    }
    closeSession(null); // 收尾: 若还有未闭合会话(无 eos, 被截断), 诚实标 playbackComplete=false
  }
  return result;
}

// E2E 剧本(v3 修复④, 见文件头注释): 从 collectOpenToFirstMediaFrame 的样本里挑出"卡片
// tap"对应的那一条, 而不是无脑取数组第 0 项(那实际是发布 tap, 与视频无关)。用
// tap_trace t0 自带的 app_milli 坐标(与 input_touch 的 app_milli 同源同单位, 都是
// x_milli*present_width/source_width, /1000 换算成物理像素后与 --card-tap-x/y 同一坐标
// 系)做最近邻匹配; 样本数组为空则没有可选的, 返回 null; 有样本但坐标信息不可用(理论
// 兜底, 当前 RE_TAP_T0 恒产出数值坐标)时诚实退化为取数组最后一个(E2E 剧本里卡片 tap
// 总是在发布 tap 之后发生的最后一次点击)。
function pickCardOpenFrameSample(samples, cardTapX, cardTapY) {
  if (samples.length === 0) return null;
  const withCoords = samples.filter((s) => Number.isFinite(s.appMilliX) && Number.isFinite(s.appMilliY));
  if (withCoords.length === 0) return samples[samples.length - 1];
  let best = null;
  let bestDist = Infinity;
  for (const s of withCoords) {
    const dx = s.appMilliX / 1000 - cardTapX;
    const dy = s.appMilliY / 1000 - cardTapY;
    const dist = dx * dx + dy * dy;
    if (dist < bestDist) {
      bestDist = dist;
      best = s;
    }
  }
  return best;
}

// 小工具: 从数值数组算 median/min/max(v3 新增字段复用, 避免每处重复内联)。
function msStatsFrom(vals) {
  const sorted = [...vals].sort((a, b) => a - b);
  return {
    medianMs: vals.length ? round2(percentile(sorted, 50)) : null,
    minMs: vals.length ? round2(Math.min(...vals)) : null,
    maxMs: vals.length ? round2(Math.max(...vals)) : null,
  };
}

// ---------------------------------------------------------------------------
// 统计
// ---------------------------------------------------------------------------
function percentile(sortedArr, p) {
  const n = sortedArr.length;
  if (n === 0) return null;
  if (n === 1) return sortedArr[0];
  const idx = (p / 100) * (n - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedArr[lo];
  const frac = idx - lo;
  return sortedArr[lo] * (1 - frac) + sortedArr[hi] * frac;
}

function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  return percentile(s, 50);
}

const round2 = (v) => (v == null ? null : Math.round(v * 100) / 100);

// ---------------------------------------------------------------------------
// 应用控制
// ---------------------------------------------------------------------------
function forceStop(device, pkg) {
  adbTry(device, ["shell", "am", "force-stop", pkg]);
}

function logcatClear(device) {
  adbTry(device, ["logcat", "-c"]);
}

function amStart(device, component) {
  const r = adbTry(device, ["shell", "am", "start", "-n", component]);
  if (!r.ok || /Error|Exception/.test(r.out)) {
    throw new Error(`am start ${component} 失败: ${r.out.trim()}`);
  }
  return r.out;
}

// 一次干净启动 + 流式捕获, 返回 Capture (调用方负责 stop)
async function launchWithCapture(device, pkg, component, rawPath, readyTimeoutMs) {
  forceStop(device, pkg);
  await sleep(300);
  logcatClear(device);
  const cap = new Capture(device, rawPath);
  await sleep(400); // 确保 logcat 已 attach
  amStart(device, component);
  const gotInit = await cap.waitFor(RE_INIT_DONE, readyTimeoutMs);
  return { cap, gotInit };
}

// ---------------------------------------------------------------------------
// v3 E2E 一键剧本: 每轮 冷启动 → 尝试点发布 → 点开视频卡 → 等播完(或超时) → 用同一批
// 纯函数(collectPublishTrace/collectOpenToFirstMediaFrame/collectPlaybackSmoothness)
// 复算这一轮数字。N 轮汇总取中位数 + 输出验收表。发布/卡片坐标默认猜测(见 --help),
// 可用 --publish-tap-x/y、--card-tap-x/y 覆盖真实坐标。
// ---------------------------------------------------------------------------
async function runE2EScenario(device, pkg, component, opts, rawDir, deviceMeta, defaultCardTapX, defaultCardTapY) {
  const publishTapX = opts.publishTapX ?? (deviceMeta.screen ? Math.round(deviceMeta.screen.widthPx * 0.5) : 610);
  const publishTapY = opts.publishTapY ?? (deviceMeta.screen ? Math.round(deviceMeta.screen.heightPx * 0.965) : 2500);
  const cardTapX = opts.cardTapX ?? defaultCardTapX;
  const cardTapY = opts.cardTapY ?? defaultCardTapY;
  const mediaReadyRe = new RegExp(`${RE_MEDIA_SURFACE_POSTER.source}|${RE_MEDIA_SURFACE_VIDEO.source}`);
  const publishT2Re = RE_PUB_T2;

  const rounds = [];
  for (let r = 1; r <= opts.e2eRounds; r++) {
    const rawPath = join(rawDir, `e2e-round-${r}.log`);
    const { cap, gotInit } = await launchWithCapture(device, pkg, component, rawPath, 20000);

    // (a) 尝试发布: 点发布坐标, 等 t_pub2 或超时(埋点未接线时诚实超时, 不是 bug)
    adbTry(device, ["shell", "input", "tap", String(publishTapX), String(publishTapY)]);
    await cap.waitFor(publishT2Re, opts.publishWaitMs);

    // (b) 点开视频卡: 等媒体就绪(poster 或 video)标记或超时
    adbTry(device, ["shell", "input", "tap", String(cardTapX), String(cardTapY)]);
    await cap.waitFor(mediaReadyRe, Math.min(opts.playbackTimeoutMs, 15000));

    // (c) 等播完(media_playback_eos)或超时
    const gotEos = await cap.waitFor(RE_MEDIA_PLAYBACK_EOS, opts.playbackTimeoutMs);
    await sleep(300);
    cap.stop();

    const lines = parseLines(cap.buffer);
    const publish = collectPublishTrace(lines).samples[0] ?? null;
    // v3 修复④: 不取数组第 0 项(那是发布 tap), 用坐标最近邻挑出卡片 tap 那条样本。
    const openFrame = pickCardOpenFrameSample(collectOpenToFirstMediaFrame(lines), cardTapX, cardTapY);
    // 一轮 E2E 剧本只点开一张卡, 正常只应有一个播放会话; 若被动窗口混入了旁的会话
    // (如首页自渲染预览), 取最后一个(最接近本轮实际点开动作的那个), 不取第 0 个。
    const playbackSessionList = collectPlaybackSmoothness(lines);
    const playback = playbackSessionList.length ? playbackSessionList[playbackSessionList.length - 1] : null;
    const round = {
      round: r,
      launchOk: gotInit,
      rawLog: rawPath,
      publishTapPoint: { x: publishTapX, y: publishTapY },
      cardTapPoint: { x: cardTapX, y: cardTapY },
      publish,
      openFrame,
      playback,
      eosObserved: gotEos,
    };
    process.stdout.write(
      `  round ${r}: publish=${publish && publish.tPub0ToTPub2Ms != null ? `${publish.tPub0ToTPub2Ms}ms` : "unavailable"}` +
        `  open=${openFrame && openFrame.ms != null ? `${openFrame.ms}ms(${openFrame.kind})` : "unavailable"}` +
        `  playback=${playback ? `p50 ${playback.p50Ms}ms stall=${playback.stallCount} complete=${playback.playbackComplete}` : "unavailable"}\n`,
    );
    rounds.push(round);
    forceStop(device, pkg);
    await sleep(300);
  }

  const publishVals = rounds.map((r) => r.publish?.tPub0ToTPub2Ms).filter((v) => v != null);
  const openVals = rounds.map((r) => r.openFrame?.ms).filter((v) => v != null);
  const stallCounts = rounds.map((r) => r.playback?.stallCount).filter((v) => v != null);
  const completions = rounds.map((r) => r.playback?.playbackComplete).filter((v) => v != null);
  const allComplete = completions.length > 0 && completions.every((v) => v === true);

  const acceptance = {
    publish: {
      medianMs: publishVals.length ? round2(median(publishVals)) : null,
      targetMs: 1000,
      pass: publishVals.length ? median(publishVals) <= 1000 : null,
    },
    open: {
      medianMs: openVals.length ? round2(median(openVals)) : null,
      targetMs: 1000,
      pass: openVals.length ? median(openVals) <= 1000 : null,
    },
    stall: {
      totalAcrossRounds: stallCounts.length ? stallCounts.reduce((a, b) => a + b, 0) : null,
      pass: stallCounts.length ? stallCounts.every((v) => v === 0) : null,
    },
    playbackComplete: {
      allRoundsComplete: completions.length ? allComplete : null,
      pass: completions.length ? allComplete : null,
    },
  };

  return {
    roundCount: opts.e2eRounds,
    rounds,
    acceptance,
    notes: publishVals.length === 0 ? ["发布段全部轮次 unavailable: publishbridge 埋点未接线(预期, 见文件头约定)"] : [],
  };
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------
async function main() {
  const opts = parseArgs(process.argv);
  const pre = preflight(opts);
  const device = pre.device;
  const pkg = opts.package;
  const component = pre.launchComponent;

  const previousTouchTrace = adbTry(device, ["shell", "getprop", TOUCH_TRACE_PROP]).out.trim();
  let touchTraceRestored = false;
  const restoreTouchTrace = () => {
    if (touchTraceRestored) return;
    touchTraceRestored = true;
    adbTry(device, ["shell", "setprop", TOUCH_TRACE_PROP, previousTouchTrace || "0"]);
  };
  process.once("exit", restoreTouchTrace);
  // v3 修复①(见文件头注释): media_playback_frame 在生成器侧被 cheng_android_media_trace_enabled()
  // 门控(读 debug.cheng.media.trace), 且该门控是进程内 static cache, 只在进程首次读取时
  // 决定一次 —— 必须在本轮第一次 am start 之前就 setprop 好, 否则之后同一进程内再改
  // 属性也不会生效(仿 unimaker-android-playback-smoke.mjs 的 setprop/恢复约定, 这里额外
  // 用 getprop 记录真实原值而非硬写 0, 避免覆盖调用方已有的诊断态)。用 exit 钩子兜底
  // 异常退出也能恢复, 正常收尾处显式调用一次并摘掉钩子避免重复触发。
  const previousMediaTrace = getprop(device, MEDIA_TRACE_PROP);
  let mediaTraceRestored = false;
  const restoreMediaTrace = () => {
    if (mediaTraceRestored) return;
    mediaTraceRestored = true;
    adbTry(device, ["shell", "setprop", MEDIA_TRACE_PROP, previousMediaTrace || "0"]);
  };
  adb(device, ["shell", "setprop", MEDIA_TRACE_PROP, "1"]);
  process.once("exit", restoreMediaTrace);

  const outDir = resolve(opts.outDir);
  const rawDir = join(outDir, "raw");
  mkdirSync(rawDir, { recursive: true });

  const deviceMeta = collectDeviceMeta(device);
  const apkMeta = collectApkMeta(device, pkg);

  const notes = [];

  // 点击目标: 屏幕中央偏下(安全区), 用物理分辨率
  let defaultTapPoint = { x: 540, y: 1200 };
  if (deviceMeta.screen) {
    defaultTapPoint = {
      x: Math.round(deviceMeta.screen.widthPx / 2),
      y: Math.round(deviceMeta.screen.heightPx * 0.66),
    };
  } else if (opts.tapPoints.length === 0) {
    notes.push("wm size 不可用, 触摸点使用默认坐标 540x1200");
  }
  const tapPoints = opts.tapPoints.length > 0 ? opts.tapPoints : [defaultTapPoint];

  // --- 帧标记探测: 优先 present_gpu, 否则退到 present_compositor ---
  // 采完再判定, 先假设需要探测。
  let frameRe = null;
  let frameMarker = null;
  let presentGpuAvailable = false;

  // =========================================================================
  // 1) 冷启动 × N
  // =========================================================================
  process.stdout.write(`[perf-oracle] 设备 ${device} / 包 ${pkg}\n`);
  process.stdout.write(`[perf-oracle] 冷启动采样 ${opts.coldRuns} 次...\n`);

  const coldRuns = [];
  for (let i = 1; i <= opts.coldRuns; i++) {
    const rawPath = join(rawDir, `cold-run-${i}.log`);
    const { cap, gotInit } = await launchWithCapture(device, pkg, component, rawPath, 20000);
    // init_done 后再留一小段窗口抓首帧
    await cap.waitFor(RE_FRAME_COMPOSITOR, 4000);
    await sleep(300);
    cap.stop();

    const lines = parseLines(cap.buffer);
    const beginLine = lines.find((l) => RE_INIT_BEGIN.test(l.msg));
    const doneLine = lines.find((l) => RE_INIT_DONE.test(l.msg));
    // 首帧: init_begin 之后第一条帧日志(gpu 优先, 否则 compositor)
    const beginTs = beginLine ? beginLine.ts : null;
    const gpuFrame = lines.find((l) => RE_FRAME_GPU.test(l.msg) && (beginTs == null || l.ts >= beginTs));
    const compFrame = lines.find((l) => RE_FRAME_COMPOSITOR.test(l.msg) && (beginTs == null || l.ts >= beginTs));
    const firstFrameLine = gpuFrame || compFrame;
    if (gpuFrame) presentGpuAvailable = true;

    const run = {
      run: i,
      ok: !!(beginLine && doneLine),
      initBeginTs: beginTs,
      initDoneTs: doneLine ? doneLine.ts : null,
      firstFrameTs: firstFrameLine ? firstFrameLine.ts : null,
      firstFrameMarker: gpuFrame ? "present_gpu" : compFrame ? "present_compositor" : null,
      coldInitMs: null,
      firstFrameMs: null,
      rawLog: rawPath,
    };
    if (run.ok) {
      run.coldInitMs = round2((run.initDoneTs - run.initBeginTs) * 1000);
      if (run.firstFrameTs != null) {
        run.firstFrameMs = round2((run.firstFrameTs - run.initBeginTs) * 1000);
      }
    } else if (!gotInit) {
      run.error = "init_done 标记在超时内未出现";
    }
    process.stdout.write(
      `  run ${i}: ${run.ok ? `coldInit=${run.coldInitMs}ms firstFrame=${run.firstFrameMs ?? "n/a"}ms` : `失败 (${run.error || "缺标记"})`}\n`,
    );
    coldRuns.push(run);
  }

  const okCold = coldRuns.filter((r) => r.ok);
  const coldInitVals = okCold.map((r) => r.coldInitMs);
  const firstFrameVals = okCold.filter((r) => r.firstFrameMs != null).map((r) => r.firstFrameMs);

  const coldStart = {
    unit: "ms",
    runs: coldRuns,
    okCount: okCold.length,
    medianMs: coldInitVals.length ? round2(median(coldInitVals)) : null,
    minMs: coldInitVals.length ? round2(Math.min(...coldInitVals)) : null,
    maxMs: coldInitVals.length ? round2(Math.max(...coldInitVals)) : null,
    available: okCold.length > 0,
  };
  const firstFrame = {
    unit: "ms",
    marker: firstFrameVals.length ? coldRuns.find((r) => r.firstFrameMs != null)?.firstFrameMarker : null,
    values: firstFrameVals,
    medianMs: firstFrameVals.length ? round2(median(firstFrameVals)) : null,
    minMs: firstFrameVals.length ? round2(Math.min(...firstFrameVals)) : null,
    maxMs: firstFrameVals.length ? round2(Math.max(...firstFrameVals)) : null,
    available: firstFrameVals.length > 0,
  };

  // =========================================================================
  // 2) 帧节奏 (静置窗口)
  // =========================================================================
  process.stdout.write(`[perf-oracle] 帧节奏采样 (静置 ${opts.idleWindowMs}ms)...\n`);
  const cadenceRaw = join(rawDir, "cadence.log");
  const { cap: cadCap, gotInit: cadReady } = await launchWithCapture(
    device, pkg, component, cadenceRaw, 20000,
  );
  const idleStartTs = Date.now();
  await sleep(opts.idleWindowMs);
  cadCap.stop();

  const cadLines = parseLines(cadCap.buffer);
  const cadBegin = cadLines.find((l) => RE_INIT_BEGIN.test(l.msg));
  const cadBeginTs = cadBegin ? cadBegin.ts : null;
  // 帧标记判定: 若整轮任意 present_gpu 帧存在则用 gpu, 否则 compositor
  const anyGpu = cadLines.some((l) => RE_FRAME_GPU.test(l.msg));
  if (anyGpu) presentGpuAvailable = true;
  frameRe = anyGpu ? RE_FRAME_GPU : RE_FRAME_COMPOSITOR;
  frameMarker = anyGpu ? "present_gpu" : "present_compositor";

  // 只取 init_done 之后的帧, 计算相邻间隔
  const cadDone = cadLines.find((l) => RE_INIT_DONE.test(l.msg));
  const cadDoneTs = cadDone ? cadDone.ts : cadBeginTs;
  const frameTs = cadLines
    .filter((l) => frameRe.test(l.msg))
    .map((l) => l.ts)
    .filter((ts) => cadDoneTs == null || ts >= cadDoneTs)
    .sort((a, b) => a - b);
  const intervalsMs = [];
  for (let i = 1; i < frameTs.length; i++) {
    intervalsMs.push(round2((frameTs[i] - frameTs[i - 1]) * 1000));
  }
  const sortedIv = [...intervalsMs].sort((a, b) => a - b);
  const frameCadence = {
    unit: "ms",
    marker: frameMarker,
    windowMs: opts.idleWindowMs,
    frameCount: frameTs.length,
    intervalCount: intervalsMs.length,
    intervals: intervalsMs,
    p50Ms: intervalsMs.length ? round2(percentile(sortedIv, 50)) : null,
    p95Ms: intervalsMs.length ? round2(percentile(sortedIv, 95)) : null,
    maxMs: intervalsMs.length ? round2(Math.max(...intervalsMs)) : null,
    available: intervalsMs.length > 0,
    note:
      frameTs.length < 2
        ? "静置窗口内帧数不足(<2): UI 为事件驱动, 无变化时几乎不 present, 属预期"
        : null,
  };
  if (!cadReady) notes.push("帧节奏轮 init_done 未出现, 帧节奏可能不完整");

  // =========================================================================
  // 3) 触摸延迟 (点击屏幕中央偏下 × N)
  // =========================================================================
  process.stdout.write(`[perf-oracle] 触摸延迟采样 (points ${tapPoints.map((p) => `${p.x},${p.y}`).join(";")} × ${opts.taps})...\n`);
  adb(device, ["shell", "setprop", TOUCH_TRACE_PROP, "1"]);
  const touchRaw = join(rawDir, "touch.log");
  const { cap: touchCap, gotInit: touchReady } = await launchWithCapture(
    device, pkg, component, touchRaw, 20000,
  );
  await sleep(1000); // 稳定到首屏
  for (let t = 0; t < opts.taps; t++) {
    const point = tapPoints[t % tapPoints.length];
    adbTry(device, ["shell", "input", "tap", String(point.x), String(point.y)]);
    await sleep(opts.tapGapMs);
  }
  await sleep(500);
  touchCap.stop();
  restoreTouchTrace();
  process.removeListener("exit", restoreTouchTrace);

  const touchLines = parseLines(touchCap.buffer);
  const touchSamples = [];
  for (const l of touchLines) {
    const m = l.msg.match(RE_INPUT_TOUCH);
    if (m) {
      touchSamples.push({
        action: parseInt(m[1], 10),
        durUs: parseInt(m[2], 10),
        tsEpoch: l.ts,
      });
    }
  }
  const durVals = touchSamples.map((s) => s.durUs).filter((v) => v >= 0);
  const sortedDur = [...durVals].sort((a, b) => a - b);
  // input_touch 呈双峰: action=0(down) 快, action=1(up) 触发 route/hit-test 慢。
  // 合并 p50 会掩盖结构, 额外给按 action 分组小结。
  const byAction = {};
  for (const act of [...new Set(touchSamples.map((s) => s.action))].sort((a, b) => a - b)) {
    const vals = touchSamples.filter((s) => s.action === act && s.durUs >= 0).map((s) => s.durUs).sort((a, b) => a - b);
    byAction[act] = {
      label: act === 0 ? "down" : act === 1 ? "up" : `action_${act}`,
      count: vals.length,
      p50Us: vals.length ? Math.round(percentile(vals, 50)) : null,
      maxUs: vals.length ? Math.max(...vals) : null,
    };
  }
  const touchLatency = {
    unit: "us",
    tapPoint: tapPoints[0],
    tapPoints,
    tapCount: opts.taps,
    samples: touchSamples,
    sampleCount: touchSamples.length,
    p50Us: durVals.length ? Math.round(percentile(sortedDur, 50)) : null,
    maxUs: durVals.length ? Math.max(...durVals) : null,
    byAction,
    available: touchSamples.length > 0,
    note:
      touchSamples.length === 0
        ? "input_touch 埋点在本轮未出现"
        : "每次 tap 产生 action=0(down)/action=1(up) 两条样本, dur_us=host 侧处理耗时",
  };
  if (!touchReady) notes.push("触摸轮 init_done 未出现, 触摸样本可能受影响");

  // =========================================================================
  // 3b) tap→首帧 秒开 拆段 (open_to_first_frame): 冷开真敌 dial/negotiate 归因
  // =========================================================================
  // host 在首帧上屏时发一次 open_to_first_frame 行。它只在 tap 进入全屏视频路由后出现,
  // 所以扫触摸轮(点卡进详情)与帧节奏轮的日志。真机点卡编排与真数字排主会话; 本轮只接线采集。
  const openFrameSamples = collectOpenToFirstFrame([
    ...touchLines,
    ...cadLines,
  ]).sort((a, b) => a.tsEpoch - b.tsEpoch);
  const openTotals = openFrameSamples.map((s) => s.totalMs).filter((v) => v >= 0).sort((a, b) => a - b);
  const openToFirstFrame = {
    unit: "ms",
    marker: "open_to_first_frame",
    sampleCount: openFrameSamples.length,
    samples: openFrameSamples,
    medianTotalMs: openTotals.length ? Math.round(percentile(openTotals, 50)) : null,
    minTotalMs: openTotals.length ? Math.min(...openTotals) : null,
    maxTotalMs: openTotals.length ? Math.max(...openTotals) : null,
    segmentsNote: "total=spawn+dial+index+fetch_decode+present; dial=QUIC dial+negotiate+announce(冷开真敌)",
    available: openFrameSamples.length > 0,
    note:
      openFrameSamples.length === 0
        ? "本轮未出现 open_to_first_frame: 需 tap 进入全屏视频路由触发 fetch(真机点卡编排排主会话)"
        : "每次全屏视频冷开一条; 暖连接态应显著低于冷 dial 基线",
  };
  if (openFrameSamples.length === 0) notes.push("open_to_first_frame 未采到: 本轮未 tap 进全屏视频(接线已就绪)");

  // =========================================================================
  // 3c) tap→首帧拆段 t0/t1/t2 (v2 新增): 普通导航 tap 的"点了到画面变"关联延迟,
  //     区分 t0→t1(应用状态处理+paint命令重建, 含 Choreographer 调度等待)与
  //     t1→t2(atlas 上传+host present GL 提交)两段, 而非只有 dur_us 覆盖不到的黑盒。
  // =========================================================================
  const tapReactionSamples = collectTapReactionSamples([
    ...touchLines,
    ...cadLines,
  ]).sort((a, b) => a.t0TsEpoch - b.t0TsEpoch);
  const t0ToT2Vals = tapReactionSamples.map((s) => s.t0ToT2Ms).filter((v) => v != null).sort((a, b) => a - b);
  const t0ToT1Vals = tapReactionSamples.map((s) => s.t0ToT1Ms).filter((v) => v != null).sort((a, b) => a - b);
  const t1ToT2Vals = tapReactionSamples.map((s) => s.t1ToT2Ms).filter((v) => v != null).sort((a, b) => a - b);
  const minimumCompleteTapSamples = Math.min(3, opts.taps);
  const tapReactionAvailable = t0ToT2Vals.length >= minimumCompleteTapSamples;
  const tapReactionTrace = {
    unit: "ms",
    markers: { t0: "tap_trace t0", t1: "tap_trace t1", t2: "tap_trace t2" },
    sampleCount: tapReactionSamples.length,
    completeSampleCount: t0ToT2Vals.length,
    samples: tapReactionSamples,
    t0ToT2: {
      medianMs: t0ToT2Vals.length ? round2(percentile(t0ToT2Vals, 50)) : null,
      minMs: t0ToT2Vals.length ? round2(Math.min(...t0ToT2Vals)) : null,
      maxMs: t0ToT2Vals.length ? round2(Math.max(...t0ToT2Vals)) : null,
    },
    t0ToT1: {
      medianMs: t0ToT1Vals.length ? round2(percentile(t0ToT1Vals, 50)) : null,
      minMs: t0ToT1Vals.length ? round2(Math.min(...t0ToT1Vals)) : null,
      maxMs: t0ToT1Vals.length ? round2(Math.max(...t0ToT1Vals)) : null,
    },
    t1ToT2: {
      medianMs: t1ToT2Vals.length ? round2(percentile(t1ToT2Vals, 50)) : null,
      minMs: t1ToT2Vals.length ? round2(Math.min(...t1ToT2Vals)) : null,
      maxMs: t1ToT2Vals.length ? round2(Math.max(...t1ToT2Vals)) : null,
    },
    available: tapReactionAvailable,
    note:
      tapReactionSamples.length === 0
        ? "本轮未出现 tap_trace t0: 需真实派发的 tap-up(非滚动释放)触发接线已就绪"
        : !tapReactionAvailable
          ? `专用 t0/t1/t2 完整样本不足: ${t0ToT2Vals.length}/${minimumCompleteTapSamples}, 不输出导航延迟结论`
          : "t0=tap 派发, t1=paint 命令就绪, t2=当前 tap 的首个 compositor 上屏",
  };

  // =========================================================================
  // 3d) v3: 发布拆段 / tap→首媒体帧拆段 / 播放平滑度 —— 被动衍生自 3)/3b)/3c) 已采的
  //     touchLines/cadLines, 不需要额外 adb 交互。这两轮窗口通常太短(触摸轮仅 tap+
  //     等 500ms, 帧节奏轮是静置窗口), 覆盖不到完整发布/播放, 数字大概率 unavailable
  //     —— 要拿到有代表性的数字用 --e2e-rounds(见下方 4)。
  // =========================================================================
  const passiveLines = [...touchLines, ...cadLines];

  const publishCollect = collectPublishTrace(passiveLines);
  const publishSamples = publishCollect.samples;
  const publishTrace = {
    unit: "ms",
    markers: {
      tPub0: "publish_trace t_pub0 kind=",
      tPub1: "publish_trace t_pub1 kind=",
      tPub2: "publish_trace t_pub2 content_id=",
    },
    sampleCount: publishSamples.length,
    samples: publishSamples,
    orphanedT1Count: publishCollect.orphanedT1Count,
    orphanedT2Count: publishCollect.orphanedT2Count,
    warnings: publishCollect.warnings,
    tPub0ToTPub1: msStatsFrom(publishSamples.map((s) => s.tPub0ToTPub1Ms).filter((v) => v != null)),
    tPub1ToTPub2: msStatsFrom(publishSamples.map((s) => s.tPub1ToTPub2Ms).filter((v) => v != null)),
    tPub0ToTPub2: msStatsFrom(publishSamples.map((s) => s.tPub0ToTPub2Ms).filter((v) => v != null)),
    available: publishSamples.length > 0,
    note:
      publishSamples.length === 0
        ? "本轮被动窗口未出现 publish_trace t_pub0: 未点发布按钮属预期; 要采发布数字用 --e2e-rounds 或手动在采集窗口内走一次发布流"
        : "t_pub0=原生发布桥入口(kind), t_pub1=本地 post JSON 物化完成, t_pub2=enqueue ok 回 contentId(可被对端 fetch)",
  };
  if (publishSamples.length === 0) {
    notes.push("publishTrace 未采到: 被动窗口内没有发布动作(标记 publish_trace t_pub0/1/2 已在 build 内接线)");
  }
  for (const w of publishCollect.warnings) notes.push(`publishTrace: ${w}`);

  const mediaFrameSamples = collectOpenToFirstMediaFrame(passiveLines);
  const posterVals = mediaFrameSamples.filter((s) => s.kind === "poster" && s.ms != null).map((s) => s.ms);
  const videoVals = mediaFrameSamples.filter((s) => s.kind === "video" && s.ms != null).map((s) => s.ms);
  const openToFirstMediaFrame = {
    unit: "ms",
    markers: {
      t0: "tap_trace t0",
      posterReady: "prepare_media_surface video_poster_(only_)?ok",
      videoReady: "prepare_media_surface ok|local_video_ok|ES ok",
    },
    sampleCount: mediaFrameSamples.length,
    samples: mediaFrameSamples,
    poster: { sampleCount: posterVals.length, ...msStatsFrom(posterVals) },
    video: { sampleCount: videoVals.length, ...msStatsFrom(videoVals) },
    available: mediaFrameSamples.some((s) => s.available),
    ambiguousCount: mediaFrameSamples.filter((s) => s.ambiguous).length,
    note:
      mediaFrameSamples.length === 0
        ? "本轮未出现 tap_trace t0: 需真实派发的 tap-up 触发(接线已就绪)"
        : "poster=video_poster_(only_)ok 快路径, video=完整解码(ok/local_video_ok/ES ok); 同一 tap 若两者都出现取先到者; 一条媒体就绪日志只能被一个 tap 窗口认领, 冲突记 ambiguous 不误配",
  };
  if (mediaFrameSamples.length > 0 && !openToFirstMediaFrame.available) {
    notes.push("openToFirstMediaFrame: tap_trace t0 出现但窗口内未见任何媒体就绪标记(tap 大概率未命中视频卡)");
  }
  if (openToFirstMediaFrame.ambiguousCount > 0) {
    notes.push(`openToFirstMediaFrame: ${openToFirstMediaFrame.ambiguousCount} 次 tap 的候选媒体就绪日志已被更早的 tap 窗口认领, 诚实标 ambiguous, 未静默归属`);
  }

  const playbackSessions = collectPlaybackSmoothness(passiveLines);
  const playbackSmoothness = {
    unit: "ms",
    markers: { frame: "media_playback_frame", eos: "media_playback_eos" },
    stallThresholdMs: 200,
    sessions: playbackSessions,
    available: playbackSessions.length > 0,
    note:
      playbackSessions.length === 0
        ? "被动窗口(touch/cadence 采样期)未采到 media_playback_frame: 标准轮太短未覆盖播放, 用 --e2e-rounds 采集"
        : "按 assetCid 分组, 组内再按 media_playback_eos/帧号回绕拆成独立会话(重播/中断重进不拼成一条假 stall), 逐解码帧墙钟间隔(非 present_compositor, 理由见文件头注释)",
  };
  if (playbackSessions.length === 0) {
    notes.push("playbackSmoothness 被动窗口未采到播放: 标准 touch/cadence 轮太短, 用 --e2e-rounds 采集代表性数字");
  }

  // 复原: force-stop
  forceStop(device, pkg);

  // =========================================================================
  // present_gpu 可用性说明
  // =========================================================================
  if (!presentGpuAvailable) {
    notes.push(
      "present_gpu frame 埋点在当前 build 未发射: 应用走 compositor present 路径, " +
        "帧数据来自 present_compositor frame 标记(如实标注)",
    );
  }

  // =========================================================================
  // 4) v3 E2E 一键剧本 (--e2e-rounds N 开启; 默认 0=跳过, 不影响老默认运行耗时)
  // =========================================================================
  let e2eScenario = null;
  if (opts.e2eRounds > 0) {
    process.stdout.write(`[perf-oracle] E2E 剧本采样 ${opts.e2eRounds} 轮 (发布→点开→播完)...\n`);
    e2eScenario = await runE2EScenario(device, pkg, component, opts, rawDir, deviceMeta, defaultTapPoint.x, defaultTapPoint.y);
  }

  // =========================================================================
  // 组装报告
  // =========================================================================
  const report = {
    schema: "unimaker.device_perf_oracle.v3",
    generatedAt: new Date().toISOString(),
    tool: "unimaker-device-perf-oracle.mjs",
    device: deviceMeta,
    apk: {
      ...apkMeta,
      activity: opts.activity,
      launchComponent: component,
    },
    markers: {
      logcatTag: TAG,
      initBeginMarker: MARK_INIT_BEGIN,
      initDoneMarker: MARK_INIT_DONE,
      frameMarker,
      presentGpuAvailable,
      touchMarker: "input_touch",
      tapReactionT0Marker: "tap_trace t0",
      tapReactionT1Marker: "tap_trace t1",
      tapReactionT2Marker: "tap_trace t2",
      publishT0Marker: "publish_trace t_pub0 kind=",
      publishT1Marker: "publish_trace t_pub1 kind=",
      publishT2Marker: "publish_trace t_pub2 content_id=",
      mediaSurfacePosterMarker: RE_MEDIA_SURFACE_POSTER.source,
      mediaSurfaceVideoMarker: RE_MEDIA_SURFACE_VIDEO.source,
      mediaPlaybackFrameMarker: "media_playback_frame",
      mediaPlaybackEosMarker: "media_playback_eos",
    },
    coldStart,
    firstFrame,
    frameCadence,
    touchLatency,
    openToFirstFrame,
    tapReactionTrace,
    publishTrace,
    openToFirstMediaFrame,
    playbackSmoothness,
    e2eScenario,
    // 门禁字段: 本轮只立基线, thresholds 全空, gate 未评估(结构保留)
    thresholds: {
      coldStartMedianMs: null,
      firstFrameMedianMs: null,
      frameCadenceP95Ms: null,
      touchLatencyP50Us: null,
    },
    gate: {
      evaluated: false,
      pass: null,
    },
    notes,
    rawLogs: {
      dir: rawDir,
      cold: coldRuns.map((r) => r.rawLog),
      cadence: cadenceRaw,
      touch: touchRaw,
      e2e: e2eScenario ? e2eScenario.rounds.map((r) => r.rawLog) : [],
    },
  };

  const reportPath = join(outDir, "device-perf-oracle.json");
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");

  printSummary(report, reportPath);
  restoreTouchTrace();
  process.removeListener("exit", restoreTouchTrace);
  restoreMediaTrace();
  process.removeListener("exit", restoreMediaTrace);
}

// ---------------------------------------------------------------------------
// 人读摘要
// ---------------------------------------------------------------------------
function printSummary(r, reportPath) {
  const L = [];
  L.push("");
  L.push("================ UniMaker 设备性能基线 ================");
  L.push(`设备:   ${r.device.model || "?"} (${r.device.serial}) Android ${r.device.androidRelease || "?"} / SDK ${r.device.sdk || "?"}`);
  if (r.device.screen) L.push(`屏幕:   ${r.device.screen.widthPx}x${r.device.screen.heightPx}`);
  L.push(`APK:    ${r.apk.package} v${r.apk.versionName || "?"} (code ${r.apk.versionCode || "?"})  更新 ${r.apk.lastUpdateTime || "?"}`);
  L.push(`帧标记: ${r.markers.frameMarker}  (present_gpu 可用=${r.markers.presentGpuAvailable})`);
  L.push("");

  // 冷启动
  if (r.coldStart.available) {
    L.push(`冷启动(app_init_begin→init_done):  median ${r.coldStart.medianMs}ms  [min ${r.coldStart.minMs} / max ${r.coldStart.maxMs}]  (${r.coldStart.okCount}/${r.coldStart.runs.length} 成功)`);
    L.push(`  逐次: ${r.coldStart.runs.map((x) => (x.ok ? `${x.coldInitMs}ms` : "失败")).join("  ")}`);
  } else {
    L.push("冷启动:  unavailable (无有效 init 标记)");
  }

  // 首帧
  if (r.firstFrame.available) {
    L.push(`首帧(→${r.firstFrame.marker}):  median ${r.firstFrame.medianMs}ms  [min ${r.firstFrame.minMs} / max ${r.firstFrame.maxMs}]`);
  } else {
    L.push("首帧:  unavailable");
  }

  // 帧节奏
  if (r.frameCadence.available) {
    L.push(`帧节奏(静置 ${r.frameCadence.windowMs}ms, ${r.frameCadence.marker}):  p50 ${r.frameCadence.p50Ms}ms  p95 ${r.frameCadence.p95Ms}ms  max ${r.frameCadence.maxMs}ms  (${r.frameCadence.frameCount} 帧 / ${r.frameCadence.intervalCount} 间隔)`);
  } else {
    L.push(`帧节奏:  unavailable (${r.frameCadence.frameCount} 帧, 间隔样本不足)`);
    if (r.frameCadence.note) L.push(`  说明: ${r.frameCadence.note}`);
  }

  // 触摸
  if (r.touchLatency.available) {
    L.push(`触摸延迟(input_touch dur_us):  p50 ${r.touchLatency.p50Us}us  max ${r.touchLatency.maxUs}us  (${r.touchLatency.sampleCount} 样本)`);
    for (const act of Object.keys(r.touchLatency.byAction)) {
      const b = r.touchLatency.byAction[act];
      L.push(`  ${b.label}(action=${act}):  p50 ${b.p50Us}us  max ${b.maxUs}us  (${b.count})`);
    }
  } else {
    L.push("触摸延迟:  unavailable (input_touch 未出现)");
  }

  // tap→首帧 秒开 拆段
  if (r.openToFirstFrame && r.openToFirstFrame.available) {
    L.push(`tap→首帧 秒开(open_to_first_frame):  median total ${r.openToFirstFrame.medianTotalMs}ms  [min ${r.openToFirstFrame.minTotalMs} / max ${r.openToFirstFrame.maxTotalMs}]  (${r.openToFirstFrame.sampleCount} 次开)`);
    for (const s of r.openToFirstFrame.samples) {
      L.push(`  route=${s.route}: total ${s.totalMs}ms = spawn ${s.spawnMs} + dial ${s.dialMs} + index ${s.indexMs} + fetch_decode ${s.fetchDecodeMs} + present ${s.presentMs}`);
    }
  } else {
    L.push("tap→首帧 秒开:  unavailable (本轮未 tap 进全屏视频, 接线已就绪)");
  }

  // tap→首帧拆段 t0/t1/t2 (v2)
  if (r.tapReactionTrace && r.tapReactionTrace.available) {
    const t = r.tapReactionTrace;
    L.push(`tap→首帧拆段(t0 tap→t1 paint就绪→t2 present):  t0→t2 median ${t.t0ToT2.medianMs ?? "n/a"}ms  (${t.sampleCount} 次 tap)`);
    L.push(`  t0→t1(状态处理+paint重建):  median ${t.t0ToT1.medianMs ?? "n/a"}ms  [min ${t.t0ToT1.minMs ?? "n/a"} / max ${t.t0ToT1.maxMs ?? "n/a"}]`);
    L.push(`  t1→t2(atlas上传+present提交):  median ${t.t1ToT2.medianMs ?? "n/a"}ms  [min ${t.t1ToT2.minMs ?? "n/a"} / max ${t.t1ToT2.maxMs ?? "n/a"}]`);
  } else {
    L.push("tap→首帧拆段:  unavailable (本轮未出现 tap_trace t0, 接线已就绪)");
  }

  // v3: 发布拆段 t_pub0/t_pub1/t_pub2
  if (r.publishTrace && r.publishTrace.available) {
    const p = r.publishTrace;
    L.push(`发布拆段(t_pub0→t_pub2):  median ${p.tPub0ToTPub2.medianMs ?? "n/a"}ms  (${p.sampleCount} 次发布)`);
    L.push(`  t_pub0→t_pub1(FFI 入队/秒发达成点):  median ${p.tPub0ToTPub1.medianMs ?? "n/a"}ms`);
    L.push(`  t_pub1→t_pub2(GUI 收到回传确认):  median ${p.tPub1ToTPub2.medianMs ?? "n/a"}ms`);
  } else {
    L.push("发布拆段:  unavailable (publishbridge 埋点未接线, 见文件头约定, 预期非回归)");
  }

  // v3: tap→首媒体帧(poster/video)
  if (r.openToFirstMediaFrame && r.openToFirstMediaFrame.available) {
    const m = r.openToFirstMediaFrame;
    L.push(`tap→首媒体帧:  poster median ${m.poster.medianMs ?? "n/a"}ms (${m.poster.sampleCount})  video median ${m.video.medianMs ?? "n/a"}ms (${m.video.sampleCount})`);
  } else {
    L.push("tap→首媒体帧:  unavailable (被动窗口未见 tap 命中视频卡)");
  }
  if (r.openToFirstMediaFrame && r.openToFirstMediaFrame.ambiguousCount > 0) {
    L.push(`  ambiguous: ${r.openToFirstMediaFrame.ambiguousCount} 次(候选媒体就绪日志已被更早 tap 认领, 未静默归属)`);
  }

  // v3: 播放平滑度
  if (r.playbackSmoothness && r.playbackSmoothness.available) {
    for (const s of r.playbackSmoothness.sessions) {
      L.push(`播放平滑度(asset=${s.assetCid} 会话#${s.sessionIndex}):  p50 ${s.p50Ms}ms  p95 ${s.p95Ms}ms  max ${s.maxMs}ms  stall(>${s.stallThresholdMs}ms) ${s.stallCount}  播完=${s.playbackComplete}  (${s.frameCount} 帧)`);
    }
  } else {
    L.push("播放平滑度:  unavailable (被动窗口未覆盖播放, 用 --e2e-rounds 采集)");
  }

  // v3: E2E 一键剧本验收表
  if (r.e2eScenario) {
    const e = r.e2eScenario;
    L.push("");
    L.push(`E2E 剧本(${e.roundCount} 轮) 验收表:`);
    L.push(`  发布 ≤${e.acceptance.publish.targetMs}ms:  median ${e.acceptance.publish.medianMs ?? "n/a(unavailable)"}  pass=${e.acceptance.publish.pass ?? "n/a"}`);
    L.push(`  秒开 ≤${e.acceptance.open.targetMs}ms:  median ${e.acceptance.open.medianMs ?? "n/a(unavailable)"}  pass=${e.acceptance.open.pass ?? "n/a"}`);
    L.push(`  stall=0:  total ${e.acceptance.stall.totalAcrossRounds ?? "n/a"}  pass=${e.acceptance.stall.pass ?? "n/a"}`);
    L.push(`  播放完整:  all ${e.acceptance.playbackComplete.allRoundsComplete ?? "n/a"}  pass=${e.acceptance.playbackComplete.pass ?? "n/a"}`);
  }

  if (r.notes.length) {
    L.push("");
    L.push("注意:");
    for (const n of r.notes) L.push(`  - ${n}`);
  }
  L.push("");
  L.push(`报告 JSON: ${reportPath}`);
  L.push(`原始 logcat: ${r.rawLogs.dir}`);
  L.push("======================================================");
  L.push("");
  process.stdout.write(L.join("\n") + "\n");
}

// ---------------------------------------------------------------------------
// 导出纯解析函数供离线单测(unimaker-device-perf-oracle.v3.test.mjs)直接 import,
// 不需要 adb/真机。仅当作为 CLI 直接执行时才跑 main() (adb 交互)。
// ---------------------------------------------------------------------------
export {
  parseLines,
  collectTapReactionSamples,
  collectOpenToFirstFrame,
  collectPublishTrace,
  collectOpenToFirstMediaFrame,
  collectPlaybackSmoothness,
  pickCardOpenFrameSample,
  RE_PUB_T0,
  RE_PUB_T1,
  RE_PUB_T2,
};

const isMainModule = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMainModule) {
  main().catch((e) => {
    process.stderr.write(`[perf-oracle] 未处理异常: ${e && e.stack ? e.stack : e}\n`);
    process.exit(1);
  });
}
