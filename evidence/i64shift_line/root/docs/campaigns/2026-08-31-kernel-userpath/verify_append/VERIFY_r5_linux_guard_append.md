# VERIFY_r5_linux_guard_append —— 战役 R R5：Linux cgroup v2 精确 1GiB 守卫基建 + 独立 validator（R5-LINUX-GUARD）

date_utc=2026-09-06 · 执行=R5-LINUX-GUARD 子代理 · 主树=/Users/lbcheng/cheng-lang（主树源码零接触，新增 tools/ 两脚本 + 本回执） · VM=colima profile `chengx64`（用后已 stop）

## 结论先行

**R5 双口径之 Linux 口径基建落地并真实烤机验证完毕：`tools/linux_cgroup_guard.sh` + `tools/linux_cgroup_validate.sh` 在 colima VM（aarch64，内核 6.8.0-117-generic，cgroup2fs）内完成 gcc 现烤 bootstrap/cheng_cold.c（5,336,699B 源 → 4,197,056B .o）于 memory.max=1073741824 精确 1GiB 子 cgroup，rc=0、memory.peak=557,043,712B、validator 15/15 PASS；超限负例（256MiB 帽）由内核 OOM-kill 全组（oom_kill=3，memory.oom.group=1），peak 精确顶格 268435456、产物未落、guard_exit=4、validator 17/17 PASS；timeout 负例（3s 帽）guard_exit=3 + abort_reason=timeout 亦 PASS。守卫证据不依赖被测进程自报：raw/ 存 cgroup 文件原始字节 + sha256，validator 独立重算。**

## 一、交付物

| 文件 | 作用 |
|---|---|
| `tools/linux_cgroup_guard.sh` | cgroup v2 守卫：建子组（memory.max 精确字节 + memory.swap.max=0 + memory.oom.group=1 + 可选 pids.max）、fifo 门闩消除迁入竞态（root 写 cgroup.procs 后才放行，整树先于执行收口）、timeout watchdog 到点写 cgroup.kill=1（事件驱动非轮询）、终态快照 memory.peak/memory.events/memory.max/swap/oom.group/cgroup.stat 原始字节入 raw/ 并记 sha256、KV 回执原子落盘、cgroup 必删（20 次重试，失败如实记 cgroup_removed=0） |
| `tools/linux_cgroup_validate.sh` | 独立复核：不信任回执自报，全部判据对 raw/ 重算（sha256 对账 + 数值重读）+ 回执交叉核对 + 调用方显式断言（--expect-status/abort-reason/oom/rc/limit/command-sha256）。V01-V18 共 18 项。verdict PASS/FAIL，rc 0/1/2 |

**回执 schema `cheng.linux_cgroup_guard.v1` 与战役 R release receipt 字段对齐**：tool hash = `guard_script_sha256`；compiler hash = `command_sha256`/`command_argv_sha256`（argv 精确身份）；source hash = `--meta:KEY=VALUE` 透传槽（如 `meta_source_tree_sha256`，本轮烤机源另录 `source=c39fe515…`）；RSS 读数 = `memory_peak_bytes`（内核 memory.peak，非采样）；cgroup 路径 = `cgroup_path` + `memory_max_readback`。GEN2/GEN3 固定点回执直接复用该 schema + meta 槽。

退出码合同（guard）：0=成功；1=rc 不符；2=环境自检失败；3=abort（timeout/迁入失败）；4=OOM kill。validator rc：0=PASS；1=FAIL；2=用法错。

## 二、VM 环境实锚（2026-09-06 实测）

| 项 | 实测值 |
|---|---|
| profile | colima `chengx64`（**实际 ARCH=aarch64，名字有误导**；colima list 确认；旧记忆「colima x86_64」已过时，VM 系重建） |
| 内核 | 6.8.0-117-generic，`stat -fc %T /sys/fs/cgroup` = cgroup2fs |
| 配额 | 2 vCPU / 2GiB RAM / 100GiB disk |
| 控制器 | cgroup.controllers 含 memory；root 子组 sudo mkdir 直建可行；memory.peak 可用（6.7+ 特性） |
| sudo | 免密可用（`sudo -n true` 过）；本次全部 cgroup 写入经 `sudo sh -c` 同会话完成，未触碰 ns 清单口径 |
| 工具链 | VM 内无 cc，`apt install gcc`（gcc 13.3.0-6ubuntu2.4，aarch64）——cheng_w126 无 linux 版，按任务书 fallback 以 VM 内 cc 现烤 cheng_cold.c |
| 数据通道 | **记忆文件中的 9p 已升级为 virtiofs**（`lima-* on /Users/lbcheng type virtiofs rw`）：属主正常显示（uid=501/gid=1000，旧「gid=20 跨边界校验拒」坑不复现）；宿主脚本 VM 内以 `bash <path>` 解释执行可用，**直接 exec virtiofs 路径会挂死**（无输出无报错，两轮复现），沿 lane 旧法规避 |

## 三、两轮真实烤机台账

### 正常轮（精确 1GiB）

| 项 | 值 |
|---|---|
| argv | `gcc -O1 -c bootstrap/cheng_cold.c -o /tmp/r5_guard_run1/cheng_cold.o` |
| source sha256 | c39fe515db3c0a99ad250a0f72dc88d42d1fed965c9d71575dadc5320fd17f3e |
| compiler | gcc 13.3.0，command_sha256=a20520ee21543f243d40636a9181a142c45ecd989de31ab86b99a8ea5ada870d |
| guard_script_sha256 | d1b078e119553b6580dbe715f5a2e84e46b2dc798ec809dba283b79d72f1b7ee |
| cgroup | /sys/fs/cgroup/cheng_guard_3606_82ad64b0，memory.max 回读=1073741824（精确），swap=0，oom.group=1，cgroup_removed=1 |
| 结果 | **rc=0，memory.peak=557,043,712B（531.3MiB < 1GiB），oom_kill=0，wall=22s**，产物 cheng_cold.o 4,197,056B（sha256=e07bbabc2dc23a82275da3f60087b925779f99a7715722db6e73b794a70b04fa） |
| validator | **15/15 PASS，rc=0**（raw 六文件 sha 对账 + peak/max/oom_kill 数值重读全一致） |

### 超限轮（256MiB 帽，负例判红）

| 项 | 值 |
|---|---|
| argv | 同源同命令，仅 `--rss-limit:268435456` |
| 结果 | **peak 精确顶格 268435456，memory.events oom=1 / oom_kill=3（oom.group=1 内核全组杀），rc=137，status=ABORT abort_reason=oom_killed，guard_exit=4，产物未落** |
| validator | **17/17 PASS，rc=0**（--expect-status:ABORT --expect-abort-reason:oom_killed --expect-oom:1 --expect-limit:268435456 --expect-rc:137 全中；V11 证 peak>=limit 确实顶帽） |

### 补充负例（timeout 归因，3s 帽杀 sleep 60）

guard_exit=3、abort_reason=timeout、rc=137、oom_killed=0，validator 15/15 PASS。watchdog 到点写 cgroup.kill=1，标记文件归因 timeout（与外部信号死区分）。另 validator 判红能力用旧缺陷报告实证：V12 cgroup_cleanup=FAIL → verdict=FAIL rc=1（修复前的 cgroup_removed=0 误报被正确抓红）。

## 四、开发中修掉的三个 bug（自检记录）

1. **参数解析缺 shift**：while-case 循环漏 shift 死循环吃满 CPU（bash -x trace 定位）——每个匹配分支后统一 shift。
2. **cgroup_removed 误报**：清理 while 循环内 rmdir 成功后，循环后再次 rmdir 报 ENOENT 被判未删——改为循环内成功即置位 break。
3. **timeout 语义丢失**：watchdog 的 cgroup.kill 与外部信号死无法区分，误判 completed_rc_mismatch——watchdog 到点先 touch 标记文件，guard 读标记归因。

## 五、复跑命令（VM 启动后依次执行）

```bash
colima start chengx64
# 一次性：sudo apt-get install -y gcc（VM 重建后需重装）
timeout 480 colima ssh --profile chengx64 -- bash -c '
mkdir -p /tmp/r5_guard_run1
bash /Users/lbcheng/cheng-lang/tools/linux_cgroup_guard.sh \
  --rss-limit:1073741824 --timeout:600 \
  --report-out:/tmp/r5_guard_run1/report.kv \
  --meta:workload=gcc_bake_cheng_cold_c --meta:round=normal_1gib \
  -- gcc -O1 -c /Users/lbcheng/cheng-lang/bootstrap/cheng_cold.c -o /tmp/r5_guard_run1/cheng_cold.o && \
bash /Users/lbcheng/cheng-lang/tools/linux_cgroup_validate.sh \
  --report:/tmp/r5_guard_run1/report.kv --expect-status:completed --expect-oom:0 --expect-limit:1073741824'
# 超限负例：--rss-limit 改 268435456，validator 断言 --expect-status:ABORT --expect-abort-reason:oom_killed --expect-oom:1
# 用完清理：rm -rf /tmp/r5_guard_run* /tmp/cheng_cgroup_guard.* && colima stop chengx64
```

## 六、坑位与纪律记录

1. **直接 exec virtiofs 路径脚本会挂死**（无输出无错，两轮复现；bash 解释执行正常）——所有 VM 内脚本执行走 `bash <path>`。
2. **guard 迁入竞态消除**：fifo 门闩（被测进程 read 阻塞，root 写 cgroup.procs 迁入后才放行）——fork 出的整树必在组内，无采样窗口。
3. **证据链闭环**：guard 删 cgroup 前把 memory.peak/events/max/swap/oom.group/cgroup.stat 原始字节快照进 raw/（--report-out 给定时保留 work 目录供复核）；validator 六文件 sha256 对账 + 数值重读，被测进程全程无自报通道。
4. **主树零接触**：仅新增 tools/ 两脚本与本回执；既有脚本（含 lane 的 beat_c_linux_cgroup_v2_* 重型 OCI+ptrace 族）未动、未复用其 rootfs 思路。`.gitignore` 全局忽略 `*.sh`——两脚本入库需 `git add -f`（本子代理不提交）。
5. VM 资源用后清理：任务产物 /tmp 已删、cgroup 无残留、colima chengx64 已 stop（07:40）。VM 内 apt 装的 gcc 随 VM 生命周期。

## 七、边界（如实）

- 本轮负载=gcc 现烤 cheng_cold.c（任务书 fallback 路径），非 cheng_w126 车头烤 kernel manifest——后者需 VM 内 linux 版 cheng 驱动，VM 工具链实测无（无 cc 无 cheng linux 构建）；R5 正式 GEN2/GEN3 固定点回执时按此基建换装载即可，守卫/validator 契约不变。
- 烤机轮与超限轮非同轮完成（先正常后压帽），守卫语义（max 精确、peak 权威、oom.group 全杀、validator 重算）经四路径（正常/OOM/timeout/rc-mismatch 判红）实证。
