# T03 回执：post_wall_verify.sh 缺省驱动去 mtime

- TASK: T03（docs/cheng-rsi-fusion-plan.md §九 9.2 行 T03；附录 A.16 :715 / A.18 :745 勘误）
- 只准写文件: `docs/campaigns/2026-09-07-pure-cheng-rsi/tools/a4/post_wall_verify.sh`（+ 本回执）
- UTC: 20260915T091025Z
- 红线遵守: 不 commit / 不 checkout-restore / 不 heredoc / 不 nohup / 不占编译槽 / 不联网 / 未改清单外文件

## 改前自检

`git status --porcelain -- <只准写文件>` 显示 `??`（未跟踪）⇒ 属本任务交付件，可写；已记改前 sha256 作基线。同目录 receipts/ 亦全为 `??`，无 M/A/D/MM/UU。

## sha256（改前 / 改后）

改前（104 行）:
```
ffdaf5e2b4638d2794794eea1b44ef6d3bd60aaaad133cc4d82a7018cb36f36a  docs/campaigns/2026-09-07-pure-cheng-rsi/tools/a4/post_wall_verify.sh
```
改后（140 行）:
```
a23343578bc35faa1ec9d4e699fb99960a6e69871723ae824ef228ed12d9c1d5  docs/campaigns/2026-09-07-pure-cheng-rsi/tools/a4/post_wall_verify.sh
```

## 命令级判据（四条原始输出）

### ① bash -n → rc=0
```
$ bash -n docs/campaigns/2026-09-07-pure-cheng-rsi/tools/a4/post_wall_verify.sh; echo "[rc=$?]"
[rc=0]
```

### ② bash <file>（无参）→ rc=2，stderr 含 usage
stdout 重定向到 /dev/null，以下全为 stderr（故证明 usage 走 stderr）:
```
$ bash docs/campaigns/2026-09-07-pure-cheng-rsi/tools/a4/post_wall_verify.sh 1>/dev/null; echo "[rc=$?]"
[rc=2]
post_wall_verify: 驱动为必填位置参数
usage: bash post_wall_verify.sh <driver-path> [--driver-sha16 <16hex>]
  driver-path       必填: 新驱动可执行体路径 (按 mtime 选缺省驱动已废除)
  --driver-sha16    可选: 断言驱动 sha256 前 16 位 (16 位十六进制), 不符 exit 2
```
（注: 捕获时 stdout 段为 `[rc=2]`，stderr 段为上列 4 行；合并显示时 rc 行在前，此处按 stdout/stderr 分段如实标注。）

### ③ bash <file> /nonexistent → rc=2
```
$ bash docs/campaigns/2026-09-07-pure-cheng-rsi/tools/a4/post_wall_verify.sh /nonexistent 2>&1; echo "[rc=$?]"
post_wall_verify: 驱动不可执行: /nonexistent
[rc=2]
```

### ④ rg -n 'ls -t' → 0 行
```
$ rg -n 'ls -t' docs/campaigns/2026-09-07-pure-cheng-rsi/tools/a4/post_wall_verify.sh; echo "[rc=$?]"
[rc=1]
```
（rg 无匹配时 rc=1 且无输出 ⇒ 0 行；默认缺省驱动分支已整段删除。）

## 附加自测：--driver-sha16 守卫（负腿 + 格式，均不进入槽位）

```
$ real=$(shasum -a 256 /bin/ls | awk '{print $1}'); wrong=$(printf '0%.0s' $(seq 1 16)); echo "real16=${real:0:16} tested=$wrong"; bash docs/campaigns/2026-09-07-pure-cheng-rsi/tools/a4/post_wall_verify.sh /bin/ls --driver-sha16 "$wrong" 2>&1; echo "[rc=$?]"
real16=a97c50d34f912a5a tested=0000000000000000
post_wall_verify: 驱动 sha256 前16位 a97c50d34f912a5a != --driver-sha16 0000000000000000
[rc=2]

$ bash docs/campaigns/2026-09-07-pure-cheng-rsi/tools/a4/post_wall_verify.sh /bin/ls --driver-sha16 zzzzzzzzzzzzzzzz 2>&1; echo "[rc=$?]"
post_wall_verify: --driver-sha16 非法 (需恰好 16 位十六进制): zzzzzzzzzzzzzzzz
[rc=2]

$ bash docs/campaigns/2026-09-07-pure-cheng-rsi/tools/a4/post_wall_verify.sh /bin/ls --driver-sha16 abc 2>&1; echo "[rc=$?]"
post_wall_verify: --driver-sha16 非法 (需恰好 16 位十六进制): abc
[rc=2]

$ bash docs/campaigns/2026-09-07-pure-cheng-rsi/tools/a4/post_wall_verify.sh /bin/ls --driver-sha16 2>&1; echo "[rc=$?]"
post_wall_verify: --driver-sha16 缺参数
usage: bash post_wall_verify.sh <driver-path> [--driver-sha16 <16hex>]
  driver-path       必填: 新驱动可执行体路径 (按 mtime 选缺省驱动已废除)
  --driver-sha16    可选: 断言驱动 sha256 前 16 位 (16 位十六进制), 不符 exit 2
[rc=2]

$ bash docs/campaigns/2026-09-07-pure-cheng-rsi/tools/a4/post_wall_verify.sh --bogus 2>&1; echo "[rc=$?]"
post_wall_verify: 未知选项: --bogus
usage: bash post_wall_verify.sh <driver-path> [--driver-sha16 <16hex>]
  driver-path       必填: 新驱动可执行体路径 (按 mtime 选缺省驱动已废除)
  --driver-sha16    可选: 断言驱动 sha256 前 16 位 (16 位十六进制), 不符 exit 2
[rc=2]
```

## 改动摘要

1. 删除原 `:23` 的 `ls -t` 缺省驱动整段（含原 2026-09-13 的 grep 过滤注释）；驱动改为**必填位置参数**，缺参 `usage` + `exit 2`（usage 全部输出到 stderr）。
2. 新增可选 `--driver-sha16 <16hex>`：先校验恰 16 位十六进制（非十六进制/长度不等一律 exit 2），再与 `shasum -a 256` 前 16 位做前缀比对，不符 exit 2；比对前把用户输入大写归一为小写（不断言、不看 mtime）。
3. 头注释 `:11`–`:13` 同步改写：用法改为 `<driver-path> [--driver-sha16 <16hex>]`，注明必填、废除 mtime 缺省、附 AGENTS 规范 10 / 附录 A.8 依据。
4. 其余逻辑（同源核验、墙探针、早退、归档、三腿/两档、退出码）逐字未动。

## UNVERIFIED

- `--driver-sha16` **正腿**（值与实测相符 ⇒ 放行继续）未跑：放行后脚本会按设计进入墙探针/三腿，会取锁占槽，违反本任务「不占槽」；仅负腿与格式腿已实测。静态已复核前缀比对为 `case "$DRV_SHA" in "$cmp16"*)`。
- 未改 docs/cheng-rsi-fusion-plan.md，故其附录 A.16 :715 仍写「脚本 :23 现仍为 ls -t」——该文档面不在本任务只准写清单内，留待文档同步任务（T02）。
