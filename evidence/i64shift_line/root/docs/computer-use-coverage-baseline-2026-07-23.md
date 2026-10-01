# Computer-Use 覆盖 + 视频三门 量化基线实测(2026-07-23)

只读测量,未改任何产品代码。测量机 macOS arm64,负载高(load avg ~12.9,门②时延类数值受此影响)。

## 1. R2C/CHT handler 编译率

命令:`node ts-csg/scripts/cht-measure.mjs <one-click产物目录>`(projectRoot 默认 /Users/lbcheng/UniMaker/React.js)。
当前最新 one-click 产物为 `ts-csg/tmp/mech19_impl_m19r1/run3`(2026-07-16 19:02,全量 47-route 场景;run1/run2 数值逐字相同)。

实测(run3):

```
invoke_sites_total_baseline=42
invoke_sites=12  (LIVE, post-compile)
invoke_sites_compiled_away=30
CHT_compiled=10 [handleSettingsToggle, handleVideoToggle, handleVideoMuteToggle,
  handleFullscreen, handleSendComment, handleLike, handleReport, handleCopyDid,
  handleCopyDidBackup, handleMouseUp]
remaining_uncompiled_unique=2
--- skip categories ---
  fv-unknown: 1   (handleClose  <-  fv-unknown:roomState)
  no-fid: 1       (() => onSelect(item.type)  <-  no-fid)
```

- **当前精确值:42 个 invoke 站点基线,30 个已编译消失(71.4%),12 个存活残留,归属 2 个唯一 handler;CHT 成功编译 10 个唯一 handler。**
- 对照产物 `ts-csg/tmp/p0-lang-probe`(2026-07-16 10:48):35 站点全部编译、0 残留(同 10 个 handler)。
- 口径说明:docs/computer_use_r2c_campaign.md:14 记的「27 个 computer-use handler 0 编译」是 2026-06-18 的 **3-route 场景**;现存产物均为全量 47-route 场景,数值不直接可比,但同一工具(cht-measure.mjs)同一口径下编译率已从 0% 提升到 71.4%(run3)/ 100%(p0-lang-probe)。

## 2. Computer-Use 覆盖三指标

产物:`ts-csg/tmp/mech19_impl_m19r1/run3/runtime/unimaker_computer_use_manifest.json`
(schema unimaker.computer_use_manifest.v1,与 unimaker-one-click.mjs:3575-3639 `writeComputerUseManifest` 同构;p0-lang-probe 产物数值逐字相同)。

- **task template 数 = 6**(源:ts-csg/src/csg-web.ts:268 `unimakerVoiceTaskTemplateSpecs`;manifest `voiceTaskTemplates=6` 一致),共 21 步:
  - publish_short_video_draft(4 步)、publish_ad_video_draft(4 步)、authorized_product_publish_draft(5 步)、purchase_assist_review(3 步)、content_search_review(1 步)、feed_filter_review(4 步)
- **动作词表 = 6 种**(csg-web.ts:2088 `controlActionKindFromProps`):Click、SetText、SetNumber、Select、Toggle、SelectFile。632 个 computer_use_action 的分布:Click 478、SetText 86、Select 30、SetNumber 27、SelectFile 6、Toggle 5。
- **control_surface 覆盖率 = 100%**:actionable DOM 控件 632 个,computer_use_action 632 个(`computerUseActionCoveragePercent=100`),voice 场景 632 个;confirmationGates=0、blockedSteps=0、ambiguousSteps=0、missingConfirmationGates=0、unimakerInternalTaskReady=true。

## 3. 视频三门门禁(media_moq_e2e_timing_gate.sh)当前状态:RED — 构建即失败

命令:`sh src/tests/media_moq_e2e_timing_gate.sh`(默认 CHENG=artifacts/bootstrap/cheng.stage3,资产四件套本机齐全)。

实测输出:

```
INFO: building moq_pub / moq_sub / es_sweep from current source tree...
FAIL: publisher build failed
cheng_cold: src/quic/native_runtime.cheng:1 (offset 0) call arg mismatch
  callee=connection_impl.MsQuicConnImplHasQueued expected=1 actual=1
cheng_cold: cold call arg mismatch (recovery=1 depth=2)
cheng_cold: reachable function body missing: native_runtime.msquicNativeFlushServerShortPacketsLoop
```

逐一验证(均 rc=2,确定性失败;src/quic、src/tests/media_* 在 git 工作树中均无本地改动,失败发生在 HEAD=bab6fcaa 状态):

| 编译器 | 时间 | publisher 构建结果 |
| --- | --- | --- |
| artifacts/bootstrap/cheng.stage3(门禁默认) | 07-18 | call arg mismatch + `msquicNativeFlushServerShortPacketsLoop` 函数体缺失 |
| artifacts/bootstrap-cold/cheng.stage3 | 07-20 | indexed field assignment unsupported + `msquicConnImplStoreSetFlow` 函数体缺失 |
| artifacts/backend_driver/cheng | 07-21 | 同上 |

moq_sub、es_sweep 同样失败(同一 `msquicNativeFlushServerShortPacketsLoop` 缺失)。**门①②③当前均无实测值**。背景:HEAD 07-22 的 8313dae3 大改了 bootstrap/cheng_cold.c(+4041 行),现存全部 driver 均早于该提交;8517ea58 提交信息亦注明 pinned stage3 种子不含 F07 跨模块修复。门禁恢复需先用当前源重烤 driver,不在本次只读测量范围。

门②附加状态:本机无基线文件 `$TMPDIR/cheng_media_moq_e2e_gate_baseline.tsv`,即使能构建,未显式 `GATE_BASELINE_SEED=1` 也会 FAIL-by-policy;当前机器高负载,不宜落基线。

历史最近一次实测(2026-07-06,记于 docs/cheng-video-e2e-miaofa-miaokai-plan.md,仅供参考):门① 麦田 publish_total_ms=944ms(≤1000ms 达标);门② connect_dial=563ms(ECDSA 杠杆后);门③数值未见落账。

## 数字汇总

| 指标 | 当前值 | 来源 |
| --- | --- | --- |
| CHT invoke 站点基线 / 已编译 / 残留 | 42 / 30(71.4%)/ 12(2 个唯一 handler) | cht-measure run3 |
| CHT 编译成功唯一 handler | 10 | cht-measure run3 |
| task template 数 / 总步数 | 6 / 21 | csg-web.ts:268 + manifest |
| 动作词表 | 6 种(Click/SetText/SetNumber/Select/Toggle/SelectFile) | csg-web.ts:2088 |
| control_surface 覆盖率 | 100%(632/632) | manifest |
| 视频门①②③ | 无实测值,门禁构建阶段 RED(3 个现存编译器全部失败) | timing_gate 实测 |
