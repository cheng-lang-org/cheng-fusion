# 纯 Cheng 最小内核与静态组合闭环

状态：`applying / user confirmed 2026-09-03`。用户已明确要求实施“纯 Cheng 最小内核与资源
双极限完成计划”。本提案只在各项动态门真实通过后归档；manifest 通过、静态探针通过或旧
artifact/receipt 存在均不产生完成信用。

## 动机与当前红线

当前 96/96 归属和直接违规为零，只证明 backend 表面 import 已搬运；内核仍经
tooling/shared-format 间接可达架构模块。plugin manifest 已进入请求与真实 plan 的两阶段闭包校验，
四个 composition entry 也已分开，但严格实图仍为 37 个声明源对 201 个 core 可达源并含 13 个 arch
文件，不能计为静态组合完成。现有自举产物含 cold C 闭包，GEN2/GEN3 原始固定点不存在；CSG
pickup 已使用真实 compiler hash，但取回对象仍未进入下一次静态组合。

因此“最小内核”定义为以下同时成立：

1. kernel 入口的真实 `src/core/**` import 闭包不含任何架构实现；
2. kernel 与插件唯一通过版本化 SoA/int32 数据合同耦合，不公开函数裸指针或物理地址；
3. kernel-only、aarch64、x86_64、riscv64 是四个不同 composition root；后三者各且仅含一个插件；
4. 组合 manifest 是编译输入，不是编译后的旁路校验；解析闭包与 manifest 必须精确相等；
5. GEN1 之后不再执行 cold C 编译路径，GEN2/GEN3 原始字节固定；
6. CSG 取回且校验的插件对象进入下一次静态组合，缺件或损坏直接 hard-fail。

## 唯一数据合同

新增或收敛为单一 `codegen_contract` authority，至少承载：

- `CodegenTargetDescriptor`：canonical triple、ABI、object format、pointer/stack/reloc schema；
- `CodegenRequestPlan`：冻结的函数/块/value/reloc/data row 范围与请求 ordinal；
- `CodegenAction/Fragment`：只含标量、固定 CID、arena row、int32 index；
- `CodegenReceipt`：消费的 request/target/plugin/compiler schema CID 与 object byte CID。

TypedExpr、CompilerCSG、BodyIR、regalloc plan 保持 DOD + Arena + SoA；跨节点身份只用精确 int32
索引与不可变 origin/CID。kernel 不按 triple 文本分派架构函数，不按 symbol/name/arity 猜身份。
每个 per-arch composition root 才同时 import kernel 与该架构实现，并把插件结果作为数据回送。

数据/所有权/指针/C 冷链的完整方案（DoD/SoA/Arena/ORC + ZRPC 无指针 + 无 C 冷链）见
`docs/pure-cheng-kernel-zrpc-dod-soa-arena-orc-plan.md`（K6）；执行门禁
`tools/zrpc_kernel_gate.py` + `tools/zrpc_kernel_gate_contract_test.sh`。

## Apply 分片

| 分片 | files | action | verify | done |
|---|---|---|---|---|
| K0 真值硬门 | attribution/closure/manifest/export gates、release receipt | 全 `src/core/**` 图遍历、重复导出、zero compilerHash、schema/CID 篡改负例 | 每类负例非零且判词精确；current tree 真实红 | `cheng.kernel.release.v1` 可重算且不接受历史 receipt |
| K1 正确性基线 | TypedExpr/BodyIR/cleanup/exact-def | 修真实 value-def/consume/CFG 所有权；不做业务 hoist/后端豁免 | ordinary/call/cold/v6 compile=0，run=0/1/0/0 | 四夹具 compile/run 都在进程树硬门内 |
| K2 合同收敛 | codegen contract、kernel callers、arch adapters | 删除间接架构可达边，冻结 target/request/action/fragment | kernel 全闭包 arch=0；架构 token allowlist 精确 | 契约成为唯一耦合面 |
| K3 真实组合 | 四 composition roots、`system-link-exec --composition-manifest` | manifest 精确决定闭包；kernel-only 缺插件由二进制自身报错 | 缺/多插件、闭包漂移、跨插件重复全部 hard-fail | 四根闭包不同；每 arch 根恰一个插件 |
| K4 纯自举 | bootstrap authority、fixed-point gate | C 只产 GEN1；GEN1->GEN2；GEN2->GEN3 | 不同 inode，raw cmp 与 SHA 相等，cold symbols=0 | full_backend_codegen=1、cold_system_link_exec=0 |
| K5 CSG 与发布 | pickup/cache/composition/release gate | 真实 compiler hash 签发；取件落任务 store 并进入下一组合 | online/tamper/offline 三臂与 exec_diff | 全门后才原子发布、接 CI、归档 |
| K6 数据/所有权/指针/C 冷链 | `tools/zrpc_kernel_gate.py`、`platform_contract.cheng`、`ownership_drop_ir`、`bootstrap_from_cheng.sh` | kernel 闭包零指针/零 cold 引用；ORC `alloc==free`/`live=0`；C 只产 GEN1 | gate 三模式绿 + 反事实负例 + 双口径固定点 | `docs/pure-cheng-kernel-zrpc-dod-soa-arena-orc-plan.md` §7 八项同时成立 |

## 组合与闭包强制规则

- 闭包从 manifest 声明的全部 root 出发，解析真实 Cheng import；缺文件、无法解析、重复 key、闭包
  缺项/多项都失败。
- kernel 闭包可达 attribution 中任一 arch bucket 立即失败；shared-format 若导入 arch，同样使 kernel
  失败，不能以“直接 import 为零”放行。
- 架构 token 仅允许出现在 versioned contract 常量和对应插件桶；allowlist 使用 exact file+symbol，
  不能用目录或注释关键词豁免。
- 每一组合内导出符号唯一；全仓历史重复基线只降不升，新重复零容忍。
- kernel-only 接到 emit 请求时，运行中的 kernel 二进制返回
  `codegen_plugin_missing=<canonical-triple>`；shell 不得提前制造该诊断。
- source/object receipt 必须绑定 composition manifest 原始字节与闭包 CID，三架构组合结果必须不同且
  可按同一冻结输入重建。
- 正式 compiler composition report 必须逐项投影 manifest/kernel/closure、held compiler SHA、
  source/semantic/binding receipt、`full_backend_codegen=1`、`cold_system_link_exec=0` 和输出 SHA；
  报告输出必须是 artifact manifest 中的同一普通文件。

## 自举与取件合同

固定同一 composition manifest 与 source closure：种子 C 仅生成 GEN1；GEN1 生成 GEN2；GEN2 生成
GEN3。GEN2/GEN3 必须为不同 inode，原始 `cmp` 和 SHA-256 同时相等。任何 masked Mach-O compare、
self-image copy、旧 stage3 或 `cold_system_link_exec=1` 均失败。符号表和闭包不得含 cold C 实现。

CSG 插件键固定绑定 target descriptor、plugin source CID、compiler binary hash、compiler schema、
composition schema。正常缺键可联网取件；签名、CID、schema 或单字节损坏 hard-fail。在线空缓存必须
完成“取件→校验→任务 store→下一次静态组合→exec_diff”；离线合法任务缓存可组合，离线空缓存
只报告精确缺失 triple 与已安装清单。

## 必杀反事实

1. kernel 新增直接或经 shared-format/tooling 的 arch import；
2. manifest 少一项、多一项、重复项，或解析闭包与声明不等；
3. composition root 零插件或多插件，或两个插件导出同一符号；
4. plugin/compiler hash 为零，缓存 schema/CID/signature 任一翻位；
5. shell 预检替代二进制缺插件错误；
6. GEN2/GEN3 同 inode、只做掩码比较、含 cold symbol 或报告字段漂移；
7. pickup 只下载/缓存但下一次组合不消费；
8. 环境缺 RISC-V/Linux authority 时把 SKIP 计 PASS。

## 完成条件

K0-K6 全部通过当前源码的独立重算，且资源提案的时间/RSS门同时为绿，才允许同步两份计划文档、
替换正式 artifacts/receipts、接入 release CI，并在不覆盖 `cheng-fusion` 脏改的前提下落入正式仓。
归档前必须 Review 全部 diff，重跑反事实门，并确认没有跨任务缓存或未绑定临时产物。
