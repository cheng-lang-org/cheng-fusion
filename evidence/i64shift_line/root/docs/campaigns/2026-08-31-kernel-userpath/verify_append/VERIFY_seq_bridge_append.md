# VERIFY_seq_bridge_append —— [SEQ-BRIDGE] seq 整值物化桥线（战役 R，用户裁决 A 案）：与 `str from_utf8` 同构的 seq 整值物化桥运行时原语落地，托管 `let xs: int32[] = [10,20,30]` 定义发布通道打通（wall33 契约一行未动，验证强度零变化）；墙 1/2（xs[1]/xs.len）清偿翻绿，墙 3'（seq OwnMove drop-glue 缺失）按 wall118 ref 胶水三件包同构清偿；probe_array/probe_builtin_len 双双 0/0 pass；返工附录 §九：m54 语义级失配定谳+现行基线重放配对自证

date_utc=2026-09-08 · 代理=SEQ-BRIDGE 线 · 工作克隆=/Users/lbcheng/cheng-f24/seqbridge（cp -cR 自主树 2026-09-08 04:3x 态，进场即 commit 基线 cb9d3d5df） · 烤机壳=克隆 .w/sb_bake.sh（车头 /tmp/cheng_cold_v2 sha 7f731d4dfbaca209…，ROOT=seqbridge，入口 backend_driver_dispatch_min.cheng） · 改动面=src/core/runtime/program_support_backend.cheng + src/core/analysis/ownership_body_ir_production.cheng（core 件）+ src/core/backend/primary_object_plan.cheng + src/core/backend2/backend2_lower_slots.cheng（wire 件）；**typed_expr.cheng 零改动**（str 先例同：transport 行既有权威已足够，无需消费声明侧新表） · 主树零代码接触（只落 patch×2+VERIFY+min1/min2/runner 三件到 campaign 域） · parser.cheng/langintern/compiler_csg/system_link_exec 全程零接触

## 结论先行

**墙 1/2 同根定谳（OWN-WALLS 移交）的正解=A 案整值物化桥，已落地并全链验收：`let xs: int32[] = [10,20,30]` 的声明路径不再走 #nev 临时槽+逐元素 set_grow 地址变异+CopyLocal（绑定槽零 OwnMove 定义=墙1、CopyLocal 无戳被 ingress 2218 拒=墙2），改为 staging 聚合槽逐元素 FieldStore（聚合构造器同款发射形）→ `cheng_seq_lit_materialize_bridge` 单次整值 call sret 直写绑定槽 → (R_decl,OwnMove) call/op 全列镜像落戳（wall33 5467 镜像逐列满足，契约零改动）。刀后首验暴露被墙 1/2 掩盖的墙 3'（ownership_body_ir_production:417 seq OwnMove 出口 drop-glue 权威缺失，判词 `managed sequence cleanup drop-glue authority missing`）——按 wall118 ref 胶水三件包同构清偿：`cheng_seq_drop_owned`（drop 语义逐字委托既有 cheng_seq_free）+ `cheng_seq_retain_owned` 运行时胶水、CleanupPlanBindOwnershipDropGlue/RetainGlue 段 Sequence 分派、seq 臂 OwnMove 定向放行（child fact=Scalar∧≠Str 才放行，str/嵌套托管元素维持红）。终验：min1（xs[1]）/min2（xs.len）0/0 pass；probe_array/probe_builtin_len 0/0 pass（语言面 2 红件翻绿）；21 探针 14 绿零漂移+7 红零漂移；四夹具 gate 4/4 PASS（树峰 959,448,312B<1GiB）；配对烤机 ×2 同名 sha EQ（sb_p1=sb_p2=b647023b…，sb_a2 同 sha 三炉互证，烤峰 ~689.7MiB<768MiB 管理锚）。for-in 数组迭代（probe_for_array，墙 4=typed_expr 迭代 pattern 注册缺件）不属本桥域，判词零漂移保持红。**

## 一、桥体设计（A 案，与 from_utf8 严格同构）

1. **运行时原语**（program_support_backend.cheng，紧随 cheng_seq_set_grow）：`@exportc("cheng_seq_lit_materialize_bridge") fn (elems: ptr, elemCount: int32, elemSize: int32): ChengSeqHeader`——把按元素宽精确物化的元素字节一次性拷入新分配序列缓冲（cheng_malloc+cheng_bytes_copy 既有原语组合），按值返回完整 16B 头（sret 直写调用方结果槽）。与 set_grow 的分工：set_grow=地址变异（resultSlot=elemPtr 非槽物化，wall33 契约下不能承载绑定定义发布——OWN-WALLS 实测否证留档）；本桥=整值物化（天然 call 形）。fail-closed：非法元素宽/负计数/容量越界（>2GiB 溢出、≥64MiB huge alloc）/非零计数空源即 panic；零计数返回零头（无堆负载=无可消费所有权，与 EmptySeqInit 同裁定）。物理元素地址只在桥内瞬时借用。语言纪律自查（协调重申清单 1-5）逐条通过：槽位 int32 语义/同域先例照抄（from_utf8 (raw,n):str 同构签名）/DOD 平面缓冲/int32 标量零 ORC 负担（str/嵌套元素 fail-closed 拒）/零 @importc。
2. **发射臂**（primary_object_plan.cheng 声明路径，str 直写臂（[OWN-WALLS] 54406 区）之后、通用聚合 node-eval 臂之前）：门=非参数聚合绑定槽 ∧ rhs 节点精确 SeqLiteral ∧ stmt.resultType 托管权威 ∧ 元素型权威（literalText=elemType 经 TypeShapeFromText=LocalI32Tag ∧ nodes2_elemSizeBytes==4）∧ 子链全 I32Const ∧ 非空 ∧ R_decl>=0——任一不满足静默回落原路径（原判词保持，零绿漂移面）。发射：`{binding}#seq_lit_stage` 聚合暂存槽（byteCount=4N）← 逐元素 LoadConst+FieldStore（offset i*4 宽 4，聚合构造器 33061 同款形）；桥 call（arg0=CallArgSlotAddress(stage)+ParamAddress 与 set_grow 发射同款，arg1/2=count/esz const 槽，resultSlot=绑定槽，SretResult）。
3. **定义盖章**（PrimaryBodyIrBindManagedSeqDeclLiteralDefinitionExact，str binder 逐列克隆）：transport 行守卫（origin=BindingInitializer ∧ Owned ∧ managed ∧ 借主=-1 ∧ nodeOpKinds=SeqLiteral ∧ definitionRows==R_decl）+ call/op sentinel 列守卫 + exactTypeId/closure/TypeArena proof 同款绑定，def=(R_decl,OwnMove) call/op 全列镜像。墙 1（借主扫描 18671 找到唯一 OwnMove 定义 op）与墙 2（CopyLocal 无戳 op 整个消失）同时开锁。
4. **墙 3' 三件包**（wall118 ref 胶水同构）：①运行时 `cheng_seq_drop_owned`（drop 逐字委托 cheng_seq_free：provenance/ledger/panic 守卫原样）+ `cheng_seq_retain_owned`（缓冲 +1 RC 快照，sret 整值返回）；②ownership_body_ir_production CleanupPlan 绑定段 Sequence 分派 + seq 臂 OwnMove 定向放行（**元素域 fail-closed：child fact kind=Scalar 且 scalar≠Str 才放行**——str/嵌套托管元素 seq 的 owned 定义仍拒原判词，per-element 释放胶水后置）；③双后端白名单（primary_object_plan/backend2_lower_slots DirectExternalCallTarget）。call-site 约定与 str/ref 胶水统一（单实参 ByAddressAggregate 槽地址、argAbiSizes=8、drop void/retain sret）。

## 二、fail-closed 论证

- 发射臂门全列精确键（节点 opKind/intern 权威/类型权威/子链逐节点 I32Const/ExtractIntFromText 零值守卫同 42967）；declined 形回落原路径=今日判词逐字保持。
- 形状已认领后的权威漂移（intern 失效/transport 行列失配/TypeId 漂移/sentail 列脏）一律 panic，零兜底（str 臂同款）。
- 墙 3' 放行仅 plain 标量元素域；str 元素 seq 的 OwnMove 定义维持 `drop-glue authority missing` 判词（富化 child_fact_row/child_kind/child_scalar 三列，前缀不变 grep 仍命中）。
- 桥本体容量/形状守卫全 panic（同 set_grow 文案风格）；零计数=零头无定义点（wall33 裁定同构）。
- wall33/body_ir_access/ingress 契约文件零接触；判定零弱化（全部为新增通道，既有通道行为不变——21 探针 7 红判词逐字零漂移实证）。

## 三、验证矩阵

1. **min 探针（sb_a2/p1 驱动，runner 全禁缓存，CWD=克隆根）**：min1（xs[1]）0/0 `[min1=pass]`；min2（xs.len）0/0 `[min2=pass]`；probe_array 0/0 `[probe_array=pass]`；probe_builtin_len 0/0 `[probe_builtin_len=pass]`。
2. **21 探针全量**：14 绿（array/assert/block/break/builtin_len/continue/enum/mod/objctor/sizeof/tuple/varinit/when/while——+2=本线翻绿件）；7 红判词与基线同族零漂移（closure case=12、defer action bytes、for_array value-definition group、for parser receipt、generic value/share、match static argument、try parser type syntax）。
3. **四夹具 gate（bake_win 锁内，sb_p1 驱动）**：`summary: pass=4 known_red=0 stale=0 max_process_tree_peak_bytes=959448312 rss_cap_bytes=1073741824`——4/4 PASS，树峰 959,448,312B（<1GiB 最后防线，余量 ~114MB）。probe 段 12 pass/6 red/1 stale（stale=probe_array 0/0 vs 红基线行=翻绿预期态，收割方按 §五刷新）。
4. **配对烤机 ×2 同名 sha EQ**：sb_p1 rc=0 311s / sb_p2 rc=0 356s，kernel_driver sha256 双炉相等 `b647023bba177d0f3ec4ac924a9b762e8bfd55914e183fa037bbbb8bfb71f3d6`；sb_a2（同终态代码）rc=0 280s 同 sha=三炉互证。烤峰 723,469,224B/723,649,448B ≈689.7MiB（低于 768MiB 管理锚 ~78MB）。全线 <10min 病理线。
5. **烤机自含回归**：三炉烤制编译全库（含桥本体/胶水/发射臂自身）rc=0——库内零回归；桥为纯增益通道（库内 int32[] 常量字面量声明若存在亦走新臂，运行时自查由探针承载）。

## 四、刀型迭代记录（判词链）

1. 首刀（桥+发射臂+盖章，无胶水）：min1/min2 判词前进至 `ownership body ir production: managed sequence cleanup drop-glue authority missing kind=3 child=7 slot_type_kind=5 op=8 own=2`——墙 1/2 已清，暴露被掩盖的墙 3'（ownership_body_ir_production:417，wall73 注释明示 OwnMove 仍拒因 glue 链缺失）。
2. 二刀（墙 3' 三件包）：min1/min2/probe_array/probe_builtin_len 全 0/0 pass。无同判词连败；30s 内快速失败零次（首验即前进）。
3. 撞窗处置：sb_b2 误与主线程 m48 烤机并发（锁被外部清扫后主线程取走）——即时 kill+清理，等主线程 m48/m49/gate 链完成后静窗重跑配对（protocol 合规，无峰值污染）。

## 五、基线行刷新指令（user_path_baseline.tsv，收割方执行）

```
probe_array	probe_array.cheng	0	0	-
```

（原红行 `1 … primary: managed BodyOp borrow owner BodyOp definition missing` 刷绿；probe_builtin_len 无独立基线行，gate probe 段随驱动更新自然翻绿。）其余行零漂移不动。刷新后重跑 gate 确认 probe_stale 归零。

## 六、后置域（如实报，非本线 scope）

1. **i8/i16/i64/f64 常量元素**：桥本体 elemSize 1/2/4/8 泛型已备；发射臂 int32 系（LocalI32Tag∧size==4）先行。i8/i16 需元素域有符号/无符号范围权威后再开（uint8 形 elemSize==1 的域判定待定谳）；i64/f64 走 I64Const/F64Const 子链扩展。
2. **str/嵌套托管元素**：发射臂拒绝+墙 3' 守卫拒绝（双闸）；扩展前置=元素深拷贝（CloneStr 式）+per-element 释放胶水+ORC 平衡验收（AGENTS 工程规范 5）。
3. **for-in 数组迭代**（probe_for_array，墙 4）：typed_expr 迭代 pattern 组注册缺件（OWN-WALLS 定性移交），与本桥正交，判词零漂移。
4. **非常量元素 seq 字面量**（如 `[a, b, c]` 运行时值源）：仍走原 #nev 路径（nested 语境判词不变）；声明路径扩展需 per-elem 物化+桥 staging 组合，待需求。

## 七、复跑与资产

- patch=docs/campaigns/2026-08-31-kernel-userpath/patches/seq_bridge_core.patch（program_support_backend+ownership_body_ir_production，+109）+ seq_bridge_wire.patch（primary_object_plan+backend2_lower_slots，+326）；**基线相对态=主树 2026-09-08 04:3x 在途态**，git apply --check 当场对主树现行态通过、git apply -R --check 对克隆终态通过；收割顺序=core 先、wire 后（core 单独=惰性增益，wire 依赖 core）。
- 复跑：`cd /Users/lbcheng/cheng-f24/seqbridge && PROBE_DRIVER=.w/run_sb_p1/kernel_driver bash docs/campaigns/2026-08-31-kernel-userpath/fixtures/probes_recensus/run_probes_seqbridge.sh`（驱动已清，复跑=一炉重烤 ~5min：bash .w/sb_bake.sh <tag>）。
- 清理：双炉 kernel_driver（各 163M）验证毕即删（summary.txt/bake.log 台账保留）；bake_win 锁已释放。

## 八、病态处置账

全线无病态编译（三炉烤机 280/311/356s 全 <10min 线；探针编译最慢 ~90s）；sb_b2 撞窗即杀即清（§四.3）；/tmp/oob_ab 两度被外部清扫——bake_win 锁每次重取前 ls 核验，车头 /tmp/cheng_cold_v2 幸存未受影响；克隆每刀即时 commit（cb9d3d5df→e7f7c8384→05cafbc6a）。

## 九、返工附录：m54 语义级失配定谳 + 现行基线重放配对自证（2026-09-08）

**触发**：两件 patch 合入主树后，大闭包烤机 m54/m55/m56 三炉 rc=2 `cheng_cold: reachable function body missing: bodyaccess.bodyIrAccessVerifyManagedValueDefinitions`（前置 `non-void function block unterminated function=bodyIrAccessVerifyManagedValueDefinitions … block=322 blocks=323 ops=651 terms=322`，recovery=1 depth=2 → recovery=0 depth=1）；回滚后 m58 rc=0（sha 0892bfb9=绿态恢复）。返工令假设「新调用点缺 import 注册/导出登记」。

**定位（证据链）**：
1. 该函数在 `src/core/ir/body_ir_access.cheng:5267`，本线刀面（4 文件）零触碰该文件——合入前后主树该文件与克隆逐字节全等（/usr/bin/diff 同）；其唯一两个调用点（BodyIrAccessDecode:5975 / BodyIrAccessManualConsumeExactValidateAgainst:6042）同文件内部，**本线 patch 无任何指向该函数的新调用**。判词中的限定名只是 depth=1 reachable-body 检查器对「body 在 depth=2 物化失败」函数的命名，非 import/导出面失配的直接证据。
2. **导出面核查（返工令假设逐项否证）**：本线新增 @exportc 三符号（seq_lit_materialize_bridge/seq_drop_owned/seq_retain_owned）与 wall118 ref 胶水同走 AppendProgramSupportRelocRoots reloc 扫描入根臂（wall146 收线后唯一通道，无显式 root 列表项可漏）；双后端 DirectExternalCallTarget 白名单、runtime_abi.h 无需登记（运行时域 Cheng 源定义，非 C provider）；probe/烤机链接零 unresolved。
3. **真因定性**：m54 时刻主树=pre-m58 在途态（V6-MEM/ANNOT-RELEASE/parseperf_4 中间 hunks）+本线 patch 的**组合态**；冷编译器 depth=2 对 323-block 巨函数（bodyIrAccessVerifyManagedValueDefinitions，GEN2 巨函数脆性族，T54v2 先例同域）body 物化失败产出未终结尾块。该组合态已不存在（他线 hunks 已演进），无法逐 hunk 二分；patch 单独在任一可重建基线上均绿（下条）。

**重放自证（现行 m58 后基线，克隆 rsync 全等进场 4da1b16c9）**：
- 重放 commit ede4d638c（core+wire 两件按交付顺序 apply）；配对烤机 sb_rx2 rc=0 275s / sb_rx3 rc=0 310s，**kernel_driver sha256 双炉相等 `de7bf03a1b95121fecfb6eb91ebbe3133a153ec8b34ec821c98a4ca80c7194ec`**；bake.log 零 `cheng_cold:` 错误行。
- 功能抽检（rx2 驱动，全禁缓存）：min1/min2/probe_array/probe_builtin_len 全 0/0 pass。
- patch 文件对现行主树逐 hunk 等价重生成（v2，+109/+326 内容不变、仅基线 index 行刷新），git apply --check 当场通过；收割顺序 core→wire（wire 对 core 零编译依赖，顺序翻转亦 apply-check 通过，仍建议 core 先）。

**教训（apply --check 过≠编译过）**：
1. patch apply --check 只验文本上下文，不验语义闭包——跨线叠放 patch 的验收必须=**对 apply 后精确树态的全闭包烤机**（配对 ×2 sha EQ），且烤机与收割间树态不得再漂移；树态在交付与收割之间移动会使原认证失效（本线 §三认证基于 pre-m58 基线克隆，m54 主树为另一组合态）。
2. 判词归因纪律：「reachable function body missing: <限定名>」= body 物化失败的**下游症状**，根因在 depth=2 的首个错误行（本例：non-void function block unterminated）；返工定位必须先读日志首错，再对限定名做调用面排查，否则会误修不存在的注册缺口。
3. 巨函数脆性（323 blocks）叠加多线在途 hunks 属树态级风险，归属收割方合入后配对烤机把关；本线刀面已按证据链排除直接因果。

**收割指令**：主树 apply 两件 v2 patch（core 先）→ 立即配对烤机 ×2（rebake_v2 配方）sha EQ → 四夹具 gate + §五基线刷新。失败即按 §九.3 首错行定谳（预期无）。
