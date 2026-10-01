# 2026-08-31 kernel 用户路径清墙战役档案

## 战果

- **30+ 面墙清偿**（wall7-44 系 + 前役 wall1-6），全部守卫零弱化、逐面 lldb/源码实证。
- **四夹具状态**：ordinary ✅ compile 0/run 0；call_fixture ✅ 0/1（语义正确）；
  v6/cold_nested 阶梯推进中（w43/w44 在途），每面墙都有判词级验收。
- **烤机性能**：992s → 240s（memo 两波，字节铁门配对验证）；
  B1 实测归档（freeze/codegen 并行墙钟零收益，materialize 46.3% 才是大头）。
- **破案知识点**：W-ORD=进程 cwd 解析 provider 裸名（验收必须仓库根 cwd）；
  `--out` 基名嵌入产物字节（stabs/UUID/签名级联）；缓存命中=同哈希假编译（配对轮必须禁缓存）。

## 常驻制度

- **回归门**：`tools/user_path_gate.sh --driver <kernel_driver>`——四夹具 compile/run/判词
  对 `user_path_baseline.tsv` 逐项比对，偏离即 BASELINE-STALE（基线是显式契约，
  更新须伴 VERIFY 记录）；RSS 逐夹具上报，四夹具全绿后 RSS-BUDGET 升级硬门。
- **lessons.md**：内存守卫禁抬帽（根因优先）、租约冲突串行退避、缓存假编译、补丁路径畸形
  等运维纪律均已沉淀。

## 代码落卷状态（hunk 级拆分）

- **已入库**：analysis 域六文件（exact_def_derive/identity/call_authority、
  managed_lvalue_replace、ownership_body_ir_production、compiler_snapshot_schema）
  ——campaign 独占、HEAD-clean 起点，两提交落定。
- **待落**（wave 混血，`git apply --cached --check` 在 wave-free index 上全部 reject 实证交叠）：
  bootstrap/cold_parser.c（wave=reissue/provenance +933 行）、bootstrap/cheng_cold.c
  （wave=+1010 行）、src/core/lang/parser.cheng、src/core/lang/typed_expr.cheng、
  src/core/tooling/compiler_csg.cheng（wave=+1047/−1038）、src/core/backend/primary_object_plan.cheng。
  处置：wave owner 先提交 wave，随后本目录 patches/ 内战役补丁按 VERIFY 落地序重放即可
  干净落卷（`tools/stage_campaign_hunks.py` 已验证重放器）。

## 证据索引

- `VERIFY.md`：30+ 面墙逐面机理/修法/验收账本（45+ 小节）。
- `patches/`：41 个战役补丁（含中间轮留档）。
- `design/bake_opt_design.md`：缓存/并行施工设计（B1 实测、B2 materialize 并行 3-5 日、
  A1 缓存协议、A2 视剖面）。
- `fixtures/`：四夹具 master（回归门唯一来源）。

## 口径迁移（2026-09-08 用户令）

- 本目录 VERIFY/patches 中的 1GiB / 1073741824 为口径迁移前的最后防线证据，保留原文不改写。
- 当前内存模型理论极限 = **768MiB = 805,306,368 bytes**（`docs/selfhost-resource-plan.md` §二点五 + `tools/memory_model_limits.sh`）；所有新守卫/新文档以此为准。
