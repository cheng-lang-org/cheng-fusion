# A7 快照确定性方案（S2，只读验证）

基线：`git -C /Users/lbcheng/cheng-lang rev-parse HEAD` = `75ffa3348dc004eee767244279ae509c3f7491f4`
　　`git -C /Users/lbcheng/cheng-lang status --porcelain | wc -l` = `205`
本席未编译、未取锁、未改主树、未建分支；只在 `mktemp -d` 内 `git archive` + `patch --dry-run`。唯一落盘 = 本回执。

## 1. 命令逐字（全部只读）

```
git -C /Users/lbcheng/cheng-lang rev-parse HEAD
git -C /Users/lbcheng/cheng-lang status --porcelain | wc -l
TMP=$(mktemp -d /tmp/a7snap.XXXXXX)
git -C /Users/lbcheng/cheng-lang archive HEAD | tar -x -C "$TMP"
cd "$TMP" && patch -p1 -N --dry-run < /Users/lbcheng/cheng-lang/docs/campaigns/2026-08-31-kernel-userpath/patches/selfbake_theory_emit.patch
cd "$TMP" && patch -p1 -N --dry-run < /Users/lbcheng/cheng-lang/docs/campaigns/2026-08-31-kernel-userpath/patches/theory_emit_rss_metric_label.patch
cd "$TMP" && patch -p1 -N < .../selfbake_theory_emit.patch && patch -p1 -N < .../theory_emit_rss_metric_label.patch
shasum -a 256 "$TMP/src/core/tooling/backend_driver_dispatch_min.cheng" | cut -c1-16
```

## 2. 补丁与目标指纹（sha256 前 16）

| 件 | sha256-16 | 位置 |
|---|---|---|
| selfbake_theory_emit.patch | 3f152300698faa51 | a7_bake_carrier.sh:18（PATCH） |
| theory_emit_rss_metric_label.patch | bf45ff07db50cae5 | a7_bake_carrier.sh:19（FIXPATCH） |
| HEAD target | 880d4632228e70b4（blob d9ce7172b5bbf77996b5b898b7f378f36a6b60e7） | src/core/tooling/backend_driver_dispatch_min.cheng |
| 现场 worktree target | ac8cb9509cdbca0f | 同路径（脏，a7_bake_carrier.sh:66 rsync 的就是它） |
| 快照+P1+P2 后 target | 2c59e7e08b37d8d3（blob a75ad0ae0c555707d1a74543f1b23ae615e54715） | 确定性产物锚 |

## 3. 逐 hunk 结果

P1 在 HEAD 快照（未打 P2）上：6/6 hunk rc=0，无 `.rej`（patch 2.0-12u11-Apple）。
逐 hunk 独立重打（split 成单 hunk，各打回 pristine HEAD 文件）：全部 rc=0。

| hunk | 头（P1 文件行号） | HEAD 结果 |
|---|---|---|
| 1 | @@ -344,6 +344,9 @@（:5） | OK rc=0 |
| 2 | @@ -2808,6 +2811,289 @@（:15） | OK rc=0 |
| 3 | @@ -3368,9 +3654,9 @@（:305） | OK rc=0 |
| 4 | @@ -3380,6 +3666,10 @@（:317） | OK rc=0 |
| 5 | @@ -6870,6 +7160,9 @@（:328） | OK rc=0 |
| 6 | @@ -7002,6 +7295,34 @@（:338） | OK rc=0 |
| P2 1 | @@ -3055,7 +3055,9 @@（:3） | 裸打 HEAD：1/1 FAILED rc=1；先打 P1 后：OK rc=0 |

## 4. 结论

- **HEAD 快照 + 两补丁可干净应用**：先 P1 后 P2，rc 均 0，无 `.rej`；两补丁合打后 target `2c59e7e08b37d8d3`。
- **P2 依赖 P1，不能裸打**。a7_bake_carrier.sh:57 的 dry-run 预检只测 P1，且测的是**现场 worktree 文件**（`:56 cp "$REPO/$TARGET_REL"`），无法覆盖 P2，也测不到快照。
- 现场 rsync 坏掉的根因就是脏树：`git status --porcelain` 205 项，其中 9 个 `src/core/*` 脏；报错前缀 "compiler csg:" 对应 `compiler_csg.cheng`（HEAD 4dd6fd12a571a4d7 / WT cb3628f90929face），`primary_object_plan.cheng`（HEAD 707f085cc0d5e639 / WT 784908f15abf92ce）。错误点 `cleanup_cfg.cheng:836` 本身**不脏**（HEAD==WT==1196ca22ee4c9eeb），故是别的在飞文件破坏了整树一致性 ⇒ 只冻结 src 全树才有效。
- P1 的 `index 913544112..1270a2ffd` 与实打不符：HEAD blob 是 `d9ce7172`，打完 P1 是 `d645770068cae1ae2ac5239b70ae0447dd301d1d`（≠1270a2ffd）。**index 行不可当锚，只能用内容哈希验证**。

## 5. 替代现场 rsync 的一命令方案 + 脚本改动点

替换 a7_bake_carrier.sh:66 的 `rsync -a --delete "$REPO/src/" "$ROOT/src/"`：

```
SNAP=75ffa3348dc004eee767244279ae509c3f7491f4     # 钉死 commit，不用会漂的 HEAD
rm -rf "$ROOT/src"
git -C "$REPO" archive "$SNAP" src | tar -x -C "$ROOT"
```

必需改动点（行号针对现状）：
1. 新增（`:20` 附近）：`SNAP="${A7_SNAP:-$(git -C "$REPO" rev-parse HEAD)}"`；在 `:42` 的 `patch_sha=` 行一并打印 `snap=$SNAP`。
2. 改 `:66`：`rm -rf "$ROOT/src" && git -C "$REPO" archive "$SNAP" src | tar -x -C "$ROOT" || { echo FATAL archive src; exit 2; }`。
3. 改 dry-run 预检 `:54-58`：`git -C "$REPO" show "$SNAP:$TARGET_REL" > "$tmp/$TARGET_REL"`，并**顺序**dry-run 两补丁：`patch -p1 --dry-run -N < "$PATCH" && patch -p1 --dry-run -N < "$FIXPATCH"`。
4. 改 `:87-90` 注释：快照来自 `git archive "$SNAP" src`，非现场 rsync。`:67-70`（artifacts rsync、cp cheng-package.toml、顺序打补丁）保持不变。

## 6. 未验证

- **能否真编过：未验证**。本席未编译；HEAD 是否缺 9 个脏 `src/core/*` 所依赖的其它未提交修复，无证据。
- **artifacts 仍非确定**：`artifacts/` 被 `.gitignore:15` 整目录忽略，`git archive` 只能带 10 个 tracked 件，盘上实有 16303 个；`:67-68` 继续现场 rsync ⇒ 残留非确定性。对 A7 载具编译结果是否有影响，未验证。
- **21 个非忽略未跟踪 src 文件**（`src/a9_wall_probe/*`、`src/probe_cache_semantics/*`、`src/tests/_chk_repro_*.cheng`、`src/tools/rsi_semantic_regression.cheng` 等）不在 `git archive` 内；是否被 driver 传递依赖，未验证（未查编译闭包）。
- **P1 index 行出处：未验证**（`git cat-file -t 913544112` = blob；`--find-object` 命中 f5d9db72a，但 f5d9 的 target blob 仍是 d9ce7172，未深究）。
- `git archive "$SNAP" src` 是否含 gitlink/子模块，未验证。
