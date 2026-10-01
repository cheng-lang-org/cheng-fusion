
# wall100.VERIFY

## wall100 报告：`ownership body ir production: managed TypeArena layout drift` 墙已清（w98 修法甲落地，v6 判词推进至 freeze identity schema 预存墙，授权面外停手移交）

日期 2026-09-02。承接 wall95/wall97/wall98 小节。授权面=src/core/analysis/exact_def_derive.cheng（主树唯一改动文件）。

### 判定
**wall100 目标墙已死。** v6 判词从 `ownership body ir production: managed TypeArena layout drift`（w98 富化判词，fact_row=-1）推进为 `cheng_cold: exact identity schema [freeze] fn=2 op row=1 slot=3 … slot authority mismatch def_type=20 slot_type=16 …` + `primary exact def freeze validate rejected`（fn=2 outer 同点后继相位）。推进机理：derive field-borrow 臂 hop 命中放行前为 destination 槽冻结 TypeId（Box=16）配对绑定 canonical fact closure 后，ownership production drift 四条件中 fact_row<0 条件消除，op=1 依次过 drift 尺寸/对齐核对与 wall73 RefObject 臂形状审计（scalar=Invalid、fixed=0、LocalPtrTag、child 在册——闭包单子链恰好覆盖），落穿 call-mirror 段；随后 freeze identity schema 对同一 op=1 的 def 行 TypeId(20=借主行权威) vs 槽 TypeId(16=字段 storage 权威) 相等子句拒绝——即 wall90 已定性「相等在该形按构造不成立」的两权威对，冻结层相等子句（exact_def_identity.cheng:2281-2284 树态，HEAD:2241 原位存在且并行线 diff 未触及）无字段投影借视豁免=预存墙新近可达。

### 修法（/tmp/oob_ab/derive_wall100.patch，sha256=b2c96aed…f969，247 行，6 hunks 含在树 w25/w90/w95 hunks，reverse-check 过；单轮 r1==终版）
exact_def_derive.cheng 本臂 4 hunks：
1. import managed_lvalue_replace（无环：其 imports 仅 core_types/body_ir_access/typearena/layout/rawbytes/hash256）。
2. 新 helper `bodyIrExactDefFieldHopBindFactClosure`：调 `ManagedLvalueReplaceProductionBindTypeClosure`（managed_lvalue_replace.cheng:1257 既有先例），window artifactCid+六列直传权威；失败=窗值不可 bind=证据洞，单行判词 hard fail（`exact def derive: field hop fact closure bind invalid op=… slot=… tid=… fn=… fact_count=…`），无兜底。绑定幂等（BodyIRBindCanonicalTypeFact 既有同值行→true），已过程序 fact 表与发射字节零变化（车头 v6 0/0、ordinary 0/0、call_fixture 0/1 实证）。
3. `bodyIrExactDefFieldHopValid` bodyIR 参改 `var`（全树唯一调用点 derive field-borrow 臂，实测 grep），两命中臂（整值借视残形 + layout children 精确三元组）return true 前各插配对绑定——单点、primary（primary_object_plan:65484）/backend2（backend2_pipeline:1837）双管线共享。
backend2_lower:576 对称面按任务书留编排者统筹（本臂未核）。

### 门禁与验收实况（cwd=仓库根，零抬帽，烤机 1/3 轮）
| 门 | 结果 |
|---|---|
| 秒级门 cheng_now3 --emit:obj exact_def_derive.cheng | rc=0 |
| 车头 cheng_w100（clang rc=0，13 warnings 全既有 format 类）× v6 | compile=0 / run=0（r=7/offset=8/n=108 语义参照由夹具内断言保持） |
| 烤机 kernel_driver_w100 | rc=0，sha256=8486eed3…8992，size 184969264 |
| **v6 × w100** | compile rc=1 `exact identity schema [freeze] … slot authority mismatch def_type=20 slot_type=16`——**drift 墙死亡**，后继预存墙新近可达 |
| ordinary × w100 | compile=0 / run=0 不回归 |
| call_fixture × w100 | compile=0 / run=1 契约预期不回归 |
| cold_nested × w100（只记录） | compile rc=1 `backend2_bodyir_codec_data_relocation_identity_invalid`——并行 w86r 线（cleanup_cfg/exact_def_freeze/exact_def_identity 均在树 M 态）中间态领地，非本臂改动面归因 |
| RSS | 全程零 rc=125 |

### 后继墙证据（移交，授权面外+并行线领地）
1. 病根位置：src/core/analysis/exact_def_identity.cheng 树态 :2281-2284 冻结相等子句 `exactType>=0 && localSlots[slot].typeArenaTypeId != exactType → slot authority mismatch`，无 wall90 字段投影借视豁免（def 行 20=借主行冻结权威、槽 16=字段 storage 权威，wall90 已证该形相等按构造不成立）。修法方向（编排者裁量）：冻结层对该形（opPlaceKinds=BorrowProjectionTag ∧ OwnBorrowShared ∧ FieldLoad ∧ 借主域有效）豁免相等子句、改核 hop 已证三元组（derive sidecar opPlace/opExactTypeIds 全列在册），wall90/wall100 同契约延伸，非弱化。注意 exact_def_identity/exact_def_freeze 现为并行线在树改动文件，撞其窗口即租约冲突，须统筹。
2. backend2 对称面未核（backend2_lower:576 / backend2_pipeline:1962 freeze validate）。
3. w98 遗留 3（fn2 fact 表 3 行来源）未逐行定位，本臂后该表已含 16 及其子链，不影响。

### 交付与统计
- /tmp/oob_ab/derive_wall100.patch（== derive_wall100_r1.patch，vs HEAD 累积式含在树前臂 hunks；本臂净归属：exact_def_derive.cheng 4 hunks：import + helper + hop 签名/两命中臂绑定）
- git diff --stat（exact_def_derive.cheng）：apply 前 151 insertions(+)/4 deletions(-)（155 行）→ apply 后 191 insertions(+)/5 deletions(-)（196 行）
- 车头 cheng_w100 sha256=d5f13d56…f2fc；烤机 kernel_driver_w100 sha256=8486eed34265f3f73c78bfabee5c30fa67d2c94afacf18eb9fdf8c02976e8992
- /tmp/oob_ab/w100/：tc.o（秒级门）、v6_cold_compile/run.log（车头语义参照）、v6_compile_w100.log（新墙判词全 log）、ordinary/call_fixture/cold_nested 编运 log
- 探针未建（判词一次给全实况）；编排者资产（zz_v6_w7.cheng、user_path_gate.* 工作目录）零触碰；未 git commit；主树仅动 exact_def_derive.cheng
