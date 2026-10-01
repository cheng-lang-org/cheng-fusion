# guard 三通道权威表 + beat_c v2 追加行（CHANNEL_AUTHORITY 交接件）

> 原件状况：`.rebuild/guardfix_line/CHANNEL_AUTHORITY.md` 已灭失（`.rebuild/` 外部清扫，见
> `docs/campaigns/2026-09-20-kernel-slab-pass1/README.md` 已灭失登记行）。本件 = beat_c v2
> 交接载体：§1 转述幸存权威（看板 §仪器栏，原文照录不加不改），§2 追加 v2 行（additive，
> 只增不改；M3 路由更新生效即从本行起）。权威链：看板 > 本件 §1 转述 > 本件 §2 追加行。

## §1 幸存权威转述（源=docs/campaigns/2026-08-31-kernel-userpath/design/milestone_board.md §仪器栏）

- **guard 活树通道**：beat_c（A）/驱动内埋点（B）本轮未动，<10ms 网格、埋点间失明、回执峰值下界三类盲区属活树改动须单独立项（`.rebuild/guardfix_line/CHANNEL_AUTHORITY.md` §4/§5）。
- **guard 三通道权威表**：超门 fail-stop = 通道 A（beat_c，10ms footprint，唯一执法）；编译器第一道门 = 通道 B（CHENG_PROCESS_MAX_RSS_BYTES 埋点 fail-stop）；同窗相对比较 + 外部峰值对账 = 通道 C（ps 序列 + rusage maxrss 峰值权威；旧 ps sleep-2 网格 0/8 命中缺陷已根修）；峰值判读一律 rusage + beat_c 回执双口径，ps 序列只作下界。

（通道 C 一致口径：macOS rusage 单位=字节，guardfix 线钉死。）

## §2 beat_c v2 追加行（本节为本次新增，此前不存在）

**M3 路由更新：footprint 列 = beat_c v2 双列口径。** 三通道执法/埋点结构不变；仅 footprint 列（通道 A 的读数口径）由「beat_c 单列轮询回执」升级为「beat_c v2 双列口径」：

| 列 | 来源 | 语义 | 盲区 |
|---|---|---|---|
| A | beat_c 轮询回执（unchanged，`process_tree_enforced_peak_bytes`） | max(驻留和, phys_footprint 和) 采样峰值，10ms 网格，唯一执法 | <10ms 网格 / 埋点间失明 / 回执峰值=首次越界下界（receipt 自带 `sampling_blind_spot` 免责行） |
| B | wait 链折叠 rusage maxrss（新增） | 内核生命周期高水位：`waitpid` 收割后 `getrusage(RUSAGE_CHILDREN)`，maxrss=max(直接子进程, 其已收割后代)；Darwin 单位=字节 | 零盲区（无轮询网格）；被守卫整组 SIGKILL 时无终值=诚实缺省（`column_b_status=killed_with_group_no_final_receipt`），不伪造 |
| 双列读数 | `beat_c_v2_footprint_column_reading_bytes = max(A_enforced, B_maxrss)` | M3 footprint 列判定读数 | —— |

- 仪器（活树新增，零改既有）：`tools/beat_c_v2_process_group_guard.sh`（sha256 `b4bb21031fdf8bb35426c187942c68810e3e67f0b69e51c9e855620ca9b75c54`）+ `tools/beat_c_v2_rusage_wait_shim.c`（sha256 `72e8ba2171b665dc0678464e431129803209ec532c75de940e129ed0a0e6e745`）。CLI=现行 beat_c 严格超集，新参数仅 `--rusage-out:`/`--v2-summary-out:`；无 `--rusage-out` 即逐字透传（exec 真守卫，行为零变）；rusage 模式与正式身份栈互斥（硬拒 exit 2），正式执法链仍走 beat_c v1 原样。
- 既有权威 sha 不变：beat_c guard `9ad616edb464ecd37ec1f9d5b6b7364ee2a4386067249a6bca8380e61631f36c`、runtime `df6f0ed32de4566ac7d5746ade52b8cc24f9362fca57382bf4d22907538f7765`。
- 验证账：`.rebuild/guardv2_line/VERIFY_beat_c_v2.txt`（VERDICT=PASS，零烤合成尖峰）——V1 0.7s/V2 0.2s 尖峰双列全命中；V3 瞬态孙进程尖峰（唯一持 256MiB 者）0.5s 网格漏采样（trace 证）而 B 列折叠命中 269,844,480（wait 链折叠直接证明，Darwin 实证孙代 maxrss 穿中级 python 折叠至 shim）；V4 无尖峰双列同尺度一致（A=11.57MB/B=10.19MB）；V5 rusage 模式越界照杀（ABORT/rss_limit_exceeded/rc=137/无伪造回执）；V6 透传零回归（complete/breach/timeout/formal 四对，exit code 与语义键集 `diff` 全同，正式身份栈经透传 verified）。
- 静窗复验（quietwin_retest.sh）：该件同批灭失未重建，v2 不影响其判据面；M3 判读若需静窗五项，按看板 §仪器栏「静窗五项一发」转述执行。
