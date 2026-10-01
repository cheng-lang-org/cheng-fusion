# Cheng 语言 / CSG 可申报发明点清单

生成日期: 2026-07-15。范围: 仅覆盖仓内可用 `grep`/读文件核实存在的真实机制, 每条锚定到具体文件:函数/行号; 未能在源码里核实到实体的线索一律剔除或明确标注"未证实"。

## 范围声明

- 素材源: `/Users/lbcheng/cheng-lang` (只读) + `/Users/lbcheng/cheng-fusion` (只读)。
- 两条起始线索**未能核实**, 已剔除或改写:
  - `docs/singlepass_backpatch_plan.md`、`docs/cheng-beat-c-master-plan.md` 在当前工作树里不存在 (`git status` 显示为本会话外的未提交删除; `cheng-beat-c-master-plan.md` 仍在 `HEAD` git 对象里可 `git show` 读到, `singlepass_backpatch_plan.md` 在整个 git 历史里从未被提交过, 应为过往会话本地文件, 已随 `/tmp` 或未提交工作树丢失)。对应技术内容改为直接读 `src/core/backend2/backend2_emit.cheng` 源码注释核实, 结论不变但引用改锚到源文件而非该缺失文档。
  - "CSG 内容寻址编译缓存 (zc_cache/provider_cache)" 字面命名在仓里未找到同名目录, 但等价机制以 `tools/zc_enumerate.sh` 的 `ZC_CACHE_DIR`/`zc_cache_key` 结果缓存, 以及 `src/core/tooling/compile_skip_cache.cheng` 的 funcEmitCid 缓存两个独立真实实现存在, 分别在候选 2 与候选 3 中如实归位。

## 分级说明

- **A = 核心方法类强候选**: 与已知现有技术 (LLVM/GCC/Rust/Go 自举、ccache/sccache、Unison/Nix 内容寻址、reproducible-builds) 在算法层面有清晰差异点, 建议优先单独成案。
- **B = 系统实现类候选**: 机制真实且工程上有价值, 但核心思想在文献里能找到较近的现有技术(如经典 backpatching、view-based FFI), 需要把权利要求收窄到具体实现细节才站得住。
- **C = 方法流程类弱候选**: 属于工程纪律/流程沉淀, 新颖性主要在"组合与工具化", 单独申报价值低, 建议只作为 A/B 候选说明书里的附属方法权项, 不单独立案。

---

## 候选 1 (A): 重排序不变的语义图内容寻址哈希 (CsgNormalizedGraphCid)

**解决的技术问题**: 传统内容寻址 (Merkle-DAG / Nix store / Unison) 对"节点顺序""插入顺序"敏感——同一组定义换个书写顺序会算出不同的根哈希, 导致语义等价的编译单元在缓存/去重系统里被误判为不同内容, 缓存命中率随源码格式化风格漂移。

**技术方案要点**:
- `src/core/tooling/csg_normalize.cheng:202` `CsgNormTarjanComponents` — 显式栈迭代版 Tarjan SCC (避免递归爆栈), 按依赖拓扑逆序 (被引用者先出) 产出强连通分量。
- `src/core/tooling/csg_normalize.cheng:286` `CsgNormComputeNodeCids` — 按逆拓扑序为每个节点递归代入其后继的 normalized cid 到自身内容哈希里 (节点内容 + 边终点的 cid, 而非插入序索引)。
- `src/core/tooling/csg_normalize.cheng:418` `csgNormSortFixed` + 行 429-460 `CsgNormalizedGraphCid` — 顶层根哈希 = `H(domain, packageId, n, 排序后节点-ncid multiset, m, 排序后边-ncid multiset)`, 显式保留重复度 (用 multiset 排序而非去重 set, 因为重载函数可能产生相同内容的多个节点)。
- 源码注释 (`csg_normalize.cheng:11-18`) 明确记录设计动机: "顶层用排序 multiset 替插入序", 且论证了本图数据模型 (CSG owner 图) 天然是函数式无环图, 每个节点必为单点 SCC, 通用 Tarjan 只是为了代码正确性而非本图会真用到多点分量。

**与现有技术的区别**:
- **Merkle 树/Git 对象哈希**: 对子节点数组是"位置敏感"的 (数组第 i 项对应固定语义槽位), 依赖固定 schema 顺序, 换序即改哈希; 本方案对**同级别节点集合**用排序 multiset, 对**图内定义顺序**通过 Tarjan 逆拓扑消除位置依赖, 两层都做到顺序无关。
- **Unison (content-addressed code)**: Unison 对函数体做 α-等价哈希, 但其全局命名空间/依赖图仍以命名解析为主, 未见对"跨模块导入环边只进哈希不进节点 payload 因此天然无环"这一分层处理; 本方案显式把"仅用于排序的边"与"参与内容哈希的边"分离对待 (源码注释行 18: "module Imports 边可成环, 但只进边 cid, 不进节点 payload, 故不造成内容环")。
- **Nix store hash**: 基于内容整体序列化后哈希, 对图结构内部重排不做任何归一化; 本方案是**结构感知**的图归一化, 而非扁平字节序列哈希。

**权利要求方向**:
- 方法权项: 一种对语义图进行定义顺序不变的内容寻址方法, 包含 (a) 对图做强连通分量分解并按逆拓扑序处理, (b) 每个分量内容哈希代入其后继分量哈希而非位置索引, (c) 顶层用保留重复度的排序 multiset 聚合节点哈希与边哈希得到根哈希。
- 系统权项: 实现该方法的编译器前端产物缓存系统。
- 介质权项: 承载该算法的计算机可读介质。

**等级+理由**: A。核心算法 (SCC 逆拓扑递归哈希 + 排序 multiset 顶层归约) 组合在开源内容寻址系统里未见完全相同实现, 差异点清晰、代码证据扎实 (461 行完整实现)。

---

## 候选 2 (A): 诚实编译架构——全量无 fail-fast 枚举 + 假绿检测的 poison-on-miss 诊断体系

**解决的技术问题**: 传统编译器遇到未实现特性通常 fail-fast (报第一个错误就退出), 使得"还有多少条路径没打通"这个量在大规模自举/迁移工程里不可观测; 更危险的是, 一个在半途硬中止 (crash/OOM/超时) 的编译进程如果被外部脚本误读为"0 个失败", 会产生比真实失败更危险的假绿 (silent false positive), 掩盖架构性缺口。

**技术方案要点**:
- `tools/zc_enumerate.sh:1-39` 头部注释明确设计动机: 取代"first-abort + grep-stderr"旧探针 (同一份源码在旧探针下测出 31/22/191 三个互相矛盾的数)。
- 全量运行 primary-object plan **不设 fail-fast**, 通过结构化 `--report-out` 读取 `plan.errors[]` 全集, 并交叉核对 `ZC_NOT_READY` 无条件 stderr 转储, 按 bail 号 (`firstZeroOp` detail0, 如 44/631/712) 聚类。
- `src/core/backend/primary_object_plan.cheng:489-499` 定义 `firstZeroOpIndex/Kind/Target/Operand0-3` 结构体字段, 行 2192 的诊断行把每条阻塞函数的完整上下文 (`body_kind/typed_ir_kind/line/word_count/call_ord/call_target/resolution_kind` 等) 一次性打平输出, 形成机器可解析、可跨会话对比的失败指纹, 而非一句自由文本报错。
- `tools/zc_enumerate.sh:20-22` 与 `:1002` 的"诚实门": `count==0` 但没有产出 `.o` 文件 = 编译在 census 运行前就硬中止 (假绿), 脚本必须打印 `ABORT` 并以非零码退出, **绝不能把这种情况报告成 `enumerated=0`**; 代码里第 93/344/561/567/742/749/754/791/794/946/955/961/971 行等十余处一致地把任何提前中止路径映射到 `zc_missing_function_count=ABORT` 而非 `0`。
- 结果缓存层 (`tools/zc_enumerate.sh:24-39`) 只对真正跑到 `zc_status=completed` (即通过了全部诚实门) 的运行落盘缓存, ABORT/假绿永不进缓存——避免"污染态被当作正确态复用"。

**与现有技术的区别**:
- 大多数编译器的"诊断报告"是**尽力而为、无完整性契约**的 (rustc `--error-format=json` 收集多个错误但没有"是否完整枚举"的机器可验证承诺); 本方案把**"0 条失败"这个断言本身的可信度**做成了一个显式、可执行的门禁 (是否产出目标产物作为交叉印证), 是诊断报告自身正确性的自证明架构, 不是错误信息本身。
- 与静态分析工具的"覆盖率报告" (如 gcov) 不同: gcov 度量代码是否被执行, 本方案度量的是**编译器自身对输入语言子集的支持完备性**, 且用统一 bail 号对每个"未支持"路径分类、可跨版本做回归差分 (`tools/zc_census_diff.sh` — cheng-fusion 侧)。

**权利要求方向**:
- 方法权项: 一种编译器自完备性验证方法, 包含 (a) 对全部输入以无提前中止方式扫描并收集失败集合, (b) 为每类失败赋唯一分类号并输出结构化上下文指纹, (c) 将"扫描得到零失败"这一结论与"是否产出目标产物"做交叉验证, 若产物缺失则强制标记为不可信中止而非零失败, (d) 只对通过交叉验证的运行结果做内容寻址缓存。
- 系统权项: 落地该方法的编译器诊断/CI 门禁子系统。

**等级+理由**: A。这是"编译器如何诚实报告自己不完整"这一较少被专利化的问题域, 且有具体、可展示的三条独立证据链 (旧探针数字矛盾史料、字段级指纹结构、ABORT 强制码路径), 组合起来的自证明门禁设计有清晰新颖性。

---

## 候选 3 (A): 语义级函数粒度增量编译跳过缓存 (funcEmitCid 7-tuple + 双重校验)

**解决的技术问题**: 传统增量编译缓存 (ccache/sccache) 以预处理后源文本或编译命令行整体作为缓存键, 粒度粗 (整个翻译单元), 且命中后直接信任缓存产物, 一旦哈希算法覆盖不全 (漏掉某个影响产物的输入) 会静默复用错误二进制。

**技术方案要点**:
- `src/core/tooling/compile_skip_cache.cheng:12-21` 冻结契约: `funcEmitCid = sha256(codegenEpochSalt, targetTriple, typedFnCanonicalHash, sourcePathHash, callTargets(sorted), callImportcSymbols(sorted), calleeAbiViews(per-fn 窄视图))` — 键粒度是**单个函数**, 且显式把"被调函数的窄 ABI 视图" (calleeAbiViews) 纳入哈希输入, 使得被调函数签名/ABI 形状变化也能使调用者缓存失效, 而不需要整模块失效。
- `compile_skip_cache.cheng:61` 注释: "绝不降级成 miss 回磁盘", "funcEmitCid 语义哈希命中 ≠ 产物对 (4b-4 同构)" — 命中后仍要走 `contentCid` 二次校验 (行 71: "空 funcEmitCid/contentCid = panic, 空键碰撞 = 任意函数命中他人机器码"), 即**双哈希校验**: 一层语义级 cid 决定是否命中, 命中后用独立的内容哈希核实取出的字节确实对应该 cid, 防止语义哈希设计覆盖不全导致的静默错配。
- `compile_skip_cache.cheng:35-38` 分片路径 `<root>/<targetTriple>/<cid[:2]>/<cid>.frag`, miss 走 `Err` 交还现有编译路径 (Let-it-crash 式 fail-closed, 不做启发式兜底)。

**与现有技术的区别**:
- ccache/sccache 的键是**预处理文本/编译参数的整体哈希**, 命中即信任; 本方案键是**类型检查后规范化函数签名 + 排序调用目标 + 被调方窄 ABI 视图**的组合语义哈希, 且**命中后仍做第二重独立内容校验**, 是"语义键控 + 内容复核"的两段式信任模型, 而非现有技术的"一次哈希、直接信任"模型。
- Bazel/Buck 等构建系统的 action cache 同样是命令行/输入文件整体哈希, 未见把"被调函数的 ABI 窄视图"作为独立哈希分量纳入函数级缓存键的先例——这一点专门解决了"调用者签名不变但被调方 ABI 形状变化"这一类缓存失效场景。

**权利要求方向**:
- 方法权项: 一种函数粒度编译产物缓存方法, 缓存键由类型规范化函数哈希、排序调用目标集合、以及被调函数窄 ABI 视图哈希组合而成; 缓存命中后用独立于该键的内容哈希对取出产物做二次校验, 校验失败即硬失败而非静默回退。
- 系统权项: 该缓存方法在自举编译器工具链里的实现。

**等级+理由**: A。7 元组契约里 `calleeAbiViews` 这一分量 + 双哈希互证模型是明确、具体、可对比现有技术差异化的设计点, 代码里有冻结契约注释可直接引用做说明书。

---

## 候选 4 (B): 自举不动点可复核契约 (stage0=stage3 hash 契约 + bootstrap-bridge)

**解决的技术问题**: 自举编译器 (编译器用自身语言写、由前代版本编译出来) 的正确性传统上靠"能不能编出下一代"这种功能性测试验证, 缺乏一个**可复核的、机器可验证的不动点数值证据**来证明"新编译器与上一代在语义上完全等价", 容易在多会话/多分支并行开发时因为源码微小改动导致语义漂移却未被察觉。

**技术方案要点**:
- `tools/ci_gate.sh:34-45`: 第 34 行 `bootstrap-self-check`, 第 37 行 `bootstrap-bridge` 明确注释为 "stage0→stage1→stage2→stage3 fixed point"。
- `tools/ci_gate.sh:32` 打印 `print-contract --in:bootstrap/stage1_bootstrap.cheng` 输出的 `contract_hash` 字段, `src/core/tooling/gate_main.cheng:551,557` 对应 `print-contract` 命令行, 行 400-406 为 stage0-stage3 各自维护独立 `self-check.log`。
- 已验证的具体不动点值 (来自本仓过往会话记录, `CLAUDE.md` "Bootstrap & Self-Hosting Status" 一节): `e202c0c35424eb36`, 四阶段哈希收敛到同一个值即视为不动点达成。

**与现有技术的区别**:
- GCC/LLVM/Rust 的自举验证一般是"stage2 与 stage3 目标码逐字节相同" (即 GCC 的 `compare` 阶段), 是**产物级**(二进制/目标文件)比对; 本方案额外引入一个**契约哈希** (`print-contract` 输出的 `contract_hash`), 是对语言核心语义边界(bootstrap contract 文件本身描述的接口/ABI 承诺)的独立摘要, 与产物级 self-check 分层存在、可分别定位"产物变了但契约没变"或反之的漂移类型, 比单一产物比对粒度更细。

**权利要求方向**:
- 方法权项: 一种自举编译器正确性验证方法, 通过分别计算并比较 (a) 编译器契约摘要哈希与 (b) 各阶段自检日志, 在两个独立维度上确认新一代编译器与上一代语义等价。

**等级+理由**: B。核心思路 (自举不动点) 是 GCC/Rust 长期实践的现有技术, 差异点收窄在"契约哈希与产物 self-check 分离验证"这一具体实现细节上, 建议只作为独立权项而非单独整案主张, 或并入候选 2 作为补充证据链。

---

## 候选 5 (A): 双登记消解——按源码列位置形状探测器解决前端事实层与语句层的重复物化

**解决的技术问题**: 编译器前端常见架构是"事实收集层" (对表达式做归一化打点, 记录调用位置等元信息) 与"语句物化层" (据此产出 IR 语句) 分离, 两层若独立演进, 会出现同一个源位置的调用被两条路径各自登记一次, 导致**副作用型调用被物理执行两遍** (比如 `waitpid`/`Len` 调用被发射两次), 这类 bug 在纯值语义代码里不可见 (等价冗余), 但对副作用调用是静默正确性错误, 传统去重手段 (按语法子树相等去重) 对此类"同一调用节点被两个上游分别识别"的场景不适用, 因为两条路径看到的不是"两个相同子树"而是"同一位置的调用是否已经被另一条路径认领"。

**技术方案要点**:
- `src/core/lang/typed_expr.cheng:22877-22919` (T52-v3/v3.1/v3.2 三轮收窄注释) 完整记录了问题与解法演化: `return <call>` 语句的调用既可能被 `TypedExprIrAddCallStatementFromExpr` (useExpr 分支, kind=Return) 登记, 又可能被下方通用 fact-statement 兜底路径重复登记, 导致该调用在最终机器码里被调用两次 (行 22884-22888 给出真实复现案例: `cheng_pty_wait_bridge` 对 `cheng_pty_wait_runtime` 的 `waitpid` 被物理执行两遍, 第二遍对已收割的 pid 必得 `ECHILD`)。
- 消解算法: 不是简单"列号 >= 某阈值就吞掉整个表达式范围", 而是**严格列号相等** (`currentLineReturnRootColumn`) + 复用一组共享的"顶层表达式形状探测器" (`TypedExprBindingRhsIsTopLevelTernary/HasTopLevelBinaryOperator/IsSeqLiteral/BoolExprType`, 与赋值语句 RHS 分析完全对称复用, 行 22910-22914) 来判定"这个 return 的值是不是裸调用本身"——只有四个探测器全部不命中时才允许该 fact 被 useExpr 路径消费, 否则一律不消费, 留给下游其它路径处理。
- 进一步收窄 (T52-v3.2, 行 22916 起) 还发现"消费"本身要看 callee 是否跨模块限定名——因为 `expr.kind==Return` 分支走的是弱化解析 (只透传原始字段, 不经过 `TypedExprResolveQualifiedCallTargetReturnType` 的限定跨源解析), 消费条件因此还要叠加"是否为该目标唯一登记入口"这一层判断。

**与现有技术的区别**:
- 传统 CSE (公共子表达式消除) / AST 去重解决的是"语法上相同的两个节点合并成一个", 前提是两个节点各自独立存在且语义等价; 本机制解决的是**架构层面两个独立分析 pass 对同一源位置产生的"认领冲突"**, 用**源码列位置 + 复用同一组顶层形状探测器**作为跨 pass 的仲裁协议, 这是一种前端多路径事实层的一致性协议设计, 而非表达式级优化。
- 与"符号表去重"或"SSA 去重"也不同: 后两者作用于同一遍分析内部的重复定义, 本机制作用于**两个时间上/模块上分离的分析阶段**之间的产物对账。

**权利要求方向**:
- 方法权项: 一种在编译器多阶段中间表示间消解重复登记的方法, 包含 (a) 记录候选调用事实的源码列位置, (b) 用一组预先定义的"顶层表达式形状探测器"判定该位置的语句是否为裸调用, (c) 仅在严格位置匹配且全部形状探测器均不命中时, 允许某一分析路径独占消费该事实, 避免副作用调用被下游兜底路径重复物化。

**等级+理由**: A。问题域 (多遍前端分析间的事实对账, 而非语法去重) 和解法 (列位置 + 共享形状探测器仲裁) 具体且有三轮真实调试记录 (v3/v3.1/v3.2) 佐证, 未见对应现有技术直接覆盖这一细分问题。

---

## 候选 6 (B): 跨文本边界的调用可达性闭包 (对 Fmt 插值参数文本做安全过近似扫描)

**解决的技术问题**: 编译器的可达性分析 (reachability/dead-code elimination 前置步骤) 通常只扫描已解析出的 AST 调用节点; 但当调用出现在字符串插值/宏文本的**嵌套参数文本**里 (例如 `Fmt"...{a.b(c)}..."` 的插值表达式内部又包含调用), 若该插值不会生成独立的"调用事实"记录, 传统可达性分析会漏掉这些调用目标, 将其错误标记为不可达而被裁剪或触发"未就绪"报错。

**技术方案要点**:
- `src/core/backend/lowering_plan.cheng:4942-4946` 注释直接说明动机: "Call facts are not generated for calls nested inside Fmt interpolation...so reachability would skip their targets and leave skeleton rows that fail as not_ready. Scan the raw argument text for every `ident(`/`a.b(` head and mark it — reachability over-approximation is safe."
- `LoweringMarkReachableEmbeddedCallHeads` (行 4947-4998): 对原始参数文本做手写词法扫描 (维护 `inString/inFmtString/inNestedString/inChar/escaped/braceDepth` 等状态, 行 4952-4970), 在每个 `(` 前反向识别标识符边界 (`a-zA-Z0-9_.` 组成的 ident/qualified-ident), 把识别到的调用头交给与常规 AST 路径完全一致的 `LoweringMarkReachableCallHead` (行 4887) 处理——即**文本扫描发现的调用头与结构化 AST 调用头共享同一条标记/解析后端**, 保证过近似发现的目标享有和精确分析同等的限定名解析能力 (行 4896-4916 的 qualifier/leaf 跨模块导入别名解析)。

**与现有技术的区别**:
- 经典可达性分析 (RTA/CHA/points-to) 均建立在**已完整解析的调用图**之上, 对"调用信息本身缺失于结构化 IR 但仍在源码文本层可辨认"这一场景没有标准处理路径; 本机制是**结构化分析与文本级过近似扫描的双通道合流**——文本扫描发现的候选头和 AST 发现的候选头汇入同一个标记/frontier 队列, 且显式论证"过近似安全" (多标记的目标即使实际不可达也只是保守地被保留, 不会引入错误的裁剪), 这是相对于纯结构化可达性分析的一个具体扩展点。
- 这类"文本兜底+ 结构化数据打通复用"的组合在开源可达性分析实现里未见先例 (多数系统选择让宏/插值提前展开为 AST 节点, 而不是保留字符串态再补扫)。

**权利要求方向**:
- 方法权项: 一种混合结构化与文本扫描的调用可达性闭包方法, 对结构化中间表示未记录调用事实的文本区域执行受限词法扫描以识别候选调用头, 并将其接入与结构化调用头相同的目标解析与标记流程, 以安全过近似方式扩大可达闭包, 防止真实可达目标被误判为死代码。

**等级+理由**: B。思路扎实且有具体状态机代码, 但"字符串扫描找符号"本身工程含量高于理论新颖性, 建议收窄权利要求到"过近似目标与结构化目标共享同一限定名解析后端"这一具体点。

---

## 候选 7 (B): 单遍 emit-first 结构化键回填, 按构造消除预测器/发射器两态失配

**解决的技术问题**: 传统两遍汇编/代码生成 (先用一个"布局预测器"估算每条指令/每个基本块的最终地址, 再据此填充跳转/重定位偏移, 最后按实际发射结果做二次修正) 天然存在"预测态"与"实发态"两份状态, 一旦二者算法逻辑出现哪怕极细微的不一致 (即所谓 predictor/filler desync), 就会产生**静默错误的跳转目标/重定位偏移**, 在自举编译器场景下这类 bug 尤其致命 (自己编自己, 错误会被同构地放大)。

**技术方案要点**:
- `src/core/backend2/backend2_emit.cheng:1-16` 注释: "分支目标用「发射时记录的 real block start + 前向边 fixup」解算, 彻底消除 predictor↔filler 两遍布局的 desync 杀手"; "§③e 铁律: 没有第二遍, desync 类断言按构造消失 (wordCount == cursor 恒真)"。
- `src/core/backend/primary_object_plan.cheng:683-707` "Step B (call-BL emit-first)": 重定位偏移量通过一个**结构化键** (structural key, 由调用点的语法位置而非预测地址派生) 直接从真实发射游标写入 `relocWordOffsets`/`dataRelocWordOffsets`, 而不是先由预测器算出预测偏移再做事后核对。
- `primary_object_plan.cheng:923` 明确写道: "The arm64 size predictor is DELETED: there is no predicted layout to trust or to A/B against."——即不是"加一层校验去抓 desync", 而是**从架构上删除预测器这一状态**, 使得"预测与实发不一致"这类 bug 从设计上不可能发生 (无预测则无法失配)。
- 保留的负向测试开关 (`primaryDataRelocRewriteDisabled`、`primaryDataRelocDesyncAssertDisabled` 等, 行 972-998) 仅用于人为注入扰动做回归测试, 生产路径永远为 false, 侧面印证该设计的验证方法论。

**与现有技术的区别**:
- "单遍汇编 + 前向引用回填 (backpatching)" 是编译原理教科书级经典技术 (Dragon Book 一章内容), **本身不构成新颖性**; 差异点必须收窄在**"用源码位置派生的结构化键而非预测地址索引重定位表项, 并把预测器整体删除而非仅做双态一致性校验"**这一具体架构决策上——这是相对于"两遍布局 + A/B 校验"这一常见工程折中方案(仍保留预测器只是加验证)的进一步简化, 属于"设计取消一个可能出错的状态维度"而非"检测该状态维度的错误"。

**权利要求方向**:
- 方法权项: 一种代码生成期重定位方法, 不预测目标地址, 而是以调用/引用点在源表示中的结构化位置作为键, 在实际发射游标经过该位置时直接记录偏移量并据此回填, 从架构上消除预测态与实发态并存导致的失配类缺陷。

**等级+理由**: B。基础思想 (单遍 + 回填) 是现有技术, 但"用结构化位置键取代预测地址索引 + 整体删除预测器"这一具体工程决策在自举编译器语境下有明确差异化空间, 需要收窄权利要求措辞才能站住。

---

## 候选 8 (B): 默认禁指针 + 显式 C ABI 视图边界类型 (SABI: utf8_view/bytes_view/cstring/owned_cstring)

**解决的技术问题**: 语言互操作 (FFI) 传统上要么完全暴露裸指针给用户代码 (C/C++/Rust unsafe), 要么完全禁止直接内存交互但也无法高效桥接 C ABI (纯托管语言经 marshaling 层, 有额外拷贝开销); 需要一种默认对用户代码完全隐藏指针语义、但仍能对 C ABI 边界做零拷贝只读传递的折中方案。

**技术方案要点**:
- `docs/cheng-formal-spec.md:50` "no-pointer 生产门禁": 默认公开编译口径下, 用户源码模块默认禁指针, `@importc/@exportc` 也不再豁免 (即使是 C ABI 声明也不能绕开该门禁本身, 只是门禁对这些声明的检查规则不同)。
- 行 52-53: 禁用类型 `T*/void*/ref T/ptr[T]`, 禁用操作解引用/取址/`dataPtr/getPointer/ptr_add/load_ptr/store_ptr/copyMem/setMem/zeroMem/alloc/dealloc`, 违规诊断固定为 `no-pointer policy`。
- 行 480-482 (`docs/cheng-formal-spec.md`): `str` 值语义类型本身**不得**作为裸 C ABI 参数/返回值, 必须显式选择 `utf8_view` (只读 UTF-8 (ptr,len), 仅 C ABI 参数可用, 调用期有效, C 侧不得保存) 或 `bytes_view` (只读 bytes (ptr,len), 不承诺 UTF-8) 等边界类型; `src/core/lang/parser.cheng:3655-3656` 与 `src/core/lang/typed_expr.cheng:2565-2566,14210,17561-17572` 证实解析器/类型检查器对这两个类型名有专门识别与处理路径, 非文档空想。
- 行 551-552: `str -> cstring` lowering 必须保持作用域生命周期, 遇内嵌 NUL 必须 hard-fail 禁止静默截断; C 侧不得直接构造内部 24 字节 `str` 布局, 也不得让 `utf8_view/bytes_view` 指针越过调用返回逃逸。

**与现有技术的区别**:
- Rust 的 `&str`/`&[u8]` 借用切片本身就是"只读视图 + 生命周期"设计, **相似度较高**, 是本候选新颖性的主要现有技术风险点; 差异点在于 Cheng 把这套视图类型**限定为仅在 C ABI 边界可见** (普通业务代码里完全见不到指针/视图概念, `docs/cheng-formal-spec.md:519` "业务文本类型仅 `str`", 视图类型是纯粹的 ABI 边界方言), 而 Rust 的借用切片是全语言通用的核心特性, 不是边界专属方言; Cheng 的方案更接近"host 语言完全值语义 + FFI 边界单独一套受限视图子语言"的分层策略, 与 Rust "一套借用规则贯穿全语言" 不同。
- 与 Python/JVM 的 JNI/ctypes marshaling 相比, 后者通常隐式拷贝或需要手写 marshaling 代码; 本方案是编译期静态检查的显式类型标注 (view/cstring/owned_cstring 四选一, 未声明桥接语义直接 hard-fail, 见 `docs/cheng-formal-spec.md:680`), 零拷贝且编译期保证。

**等级+理由**: B。与 Rust 借用切片思想接近, 差异点 (仅限 ABI 边界的独立方言 + 强制显式四选一 + 编译期 hard-fail) 需要在权利要求里明确收窄, 否则新颖性风险较高。

---

## 候选 9 (B): 默认移动 + var 隐式取址可变借用 + 逃逸标注的所有权模型

**解决的技术问题**: 需要一种比"引用计数默认拷贝"更省开销、又比"完整生命周期借用检查器" (Rust) 更轻量的所有权/别名安全模型, 同时保留调用方书写体验上的"传值"语法而非强制显式取址。

**技术方案要点**:
- `docs/cheng-formal-spec.md:44` "默认 move": 赋值/参数传递/返回默认移动所有权, 原值语义上视为已移走。
- 行 45: "可变借用": `var` 形参/绑定表示可变借用 (不转移所有权、不增加引用计数), 生命周期限定在调用/作用域内不得逃逸; **调用侧对 `var` 形参自动取址** (lvalue 被自动降级为 `&`), 用户书写时看不到取址符, 显式 `&` 只留给指针互操作等特殊场景。
- 行 58: 追踪范围——`var` 形参作为借用源, `let/var` 绑定或赋值若 RHS 为借用视图则新变量标记为借用 (同作用域 reborrow)。
- 行 60: 逃逸规则——借用值禁止 `return/yield`、禁止写入全局、`share(x)` 禁止接收借用值, 且默认不能传给非 `var` 形参 (默认 move), 仅当目标函数显式标注 `@borrows` 时允许, 标注 `@escapes` 的函数在调用处仍拒绝借用值 (双重保险, 而非单侧标注)。
- 行 47: `share(x)`/`share_mt(x)`/`Arc[T]` 显式区分单线程共享与跨线程原子共享, 不做隐式拷贝。

**与现有技术的区别**:
- 相较 Rust 借用检查器 (基于生命周期参数/NLL 的通用别名分析), 本方案把"可变借用"收窄为**仅通过 `var` 形参这一种语法入口**, 且**调用侧自动取址、被调侧无需处理生命周期参数标注**, 复杂度显著更低 (代价是借用只能是"调用期内", 无法表达跨调用生命周期的借用, 这是有意识的简化而非缺陷); 与 C++ 引用 (`T&`) 相比, 多了显式的"逃逸禁止 + `@borrows`/`@escapes` 双向标注"这一层编译期强制检查, C++ 引用没有这类逃逸静态检查。
- 与 Swift 的 `inout` 参数相比 (Swift `inout` 也是调用点自动取址的可变借用), 差异点在于 Cheng 额外叠加了"默认 move 语义" (Swift 默认是引用计数/值拷贝语义, 不是 move) 和显式的 `@borrows`/`@escapes` 函数级契约标注, 是"move 语义基座 + inout 式借用语法糖 + 双向逃逸契约标注"的组合, 三者叠加的组合在主流语言里未见完全一致的先例。

**等级+理由**: B。与 Swift `inout` / C++ 引用有较高相似度, 组合方式 (move 基座 + 自动取址借用 + 双向逃逸标注) 是差异点, 但单独任一元素都能找到较近现有技术, 建议整体作为"所有权模型组合"打包权项而非拆分单点主张。

---

## 候选 10 (C): 掩码字节双工具链交叉验证 (冷 C oracle vs 自举后端, LC_UUID/签名掩码后逐字节比对)

**解决的技术问题**: 自举/多代编译器需要验证"新后端产物与已知正确产物是否等价", 但目标文件里包含构建环境相关的非确定性字节 (UUID、代码签名), 直接逐字节 diff 会被这些噪声字段淹没真实差异。

**技术方案要点**:
- `/Users/lbcheng/cheng-fusion/tools/macho_masked_cmp.py:1-42`: 解析 Mach-O load commands, 对 `LC_UUID` (cmd=0x1b, 掩码其后 16 字节) 与 `LC_CODE_SIGNATURE` (cmd=0x1d, 按 `dataoff/datasize` 掩码整个签名数据区) 做零填充后再逐字节比较, 头部注释直接引用来源依据 ("同树双烤实测唯二差异区")。
- 配合 `cold_regression_ab.sh` (同仓 `tools/`) 做"同一 clone、同一提交, 仅切换一个 patch 的 git apply/apply -R 状态, 分别跑两套二进制的回归套件再比对日志"的 A/B 方法论, 头部注释记录了该脚本沉淀自两次人工战役踩过的 5 个具体坑 (含"PATH 上的 diff 是恒 exit 0 的 DevEco shim, 必须硬钉 `/usr/bin/diff`"这一具体环境陷阱)。

**与现有技术的区别**:
- Reproducible Builds 项目的常规做法也是"掩码时间戳/UUID 等非确定性字段后逐字节比对", 这属于已公开的现有技术方法论, **本候选新颖性很低**, 主要价值在于"针对 Mach-O 格式的具体掩码区间选择 (LC_UUID 偏移+16字节, LC_CODE_SIGNATURE 由 dataoff/datasize 动态定位)"这一实现细节, 以及与自举编译器双工具链 (冷 C oracle vs Cheng 自举后端) 场景的结合。

**等级+理由**: C 偏 B 下限。掩码字节比对本身是公开方法论 (reproducible-builds), 建议不单独立案, 可作为候选 4 (自举不动点) 说明书里的辅助验证手段带过。

---

## 候选 11 (C): 编译器战役工程方法 (tree_guard / census 差分 / 探针电池)

**技术方案要点**: `cheng-fusion/tools/tree_guard.sh` (131 行, 检测并发会话对共享文件的意外改动)、`zc_census_diff.sh` (127 行, 对两次 census 结果做结构化差分) 等工具确实存在且被日常使用, 但其本质是**工程流程工具化** (把人工反复执行的操作固化成脚本), 不构成算法层面的新方法。

**等级+理由**: C。如实定级为弱候选, 不建议单独申报, 可选择性地作为附属方法权项挂在候选 2 (诚实编译架构) 说明书的实施例部分。

---

## 申报顺序建议

1. **候选 1 (CsgNormalizedGraphCid)** — 算法自包含、代码证据最完整 (461 行独立文件), 与现有内容寻址技术差异点最清晰, 建议第一顺位单独申报。
2. **候选 3 (funcEmitCid 7-tuple 双重校验缓存)** — 契约冻结、差异点具体 (calleeAbiViews 分量 + 双哈希互证), 第二顺位。
3. **候选 5 (双登记消解列位置协议)** — 有三轮真实调试记录支撑问题真实性, 建议第三顺位, 但需注意此机制目前仍在"落地中"状态 (T52 系列在 `docs/pending-work-ledger-2026-07-14.md` 中记录为"消费链战役"仍有增量在飞), 申报前应等待该机制稳定收口, 避免权利要求描述与仍在演进的实现脱节。
4. **候选 2 (诚实编译架构)** — 新颖性强但更偏方法论, 与候选 10/11 打包成一份说明书的不同实施例, 第四顺位。
5. 候选 4/6/7/8/9 作为二线候选, 视预算与代理人评估再决定是否单独立案或并入前述申请的从属权项; 候选 10/11 不建议单独申报。

## 风险提示

- **开源披露对新颖性的影响 (需要法律团队核实, 本盘点不替代专利检索/律师意见)**:
  - 若 `/Users/lbcheng/cheng-lang` 仓库当前或历史上任何时刻曾经公开 (public GitHub 仓库、公开 CI 日志、公开博客/论文引用过具体实现细节), 上述候选中任何已被公开描述的技术点都可能落入**新颖性丧失**风险, 多数法域 (含中国) 对"自己此前公开"的宽限期极短且条件严格 (中国专利法第 24 条的宽限期仅限特定情形: 国家出现紧急状态或非常情况、在中国政府主办或承认的国际展览会上首次展出、在规定的学术会议或技术会议上首次发表、他人未经申请人同意而泄露其内容, 均为 6 个月内; 普通开源发布/公开仓库推送**不属于**上述任一情形), 因此**若仓库已公开且无上述法定情形, 相关技术点很可能已经丧失新颖性, 无法再申报**。
  - 需要立即核实: 该仓库的 remote 是否为 public GitHub/GitLab, 以及具体每个候选点对应代码首次提交/公开的时间。本次盘点未做该项核实 (超出只读代码审计范围, 需要访问 git remote 权限设置与仓库可见性历史), **强烈建议在提交任何专利申请前, 由用户或法务确认仓库可见性状态与首次公开时间**。
  - 若确认从未公开 (纯私有仓库、从未推送到公开托管平台、从未在公开渠道描述过实现细节), 则上述新颖性丧失风险不适用, 可正常申报。
  - 建议动作: 申报前对候选 1/3/5 (A 级) 至少完成一次内部检索 (关键词: content-addressed graph hash SCC reorder invariant; function-level compile cache callee ABI view double hash; multi-pass fact deduplication column position), 排除近似在先申请; 同时对仓库可见性状态做一次实际核查 (`git remote -v` + 托管平台可见性设置), 而非仅凭假设判断。
