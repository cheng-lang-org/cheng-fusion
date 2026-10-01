# VERIFY_main_mem_round9_append —— [主线程] parser 逐 stage 计量定谳：profiles 墙=ParserTextSliceCopy per-token churn 2026-09-09

date_utc=2026-09-09 · 代理=主线程（goal f374911d 第 9 轮）· 口径=current-source C 链 rebake + 768MiB 守卫 · 共享树纪律：仅动主树 parser.cheng（已 commit）

## 一、结论先行

**一件计量落地、一墙定谳、一刀回退：**

1. **commit `7a6420e9c`**：`CHENG_PARSER_MEM_TRACE=1` 门控的 `parser_mem stage=... src=... rss=... live=...` 逐 stage 通道（默认零成本）。
2. **定谳**：768MiB 自烤 `rc=137@135s`，外部 guard `phys_footprint=796,378,168` / resident 峰 `807,190,528`；而驱动内 `os.ProcessRssBytes()` 在最大源 `primary_object_plan.cheng` 解析窗仅 **~400-470MB**。差 ~340MB 为压缩页/共享页计入 phys——**逐刀削减 retained/live 集不会移动 guard 峰**，此前 8 轮“live 降、峰不动”由此得解。
3. **热点**：`parser_mem` 行集中在 `ParserTextSliceCopy`（`slice_copy_*`），即 profiles 相 **per-token 切片拷贝 churn**。逐 256 行 `ProcessMemoryPressureRelief` 试验（4 个扫描循环）实测无效，已回退。

## 二、current-source 证据

| 项 | 值 |
|---|---|
| C 链 rebake（重试后） | rc=0，driver_sha256=`01846f07551a3a93efee4a8160ff6ff319763e704e1d85598e372d0d76c9257f`，report_rss=709,607,424 |
| 768MiB 纯自烤 | rc=137@135s，enforced=807,190,528 resident，phys=796,378,168，最后标签 profile src=132 |
| 驱动内账（最大源解析窗） | rss≈400-470MB，live≈687K-1.82M；pool_struct 15.7→25.1MB |
| 首次 rebake | rc=2 `Darwin provider system link mtime normalize failed`（他线并发冷编译争用），重试即 rc=0，非源码错误 |

## 三、下一刀（结构刀，二选一）

1. **切片视图化**（首选）：profiles 相 `ParserTextSliceCopy` 的中间切片改 `ParserTextSliceFast`/range 直取；只有最终落入 `NormalizedFunctionDecl`/profile 的字段才 `Owned` 拷贝。已有 `ParserIdentPrefixCountInRange` 可把 `ParserIdentPrefix(ParserTextSliceCopy(...))` 双分配降为单分配；`ParserCallOpenParenAfterName` 的 generic 参数 `PathTrim(ParserTextSliceCopy(...))` 等同类点逐点收。
2. **大源拆分**（退路）：`primary_object_plan.cheng` 4.49MB / `typed_expr.cheng` 3.52MB 拆 <2MB 模块，直接按源大小比例削 transient。

判据：下一轮先落 §三-1 的 2-3 个高热点，重烤后跑 768MiB 自烤；若 `after_profiles` 仍未达，转 §三-2。

## 四、纪律记录

- 主树源码足迹=commit `7a6420e9c`（parser.cheng +10 行）；他线 `VERIFY_b3meta_append.md`/`VERIFY_tamem2_append.md` 未纳入。
- 无抬帽轮；失败轮保留 guard.report/phase.trace/resource.trace。
- 逐行 relief 试验已回退；`parser_mem` 仅 env 门控，默认零成本。
- 目标仍 active；下一轮从 §三-1 施工。
