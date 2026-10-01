> **口径迁移（2026-09-08 用户令）**：内存模型理论极限=768MiB=805,306,368 bytes；本文历史 1GiB/1073741824 为迁移前口径，当前守卫与验收一律以 768MiB 为准。

# CID 身份链正式闭环

状态：`applying`。2026-07-22 用户确认 CID-first 计划并明确要求实现。official driver、点火、regalloc 与 publisher 在 `CID_GREEN` 前冻结；其阻断不得计入 CID 完成。

## 目标

- 以 domain-separated、length-prefixed SHA-256 建立 `zero-byte import -> source bundle/entry receipt -> CSG atomic consume -> migration/mirror -> world` 的 portable 身份链。
- 语义身份只包含 packageId、canonical modulePath、原始长度/字节和 canonical import graph；绝对路径与运行期索引只属于物理执行回执。
- current-source candidate 的构建、六项语义用例和独立 oracle 在 exact 1GiB kernel aggregate cap 下可重复完成。
- 原始证据、独立 validator、mutation kill 与离线复核正式进入 `cheng-fusion` 后，才签发 `CID_GREEN`。

## 生产合同

- stable writer 只写新 schema；V1 只允许显式 diagnostic reader，禁止 silent compatibility。
- CSG 失败不得修改 plan/out；成功在最后一步 move 固定尺寸 source receipt，然后清空所有 source/import/owner payload；第二次消费 hard-fail。
- parser receipt 与现有 raw graph receipt 含本机 sourcePath/workspaceRoot，只能进入 local execution receipt；portable semantic/migration CID 只绑定 source identity receipt 与 canonical CSG，不得把 local transition receipt 反向带入跨 root 链。
- 发布拓扑固定为 `semantic compile -> migration proof/mirror bundle -> manifest -> worldHead -> final compile receipt/world envelope`，proof/mirror 不得包含 final receipt。
- mirror 只消费 manifest/compact dependency receipt，不读已消费 link plan。物理路径只由 canonical modulePath 经唯一 mapper 推导。
- compact dependency receipt 在 CSG consume 前冻结既存 dependency semantic roots，不含之后的新 manifest/world/final；物理 locator 使用独立本机 seal。新 UniverseManifestV2 顶层只提交一次 aggregate receipt CID，并分别提交各 mirror bundle CID，禁止双向引用。
- 安装固定为 `VerifyBundle -> InstallAtomic -> OpenVerified`；同文件系统 staging、写后重算、marker、atomic rename。已有相同 bundle 幂等成功，差异 hard-fail，禁止覆盖。

## Apply 分片

| 分片 | files | action | verify |
| --- | --- | --- | --- |
| C1 bounded CSG | TypedExpr/CompilerCSG | function-slice range union、portable source/semantic receipt、原子消费 | full-source rescan=0；失败前后 hash 相同；二次消费红 |
| C2 source/world | SystemLinkPlan/Exec/CompilerWorld | source/entry/import/manifest/deps/syntax SHA-256；sourceToCsg seal；恢复 lock/pin fail-fast | zero/missing/order/path/协调重哈希矩阵 |
| C3 migration/mirror | CompilerMain/WorldBundle/Libp2p | migration V3/proof V2、mirror V2、无环 world envelope、原子安装 | 跨 root 固定点；path/symlink/tamper/fail-injection 全拒 |
| C4 evidence | hard-memory tools/Fusion | 六例独立 receipt、kernel OOM 反证、离线 validator、独立 raw-byte oracle | 破坏类 100% kill；保持类零假红；exact-1GiB receipt 可离线复核 |

## 收官条件

- 同一冻结 source/candidate/tool/image manifest 下，六个 CID 用例分别编译运行全绿。
- Linux cgroup v2 明确 `memory.max=1073741824`、`memory.swap.max=0`；双 700MiB 子进程 aggregate OOM 反证成立。
- Fusion 不调用 Cheng producer 的哈希实现，独立重算 source、entry、CSG、migration、proof、manifest、mirror、world roots。
- Darwin userspace RSS 只标 sampled observation；publisher、official、GEN2/GEN3 不参与 `CID_GREEN` 判定。

## Apply 证据

- 2026-07-22：immutable image `sha256:62c95065639a53f5e41297f780e2eac0f07d9250a7903be0f79417b1a76c52a1` 的双 700MiB aggregate OOM 反证通过；`memory.peak=1073741824`，两 child rc=137，live/offline validator、audit mutation/recovery、output rename/restore history self-test 全部 PASS。此项只关闭硬门自证，candidate、六例、mutation 和 Fusion oracle 保持 RED。
- 2026-07-26：current hard-memory 唯一入口已迁到 `--target`、固定 `system-link-exec`、`--evidence-root` 与逐 case native descriptor；旧 `--evidence-dir/--mode` 调用已由 AST mutation self-test 拒绝。六例正式运行仍为 RED：current driver 尚无可达的 CID case 编排命令，禁止绕回 generic runner 冒充 current-source 证据。
