# PRESTAGE_LINE — typed_expr 三刀预建交付（零烤/零 commit/活树零写入）

日期：2026-09-21。基座锚：HEAD `5bdb7364432bfa1f69ce832320ef4c24d7b67a93`（git
archive 副本 `base_head/`，每次构建器运行重建=自动重对基座）。
在飞：C3+C6 线（同 typed_expr.cheng）——本线不占施工窗，全部产物为**预建件**。

## 输入依据

1. `.rebuild/duoverdict_line/DUO_DESIGN.md`（刀①+刀②设计）——已读，锚区逐行实读。
2. `.rebuild/prefabC_line/PREFAB_C.md` §S-E——**已灭失**（`docs/campaigns/2026-09-20-
   kernel-slab-pass1/README.md:28` 登记；该 README 只登记 c0–c6 哨兵夹具为本线替代物，
   SE1/SE2 清单文本无幸存原件）。权威替代=在库 share() V1 子臂注释原文
   （typed_expr.cheng:30299-30360，含门链与 S-E 形定义）+ 本线静态回放闭包活位点清单。
   SE1/SE2 红夹具按家族定义**重建**（probe_se1/probe_se2，文件头有声明），烤制红臂
   须以判词逐字复核。
3. 工艺先例 `.rebuild/c1knife_line/build_knife.py`（内容锚+可重跑重对基座）——已沿用。
4. lessons.md 已回顾（10-①②③ 预检纪律、受控克隆根、多线 typed_expr 串行）。

## 三刀交付

| 刀 | 补丁（冻结件） | hunk/行数 | 设计偏差说明 |
|---|---|---|---|
| ① 枚举转换 fact 识别臂 | `duo1knife_typed_enum_conv.patch` | 1 hunk +32 | DUO_DESIGN 预估 2 hunk +40~60；**核对点定谳通过（见下）→ 退路 hunk 不需要，单 hunk 交付** |
| ② :3176 绑定行值域守卫 | `duo2knife_rhs_guard.patch` | 1 hunk +12 | 守卫收进 `fact.kind==NormalizedExprCall` 分支内（:18148）：DUO_DESIGN 原文的无差别早退会误伤 ResultIntrinsic 合法无括号形（`let ok = r.isOk` 今天靠本机记 bool），源码审计定谳后修正；守卫语义不变 |
| ③ S-E postfix 实参臂 | `seknife_postfix_arg.patch` | 1 hunk +42 | share() V1 子臂（:30299-30360）同构泛化到实参位；门链逐字同构（FindWholeCallOpenParen + FindMatchingParen + CallHeadIsPlainQualifiedIdent + PostfixValueTypeFromRoot） |

三补丁均对 `git archive HEAD` 副本构建（内容锚定位），`patch -p1` 正打/反打回环
`/usr/bin/diff` 逐字节 IDENTICAL。构建器：`build_knife_duo1.py` / `build_knife_duo2.py` /
`build_knife_se3.py`。

## 施工核对点定谳（刀①唯一，零烤静态回放）

**判词：Builtin 判别对（callKind=TypedExprCallBuiltin + callResolved=false + 保持
解析器原值其余字段）通过 fact 再验证合同与 resolved-call 表约束，退路不需要。**

- 再验证合同 `TypedExprFactsValidateCallResolutionRangeWithPreparedContext`（:12343，
  管线唯一调用点 :71363）：Builtin 臂（:12641）第一合取是**解析器级**
  `TypedExprExprIsBuiltinCall(expr)`——枚举名不在 ParserCallNameIsBuiltinPrimitiveConversion
  表，恒 false → 本形永不进该臂（其中「builtin call resolution drift 要求
  callResolved=true」的拒收条件不可达）。未解析通用道（:12752-12849）逐字段与解析器
  原值恒等；:12833「unresolved call missing reason」由 parser UnknownCallTarget
  （parser.cheng:37453-37458 实读）保证非 None。
- resolved-call snapshot 表 `CompilerCsgTypedFactIsResolvedCallSnapshot`（compiler_csg
  :8757）：Builtin → 排除，零入表零漂移。可达性 `...IsReachabilityExecutableCall`
  （:8742）：Builtin → 排除 = 判词「executable call unresolved」清除（即刀①墙清机制）。
- rules 表 `TypedExprLoweringRulesValidate`（:13481，:13534 对 Builtin+unresolved 会拒）：
  全仓 grep 证实**仅 src/tests 两个 smoke 消费，编译管线无 caller**；回放①证实 smoke
  夹具源无枚举转换形 → 零影响（登记为已知窄约束）。
- 压实序：:71363 验证先于 :71382 `CompactStoredFactsRange`（Builtin 会丢 argsText），
  验证时 argsText 仍在 → :12779 无漂移；压实后无再验证路径消费该字段。
- 生产者侧守卫防误击：`!resolvedSourceFunction`（同名泛型 fn 与枚举类型并存，命名
  空间分离；镜像 :55311 降级臂与 :55622 内建臂同款守卫）。

## 验证账（规则 10-①② 口径）

- **机械预检裸基座**：`patch_preflight.py` 三件全 OK（ann=0 displaced=0 wedged=0），
  `preflight PASS`。（活树 typed_expr.cheng 当前对 HEAD 干净=预检基座等价 archive 副本。）
- **C3+C6 冻结件叠基座探针双 PASS**：`stack_probe/`（已清理，配方=archive HEAD →
  `patch -p1 -N` 打 c6knife_typed_expr.patch → c3knife_typed_expr.patch → 三刀补丁）
  正打 FWD_OK×3 + 反打 REV_OK×3 + 本地根 preflight（`patch_preflight_stacked.py`，
  ROOT 指向叠基座副本）三件全 OK，`preflight PASS`。C36 hunk（:33921/:59962/:60647/
  :61669）与三刀锚区（:55622/:18148/:30361）零内容交叠。
- **烤制阶梯（未跑，零烤预建不含）**：金丝雀 2/2 → probe_duo1/probe_se1/probe_se2
  红绿臂（红臂判词逐字）→ 单变量双臂烤制 → 全闭包爬深 → 照 staticarg/C1 先例。

## 静态回放增量账（`static_replay_summary.txt`，零烤先行）

- **回放①（枚举识别增量）**：全语料枚举转换文本形 29 处（判词孪生 system.cheng:1614/
  :1616 + std/os.cheng 8 + uir 5 + parser 3 + typed_expr 2 + libp2p 7 + repro 2 +…）。
  **超出 DUO_DESIGN「闭包无同形」的口径**：那是当轮烤制可达闭包的口径；全语料同族
  形都在刀①同臂覆盖内（零 carve-out，逐点精确仲裁在编译期守卫）。parser 内建反向
  转换（Int32(enum)）被 `!callResolved` 守卫零增量排除。在库复现件
  `src/repro_enumctor125/`（Color(v) 形）可直接作刀①红绿对照。
- **回放②（守卫语义）**：绑定行 open>0（守卫不触=行为零增量）184,830；open<=0 且
  下标括号内有 call 的**错行移除集 209 处**，含判词目标 `ownership_drop_ir.cheng:3173
  ir.deferEffects[ownershipDropDeferIndex(ir, deferId)]`（及 :2872/:3330 同形）。
  `Fn(a)`/`mod.Fn(a).field`/`(Fn(a))` 合法形全部落入不变集。ResultIntrinsic 隔离=
  源码审计（守卫在 call-kind 分支内）。移除集 209 处的现红/现绿状态静态不可逐一
  定谳（部分位点可能靠「错行巧合」存活），烤制全闭包爬深是权威仲裁——已登记。
- **回放③（S-E 臂）**：std+core 非 .gen 闭包子集 15 处，其中 **typed_expr.cheng:
  36337-36349 五处 `.len` 尾活位点**（typedExprDerivedCanonicalMetadataDuplicateBytes
  内）=任务书「闭包活位点 5 处」逐位吻合；另 Value(res).field 族 7 处 +
  ByteBufView(buf).data 族 3 处 + elf_x86_64_writer 1 处，同臂同门链覆盖。
  mobile_shell_codegen 命中为 Kotlin 模板字符串内文，非 Cheng 语义位点，已排除。
  臂在 `primaryType==""` 门内=既有可定型实参零增量。

## 待叠基座清单（交付窗开启条件）

1. C3+C6 落库（`.rebuild/c36_line/c3knife_typed_expr.patch` + `c6knife_typed_expr.patch`
   冻结件 sha 见 `sha256sums.txt`，本线只读未写）。
2. 重跑三构建器（`python3 build_knife_duo1.py && python3 build_knife_duo2.py &&
   python3 build_knife_se3.py`）——内容锚自动重对新基座重产补丁；若锚漂移构建器会
   fail loudly（anchor not unique/mismatch），人工复核锚区后再发。
3. 重跑两道 preflight（裸+叠）——落库后叠基座探针改为直接对 HEAD 基座跑
   `patch_preflight.py`。
4. 三刀各自单变量双臂烤制（金丝雀先行）；三刀同域 typed_expr.cheng，须串行烤/逐刀
   独立判读；刀①②互不依赖、刀③独立域（StaticExprTypeAtLevel），同基座可分驱动并行。
5. 全部绿 → 提交窗开启（三冻结件逐个单域提交）。

## 置信度

- 刀②：高。双原语语义逐行实读（FindWholeCallOpenParen 括号+字符串感知；
  StripWrappingParens 保形），守卫域修正有源码审计定谳，回放账含判词目标命中。
- 刀③：高（门链与 V1 逐字同构，V1 为在库已验先例；红夹具为重建件是唯一档案缺口，
  烤制红臂判词逐字复核可闭合）。
- 刀①：中高。核对点静态定谳链完整（合同门第一合取+管线/rules 消费面全枚举+压实序），
  但「fact 分类臂→值侧 IR cast 路径」的端到端绿必须烤制探针证实（DUO_DESIGN 红绿
  口径不变）；全语料 29 处家族形与设计「仅孪生」口径的偏差已登记（同臂覆盖，非风险）。
