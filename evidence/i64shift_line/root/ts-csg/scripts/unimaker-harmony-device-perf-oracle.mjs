#!/usr/bin/env node
// unimaker-harmony-device-perf-oracle.mjs
//
// HarmonyOS 真机互测仪表采集器 (schema unimaker.harmony_device_perf_oracle.v1)。
// 与 unimaker-device-perf-oracle.mjs (Android/adb logcat) 是同一诚实-null 惯例的镜像,
// 但采集通道是 hdc hilog (非 adb logcat), 标记集是 Harmony 侧新增的互测三点:
//
//   - 发布链 publish_trace: t_pub0 (native 桥收到发布 tap) -> t_pub1 (本地素材就绪,
//     交给 serve 线程前) -> t_pub2 (ephemeral port + content-addressable cid 都确认,
//     对端可 dial 拉取)。字段名/marker 文本与 Android JNI 桥 (mobile_shell_codegen.cheng
//     cheng_host_publish) 严格对齐, 三点 tag 都用 "cheng-mobile-shell" 以复用同一份
//     解析逻辑。见 platform/harmony/ChengGuiDemo/entry/src/main/cpp/cheng_gui_host.c。
//   - 首帧 open_to_first_frame: Harmony 侧耐力 oracle 已有的等价标记 (tag=ChengMD,
//     经 cheng_media_diag() 统一出口, 用 %{public}s 因此不被隐私遮罩), 直接复用
//     unimaker-device-perf-oracle.mjs 里的同一正则 (RE_OPEN_TO_FIRST_FRAME), 不重复埋点。
//     它比 Android 侧的 first_media_frame(单个 t_ms 时间戳, 需外部再和 tap_trace 做减法)
//     语义更强: 应用内已经把 spawn/dial/index/fetch_decode/present 五段延迟都算好、
//     一行报出 total_ms, 这里只是原样采集。
//   - unimaker.playback_endurance.v1: 同一 ChengMD 出口的耐力统计行, 顺手一并采集。
//
// 关键实测陷阱 (2026-07-10, 见 v3-hstate-evidence.md/v3-hinstr-evidence.md):
//   * 这台设备/这版 hdc 不支持 `hilog -p off` 关隐私遮罩 ([CODE: -68])。所有非
//     `%{public}...}` 格式化字段恒显示为 <private>——包括 %d 数字字段, 不只是 %s
//     字符串字段。本采集器只解析走 %{public} 通道的行 (publish_trace 三点已改用
//     %{public}s; open_to_first_frame/playback_endurance 走 ChengMD/cheng_media_diag,
//     两者从来源头就是 %{public}s), 别的字段本来就读不到明文, 不在本采集器解析范围。
//   * `hdc hilog -r` (不带 shell) 会挂起不返回, 必须 `hdc shell hilog -r`。
//   * hdc 默认不在 PATH, 用 --hdc 指定完整路径 (DevEco Studio 自带路径见 --help)。
//
// 用法 (真机流式采集, 采集窗口内手动操作 GUI 完成一次发布+点卡播放):
//   node scripts/unimaker-harmony-device-perf-oracle.mjs --device 3KN0224C18003262 \
//     --out-dir tmp/harmony-perf-current --window-ms 60000
//
// 用法 (离线解析: 对已有的 hilog 转储文件跑同一套解析, 不需要设备):
//   node scripts/unimaker-harmony-device-perf-oracle.mjs --parse-file capture.log --out-dir tmp/x
//
// 幂等可重跑; 设备不在线/hdc 不可用 -> 明确报错并以非 0 退出 (--parse-file 模式不需要设备)。

import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, createWriteStream, readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";

const DEFAULT_HDC = "/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony/toolchains/hdc";
const DEFAULT_TAGS = ["cheng-mobile-shell", "ChengMD", "ChengCHT"];

// ---------------------------------------------------------------------------
// 标记正则 (publish_trace 三点是本次新埋; open_to_first_frame 与 Android 侧
// unimaker-device-perf-oracle.mjs 的 RE_OPEN_TO_FIRST_FRAME 逐字节相同, 复用不新造)
// ---------------------------------------------------------------------------
const RE_PUB_T0 = /publish_trace t_pub0 kind=(\S*)/;
const RE_PUB_T1 = /publish_trace t_pub1 kind=(\S*)/;
const RE_PUB_T2 = /publish_trace t_pub2 content_id=(\S*)/;
const RE_OPEN_TO_FIRST_FRAME =
  /open_to_first_frame route=(-?\d+) total_ms=(-?\d+) spawn_ms=(-?\d+) dial_ms=(-?\d+) index_ms=(-?\d+) fetch_decode_ms=(-?\d+) present_ms=(-?\d+)/;
const RE_PLAYBACK_ENDURANCE =
  /unimaker\.playback_endurance\.v1 route=(-?\d+) reason=(\S+) present_n=(\d+) p50_ms=([\d.]+) p95_ms=([\d.]+) stall_n=(\d+) es_sink_rate=([\d.]+) rss_kb=(-?\d+) rss_slope_kb_s=(-?[\d.]+) elapsed_s=([\d.]+)/;

// hdc hilog -v epoch 行格式:
//   "1783643478.867 24658 24658 I A0C0DE/com.example.unimaker/cheng-mobile-shell: <message>"
// (epoch秒.毫秒) (pid) (tid) (level) (domain)/(bundle)/(tag): (message)
const RE_EPOCH_LINE = /^\s*(\d+\.\d+)\s+\d+\s+\d+\s+([A-Z])\s+[^/\s]+\/[^/\s]+\/([^:\s]+):\s?(.*)$/;

// ---------------------------------------------------------------------------
// CLI 解析
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const opts = {
    hdc: DEFAULT_HDC,
    device: null,
    outDir: null,
    windowMs: 60000,
    tags: DEFAULT_TAGS.join(","),
    parseFile: null,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) fail(`选项 ${a} 缺少参数值`);
      return v;
    };
    switch (a) {
      case "--hdc": opts.hdc = next(); break;
      case "--device": opts.device = next(); break;
      case "--out-dir": opts.outDir = next(); break;
      case "--window-ms": opts.windowMs = parseInt(next(), 10); break;
      case "--tags": opts.tags = next(); break;
      case "--parse-file": opts.parseFile = next(); break;
      case "-h":
      case "--help": printHelp(); process.exit(0); break;
      default: fail(`未知选项: ${a}`);
    }
  }
  if (!opts.outDir) fail("必须提供 --out-dir <dir>");
  return opts;
}

function printHelp() {
  process.stdout.write(
    [
      "unimaker-harmony-device-perf-oracle — HarmonyOS 真机互测仪表采集器 (hdc hilog)",
      "",
      "真机流式采集:",
      "  node scripts/unimaker-harmony-device-perf-oracle.mjs --device <serial> --out-dir <dir> [--window-ms 60000]",
      "  采集窗口内需手动操作 GUI: 发布一个视频 + 点卡进全屏播放, 脚本被动采集不驱动 UI",
      "  (设备 SELinux 禁 CLI 自动化, 见环境事实; --window-ms 内脚本只监听不注入触摸)。",
      "",
      "离线解析 (夹具/单测用, 不需要设备):",
      "  node scripts/unimaker-harmony-device-perf-oracle.mjs --parse-file <hilog.log> --out-dir <dir>",
      "",
      "选项:",
      "  --hdc <path>       hdc 可执行文件路径 (默认 DevEco Studio 自带路径)",
      "  --device <serial>  hdc 目标设备序列号 (省略则用 hdc 默认目标)",
      "  --out-dir <dir>    报告 + 原始 hilog 输出目录 (必填)",
      "  --window-ms <ms>   真机采集窗口时长 (默认 60000)",
      `  --tags <a,b,c>     hilog -T 过滤标签 (默认 ${DEFAULT_TAGS.join(",")})`,
      "  --parse-file <f>   离线解析已有 hilog 转储 (跳过设备采集)",
      "",
    ].join("\n") + "\n",
  );
}

function fail(msg) {
  process.stderr.write(`[harmony-perf-oracle] 错误: ${msg}\n`);
  process.exit(2);
}

// ---------------------------------------------------------------------------
// hdc 辅助
// ---------------------------------------------------------------------------
function hdcArgs(opts, args) {
  return opts.device ? ["-t", opts.device, ...args] : args;
}

function hdcTry(opts, args) {
  try {
    return { ok: true, out: execFileSync(opts.hdc, hdcArgs(opts, args), { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) };
  } catch (e) {
    return { ok: false, out: (e.stdout || "") + (e.stderr || ""), err: e };
  }
}

function preflightDevice(opts) {
  if (!existsSync(opts.hdc)) {
    fail(`hdc 不存在: ${opts.hdc} (用 --hdc 指定, 或确认 DevEco Studio 安装路径)`);
  }
  const list = hdcTry(opts, ["list", "targets"]);
  if (!list.ok) fail(`hdc list targets 失败: ${list.out.trim()}`);
  const targets = list.out.split("\n").map((l) => l.trim()).filter(Boolean).filter((l) => l !== "[Empty]");
  if (targets.length === 0) fail("没有在线的 hdc 目标设备");
  if (opts.device && !targets.includes(opts.device)) {
    fail(`设备 ${opts.device} 不在线 (在线目标: [${targets.join(", ")}])`);
  }
  return { device: opts.device || targets[0], targets };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// 流式 hilog 捕获 (streaming, "hdc shell hilog -v epoch -T <tags>" 阻塞读+持续打印,
// 镜像 Android Capture 类的事件驱动写文件, 不轮询)
// ---------------------------------------------------------------------------
class HilogCapture {
  constructor(hdcPath, device, tags, filePath) {
    this.filePath = filePath;
    this.buffer = "";
    this.file = createWriteStream(filePath);
    const shellArgs = ["shell", "hilog", "-v", "epoch", "-T", tags];
    const args = device ? ["-t", device, ...shellArgs] : shellArgs;
    this.child = spawn(hdcPath, args, { stdio: ["ignore", "pipe", "ignore"] });
    this.child.stdout.setEncoding("utf8");
    this.child.stdout.on("data", (chunk) => {
      this.buffer += chunk;
      this.file.write(chunk);
    });
    this.stopped = false;
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

// ---------------------------------------------------------------------------
// 解析
// ---------------------------------------------------------------------------
function parseLines(text) {
  const out = [];
  for (const line of text.split("\n")) {
    const m = line.match(RE_EPOCH_LINE);
    if (m) out.push({ ts: parseFloat(m[1]), level: m[2], tag: m[3], msg: m[4] });
  }
  return out;
}

// publish_trace 三点关联。关键前提差异 (与 Android tap_trace 不同, 不能照抄其窗口算法):
// 鸿蒙 native 侧 t_pub0 打在 s_publish_started 门禁检查【之前】(cheng_gui_host.c 无条件首行),
// 所以"发布中再点一次发布"会产生一条被门禁拒绝、永远没有 t1/t2 的孤立 t_pub0。
// 认领式配对:
//  - t1: 在 [t0, min(下一条 t0, t0+capMs)] 内找最近【未被认领】的 t1 —— t1 与 t0 属同一次
//    同步 native 调用, 毫秒级间隔, 不会跨越第二次 tap, next-t0 截断安全且防跨样本误配。
//  - t2: 在 [t1, t0+capMs] 内找最近【未被认领】的 t2, 【不被下一条 t0 截断】—— t2 靠 ~100ms
//    轮询上报, 可晚数秒, 中间完全可能插进一条被门禁拒绝的 t_pub0; 按 next-t0 截断会把真实
//    t2 两头漏接(前一样本够不到, 后一样本没有 t1 不去找), 把成功发布伪报成超时。
//    真发布串行性由门禁保证(in-flight 期间新 tap 直接 return), 不存在两路真 t2 乱序竞争。
//  - 扫尾: 任何未被认领的 t1/t2 显式计入 orphaned 并给 warning —— 绝不静默消失。
// t1/t2 缺失是诚实结果(路径校验失败在 t0 后立刻 return; port/cid 轮询超时), 逐样本标
// available, 不用 0 填充伪造。
function collectPublishTrace(lines, capMs = 15000) {
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
    const kind = t0.msg.match(RE_PUB_T0)[1];
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
      kind,
      t0TsEpoch: t0.ts,
      t1Available: !!t1,
      t2Available: !!t2,
      contentId: t2 ? t2.msg.match(RE_PUB_T2)[1] : null,
      t0ToT1Ms: t1 ? round2((t1.ts - t0.ts) * 1000) : null,
      t1ToT2Ms: t1 && t2 ? round2((t2.ts - t1.ts) * 1000) : null,
      t0ToT2Ms: t2 ? round2((t2.ts - t0.ts) * 1000) : null,
    });
  }
  const orphanedT1Count = t1Claimed.filter((c) => !c).length;
  const orphanedT2Count = t2Claimed.filter((c) => !c).length;
  const warnings = [];
  if (orphanedT1Count > 0)
    warnings.push(`orphaned t_pub1 x${orphanedT1Count}: 存在未被任何 t_pub0 认领的 t1 行, 配对可能失真, 请人工核对原始 hilog`);
  if (orphanedT2Count > 0)
    warnings.push(`orphaned t_pub2 x${orphanedT2Count}: 存在未被任何样本认领的 t2 行(真实发布结果被漏接), 请人工核对原始 hilog`);
  return { samples, orphanedT1Count, orphanedT2Count, warnings };
}

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

function collectPlaybackEndurance(lines) {
  const samples = [];
  for (const l of lines) {
    const m = l.msg.match(RE_PLAYBACK_ENDURANCE);
    if (!m) continue;
    samples.push({
      tsEpoch: l.ts,
      route: parseInt(m[1], 10),
      reason: m[2],
      presentN: parseInt(m[3], 10),
      p50Ms: parseFloat(m[4]),
      p95Ms: parseFloat(m[5]),
      stallN: parseInt(m[6], 10),
      esSinkRate: parseFloat(m[7]),
      rssKb: parseInt(m[8], 10),
      rssSlopeKbS: parseFloat(m[9]),
      elapsedS: parseFloat(m[10]),
    });
  }
  return samples;
}

const round2 = (v) => (v == null ? null : Math.round(v * 100) / 100);
function median(arr) {
  if (arr.length === 0) return null;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : round2((s[mid - 1] + s[mid]) / 2);
}

// ---------------------------------------------------------------------------
// 报告组装 (两种入口: 真机流式 / 离线解析都汇聚到这里, 结构完全一致)
// ---------------------------------------------------------------------------
function buildReport(rawText, meta) {
  const lines = parseLines(rawText);
  const publishCollect = collectPublishTrace(lines);
  const publishSamples = publishCollect.samples;
  const openFrameSamples = collectOpenToFirstFrame(lines).sort((a, b) => a.tsEpoch - b.tsEpoch);
  const enduranceSamples = collectPlaybackEndurance(lines).sort((a, b) => a.tsEpoch - b.tsEpoch);

  const t0ToT2Vals = publishSamples.map((s) => s.t0ToT2Ms).filter((v) => v != null);
  const openTotals = openFrameSamples.map((s) => s.totalMs).filter((v) => v >= 0);

  const publishTrace = {
    unit: "ms",
    markers: { t0: "publish_trace t_pub0", t1: "publish_trace t_pub1", t2: "publish_trace t_pub2" },
    sampleCount: publishSamples.length,
    samples: publishSamples,
    orphanedT1Count: publishCollect.orphanedT1Count,
    orphanedT2Count: publishCollect.orphanedT2Count,
    warnings: publishCollect.warnings,
    t0ToT2: {
      medianMs: median(t0ToT2Vals),
      minMs: t0ToT2Vals.length ? Math.min(...t0ToT2Vals) : null,
      maxMs: t0ToT2Vals.length ? Math.max(...t0ToT2Vals) : null,
    },
    available: publishSamples.length > 0,
    note:
      publishSamples.length === 0
        ? "本轮未出现 publish_trace t_pub0: 需在采集窗口内手动点发布按钮触发 cheng_host_publish (接线已就绪)"
        : "t0=native桥收到发布tap, t1=本地素材(poster)就绪/交给serve线程前, t2=port+cid 都确认对端可fetch (可能 unavailable: 路径校验失败在t0后立即return从未到t1, 或port/cid 5s轮询超时从未到t2)",
  };

  const firstMediaFrame = {
    unit: "ms",
    marker: "open_to_first_frame",
    mappingNote:
      "复用既有耐力 oracle 标记(cheng_gui_host.c, tag=ChengMD), 未新埋点; 语义上比 Android 的 " +
      "first_media_frame(单个 t_ms 时间戳, 需外部再减 tap_trace t0) 更强: total_ms 已经是应用内算好的 " +
      "tap→首帧 端到端延迟, 并自带 spawn/dial/index/fetch_decode/present 五段拆解",
    sampleCount: openFrameSamples.length,
    samples: openFrameSamples,
    medianTotalMs: median(openTotals),
    minTotalMs: openTotals.length ? Math.min(...openTotals) : null,
    maxTotalMs: openTotals.length ? Math.max(...openTotals) : null,
    available: openFrameSamples.length > 0,
    note:
      openFrameSamples.length === 0
        ? "本轮未出现 open_to_first_frame: 需在采集窗口内点卡进全屏视频路由触发一次真实解码播放"
        : "每次全屏视频冷开一条; total=spawn+dial+index+fetch_decode+present",
  };

  const playbackEndurance = {
    unit: "mixed",
    marker: "unimaker.playback_endurance.v1",
    sampleCount: enduranceSamples.length,
    samples: enduranceSamples,
    available: enduranceSamples.length > 0,
    note: enduranceSamples.length === 0 ? "本轮未出现耐力 oracle 行 (播放结束/周期上报时才发一次)" : null,
  };

  return {
    schema: "unimaker.harmony_device_perf_oracle.v1",
    generatedAt: new Date().toISOString(),
    tool: "unimaker-harmony-device-perf-oracle.mjs",
    channel: "hdc hilog",
    meta,
    markers: {
      publishT0Marker: "publish_trace t_pub0",
      publishT1Marker: "publish_trace t_pub1",
      publishT2Marker: "publish_trace t_pub2",
      firstFrameMarker: "open_to_first_frame",
      enduranceMarker: "unimaker.playback_endurance.v1",
      privacyMaskingNote:
        "本设备/此 hdc 版本不支持关闭 hilog 隐私遮罩; 只有 %{public} 格式化的字段能读到明文, " +
        "以上全部标记字段来源上都已用 %{public}, 未遮罩字段一律不在本采集器解析范围",
    },
    publishTrace,
    firstMediaFrame,
    playbackEndurance,
    notes: [],
  };
}

function printSummary(r, reportPath) {
  const L = [];
  L.push("");
  L.push("================ UniMaker Harmony 互测仪表 ================");
  L.push(`通道: ${r.channel}  设备: ${r.meta.device || "(离线解析)"}`);
  L.push("");
  if (r.publishTrace.available) {
    L.push(`发布链 publish_trace (t0→t2):  median ${r.publishTrace.t0ToT2.medianMs ?? "n/a"}ms  [min ${r.publishTrace.t0ToT2.minMs ?? "n/a"} / max ${r.publishTrace.t0ToT2.maxMs ?? "n/a"}]  (${r.publishTrace.sampleCount} 次发布)`);
    for (const s of r.publishTrace.samples) {
      L.push(`  kind=${s.kind}: t0→t1 ${s.t0ToT1Ms ?? "n/a"}ms  t1→t2 ${s.t1ToT2Ms ?? "n/a"}ms  content_id=${s.contentId ?? "n/a"}`);
    }
  } else {
    L.push(`发布链 publish_trace:  unavailable (${r.publishTrace.note})`);
  }
  L.push("");
  if (r.firstMediaFrame.available) {
    L.push(`首帧 open_to_first_frame:  median ${r.firstMediaFrame.medianTotalMs}ms  [min ${r.firstMediaFrame.minTotalMs} / max ${r.firstMediaFrame.maxTotalMs}]  (${r.firstMediaFrame.sampleCount} 次开)`);
    for (const s of r.firstMediaFrame.samples) {
      L.push(`  route=${s.route}: total ${s.totalMs}ms = spawn ${s.spawnMs} + dial ${s.dialMs} + index ${s.indexMs} + fetch_decode ${s.fetchDecodeMs} + present ${s.presentMs}`);
    }
  } else {
    L.push(`首帧 open_to_first_frame:  unavailable (${r.firstMediaFrame.note})`);
  }
  L.push("");
  if (r.playbackEndurance.available) {
    L.push(`耐力 playback_endurance:  ${r.playbackEndurance.sampleCount} 条`);
  } else {
    L.push("耐力 playback_endurance:  unavailable");
  }
  L.push("");
  L.push(`报告 JSON: ${reportPath}`);
  L.push("=============================================================");
  L.push("");
  process.stdout.write(L.join("\n") + "\n");
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------
async function main() {
  const opts = parseArgs(process.argv);
  const outDir = resolve(opts.outDir);
  const rawDir = join(outDir, "raw");
  mkdirSync(rawDir, { recursive: true });

  let rawText;
  let meta;

  if (opts.parseFile) {
    const p = resolve(opts.parseFile);
    if (!existsSync(p)) fail(`--parse-file 不存在: ${p}`);
    rawText = readFileSync(p, "utf8");
    meta = { mode: "offline-parse", sourceFile: p };
    process.stdout.write(`[harmony-perf-oracle] 离线解析 ${p}\n`);
  } else {
    const pre = preflightDevice(opts);
    process.stdout.write(`[harmony-perf-oracle] 设备 ${pre.device}\n`);
    process.stdout.write(`[harmony-perf-oracle] 清空 hilogd app 缓冲 (hdc shell hilog -r)...\n`);
    const clear = hdcTry(opts, ["shell", "hilog", "-r"]);
    if (!clear.ok) process.stdout.write(`[harmony-perf-oracle] 警告: 清空缓冲失败, 继续 (${clear.out.trim()})\n`);
    const rawPath = join(rawDir, "capture.log");
    process.stdout.write(
      `[harmony-perf-oracle] 流式采集 ${opts.windowMs}ms (标签 ${opts.tags})——现在请在设备上手动发布一段视频并点卡进全屏播放...\n`,
    );
    const cap = new HilogCapture(opts.hdc, pre.device, opts.tags, rawPath);
    await sleep(opts.windowMs);
    cap.stop();
    rawText = cap.buffer;
    meta = { mode: "live-capture", device: pre.device, windowMs: opts.windowMs, tags: opts.tags, rawLog: rawPath };
    process.stdout.write(`[harmony-perf-oracle] 采集结束, 原始 hilog: ${rawPath}\n`);
  }

  const report = buildReport(rawText, meta);
  const reportPath = join(outDir, "harmony-device-perf-oracle.json");
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
  printSummary(report, reportPath);
}

main().catch((e) => {
  process.stderr.write(`[harmony-perf-oracle] 未处理异常: ${e && e.stack ? e.stack : e}\n`);
  process.exit(1);
});
