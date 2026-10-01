# wall135.VERIFY

## 判定：v6 `cleanup source control cid invalid` 墙已死——typeFact 审计滞后域镜像放行（core_types 域两 hunk），r2 烤机实证判词推进至 `cleanup_cfg: return snapshot action authority missing`。新死点落 cleanup_cfg.cheng（wall133 领地文件，本线授权面外）→ 停手完整移交。烤机 2/3（r3 备用未烧）。ordinary 0/0、call 0/1、车头四夹具语义参照全绿零回归。

## 一、定性（审计为何对 int32 unmanaged+proof typeId=7 无匹配）

- **审计面（授权面主文件=/Users/lbcheng/cheng-lang/src/core/ir/core_types.cheng）**：`bodyIRCleanupReferencedTypeFacts`（:3396，唯一调用方 `BodyIRCleanupSourceControlCid` :3589）对**一切 typeId>=0 的 slot** 要求 typeFact 表恰一行匹配（matchCount==1 → 否则失败）；失败投影镜像 `BodyIRCleanupSourceControlFailureStage`（:3470）同形（st=103）。wall133 富化实锤：v6 main(fn=3) slot9 = int32（kind=1）unmanaged（storage=1）带 proof typeId=7，在册 fact 仅 [16,17]（Node/Box 托管闭包）→ 匹配 0 → st=103 必死。
- **factIds=[16,17] 各是什么**：main 托管槽（n: Node、n.arena: Box 的 new/store 闭包）经生产 bind 面落表的两行托管闭包 fact；int32 无 drop-glue 无布局 hop，无任何生产面为它落行。
- **生产 bind 缺口 = 无缺口，审计滞后**（三域立场实证）：
  1. decode 权威（src/core/ir/body_ir_access.cheng，A6 族 15 code）：**全文件零 typeFact 引用**，slot 合法性唯一经域谓词 `BodyIRLocalSlotTypeArenaProofValid`（core_types :8571）——明文放行 `typeId>=0 ∧ storage==Unmanaged`，零 fact 义务。
  2. slot proof bind 契约 `BodyIRBindLocalSlotTypeArenaProof`（core_types :8432）：同谓词族放行，只落 typeId+storage，零 fact 义务（lowering_plan ×3 / primary_object_plan ×5 / cleanup_cfg ×1 调用面共享）。
  3. fact 生产 bind 面（managed store closure `managed_lvalue_replace.cheng:1245`、field chain `primary_object_plan.cheng:29962`、field hop `exact_def_derive.cheng:399`、new alloc `primary_object_plan.cheng:17252`）：义务域=托管 drop-glue 与布局 hop 权威，从不覆盖纯标量 unmanaged 槽。
- **dual-domain split 论证成立**（wall127 exact_def_freeze 臂先例同构）：三域中两域（decode 权威+bind 契约）一致承认「proof 即完整」对 unmanaged 纯标量，唯 cleanup 审计滞后要求 fact——修法=审计侧精确镜像放行，非放水兜底。佐证：cleanup control cid 本体已将每 slot 的 typeKind/typeArenaTypeId/managedStorageKind/size/align 全量编入（:3673-3683），标量槽类型身份在 cid 中不依赖 fact 行。
- **生产侧修法被否**：为带 proof unmanaged 标量 bind fact 需动 9+ slot-proof bind 面签名传 TypeArena 六列窗，blast 跨三文件且与既有 fact 义务域设计（托管权威）相悖。

## 二、修法（在树，core_types.cheng 两 hunk，+29 行纯插入，全带 [wall135] 标记）

1. 审计本体放行臂（`bodyIRCleanupReferencedTypeFacts`）：
   `storage==Unmanaged ∧ BodyIRLocalTypePlainNoAliasProof(typeKind)` → 放行前仍对在册匹配 fact 行打 seen（shape 谓词保证 typeId 严格递增 ⇒ 至多一行）→ continue。fact 表闭包审计（104/105）语义不变；托管族（Str/Ptr/Aggregate）proof 槽 fact 恰一审计零弱化。谓词复用同文件权威三族 {I32,I64,F64}（:8358，slot 默认 proof 同源判定），非新造启发式。
2. 失败投影 `BodyIRCleanupSourceControlFailureStage` 103 分支同源镜像（wall62 只读复刻同源对齐纪律），死点取数不误报已放行形。
3. 已绿夹具 cid 字节不变：原本 matchCount==1 的标量槽放行臂打标等价；ordinary/call r2 实测 0/0、0/1 佐证。同文件 wall131 hunks（argFormalOwnerships）原样保留。

## 三、烤机台账（2/3，全部 sha256+size，配方=head 三件套+cold_cache+ENTRY_CACHE=0，cwd=仓库根）

| 轮 | 产物 | sha256 | size | 内容 | 结果 |
|---|---|---|---|---|---|
| r1 | kernel_driver_w135_r1 | f5ba36267caa72e012a4014a2a6d6d6231a3db49eec7ac18cfce962475e9a279 | 186269360 | 进场复现（零树改动） | v6 判词与 wall133 r3 **逐字同**（st=103 off=9 全富化列复现）= 干净基线铁证 |
| r2 | kernel_driver_w135_r2 | 84bf9fc0db4aa4d52e3d13754bf16b44b749d8ddbee9fb6ff4e23ea1378ca55b | 186269360 | + core_types 两 hunk | v6 判词推进（见下）；ordinary/call 零回归 |

秒级门：core_types.cheng × 车头 cheng_w126 --emit:obj rc=0（产物 /tmp/oob_ab/w135/w135_core_types.o，2.1MB）。

## 四、v6 判词推进实录

- r1（进场）：`cleanup_cfg: cleanup source control cid invalid sealed=1 cf=1 pd=1 ed=1 lb=1 mc=1 mr=1 ef=1 proj=1 st=103 off=9 slots=41 facts=2 fn=3 slot=[id=9 typeId=7 kind=1 storage=1 size=4 align=4] factIds=[16,17]`（compile=1）
- r2（修后）：`cleanup_cfg: return snapshot action authority missing`（compile=1；前置 regalloc_ledger_pre actions=68 words=53 relocs=3 打点在册）

## 五、门禁实况（cwd=仓库根）

| 门 | r1 | r2 | 车头 cheng_w126（语义参照） |
|---|---|---|---|
| zz_v6_w7 | compile=1 st=103 墙（进场基线） | compile=1 `return snapshot action authority missing`（**推进**） | 0/0 |
| ordinary_zero_exit | — | 0/0 | 0/0 |
| call_fixture | — | 0/1（契约预期） | 0/1（契约预期） |
| cold_nested（wall134 领地，只记录） | — | compile=2 `cheng_cold: cold export root missing (recovery=0 depth=1)` | 0/0 `cold_nested_fmt_interpolation=pass` |

log 档案：/tmp/oob_ab/w135/{r1_probe,r2_gates,r2_probe,lead_w135_run,sec_core_types}.log、gates_w135.sh、lead_w135.sh、v6_probe.sh。

## 六、移交事项（下一线）

1. **新死点（cleanup_cfg.cheng:15333-15336 `cleanupCfgAppendIntentReturnSnapshot`，wall133 领地文件、本线零触碰）**：`plan.exitUsesOwnershipActions[exitId]` 为真但 `plan.exitOwnershipActionStarts[exitId]` ∈ {-1, ≥ownershipActionKinds.len} → fail。两列一致性缺口=声明「exit 需所有权动作」的填写面未同步填 actionStart（或该 exit 的动作组装被跳过）。归属线定性注意：该 fail 点为裸字符串无 fn/exitId 富化，建议富化后定位具体函数（候选 main fn=3，其 `let r = outer(n,2)` return 通道带动作声明）。cid 审计墙（本线已死）后 cleanup intent 构建链的下一门族仍在 A4 域（普查 1067 门）。
2. **cold_nested 判词已再前移（wall134 领地活动证据）**：wall133 r3 判词=`provider compile failed … export root cheng_str_drop_owned not found`；本轮 r2 实测=`cheng_cold: cold export root missing (recovery=0 depth=1)`。wall134 线 provider roots 修法已生效推进，判词归属 wall134 线台账。
3. **wall131 移交债（不变）**：argFormalOwnerships fill/mirror 语义级验证仍待 v6 清墙后一轮烤机。
4. **仓库根运行残档**：system_link_exec_provider.{0,1,2}.o.compile.log（wall133/134 门禁产生，未跟踪文件）+ src/tests/cold_ok_result_three_consumer_negative.cheng（未跟踪，他线残留）——均非本线产物，归属线处理。

## 七、diff 统计与交付

- **/tmp/oob_ab/wall135.patch**：当前树态 `git diff HEAD` 全树生成，13314 行，68 files +7894/−1192（含 wall134 线并行累积与他线在途 hunks 原样照录；wall133 基线为 59 files +7715/−1157）；`git apply --check --reverse` **PASS**（sha256=372b8fc0e3903d735a568bba868b014f1401b41f495dd21d6d4e748f235c7015）。
- **本线增量=1 文件 2 hunks（src/core/ir/core_types.cheng，+29 行纯插入，全带 [wall135] 标记）**。其余文件零触碰；同文件他人 hunks（wall131 argFormalOwnerships 等）原样保留。
- 未 git commit、零分支/worktree；src/tests 零本线探针残留（未创建 zz_probe_w135*，富化走既有判词列）；临时产物全部收在 /tmp/oob_ab/w135/。
- 租约纪律：作业期间遭 wall134 线烤机并行租约冲突多波，全部按 v6_probe.sh 长退避（120s×60）串行消化，无误燃。
