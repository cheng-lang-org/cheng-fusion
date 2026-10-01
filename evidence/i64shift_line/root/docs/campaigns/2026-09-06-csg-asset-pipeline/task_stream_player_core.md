# task_stream_player_core.md — 纯 Cheng 播放状态机 StreamPlayerQ

状态：已完成（克隆 playerdev 编译通过，exe 全 PASS）
日期：2026-09-11
上游：`task_scene_stream.md`（SSM1 容器，B 线 `src/game/assets/stream/manifest.cheng`）、
`task_player_shell.md` §3（宿主播放器控制协议 v1，实测数字来源）

## 1. 目标

纯 Cheng 核心播放状态机：将来经宿主协议驱动壳层，管理时间轴与 chunk 取数调度。
只管推进 / EOF 门闩 / 取数，不解码；取数复用 B 线
`StreamManifestChunkIndexForTime` / `StreamManifestNearestKeyframeIndexForTime`。

## 2. 交付（files/action/verify/done）

| 项 | 内容 |
|---|---|
| files | `src/game/assets/stream/player.cheng`（新增，单一 owner）；`src/tests/csg_stream_player_smoke.cheng` |
| action | ① API：`PlayerInit / PlayerPlay / PlayerPause / PlayerSetRate / PlayerSeek / PlayerTick`，风格对齐 manifest.cheng（显式 bool 返回 + out 参数，无兜底）；② `PlayerTick` 输入 manifest 已加载信息，输出当前应取 chunk 序号与预取窗口 chunk 序号列表，同时维护 `bufferedToMs` |
| verify | 冒烟内复用 BytesBuilder 手工构造 4-chunk SSM1 夹具（时间 ×10，总时长 5000ms），脚本化断言：线性推进与 chunk 切换、倍速/定格、间隙 seek 吸附关键帧、EOF 三硬规则、预取与 bufferedToMs 一致、错误契约全显式 false；每项 echo PASS，末行 ALL PASS |
| done | APFS 锚点克隆（playerdev）上车 cheng_w126_re 编译通过、exe 全 PASS（exit=0） |

## 3. 状态机语义表

状态字段：`playing` / `eofLatched` / `entrySnap`（seek 吸附一次性）/ `rateX10` /
`posMs` / `bufferedToMs` / `durationMs` / `bufWindowMs` / `ok`。

| API | 前置校验（否则显式 false） | 副作用 |
|---|---|---|
| `PlayerInit(p, durationMs, bufWindowMs)` | durationMs > 0；bufWindowMs ≥ 0；失败复位零值不留半初始化 | ok=true、playing=false、rateX10=10、posMs=0、eofLatched=false、bufferedToMs=min(bufWindow,duration) |
| `PlayerPlay(p)` | ok；**eofLatched=false**（EOF 后必须先 seek，协议规则 2） | playing=true（rate 保持当前值） |
| `PlayerPause(p)` | ok | playing=false（门闩不变） |
| `PlayerSetRate(p, rateX10)` | ok；rateX10=0（定格）或 ∈[5,20]（协议 r∈[0.5,2.0]）；域外 false 且速率保持 | rateX10 更新；EOF 门闩下允许改速率但不产生推进（规则 3） |
| `PlayerSeek(p, targetMs)` | ok；targetMs∈[0,durationMs]（**钳制是宿主职责**，规则 1；核心越界即 false） | posMs=target、eofLatched=false、entrySnap=true、bufferedToMs 同步 |
| `PlayerTick(p, dtMs, m, out fetch, out pre[])` | ok；dtMs ≥ 0；m.ok；m.totalDurationMs == p.durationMs（不一致显式 false） | 见下 |

Tick 语义（顺序）：

1. **推进**：playing 且未闩时 `adv = dtMs*rateX10/10`，宽域防溢出（先证 `dtMs ≤ int64max/rateX10`，adv 钳在剩余时长内，posMs 恒 ∈[0,durationMs]）；rateX10=0 时 adv=0（定格）。
2. **EOF 门闩**：playing 且 posMs ≥ durationMs → 置位；一次性，仅 PlayerSeek 复位；二次 EOF 由门闩自行再判定（AVFoundation 不再通知，见 shell 文档 §5.3）。
3. **bufferedToMs** = min(posMs+bufWindowMs, durationMs)，宽域判定不裸加，每次 posMs 变更（Init/Seek/Tick）同步维护。
4. **应取 chunk fetchOut**：entrySnap（seek 后一次性）→ `NearestKeyframeIndexForTime(posMs)`（seek 落在间隙/非关键帧处从关键帧 chunk 解码；无关键帧 → -1 显式）；否则 `ChunkIndexForTime(posMs)`（顺序态，间隙保持前 chunk 画面；早于首 chunk → -1）。
5. **预取 preOut**：半开窗口 `[posMs, bufferedToMs)`，chunk 时间区间与窗口相交即取（整体重建非追加）；零窗口/已到末端 → 空表。

## 4. 宿主协议映射（task_player_shell.md §3 ⇄ 本状态机）

| 协议命令/事件 | 状态机入口/出口 | 说明 |
|---|---|---|
| `open(mediaPath)` | 宿主侧加载 + `StreamManifestParse` 后 `PlayerInit(durationMs=TotalDurationMs, bufWindowMs)` | 壳层回 stateChanged；核心不管 IO |
| `play` | `PlayerPlay` | EOF 门闩未解除 → false，宿主须先 seekMs（规则 2） |
| `pause` | `PlayerPause` | ACK ≤29ms 级（实测），核心同步生效 |
| `setRate(r)` | `PlayerSetRate(round(r*10))` | r∈[0.5,2.0] ⇔ rateX10∈[5,20]；EOF 后允许调用但无推进（规则 3） |
| `seekMs(ms)` | 宿主钳制 [0,durationMs] 后 `PlayerSeek(ms)`（规则 1）；completion 语义=entrySnap 就位，宿主可据 `fetchOut` 刻画「拖拽已就位」（规则 4） | 复位 eofLatched；落间隙吸附最近关键帧 |
| `timeUpdate(ptsMs)` | `PlayerTick(dtMs, …)` 出口 posMs | 核心自驱动推进，宿主 100ms 周期对账；posMs=真实播放头 |
| `stateChanged(playing/paused)` | playing 字段 | Play/Pause 直接迁移 |
| `stateChanged(eof)` | eofLatched 置位沿 | 门闩一次性；seek 回退复位后方可续播 |
| `stateChanged(seeking)` | entrySnap 置位→首次 Tick 消费 | seek completion（解码就位）对应窗口 |
| 预取调度 | PlayerTick 出口 pre[] + bufferedToMs | 宿主按序号向产线/存储取 chunk 载荷 |
| 超时预算（play/pause/setRate 250ms、seekMs 500ms） | 不进核心 | 宿主壳层职责；核心同步返回无超时 |

## 5. 验证记录

编译（克隆 `/Users/lbcheng/cheng-f24/anchor_clones/playerdev`）：

```
env -u CHENG_ROOT -u CHENG_PKG_ROOTS -u CHENG_PKG_HOME -u CHENG_GUI_ROOT -u CHENG_IDE_ROOT \
  /private/tmp/cheng_w126_re system-link-exec \
  --root:<克隆根> --in:<克隆根>/src/tests/csg_stream_player_smoke.cheng \
  --emit:exe --target:arm64-apple-darwin \
  --out:<克隆根>/artifacts/csg_asset_pipeline/player_smoke.exe
```

一次编译通过（cold_compile_elapsed_ms≈4038，闭包 11534 行）。exe 运行 exit=0，
20 项 PASS 全绿（线性推进/chunk 切换/预取一致性/EOF 三硬规则/倍速定格/错误契约），
末行 `csg_stream_player_smoke ALL PASS`。

## 6. 未解决问题

1. `seekMs` 落在无关键帧前缀区间（t 早于首关键帧）时 `fetchOut=-1`（显式无入口）；宿主
   UI 层如何呈现（禁拖区 vs 黑帧）待与 producer 对齐。
2. entrySnap 为一次性吸附：seek 后首次 Tick 即消费，其后顺序取数；若 chunk 粒度远大于
   tick 粒度，宿主在 snap 消费到顺序态之间需要自行保持入口 chunk 常驻（预取表不含历史
   入口 chunk）。
3. 倍速仅覆盖 [0.5,2.0]（协议域）；>2x（Spectral 音频档）与连续渐变未建模，待 shell 联调。
4. Tick 校验 `m.totalDurationMs == p.durationMs`：换源（mediaPath）后宿主必须重新 Init，
   不能只 Seek——协议 §3 的 mediaPath 等价 close+open，核心以 Init 为唯一时长绑定点。
