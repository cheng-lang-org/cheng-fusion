# VERIFY_w153_append —— [wall153] 烤机进程树 RSS 超 1GiB 排查

date_utc=2026-09-05 · 代理=wall153 线 · 树=/Users/lbcheng/cheng-lang（head，含 wall150 三刀 + wall152 在途 parser.cheng 编辑，烤机窗均通过 src/core ≥10min 静默自检）

## 结论先行

**当前树真实烤机峰值 = 717MiB（jobs=8）/ 726MiB（jobs=1），已在 1GiB 之下，达标，无需代码修复。** 旧战役 14-16GB 是 wall150 三刀（quarantine ring 4MiB、mmap 阈值 256KiB 真归还、live 三数记账）入树之前的测量；wall153 首次实测确认三刀已把峰值从 ~14-16GB 压到 <1GiB。BACKEND_JOBS 与峰值无关，无需接受 jobs=1 的时长代价。无 wall153.patch（无修）。

## 测量配方

head 三件套烤机（复刻 w139 通道）：`CHENG_COLD_OBJECT_CACHE_ROOT=<run>/cold_cache CHENG_ENTRY_CACHE=0 /tmp/oob_ab/cheng_w126 system-link-exec --root:--in:src/core/tooling/backend_driver_dispatch_min.cheng --emit:exe --target:arm64-apple-darwin`，外加 200ms 进程树 RSS 采样（含峰值时刻 per-pid 明细，参照 tools/cheng_mem_protocol.sh P4/P5 实现但不设 kill 守卫）+ /usr/bin/time -l ru_maxrss 双口径。脚本=/tmp/oob_ab/w153/w153_measure.sh（w139 COPY 改，未动 tools/ 原件）。

## 测量画像

| 轮 | tag | jobs | build_rc | wall | 树峰值(KB) | 峰值时刻 | ru_maxrss(B) | 产物 sha256 |
|----|-----|------|----------|------|-----------|---------|--------------|-------------|
| 1 | j8 | 8 | 0 | 280s | 734048 (**716.8MiB**) | +142s (51%) | 758284288 (723.2MiB) | 72223b77… |
| 2 | j1 | 1 | 0 | 324s | 743808 (**726.4MiB**) | +177s (55%) | 761004032 (726.5MiB) | 72223b77… |

- 字节门 PASS：两轮产物 sha256 完全相同（w102 实证复现）。
- 峰值时刻组成：树上仅驱动进程在场（j8: 驱动 707296KB + time 壳 512KB；j1: 驱动 742592KB + 壳 1232KB），**无 cc/ld** → 峰在编译臂驻留平台，非链接期。

RSS 曲线分段（时段均值/最大，MiB）：

| 时段 | j8 avg/max | j1 avg/max |
|------|-----------|-----------|
| 0-10% | 148/164 | 146/162 |
| 20-30% | 384/450 | 408/476 |
| 30-40% | **181/276（深谷）** | 526/604 |
| 40-80% | 629-697/625-717 | 637-717/642-726 |
| 90-100% | 550/652 | 421/560 |

相位解读：前端爬升 → 中段出现释放深谷（j8 于 30-40% 回落到 ~180-280MiB，arena 相间释放点在工作的直接证据；j1 因相位错位谷被摊平）→ **40-90% 为 620-726MiB 驻留平台（峰值所在）** → 末段回落 420-550MiB（mmap ≥256KiB 档真归还生效）。

## 峰值组成归因

1. **大头 = 编译臂跨条目驻留平台（40-90% 相位的 620-726MiB）**：全 35 条目 14588 函数（冷前端 22477 函数）的 lowered IR + 对象缓冲在 codegen 相全程驻留；SMALL 档（<256KiB）脏页不归还（wall150 已知机理），RSS 平台反映历史 live 峰。
2. quarantine 层非大头：预算上限 48MiB、ring 上限 4MiB，占平台 <7%。
3. jobs 叠峰层不存在：A/B 峰值差 -9.6MiB（jobs=1 反而略高，噪声级），worker 结果写入共享 wsPoolResults 驻留数组，并行只叠单函数临时分配，无 8×arena 叠加。
4. 链接期（末段）已在峰值之下。

## BACKEND_JOBS A/B 结论

峰值无显著差异（717 vs 726MiB，<2%）；wall 280s vs 324s（jobs=1 慢 16%）。**否决 jobs=1 修法**：烤机脚本/ignition 链保留 jobs=8，无内存代价。

## 与 1GiB 目标距离

- 已达标：717MiB < 1GiB，余量 ~30%（307MiB）。
- 三重证据互证：① 200ms 外部树采样峰值 716.8MiB（采样间隙漏检由 ru_maxrss 排除）；② ru_maxrss 723MiB 为内核精确高水位；③ 两轮烤机在驱动内建 1GiB resource_guard（driver_c_progress_default_max_rss_bytes=1073741824，env 未设即默认生效，BackendDriverDispatchMinProgress 无条件跑 guard 检查）下 rc=0、无 rss_limit_exceeded。
- 剩余大头（如继续冲 500MiB 量级才需要动）：编译臂跨条目驻留平台——需要 lowering/codegen 相的逐条目（或分批）arena 释放，属结构性改动，本轮不做。

## 帽恢复诚实值建议（不动手，超 wall153 授权面）

- 驱动内建帽本来就是诚实 1GiB，且烤机实测通过。
- ignition 链默认 rssCapBytes=12GiB（cheng-fusion 工具参数）与实测 717MiB 之间有 17 倍冗余，建议恢复到 1.5-2GiB（留 wall152 parser 演进余量 + 复测触发器）。12GiB 帽的历史成因（14-16GB）已被 wall150 三刀消除。
- w153 测量脚本本身不设帽（测真实峰值），如需带守卫复测用 CHENG_PROCESS_MAX_RSS_BYTES 默认值即可。

## 纪律记录

- 烤机窗静默：两轮开烤前 `find src/core -mmin 10` 均为空（wall152 在途 parser.cheng 编辑，等待静默后才烤；首轮曾因 parser.cheng mtime<10min 主动退出重等）。
- 烤机预算：2/5 轮（j8 测量轮 + j1 A/B 轮），目标达成提前收工。
- 授权面合规：仅 /tmp/oob_ab/w153/ COPY 与测量产物；src/core 零改动 → 无 patch；未 commit。
- 产物：/tmp/oob_ab/w153/run_j8/、/tmp/oob_ab/w153/run_j1/（rss.csv、peak_detail.txt、maxrss.txt、bake.log、bake.report.txt、summary.txt）。
