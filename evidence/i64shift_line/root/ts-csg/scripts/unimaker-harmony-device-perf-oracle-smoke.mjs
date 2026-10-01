#!/usr/bin/env node
// unimaker-harmony-device-perf-oracle-smoke.mjs
//
// 离线单测: 对 ts-csg/fixtures/harmony-hilog/ 下 4 组 hilog 夹具跑
// unimaker-harmony-device-perf-oracle.mjs --parse-file, 断言解析结果。
// 不需要设备/hdc, 纯文本 fixture -> JSON 报告的黑盒校验, 覆盖:
//   1) 发布成功 + 播放(local+network 两条 open_to_first_frame) + 耐力行 —— 全量正常路径
//   2) 发布 t0 后立即校验失败 —— t1/t2 都 unavailable, 不是错误是诚实空
//   3) 发布到 t1 但 port/cid 5s 轮询超时 —— t2 unavailable
//   4) 全程没有发布, 只有播放(两次开, 一次触发 stall 耐力上报) —— publishTrace.available=false
//
// 用法: node scripts/unimaker-harmony-device-perf-oracle-smoke.mjs

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const oraclePath = join(scriptDir, "unimaker-harmony-device-perf-oracle.mjs");
const fixturesDir = resolve(scriptDir, "..", "fixtures", "harmony-hilog");

let failures = 0;
let checks = 0;

function check(label, cond) {
  checks++;
  if (!cond) {
    failures++;
    process.stderr.write(`[FAIL] ${label}\n`);
  } else {
    process.stdout.write(`[ok]   ${label}\n`);
  }
}

function runFixture(name) {
  const outDir = mkdtempSync(join(tmpdir(), "harmony-perf-oracle-smoke-"));
  const fixturePath = join(fixturesDir, name);
  execFileSync("node", [oraclePath, "--parse-file", fixturePath, "--out-dir", outDir], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const report = JSON.parse(readFileSync(join(outDir, "harmony-device-perf-oracle.json"), "utf8"));
  rmSync(outDir, { recursive: true, force: true });
  return report;
}

// -----------------------------------------------------------------------
// 1) 全量正常路径
// -----------------------------------------------------------------------
{
  const r = runFixture("publish-success-and-playback.hilog");
  check("schema tag", r.schema === "unimaker.harmony_device_perf_oracle.v1");
  check("publish available", r.publishTrace.available === true);
  check("publish sampleCount=1", r.publishTrace.sampleCount === 1);
  const s = r.publishTrace.samples[0];
  check("publish kind=video", s.kind === "video");
  check("publish t1 available", s.t1Available === true);
  check("publish t2 available", s.t2Available === true);
  check("publish content_id captured", s.contentId === "8f2a9c1e4b7d0356a1c8e2f4b6d9a0c37e5f1b2d4a6c8e0f2b4d6a8c0e2f4b6d");
  check("publish t0->t1 ~66ms", Math.abs(s.t0ToT1Ms - 66) < 1);
  check("publish t1->t2 ~579ms", Math.abs(s.t1ToT2Ms - 579) < 1);
  check("firstMediaFrame available", r.firstMediaFrame.available === true);
  check("firstMediaFrame sampleCount=1", r.firstMediaFrame.sampleCount === 1);
  check("firstMediaFrame route=44 total=812", r.firstMediaFrame.samples[0].route === 44 && r.firstMediaFrame.samples[0].totalMs === 812);
  check("playbackEndurance available", r.playbackEndurance.available === true);
  check("playbackEndurance reason=eos", r.playbackEndurance.samples[0].reason === "eos");
}

// -----------------------------------------------------------------------
// 2) t0 后立即校验失败 (t1/t2 都拿不到, 诚实 unavailable 不是崩溃)
// -----------------------------------------------------------------------
{
  const r = runFixture("publish-validation-fail.hilog");
  check("validation-fail: publish available (t0 存在)", r.publishTrace.available === true);
  const s = r.publishTrace.samples[0];
  check("validation-fail: t1 unavailable", s.t1Available === false);
  check("validation-fail: t2 unavailable", s.t2Available === false);
  check("validation-fail: t0ToT1Ms null", s.t0ToT1Ms === null);
  check("validation-fail: t0ToT2Ms null", s.t0ToT2Ms === null);
  check("validation-fail: contentId null", s.contentId === null);
  check("validation-fail: firstMediaFrame unavailable", r.firstMediaFrame.available === false);
}

// -----------------------------------------------------------------------
// 3) t0+t1 但 port/cid 轮询超时, 从未到 t2
// -----------------------------------------------------------------------
{
  const r = runFixture("publish-port-timeout.hilog");
  const s = r.publishTrace.samples[0];
  check("port-timeout: kind=image", s.kind === "image");
  check("port-timeout: t1 available", s.t1Available === true);
  check("port-timeout: t2 unavailable", s.t2Available === false);
  check("port-timeout: t1ToT2Ms null", s.t1ToT2Ms === null);
  check("port-timeout: t0ToT2Ms null", s.t0ToT2Ms === null);
}

// -----------------------------------------------------------------------
// 4) 全程无发布, 只有播放 (两次开 + 一次 stall 耐力上报)
// -----------------------------------------------------------------------
{
  const r = runFixture("playback-only-no-publish.hilog");
  check("playback-only: publishTrace unavailable", r.publishTrace.available === false);
  check("playback-only: publishTrace sampleCount=0", r.publishTrace.sampleCount === 0);
  check("playback-only: firstMediaFrame sampleCount=2", r.firstMediaFrame.sampleCount === 2);
  check("playback-only: route14 total=1994", r.firstMediaFrame.samples[0].route === 14 && r.firstMediaFrame.samples[0].totalMs === 1994);
  check("playback-only: route44 total=205", r.firstMediaFrame.samples[1].route === 44 && r.firstMediaFrame.samples[1].totalMs === 205);
  check("playback-only: endurance reason=stall_watchdog", r.playbackEndurance.samples[0].reason === "stall_watchdog");
  check("playback-only: endurance stallN=3", r.playbackEndurance.samples[0].stallN === 3);
}

// -----------------------------------------------------------------------
// 5) 双击发布边界 (对抗复核实测场景): 第二条 t_pub0 是被 s_publish_started 门禁拒绝的
//    孤立 tap, 真实 t_pub2 晚于它到达 —— 认领式配对必须把 t2 归给第一个样本, 不许漏接。
// -----------------------------------------------------------------------
{
  const r = runFixture("publish-double-tap-gate.hilog");
  check("double-tap: sampleCount=2", r.publishTrace.sampleCount === 2);
  const s0 = r.publishTrace.samples[0];
  const s1 = r.publishTrace.samples[1];
  check("double-tap: 样本0 t1 available", s0.t1Available === true);
  check("double-tap: 样本0 t2 认领成功(不被第二条 t0 截断)", s0.t2Available === true);
  check("double-tap: 样本0 contentId 拿到", s0.contentId === "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef");
  check("double-tap: 样本0 t0ToT2Ms=2900", s0.t0ToT2Ms === 2900);
  check("double-tap: 样本1(门禁拒绝) t1 诚实 false", s1.t1Available === false);
  check("double-tap: 样本1 t2 诚实 false", s1.t2Available === false);
  check("double-tap: 无孤儿 t2", r.publishTrace.orphanedT2Count === 0);
  check("double-tap: 无 warnings", r.publishTrace.warnings.length === 0);
}

// -----------------------------------------------------------------------
// 6) 孤儿 t2 (无任何 t0): 绝不静默消失, 必须显式 orphaned + warning。
// -----------------------------------------------------------------------
{
  const r = runFixture("publish-orphan-t2.hilog");
  check("orphan-t2: sampleCount=0", r.publishTrace.sampleCount === 0);
  check("orphan-t2: orphanedT2Count=1", r.publishTrace.orphanedT2Count === 1);
  check("orphan-t2: warning 存在", r.publishTrace.warnings.length === 1 && r.publishTrace.warnings[0].includes("orphaned t_pub2"));
}

process.stdout.write(`\n${checks - failures}/${checks} 断言通过\n`);
if (failures > 0) {
  process.stderr.write(`${failures} 项失败\n`);
  process.exit(1);
}
