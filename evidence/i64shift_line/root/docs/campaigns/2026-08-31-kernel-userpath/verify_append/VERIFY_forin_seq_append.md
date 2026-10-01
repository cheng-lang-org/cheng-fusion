# VERIFY_forin_seq_append —— [FORIN-SEQ] 之一：seq 桥重对位合入（扩编步）——原两件 patch 对现主树不可重放（primary hunk5 上下文漂移+backend2 已等价在位），克隆内重对位落地并配对烤机 ×2 sha EQ 自证，v3 两件 patch 交收割；功能抽检 min1/min2/probe_array 0/0 pass，probe_builtin_len 经基线对照炉实证为 m58 后既有红（非桥引入）；附 scratch scope 链接缺陷定性；for-in 主体待主线程收割后开跑

date_utc=2026-09-09 · 代理=FORIN-SEQ 线 · 工作克隆=/Users/lbcheng/cheng-f24/forin（cp -cR 自主树 2026-09-09 现态含 parseperf 在飞工作树 hunks，进场即 commit 基线 16871b54b；桥态 commit 4cb29f703，+424/-5） · 烤机壳=克隆 .w/fo_bake.sh（车头 /tmp/cheng_cold_v2 sha 7f731d4dfa… 同 seqbridge，ROOT=forin，入口 backend_driver_dispatch_min.cheng） · 改动面=src/core/analysis/ownership_body_ir_production.cheng + src/core/runtime/program_support_backend.cheng（core 件原样 apply）+ src/core/backend/primary_object_plan.cheng（wire hunk1-4 offset apply + hunk5 手动重对位）；backend2_lower_slots.cheng 零改动（已等价在位）；typed_expr.cheng 本步零改动（for-in 主体待收割通知） · 主树零代码接触（只落 v3 patch×2 + 本 VERIFY 到 campaign 域）

## 结论先行

**SEQ-BRIDGE 桥已按现主树态重对位落地并全链自证：core 件原样 apply（+107/-5，上下文未漂移）；wire 件 hunk1-4 offset apply 干净、hunk5（seq 直写臂+盖章接线）手动重对位至现树「专项字面量臂之后、通用节点求值器臂之前」（m58 后 str 直写臂已收编进 EvalNode 通道，原 54458 区不复存在），臂体与 seqbridge 原文逐字等价（剥注释 diff 零差）；backend2 白名单经并行快照卷入已与 seqbridge 终态逐字节全等，零重放。配对烤机 ×2 同名 sha EQ（fo_p1=fo_p2=`36a1061dd7626c31…`，190s/186s，烤峰 720,159,656/719,717,264B ≈686.8MiB <768MiB 锚），bake.log 零 `cheng_cold:` 错误行——m54 时代 body missing 死因不复现。功能抽检 min1/min2/probe_array 全 0/0 pass；probe_builtin_len 判词 `lowering ownership transport: managed temporary definition missing node=1 row=1` 经基线对照炉（四文件回基线态烤制，sha `bd031f8d5cb7290c…`）实证为**基线既有红**（无桥同判词，str 臂收编 EvalNode 时引入，他线 face），桥态零漂移。v3 两件 patch 对主树现态 apply --check 正反向全 PASS，交本目录 patches/。主线程收割（apply v3 core→wire + 配对烤机 + 四夹具 gate）后通知本线跑 for-in 主体（typed_expr 迭代组注册+消费）。**

## 一、重对位定性（为何原 patch 不可重放）

1. 判据：主树 `grep -c cheng_seq_lit_materialize_bridge` 于 program_support_backend/primary_object_plan 双 0；符号仅存 backend2 白名单（经快照保全 commit 1f14eed8c 卷入）。
2. core 件（ownership_body_ir_production + program_support_backend）：两文件 m58 后零演进，原 patch 直接 apply --check PASS，原样落地。
3. wire 件 primary_object_plan：hunk1-4（DirectExternalParamType/双 DirectExternalCallTarget 白名单/发射函数+seq 盖章函数定义 +217）offset apply 干净（offset -181/-207/-207/-517，函数族已重构为 PrimaryBodyIrBindManagedBridgeResultDefinition 通用形态，hunk4 新函数落模块级，全符号依赖逐一核在）。hunk5（原 -54458 声明路径接线）上下文整体不存在——`phase=node_eval_hit op=local_decl_str_literal` trace 与 strDeclLit 系列变量在现树零命中，reject 重对位。
4. hunk5 重对位落点：现树声明路径臂序=CallExpr 臂(53377)→f64 三元(53428)→i32/i64 三元(53479)→**节点求值器臂(53508，str 直写收编处)**→str 三元(53592)→seq fail-closed 红臂(53712，invalid 6103)→文本回退。桥臂插于 53507/53508 之间，与原语义位置严格同构（专项字面量臂后、通用求值臂前拦截；EvalNode 的 #nev 物化先于桥臂会重现墙1/墙2）。臂内代码与 seqbridge 原文剥注释逐字等价（/usr/bin/diff 零差），仅增 4 行重对位注记。
5. backend2：白名单三符号（seq_lit_materialize_bridge/seq_drop_owned/seq_retain_owned）已在主树且与 seqbridge 终态逐字节全等，v3 wire 剔除该文件。

## 二、验证矩阵

1. **配对烤机 ×2**：fo_p1 rc=0 190s / fo_p2 rc=0 186s，kernel_driver sha256 双炉相等 `36a1061dd7626c31dbb243b6de91019f4fcd9b43657d69491d6dd64d7178cec4`；烤峰 720,159,656 / 719,717,264 B（<768MiB 管理锚）。双炉 bake.log 零 `cheng_cold:` 行。
2. **基线对照炉**：四文件 checkout 基线 16871b54b 烤 fo_base rc=0 190s sha `bd031f8d5cb7290c3f8ea816a62a9aca969ce3ca1109c2dd87e0eb03a24112aa`（sha 异于桥态=源确实不同，烤制期源冻结）。
3. **功能抽检**（fo_p1 驱动，全禁缓存矩阵，克隆内 CHENG_TASK_TMPDIR）：min1 `0/0 [min1=pass]`；min2 `0/0 [min2=pass]`；probe_array `0/0 [probe_array=pass]`；probe_builtin_len compile=1 判词=基线同款（§四.1）。probe_for_array 判词零漂移保持红（typed_expr 迭代组缺件，本线主体待收割后清偿）。
4. **patch 双验**：v3 core/wire 对主树现态 `git apply --check` PASS；对克隆终态 `git apply -R --check` PASS。收割顺序 core 先、wire 后（同 v2 契约）。

## 三、基础设施缺陷定性（非本线 face，交主线程排障）

1. **scratch scope 链接失败**：CHENG_TASK_TMPDIR 位于 /private/var/folders（cheng_scratch_scope.sh 的 mktemp 目录）时，fo_p1 驱动 system-link-exec 终端报 `system link exec runtime: native link failed rc=1`（native_link.log=`macho_provider_linker: provider object read failed index=3`）；同一驱动+同一全禁缓存矩阵+克隆内 OUT 目录则 rc=0。二分定位：BACKEND_JOBS/缓存变量矩阵/路径形态均排除，唯一差异变量=OUT/tmp 在 /private/var/folders 下。m58 后引入（seqbridge 时代同 runner+scope 全绿），影响所有 scratch scope 探针跑法，临时绕行=CHENG_TASK_TMPDIR 指克隆内目录。归属 system_link_exec/macho provider 域（他线 face）。
2. **probe_builtin_len 既有红**：判词 `managed temporary definition missing node=1 row=1`，源=PrimaryBodyIrBindManagedBridgeResultDefinition(27841)（既有函数，非本线改动）。基线对照炉实证无桥同红。归因方向：m58 后 str 直写臂收编 EvalNode 时 `"abcd"` 声明的 ManagedTemporary 戳链断裂（12856 区 condition 臂同款消费路径未覆盖 decl 形）。归属 primary EvalNode/transport 域（他线 face）。**收割不因它阻塞**——它先于本桥已红，桥后零漂移。

## 四、病态处置账

1. 一次操作失误即杀即修：基线对照炉烤制中误将 src/core 恢复桥态（源未冻结）——即时杀炉、清 run_fo_base、重置基线态重烤，混合态产物未用于任何结论，重烤炉全绿。
2. /private/tmp/cheng-forin-diag 诊断目录被 disk_guard lease 到期清扫一次，改用克隆内 .w/diag 任务生命周期目录。
3. 全线无病理编译（190/186/190s 三炉均 <10min 线）；克隆每刀即时 commit（16871b54b→4cb29f703）。

## 五、收割指令（主线程执行）

```
git apply docs/campaigns/2026-08-31-kernel-userpath/patches/seq_bridge_core_v3.patch
git apply docs/campaigns/2026-08-31-kernel-userpath/patches/seq_bridge_wire_v3.patch
```
→ 立即配对烤机 ×2 sha EQ（rebake 配方同 §二.1，ROOT=主树）→ 四夹具 gate（bake_win 锁内）→ 基线刷新指令沿用 VERIFY_seq_bridge §五（probe_array 行刷绿）。失败即按首错行定谳（预期无：v3 对主树现态 apply --check 已 PASS，克隆同源态配对烤机已 sha EQ）。完成后通知 FORIN-SEQ 跑 for-in 主体。

## 六、复跑与资产

- 克隆=/Users/lbcheng/cheng-f24/forin（commit 16871b54b 基线 → 4cb29f703 桥态）；烤机壳 `.w/fo_bake.sh <tag>`；探针 runner `.w/fo_probes.sh`（**必须** `CHENG_TASK_TMPDIR=<克隆内目录>`，禁 scratch scope——§三.1）；复跑探针示例：`CHENG_TASK_TMPDIR=$PWD/.w/diag PROBE_DRIVER=$PWD/.w/run_fo_p1/kernel_driver bash .w/fo_probes.sh min1 min2 probe_array`。
- 双炉 kernel_driver（各 ~163M）于本 VERIFY 落盘后即删（summary.txt/bake.log 台账保留）；bake_win 锁释放。

## 七、后置域（本线主体，待收割通知）

for x in [3,4,5] 数组迭代形（typed_expr 迭代 pattern 组注册+消费，w24 先例形）：桥收割后按原任务路径执行——复现归因→根修 typed_expr→验收链（最小形翻绿+四夹具 4/4+12 绿零漂移+配对烤机 ×2 sha EQ+报告契约零漂移）。
