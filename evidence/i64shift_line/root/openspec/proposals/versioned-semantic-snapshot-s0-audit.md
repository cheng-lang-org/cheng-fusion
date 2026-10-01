# 版本化语义快照 S0 审计与基线

状态：`complete / apply confirmed 2026-07-22`。这里的“complete”只表示第一阶段审计、红基线、测量合同和结束态口径已冻结，不表示后续实现完成。

## 基线身份

| 项 | 冻结值 |
| --- | --- |
| 仓库 HEAD | `d82ec5fa9d4aeea7b1b8ad44324f46734129e793` |
| LSP artifact | `artifacts/cheng-lsp`, SHA-256 `e13ad8f8949835c413f490118de520ae25f99e63fe508a98eebd7b2b982671a2` |
| backend driver | `artifacts/backend_driver/cheng`, SHA-256 `cbb0136da2dc64b52812b567ec6b48977422efbe3f1a1a568af364de422dfc38` |
| bootstrap stage3 | `artifacts/bootstrap/cheng.stage3`, SHA-256 `a1aeea918558595e7191e78ddf03018ec194629358b41bbd607138ca485cc947` |
| LSP 复现器 | `tools/versioned_semantic_snapshot_s0.py`, SHA-256 `fb3f6f2c9930286f3d3cff7f2b3f87b81da7cf35d3b425860ad434f2508b8dad` |
| LSP 基线报告 | `artifacts/verification/versioned-semantic-snapshot/s0-lsp-baseline.json`, SHA-256 `b06e76deea8c2b94281e3efa4366005d317b307684548dc58483150ab22ba02f` |

工作树在基线时已存在大量并行改动。后续 A/B 不以 HEAD 单独代表源码，必须绑定冻结 source closure manifest；不得覆盖 `typed_expr.cheng`、`compiler_csg.cheng`、CID receipt 与后端的既有改动。

## 完整审计矩阵

| 合同 | 当前可复现基线 | 当前判定 | OpenSpec 结束证据 |
| --- | --- | --- | --- |
| sourceVersion | client `10→9` 被接受；响应无 snapshot binding | RED | 每个 accepted event 分配唯一 int64；倒退/重复 client version 拒绝；四 CID mutation 全杀 |
| 原子发布 | LSP 直接覆盖全局 facts，无 Building/Validated/Published 隔离 | RED | fail-before-publish fingerprint 不变；旧请求取消；candidate owner/borrow/release 平衡 |
| 唯一语义真相 | CompilerFact、LSP、DebugFacts 各自扫描或猜测源码 | RED | production call graph 中三者只投影同一 `csgRootCid`，独立源码扫描调用为 0 |
| 多文件 LSP | 第二次 open 后 Alpha workspace/document 查询均为 0 | RED | 所有已打开及 workspace 文件同时存在，URI/version/snapshot 精确绑定 |
| didClose | Beta 关闭后仍返回 1，Alpha 仍为 0 | RED | overlay 移除触发新 snapshot；Beta=0、Alpha=1，无 stale |
| 精确引用 | Foo 返回 definition、字符串、注释、真实调用共 4 项；其中 2 项假引用 | RED | Reference row 直接保存 SymbolId；字符串/注释命中为 0 |
| range change | 合法 Foo→Bar range edit 后 Bar symbol=0 | RED | incremental sync；按 range 应用且 Bar=1；错误 range hard-fail |
| CompilerFact | production `compilerFactsFromSource` 仍做 outline/line/token rescan | RED | CompilerFact/SemanticFact 是 canonical CSG 的确定性只读投影 |
| DebugFacts | 源码重扫并用 `(line-functionStart)*4` 推 address | RED | runtime PC→emitted op→CSG node→SourceSpan 精确 join，绑定 object CID |
| CSG 完整根 | `canonicalGraphCid` 只覆盖 node/edge，不含完整 TypedIR/reference/ownership/layout/debug | RED | `csgRootCid` 覆盖完整 `csg_core` canonical snapshot |
| 增量缓存 | cache/codec 存在，但 production 无 `CsgeIrCacheGet/Put` 消费点 | RED | exact read-set closure、candidate decoded registry、monotonic frontier；每 fragment 最多 decode 一次 |
| cache 攻击 | 现有 smoke 不覆盖完整 key/bytes/read-set/interface/compiler/target 组合 | RED | 每字段 mutation、trailing bytes、错误依赖、部分 splice 100% hard-fail |
| 冷热等价 | 没有绑定同一源码 trace 的 CSG/facts/object/run 全链对拍 | MISSING | 随机编辑 incremental/cold 的 canonical CSG、facts、两后端 object、运行与 ORC 全等 |
| 正式性能 | 固定 driver 报 `cold_system_link_exec=1/full_backend_codegen=0`，不经过目标主链 | INVALID | current-source full selfhost candidate；同 trace、30+ 次、median/p95、I/O/RSS，输入/工具/输出全哈希 |

`RED` 是已复现缺陷，`MISSING` 是门不存在，`INVALID` 是现有数字路径不具备测量资格。三者都不能记为绿。

## 可重复基线命令

```text
python3 tools/versioned_semantic_snapshot_s0.py \
  --expect current-red --repeat 7 \
  --report artifacts/verification/versioned-semantic-snapshot/s0-lsp-baseline.json
```

该命令驱动真实 LSP 进程，不调用手工 facts 或 mock。apply 结束时同一 trace 改用 `--expect target-green`；语义输出必须稳定，计时只作 LSP 子路径观察，不冒充整体性能结论。

正式编译性能基线必须先运行 current-source full selfhost 构建器，冻结 source closure 后再执行开发循环。任何 `cold_system_link_exec=1` 或 `full_backend_codegen=0` 样本直接剔除并将整组标记 INVALID，而不是算作 cache miss。

现场 current-source 构建已在独立输出目录和 1 GiB observed process-tree guard 下执行。源码 closure 成功冻结，manifest SHA-256=`9cbda22d722f7bc70b76f2a69cb10240739ecd94f1042f936b9fefde9a7fab36`；随后 backend2 sentinel hard-fail：`reason=manifest_mismatch`、`source_count=82`、observed closure root=`d8c1a4c5fcf27e778108aaa99300d3f5f8e671a3ea5a326bc2bd54d068ac273b`。失败报告 SHA-256=`97e38a9d8b64902e1a3c5e39c71fd183f7762a5f82377e61f895880e1a070afb`。因此正式 compiler 性能基线保持 INVALID，禁止绕过 sentinel 或沿用旧 driver 数字。

## 固定开发循环

单次 trace 固定为：打开多文件 workspace → 查询 definition/references/hover/completion → body-only edit → 增量编译 → interface edit → 跨模块 rename → 增量编译 → 一次运行 → 一次 PC/崩溃映射 → 冷构建 oracle 对拍。

采样合同：

- baseline/candidate 使用完全相同的 source event trace、源码 closure、compiler/toolchain/target、机器和 1 GiB 进程树门。
- warmup 不进入统计；有效样本至少 30 次，报告 median 与 p95，不报告最好单次。
- 记录总 wall、各阶段 wall、read syscall/bytes、decode 数、function visit 数、峰值 RSS。
- 每个性能样本先验证 CSG/facts/object/stdout/stderr/exit/debug receipt；不等价样本不得进入性能统计。

## OpenSpec 结束时对比

| 指标 | S0 | 结束门 | 换算 |
| --- | --- | --- | --- |
| production 语义来源 | 至少 3 条独立扫描/猜测链 | 1 个已发布 CSG snapshot | 分叉数至少减少 66.7% |
| workspace facts | last-write-wins，仅最后文档 | 全 workspace、同 version pin | fixture 保留率从 50% 到 100% |
| fixture 假引用 | 2/4 | 0 | 假阳性下降 100% |
| didClose stale | 1 个关闭符号仍可见 | 0 | stale 下降 100% |
| client 版本倒退 | 接受 | 拒绝且状态不变 | mutation kill 100% |
| range edit | 丢失原文 | 精确应用 | fixture 成功率从 0% 到 100% |
| production cache 消费 | 0 个已证明调用点 | 精确 registry/read-set 主链接线 | 不用命中率替代正确性 |
| 整体开发循环 wall | `B` | `C ≤ 0.60B` | 时间降低≥40%；吞吐≥`1/0.60=1.67x` |
| 文件读取 | `R` | `R' ≤ 0.50R` | 至少减少 50%；同工作量 I/O 效率≥2.0x |
| 冷构建 wall | `K` | `K' ≤ 1.01K` | 额外开销≤1% |
| 热/冷正确性 | 无全链门 | exact bytes/receipts/run 全等 | 不用百分比近似 |
| 篡改防护 | 不完整 | 全字段 mutation kill 100% | 任一漏杀即失败 |

“整体效率”只用完整开发循环 wall 表达，验收下限是 `1.67x` 吞吐；局部 cache 的 `10x/20x` 不可折算成整体收益。

## AI 小时整体缩放

初估 `300–450 AI 小时` 的中点是 375。S0 发现完整 CSG root、facts 重写、LSP workspace/版本状态机、decoded registry/reachability、DebugOp/object join 都是结构改造，不是薄适配；整体范围系数冻结为中值 `1.39x`，不确定区间 `1.25–1.45x`。

| 分片 | 完整生命周期 AI 小时 |
| --- | ---: |
| S0 审计、红基线、测量合同 | 18–28（已完成） |
| S1 snapshot/CID core | 70–100 |
| S2 完整 CSG root 与 facts 投影 | 80–120 |
| S3 多文件、版本化 LSP | 60–90 |
| S4 read-set/registry/reachability 增量链 | 90–145 |
| S5 Debugger/backend 精确 join | 45–70 |
| S6 全链等价、性能、ORC 与 archive | 45–75 |

修订总量为 `410–630 AI 小时`，中点约 `520`，相对原中点为 `520/375=1.39x`。扣除已完成 S0，剩余 `390–600 AI 小时`。这是 aggregate AI work，不因并行而减少；S1/S2 schema 冻结前是关键串行路径。
