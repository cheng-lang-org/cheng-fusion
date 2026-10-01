# VERIFY_merge_0906_append —— 战役 R 主树接管 + 三补丁合入 + GEN2 重探（主线程执行）

date_utc=2026-09-06 凌晨 · 执行=主线程（用户授权接管 wall154 遗留态） · 主树=/Users/lbcheng/cheng-lang · 备份=合入前全量在途 diff 存 /tmp/oob_ab/merge_0906/pre_merge.diff（3642 行）

## 结论先行

**三补丁合入主树全绿定谳：配对烤机 m1=m2=f0cf2f4d…（205/208s）、四夹具门 4/4 PASS rc=0（max 树峰 965MB<1GiB）。GEN2 自烤重探 385s 推进后被自身 1GiB RSS 守卫拦截（rss_limit_exceeded 1.147GiB>1GiB）——parse 代差墙已越，GEN2 现位正墙=资源守卫，与 memory-time-limits-plan 预言精确对位。**

## 一、接管与吸收定谳

1. **孤儿清理**：wall154 lane 两孤儿烤机（d1/d1q 自旋 9.3h/7.9h CPU、工作目录 6.5h 零活动、日志 0 字节、监壳已退）按 PID kill（含 4 个 0-CPU 父壳），ps 核实无残留。用户明示授权。
2. **l3b2 已被 lane 吸收**：对主树做签名验尸——S1-S4 五标识符（ReleaseInstructionWordsAfterFreeze / instructionWordsFrozenReleasedWordCount / NativeObjectEmissionPlanRelease / ReleaseRegallocEvidencePayloadsAfterObserve / primaryObjectCsgcObserveAppendText）全部在树，l3b2.patch 跳过不打。教训：从 patches/ 子目录跑 `git apply --check` 会忽略目录外路径=空枪检查，必须仓库根重检。
3. **batch2/time_exactmemo/stage2 验「未被吸收」后落地**：三签名（CargoReleaseContainerBytesAfterReplay / ExactDefFreezeIdentitySlotDefinitionIndexBuild / CHENG_COLD_PHASE_DIAG）grep=0，git apply 逐个干净落地。主树 45→48 文件、+2208/−263→+2525/−291。wall154 的 +229/−48 parser 在途 hunks 及其余在途工作**原样保留未动**。

## 二、合入验证门禁表

| 门 | 结果 | 证据 |
|---|---|---|
| 配对烤机确定性 | PASS | m1=m2 sha256=f0cf2f4dc2a3191f689506f58eb6ad01ecb28d88c171a3052e3c4cfb753452e5，wall 205/208s，maxrss 782.7/784.4MB（cheng_w126 车头口径，平台值与 l3b2 记录一致属预期） |
| 四夹具门 | **4/4 PASS，rc=0** | ordinary 0/0、call_fixture 0/1、cold_nested 0/0、v6 0/0，与 user_path_baseline.tsv 合同一致；max_process_tree_peak=965,476,352B < 1GiB 帽 |
| 合入脚本 | /tmp/oob_ab/merge_0906/merge_bake.sh | 全冷禁缓存口径（CHENG_DISABLE_COLD_OBJECT_CACHE=1 + 每轮新鲜缓存根） |

## 三、GEN2 自烤重探（合入驱动 f0cf2f4d 自编主树 35 条目闭包）

| 项 | 值 |
|---|---|
| 结果 | **385s 推进后被自身资源守卫拦截**：`compile_progress phase=resource_guard status=rss_limit_exceeded rss_bytes=1147127152 limit_bytes=1073741824` |
| 对照 | l3b2 时代 gen2/gen2b：rc=2 死 parse 墙（`ownership_body_ir_production if expression else missing`）仅 78/117s |
| 定谳 | ① parse 代差墙已越（wall152 修复 + wall154 在途 parser hunks + PhaseB 吸收工作合力）；② TIME 线报告的「>26min 不收敛」未在自烤路径复现——当前死因明确为 1GiB 守卫，非活锁；③ GEN2 现位正墙 = **自举驻留穿 1GiB**，即 memory-time-limits-plan 预言的「全驻留架构自举必穿守卫」 |
| 下一步含义 | Phase C 释放批次自此有了真实测量载体：R1/R2（emit 窗）已在合入驱动内但自烤峰在 admission/materialize 段，下一批释放正靶=materialize/admission 驻留（对齐 l3b2 平台画像的 40-90% 段与 typedIr 224MiB after-primary 已放后的残量） |
| 复跑 | `bash /tmp/oob_ab/merge_0906/gen2_probe.sh <tag> 900`（cwd 任意；驱动路径在脚本头） |

## 四、纪律记录

- 主树改动仅三补丁 hunks + 本回执与 findings 追加；在途 hunks（含 wall154 parser +229/−48）零回滚零覆盖；未 git commit。
- 合入前在途态全量备份 /tmp/oob_ab/merge_0906/pre_merge.diff。
- 孤儿 kill 按 PID 精确执行（无 pkill -f，防自匹配）；w154 工作目录证据保留未删。
- stage3=artifacts/bootstrap/cheng.stage3（8/31 官方件）；门禁全程未动 guard 预算。
