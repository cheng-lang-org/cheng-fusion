# CSG 介绍

CSG 是语言无关的编译事实层。它把源码语义整理成结构化 facts，让不同语言前端、Cheng/cold 后端和外部应用用同一套合同交接。

它不是源码到源码转译，也不是字符串重写。CSG 的核心目标是：语义一旦进入 facts，就必须可校验、可复现、可失败，后端不能再从源码文本里猜含义。

CSG-Core 的 `facts_root` 使用内容寻址 Patricia Merkle DAG。每条 canonical fact 有独立 `fact_hash`，有 `id` 的 fact 以 `id:<id>` 定位，无 `id` 的 fact 以 kind 与 fact hash 定位；输入顺序和编辑历史不影响根。局部校验只需要目标叶和兄弟路径证明，增量插入、替换、删除可从同一证明直接回算新根，再与完整图根对拍。

## 输出格式

CSG 生产主格式是二进制 CSGC，不是 JSONL。

```text
*.csgc     CSG-Core / dialect / relfacts 主产物
*.csgwebc  CSG-Web 主产物
*.json     report / manifest / proof
*.jsonl    仅限 debug/export/legacy 对拍
```

文档里的 JSON 片段只用于说明逻辑 fact 形状。真实落盘和跨工具传输优先使用 `.csgc` / `.csgwebc`。新功能若默认输出 JSONL，视为格式方向错误。

## 为什么需要 CSG

Cheng 当前要同时处理几类输入：

- Cheng 源码。
- TypeScript/React/Web 项目。
- Rust/Codex 迁移对象。
- 后端自举和 cold 编译链路。

如果每条链路都直接接后端，会把 parser、typechecker、layout、ABI、runtime provider、object writer 混在一起。CSG 把边界切开：

```text
Language source
  -> language extractor
  -> csg_core facts
  -> csg_dialect::* facts
  -> csg_abi::<target>
  -> csg_backend_ir
  -> backend artifact
```

前端负责本语言语义；CSG 负责把语义变成可验证 facts；后端只消费已经闭合的 facts。

## 对 AI 原生编程语言的作用

AI 原生编程语言的核心问题不是“让 AI 写更多代码”，而是让 AI 生成、修改、验证和执行代码时有可检查的语义事实。CSG 就是这层事实合同。

它提供五个能力：

- 语义锚点：AI 不再只操作源码字符串，而是操作 module、symbol、type、cfg、op、call、data、runtime requirement 这些结构化事实。
- 可验证生成：AI 生成的代码必须导出确定性 facts，通过 schema、类型、layout、ABI、unsupported 和 runtime closure 检查后才能进入后端。
- 精准修改：重构、补全、迁移和自动修复可以对 facts 做 diff，知道改动影响了哪些函数、类型、调用、provider 和副作用。
- 可执行意图：GUI、Computer Use、agent task 不是靠截图猜动作，而是从 facts 里拿 semantic id、typed action、guard、trace，再进入同一事件系统。
- 可回放审计：每次 AI 变更和执行都能记录 facts root、semantic diff、runtime requirement、artifact hash 和 receipt，失败能定位到具体未闭合语义。

所以 CSG 是 AI 原生语言的中间真相层：

```text
human intent / AI intent
  -> source edit
  -> CSG facts
  -> validate / diff / plan / prove
  -> runtime action or native artifact
  -> receipt / report
```

没有 CSG，AI 只能在文本、截图和日志之间猜。引入 CSG 后，AI 只能在语义闭合的 facts 上继续推进；缺语义就 hard-fail。

## 核心分层

### csg_core

`csg_core` 是语言无关的通用语义 facts。它描述源码语义，不描述某个 CPU 的机器指令。

它应该表达：

- module/import/export。
- symbol/type/layout。
- function/cfg/op/call。
- data/reloc/debug_map。
- runtime_requirements。
- unsupported/report。

`csg_core` 的关键约束是：op 必须是 typed canonical operation，不能把源码字符串当语义塞进去。

### csg_dialect::*

Dialect 是领域扩展。通用层只定义 `csg_core`，领域事实通过 `csg_dialect::*` 增加。

```text
csg_core       通用语义 facts
csg_dialect::web   TypeScript/React/Web facts
csg_dialect::c     C 迁移 facts
csg_dialect::python Python 迁移 facts
```

Dialect 可以增加字段，但不能复制一套新的 core，也不能改变 core 字段含义。
`rust-csg-core` 与 `codex/src` 当前是迁移实现，不等于 Rust dialect facts producer；标准只登记存在真实 producer 和精确 validator 的 profile。

### csg_abi::<target>

`csg_abi::<target>` 把 `csg_core` 和 dialect facts 降成目标后端能消费的 ABI facts。它固定 target triple、object format、pointer width、endian、类型布局、调用约定、reloc kind、provider/archive 输入。

这一层的职责是 ABI 和 object 合同，不是重新解释源码语义。

### CHENG_CSG

`CHENG_CSG` 只保留为 legacy public object-facts wire magic。它已经接近 object writer 输入，不是通用语义层，也不是架构层名称。

典型内容：

```text
CHENG_CSG
R0001 target triple
R0002 object format
R0003 entry symbol
R0004 function records
R0005 instruction words
R0006 relocation records
R0007 data records
R0008 data relocations
```

`CHENG_CSG` 可以作为 legacy cold backend 输入兼容层，但不能替代 `csg_core`、`csg_dialect::*` 或 `csg_abi::<target>`。其它语言 extractor 不应该直接负责 CPU 指令选择，除非它已经完成了明确的 lowering/codegen 合同。

### CHENGCSG

`CHENGCSG` 是 internal BodyIR snapshot，只用于 cold 自检。它不属于公开 CSG 接口，也不能作为 public writer 的成功格式。

公开路径应该使用 `csg_core -> csg_dialect::* -> csg_abi::<target> -> csg_backend_ir`。`CHENGCSG` 不能作为架构名或成功格式。

## 失败模型

CSG 的基本原则是 hard-fail。

必须失败的情况：

- unsupported 语义未闭合。
- symbol/import/call 未解析。
- type layout、slot、reloc 越界。
- facts magic、schema、record 长度错误。
- ABI、target、object format 不匹配。
- provider/archive 缺失或 hash 不一致。
- runtime requirement 没有显式实现。

禁止：

- fallback。
- stub。
- mock。
- 静默忽略。
- 用默认值假装成功。
- 从源码字符串二次猜语义。
- 用后处理补丁补救不完整 facts。

`complete:false` 的 report 必须阻断 lowering 和 artifact 生成。

## 最小合法子集

跨语言最小 CSG-Core 子集是：

```text
module
function main() -> i32
block entry
return i32_literal
```

降到 Darwin ARM64 `csg_abi::<target>` facts 后，本质等价于：

```text
target = arm64-apple-darwin
format = macho
entry = _main
function _main
instruction words:
  movz w0, literal
  ret
```

这个子集也必须是真语义闭合。超出当前已实现 op/layout/runtime 的内容必须失败，不能用空函数或固定 exit 0 冒充通过。

## Web 路线

CSG-Web 用于 TypeScript/React/Web 项目。链路是：

```text
TS / React
  -> ts-csg --emit csg-web
  -> CSG-Core / CSG-JS / CSG-Web facts
  -> Cheng JS/Web Runtime
  -> Cheng React-compatible Runtime
  -> Cheng DOM / CSSOM / Event / Layout / Paint / Raster
  -> Cheng Surface Provider
```

浏览器只能作为 oracle 对拍 DOM、布局、事件和截图，不能作为主线运行依赖。JSX 也不能直接转 GUI 控件，必须保留 Web 语义 facts，由 Cheng runtime 闭合。

## Computer Use 作用

CSG 在 Computer Use 里的作用是把界面从“屏幕像素”提升成 typed control surface。Agent 不应该靠 OCR、坐标点击或改 CFG 跳转来操作自有界面，而应该调用 facts 里声明过的语义动作。

CSG-Web 当前相关 facts：

```text
csg_core::control_surface
csg_dialect::web::control_surface
csg_dialect::web::computer_use_action
```

`csg_dialect::web::control_surface` 从 DOM/template facts 中抽取可控节点和动作，核心字段包括 role、label、stateRef、actionKind、payloadSchema、effect、guard、trace。`csg_dialect::web::computer_use_action` 再把 control surface 映射成可供 agent 调用的 typed action。

正确链路是：

```text
CSG-Web DOM facts
  -> control surface facts
  -> computer-use typed action
  -> runtime event system
  -> 业务逻辑
```

关键约束：

- `Click`、`SetText`、`Select`、`SelectFile` 等动作必须来自 facts，不能临时猜控件。
- Runtime 把 typed action 降到同一事件系统，不能绕过业务逻辑直接改内存或状态。
- 每个 action 必须带 payload schema、guard、trace。
- 高风险动作必须有确认 gate。
- `visualClickFallback` 必须是 false；视觉点击只能做外部 oracle 或人工兜底，不能成为主线语义。

这样 Computer Use 比纯视觉点击更快，也保留权限、审计、事件一致性。未抽出 control surface 或 provider 未接入时必须 hard-fail。

## Cold 路线

cold CSG 用于把已存在的 object facts 快速变成 `.o` 或可执行文件。

```text
Cheng full compiler:
  source -> parser -> typed_expr -> lowering -> csg_abi::<target> facts

cheng_cold --csg-in:
  load facts -> verify schema/ABI/hash -> emit object/exe
```

cold reader 不做语义 lowering、不做类型推导、不扩展 import 闭包。facts 必须已经完整描述生成 object 所需的信息。

## 验收标准

任一 CSG 链路都不能只证明文件写出来了。最低验收是：

- 同一输入重复导出 facts 字节一致。
- 生产 facts 使用 `.csgc` / `.csgwebc` 二进制；JSONL 只能是显式 debug/export。
- schema、record kind、payload 长度校验通过。
- unsupported 输入非零退出。
- report 的 counts、facts_root、unsupported、runtimeRequirements 和 facts 对齐。
- membership/non-membership proof 可脱离全量 facts 验证，坏路径、方向、计数、兄弟 hash 或 fact hash 必须失败。
- insert/replace/delete 的 proof replay root 与完整图重算 root 完全一致。
- Computer Use 链路中 control surface、computer-use action、guard、trace 覆盖率和 report 对齐。
- `csg_abi::<target>` / legacy `CHENG_CSG` 输入 cold backend 后生成真实 object。
- object 链接成真实可执行文件并运行，退出码或 marker 与源码语义一致。

常用入口：

```sh
tools/csg_core_conformance_test.sh
tools/cold_csg_roundtrip_test.sh
```

TypeScript/React 相关入口：

```sh
cd ts-csg
npm run smoke:csg-core-conformance
npm run smoke:csg-web
npm run smoke:web-projects
```

## 读文档顺序

先读本文，确认 CSG 的边界和失败模型。

继续读：

- `docs/csg-core-standard.md`：CSG-Core、profile、conformance、ABI 方言的标准定义。
- `docs/csg_web_plan.md`：CSG-Web 和 Cheng Web runtime 路线。
- `docs/cold_csg_plan.md`：cold CSG 执行方案、provider/archive、阶段验收。

---

## 附录：cold backend 架构速览（原 csg-architecture 合卷）

Cheng 编译器的冷启动后端架构。生产主格式是二进制 CSGC（`.csgc` / `.csgwebc`）。cold backend 兼容层的 public object facts 仍使用 legacy canonical `CHENG_CSG`；internal `CHENGCSG` 只用于 cold 自检快照。

**Pipeline**：Cheng Source → emit-cold-csg → parser → BodyIR/codegen-ready function set → canonical CSG facts。

**权威关系**：facts 物理格式、阶段表与当前进度以 `cold_csg_plan.md`（单一方案文档）为准；CSG 命名空间分层以 `csg-core-standard.md` 为准；gate 通过数以 `tools/cold_csg_roundtrip_test.sh` 实跑输出为准。

具体通过数和当前阶段只看专项文档或实际 gate 输出，不在入门文档里固化。
