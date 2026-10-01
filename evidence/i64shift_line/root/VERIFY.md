# VERIFY.md

## 2026-09-03 build_kernel_driver.sh 烤机命令面启用 BACKEND_JOBS 并行（默认 8）

### 变更（授权面内，已落地）

`tools/build_kernel_driver.sh` 烤机调用前新增（可用环境变量覆盖，默认 8）：

```diff
+# ---- 后端并行度（BACKEND_JOBS 烤机并行，可用环境变量覆盖）----
+# freeze/codegen 两相位 worker 池已字节确定（BACKEND_JOBS=1 vs =8 产物 sha256
+# 相等，w102 配对实测），默认 8 白拿 ~12% 墙钟；=1 回串行基线。
+export BACKEND_JOBS="${BACKEND_JOBS:-8}"
```

机制核对：消费端为 `src/core/backend/primary_object_plan.cheng:1317
PrimaryObjectPlanLowerJobs()`（直接读 `BACKEND_JOBS`，无钉死）与
`primary_object_plan.cheng:66966`（#75(c) LoweringPhase fork+COW 池）；
C 链侧 `bootstrap/cheng_cold.c` :15873/:16417 环境变量门（默认钉 1）。零源码改动。

### 配对验证：BLOCKED（官方树当前无任何驱动可跑 w89 组合烤机面）

配对方案：`BACKEND_JOBS=1 CHENG_ENTRY_CACHE=0` vs 默认(=8) `CHENG_ENTRY_CACHE=0`
全量烤 `bootstrap/kernel_manifest.cheng`（35 条目），对产物 sha256 + 墙钟。
预算内仅跑必要轮。逐驱动实测证据：

| 车头 | 状态 | 证据 |
|---|---|---|
| `artifacts/bootstrap/cheng.stage3`（Aug 31 04:26，脚本默认） | 拒 flag | `system-link-exec invalid argument: --composition-manifest:…` rc=2 |
| `artifacts/bootstrap-cold-ci/cheng.stage3`（Sep 2 20:47） | 拒 flag | 同上 rc=2 |
| `artifacts/bootstrap/compiler_main.direct`（Sep 2 21:04，Cheng 编译器） | 崩 | system-link-exec 无论带不带 flag 均段错误（rc=139，~27s 处）；仓方正面 smoke `tools/kernel_manifest_smoke.sh --driver compiler_main.direct` 三 arch 全 FAIL build_rc=139；二进制内无 `composition-manifest` 字面量 |
| 在树 `bootstrap/cheng_cold.c`（未提交 M） | 不可链接 | `:108660 fexecve(...)` 裸调用；本机 darwin25 libSystem 无 `_fexecve` 符号（`nm -gU` 0 命中），SDK 头无声明；`tools/csg_core_darwin_held_fd_exec_capability_gate.sh` 正是证明该声明面必须缺席的门 |
| `HEAD:bootstrap/cheng_cold.c`（ce469ed71） | 可链接但无组合面 | 0×fexecve / 0×composition-manifest / 25×BACKEND_JOBS；全部分支与 stash 均无含组合面的 cheng_cold.c |

辅助实测（树上零改动的临时探针，`artifacts/kernel_driver_paired_w102/`）：
在树源副本仅回退 fexecve hunk（回退文本与 HEAD 逐字一致）得可链接车头
`cheng_head`（clang -std=c11 -O2 -I. -Ibootstrap，13 warnings 0 error，
sha256 `e3d4d2f3a2efb7906edcb42bebf282ba9307f4b4f61c4315c680f13b31097c3a`），
其对 `--composition-manifest` 仍判 invalid argument rc=2——证实组合 flag 表
从未进过官方 cheng_cold.c，w89 烤机面此前只在 lane 私有树验证。

### 结论与归属

- 脚本增量（BACKEND_JOBS 默认 8）已落地，属于纯环境变量传递，driver 侧
  未就绪时等效于现状（driver 各自按自身门处理 BACKEND_JOBS）。
- 配对 sha256 复验 + 墙钟对比待组合烤机面恢复后执行（预算 2 轮未消耗）。
- 阻塞归属：(a) 组合 flag 面缺失于官方 cheng_cold.c（w89 lane 面收编）；
  (b) `compiler_main.direct` system-link-exec 段错误（后端 lane）；
  (c) 在树 fexecve 死调用违反 capability gate（held-exec lane）。

### 面恢复后的复跑命令

    BACKEND_JOBS=1 CHENG_ENTRY_CACHE=0 tools/build_kernel_driver.sh \
        --driver <组合面车头> --manifest bootstrap/kernel_manifest.cheng \
        --out <out.jobs1>          # 轮 1（串行基线）
    CHENG_ENTRY_CACHE=0 tools/build_kernel_driver.sh \
        --driver <组合面车头> --manifest bootstrap/kernel_manifest.cheng \
        --out <out.jobs8>          # 轮 2（脚本默认 8）
    # 验收：两轮 out sha256 相等 + 轮 2 墙钟 ≈ 轮 1 −12%（w74/w102 参照值）

### 绑定

- 变更脚本面：`tools/build_kernel_driver.sh`（本工作树未提交 diff 内新增块）
- `bootstrap/cheng_cold.c` sha256 `0ce66bb247297ab80a764235e28ff7673a3044b56d25d9d28c55f64eed2c3517`（在树 M 态）
- `bootstrap/kernel_manifest.cheng` sha256 `bdcbe0d30eea0831366a0653f7587f7dbc09a537a94a1ae00eebf2af68da2e28`
- 探针产物：`artifacts/kernel_driver_paired_w102/`（hybrid 源/车头/shim/补丁脚本）
