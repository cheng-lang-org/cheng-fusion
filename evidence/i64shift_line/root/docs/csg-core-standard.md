# CSG-Core Standard

`docs/csg-core-standard.md` 是 CSG-Core 的唯一规范入口。`docs/cheng-plan-full.md` 只作为演进路线图，不定义兼容性合同。

Cheng 是 CSG-Core 的 producer、consumer 和强验证场之一，不拥有 CSG-Core 标准。标准命名、profile、report、tombstone、relfacts、control surface 和 facts cargo 都必须使用 `csg_*` 命名空间；`CHENG_CSG`、`CHENGCSG` 只保留为主 CSG 历史 wire magic，relation sidecar 不接受 `CHENG_RELFACTS` 或其他旧 header。

## 物理格式

生产 CSG facts 的默认物理格式是二进制 CSGC：

```text
*.csgc     通用 CSG-Core / dialect / proof 二进制 facts
*.relfacts csg_relfacts::v1 canonical JSONL delta sidecar
*.csgwebc  CSG-Web facts 的 CSGC 二进制文件或 shard
*.debug    可选二进制 debug sidecar
*.summary.json  生产摘要，只含 root/complete/counts/闭包桶摘要
*.idx.json      外置离线/debug 查询索引，不提供 local_query authority
*.json     显式 debug report、manifest、人类可读 proof
*.jsonl    仅限显式 debug/export/legacy 对拍
```

规则：

- 主 facts、proof 与新 dialect 生产链路必须写 `.csgc` 或 `.csgwebc`；relation delta 只写本规范定义的 `.relfacts`。
- JSON/JSONL 可以展示逻辑 fact 形状，但不能作为生产主 facts；唯一例外是 `csg_relfacts::v1` canonical JSONL delta sidecar，它仍不能替代 before/after CSGC。
- 生产 publication/admission 依赖 `.csgc`、Merkle manifest 和 policy 选定 store 中从 genesis 连续验证得到的 immutable successor tail；`*.summary.json` 只是可观测摘要。`local_query` 必须从该 tail record 的 manifest-only authority 出发读取内容寻址 query shard，并在读前读后证明同一 tail key 下 successor 不存在，不能加载独立 `*.idx.json` 充当 authority；完整 `report.json` 是 debug artifact，必须显式请求。
- 读取端可以短期兼容 JSONL debug 输入；写入端不得把 JSONL 作为默认。
- `CHENG_CSG`、`CHENGCSG` 是 legacy/cold backend wire，不代表通用 CSG-Core 物理格式。

### CSGC 字节合同

CSGC 只有一个生产物理格式，不设置 version 字段，不接受版本协商，也不得引入平行 codec。`header_size=64` 是 admission guard：旧 header 在 offset 4 处不是 64 时必须 hard-fail，reader 不能猜测兼容。

Header 固定 64 字节，小端序：

```text
offset  size  field
0       u32   magic = 0x43475343；线缆字节为 43 53 47 43（"CSGC"）
4       u16   header_size = 64
6       u16   flags = 0
8       u32   fact_count
12      u32   body_compressed_size = 0
16      u32   body_original_size
20      44B   reserved zero
```

当前唯一格式不启用 body 压缩，因此 offset 12 必须为 0；`body_original_size` 必须精确等于文件长度减 64。未知 flags、非零 reserved、截断、尾随字节或长度不一致均 hard-fail。

Body 固定为 section directory + section payloads。所有 offset 相对 body 起点，所有定宽整数为 little-endian：

```text
u32 directory_size
u32 section_count
repeat section_count:
  u8      section_tag
  varuint kind_utf8_len
  bytes   kind_utf8
  u32     payload_offset
  u32     payload_length
  u32     item_count
  bytes32 section_digest

payloads 按 directory 顺序紧邻排列，不允许 gap/overlap：

tag=1 dictionary section；必须是第一个 section，kind=""
  u32 dictionary_count
  repeat dictionary_count:
    varuint utf8_len
    bytes   utf8_bytes

tag=2 fact-kind section；kind 非空，kind 按 UTF-8 字节严格升序
  u32 section_fact_count
  repeat section_fact_count:
    varuint token_count
    repeat token_count:
      u8 token_tag
      token_tag=1: varuint dictionary_index
      token_tag=2: varuint utf8_len + bytes utf8_bytes
```

`section_count >= 1`。dictionary section 的 `item_count` 必须等于其 payload 内的 `dictionary_count`；所有 fact-kind section 的 `item_count` 之和必须等于 header 的 `fact_count`。最后一个 payload 必须恰好结束于 body 尾部。

varuint 是最短形式的无符号 LEB128；非最短编码、溢出或截断均拒绝。字符串必须是合法 UTF-8 原始字节，不做 Unicode 归一化。浮点数、整数、null 与字段缺失都不另设 CSGC 原生值标签，而是保留在 canonical JSON token 中；因此 null 与缺失字段仍是不同的事实语义。

writer 先调用唯一 Patricia Merkle physical-order canonicalizer，再按 fact `kind` 分 section；kind、dictionary 和 canonical facts 的顺序都由 UTF-8/Patricia 规则唯一决定。reader 必须重建 canonical token stream，并拒绝未使用 dictionary entry、可内联却引用错误、可引用却内联、重复/乱序 dictionary、非 canonical fact order 等可塑编码。重复编码同一 facts 必须 byte-identical。

### Section digest 与 directory claim

全部 digest 使用 SHA-256。`text(x)` 表示 `u32le(UTF-8 byte length) || UTF-8 bytes`。

```text
section_digest =
  SHA256(text("csg_core.csgc.section") ||
         u8(section_tag) ||
         text(kind) ||
         u32le(item_count) ||
         u32le(payload_length) ||
         payload_bytes)

claimed_directory_cid =
  "sha256:" + hex(
    SHA256(text("csg_core.csgc.directory.claim") ||
           u32le(magic) ||
           u32le(header_size) ||
           u32le(flags) ||
           u32le(fact_count) ||
           u32le(body_compressed_size) ||
           u32le(body_original_size) ||
           directory_bytes))
```

当前 `body_compressed_size=0`。directory claim 绑定 header 的有效字段和完整 directory；directory 再提交每个 payload 的 `section_digest`。修改 header、directory、kind、count、offset、length 或已解码 payload 都必须稳定失败。

`claimed_directory_cid` 只是文件自带内容计算出的 claimed identity，不是来源证明、admission 回执或 authority。生产链路不得把 claimed CID 直接当 authority，也不得让调用方传入 `expectedDirectoryCid`、`expectedManifestCid`、`expectedFactsRoot` 或 store/successor/path 来制造信任。

### 三层身份与持久对象

同一 CSGC cargo 必须同时区分三类不可互换的身份：

```text
facts_root          canonical facts 的语义 Merkle 根
csgc_directory_cid CSGC header 有效字段、section directory 与各 section digest 的提交
csgc_object_cid    完整 CSGC 物理字节对象的内容地址
```

完整物理对象 CID 固定为：

```text
csgc_object_cid =
  "sha256:" + hex(
    SHA256(text("csg_core.store.canonical_csgc_object") ||
           u32le(csgc_byte_count) ||
           complete_csgc_bytes))
```

这里 `text(x)` 与 Merkle hash framing 一致，为 `u32le(UTF-8 byte length) + UTF-8 bytes`。对象固定存放在 policy 选定 store 的 `csgc_objects/<sha256-hex>/object.csgc`；调用方不能提供另一条对象路径、hash domain 或 store root。写入必须使用 exclusive/no-replace 原子树提交；目的对象已存在时必须逐字节验证，不能覆盖。

manifest 必须同时绑定 `csgc_byte_count`、`csgc_object_cid`、`csgc_directory_cid`、`facts_root`、`fact_count`、schema 与 profile set。successor admission 在 no-replace 提交前必须从 store 映射并重读真实对象，重算完整对象 CID，验证 directory 与 production facts admission，并在请求携带本次 bytes 时逐字节对拍。manifest 中的 CID 文本本身不构成持久化证明。

### Nominal authority 与懒解码

纯 Cheng `csgc_authority.cheng` 使用模块私有 nominal capability。生产 policy 由零参数 issuer 按 OS 身份与固定规则派生，绑定 `standard=csg_core::v1`、policy epoch、platform、effective uid、canonical parent/store/root 和 policy CID；具体临时路径字面量不是标准合同。

authority 建立顺序固定为：

```text
发行私有 production policy
  -> 从 genesis 沿 predecessor-keyed immutable successor 连续遍历，取得 validated tail
  -> 拒绝缺失/不完整/unsupported/tombstone manifest
  -> 形成绑定 policy、store、generation、tail head blob CID、manifest_cid、facts_root、
     fact_count、csgc_byte_count、csgc_object_cid、csgc_directory_cid 的私有 trust anchor
  -> VerifyAndSeal 前证明 successors/<tailHeadCid|genesis>/head.csgc 不存在
  -> 从固定内容寻址路径映射并绑定完整 csgc_object_cid
  -> 解码并核对 manifest CID/facts_root/fact_count/csgc_byte_count/
     csgc_object_cid/csgc_directory_cid
  -> 解析 CSGC directory，核对 fact_count 与 claimed_directory_cid
  -> VerifyAndSeal 后再次证明同一 tail key 下 successor 不存在
  -> 发行模块私有 csgCoreCsgcAuthority nominal capability
```

`CsgCoreCsgcDecodeFactKindClaimed` 只解析 header/directory 并返回 claimed identity，不能用于生产 admission。生产按 kind 查询必须调用 `CsgCoreCsgcDecodeFactKindAuthorized`：先验证 nominal authority；命中 kind 时验证 dictionary section digest 和目标 fact-kind section digest；随后核对 decode receipt 的 directory CID 与 fact count。未命中的 fact-kind 由已授权且 digest-committed 的 directory 证明不存在，可以返回空结果；损坏、未授权或 tail 已出现 successor 不能降级、兜底或继续 lowering。

完整 CSGC 解码同样必须先从 policy 选定 store 的连续 successor 链取得 validated tail，再对拍输入 byte count、canonical CSGC object CID、directory CID 与 fact count；只有模块私有 authority 成立后才允许 `CsgCoreCsgcDecodeLines`，返回前必须再次证明同一 tail key 下 successor 不存在。strict CLI 入口不得直接调用 claimed/raw decoder；缺少 store/successor-tail authority 的 strict 变换必须在解码和输出副作用前拒绝。

懒解码只承诺“解析 header/directory，解码 dictionary 与被请求的 fact-kind section”。持久 store 已提供绑定完整 object CID 的 OS 只读映射与 bounded read-window 能力；authorized decoder 已在纯 Cheng 源码中固定消费该 capability，执行前后 tail-absence 双检、完整 framed SHA-256、directory CID、目标 section digest 和 close fail-stop。Linux fs-verity/current-source 动态回执完成前，只能声明源码与静态合同闭合，不能声明生产查询链路已取得 mmap 性能或内核不可变性证明。未访问 payload 由 directory 提交，实际访问时仍须验证其 section digest。

### 体积与性能优化合同

当前纯 Cheng writer 使用 token dictionary，不使用 JSONL 作为主产物。优化规则：

- token 来自 canonical JSONL 行，字符串字面量作为独立 token，非字符串片段保留原字节。
- dictionary 只收录重复且净收益为正的 token；净收益公式为：

```text
count * inline_token_cost
  - (dictionary_entry_cost + count * dictionary_ref_cost(index)) > 0
```

- `inline_token_cost = 1(tag) + varuint(len) + len`
- `dictionary_entry_cost = varuint(len) + len`
- `dictionary_ref_cost(index) = 1(tag) + varuint(index)`
- writer 必须缓存每个 token 的 dictionary index，size 计算和写入阶段不得重复做全量线性查找。
- repeated facts 的 `.csgc` 必须小于同一 canonical JSONL 字节数，且重复 pack 必须 byte-identical。
- 小 fixture 允许因为 64 字节 header 和字典表开销大于 JSONL；不得宣称所有输入都比 JSONL 小。

`csg pack` 固定输出：

```text
fact_count=<n>
csgc_bytes=<bytes>
canonical_jsonl_bytes=<bytes>
out=<path>
```

这些字段是体积优化和后续性能优化的最小实测接口。

历史观测（2026-07-09，同一旧全量输入）如下；当前 section-directory 与 authorized lazy-decode 实现尚未重新完成受守卫的动态基准，因此这些数字不能写成当前实现已证实的体积或性能结论：

```text
全量 csg-core.csgc:
  before = 173716125 bytes
  after  = 137931020 bytes
  delta  = -35785105 bytes，约 -35.8 MB

csg.runtime_requirement 单项:
  before = 约 70.0 MB
  after  = 约 34.5 MB
  delta  = 约 -35.5 MB

runtime_requirement 写入:
  before = 约 10.96 s
  after  = 约 1.80 s
  speedup = 约 6.1x

全量 readback:
  after = 约 3.8 s - 4.4 s，未退化
```

该历史观测只保留为重新基准的对照输入；在当前源码动态回执完成前不得用于融资、专利或生产性能声明。语义字段 `requirementKind`、`proofs`、`loc`、`owner` 必须继续有 roundtrip 覆盖。

已落地的生产体积规则：

- 默认不生成完整 `csg-core.report.json`；需要审计明细时显式传 `--report-out`。
- 生产链路提交 `.csgc` + Merkle manifest + predecessor-keyed immutable successor record；summary 只含 root、complete、counts 和闭包桶摘要，不提供 authority。
- extractor、离线分析和 debug export 可以显式生成 `--index-out facts.idx.json`。index 只含 files、symbols、functions、calls，必须绑定同一个 `facts_root`，不得改变 facts_root，也不得进入 `local_query` 的可信读取闭包。
- 完整 report 是 debug artifact；不得作为启动热路径输入。

继续优化必须保持唯一 CSGC 格式，不得引入新版本名：

- section directory 与按 fact-kind lazy decode 已落地；未来领域分层只能在当前 directory/tag/flags 合同内原地扩展，未知 flag/tag 必须 hard-fail。
- 字符串池二级去重：在现有 token dictionary 上增加 dictionary class，用于路径、版本常量、package metadata、schema 字段等高频类别。
- 外置 debug index：`symbol/name/file/caller` 等导出索引可以写入独立 `.idx.json`，主 `.csgc` 保持 facts cargo。当前已落地 files/symbols/functions/calls；store 内的 `local_query` 必须使用 manifest 已提交的 query-shard object，不能复用该外置文件作为可信索引。
- OS `mmap` 尚未形成当前实现的生产动态证据；落地时只能作为同一 CSGC bytes 的读取方式，不能形成第二 codec。
- 增量 CSG：`--file` 必须能产出该文件 facts 并刷新对应 index/root 子树，不能出现单文件 facts=0 的静默成功。

### 唯一实现所有权

```text
物理 encode/decode/directory/digest  src/core/csg_core/csgc.cheng
生产 nominal authority               src/core/csg_core/csgc_authority.cheng
唯一 facts_root / proof / replay      src/core/csg_core/merkle_dag.cheng 等纯 Cheng Merkle 模块
manifest commitment                  src/core/csg_core/merkle_manifest.cheng
```

TypeScript、Rust 与其它 extractor 只生产语义 facts，不得拥有第二套 CSGC codec、facts root、proof、replay 或 admission 算法。proof cargo 复用同一 CSGC encoder；任何第二 header、第二 root 或第二 proof 编码一律拒绝。

`ts-csg/src`、`dist` 与 `dist-frozen` 的 physical writer/reader/root/identity API 必须逐入口由同一个 held-exec launcher identity guard 支配；冻结产物不得保留第二 identity compiler、direct CLI、codec 或 root/proof 实现。旧 frozen orchestrator 与 quarantine metadata 必须物理删除；quarantine、不可发布声明、allowlist 或改名都不能使第二 authority 合法。冻结 manifest 必须逐文件绑定 active/frozen bytes，`.csgc` CLI 必须在任何 emit/extract/input read 前 hard-fail，直到 provider-owned launcher event source 接线。

### 编译器 authority 与生产执行身份

纯 Cheng CSG-Core 算法的生产执行必须同时证明“编译器 artifact 已认证”和“实际执行对象就是被认证对象”。portable receipt、跨平台 evidence closure、fixed-point receipt 和外部 anchor 在 provider-owned activation event source、跨会话 replay anchor 与 native launcher execution identity 全部闭合前都只属于 `CANDIDATE` 材料，不是 production trust root，固定输出 `production_authority=unavailable`、`launcher_exec_identity=HARD_RED`、`dynamic_completion_credit=0`。仓库中的 `tools/csg` 只负责 build/install，不能作为生产执行入口，也不能通过执行前后路径 hash 冒充实际执行身份。

唯一生产执行入口是安装在固定系统路径、root-owned 且系统不可变的 native Cheng launcher。Linux 固定要求 `fs-verity` measurement、inode immutable、`openat(O_NOFOLLOW)` 后持有 binary FD，并用 `execveat(fd, "", ..., AT_EMPTY_PATH)` 执行；Darwin 固定要求 root-owned Mach-O、受认证的 `SecCode` designated requirement、`SF_IMMUTABLE`，并把实际进程 audit token identity 与 launcher/binary identity 绑定。launcher 回执还必须绑定 launcher、实际执行 binary、源码闭包、compiler authority 与 external anchor 的 CID；named path 前后 fence 只用于拒绝漂移，不能替代 held object 的执行回执。

当前纯 Cheng `production_launcher` 的 caller projection 仍固定 fail-closed：caller 提供的 `claimedRuntimeAuthorityCid` 永远不是 authority。provider-held receipt validator 与 issuer edge 已能在源码中验证 held identities、六步 activation event chain、零输入预读、禁止路径执行、child identity、scope/workload 和 receipt CID；只有来自 provider-owned event stream 的严格回执才可能令 `runtimeAuthorityProven=true`。该 activation event source 与跨会话 replay anchor 尚未接线，因此 portable receipt gate 和 exact 1 GiB suite 都必须在读取 plan、分配 evidence 或执行 compiler 前精确返回 `HARD_RED:production_launcher_held_exec_event_source_unwired`，`productionReady=false`、`dynamic_completion_credit=0`。静态 contract/mutation 只证明拒绝路径仍存在，不计动态生产完成。

生产 release 必须把跨进程增量 fixed-point 作为独立必达条件：由已认证 OS-owned held-exec issuer 启动两个独立 worker，只接受 final CSGC、facts_root、唯一 Merkle proof CSGC、proof CID 与封存 worker stdout 五项逐字节相等后的动态回执。release 必须钉住 fixture、gate、contract 三者身份并拒绝漂移；任一 `--fixture/--stage3` 覆盖必须标为 `override_nonproduction`。当前 shell 只能按 pathname 读取 fixture/stage3，因此即使对拍成功也只能输出 `reviewed_default_path_untrusted` 与 `dynamic_completion_credit=0`，release 必须当场 HARD_RED；`STATIC_PASS`、非原子 conformance 输出或缺少任一对拍也不得靠其它条件转绿。

## 标准边界

`ts-csg` 和 `rust-csg-core` 保持现有目录和实现语言；Codex 垂直迁移已统一到 `codex/src`，旧 `rust-csg-codex` 镜像已退役。

```text
ts-csg          = TypeScript/React/JS extractor + Web runtime facts
rust-csg-core   = Rust/Codex 迁移核心 facts、rewrite、relfacts 基础
codex/src       = Codex 垂直迁移 package
CSG-Core        = 跨语言共同遵守的语义 facts 标准
```

统一命名空间：

```text
csg_core
csg_dialect::c
csg_dialect::cheng_compiler
csg_dialect::web
csg_dialect::native
csg_dialect::finance
csg_dialect::oracle_asset
csg_dialect::python
csg_dialect::unimaker_product
csg_dialect::vexa
csg_abi::arm64_macho
csg_abi::x64_elf64
csg_backend_ir
csg_relfacts::v1
```

标准身份固定为：

```text
standard         = csg_core::v1
schema           = csg_core
schema_namespace = csg_core::v1
```

canonical profile registry 必须与 validator/manifest 完全一致，并按 UTF-8 字节升序排列：

<!-- csg-core-canonical-profiles:start -->
```text
csg_core
csg_dialect::c
csg_dialect::cheng_compiler
csg_dialect::finance
csg_dialect::native
csg_dialect::oracle_asset
csg_dialect::python
csg_dialect::unimaker_product
csg_dialect::vexa
csg_dialect::web
```
<!-- csg-core-canonical-profiles:end -->

生产 facts 的 profile set 是上述 registry 的非空子集，必须包含 `csg_core`，并由实际 fact kind 唯一推导；C 与 Python 分别使用 `csg_dialect::c`、`csg_dialect::python`。`rust-csg-core` 和 `codex/src` 当前是 Rust/Codex 迁移实现，不是 Rust dialect facts producer；在真实 producer 和精确 kind validator 接线前，标准不得声明 Rust profile。

`profile_set_cid` 的唯一计算规则如下。`dec_len(x)` 是 `x` 的 UTF-8 字节长度写成无前导零的 ASCII 十进制，再追加 ASCII `:`；payload 本身不含分隔换行：

```text
profile_set_payload =
  UTF8("csg_core.profile_set") ||
  UTF8(dec_len(standard)) || UTF8(standard) ||
  UTF8(dec_len(schema_namespace)) || UTF8(schema_namespace) ||
  UTF8(dec_len(profile[0])) || UTF8(profile[0]) || ... ||
  UTF8(dec_len(profile[n-1])) || UTF8(profile[n-1])

profile_set_cid =
  "sha256:" + hex(
    SHA256(text("csg_core.merkle.key") ||
           text(profile_set_payload)))
```

当前 `standard` 与 `schema_namespace` 均为 `csg_core::v1`，但必须作为两个独立长度前缀字段写入；不得因值相同而合并。profile 顺序必须是上面的 canonical UTF-8 顺序。任何其它分隔符、JSON 数组、Unicode 字符计数、前导零或重复 profile 都不是有效编码。

生产 Merkle binding 只能由依赖中性的 identity issuer 签发，并携带
`binding_identity_receipt_cid`。该 CID 不替代 `profile_set_cid`，而是把完整 binding
收成单一不可变回执：

```text
binding_identity_receipt_cid =
  "sha256:" + hex(SHA256(
    text("csg_core.binding_identity_receipt.v1") ||
    text(standard) ||
    text(schema_namespace) ||
    text(schema_cid) ||
    text(profile_set_cid) ||
    u32le(profile_count) ||
    text(profile[0]) || ... || text(profile[n-1])))
```

这里 `text(x) = u32le(byte_len(x)) || UTF8(x)`。validator、Merkle DAG、operation 与
store 不得各自重写 profile-set 或 binding preimage；它们只能重签这一规范回执并逐字节
对拍。未知 profile、非规范顺序、错误 schema CID、错误回执 CID 一律在任何生产写出前拒绝。

`CHENG_CSG` 和 `CHENGCSG` 只保留为 legacy wire magic：

```text
CHENG_CSG = legacy public object-facts magic，对应 csg_abi::* 附近的后端输入
CHENGCSG  = legacy internal BodyIR snapshot magic，对应 csg_backend_ir 内部自检
CHENG_RELFACTS = 已退役且必须拒绝；relation sidecar 只有 csg_relfacts::v1 canonical JSONL
```

它们不能再作为架构概念名，也不能替代 `csg_core`。

## IR 分层

```text
Language source
  -> language extractor
  -> csg_core
  -> csg_dialect::c / csg_dialect::cheng_compiler / csg_dialect::finance / csg_dialect::native / csg_dialect::oracle_asset / csg_dialect::python / csg_dialect::unimaker_product / csg_dialect::vexa / csg_dialect::web
  -> csg_abi::<target>
  -> csg_backend_ir
```

跨层转换必须显式声明输入/输出 dialect。生产 lowering 只接受 `complete=true` 的 facts/report。

CSG-Core 必须描述源码语义，不描述 CPU 指令。公共字段包括：

```text
module
symbol
type
layout
function
cfg
op
call
data
debug_map
report
unsupported
runtime_requirements
control_surface
tombstone
```

profile 可以增加领域 facts，但必须引用 `csg_core`，不能复制 core 字段，也不能改变 core 字段含义。Web runtime facts、Codex 业务 facts、native 平台 facts 都不得污染 CSG-Core 基础 schema。

## Merkle DAG 与唯一 facts_root

`facts_root` 是 canonical facts 的内容寻址 Patricia Merkle DAG 绑定根，不等于物理 DAG 根，也不再是整份 JSONL 文本的平面 SHA-256。旧平面 root 没有兼容读取或并行版本。

### Fact identity

每条 fact 先 canonicalize 为 UTF-8 JSON bytes，不含行尾换行。key 固定为：

```text
存在非空 id:
  key = "id:" + id

没有 id:
  key = "anonymous:" + kind + ":" + hex(fact_hash)
```

空 `id`、空 `kind`、重复 key、不同 key 得到相同 `key_hash` 均 hard-fail。不能用输入顺序、源码行号或对象地址充当 identity。

### Hash framing

全部 hash 使用 SHA-256。`text(x)` 是 `u32 little-endian UTF-8 byte length + UTF-8 bytes`；CID/hash 字段固定写入 32 个原始字节，不写 hex 文本：

```text
key_hash =
  SHA256(text("csg_core.merkle.key") || text(key))

fact_hash =
  SHA256(text("csg_core.merkle.fact") || text(canonical_fact))

leaf_hash =
  SHA256(text("csg_core.merkle.leaf") ||
         key_hash || fact_hash)

branch_hash =
  SHA256(text("csg_core.merkle.branch") ||
         u32le(split_bit) ||
         u32le(left_count) || left_hash ||
         u32le(right_count) || right_hash)

empty_hash =
  SHA256(text("csg_core.merkle.empty") || text(""))

subgraph_cid =
  "sha256:" + hex(
    SHA256(text("csg_core.merkle.subgraph") ||
           u32le(fact_count) ||
           dag_root_hash))

facts_root =
  "sha256:" + hex(
    SHA256(text("csg_core.merkle.facts_root") ||
           text(standard = "csg_core::v1") ||
           u32le(profile_count) ||
           text(profile[0]) || ... || text(profile[n-1]) ||
           text(schema_namespace = "csg_core::v1") ||
           schema_fact_hash ||
           subgraph_hash))
```

`dag_root_hash` 是 Patricia 根节点的 32 字节 hash；空图使用 `empty_hash`。`subgraph_hash` 是 `subgraph_cid` 的 32 字节 payload。`schema_fact_hash` 必须是唯一 canonical `csg.core.schema` fact 按上述 `fact_hash` 规则得到的 32 字节 hash。

profiles 必须由 facts 推导，固定包含 `csg_core`，并加入实际出现的 dialect profile；按 UTF-8 字节严格升序排列且不得重复。`profile_count` 是该有序列表长度。生产 root 只能通过 validator 的派生绑定入口计算；调用者不得自行提供另一组 standard、profiles、schema namespace 或 schema CID。这样同一 canonical facts 只有一个有效 `facts_root`，而 schema/profile 不同的图必然得到不同根。

公开 bound builder `CsgCoreMerkleBuildBound` 与 `CsgCoreMerkleBuildBoundFromLines` 都是 strict 入口：每条 raw fact 必须逐字节等于 canonicalizer 结果，空记录直接拒绝。它们不得把 raw fact 先规范化后生成 `facts_root`；唯一物理构造内核是 `csgMerkleBuildCanonical`，任何 mismatch 都必须在 root 绑定前返回。

`split_bit` 从 `key_hash` 第 0 位开始，按字节从前到后、每字节从 MSB 到 LSB 编号。所有 entry 按完整 `key_hash` 字节序排列；每个 Patricia branch 使用该范围首尾 key 的首个不同 bit，0 为左、1 为右。branch 不允许空子树或单子树。由此树形只由 facts 决定，与输入顺序和编辑历史无关。

### 局部证明

局部证明的 header 精确携带：

```text
dag_root_cid
exists
fact_count
facts_root
path_count
profile_count
query_key
schema_cid
schema_namespace
standard
subgraph_cid
terminal_fact_hash
terminal_key
terminal_present
```

header 之后必须有 `profile_count` 条 profile fact，按 ordinal 完整恢复 canonical
profiles；再有 `path_count` 条 step fact，按 root -> leaf 顺序携带 `split_bit`、
`direction`、`sibling_count` 与 `sibling_hash`。proof 不能只提交 count 而省略 profile
内容，也不能由 verifier 从调用方参数补齐 profile binding。

membership proof 必须同时核对 query fact 重新计算出的 `key` 和 `fact_hash`。non-membership proof 必须提交按 query key 路由到的 terminal leaf；若 query key 与 terminal key 的 hash 相同但文本不同，按碰撞 hard-fail。路径位必须严格递增，方向必须同时匹配 query key 与 terminal key，兄弟计数必须大于零，逐层回算后的 count/root 必须与 proof header 完全一致。

proof 的物理 cargo 继续使用唯一 CSGC。逻辑行固定为一个 `csg.merkle.proof` header、
有序 `csg.merkle.proof_profile` 和有序 `csg.merkle.proof_step`；重复编码必须
byte-identical。不得省略 profile facts，也不得为 proof 发明新的 CSGC header 或版本。
proof decoder 必须用唯一 writer 重编码并与输入 CSGC 逐字节相等；额外字段、不同字段顺序、未使用 dictionary entry 或其它可塑编码均拒绝。

proof canonical line 字段顺序固定；整数和布尔值在 proof fact 中使用无前导零十进制字符串，布尔只允许 `"0"`/`"1"`：

```text
header:
  dag_root_cid, exists, fact_count, facts_root, kind, path_count,
  profile_count, query_key, schema_cid, schema_namespace, standard,
  subgraph_cid, terminal_fact_hash, terminal_key, terminal_present

profile:
  id, kind, ordinal, profile

step:
  direction, id, kind, ordinal, sibling_count, sibling_hash, split_bit
```

proof profile 的 `id` 必须等于 `profile:<ordinal>`，step 的 `id` 必须等于
`step:<ordinal>`；两类 ordinal 都从 0 连续递增。重复、缺失、count binding 漂移、
非 canonical profile set 或非 canonical CSGC 必须在验证 root 前拒绝。

### 事务计划与执行回执

`plan_root` 不是 `facts_root` 的别名，而是一次确定性变更计划的独立内容地址。计划必须绑定：

```text
request_cid
before_head_cid
before_manifest_cid
before_csgc_directory_cid / before_facts_root / before_dag_root_cid / before_fact_count
after_csgc_directory_cid  / after_facts_root  / after_dag_root_cid  / after_fact_count
invalidation_cid
有序 operation_kind / operation_fact_key / operation_cid 三元组
```

`operation_cid` 指向唯一 canonical transaction-operation CSGC；该对象继续绑定 `proof_cid`、
query key、目标 fact/fact CID、变更前后两根和 fact count。因此 `plan_root` 通过 operation CID
间接且精确地承诺 proof bytes，不能用 action 名、源码位置或其它近似键替代。

transaction-operation 的唯一逻辑行按以下字段顺序编码；count 与 operation kind 都是
canonical JSON string，count 只能使用无前导零十进制：

```text
after_dag_root_cid
after_fact_count
after_facts_root
after_profile_set_cid
after_profiles
before_dag_root_cid
before_fact_count
before_facts_root
before_profile_set_cid
before_profiles
fact
fact_cid
id = "operation"
kind = "csg.merkle.transaction_operation"
operation_kind = "delete" | "replace" | "insert"
proof_cid
query_key
schema = "csg_core::v1"
```

`before_profiles/before_profile_set_cid` 必须精确等于 proof 中的 canonical profile
binding；`after_profiles/after_profile_set_cid` 必须精确等于变更后 manifest 的 canonical
binding。proof 的 `standard` 和 `schema_namespace` 必须分别逐字节等于
`csg_core::v1`；foreign identity 必须在 proof cargo、patch 和编码之前拒绝。operation
builder 必须先由 proof replay 得到 `patch.afterSubgraphCid`，再唯一计算：

```text
after_subgraph_cid = MerkleSubgraph(after_fact_count, after_dag_root_cid)
after_facts_root = MerkleFactsRoot(
  proof.standard,
  after_profiles,
  proof.schema_namespace,
  proof.schema_cid,
  after_subgraph_cid)
```

不得沿用 before profile binding 计算 after root，也不得由 caller 直接提供 after root。
profile set 合法变化时，整个 incremental transition 必须恰好只有一个 operation；零 operation、
多个 operation、非末端切换或 operation 的 after binding 与 next manifest 不一致均 hard-fail。
profile 不变时，每个 operation 的 before/after binding 都必须与链上 current binding 相等。

insert/replace 的 `fact` 必须已经是唯一 canonical JSON，delete 的 `fact` 必须为空且
`fact_cid="none"`。任何输入 fact 经 canonicalizer 得到不同字节时必须直接拒绝，禁止先规范化
再接受。proof CSGC 与 operation CSGC 都必须 typed-decode、由唯一 writer 重编码并逐字节对拍；
所有 CSG physical cargo、proof/operation 行和 receipt 的字符串只允许调用
`json_canonical.CsgCoreJsonQuote` 编码，禁止各模块复制转义器；`U+0000..U+001F` 必须稳定生成
唯一 canonical escape 并可逐字节回放。
非 canonical proof、非 canonical operation、非 canonical CSGC、proof CID/root/profile 漂移或
replay bytes 不一致均不得进入 plan、receipt 或 production admission。

计划 cargo 使用唯一 CSGC：第一条是 `csg.merkle.transaction_plan`，随后按执行顺序写入
`csg.merkle.transaction_plan_operation`。生产者先以
`decimal(operation_kind) + "|" + decimal(UTF-8 fact-key byte length) + ":" + fact_key`
构造排序身份，按 UTF-8 字节严格升序排列；重复 fact key、重复 operation CID、重复 proof CID、
数组长度不等、非法零操作迁移、非法 kind 或 CID 一律拒绝。operation 与 proof 必须从最终将要
持久化的原始 bytes 重新 decode/replay；caller result 中缓存的 CID 或字段不能作为计划输入。
编码后按下式计算唯一根：

```text
plan_root =
  "sha256:" + hex(
    SHA256(text("csg_core.store.transaction_plan") ||
           u32le(plan_csgc_byte_count) ||
           plan_csgc_bytes))
```

Plan 阶段可以只读生成实际 Merkle proof 和 operation object，但在返回前必须证明：所得
`facts_root`、DAG root、fact count 与计划 manifest 完全相同，并且 store write count 与 publish
count 均为零。不能先构造计划根，再在 Apply 阶段选择另一组 proof。

Receipt 必须携带重建计划所需的全部 before/after binding、invalidation、operation kind/fact
key/CID 序列及 `plan_root`。Receipt decoder/admission 必须从这些字段重新编码计划 cargo、重新
计算 `plan_root`，再逐个读取 operation/proof bytes 回放，并将最终三根和 fact count 与 after
manifest 对拍；传入 root、缓存字段或自哈希 receipt 都不是证明。换 CID、换根、错序、漏项、
重放到另一 predecessor successor record、截断和 no-op 携带变更对象均须在 successor commit 前稳定拒绝。

底层 predecessor-keyed successor commit 是最后 admission boundary，必须再次 typed-decode 并验证 request bytes，
从 request changed sources 与真实 dependency closure 重新计算 `invalidation_cid`，再验证 receipt、
exact operation/proof 序列和 manifest referenced-object closure。`invalidation_cid` 是语义根，
不是独立持久对象；只比较 CID 字符串同样不等于语义闭合。只证明上层 Transaction 当前唯一调用者
正确，不足以授权一个可被其他调用者直接调用的 publish API。

transaction request 的唯一 typed decoder 是 `CsgCoreMerkleTransactionRequestDecode`。它必须先
执行唯一 CSGC 解码和资源上限检查，再按 header、changed source、replacement、fact、dependency
的固定索引关系构造强类型请求，执行与生产者相同的语义验证，最后调用唯一 writer 重编码并与输入
逐字节相等；只有此时返回的 `request_cid` 才可进入 publish admission。额外字段、错序、重复项、
非规范整数、截断或 caller 缓存字段均不得跨过该边界。

request producer 在构造 request CSGC 或读取/复用 store request 前，必须先遍历全部 replacement raw facts，证明每条逐字节等于 canonical JSON。operation producer 也必须在 proof cargo 分配、patch 和 operation encode 前完成 kind/delete-empty/insert-replace canonical 校验；禁止依赖后续 patch 失败来补救先发生的 cargo 或持久化副作用。

纯 Cheng bottom admission 必须从 store 的内容寻址 `request_cid` 重新读取原始 request object，调用
上述 typed decoder，并同时对拍 decoder 计算的 `request_cid`；不得消费上层已经解码的 request object。
同一个底层 admission 必须由首次 incremental publish 和 committed-receipt/reuse 路径共同调用，避免
首次发布严格、重用路径只比较 CID 的分叉。

publish admission 必须从 decoded request 完成以下唯一重建，不能只做 CID join：

1. wire 字段 `expected_before_head_cid` 必须等于连续链中已验证的 predecessor/tail head blob CID；以 before manifest 的 provider shards
   为真实依赖图，从 `changed_sources` 重算完整 invalidated source 集合和 `invalidation_cid`。
2. request replacements 必须与 invalidated source 集合一一对应；每个 `source_cid`、fact key/CID
   集合和 dependency 声明必须分别等于 after partition、consumer/provider shard 的 canonical 投影。
3. 以 before invalidated facts 与 replacement fact key/CID 集合计算唯一 delete/replace/insert 差分；
   operation 的 raw fact 经 canonical hash 后必须等于 request `fact_cid`，最终有序 operation
   kind/key/CID 序列必须逐项相等。未变 fact 不得伪造 operation，遗漏旧 fact 删除同样拒绝。

这三个条件与 operation/proof replay、manifest referenced-object closure 必须在同一 successor commit
前同时成立；其中任何一个上层调用者已经检查过，都不能取消底层公开 publish API 的重复 admission。

path-copy 合并后的 partition descriptor 必须按 `source_id`、再按 `fact_kind` 的 UTF-8 字节序
稳定归并；相同语义 facts 不得因历史 partition 顺序得到不同 partition root、manifest 或 successor record。
重复 `(source_id, fact_kind)` 必须在 manifest admission 拒绝，不能依赖稳定排序保留输入历史。

持久发布顺序固定为：写入并 fsync 所有 referenced objects，写入 manifest 与 receipt，执行完整
admission，再以 `successors/<previousHeadCid|genesis>/head.csgc` held-dirfd no-replace 提交唯一 successor。
禁止 pathname current-head replace 与后置 publication fence。destination 已存在时只允许逐字节相同的
head 复用，不同 bytes 必须冲突；rename/link 后 durability-unknown 必须重读同一 predecessor key 消歧。
reader 只沿连续 successor 链验证 generation、previous CID、manifest closure 与 receipt，并双读 tail
absence 取得线性化快照；任何对象、manifest、receipt 或 admission 未闭合时不得创建 successor。

### 增量回放

同一份 proof 必须独立计算变更后的根：

```text
replace  以同 key 的新 fact_hash 替换 terminal leaf，再沿 proof path 回算
delete   删除 terminal leaf，折叠其直接父 branch，再沿剩余 path 回算
insert   用 non-membership terminal 找到首个不同 bit，插入新 branch，再沿剩余 path 回算
```

`edit` admission 同时计算 proof replay root 和完整图 root；两者不等直接拒绝。外部局部 verifier 只需 proof cargo 与目标 fact，不需要加载全量 CSGC。路径、方向、count、sibling hash、terminal fact hash 任一漂移必须稳定失败。

增量 root、proof 和 `plan_root` 是三个不同承诺：proof 证明单个 key 在 before root 下的
membership/non-membership，path-copy replay 计算单步 after root，`plan_root` 再绑定 request、before/after
immutable successor/manifest/root/count、invalidation 与完整有序 operation/proof CID 序列。局部 replay 得到的最终
root 必须与完整 canonical facts 重算结果、after manifest 和 receipt 三方相等；任何一方不等都不得
提交 successor。该分层允许未变化子树按 CID 复用，但不允许跳过最终 manifest closure 或 compiler authority。

<!-- csg-core-production-receipt-contract:start -->
### Staged manifest projection 与生产回执

旧 batch verifier `CsgCoreMerkleManifestVerifyReferencedObjects` 接收完整 `objects[]`，会让 full inventory、
canonical CSGC 重编码和 semantic admission 的 live heap 重叠。它仍固定
`totalHeapBounded=false`，并以如下结果阻断生产 successor commit：

```text
HARD_RED:store_staged_mapped_reader_and_bounded_semantic_admission_required
```

纯 Cheng staged verifier 只把完整 inventory 改造成单向状态机：`Begin -> Consume* -> Finalize`。
`Begin` 绑定 `expectedManifestCid`、`expectedReaderAuthorityCid`、`expectedAllocatorLayoutCid`、
manifest 原始 bytes 和 limits；`Consume` 必须按下列唯一顺序恰好接收一次 typed projection：

```text
canonical_csgc[0]
partition_facts[0..partition_count)
membership[0..partition_count)
node[0..node_count)                    # cid 按 UTF-8 字节严格递增
dependency_consumer[0..consumer_shard_count)
dependency_provider[0..provider_shard_count)
summary[0]
query_shard[0..query_shard_count)
```

提前结束、尾随对象、重复/错序 kind 或 index、CID 漂移、累计 fact/dependency/query count 不等均
hard-fail。每个 projection 必须与 manifest 的 `standard`、`profileSetCid`、`schemaCid` 相等，且
`complete=true`、`unsupportedCount=0`、`tombstoneCount=0`、`runtimeRequirementCount=0`。

#### Canonical staged projection transcript

定义 `frame(v) = ascii_decimal(len(UTF8(v))) || ":" || UTF8(v)`。长度是 UTF-8 字节数，十进制无
前导零；整数先转成规范 ASCII 十进制，布尔只允许 `0` 或 `1`，再作为 `v` 进入同一 frame。
transcript 没有换行、NUL、分隔符补齐或 Unicode 归一化。唯一 transcript 为：

```text
frame("csg_core.store.manifest.staged_projection") ||
frame("35") ||
frame(kind) ||
frame(index) ||
frame(cid) ||
frame(readerAuthorityCid) ||
frame(allocatorLayoutCid) ||
frame(allocationReceiptCid) ||
frame(readerReceiptCid) ||
frame(wireByteCount) ||
frame(standard) ||
frame(profileSetCid) ||
frame(schemaCid) ||
frame(complete) ||
frame(primaryRoot) ||
frame(secondaryRoot) ||
frame(tertiaryRoot) ||
frame(dependencyConsumerRoot) ||
frame(dependencyProviderRoot) ||
frame(queryShardRoot) ||
frame(sourceId) ||
frame(sourceCid) ||
frame(factKind) ||
frame(shardKey) ||
frame(semanticProjection) ||
frame(factCount) ||
frame(nodeCount) ||
frame(partitionCount) ||
frame(entryCount) ||
frame(dependencyCount) ||
frame(consumerShardCount) ||
frame(providerShardCount) ||
frame(queryIndexCount) ||
frame(queryShardCount) ||
frame(unsupportedCount) ||
frame(tombstoneCount) ||
frame(runtimeRequirementCount)
```

`35` 是其后的 projection 字段数。`projectionBindingCid` 为避免自引用，不进入上述 35 字段：

```text
domain = UTF8("csg_core.store.manifest.staged_projection")
transcript = 上述完整字节串

projection_binding_cid =
  "sha256:" + hex(
    SHA256(u32le(len(domain)) || domain ||
           u32le(len(transcript)) || transcript))

projection_metadata_bytes =
  len(transcript) + len(frame(projectionBindingCid))
```

`projectionBindingCid` 只承诺 projection 字节。它不能替代 reader 或 allocator 的来源证明；
`allocationReceiptCid`、`readerReceiptCid` 任一等于 `projectionBindingCid` 均按自证拒绝。

#### Reader、allocator 与 allocation ledger

四类 CID 的职责不能合并：

```text
readerAuthorityCid   store-owned mapped reader 的 nominal authority 身份
allocatorLayoutCid   本次运行采用的唯一 allocator/layout 合同身份
allocationReceiptCid 当前 projection 的精确 allocation ledger 回执身份
readerReceiptCid      当前对象的映射、读取、digest、释放与 close 回执身份
```

当前 staged verifier 只检查四者是合法 CID、每个 projection 的 `readerAuthorityCid` 和
`allocatorLayoutCid` 与 `Begin` 绑定值相等，并检查 transcript 与自证冲突；它尚未验证对应 receipt
原始 bytes，也尚未从 store-owned reader 或 runtime allocator 获得不可伪造 capability。因此
`readerAuthorityProven=false`、`allocationLedgerProven=false` 是当前真实状态。

allocation ledger 必须由 owner 专用的 lazy mmap/slab runtime domain 直接签发，不得接受调用方拼装的
事件或字节数。每条事件必须绑定 allocation id、owner generation、operation、requested/usable/header/
backing/alignment bytes、allocator layout、live/peak、event index 与 receipt CID；控制面必须记录真实 page
backing，slab 子分配只计各 block 的 ownership/usable bytes，不能把 slab backing page 再重复计入同一
owner 的 heap。跨 owner/target 转移必须由真实 target capability 完成并绑定 transfer receipt，文本 owner、
逻辑 request/release/transfer 计数或 source-level ledger 都不能替代 runtime capability。当前 runtime provider
与 mapped reader 尚未闭合这些条件，因此 `allocationLedgerProven=false`。

ledger 还必须覆盖每次 allocation、resize、retain、release、unmap 和临时 decode buffer 的精确生命周期
与同时存活区间，再由 runtime 事件计算 peak live heap。不得用 wire bytes、对象数、固定开销常量、经验
乘数或 RSS 采样反推总 heap。

#### Wire/count 与 total heap

staged limits 只约束以下可直接计数的输入：

```text
maxManifestWireBytes
maxObjectWireBytes
maxProjectionMetadataBytes
maxTotalWireBytes
maxObjectCount
maxFactCount
```

`totalObservedWireBytes = manifest_wire_bytes + sum(projection.wireByteCount)`，使用 checked `int64`
加法；每个 transcript 的 metadata byte count 单独受限。它不包含解码后的字符串、数组、索引、
allocator header、碎片、retain owner、映射页或同时存活的语义对象，所以 wire/count 合同绝不等于
total heap 合同，也不能把 `totalHeapBounded` 置真。

`Finalize` 可以在 inventory 与累计 count 完全闭合时返回 `logicalInventoryComplete=true`，但当前
固定返回：

```text
totalHeapBounded=false
readerAuthorityProven=false
allocationLedgerProven=false
dynamicRssProven=false
productionReady=false
HARD_RED:store_owned_reader_authority_and_exact_allocation_ledger_required
```

staged result 的 `productionReady` 只有在 `ok && logicalInventoryComplete && totalHeapBounded &&
readerAuthorityProven && allocationLedgerProven && dynamicRssProven` 全部为真时才允许为真。当前源码
没有满足该合取式的路径；逻辑库存闭合不能表述成生产闭合。

#### Linux cgroup v2 精确 1 GiB 回执

最终动态内存证明只接受 Linux kernel cgroup v2 对完整进程树的回执，固定条件为：

```text
schema=csg_core.exact_1g_process_tree.receipt
status=passed
proofStatus=proved_linux_kernel_cgroup_v2_aggregate
hostSystem=Linux
limitBytes=1073741824
swapBytes=0
memoryScope=cgroup_and_all_descendants
kernelAuthority=linux_cgroup_v2_memory.max
processTreePlacement=attach_before_exec_kernel_inherited
processTreeCompletion=subreaper_waits_all_descendants
userSpacePollingAuthority=0
```

每条 command 还必须满足 `workloadRc=0`、`oomKill=0`、`stderrBytes=0`、
`0 <= memoryPeakBytes <= 1073741824` 和 `elapsedNs >= 0`。suite receipt 只有在所有 deterministic
artifact 对拍一致、`unfinishedObligations=[]` 且 `status=passed` 时才提供动态生产证据。用户态轮询、
父进程 RSS、`rlimit` 或仅写入 `1073741824` 常量都不是该证明。

当前 suite 把 `pure-staged-manifest-hard-red` 明确列为 unfinished obligation，reason 为
`store_owned_reader_authority_and_exact_allocation_ledger_required`；真实 Linux 执行尚未完成时固定
`linux_execution=not_run`。因此现有 1 GiB suite 静态合同不提供动态完成额度。

#### Native immutable launcher 与 candidate compiler receipt

生产 CSG 动态证据分配、编译和 workload 执行之前，必须先取得 native launcher 从实际执行上下文
签发的 opaque execution receipt。portable receipt 只允许以下状态：

```text
status=CANDIDATE
material_role=candidate_material_only
production_authority=unavailable
production_execution_identity_binding=unavailable
launcher_exec_identity=HARD_RED
dynamic_completion_credit=0
```

Darwin candidate 路径是 `/private/var/db/cheng/bootstrap-stage23-portable-authority-receipt.kv`，Linux
candidate 路径是 `/var/lib/cheng/bootstrap-stage23-portable-authority-receipt.kv`。二者可绑定 compiler、
source snapshot、跨平台 closure、lane 和 fixed-point 材料，但 native launcher 接线前不能升级成
production trust root。旧外部 anchor、执行前后 inode/hash 相同、仓库脚本自校验或 caller 传入 CID
都不能完成该升级。

生产 launcher 物理合同固定为：

```text
Darwin launcher=/usr/local/libexec/cheng/csg-production-launcher
Darwin binary=/usr/local/libexec/cheng/csg-core-native
Linux launcher=/usr/libexec/cheng/csg-production-launcher
Linux binary=/usr/libexec/cheng/csg-core-native
```

Linux receipt 必须证明 `fs-verity`、inode immutable、held binary FD 和
`execveat(AT_EMPTY_PATH)` 的实际执行身份；Darwin receipt 必须证明 root-owned designated requirement、
`SF_IMMUTABLE` 和 actual audit token identity。两个平台都必须绑定 launcher/binary 完整 stat identity、
bytes CID、source CID、compiler authority CID、external anchor CID、held descriptor identity 与 named-path
前后 fence。repository `tools/csg` 只允许 build/install；生产 consumer 不得直接执行它。

最终 production admission 是 staged result 的 `productionReady=true`、native immutable launcher
execution receipt 有效、allocation ledger 闭合、Linux cgroup v2 精确 1 GiB suite `status=passed` 且无
unfinished obligation，以及最终 manifest/immutable successor/artifact receipt 全部闭合的合取。任一项缺失都必须在
lowering 和 successor commit 前 hard-fail。当前 provider-owned activation event source 与跨会话 replay anchor 未接线，固定精确 `HARD_RED:production_launcher_held_exec_event_source_unwired`、`productionReady=false`、
`dynamic_completion_credit=0`。
<!-- csg-core-production-receipt-contract:end -->

## Summary And Report

纯 Cheng `csg validate|admit` 的公开 key-value 输出固定使用 snake_case：

```text
valid
mode
standard
schema
schema_namespace
profiles
profile_count
profile_<ordinal>
profile_set_cid
fact_count
facts_root
complete
unsupported_count
tombstone_count
runtime_requirement_count
runtime_requirements_status = satisfied | open
```

strict validation 失败时不得输出 `facts_root`，防止错误 facts 被包装成可寻址生产输入。sandbox 可以输出用于 `validate/root/diff/report` 的隔离 root，但必须同时输出 `complete=false`；production admission 不得消费该 root。公开输出不得出现 `factsRoot`、`profileSetCid`、`schemaNamespace` 或 `runtimeRequirementCount` 等 camelCase 别名。

`ts-csg --emit csg-core --summary-out summary.json` 的 summary 是生产摘要，固定使用 snake_case：

```text
schema        = "csg-core.summary"
standard      = "csg_core::v1"
complete      = 是否无 unsupported、无 tombstone、无 open runtime requirement
facts_root    = canonical facts 的 Patricia Merkle DAG sha256:<hex>
counts        = 轻量计数
runtime_closure = 只含 complete、计数、by_runtime/by_kind/by_source 桶
unsupported_count
runtime_requirement_count
external_symbol_count
diagnostic_count
```

summary 不得携带完整 `unsupported`、`runtimeRequirements`、`externalSymbols`、`runtimeClosure.requirements` 明细数组。生产 admission gate 读 summary 的 `complete` 和 `facts_root`，需要逐条审计时再显式生成 debug report。

`ts-csg --emit csg-core --index-out facts.idx.json` 的 index 是外置离线/debug 查询索引：

```text
schema              = "csg-core.index"
standard            = "csg_core::v1"
profiles
profile_set_cid
schema_namespace
schema_cid
facts_root
dag_root_cid
subgraph_cid
fact_count
csgc_directory_cid
csgc_object_cid
csgc_byte_count
files      = file/module_id/fact_count/symbol_count/function_count/call_count
symbols    = id/name/symbol_kind/file/line/column/exported/fq_name
functions  = id/name/symbol/file/line/column/exported/call_count
calls      = id/file/line/column/owner/callee_text/callee_kind/target_ref_id/target_name
```

index 不参与 root 计算。外置 `.idx.json` 丢失时可以从 `.csgc` 再生成；离线加载时仍必须由已
strict-admit 的 canonical facts/manifest 提供上面整组 expected binding，并逐字段完全相等。仅传
`facts_root` 的旧 load/query 接口必须 hard-fail；root 相同不能替代 CSGC object/directory、
DAG/subgraph、schema/profile 和 byte/count 身份。该外置 index 始终不是 store `local_query` 的输入。

纯 Cheng `CsgCoreMerkleStoreQuery` 的领域 query 热路径固定为：

```text
validated immutable successor tail -> manifest-only authority
  -> bucket = H(index_kind, term)
  -> 只读该 bucket 的 query-shard descriptor/object
  -> 只读实际命中的 partition 与 membership object
  -> 只读对应 Merkle proof path node objects，并验证 fact proof
  -> 最终再次证明 successors/<tailHeadCid|genesis>/head.csgc 不存在
  -> verification_scope=local_query
     full_closure_verified=false
     production_admission=false
```

稀疏 manifest 缺少该 bucket descriptor 时可以返回空 hit set，但仍必须执行最终 tail-absence 检查。禁止为
查询单个 term 解码全量 CSGC、遍历全部 query shards、读取无关 partition，或把外置 `.idx.json` 当作
可信 shard。query report 必须绑定 immutable successor tail/manifest、完整 CSGC/DAG/subgraph 身份、query shard
root/CID、`index_kind`、`term`、result root 和实际对象/字节计数。即使 proof 与末次 tail-absence 检查都
通过，结果也始终是 non-production local verification；生产执行必须另走完整 manifest closure
admission，不能把 `local_query` receipt 升格为 lowering/publish authority。

`ts-csg --emit csg-core --report-out report.json` 的 report 是完整 debug artifact，固定包含：

```text
standard      = "csg_core::v1"
complete      = 是否无 unsupported、无 tombstone、无 open runtime requirement
facts_root    = canonical facts 的 Patricia Merkle DAG sha256:<hex>
factsRoot     = 一轮兼容字段，只读兼容，后续删除
counts
unsupported
runtimeRequirements
externalSymbols
runtimeClosure
entryRoots
```

`--report-out` 不是生产默认输出；大项目中 report 可以大于 `.csgc`，不得把它作为启动或 admission 的必需输入。`complete=false` 阻断 `csg_abi::*` lowering 和 `csg_backend_ir` 生成。

## Tombstone

Tombstone 是可验证的语义缺口，不是降级执行、不是 mock、不是后处理补丁。

标准 fact 逻辑形状：

```json
{
  "schema": "csg_core",
  "kind": "csg_core::tombstone",
  "id": "sym_0422_unsupported_node",
  "reason": "unsupported_prototype_mutation",
  "source_span": { "file": "pkg://npm/lodash/index.ts", "line": 12, "col": 4 },
  "original_text_hash": "sha256:e3b0c442...",
  "impact_scope": "dead_code_or_unreachable"
}
```

门禁：

```text
strict   默认模式；出现 tombstone 直接失败
sandbox  允许 validate/root/diff/report，但 complete=false
```

即使 sandbox 通过结构校验，也禁止进入 `csg_abi::*` 和 `csg_backend_ir`。后续若引入 reachability proof，只能证明 tombstone 不可达后放行对应编译路径；可达或无法证明不可达都必须 hard-fail。

## Relation Sidecar

`csg_relfacts::v1` 是旁路关系事实层，不是新的主 IR，也不是 CSGC。物理载体是 canonical UTF-8 JSONL sidecar，建议后缀为 `.relfacts`；只允许 LF、必须以 LF 结束，禁止 CR、空记录、非 canonical JSON、未知字段和旧 wire magic。

唯一生产 CLI 由纯 Cheng `cheng/core/csg_core/cli` 与 `cheng/core/csg_core/relfacts` 实现：

```sh
csg relfacts encode --before BEFORE.csgc --after AFTER.csgc --out TRANSITION.relfacts
csg relfacts replay --before BEFORE.csgc --sidecar TRANSITION.relfacts --after AFTER.csgc
```

上述命令是终局接口合同，不代表任意路径上的 CSGC 已有 production authority。before/after 必须分别绑定 policy-selected store 中 genesis→successor 连续链内可验证的历史 immutable successor record、manifest 与 canonical CSGC object；普通文件路径、claimed CID 或 validated tail authority 都不能替代某个历史 record 的精确 authority。纯 Cheng `csgc_historical_authority.cheng` 的源码合同已经闭合：零参数 issuer 只消费 OS policy-selected store，从 genesis 沿 `successors/<previousHeadCid|genesis>/head.csgc` 验证连续 generation、previous CID、receipt、manifest full closure，取得 validated tail，并在操作前后双读同一 tail key 的 successor absence；普通路径只提供候选 bytes，两份候选都必须先按 byte count 与完整 object CID 唯一匹配链内历史记录，随后才允许解码并对拍 directory CID、`facts_root`、fact count、standard、schema CID/namespace 与 profile set。多重不等价匹配、链断裂、tail advance 或 destination 冲突直接拒绝，caller 不能提交 expected CID、store、path 或 claimed hash 自授权。

这只把 historical store authority 标为 `SOURCE_CLOSED`。纯 Cheng `production_held_exec_provider` 已能结构化验证 held identities、六步事件链、零预读、禁止路径执行、child identity、scope/workload 与 receipt CID，但 provider-owned activation event source 和跨会话 replay anchor 尚未接线。因此 strict `relfacts encode/replay` 必须先于 history issuer、store/candidate/sidecar I/O、CSGC decode 和输出副作用固定返回 `HARD_RED:production_launcher_held_exec_event_source_unwired`；`production_cli=HARD_RED_LAUNCHER_MISSING`、`dynamic_completion_credit=0`。receipt-local 非重复形状不能冒充跨会话防重放，底层静态闭合也不能宣称生产 CLI 可用。

`BEFORE.csgc` 与 `AFTER.csgc` 都必须先通过 strict admission：CSGC 完整、canonical、`complete=true`、`unsupported=0`、`tombstone=0`，validator 的 fact count、`facts_root`、standard、schema namespace/CID 与 profile set 必须和唯一 Merkle DAG 结果完全一致。任一输入不满足即拒绝，sidecar 不能把非法主 facts 变成可执行输入。

sidecar 第一行是唯一 header，字段按 canonical JSON key 顺序固定为：

```text
after_fact_count
after_facts_root
after_profiles
after_schema_cid
after_schema_namespace
after_standard
before_fact_count
before_facts_root
before_profiles
before_schema_cid
before_schema_namespace
before_standard
event_count
schema = "csg_relfacts::v1"
transition_kind = "canonical_delta"
```

`before_profiles` 与 `after_profiles` 分别绑定各自 canonical profile set，允许合法的 profile-set 变化；但 canonical facts 完全相同而只改变 standard/schema/profile binding 的 binding-only transition 必须以 `relfacts_binding_only_transition_forbidden` 拒绝。profile-set 变化必须伴随真实 fact delta，并同时通过 before/after 两套 root 重绑定。

header 后每行是一条 canonical event，字段固定为 `fact`、`fact_hash`、`fact_key`、`op`、`ordinal`、`schema`。`op` 只允许 `Retract` 或 `Assert`；ordinal 从 0 连续递增。事件序列是 trusted before 上的唯一 canonical delta：先按 before canonical physical order 输出需要删除的 `Retract`，再按 after canonical physical order 输出需要增加的 `Assert`。`event_count` 与实际事件数必须精确相等，所以事件数与 sidecar 载体体积为 `O(diff)`；encode 和 replay 仍读取、strict-admit 并验证完整 before/after 状态，不宣称运行时间或工作内存为 `O(diff)`。

replay 必须以调用方提供且已 strict-admit 的 `BEFORE.csgc` 为唯一可信 base，以 `AFTER.csgc` 为完整结果 oracle。实现必须重新计算 canonical diff 并逐项对拍事件，逐事件验证 fact key/hash 与 Merkle insert/delete proof，再分别用 before binding 和 after binding 重算 root，最后对拍 after canonical fact set、fact count、subgraph CID、DAG root CID 与 `after_facts_root`。错误 base、错误 before/after root、错误 profile set、非 canonical diff、截断、重复/缺失事件或乱序事件都必须稳定拒绝。

CLI 退出合同固定为：参数、顺序或非 strict mode 错误返回 2；输入 admission、sidecar 解析/replay、root/proof 或持久写入错误返回 1；只有完整闭合才返回 0。错误通过 stderr 的 `error: relfacts_*` 或 `error: relfacts_encode_failed relfacts_*` / `error: relfacts_replay_failed relfacts_*` 暴露，不能改写为 warning、marker 或成功 report。成功回执必须包含 `schema=csg_relfacts::v1`、`transition_kind=canonical_delta`、`replay_base=trusted_before_csgc`、before/after fact count、DAG root CID、subgraph CID、`facts_root` 以及 `verified_against_before_facts=1`、`verified_against_after_facts=1`。

文件边界同样属于 admission。before/after/sidecar 输入必须通过固定 parent directory fd 和
`openat(O_NOFOLLOW|O_CLOEXEC)` 打开 regular single-link file；读取必须直接使用该 fd，禁止通过
`/dev/fd`、canonical path 或任何别名重新打开。读前、读后和名称回查必须对拍 device、inode、
mode、link count、size、mtime、ctime 与平台 change version；short read、身份漂移或 close 失败
均拒绝。

encode 输出只允许在目标同目录创建 0600、exclusive、single-link 临时文件，完整写入后依次
验证 file identity、`fsync(file)`、no-replace publish、`fsync(parent)`，再从固定 parent fd
打开最终 leaf，逐字节回读并对拍 staging/final identity。目标预存、symlink、hardlink、路径替换、
截断、write/fsync/publish/close 任一失败都不得返回成功；不能先按路径覆盖再补 hash 检查。

生产 admission 必须先取得 native immutable launcher 的实际执行身份回执，再由其 held binary 执行 encode/replay；认证不满足时必须在读取生产输入或生成 sidecar 前精确 RED。仓库 `tools/csg` 只允许开发期 build/install。静态门和 mutation 只能证明源码合同，`dynamic_completion_credit=0`，不能替代 current-source 受守卫运行证据。

TypeScript 只允许生成语义 `csg.relfact` 或供纯 Cheng bridge 消费的 canonical JSONL facts；不得拥有 sidecar header/codec、Assert/Retract delta 编码、replay、fact hash、Merkle root/proof、持久写入或生产 admission。Rust/Codex 同样不得复制第二套物理 authority。

关系谓词示例：

```text
Function(id, module, name)
Calls(caller, callee)
LocalType(local, type)
DomEvent(node, event, handler)
RuntimeRequirement(domain, kind, name, providerStatus)
ControlSurface(id, node, action, role, label, guard, trace)
```

`Assert(fact)` / `Retract(fact)` 只用于增量分析、LSP、E-Graph candidate 构造，不参与 codegen。E-Graph rewrite 必须限制在已证明等价的 BodyIR 集合内；Mutable Slot、容器 mutation、alias/side-effect 不完整时禁止 CSE 和跨 slot hash 去重。

`csg_relfacts::v1` report 固定包含：

```text
schema = "csg_relfacts::v1"
facts_root
fact_hash_count
subgraph_cid_count
relfacts_diff_assert_count
relfacts_diff_retract_count
```

关系 sidecar 不接受事件历史日志：同一 before/after 只能对应一条 canonical delta；任何能得到相同终态但事件更多、顺序不同或包含抵消操作的 sidecar 都以 `relfacts_deterministic_diff_mismatch` 拒绝。

## Control Surface

控制面标准名：

```text
csg_core::control_surface
csg_dialect::web::control_surface
csg_dialect::web::computer_use_action
```

现有 `csg.web.control_surface` 作为兼容输入保留一轮。新的文档和 validator 使用上面的命名。

控制面是双向声明契约，不是从 DOM 猜意图。前端可以用装饰器或等价元数据声明 action、guard、trace；extractor 输出强类型 facts。Computer Use 只能消费标准原子动作，例如 Click、SetText、Select，不允许跳过事件队列、直接改 CFG 指针或裸写内存 offset。

## Finance Profile

`csg_dialect::finance` 用于 Certified Transaction，不用于证明市场结果。

安全定义：

```text
CSG 编译通过 = 交易符合用户意图、策略、状态快照、合约描述、模拟结果、签名 payload 和执行 substrate
CSG 编译通过 != 保证成交价格、清算路径、MEV 或合约经济结果一定安全
```

标准 fact：

```text
csg_dialect::finance::intent
csg_dialect::finance::policy
csg_dialect::finance::state_snapshot
csg_dialect::finance::contract_profile
csg_dialect::finance::simulation_result
csg_dialect::finance::certified_transaction
csg_dialect::finance::audit_trace
csg_dialect::finance::typed_action
csg_dialect::finance::policy_receipt
csg_dialect::finance::state_snapshot_receipt
csg_dialect::finance::contract_registry_entry
csg_dialect::finance::simulation_receipt
csg_dialect::finance::payload_receipt
csg_dialect::finance::signer_session
csg_dialect::finance::execution_substrate
csg_dialect::finance::production_transaction_environment
csg_dialect::finance::signed_transaction
csg_dialect::finance::broadcast_request
```

`certified_transaction.complete=true` 是交易语义证明；`production_transaction_environment` 必须额外绑定 `executionSubstrateHash`。`complete=false`、`csg.unsupported`、`csg_core::tombstone`、未知 finance fact、未知合约、未知 selector、`approve all`、`delegatecall`、payload/simulation/state hash 不一致、substrate 不完整都必须 hard-fail。

Certified transaction 必须绑定：

```text
intentHash
policyHash
stateSnapshotHash
contractProfileHash
simulationHash
payloadHash
calldataHash
stateReadsHash
validUntilBlock
maxSlippageBps
```

## Asset Profiles

资产编排分三层 profile：

```text
csg_dialect::oracle_asset       真实来源观测 receipt
csg_dialect::unimaker_product   UniMaker 商品资产证书
csg_dialect::vexa               Vexa 可编排资产、确定性 plan、执行 receipt、可恢复 Cell
```

它们不替代 `csg_dialect::finance`。finance 证明交易；asset profiles 证明“这个资产是否来自可验证来源、是否能进入确定性 plan，以及执行后能否恢复”。

标准 fact：

```text
csg_dialect::oracle_asset::observation
csg_dialect::unimaker_product::certificate
csg_dialect::unimaker_product::innovation_document
csg_dialect::unimaker_product::innovation_claim
csg_dialect::unimaker_product::innovation_claim_element
csg_dialect::unimaker_product::innovation_paper_contribution
csg_dialect::unimaker_product::innovation_product_evidence
csg_dialect::unimaker_product::innovation_embedding_receipt
csg_dialect::unimaker_product::innovation_claim_chart
csg_dialect::vexa::asset
csg_dialect::vexa::deterministic_plan
csg_dialect::vexa::execution_receipt
csg_dialect::vexa::recoverable_cell
```

`oracle_asset::observation` 必须绑定：

```text
id
sourceKind
sourceUri
subjectId
valueHash
observedAtMs
ttlMs
reporterCount
quorum
appHash
receiptHash
```

`unimaker_product::certificate` 必须绑定：

```text
id
productId
complete=true
trustLevel
productRoot
oracleReceiptHash
mediaAssetCid
priceE8
inventory
validUntilMs
receiptHash
```

UniMaker innovation facts 把专利、论文与产品证据投影为可验证检索图。运行时图必须采用
DOD + Arena + SoA；document、claim、element、contribution、evidence、embedding 之间的
关系只允许 `int32` 行索引。文本 ID 只用于 CSG fact 的外部身份，不得作为运行时跨节点键。

`innovation_embedding_receipt` 必须绑定：

```text
id
targetKind
targetId
sourceFactCid
modelCid
tokenizerCid
toolCid
vectorCid
dimension
normalizationScale
quantization
vectorValues
complete=true
```

`vectorValues` 必须是 `1..4096` 维、元素范围 `[-32767,32767]` 的非零 `int32` 数组，且
长度等于 `dimension`。搜索只允许比较 model、tokenizer、tool、dimension、scale、quantization 完全一致
的收据；相似度只负责候选召回，不得替代 fact CID 或其他精确身份。

`innovation_claim_chart` 必须绑定：

```text
id
claimId
productId
requiredCount
matchedCount
allRequiredCandidate
candidateOnly=true
thresholdMicros
corpusFactsRoot
modelCid
tokenizerCid
toolCid
dimension
normalizationScale
quantization
alignmentRoot
receiptHash
complete=true
```

`allRequiredCandidate=true` 只表示一个独立权利要求的全部 `required=true` 要素均在当前
证据语料中达到候选阈值。它不是侵权、有效性、新颖性、授权或法律意见。论文 contribution
检索同样只返回贡献、方法、实验和引用重合候选。外部专利/论文语料与正式 embedding 模型
没有被收据绑定前，不得声明全球查新或生产语义检索完成。

当前参考实现与验收入口：

```text
src/apps/unimaker/innovation_csg.cheng
src/tests/unimaker_innovation_csg_smoke.cheng
tools/unimaker_innovation_csg_gate.sh
```

`unimaker_product::publish_record` 是 UniMaker 运行时 ledger record，不进入 CSG-Core validator 的 fact kind 集合，也不写入生产 CSGC 主 cargo。它必须绑定：

```text
taskId
productId
assetId
csgcByteCount
csgcFactCount
assetFactsRoot
closedLoopFactsRoot
planRoot
proofHash
receiptHash
recoveryRoot
eventContentHash
epochSeconds
complete=true
```

`vexa::asset` 必须绑定：

```text
id
assetKind
sourceProfile
subjectId
trustLevel
factRoot
collateralHash
capabilityHash
riskHash
eligibleForPlan
reason
```

`vexa::deterministic_plan` 必须绑定：

```text
id
complete=true
assetId
assetFactRoot
actionKind
preconditionHash
capabilityHash
riskHash
createdAtMs
validUntilMs
planRoot
proofHash
```

`vexa::execution_receipt` 必须绑定：

```text
id
planRoot
executorId
executionStateHash
outputStateHash
executedAtMs
status
receiptHash
```

`vexa::recoverable_cell` 必须绑定：

```text
id
factsRoot
planRoot
receiptHash
stateRoot
resumeTokenHash
recoveryRoot
complete=true
```

Trust level 规则：

```text
unverified       只能发现，不能 plan
attested         只能报价/观察，不能 plan
collateralized   可以进入 plan
observed         可以进入 plan
verified         可以进入 plan
```

生产规则：

```text
未授权商品 claim -> hard-fail
过期 observation/claim -> hard-fail
claim.sourceId / claim.productId / claim.oracleReceiptHash 与 observation 不一致 -> hard-fail
缺 oracleReceiptHash/signerHash/productRoot/receiptHash -> hard-fail
eligibleForPlan=false -> 不能编译 deterministic_plan
planRoot / proofHash 与 plan preimage 不一致 -> hard-fail
execution_receipt 超出 plan 有效期 -> hard-fail
execution_receipt.planRoot 与 deterministic_plan.planRoot 不一致 -> hard-fail
recoverable_cell.receiptHash 与 execution_receipt 不一致 -> hard-fail
unknown oracle_asset/unimaker_product/vexa fact kind -> hard-fail
complete=false -> hard-fail
CSGC 是生产 facts cargo；JSON/JSONL 只允许 debug/report
publish_record duplicate recoveryRoot -> hard-fail
vexa admission duplicate recoveryRoot/planRoot -> hard-fail
```

闭环：

```text
oracle_asset::observation
  -> unimaker_product::certificate
  -> vexa::asset
  -> facts_root
  -> vexa::deterministic_plan(planRoot, proofHash)
  -> vexa::execution_receipt(receiptHash)
  -> vexa::recoverable_cell(recoveryRoot)
  -> unimaker_product::publish_record(ledgerRoot)
  -> vexa admission registry(registryRoot)
```

当前纯 Cheng reference：

```text
src/core/csg_asset/oracle_asset.cheng
src/apps/unimaker/unimaker_product_publish.cheng
src/apps/vexa/vexa_asset_discovery.cheng
src/tests/csg_oracle_asset_unimaker_vexa_smoke.cheng
src/tests/unimaker_vexa_csgc_entry_smoke.cheng
src/tests/unimaker_vexa_runtime_bridge_smoke.cheng
```

执行 substrate 必须绑定：

```text
substrateKind = cheng-csg-transaction-os
osIdentityHash
kernelCapabilityHash
processIsolationHash
signerIsolationHash
memoryPolicyHash
networkPolicyHash
uiTrustedPathHash
deviceAttestationHash
csgMeasurementHash
```

以下能力必须为真：

```text
chengCsgKernel
capabilityRuntime
deterministicSyscalls
signerIsolated
aiProcessIsolated
uiTrustedPath
networkPinned
noDynamicCodeLoading
noVisualTransactionPath
noClipboardTransactionPath
```

`signed_transaction` 和 `broadcast_request` 都必须包含 `environmentHash` 与 `executionSubstrateHash`，否则签名和广播不能证明来自同一执行环境。

交易入口必须从 typed action/control surface 进入。UniMaker 的买卖、授权、取消、结算动作禁止由视觉点击、截图推断或 AI 直接构造裸 calldata 发起。

第一版只覆盖：

```text
internal_payment
content_purchase
rwad_limit_order
dex_limit_order
cancel_order
escrow_settlement
```

风险分级：

```text
low     -> certified transaction 通过后，本机 session signer 可自动签
medium  -> certified transaction 通过后，Passkey/设备认证确认一次
high    -> 大额、新合约、跨链、策略变更、未知资产等必须硬件或多签
failed  -> 不弹确认，直接 hard-fail
```

Signer gate 只接受 certified transaction，不接受裸 calldata。签名 payload 必须包含 `policyHash`、`payloadHash`、`validUntilBlock`、`maxSlippageBps`、`stateReadsHash`，并与 certified transaction 完全一致。

抗量子分层：

```text
身份、内容确权、策略授权  = classical + ML-DSA 双签
长期根授权              = SLH-DSA
交易执行                = 链原生签名
```

当前版本不伪造 PQ 签名，也不把 PQ metadata 当作链上执行签名。等链、钱包或账户抽象支持后，只能新增 PQ signer adapter，不能改变 certified transaction 的 hash 绑定语义。

## Facts Cargo

Facts Cargo 已以 Patricia Merkle DAG 标准化 hash、局部证明和增量根回放；全局缓存服务不属于本轮。

```text
fact_hash     单条 canonical fact 的 domain-separated SHA-256
node_cid      每个 leaf/branch 的 32-byte Merkle node hash
dag_root_cid  Patricia 根节点的 node_cid
subgraph_cid  绑定 fact_count 与 dag_root_hash 的子图根
facts_root    绑定 standard、profiles、schema namespace、schema fact CID 与 subgraph_cid 的最终根
```

要求：

```text
同一输入重复导出 facts_root 字节一致
同一 facts 的任意排列、任意合法编辑历史产生同一个 facts_root
子图未变化时 subgraph_cid 稳定
局部 proof 可独立验证 membership/non-membership
insert/replace/delete replay root 必须等于完整图重算 root
CID 缺失、错 hash、target triple 不匹配必须 hard-fail
```

## Conformance 边界

核心 conformance 只有一个门禁：

```text
核心 conformance      证明纯 Cheng CSG-Core reference 正确
```

`csg-core` 不再是 npm package，也没有 TypeScript 实现。TypeScript 只作为 producer；TS 生成的 facts/report 在开发期由纯 Cheng reference CLI 验证，生产期由固定系统路径的 native Cheng launcher 验证。

## Conformance 工具

共同工具接口（开发期与 Conformance；生产入口不是仓库脚本）：

```sh
csg-core/tools/csg validate [--mode strict|sandbox] facts.csgc
csg-core/tools/csg root [--mode strict|sandbox] facts.csgc
csg-core/tools/csg diff [--mode strict|sandbox] left.csgc right.csgc
csg-core/tools/csg pack --out facts.csgc facts.debug.jsonl
csg-core/tools/csg fact-identities --mode strict --out identities.txt facts.debug.jsonl
csg-core/tools/csg index-query --store-parent /absolute/path --store-name store --kind fact_key|kind|symbol|name|file|caller --term exact-term
csg-core/tools/csg edit append|replace|delete --out next.csgc [--receipt-out receipt.json] [--id id] [--fact json] facts.csgc
csg-core/tools/csg prove --key fact-key --out proof.csgc facts.csgc
csg-core/tools/csg verify-proof [--fact canonical-json] proof.csgc
csg-core/tools/csg replay insert|replace|delete [--fact canonical-json] proof.csgc
csg-core/tools/csg_core_conformance_test.sh
tools/csg_core_pure_conformance_test.sh
tools/csg_core_pure_cli_smoke.sh
tools/csg_root_entry_output_compat_smoke.sh
tools/csg_ts_output_pure_root_smoke.sh
tools/csg_core_json_field_smoke.sh        # legacy/debug text compatibility
tools/csg_core_json_canonical_smoke.sh    # legacy/debug text compatibility
tools/csg_core_jsonl_smoke.sh             # legacy/debug text compatibility
tools/csg_core_root_smoke.sh
tools/csg_core_merkle_dag_smoke.sh
tools/csg_core_merkle_cli_smoke.sh
tools/csg_core_merkle_transaction_request_decode_static_gate.sh
tools/csg_core_merkle_transaction_request_decode_static_gate_contract_test
tools/csg_core_cli_index_query_gate.sh
tools/csg_core_cli_index_query_gate_contract_test
tools/csg_core_merkle_manifest_production_reachability_gate.sh
tools/csg_core_merkle_manifest_closure_static_gate.sh
tools/csg_core_merkle_manifest_closure_static_gate_contract_test
tools/bootstrap_stage23_current_source_fixed_point_production_gate --verify-authority
tools/bootstrap_stage23_current_source_fixed_point_production_gate_contract_test
tools/csg_core_diff_smoke.sh
tools/csg_core_data_edit_smoke.sh
tools/csg_core_pure_validate_smoke.sh
tools/csg_relfacts_conformance_test.sh
src/tests/csg_finance_certified_transaction_smoke.cheng
src/tests/csg_finance_transaction_environment_smoke.cheng
src/tests/csg_oracle_asset_unimaker_vexa_smoke.cheng
src/tests/unimaker_vexa_csgc_entry_smoke.cheng
src/tests/unimaker_vexa_runtime_bridge_smoke.cheng
```

`src/core/csg_core/cli.cheng` 是 validation/root/diff/pack/edit/prove/verify-proof/replay/fact-identities 的纯 Cheng 语义入口。仓库 `csg-core/tools/csg` 与 root-level `tools/csg` 只允许开发期 build/install；生产 consumer 只能调用固定系统路径的 native Cheng launcher，不能把可变仓库脚本或按路径重解析的缓存 binary 当作执行 authority。

`fact-identities --out` 将逐行 identity 写入 mode `0600` 的独占文件，stdout 只返回不超过 1 KiB 的 canonical receipt。回执必须绑定最终文件 `dev/inode/mode/nlink/uid/gid/size/mtime/ctime` 与 `output_sha256_cid`；TypeScript 用 `O_NOFOLLOW` 打开同一文件并流式计算 SHA-256，只证明传输完整性，不是第二套 fact hash、subgraph CID 或语义 authority。当前 API 仍把解析结果收集为 `identities[]` 全量常驻，因此只能声明消除了巨型 stdout/V8 字符串，不能声明总内存已经闭环。

TypeScript 仍只是 extractor/runtime producer。新标准语义必须先落在纯 Cheng reference path，并由受认证的 production launcher 执行。

当前验收分层必须保持如下口径：

```text
Merkle root/proof/plan 与 typed request  静态合同和纯 Cheng 源码接线可单独验收
local_query manifest-only 路径           静态合同可验收；结果固定 non-production
batch manifest closure                  memory HARD_RED；没有动态生产完成
compiler receipt                        native launcher 接线前仅 CANDIDATE
production execution identity           provider event source/replay anchor 未接线时 HARD_RED
```

mutation contract 只证明被删除、绕过、改序或放宽的源码分支会使静态门变 RED；它不执行真实生产
publication，不证明 RSS/heap 上界，也不能替代 current-source compiler authority。所有动态完成结论
必须绑定 native immutable launcher 的实际执行身份、受守卫运行、完整 manifest closure 和最终
immutable successor/artifact receipt。

Pure Cheng data edit、proof 与 replay 只写本规范“CSGC 字节合同”定义的 64-byte header + section directory + dictionary/fact-kind payloads。旧 row-only/单体 token cargo、TypeScript 实验 codec、第二 root 或第二 proof cargo 都不是生产输入。

非法 CSGC 必须在消费 facts 前 hard-fail。对外错误字符串的首个 ASCII token 是稳定错误码前缀；其后的数值、上下文和实现诊断不属于 ABI。包装 varuint 错误时，第二个 token 可以是下表 `varint` 层的稳定前缀，例如 `truncated_dict_len non_canonical_varint`。消费者只能按稳定前缀判定类别，不能匹配完整错误文本。

<!-- csgc-stable-decode-error-prefixes:start -->
```text
[header]
truncated_header
bad_magic
unsupported_header_size
unsupported_csgc_flags
compressed_body_unsupported
header_u32_out_of_range
truncated_body_size_mismatch
nonzero_reserved_header

[framing]
trailing_bytes

[directory]
truncated_section_directory
section_directory_size_out_of_range
section_count_out_of_range
section_directory_overflow
truncated_section_entry
truncated_section_kind
section_kind_size_out_of_range
truncated_section_kind_bytes
invalid_section_kind_utf8
truncated_section_cid
section_u32_out_of_range
non_canonical_dictionary_section
non_canonical_fact_section
non_canonical_section_order
empty_fact_section
section_length_out_of_range
section_overlap
non_canonical_section_gap
section_range_out_of_bounds
dictionary_count_out_of_range
fact_count_out_of_range
fact_count_overflow
non_canonical_section_directory_size
fact_count_mismatch
section_directory_not_valid
section_iterator_out_of_range

[dictionary]
dictionary_count_mismatch
truncated_dict_len
non_canonical_dictionary_entry
truncated_dict_bytes
duplicate_dictionary_entry
non_canonical_dictionary_order
non_canonical_dictionary_section_size
non_canonical_dictionary

[fact_section]
fact_kind_empty
fact_section_index_out_of_range
section_fact_count_mismatch
fact_kind_section_mismatch
non_canonical_fact_section_size
decoded_section_size_overflow
decoded_fact_count_mismatch

[varint]
varint_offset_out_of_range
varint_overflow
non_canonical_varint
truncated_varint

[token_utf8]
line_range_out_of_bounds
truncated_token_count
token_count_out_of_range
truncated_token_tag
truncated_dict_ref
bad_dict_ref
truncated_inline_len
truncated_inline_bytes
invalid_utf8
non_canonical_inline_dictionary_token
unsupported_token_tag
non_canonical_token_stream

[canonicality_digest]
section_cid_mismatch
non_canonical_facts
non_canonical_csgc
```
<!-- csgc-stable-decode-error-prefixes:end -->

稳定分层与真实解码顺序固定为：`csgcReadHeader -> CsgCoreCsgcParseSectionDirectory -> csgcDecodeDictionarySection -> csgcDecodeFactSection`。其中 directory 先验证 header、目录范围、section 顺序和总 count；dictionary/fact section 在解码 payload 前分别验证 `section_cid_mismatch`；line decoder 再验证 bounded varuint、token tag、UTF-8 和 token canonicality。`CsgCoreCsgcDecodeFactKindClaimed` 的调用顺序固定为 parse directory、计算 claimed directory CID、定位 kind、解码并验 dictionary、解码并验目标 fact section；`CsgCoreCsgcDecodeLines` 在全部 section 解码后继续核对 decoded fact count、全局 fact order 和 dictionary canonicality。

上述注册表只承诺由外部物理输入触发的稳定 decode/admission 前缀。encoder 的 `csgc_empty_fact_line`、`csgc_fact_kind_missing`、`csgc_physical_order_failed`，以及 `alloc_failed`、`panic(...)`、index/insert/grow/partition 等实现失败不是公共错误 ABI；它们仍必须 hard-fail，但调用方不得依赖其文本，未来可改为结构化内部故障。

Run `tools/csg_root_entry_output_compat_smoke.sh` when touching CLI entry routing. It compares root `tools/csg`, package `csg-core/tools/csg`, and a freshly compiled pure Cheng candidate on the same `validate/root/diff` fixtures, including strict tombstone failure, sandbox tombstone report, stable root, same diff, and changed diff.

Run `tools/csg_ts_output_pure_root_smoke.sh` when touching `ts-csg` CSG-Core report/root output. It proves that TS-generated facts/report are checked by both pure Cheng entries: root `tools/csg` and package `csg-core/tools/csg`.

最低要求：

```text
csg_core minimal facts -> pass
bad namespace -> fail
tombstone strict -> fail
tombstone sandbox -> pass + complete=false + tombstone_count>0
unsupported -> pass + complete=false + unsupported_count>0
repeated export -> byte-identical facts_root
fact order/history perturbation -> identical facts_root
membership/non-membership proof -> local verify pass
bad path/direction/count/sibling/fact hash -> fail
insert/replace/delete proof replay -> equals full graph root
canonical relfacts delta replay -> equals strict-admitted after graph
before/after profile-set change with real fact delta -> pass
binding-only transition -> fail
wrong before base/root/profile or wrong after root/profile -> fail
non-canonical diff/order and truncated sidecar -> fail
legacy relfacts_v1 -> fail
control surface action count -> equals computer_use_action count
```

## Test Plan

```sh
cd /Users/lbcheng/cheng-lang/ts-csg
npm run build
npm run smoke:csg-core-conformance
npm run smoke:csg-web
npm run smoke:web-projects
npm run smoke:js-runtime-core
npm run smoke:web-runtime-core

/Users/lbcheng/cheng-lang/csg-core/tools/csg_core_conformance_test.sh
/Users/lbcheng/cheng-lang/tools/csg_core_pure_conformance_test.sh
/Users/lbcheng/cheng-lang/tools/csg_core_pure_cli_smoke.sh
/Users/lbcheng/cheng-lang/tools/csg_root_entry_output_compat_smoke.sh
/Users/lbcheng/cheng-lang/tools/csg_ts_output_pure_root_smoke.sh
/Users/lbcheng/cheng-lang/tools/csg_core_json_field_smoke.sh        # legacy/debug text compatibility
/Users/lbcheng/cheng-lang/tools/csg_core_json_canonical_smoke.sh    # legacy/debug text compatibility
/Users/lbcheng/cheng-lang/tools/csg_core_jsonl_smoke.sh             # legacy/debug text compatibility
/Users/lbcheng/cheng-lang/tools/csg_core_root_smoke.sh
/Users/lbcheng/cheng-lang/tools/csg_core_diff_smoke.sh
/Users/lbcheng/cheng-lang/tools/csg_core_data_edit_smoke.sh
/Users/lbcheng/cheng-lang/tools/csg_core_pure_validate_smoke.sh
/Users/lbcheng/cheng-lang/artifacts/bootstrap/cheng.stage3 system-link-exec --root:/Users/lbcheng/cheng-lang --in:/Users/lbcheng/cheng-lang/src/tests/csg_finance_certified_transaction_smoke.cheng --emit:exe --target:arm64-apple-darwin --out:/tmp/csg_finance_certified_transaction_smoke && /tmp/csg_finance_certified_transaction_smoke
/Users/lbcheng/cheng-lang/artifacts/bootstrap/cheng.stage3 system-link-exec --root:/Users/lbcheng/cheng-lang --in:/Users/lbcheng/cheng-lang/src/tests/csg_finance_transaction_environment_smoke.cheng --emit:exe --target:arm64-apple-darwin --out:/tmp/csg_finance_transaction_environment_smoke && /tmp/csg_finance_transaction_environment_smoke
/Users/lbcheng/cheng-lang/artifacts/bootstrap/cheng.stage3 system-link-exec --root:/Users/lbcheng/cheng-lang --in:/Users/lbcheng/cheng-lang/src/tests/csg_oracle_asset_unimaker_vexa_smoke.cheng --emit:exe --target:arm64-apple-darwin --out:/tmp/csg_oracle_asset_unimaker_vexa_smoke && /tmp/csg_oracle_asset_unimaker_vexa_smoke
/Users/lbcheng/cheng-lang/artifacts/bootstrap/cheng.stage3 system-link-exec --root:/Users/lbcheng/cheng-lang --in:/Users/lbcheng/cheng-lang/src/tests/unimaker_vexa_csgc_entry_smoke.cheng --emit:exe --target:arm64-apple-darwin --out:/tmp/unimaker_vexa_csgc_entry_smoke && /tmp/unimaker_vexa_csgc_entry_smoke
/Users/lbcheng/cheng-lang/artifacts/bootstrap/cheng.stage3 system-link-exec --root:/Users/lbcheng/cheng-lang --in:/Users/lbcheng/cheng-lang/src/tests/unimaker_vexa_runtime_bridge_smoke.cheng --emit:exe --target:arm64-apple-darwin --out:/tmp/unimaker_vexa_runtime_bridge_smoke && /tmp/unimaker_vexa_runtime_bridge_smoke
/Users/lbcheng/cheng-lang/artifacts/backend_driver/cheng run-host-smokes cheng_skill_consistency_smoke
```

禁止：

```text
把 ts-csg 改成 Rust/Cheng 重写
把 rust-csg-core 塞进 ts-csg
把 Web runtime facts 放进 csg_core
把 Codex 业务 facts 放进 csg_core
用 CHENG_CSG 或 CHENGCSG 替代 CSG-Core
用 tombstone 生成生产 artifact
```
