> **口径迁移（2026-09-08 用户令）**：内存模型理论极限=768MiB=805,306,368 bytes；本文历史 1GiB/1073741824 为迁移前口径，当前守卫与验收一律以 768MiB 为准。

# system_link_exec_pure Cross-Platform Production Authority

状态：`applying / user confirmed 2026-09-03`。用户已明确要求实施“纯 Cheng 最小内核与资源
双极限完成计划”，其中包含本提案的 Linux/Darwin 双 lane authority。动态完成信用仍只在真实
双 lane、compositor、Darwin 原子 publisher 全部通过后产生。

## Apply 更新（2026-09-03）

- production authority 增加 `kernel + exactly one native plugin` 模式；lane receipt 必须绑定原始
  composition manifest、解析后的 source closure CID、plugin manifest/CID、target descriptor CID。
- kernel-only 只用于缺插件负例，不可发布为 production compiler；生产 lane 必须证明闭包内恰有一个
  native plugin，且 kernel 子闭包不可达任何 arch 实现。
- 固定点只接受不同 inode 的 GEN2/GEN3 原始 `cmp` 与 SHA-256；旧 masked Mach-O compare 不具 authority。
- Linux 正式腿固定 cgroup v2 `memory.max=1073741824`、`memory.swap.max=0`；Darwin 只签发原生行为与
  sampled observation，不冒充硬内存证明。
- 发布回执统一纳入 `cheng.kernel.release.v1` terminal，未绑定 source/compiler/tool/target/jobs/cache
  mode/wall/process-tree peak/artifact hash 的旧散装 receipt 一律不是输入 authority。

## 动机

`tools/system_link_exec_pure_current_source_producer.sh` 当前把互斥条件放在同一进程：它要求
Linux cgroup v2 聚合内存硬证明，同时生成并执行 `arm64-apple-darwin` Mach-O。Linux 不能执行该
Mach-O，Darwin 又不能签发 Linux kernel cgroup 证明，因此单 producer 没有真实成功宿主。

本提案不修改、包装或放宽旧 producer。新生产链拆成两个独立 lane，并只允许 Darwin publisher
消费双 lane 合成权威：

```text
Linux x86_64 ELF exact-1GiB lane ─┐
                                  ├─ source/semantic equality compositor
Darwin arm64 Mach-O behavior lane ┘
                                  -> Darwin fixed-path verifier
                                  -> same-filesystem bundle rename
                                  -> official authority bundle
```

## 唯一生产合同

1. Linux lane 必须在真实 `x86_64-unknown-linux-gnu` 主机上生成 ELF 并执行正反行为门。compile、
   `status`、negative、source manifest 与 semantic receipt 全部位于同一祖先进程树的 cgroup v2
   硬门内；`memory.max=1073741824`、`memory.swap.max=0`，聚合峰值、OOM、成员与逃逸 ledger
   完整。userspace sample、ulimit、单 PID RSS 或事后声称 1GiB 均不算证明。
2. Darwin lane 必须在真实 `arm64-apple-darwin` 上生成并执行 Mach-O。它证明原始字节身份、Mach-O
   header/load-command、`status` stdout/stderr/exit、negative stdout/stderr/exit 与重复执行确定性；Darwin
   userspace 1GiB guard 只能记 `sampled_observation`，不得冒充 Linux hard proof。
3. 两个 lane 都必须消费同一跨平台 compiler authority terminal，并在 guard 内通过预打开 tracked
   FD 生成 canonical source manifest 与 semantic receipt。manifest 只含排序后的仓内相对路径、
   raw byte SHA-256 与长度；绝对路径、inode、mtime、host 名和外部生成 manifest 不得进入 portable
   identity，也不得成为成功输入。
4. 编译报告新增 target-neutral `semantic_kernel_cid`。它绑定完整 production-admitted CompilerCSG、
   entry declaration、TypedExpr/BodyIR 语义、source bundle 与 `system_link_exec` command contract，
   不含 target triple、object layout、地址、路径或平台工具字节。lane 不能由脚本猜测、源码文本
   拼接或 runtime 输出反推该 CID。
5. compositor 必须逐字节核对两个 source manifest，并要求以下字段全部相等：

   ```text
   compiler_authority_terminal_cid
   compiler_source_snapshot_cid
   source_closure_cid
   entry_source_cid
   semantic_kernel_cid
   command_contract_cid
   status_behavior_cid
   negative_behavior_cid
   ```

   只允许 target triple、artifact format、artifact bytes、map/debug bytes 与平台 guard 证明不同。
   compositor 自己重算 lane receipt、evidence closure 与 composite terminal CID；不接受 caller 提供
   的 equality 布尔值或 CID。
6. Linux evidence 通过固定 schema 的 portable bundle 传输，并在 Darwin 固定 root-owned 路径
   `/private/var/db/cheng/system-link-exec-pure-linux-portable-anchor.kv` 绑定 evidence closure CID、
   Linux lane receipt 与 compositor tool identity。publisher 不接受 caller 指定 anchor/evidence 路径。
7. 单 lane、缺 lane、重复同平台 lane、伪造/手写 guard report、guard 外 manifest、未绑定 tool、
   source/semantic 不相等、ELF/Mach-O 格式错配、行为输出漂移、evidence closure 漂移，全部返回
   `HARD_RED`，且正式路径零写入。
8. publisher 只在真实 Darwin arm64 执行，只接受固定 compositor 和固定 authority roots。它重新
   验证双 lane、root-owned Linux anchor、Darwin candidate、源码后置 manifest、semantic equality
   与行为；不得把 compositor 的 `READY` 字符串当证明。
9. 多文件正式状态使用单目录原子发布。publisher 在 `artifacts/bootstrap` 同文件系统私有 staging
   目录写入并 fsync 全部内容、目录与 terminal receipt，再以 `renameatx_np(RENAME_EXCL)` 一次安装
   `artifacts/bootstrap/system_link_exec_pure.authority`，随后 fsync 父目录。正式 executable 固定为：

   ```text
   artifacts/bootstrap/system_link_exec_pure.authority/system_link_exec_pure
   ```

   receipt、两 lane receipt、composite receipt、compiler report、map 与全部 guard report 位于同一
   authority 目录。旧散装 executable、`.report.txt`、`.current-source-tool-receipt.kv`、各 `.guard.kv`
   和 `.system_link_exec_pure.current-source-publish.kv` 不再是生产权威；消费者必须迁移到 bundle 内
   固定路径。
10. 已存在且逐字节相同的完整 bundle 可经全量重验返回 `reused`；缺件、transaction marker、异物、
    不同 identity 或部分旧散装发布一律 hard-fail，禁止覆盖、补齐、清理后继续或从单 lane 恢复。
11. publication receipt 是 bundle 内唯一 terminal authority，绑定除自身外所有文件的相对路径、
    SHA-256、mode、size、lane/composite/tool CID 与 `bundle_payload_closure_cid`，并以
    `receipt_payload_sha256` 自封。verifier 再以 domain-separated framing 从 payload closure CID 与
    terminal receipt SHA-256 派生 `authority_bundle_cid`；receipt 不得包含自己的最终 hash，禁止循环
    fixed point。symlink、外部 hardlink、非单链接文件、可写 executable/receipt 或未排序 key set
    全拒绝。

## Lane 与回执

Linux lane receipt 至少绑定：ELF class/endian/machine、compiler authority、guard/runtime/monitor
identity、cgroup v2 mount/controller/limit/swap/peak/OOM/member ledger、source/semantic identity、三次
command argv/env、artifact/map/report raw hashes、行为 CID、前后 source manifest raw hash和 evidence
closure CID。

Darwin lane receipt 至少绑定：Mach-O magic/cputype/filetype、compiler authority、Seatbelt/guard/runtime/
monitor identity、sampled peak与“不构成 hard proof”状态、source/semantic identity、三次 command
argv/env、artifact/map/report raw hashes、行为 CID、重复运行结果与 evidence closure CID。

所有 receipt 使用 exact key set、canonical uint/fshex、LF-only、domain-separated length framing、
`receipt_key_count` 与 ordered key-tuple SHA-256。任何未知、缺失、重复、乱序字段都拒绝。

## Files / Action / Verify / Done

| files | action | verify | done |
| --- | --- | --- | --- |
| 新 `tools/system_link_exec_pure_production_lane_engine` | 固定 Linux/Darwin lane phase、guard 内 manifest/semantic receipt、evidence bundle | platform/format/guard/manifest/behavior mutations 全杀 | 两 lane 各自可证明但均无 publish 能力 |
| 新 `tools/system_link_exec_pure_cross_platform_compositor` | 重验双 lane closure，逐字节 source equality 与字段级 semantic equality，生成 composite terminal | 单 lane、同平台双份、交换 receipt、伪 equality、source/semantic drift 全拒绝 | 只有真实双 lane 得到 `READY_FOR_DARWIN_PUBLICATION` |
| 新 `tools/system_link_exec_pure_darwin_authority_publisher` | 固定路径重验、root anchor、私有 staging、bundle 原子 rename、receipt terminal | crash cut、异物、已存在不同 bundle、receipt 非最后写、legacy 路径攻击全拒绝 | absent 或完整可重验 bundle，无部分正式状态 |
| 新 `src/core/tooling/system_link_exec_semantic_authority.cheng` 与 `compiler_main.cheng` | 从已准入同一 CompilerCSG/TypedExpr/BodyIR 生成 target-neutral `semantic_kernel_cid` 并写 compile report | target-only mutation不改 CID；任一语义/所有权/调用/布局输入 mutation 必改 CID | compositor 不靠源码猜语义相等 |
| 新 lane/compositor/publisher 三组 contract tests 与 `tools/system_link_exec_pure_production_gate` 及其 contract | 稳定 source/import/tool closure、真实调用图、receipt parser、publisher crash/recovery mutation | 至少覆盖下述拒绝矩阵；scanner 不完整自身 RED | 门名不替代真实 lane 与原子 publish |
| release inventory/consumer gates | 官方路径迁移到 authority bundle；旧散装路径生产零消费者 | 旧路径恢复、symlink、部分 bundle mutation 全拒绝 | 唯一正式 executable/receipt 路径 |

新增门的固定文件名为：

```text
tools/system_link_exec_pure_production_lane_engine_contract_test
tools/system_link_exec_pure_cross_platform_compositor_contract_test
tools/system_link_exec_pure_darwin_authority_publisher_contract_test
tools/system_link_exec_pure_production_gate
tools/system_link_exec_pure_production_gate_contract_test
```

`tools/system_link_exec_pure_current_source_producer.sh` 及其现有 contract test 不在 apply 修改集；旧工具
继续作为已知不可达的历史诊断面，任何调用它发布正式路径的代码或门禁都必须 RED。

## 必杀 mutation

1. 删除任一 lane，复制 Darwin receipt 冒充 Linux，或把 Linux `sampled` 改写成 hard proof。
2. 在 guard 前后生成、替换或修改 source manifest/semantic receipt；tracked FD 与命名路径身份分离。
3. 手写 PASS report、复用别次 cgroup ledger、改变 memory/swap limit、漏进程或制造逃逸。
4. ELF machine/class、Mach-O cputype/filetype、target triple或可执行行为任一错配。
5. source manifest 行交换、路径绝对化、raw source byte变化；semantic kernel、entry、command contract
   任一 lane 不等。
6. compositor 只比较 source、不比较 semantic，或只比较 CID 字符串不重算原始 receipt/closure。
7. publisher 跳过 root anchor、接受 caller path、接受单 lane、接受 fake composite、在非 Darwin 执行。
8. bundle 内任一文件缺失/多余/可写/链接，terminal receipt 非最后生成，rename 前未 fsync，rename
   允许覆盖，或恢复旧散装发布顺序。
9. 任一失败后 authority bundle 出现，或生产消费者仍读取旧 `artifacts/bootstrap/system_link_exec_pure`。

## 动态完成门

同一冻结源码至少生成两次 Linux lane 与两次 Darwin lane；各平台内 artifact/report/receipt 原始字节
固定，跨平台 source manifest 原始字节、semantic/behavior CID 完全相等。Linux 原始 cgroup 证明、
Darwin 原始行为回执、composite terminal 与 publisher bundle closure 全部绑定源码/编译器/工具哈希。

正式完成只在 Darwin 原子 publisher 成功后成立；lane PASS、compositor READY、contract PASS、临时目录
candidate 或“可生成 publisher”均为零完成信用。

## 用户确认点

确认后实施新双 lane/compositor/publisher，并迁移正式消费者；不修改旧 producer 实现，不从旧候选、
单 lane 或历史 receipt 复制任何正式 artifact。
