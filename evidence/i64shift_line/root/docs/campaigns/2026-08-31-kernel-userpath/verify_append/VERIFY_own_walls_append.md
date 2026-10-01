# VERIFY_own_walls_append —— [OWN-WALLS] ownership 域清墙线（战役 R）：seq_fieldget 剥洋葱后揭露的四墙一顺件逐墙清偿/否证/定性；墙 3（str 绑定初始化族）根修翻绿，墙 1/2（seq 族）实测否证 CopyLocal 承载形并定性需运行时物化桥，墙 4/5 判词富化+根因定谳移交；m42 v6 穿帽返工后刀体拆分（§八）

## 八、m42 v6 穿帽返工（2026-09-08，协调裁决后执行）

1. **裁定与拆分**：m42 终验 v6=1,078,411,264B（m40 基线 970,976KiB，+104MB）判因 #nev SeqLiteral TypeArena proof 绑定（原刀 2）。已撤刀（克隆 commit de845d756）；交付拆两件：`patches/own_walls.patch`（减体=判词富化+墙 3 生产体，**不含 #nev proof**）+ `patches/own_walls_nev_proof.patch`（持体=刀 2，35 行单 hunk，叠放于减体之上，`git apply --check` 于克隆减体态通过）。
2. **v6/四夹具 A/B 定量（返工验收升级项，全部 /usr/bin/time -l 峰值，克隆同树只换驱动）**：

   | 夹具 | A=m37(零本线刀) | B1=ownfc(减体) | Δ(B1−A) | B2=ownfa(含刀2) |
   |---|---|---|---|---|
   | ordinary | 863,633,408 | 864,763,904 | +1.1MB | — |
   | call_fixture | 859,881,472 / 复测 879,820,800（轮间自漂 ±20MB） | 874,348,544 / 复测 878,362,624 | 噪声内 | — |
   | cold_nested | 952,778,752 | 951,500,800 | −1.3MB | — |
   | v6 | 1,098,235,904 | 1,094,926,336 | −3.3MB | 1,098,186,752 |

   - **减体刀四夹具 Δ 全部 |≤3.3MB| 或噪声内**（call_fixture 轮间自漂实测 ±20MB，首测 +13.8MB 落入噪声）。
   - **刀 2 的 v6 Δ = B2−B1 = +3,260,416B ≈ 3.1MiB**（噪声级），**在克隆树态无法复现 m42 的 +104MB**。
   - **克隆树态本底**：A（m37 预改驱动）v6 已 1,098,235,904B——**本底即穿 1GiB 最后防线 +24.5MB、超 768MiB 锚 +292.9MB**；四夹具本底全部超 768MiB 锚（ordinary +58.3MB / call +54.6~79.5MB / cold_nested +147.5MB / v6 +292.9MB）。克隆含他线在途 hunks（Phase B/C 等），该超锚/穿帽为**树态既有、与本线刀体零因果**（A 即无本线任何代码）。m42 的 +104MB 归因需在 m40↔m42 主树态对账（m42 同载他线 hunks 与环境差），本线数据仅供裁决。
3. **减体验收**：min3 0/0 rc=0（ownfc 复验）；绿探针抽检 while/when/varinit/objctor 全 pass；probe_array=墙 1 原判词（撤刀 2 无涉）。减体驱动 ownfc（222e0c33a217fc2bc7bd1580a116854bd10616a3cad47a7b457bc80a73cf195c）单烤 rc=0 251s；配对烤机以减体态为准需收割侧重烤 ×2（本节 ownfa/ownfb 为含刀 2 旧态，已不作交付凭据）。
4. **持体（own_walls_nev_proof.patch）交付条件**：按本节 A/B，刀 2 在克隆树态增量 3.1MiB；若收割方在 m42 主树态复测同量级（≤锚差值口径由锚表裁量），可叠放合入；若复现 +104MB，则为主树态交互，需单独定谳。

## 九、语言纪律自查（用户定谳全局通用令，2026-09-08）

对两 patch 全部 `+` 行机械扫描（`: ptr` 声明/`GetAddrOf`/`AddrOf(`/`cast[ptr`/指针算术）：**真指针构造 0 处**（唯一命中为 knife4 注释的 `**bold**` 标记，误报）。逐 hunk 结论：
1. **判词富化三处**（28245/22145/defer CID）：只读 SoA int32 列（transport.*Flags/definitionRows、valueDefinitionGroups_*、controlScopeParentIds）与既有 stage 标记变量，零地址表达。
2. **墙 3 生产体**（行分流+直写+binder）：槽位全走既有通道——桥实参经 `CallArgSlotAddress(targetSlot)`+`BodyCallPassParamAddressTag`（AppendStringLiteralValue 既有 ABI 形，非新增透传）；定义戳经 op/call 全列镜像（int32 行/槽 id）；TypeId 经 `BodyIRBindLocalSlotTypeArenaProof`+fact closure 既有证明形态。零裸透传。
3. **#nev 持体（35 行）**：`BodyIRBindTypeArenaArtifactCid`+`BodyIRBindLocalSlotTypeArenaProof` 同款证明通道，slot 为 int32 idx，零 ptr。
4. **既有指针形态残留记录（只记不修，他域）**：var-形参地址槽协议（str 槽存目的地址、FieldLoad 24B 物化，注释自证 43216 区）、`cheng_seq_set_grow` 的 `CallArgSlotAddress(seqSlot)`+ParamAddress 变异原语、setMem/copyMem 地址实参——均为既有 bridge ABI 约定（BodyCallPass* 显式 PassKind 标注，非裸指针），记录在案归属 runtime/ABI 域。

date_utc=2026-09-07 · 代理=OWN-WALLS 线 · 工作克隆=/Users/lbcheng/cheng-f24/owalls（cp -cR 自主树，/usr/bin/diff -rq src 进场校验零差异；外部清扫后重建同规格） · 烤机壳=/tmp/oob_ab2/rebake_owalls.sh（车头 /tmp/cheng_cold_v2，ROOT=owalls） · 改动面=src/core/backend/primary_object_plan.cheng（生产刀）+ src/core/lang/typed_expr.cheng 与 src/core/ir/core_types.cheng（判词富化，零行为改） · 主树零代码接触（只落 patch+VERIFY 两文档） · parser.cheng/langintern/compiler_csg/system_link_exec/dispatch_min 全程零接触

## 结论先行

**四墙一顺件的终局：墙 3（`.len` 独立形/str 绑定初始化族）已根修翻绿（min3 最小形 0/0 rc=0；probe_builtin_len 的 str 段通过、判词前进至 seq 段）；墙 1/2（`xs[1]`/`xs.len` seq 族）同根——托管 let 绑定的定义发布通道在 wall33「TypedExpr+OwnMove 定义只认 CallTag result 镜像」契约下**不存在现有运行时载体**：CopyLocal 携 (R_decl,OwnMove) 戳实测被 ingress phase=5463 逐列拒（本线首刀实测否证后撤刀），seq 无 from_utf8 式整值物化桥（运行时仅有 cheng_seq_set_grow 地址变异原语，resultSlot=elemPtr 非槽物化），需运行时侧「seq 整值 move/materialize 桥」设计裁决后接刀（定性移交，含证据链）；墙 4（for-in 字面量）富化判词实锤 group_row=-1=迭代 pattern 组从未注册（typed_expr 域特征件，触止损条款移交）；墙 5（defer）诊断定谳=动作 CID 的 seen-slot type-fact 契约 vs 标量槽零 tid（shape 族，core_types 契约级，移交）。最终驱动配对烤机 ownfa=ownfb sha EQ，树峰 723,386,368B（低于 768MiB 理论锚 81.9MB，对 1GiB 最后防线余量 ~301MB）；21 探针 12 绿零漂移（probe_assert 在 provider CWD 配方下复绿=基线原生 12 绿），红族判词全部可归因。**

## 一、基线复现（克隆+绿态驱动 m37）

21 探针全量（runner 全禁缓存）：11 pass + probe_assert native link 漂移（后证为 CWD/provider 陈旧对象环境件，见 §六）+ 四墙判词逐一复现：probe_array=墙1、probe_builtin_len=墙3、probe_for_array=墙4、probe_defer=墙5；min2 复现墙 2（op18=绑定 CopyLocal 无戳,phase=2218）。

## 二、逐墙诊断与处置

### 墙 3（根修翻绿）：`let s: str = "abcd"` + `total = s.len`

- **根因链（诊断刀实证）**：node-eval 声明路径 EvalNode(StrLit)→from_utf8 桥直写 #nev 临时槽→NodeEvalStore CopyLocal(#nev→s)。三处断：①wall28 binder 对绑定初始化 StrLit 列失配——typed 侧该 StrLit 是 R_decl(BindingInitializer,own=Owned) 的 defining 节点而非 ManagedTemporary 生产者（富化判词 `row_origin=2 row_own=1 row_node=1`+站点标记 strlit_eval 实锤），binder 必 panic（原墙 3 判词）；②绑定槽零定义→借主扫描 miss（墙 1 同族）；③CopyLocal 携戳被 wall33 拒（见墙 1/2）。
- **刀体（[OWN-WALLS] 标记，生产侧）**：
  1. StrLit eval 臂行分流：transport 行 origin==BindingInitializer → 跳过 wall28 binder（定义由声明路径承担）。
  2. 声明路径直写臂：`let/var s: str = "字面量"`（R_decl>=0 ∧ 托管 ∧ 非空载荷）→ from_utf8 桥**直写绑定槽**（与绿文本路径 AppendStringLiteralValue(targetSlot) 同款发射形，零 #nev、零 CopyLocal、零多余 retain——确定性所有权→确定性生命周期：一次分配一次所有权移交）+(R_decl,OwnMove) call/op **全列镜像戳**（新函数 PrimaryBodyIrBindManagedStrDeclLiteralDefinitionExact，5467 镜像逐列满足：resultSlot==valueDefSlot∧result 全列镜像∧TypeId/slot proof/fact closure 同 wall28 binder 契约）。行缺失/类型权威缺失/非 StrLit 节点 fail-closed panic；空载荷按 wall33 裁定零填充无定义点。
- **验收**：min3（let s: str="abcd"; total=s.len; if total==4）0/0 rc=0（编译/链接/运行全绿）；probe_builtin_len str 段通过（判词前进至 seq 段，见墙 2）。

### 墙 1/2（同根，实测否证+定性移交）：`let xs: int32[] = [10,20,30]` + `xs[1]`/`xs.len`

- **同根定谳**：托管 seq let 绑定的值定义发布缺失。墙 1=借视物化 Prepare 的 OwnMove 定义 op 扫描 miss（primary:18671）；墙 2=绑定 CopyLocal 无戳（ingress 2218）。
- **否证记录（关键证据）**：首刀按 [wall72]/[bc2] 先例把 (R_decl,OwnMove) 盖到绑定 store CopyLocal——刀后墙 1 扫描通过、#nev 槽 TypeArena proof 绑定后 derive local-copy 臂通过，但 ingress **phase=5463** 拒：body_ir_access「TypedExpr+OwnMove 定义只认 CallTag result 镜像」（wall33 契约，5467-5504 逐列）；bc2 聚合构造臂的 managed 戳为同一未验证通道（其 setMem 锚 resultSlot=-1，镜像必不满足，现网无 managed 聚合构造绑定绿例）。**撤刀**（克隆 commit 留档：刀1 c1bb6f73b 入、刀4 提交内撤）。
- **定性移交**：合法载体=整值物化 call 直写绑定槽（str 族=from_utf8 桥，已用）。seq 族无对应原语：运行时仅有 cheng_seq_set_grow（地址变异，resultSlot=elemPtr）/set_len/header_len_get，无「seq 整值 move/materialize 桥」。需裁决项：①program_support 新增泛型 seq move 桥（头部 16B 按值 sret——但 T[] 泛型化/每元素类型实例化 ABI 需设计）；②或 wall33 镜像契约扩展（动作域语义修订，core_types/body_ir_access 契约级）。裁决前 probe_array 保持墙 1 判词红行、probe_builtin_len 保持 seq 段 2218 红行（真实现态，禁刷绿）。
- 顺带修（保留）：SeqLiteral eval 臂 #nev 槽绑 TypeArena 精确 TypeId/slot proof（[OWN-WALLS]，修 derive local-copy 源义务 StorageUnknown——独立正确，seq 桥落地后即消费）。

### 墙 4（判词富化+定性移交）：`for x in [3,4,5]`

富化判词实锤：`pattern_row=1 group_row=-1 group_start=0 group_count=1 … group_oob`——**迭代 pattern 组从未注册**（注册通道仅覆盖 let 族 PatternBinding 与 decl-local；for-seq 循环变量的 PatternIterator pattern 无注册+消费臂）。修法=typed_expr 侧新增迭代组注册+消费（w24 零值模板先例形：detached 根键+元素类型零值 defining 节点+TypedExprForSeqBindingElementType 推理接线，字面量迭代器的元素类型推理亦缺）——typed_expr 大改，触止损条款移交。range 形（probe_for）为另一 parser receipt 判词，未动。

### 墙 5（顺件，诊断定谳+移交）：defer action bytes invalid

诊断标记定谳：`stage=shape blocks=6 scopes=4 parents=[0←-1 1←0 2←1 3←1] blocks=[b0:s1 b1:s2 b2:s1 b3:s3 b4:s3 b5:s1]`——作用域树/动作区闭合**正确**（动作块仅 b1:s2），零 CID 根因=动作 CID 的 seen-slot type-fact 契约：动作体内每个被引用槽（含 `x=99` 的目标槽与常量载体槽）必须带 typeArenaTypeId+唯一 fact 行，而裸 `var x: int32` 标量槽创建不绑 tid（实测 slot tid=-1）→ seen-local 检查零 CID。修法两选：①defer 动作发射侧为被引用槽绑 proof（发射域补臂）；②CID 契约对标量槽道修订（core_types 契约级）。移交裁决。

## 三、fail-closed 论证

- 墙 3 直写臂门：kind==Str ∧ 非参数槽 ∧ rhs 节点精确 StrLit ∧ 字面量 intern 权威在场 ∧ 托管类型权威在场 ∧ R_decl>=0——任一缺即 panic（该形今日必死墙 1/3 之一，无绿漂移面）；Unmanaged 行静默让位（bc2 行所有权分裂同款裁定）。
- binder 行守卫全列硬校验（origin/own/borrow/managed/callDecl/定义行==R_decl），call/op sentinel 列守卫同 wall28 binder，TypeId/slot proof/fact closure 绑定失败即 panic，零启发式零兜底。
- 行分流按 transport 行 origin 精确键（owner 语句+定义节点）判定，其余形态（含行缺失）仍走 wall28 binder 原判词 fail-closed。
- 判词富化（28245/22145/defer CID）三处均为纯诊断增益：pass/fail 边界逐字节不变（wall74 判词富化先例同款）。

## 四、验证矩阵

1. **配对烤机 ×2 sha EQ**：ownfa rc=0 276s / ownfb rc=0（车头 /tmp/cheng_cold_v2，ROOT=owalls，入口 backend_driver_dispatch_min.cheng），sha256 相等（见 §七资产）。树峰 723,386,368B——**对 768MiB 理论锚差值 -81,920,000B（低于锚）**，1GiB 最后防线余量 ~301MB。
2. **21 探针全量（ownf* 驱动，runner 全禁缓存，CWD=克隆根）**：12 绿零漂移（assert/block/break/continue/enum/mod/objctor/sizeof/tuple/varinit/when/while——probe_assert 复绿见 §六）；9 红：array（墙1 原判词）、builtin_len（**前进**：墙3 binder 判词→seq 段 2218）、defer（富化判词）、for_array（富化判词）、closure/for/generic/match/try（他域原判词零漂移）。
3. **min 探针**：min3=0/0 rc=0（墙 3 验收件）；min1/min2=墙 1/2 原判词（否证撤刀后回原位）；min4=富化判词。
4. **烤机自含回归**：最终驱动烤制过程编译全库（含改动的 primary_object_plan 自身）rc=0——库内全部 str 声明路径过刀 4 零回归（库内无该形 node-eval 红例，刀面为纯增益）。

## 五、基线行刷新指令（user_path_baseline.tsv，收割方执行）

```
probe_builtin_len	probe_builtin_len.cheng	1		ownership body ir production: ingress BodyIR ownership invalid code=15 site=2 index=35 detail=6 … op_kind=9 … vd_row=-1 … phase=2218（seq 段；str 段已绿）
```

probe_array 行维持 `primary: managed BodyOp borrow owner BodyOp definition missing` 不动；probe_defer/probe_for_array 判词文本因富化加长（前缀不变，grep 仍命中），建议收割方按富化后全文刷新红行防 PROBE-STALE；其余行零漂移不动。

## 六、环境裁定（provider CWD，收割方须知）

- system-link-exec 的 provider 对象按**相对路径** `system_link_exec_provider.N.o` 写入/读回（写侧 rootDir、读侧进程 CWD）；跨 CWD 复用陈旧对象会产生 `provider object read failed`/`unresolved symbols first=cheng_str_drop_owned` 族假红（probe_assert 基线漂移、min3 首轮 link 失败均此因）。**验收配方=CWD 置烤制 ROOT**（本线全量回归即此配方，12 绿）。此为 system_link_exec 域既有形态（R2-C2 在途），本线零接触，仅记录配方。

## 七、复跑与资产

- 驱动：/tmp/oob_ab2/run_ownfa/kernel_driver 与 run_ownfb/kernel_driver（sha EQ 互证；验证毕清理，summary/bake.log 台账保留）。
- 复跑：`cd /Users/lbcheng/cheng-f24/owalls && PROBE_DRIVER=/tmp/oob_ab2/run_ownfa/kernel_driver tools/cheng_scratch_scope.sh ow bash docs/campaigns/2026-08-31-kernel-userpath/fixtures/probes_recensus/run_probes_owalls.sh`（克隆内 runner ROOT 已改指克隆；CWD=克隆根）。
- patch=docs/campaigns/2026-08-31-kernel-userpath/patches/own_walls.patch（3 文件 13 hunks：primary 生产刀+core_types/typed_expr 判词富化；git apply -R --check 对终态克隆精确匹配验证过；**基线相对态**=owalls 克隆进场态（主树在途 hunks 已含），主树收割时 git apply --check 校验，冲突域=本线 [OWN-WALLS] 标记区）。
- 诊断清理账：站点标记模块变量+8 赋值已撤（纯调试件）；三处判词富化保留（wall74 先例域）。
