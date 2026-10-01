# VERIFY_main_mem_round10_append —— [主线程] 切片视图化落地：profiles 墙仍未动，转大源拆分 2026-09-09

date_utc=2026-09-09 · 代理=主线程（goal f374911d 第 10 轮）· 口径=current-source C 链 rebake + 768MiB 守卫 · 共享树纪律：仅动主树 parser.cheng（已 commit）

## 一、结论先行

**一刀落地、墙未动、结构刀定案：**

1. **commit `78603b5d9`**：17 处内层 `ParserTextSliceCopy` 改 `ParserTextSliceFast`（视图）——15 处 `chengpath.PathTrim(ParserTextSliceCopy(...))` + 2 处 `ParserIdentPrefix(ParserTextSliceCopy(...))`；两者均立即 Owned 拷贝，内层拷贝是每 token 双拷贝的一半，视图生命周期仅限该调用。
2. **768MiB 纯自烤仍撞线**：`rc=137@136s`，enforced=`809,271,296`（resident），phys=798,442,552，最后标签 `profile src=132`；`after_profiles`/`metadata` 仍未达。
3. **cold_nested 夹具**：本驱动 compile peak `808,108,032`（+2.8MB），与 round8 的 `806,617,088` 在运行窗漂移内；gate 停于此，v6 未执行。
4. **定案**：切片双拷贝不是主导瞬态；保留集/双拷贝/行 trim/CloneStr/逐行 relief 五类刀均未移动 ~808-809MB 峰。剩余唯一结构性杠杆=**按源大小削 transient**（大源拆分或单遍行处理）。

## 二、current-source 证据

| 项 | 值 |
|---|---|
| C 链 rebake | rc=0，driver_sha256=`23a11640b01c82472ddf53972e8695adf2f15d13ae41e301f2e56825cbb981aa`，report_rss=709,574,656 |
| user_path_gate ordinary | PASS compile_rss=765,504KiB |
| user_path_gate call_fixture | PASS compile_rss=765,520KiB（run 1） |
| user_path_gate cold_nested | RED `rss_limit_exceeded:808,108,032:805,306,368`（+2.8MB） |
| 768MiB 纯自烤 | rc=137@136s，enforced=809,271,296 resident，phys=798,442,552，最后标签 profile src=132 |

## 三、下一刀（结构刀，必选）

1. **大源拆分（首选）**：`primary_object_plan.cheng` 4.49MB（~75K 行）、`typed_expr.cheng` 3.52MB 按顶层声明边界拆为 <1.5MB 模块；每源 transient 按行数近似线性下降。需同步 module import 闭包、语义身份哈希与 GEN2/GEN3 固定点重立。
2. **单遍行处理（次选）**：profiles 相 `ParserSplitChar` 行表改字节偏移列（SoA），`parserReadFunctionDeclsLinesMode`/`ParserReadNormalizedTypeDeclsLines`/`ParserMaxQualifiedCallDepthLines` 共用一次行索引，消灭每行 `str` 与多遍扫描。

判据：拆分/SoA 后重烤，跑 768MiB 自烤；目标 `after_profiles` 首次出现。

## 四、纪律记录

- 主树源码足迹=commit `78603b5d9`（parser.cheng 17 处替换）；他线 `VERIFY_b3meta_append.md`/`VERIFY_tamem2_append.md` 未纳入。
- 无抬帽轮；失败轮保留 guard.report/phase.trace/resource.trace。
- ordinary/call 夹具双绿为功能证据；cold_nested/v6 红为内存墙证据。
- 目标仍 active；下一轮从 §三-1 施工。
