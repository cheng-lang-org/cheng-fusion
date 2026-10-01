# Cheng 最小内核 Step4 设计：CSG 取件接线（backend2_cid 底座扩展）

> 2026-08-24。上游：docs/cheng-minimal-kernel-plan.md D2 信任模型 + Step 4。
> 本文只做设计，不改代码。语法示例对齐仓库真实 .cheng 风格
> （src/core/backend2/backend2_cid.cheng 380 行实测为准）。

## 0. 底座事实（实测）

- `backend2_cid.cheng` 提供：LE 长度前缀追加族 `backend2CidAppendU32/Text/Texts/I32Seq/Fixed32`、
  `backend2CidBufSha256→layout.FixedBytes32`、`backend2CidBufHex`、字典序
  `Backend2SortStrings`/`Backend2SortCalleeAbiViews`、hard-fail 校验原语
  （`Backend2FragmentVerifyCid/VerifyContent/CacheKeyGuard`，panic + Fmt 报文）。
  域隔离靠首字段文本 tag（"cheng.backend2.funcemitcid" 等）+ 冻结字段序，消 concat 歧义。
- 纯度铁律（backend2_cid 头注）：零 import 编译器状态，只允许 std/coreir/b2t/b2fc，
  全纯函数，fork worker / census / 串行三路径逐字节同结果。取件客户端的**纯值层必须继承此铁律**；
  IO（网络/磁盘）只能住在独立的客户端层。
- `codegen_contract.cheng` 现状：DRAFT，唯一真实代码 `const CodegenContractVersion = 1`，
  并已预留两个 TODO 签名：`CodegenUnitCoversTriple(unitId, targetTriple): bool`、
  `CodegenPluginMissingError(targetTriple, installedUnits): str`（Step 2 verify 所需的
  fail-closed 报文面）。本设计的契约版本绑定直接消费该常量，fail-closed 报文直接落位该 TODO。
- 缓存工程范式先例（csge_ir_cache.cheng 头注，四条硬约束）：①env-gate 根目录；
  ②miss 返回 Err 绝不 fallback；③hit 二次校验防污染；④空 key 拒收 panic。
  分片路径 `<root>/<hash[:2]>/<key>.frag`。本设计全文镜像。
- CSG-Core 面：能力对象交易链，`prove`/`verify-proof` 工具在位
  （csg-core/manifest.json tools 列表），二进制 cargo 为 CSGC，`complete=false` 阻断生产 lowering。
  插件作为 capability 交易对象上链后，取件即一次 capability 领取。

## 1. CID 四元组序列化规范

**语义序 = 序列化序**（D2 句序冻结）：source-closure 哈希 → 编译器哈希 → target triple → 契约版本。
域标签 `cheng.backend2.plugin.pickupcid`（新，与既有四个 backend2_cid 域标签无冲突）。

精确字节配方（对齐 backend2_cid 追加族，逐字段）：

```cheng
var buf: layout.ByteBuf = layout.ByteBufInit(1024)
backend2CidAppendText(buf, "cheng.backend2.plugin.pickupcid")  # U32LE(len)=31 + 31B ASCII
backend2CidAppendFixed32(buf, sourceClosureHash)               # 32B 原始字节
backend2CidAppendFixed32(buf, compilerHash)                    # 32B 原始字节
backend2CidAppendText(buf, targetTriple)                       # U32LE(byteLen) + UTF-8 字节
backend2CidAppendU32(buf, contractVersion)                     # 4B LE
return backend2CidBufHex(buf)                                  # sha256 → 小写 hex str
```

编码细则：

| 项 | 规定 |
|---|---|
| Text | U32LE **字节**长度前缀（非 rune 数、非 NUL 结尾）+ 原始 UTF-8 字节，镜像 backend2CidAppendText |
| Fixed32 | 32B 原始字节直排（ByteBufAppendFixed32），无前缀 |
| U32 | 4B LE（backend2CidAppendU32） |
| 输出 | `sha256` 一次，小写 hex `str`（与 funcEmitCid 同形），命名 **pickupCid** |
| 尾部 | 无 padding、无分隔符；哈希输入恰为上述字节序列 |
| 确定性 | 无列表字段故无排序需求；无时间/环境熵；fork/串行同结果 |

构造期守卫（hard-fail，镜像 Backend2ComputeFuncEmitCid 的空串 panic 风格）：

- `targetTriple == ""` → `panic("csg_pickup_cid_empty_target_triple")`
- `contractVersion < 1` → `panic("csg_pickup_cid_bad_contract_version")`
- `sourceClosureHash` / `compilerHash` 为全零 FixedBytes32 →
  `panic("csg_pickup_cid_zero_closure_or_compiler_hash")`（需新增
  `Backend2CidFixed32IsZero(value: layout.FixedBytes32): bool` 逐字节比较原语，落 backend2_cid）。

成分来源定义：

1. **sourceClosureHash**：对该 codegen 单元源闭包做 Backend2SemanticEpoch 同范式派生
   （backend2_types.cheng:96 先例：sentinel 把自身返回字面量归一为占位消除自引用，
   其余 source/import/ABI/codec 变化自动翻转）。per-unit 一个 sentinel，宿主见开放问题 #6。
2. **compilerHash**：产出或消费该插件的编译器可执行文件原始 SHA-256。生产消费
   只能从 held-exec 保持打开的 executable fd 读取，必须与生产准入回执中的
   `executableCid` 相等；禁止用路径、argv、环境变量或零值代替。
3. **targetTriple**：target_matrix.cheng 权威判定的三元组原文。
4. **contractVersion**：codegen_contract.cheng `CodegenContractVersion`（§5）。

## 2. 取件客户端 API 面

分层：纯值层 `src/core/backend2/backend2_plugin_cid.cheng`（新，继承零编译器状态铁律）+
客户端层 `src/core/backend/csg_plugin_pickup.cheng`（新，kernel 桶，唯一持 IO 的取件入口）。
backend2_cid.cheng 增加 4 个一行转发别名（纯布局零行为）：
`Backend2CidAppendU32 / Backend2CidAppendText / Backend2CidAppendFixed32 / Backend2CidBufSha256`，
供纯值层复用同一 append 族（备选方案与取舍见开放问题 #5）。

### 2.1 纯值层签名草案

```cheng
import std/result
import std/rawbytes
import cheng/std/bytes_layout as layout

const
    PluginPickupOriginChain: int32 = 1     # CSG 链签发
    PluginPickupOriginLocal: int32 = 2     # 本地构建

type
    PluginPickupReceipt =
        origin: int32
        pickupCidHex: str                       # 自指字段，decode 后重算比对
        sourceClosureHash: layout.FixedBytes32
        compilerHash: layout.FixedBytes32
        targetTriple: str
        contractVersion: int32
        artifactByteCount: int32
        artifactSha256: layout.FixedBytes32     # 字节门锚点
        provenanceSignerId: str                 # chain: 签发者；local: 恒 "local"
        provenanceProofCid: layout.FixedBytes32 # chain: 证明对象；local: ==artifactSha256

@borrows
fn Backend2ComputePluginPickupCid(sourceClosureHash: layout.FixedBytes32,
                                  compilerHash: layout.FixedBytes32,
                                  targetTriple: str,
                                  contractVersion: int32): str

fn Backend2ContentSha256OfBytes(data: var rawbytes.Bytes): layout.FixedBytes32
# 字节门原语 = hash256.Sha256Fixed(layout.ByteSpanFromBytes(data)) 的命名封装

@borrows
fn PluginPickupReceiptMake(origin: int32,
                           sourceClosureHash: layout.FixedBytes32,
                           compilerHash: layout.FixedBytes32,
                           targetTriple: str,
                           contractVersion: int32,
                           artifact: var rawbytes.Bytes,
                           signerId: str,
                           proofCid: layout.FixedBytes32): PluginPickupReceipt
# 内部：算字节门 + 算 pickupCid + 全字段守卫，缺一 panic

fn PluginPickupReceiptBindCheck(receipt: var PluginPickupReceipt): void
# 门 b：receipt 四元组重算 pickupCid == pickupCidHex，不符 panic（防拼贴）

fn PluginPickupReceiptEncode(receipt: var PluginPickupReceipt): rawbytes.Bytes
fn PluginPickupReceiptDecode(data: rawbytes.Bytes): Result[PluginPickupReceipt]
# 严格解码：游标穷尽校验，缺字段/截断/尾部多余字节一律 Err（同构字段集缺一拒收的实现点）

@borrows
fn PluginPickupVerifyGates(artifact: var rawbytes.Bytes,
                           receipt: var PluginPickupReceipt): void
# 门序固定：bind → 字节门(count+sha256) → provenance；任一失败 panic（§4）
```

### 2.2 客户端层签名草案（IO 唯一宿主）

```cheng
import std/os
import std/result
import std/rawbytes
import cheng/core/backend2/backend2_plugin_cid as plugincid

fn CsgPluginPickupRoot(): str =
    return os.GetEnv("CHENG_CSG_PLUGIN_CACHE_ROOT")   # 空 = 未配置，走 fail-closed 判定

@borrows
fn CsgPluginPickupCachePath(rootDir: str, pickupCidHex: str): str
# <root>/<pickupCid[:2]>/<pickupCid>.csgplugin + 同名 .receipt，镜像 csge 分片规则

fn CsgPluginPickupLoadCached(rootDir: str, queryCidHex: str,
                             artifact: var rawbytes.Bytes): Result[plugincid.PluginPickupReceipt]

fn CsgPluginPickupFetchRemote(queryCidHex: str,
                              artifact: var rawbytes.Bytes): Result[plugincid.PluginPickupReceipt]
# CSG 交易侧领取（内容寻址）；传输实现归实施切分 S4-C，此处冻结签名与 Err 语义

@borrows
fn CsgPluginPickupStore(rootDir: str, receipt: var plugincid.PluginPickupReceipt,
                        artifact: var rawbytes.Bytes): Result[bool]
# tmp + rename 原子落盘；仅在 VerifyGates 全过后调用

@borrows
fn CsgPluginPickupAcquire(rootDir: str, allowNetwork: bool,
                          sourceClosureHash: layout.FixedBytes32,
                          compilerHash: layout.FixedBytes32,
                          targetTriple: str,
                          contractVersion: int32,
                          artifact: var rawbytes.Bytes): Result[plugincid.PluginPickupReceipt]
# §4 状态机唯一入口；Err 仅表示"确认无件"，一切校验失败直接 panic 不经 Result

fn CsgPluginPickupMissingError(targetTriple: str, installedUnits: str[]): str
# 即 codegen_contract.cheng TODO CodegenPluginMissingError 的落位实现：
# "codegen_plugin_missing=<triple> installed=[<unit,...>]"，报文必须含已装清单（plan Step4 verify）
```

### 2.3 新增函数清单

| 函数 | 文件 | 性质 |
|---|---|---|
| Backend2CidFixed32IsZero | backend2_cid.cheng | 新增（通用原语） |
| Backend2CidAppendU32/Text/Fixed32、Backend2CidBufSha256 | backend2_cid.cheng | 新增转发别名 |
| Backend2ComputePluginPickupCid | backend2_plugin_cid.cheng（新） | 新增 |
| Backend2ContentSha256OfBytes | backend2_plugin_cid.cheng | 新增（封装既有 Sha256Fixed） |
| PluginPickupReceiptMake/BindCheck/Encode/Decode | backend2_plugin_cid.cheng | 新增 |
| PluginPickupVerifyGates | backend2_plugin_cid.cheng | 新增 |
| CsgPluginPickupRoot/CachePath/LoadCached/FetchRemote/Store/Acquire/MissingError | csg_plugin_pickup.cheng（新） | 新增 |

复用不新增：layout.ByteBuf 族、hash256.Sha256Fixed、std/result Result/IsErr/Value、
os.GetEnv、codegen_contract.CodegenContractVersion。

## 3. Receipt 结构定义

结构体见 §2.1。设计原则：**与 pickupCid 同构的字段集**——四元组四字段逐一在册，
另加 artifact 绑定（byteCount+sha256）与 provenance 三元组（origin/signerId/proofCid）。
本地构建与远端取件共用同一个 `PluginPickupReceiptMake`/`Encode`，唯一差别是 origin：

| origin | provenanceSignerId | provenanceProofCid | 校验规则 |
|---|---|---|---|
| 1 = chain | CSG 链签发者 ID（非空） | 链上证明对象 CID（非零） | 过 CSG `verify-proof`(proofCid, signerId) |
| 2 = local | 恒 `"local"` | == artifactSha256（自证，确定性非零） | 相等性检查 |

同构性由两点机械保证：①Decode 严格模式遇缺字段/截断/尾部垃圾一律 Err——**缺一拒收落在解码层**，
不依赖调用方自觉；②两条来源的 receipt 落盘同一缓存路径、后续命中走同一 `VerifyGates`，
不存在"本地产物免检"旁路。

线格式：域标签 `cheng.backend2.plugin.receipt` + `receiptFormatVersion(U32)=1` +
按结构体声明序逐字段走同一 append 族（Text/U32/Fixed32 同 §1 编码）。
pickupCidHex 自指字段保留：decode 后必须用其余字段重算并比对（BindCheck），
使"新 receipt 配旧产物"或跨 quad 拼贴在数学上不可过门。

## 4. Fail-closed 状态机

```
Acquire(rootDir, allowNetwork, quad...):
  ① 构造期校验：空 triple / version<1 / 零哈希 → panic（§1 守卫）
  ② CacheProbe: LoadCached(<root>/<cid[:2]>/...)
       ├─ hit  → ④ VerifyGates（缓存命中不免除任何门）
       └─ miss ─┬─ allowNetwork=true  → ③ FetchRemote(cid)
                └─ allowNetwork=false → FAIL_CLOSED
  ③ FetchRemote
       ├─ Ok    → ④ VerifyGates → ⑤ Store（原子落盘）→ Compose
       └─ Err   → FAIL_CLOSED（区分 csg_pickup_fetch_failed / csg_pickup_not_published）
  ④ VerifyGates（顺序冻结，任一失败 panic 且绝不写缓存/不进组合）:
       a. receipt 已严格 decode（结构性完整）
       b. BindCheck: quad 重算 pickupCid == receipt.pickupCidHex
       c. 字节门: len(artifact)==artifactByteCount ∧ sha256(artifact)==artifactSha256
       d. provenance: 按 §3 表按 origin 分派
  ⑤ Compose: 内核 + 插件对象静态链接（min_driver 既有机制）
```

三态与篡改路径：

| 态 | 行为 |
|---|---|
| 在线 | FetchRemote → 全门 → 落盘 → 组合。网络失败是终端错误非降级信号，exit≠0 |
| 离线有缓存 | LoadCached hit → **同样过全门** → 组合。缓存提供可用性，不提供信任 |
| 离线无缓存 | FAIL_CLOSED：`CsgPluginPickupMissingError(triple, installedUnits)` 报文 +
  exit≠0，即 `codegen_plugin_missing=<triple>` 且含已装清单；无任何带病降级 |

篡改拒收路径（plan verify："篡改单字节必拒收"）：

- 篡改 **artifact 字节** → 门 c sha256 失配 → `panic(Fmt"csg_pickup_byte_gate_mismatch cid={receipt.pickupCidHex}")`；
- 篡改/拼贴 **receipt 字段** → 门 b 重算失配 → `csg_pickup_cid_rebind_mismatch`；
- 伪造 **provenance** → 门 d → `csg_pickup_provenance_reject`；
- 截断/裁剪文件 → Decode Err → `csg_pickup_receipt_truncated`。
  sha256 抗碰撞下单字节改动必然落网；所有拒绝都是 hard-fail，无重试、无跳过、无告警续跑。

不变量汇总：门禁与数据来源正交（缓存/远端/本地构建同一 VerifyGates）；一切失败终端非零；
Err 语义仅用于"确认无件"触发 fail-closed 报文，绝不用 Err 吞掉校验失败。

## 5. 与 codegen_contract.cheng 契约版本的绑定方式

1. **直接入键**：`contractVersion` 成分即 `codegen_contract.CodegenContractVersion`（int32，当前 1），
   以 U32LE 进 pickupCid 哈希（§1 第 4 成分）。取件方与上链方都必须 import 契约常量，禁止本地硬编码数字。
2. **翻转即失效**：契约 bump ⇒ 全体在链/在缓插件的 pickupCid 变化 ⇒ 旧缓存键自然 miss
   ⇒ 在线取新版 / 离线 fail-closed。**没有兼容读取路径**——这正是 D2 fail-closed 的含义，
   不做版本协商、不做多版本并存。
3. **双重校验**：receipt 同时存 contractVersion 原值与 pickupCidHex，BindCheck 重算绑定
   （§3），防"版本号字段被单独改大"这类半吊子篡改。
4. **权威唯一性门禁**：闭合检查脚本（Step 0 产物，Step 1 转正式门禁）增加一条 grep 规则：
   `CodegenContractVersion` 的定义只允许出现在 codegen_contract.cheng，
   其余文件只允许 import 引用。违例即构建失败。

## 6. 实施切分（files / action / verify / done，对齐 plan Step 粒度）

### S4-A 纯值层：四元组 CID + receipt codec（纯加法，零行为变化）
- files：`src/core/backend2/backend2_cid.cheng`（+5 个一行转发/原语）、
  `src/core/backend2/backend2_plugin_cid.cheng`（新）、
  `src/tests/backend2_plugin_cid_smoke.cheng`（新）。
- action：实现 §1 配方 + §3 codec + 全部守卫；冻结 golden 向量（首次实现的 hex 输出固化为断言）。
- verify：smoke 断言——golden hex 稳定；四元组任一字段翻转 ⇒ CID 变化；
  Decode 对截断/尾字节/缺字段/错 origin 全 Err；守卫 panic 各触发一次。
- done：纯值层零 import 编译器状态，fork/串行同结果；ci_gate 不回归。

### S4-B 取件客户端与本地缓存（离线路径完整可用）
- files：`src/core/backend/csg_plugin_pickup.cheng`（新）、smoke（新）。
- action：§2.2 除 FetchRemote 真传输外的全部函数；分片缓存 + 原子落盘；
  Acquire 状态机（allowNetwork=false 分支先行）；MissingError 落位契约 TODO。
- verify：断网演练——有缓存命中且过门；无缓存报 `codegen_plugin_missing=<triple>`
  且报文含已装清单、exit≠0；篡改缓存文件单字节必 panic；miss 不产生任何 fallback 写。
- done：离线两态（有/无缓存）行为与 plan D2 逐字一致，自动化可复跑。

### S4-C CSG 交易侧对接（插件上链 + 远端取件）
- files：`csg_plugin_pickup.cheng`（FetchRemote 实现）、csg-core 交易侧发布工具接线、
  publish/verify-proof 对接 smoke。
- action：插件单元按 pickupCid 内容寻址上链（capability 交易对象 + 链证明）；
  FetchRemote 领取后交同一 VerifyGates。
- verify：在线取件→组合→与本地构建产物 exec_diff 等价；伪造 proofCid / 非
  授权 signerId 拒收；`complete=false` 的链对象不得通过 provenance 门。
- done：联网自动展开、离线诚实失败两端都有自动化门禁（plan Step 4 done 条款）。

### S4-D 组合准入接线与正式门禁
- files：driver dispatch 组合点（唯一消费 Acquire 的位置）、`tools/ci_gate.sh`（增项）。
- action：组合流程改为 Acquire→VerifyGates→静态链接；删除任何绕过取件客户端的
  直连对象路径；ci_gate 增设三案：篡改必拒收 / 断网 fail-closed 报文快照 / 在线 exec_diff 等价。
- done：grep 证明仓库内插件对象获取只有 Acquire 一个入口；门禁全绿并绑定哈希。

## 7. 开放问题（实施前须裁定）

1. **compilerHash 口径（已裁定）**：真实编译器可执行文件的原始 SHA-256；生产
   消费从 held-exec retained fd 取得并复核 canonical `sha256:<64hex>`，零值 hard-fail。
2. **缓存根归属（已裁定）**：只接受显式 `CHENG_CSG_PLUGIN_CACHE_ROOT`；正式门
   固定到 `CHENG_TASK_TMPDIR` 内，任务退出即清理，不设用户级或安装级默认缓存。
3. **网络开关语义**：allowNetwork 应来自显式 CLI flag/env，自动探测联网状态属不可靠启发式，
   不采纳。默认态（flag 缺省 = 在线还是离线）待定，fail-closed 原则倾向缺省离线。
4. **provenance 信任锚分发**：链根公钥随驱动编译期烙入还是环境配置？origin=local 是否
   无条件准许进组合（本地构建天然可信 vs 统一从严）？
5. **append 族复用方式**：主案 = backend2_cid 加 4 个转发别名（改共享文件，须遵守 mtime
   静止 + 只 stage 自己 hunk 纪律）；备选 = plugin_cid 内镜像同构实现（零触碰共享文件，
   代价是第二份 10 行副本）。倾向主案，取舍留 S4-A commit 显式记录。
6. **sourceClosureHash 派生器宿主**：per-unit sentinel 文件放各插件单元内还是契约模块集中？
   以及闭包是否纳入 codegen_contract 源本身（契约版本已是独立成分，纳入属双保险，
   倾向纳入：版本号人工递增可能漏改，闭包派生不会）。
7. **artifact 物理形态**：单元级可链接对象（.o/.a）还是已链接 per-triple 驱动二进制？
   主案 = 单元级对象（符合 D1 内核+单元静态链接模型，exec_diff 在最终驱动上验证）。
