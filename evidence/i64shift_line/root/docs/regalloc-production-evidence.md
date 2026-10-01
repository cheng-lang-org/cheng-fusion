# Regalloc 生产证据生成器

`tools/regalloc_production_evidence.sh` 只从现场文件、Git tree、真实编译和逐字节比较生成证据。它不接收 `status=proved`、case 结果、计数或产物 hash 自报；`certification.status=proved` 仅在脚本完成全部重算后写入。

## 当前统一发布身份

最终发布只接受 `tools/backend2_current_source_release_producer.sh` 的唯一 current preflight。它把同一份 source snapshot/closure、official driver、七阶段执行根、primary/backend2 六个独立 target receipt，以及 GEN2/GEN3 不同 inode 的原始字节固定点写入一个 release binding。七阶段固定为：

```text
typed_expr -> csg -> lowering -> primary -> primary_regalloc
                              \-> backend2 -> backend2_regalloc
```

preflight 必须额外接收真实七阶段生产器输出目录和 parser harness：

```sh
tools/backend2_current_source_release_producer.sh preflight \
  --official-receipt /absolute/official-publisher-receipt.kv \
  --snapshot-manifest /absolute/cheng-source-snapshot.manifest.txt \
  --source-closure /absolute/source-closure.before \
  --seven-stage-output /absolute/current-seven-stage-output \
  --seven-stage-parser-harness-manifest /absolute/parser-harness.manifest \
  --performance-source /absolute/performance-source.cheng \
  --baseline-manifest /absolute/immutable-baseline.manifest \
  --linux-aarch64-current-descriptor /absolute/linux-aarch64-current.kv \
  --linux-aarch64-dry-descriptor /absolute/linux-aarch64-dry.kv \
  --linux-x86-64-current-descriptor /absolute/linux-x86-64-current.kv \
  --linux-x86-64-dry-descriptor /absolute/linux-x86-64-dry.kv \
  --out-dir /absolute/new-release-evidence
```

四份 Linux descriptor 均使用唯一 current schema，并分别以
`workload_kind=current_driver` 或 `workload_kind=dry_compile` 绑定各自的精确
argv/env；两种 workload 不得复用 descriptor。

validator 会现场复跑七阶段 admission，并要求七列共用同一 `executionRaw32`；每个发布 leg 的 `source_bundle_raw32` 必须等于 snapshot SHA256，`execution_raw32` 必须等于七阶段执行根绑定。primary/backend2 receipt 使用独立 inode。任一列、source identity、backend receipt、GEN2/GEN3 inode 或原始字节漂移都会 hard-fail，不生成 binding。

official build producer 不再要求覆盖或移走失败的 canonical compiler evidence。每次生产尝试只写调用方新建输出目录内的 `compiler-candidate-evidence`；candidate、build receipt、private source manifest 和 snapshot root 必须同属该目录，最终 official receipt 精确绑定其路径与 SHA256。旧失败树和新失败输出都原样保留，preflight 从真实 process-tree guard、stderr 和三个 tracked output 复算失败身份；非零 seed build rc、空 seed/map/report 只能形成 `HARD_RED`，不能补空文件或生成候选 receipt。

## 不变量

- 所有输入路径必须是绝对、规范、无 symlink 的 regular file/directory；调用方同时提供关键二进制的预期 SHA256，脚本现场复算。
- current 固定绑定当前仓库、`artifacts/backend_driver/cheng`、当前 `HEAD^{tree}`、`primary_object_plan.cheng` 的完整 import closure 和 canonical allocator。
- baseline 必须使用不同的完整 workspace 和不同 driver；其 closure 每个字节必须等于指定 Git tree 中同路径 blob。只有“tree 存在”但 workspace 字节不匹配时直接失败。
- 每个重任务前后重验 identity、driver、allocator、closure 和相关 fixture/corpus；发生漂移不产锁。
- 每个输出目录必须预先不存在。source manifest、cert、raw artifact 先写临时文件并 `fsync+rename`；唯一 current driver manifest 或 lock 最后发布，作为唯一完成标记。失败目录保留诊断，但没有 authoritative manifest/lock。
- 四个 external lock 固定 86400 秒有效，重任务串行运行，默认且最高 1 GiB sampled process-tree RSS。

## 自测

```sh
tools/regalloc_production_evidence.sh --self-test
```

成功输出固定为：

```text
regalloc_production_evidence_self_test=PASS
```

自测覆盖 source drift、jobs wrapper/object 篡改、209-case exec-diff runtime 与 raw compile 绑定篡改、固定 16×3 target/emit inventory 篡改、gen2/gen3 lineage/driver/fixed object 篡改、相对路径拒绝。生成器与生产门禁共用 `tools/regalloc_external_lock_validator.py`，发布锁前和消费锁时执行完全相同的只读复算。

## 实际生成顺序

先停止所有 `src/**/*.cheng` 和 official driver 写入，再串行执行。下面的每个 `<...>` 都必须替换成绝对路径或现场 SHA256。

```sh
mkdir -p /private/tmp/regalloc-release
```

1. 用既有自举链真实生成两个独立文件 `gen2`、`gen3`，确认 `gen3` 是最终 official driver 后，将同一字节安装到 `artifacts/backend_driver/cheng`。生成器不负责绕过或替代自举链。
2. 生成 current identity：

```sh
tools/regalloc_production_evidence.sh identity-current \
  --workspace /Users/lbcheng/cheng-lang \
  --driver /Users/lbcheng/cheng-lang/artifacts/backend_driver/cheng \
  --driver-sha256 <official-driver-sha256> \
  --out-dir /private/tmp/regalloc-release/current-identity
```

命令输出 `official_manifest_path` 和 `official_manifest_sha256`。

3. 生成 tree-exact baseline identity：

```sh
tools/regalloc_production_evidence.sh identity-baseline \
  --workspace /absolute/immutable-baseline-workspace \
  --driver /absolute/baseline-driver \
  --driver-sha256 <baseline-driver-sha256> \
  --git-repo /Users/lbcheng/cheng-lang \
  --source-git-tree <baseline-tree> \
  --official-manifest /private/tmp/regalloc-release/current-identity/current.driver-manifest.txt \
  --official-manifest-sha256 <official-manifest-sha256> \
  --out-dir /private/tmp/regalloc-release/baseline-identity
```

4. 先跑耗时最长的 full exec-diff。命令固定枚举 `src/tests/exec_diff_corpus` 的全部 `.cheng`，拒绝少于 209 case，任一 compile/link/run 失败或 rc/stdout 字节不同都不产锁。`regalloc_exec_diff_cases` 为每 case 冻结 actual/reference object、compile report、guard、stdout/stderr，门禁从这些原件复算 official production receipt 和 corpus inventory：

```sh
tools/regalloc_production_evidence.sh exec-diff \
  --identity-manifest /private/tmp/regalloc-release/current-identity/current.driver-manifest.txt \
  --identity-manifest-sha256 <official-manifest-sha256> \
  --stage3 /Users/lbcheng/cheng-lang/artifacts/bootstrap/cheng.stage3 \
  --stage3-sha256 <stage3-sha256> \
  --out-dir /private/tmp/regalloc-release/exec-diff
```

5. 跑固定 target×emit 矩阵：

```sh
tools/regalloc_production_evidence.sh target-emit \
  --identity-manifest /private/tmp/regalloc-release/current-identity/current.driver-manifest.txt \
  --identity-manifest-sha256 <official-manifest-sha256> \
  --out-dir /private/tmp/regalloc-release/target-emit
```

`obj/exe` 固定使用 `src/tests/target_matrix_linker_probe.cheng`，`shared` 固定使用无 `main` 的 `src/tests/shared_emit_fixture.cheng`；调用方不能替换或缩小 fixture。

矩阵固定 emits 为 `obj,shared,exe`，targets 为：

```text
arm64-apple-darwin
aarch64-apple-ios
arm64-apple-ios
wasm32-unknown-unknown
aarch64-pc-windows-msvc
arm64-pc-windows-msvc
x86_64-pc-windows-msvc
aarch64-unknown-linux-gnu
arm64-unknown-linux-gnu
aarch64-linux-android
aarch64-linux-ohos
aarch64-unknown-linux-ohos
x86_64-unknown-linux-gnu
riscv64-unknown-linux-gnu
riscv64-unknown-none-elf
x86_64-apple-darwin
```

Windows 三项和 `x86_64-apple-darwin` 的三个 emit 必须明确 unsupported hard-fail；其余组合必须成功并通过 Mach-O/ELF/Wasm machine 与 filetype 检查。通用失败、空产物、target/emit 报告漂移、格式回退和 unknown shape 都失败。

6. 跑 jobs=1 与 jobs=N 的完整 production closure 编译。脚本同时从 dry report 和完整 compile report重算 effective jobs、requested jobs、worker count，并逐字节比较 object：

```sh
tools/regalloc_production_evidence.sh jobs \
  --identity-manifest /private/tmp/regalloc-release/current-identity/current.driver-manifest.txt \
  --identity-manifest-sha256 <official-manifest-sha256> \
  --jobs 4 \
  --out-dir /private/tmp/regalloc-release/jobs
```

7. 最后生成 gen3 fixed-point lock。`gen2`、`gen3` 必须是不同 inode 的独立文件，调用方 SHA256、两文件字节和 official driver hash 必须同时相等；脚本再用两者真实编译固定 `regalloc_gate_runtime.cheng`，并把 lineage、两份 compile receipt、guard、stdout/stderr 纳入 raw manifest 后复算 object 字节：

```sh
tools/regalloc_production_evidence.sh gen3 \
  --identity-manifest /private/tmp/regalloc-release/current-identity/current.driver-manifest.txt \
  --identity-manifest-sha256 <official-manifest-sha256> \
  --gen2-driver /absolute/gen2-driver \
  --gen2-driver-sha256 <gen2-sha256> \
  --gen3-driver /absolute/gen3-driver \
  --gen3-driver-sha256 <gen3-sha256> \
  --out-dir /private/tmp/regalloc-release/gen3
```

8. 立刻把上述命令输出的 path/SHA 传给 production gate：

```sh
REGALLOC_GATE_OFFICIAL_MANIFEST=/private/tmp/regalloc-release/current-identity/current.driver-manifest.txt \
REGALLOC_GATE_OFFICIAL_MANIFEST_SHA256=<official-manifest-sha256> \
REGALLOC_GATE_BASELINE_MANIFEST=/private/tmp/regalloc-release/baseline-identity/baseline.driver-manifest.txt \
REGALLOC_GATE_BASELINE_MANIFEST_SHA256=<baseline-manifest-sha256> \
REGALLOC_GATE_JOBS_LOCK=/private/tmp/regalloc-release/jobs/jobs_determinism.lock.txt \
REGALLOC_GATE_JOBS_LOCK_SHA256=<jobs-lock-sha256> \
REGALLOC_GATE_EXEC_DIFF_LOCK=/private/tmp/regalloc-release/exec-diff/exec_diff.lock.txt \
REGALLOC_GATE_EXEC_DIFF_LOCK_SHA256=<exec-diff-lock-sha256> \
REGALLOC_GATE_TARGET_EMIT_LOCK=/private/tmp/regalloc-release/target-emit/target_emit_hard_fail.lock.txt \
REGALLOC_GATE_TARGET_EMIT_LOCK_SHA256=<target-emit-lock-sha256> \
REGALLOC_GATE_GEN3_LOCK=/private/tmp/regalloc-release/gen3/gen3_fixed_point.lock.txt \
REGALLOC_GATE_GEN3_LOCK_SHA256=<gen3-lock-sha256> \
tools/regalloc_production_gate.sh
```

不要并行运行 exec-diff、target-emit、jobs、gen3 或 production gate；任一命令失败后先修真实根因，再用新的空输出目录重跑。
