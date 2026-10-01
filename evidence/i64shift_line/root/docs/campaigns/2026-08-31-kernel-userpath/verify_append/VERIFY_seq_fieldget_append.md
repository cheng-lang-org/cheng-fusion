# VERIFY_seq_fieldget_append —— [SEQ-FIELDGET] seq FieldGet 布局权威线（战役 R 第 8 红中最大非 parser 域件）：csg「FieldGet layout is not in exact authority」墙已根修清除（builtin 布局权威生产侧补全），配对烤机 sha EQ；probe_array 前进至下游 primary ownership 既有墙（m31 对照铁证零因果），翻绿待 ownership 域件，止损移交定性

date_utc=2026-09-07 · 代理=seq_fieldget 线（重派接手） · 克隆=/Users/lbcheng/cheng-f24/anchor_clones/seqfg2（cp -cR，/usr/bin/diff -rq src 与主树全等进场） · 烤机壳=/tmp/oob_ab2/rebake_seqfg.sh（车头=/tmp/cheng_cold_v2 sha 7f731d4d…，ROOT=seqfg2） · 本线改动唯一源文件=src/core/lang/typed_expr.cheng（4 hunks 纯增，+116/−0） · 主树零代码接触（只落 patch+VERIFY 两文档） · 未 git commit · parser.cheng 零接触；typed_expr.cheng 他线在途 hunks（sizeof/generic）逐字节未触碰（patch 相对其态生成，git apply -R --check 反向预检精确匹配）

## 结论先行

**判词「compiler csg: FieldGet layout is not in exact authority node=14」的根因定谳为：exact 布局权威表（ir.typeField*/typeLayout*）完全没有 builtin 字段行（T[].len/.cap/.buffer、str.data/.len/.storeId/.flags）的注册入口——`TypedExprIrAppendTypeFieldLayout` 仅有的两个调用方都在声明侧 `TypedExprIrAppendObjectTypeLayoutFromContext`（ctx.typeFields 全是源码声明字段），`TypedExprBindTypeFieldExactCoordinate` 唯一调用点（compiler_csg.cheng:33558）硬编码 `BuiltinNone`；而节点侧 `TypedExprIrResolveExactFieldNodeMeta` 对 builtin owner 推导并发布带布局列的 FieldGet → compiler_csg.cheng:17302 对账在 builtinFieldRows 恒 miss → 一切 builtin 字段访问恒红（.len 族 42k hits 与 for 数组迭代连坐根）。本刀在生产侧补全：三个 var-ir 调用点在 builtin 分支成功后以同一组推导值调用新注册函数，经 `TypedExprIrAppendTypeLayout/AppendTypeFieldLayout` 既有幂等对账写入 builtin owner 行+字段行，payload 与 csg 侧 `compilerCsgExactLayoutBuiltinFieldMatches` 判定逐字节一致。刀后 17302 判词消失，配对烤机 ×2 sha EQ（90a11877…×2，233s/278s 双 rc=0），19 探针 11 绿零漂移、6 红形判词同族。probe_array 未翻绿：全形编译前进至 `primary: managed BodyOp borrow owner BodyOp definition missing`（xs[1] IndexGet 借主链）——该墙用现役 m31 驱动对同形最小复现同判词同 rc=1 实证为既有墙（与库内容改动的 builtin 布局注册零因果，m31 无本线改动时该形同死）；xs.len 单独形前进至 `ownership body ir production: ingress BodyIR ownership invalid code=15`（BodyIR ingress ownership 证明链）。两墙均为被 17302 掩盖的下游 ownership/value-definition 域缺件，触止损条款交定性协调，本线不扩 scope。**

## 一、墙形定谳与根因（17302 链路核账）

1. 基线判词复现：m31 驱动 runner 形态跑 probe_array → `compile=2 verdict=[ compiler csg: FieldGet layout is not in exact authority node=14]`。node=14=xs.len 的 FieldGet（xs[1] 是 IndexGet 无布局列，先经 17210 `hasFieldLayout` 跳过）。
2. 检查点 compiler_csg.cheng:17302：节点带布局列 → 按坐标键（builtin: `fieldSourceId*16+builtinRaw*4+ordinal`）在 `builtinFieldRows`（由 exact 表 exactLayoutField* 行预建）命中行并逐列对账（offset/size/align/ordinal/kind/sourceId）。miss 即本判词。
3. exact 表 = `compilerCsgExactLayoutTableBuildInto` 逐行拷贝 `ir.typeField*`（+owner 行 `ir.typeLayout*`）。静态核账证伪全部三个注册通道：①`TypedExprIrAppendTypeFieldLayout` 全仓仅 2 调用点（typed_expr.cheng:45801/45912），均由 `TypedExprIrAppendObjectTypeLayoutFromContext` 驱动，行来源 ctx.typeFields=源码声明字段；②`TypedExprBindTypeFieldExactCoordinate` 全仓唯一调用点 compiler_csg.cheng:33558 传死 `TypedExprLayoutBuiltinNone`；③节点侧 builtin 分支（typed_expr.cheng ResolveExactFieldNodeMeta）只推导 out 值不注册。→ ir.typeField* 不可能含 builtin 行 → builtinFieldRows 恒 miss → 恒红，与源码形状无关。三选一定谳：**seq（builtin）类型布局注册缺失**，非文本形状链断、非权威节点未挂。
4. 数值链核对（注册可行性与 csg 对账一致性）：`T[]` len/cap/buffer = offset 0/4/8、int32 4/4 ×2 + ptr 8/8，owner 头 16/8；str data/len/storeId/flags = offset 0/8/12/16、ptr 8/8 + int32 4/4 ×3，owner 头 24/8（TypedExprTypeLayoutCompute 权威）；与 `compilerCsgExactLayoutBuiltinFieldMatches` 的 Sequence ordinal0/1/2、Str ordinal0-3 判定逐字节一致。
5. 不注册域（维持 fail-closed 红形，独立后续件）：Bytes 族与 `T[]` 同为 Sequence kind 但 ordinal 空间冲突（Bytes.data@0/8 撞 T[].len@0/4，csg 权威定义下不可共存）；`Option[T]` 无 kind 级权威 owner 头尺寸（value 尺寸依赖 T，任何固定值=捏造）。

## 二、刀体（seq_fieldget.patch，单文件 4 hunks 纯增 +116/−0）

src/core/lang/typed_expr.cheng，[seq-fieldget] 标记：
1. **新函数 `typedExprIrRegisterBuiltinFieldLayoutAuthority`**（@borrows，var ir）：按 builtinKind 分派——Str→owner 行（"str"，24/8/4）；Sequence 且 ownerType 尾 `[]`→owner 行（"[]"，16/8/3）；其余（Bytes 族/Option）return 不注册。先 `TypedExprIrAppendTypeLayout`（owner 行，declarationRow=-1）后 `TypedExprIrAppendTypeFieldLayout`（字段行，ownerRow/fieldRow=-1），producerSourceIndex=ir.valueExprTransactionProducerSourceIndex 与节点 fieldSourceId 同源。owner 行 kind 级规范名 "str"/"[]" 与元素类型、访问顺序无关（同源同 kind 唯一行，坐标键 sourceId*4+kind / sourceId*16+kind*4+ordinal 分源唯一；"[]" 非 ident，不可与任何用户声明碰撞，TypedExprIrCanonicalFieldMetaState 的 leaf==ownerType 门保证其永不进入文本查询通道）。
2. **三个 var-ir 调用点**（typedExprIrBuildRhsFieldHopsRec 的 `.` 臂、typedExprIrBuildRhsPostfixChainRec 的 `->`/`.` 两臂）：`ResolveExactFieldNodeMeta` 成功且 `fieldBuiltinKind != BuiltinNone` 时以同一组 out 值调用注册函数（owner 文本=调用方 baseType/pointeeType 经同一 NormalizeTypeText 归一，与函数内推导精确等价）。ResolveExactFieldNodeMeta 本体签名/行为零改动（var 化尝试被 C 链车头拒「reachable function body missing」，见 §五.4，遂改调用方注册形）。

## 三、fail-closed 论证（每刀）

- 注册走 `TypedExprIrAppendTypeLayout/AppendTypeFieldLayout` 既有通道：同坐标已存在且逐列相等→幂等 no-op；任一列漂移→panic。零新对账逻辑、零启发式、零兜底。
- 注册域白名单化：仅 str 全 4 字段 + `T[]` len/cap/buffer（payload 与 csg `compilerCsgExactLayoutBuiltinFieldMatches` 逐字节一致）；Bytes/Option 落 else return，维持原 17302 红形。未来任一侧布局定义漂移，幂等对账或 csg 对账必死其一，fail-closed 保持。
- 节点 emit 值零改动（列值原样透传）；primary/backend 消费的 nodes2_field* 列不变；新表行仅补权威覆盖，不改变任何既有行（strict validate 的 owner-layout 存在性、observed counts 对账全部自洽——Append 通道内建维护）。
- 探针全量 A/B 实证无横向劣化：19 探针 11 绿零漂移、6 红形判词与基线逐条同族（§五.2）。

## 四、下游墙定性（止损移交，ownership/value-definition 域；非本线域件）

probe_array 翻绿被两堵**被 17302 掩盖的既有墙**阻断：
1. **xs[1]（IndexGet managed 借主链）**：全形 probe_array 与最小形 min1（`let second: int32 = xs[1]`，不含 .len）在刀后驱动均死 `primary: managed BodyOp borrow owner BodyOp definition missing`（primary_object_plan.cheng:18671）。**m31 对照铁证**：现役 m31 驱动（无本线任何改动）跑同 min1 同判词同 rc=1 → 该墙在基线代次即存在，与本刀零因果。int32[] seq 为 managed 容器，IndexGet 值物化的 borrow-owner 定义链（OwnMove 定义 op 扫描）无臂。
2. **xs.len（BodyIR ingress ownership）**：最小形 min2（仅 `xs.len==3`）在刀后驱动死 `ownership body ir production: ingress BodyIR ownership invalid code=15 site=2 index=18 detail=0 … op_kind=9 … vd_row=-1 vd_node=-1 … phase=2218`（ownership_body_ir_production.cheng:1377）——FieldGet builtin 值的 BodyOp 无值定义行，ingress reaching-definition 证明拒绝。结构归因：builtin FieldGet 值物化从未被走到过（17302 先死），此为掩盖下的缺件；本刀只写布局表，不产/删值定义，无因果通道。
3. **连坐探针各一**（判词族一致，记录不扩 scope）：
   - probe_builtin_len（str.len+int32[].len 独立形）：csg 17302 消除 ✔ → `lowering ownership transport: managed temporary definition missing node=1 row=1`（lowering ownership 传输族）。
   - probe_for_array（`for x in [3, 4, 5]` 数组字面量迭代）：`typed expr binding: exact local value-definition group unavailable`（for-in 数组源绑定缺件；range for 的 probe_for 基线红为另一 parser receipt 判词，未变）。
4. 移交定性：①IndexGet managed 借主链（primary realizer）；②builtin FieldGet 值定义登记（lowering/ownership ingress）；③for-in 数组源绑定（typed binding）。三件任一落地后重验 probe_array 全形；xs.len 单独形同时受②覆盖。

## 五、验证矩阵

1. **配对烤机 ×2 sha EQ**：车头 /tmp/cheng_cold_v2，ROOT=seqfg2，入口 backend_driver_dispatch_min.cheng。seqfg_a rc=0 wall=233s；seqfg_b rc=0 wall=278s；driver sha256 双炉相等 `90a11877824ef36994f4aad50d370d8bf0dd89d77321e25b007bebc558e34c57`。两轮均 <10min 病理线。烤前曾两度失败并即修：①share(var 形参) 拒绝（recovery=1 后 body missing）→ fieldType 走 stage 局部中转；②ResolveExactFieldNodeMeta var 化被 C 链车头拒 body missing → 改调用方注册形（刀体定型）。
2. **19 探针全量（seqfg_a 驱动，runner 同款全禁缓存，克隆 root）**：11 绿零漂移（while/enum/tuple/varinit/mod/objctor/break/continue/when/block/sizeof 全 0/0 pass）；6 红形判词与基线逐条同族（closure case=12、defer defer action bytes、for `..< rootNode=-1`、generic value/share authority、match static argument type、try field declaration type）；probe_array 判词前进（见上）。**一项树态漂移已对照定性**：probe_assert 基线 0/0 → 现死 native link——m31 对照同死（`unresolved symbols first=cheng_exit`），系主树工作树他线在途 hunks 的符号面漂移，与本刀零因果。
3. **四夹具**：ordinary 0/0 ✔、call_fixture 0/1 ✔（=基线）；cold_nested 与 v6 死 native link——m31 对照（同克隆树态）双双同样死 native link → 同为树态既有漂移，零因果。报告契约零漂移：烤机 report.txt 结构与 m31 同款（source_snapshot_count=230 等），driver sha 已录。
4. **刀型迭代记录**：ResolveExactFieldNodeMeta 签名 var 化（注册内置形）两炉均 `reachable function body missing: TypedExprIrResolveExactFieldNodeMeta`（C 链车头拒）→ 定型为调用方注册形（本 patch），语义等价（同组推导值、同注册通道）。

## 六、基线行刷新指令（user_path_baseline.tsv，收割方执行）

probe_array 翻绿条件未满足（§四三墙移交中），**不得刷 0/0**；按 gate 红行纪律刷为真实现态（否则判词不匹配即 PROBE-STALE）：

```
probe_array	probe_array.cheng	1		primary: managed BodyOp borrow owner BodyOp definition missing
```

注：全形 probe_array 在 ownership 域三墙（§四.1 最先）清偿并重烤认证后，由收割方统一刷 `0	0	-`。其余 23 行零漂移不动；probe_assert/cold_nested/v6 的 native link 漂移为主树在途态所致，归属他线收敛后自然复绿，本线不动基线。

## 七、复跑与资产

- 驱动：/tmp/oob_ab2/run_seqfg_a/kernel_driver 与 run_seqfg_b/kernel_driver（sha 同上，互为配对证据）。
- 复跑：`PROBE_DRIVER=/tmp/oob_ab2/run_seqfg_a/kernel_driver tools/cheng_scratch_scope.sh seqfg2 bash docs/campaigns/2026-08-31-kernel-userpath/fixtures/probes_recensus/run_probes.sh probe_array`（克隆态+patch 应用后须重烤）。最小复现：min1=`let second: int32 = xs[1]`（m31 同判词对照件）；min2=`if xs.len == 3`（ingress 件）。
- 连坐探针源：probe_builtin_len.cheng / probe_for_array.cheng 已随本交付放 fixtures/probes_recensus/（克隆内；主树 fixtures 未动，收割时随件收）。
- 清理：克隆内 run_probes.sh ROOT 已改指克隆（验证用）；/tmp/oob_ab2/run_seqfg_a|b 的 kernel_driver/cold_cache 大对象验证结束后清除，summary.txt/bake.log 文本台账保留；/tmp/cheng-seqfg-diag.* 与 /tmp/oob_ab2/seqfg_min 诊断目录已清。

## 八、病态处置账（铁律升级 2026-09-07 用户裁决，即刻生效）

判定五条（车头烤 >10min；门单夹具 >5min；自烤 >900s 帽；同判词连败 2 次；CPU 100% 且 stderr 零进展）→ kill 进程组→留现场→修复/交定性→重跑。本线执行记录：

1. **全线无病态编译**：双炉烤机 233s/278s（<10min 线），门单探针编译最慢 ~40s，无 100% 零进展态。
2. **同判词连败 2 次规则的正确用法（本线实证）**：烤机 A 首两炉 rc=2（30s 内快速失败：①`share(value) rejects a var-borrowed source`；②`reachable function body missing: TypedExprIrResolveExactFieldNodeMeta`）——同判词第 2 次出现即触发根因切换：放弃函数本体 var 化，改调用方注册形，第 3 炉 rc=0。快速失败不是病态，不 kill；判词重复才是换刀信号。
3. **「等长烤跑完」禁令合规**：全程后台烤机 + 90-150s 间隔轮询 summary.txt，无陪坐等待；无 GEN2 自烤长跑。
4. **anchor_clones 清扫应对（⑨）**：外部会话已 rm 前任 seqfg 克隆（本线 seqfg2 幸存，开工 ls 核存在通过）。应对=交付物即时落主树 campaign 域并 targeted commit（patch+VERIFY+连坐探针两件），克隆侧 typed_expr.cheng checkpoint commit，防二次清扫。
5. **驱动清理与复跑口径**：双炉 kernel_driver（各 172M）验证完毕即删（防 /tmp 清扫不可预测 + 磁盘纪律），sha 与烤机壳 /tmp/oob_ab2/rebake_seqfg.sh 已录，复跑=一炉重烤 ~4min。
