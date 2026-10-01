# VERIFY_main_mem_round8_append —— [主线程] type-decls 零分配预筛 + intern 去冗余 CloneStr：cold_nested 收窄到 +1.31MB 2026-09-09

date_utc=2026-09-09 · 代理=主线程（goal f374911d 第 8 轮）· 口径=current-source C 链 rebake + 768MiB 守卫 · 共享树纪律：仅动主树已提交文件

## 一、结论先行

**一刀落地、夹具收窄、profiles 瞬态仍未破：**

1. **commit `90b1a17c6`**：
   - parser `ParserReadNormalizedTypeDeclsLines` 零分配预筛：只有顶层 `type` 头行与 type block 内缩进行才走 `PathTrim(StripLineComment)`；空行/`#` 注释不改 `inTypeBlock`，`//` 按普通行复位，与旧逐行路径逐字等价。
   - compiler_csg `compilerCsgProfileLinesInternRec` 调用点 `strings.CloneStr` 改 `share`（Intern 内部自持有，省 64 万行 × 每行一次整行拷贝 churn；来源 b3meta `d5de6a0c5`）。
2. **cold_nested 夹具**：本驱动 compile peak `806,617,088`（+1.31MB），较 round7 的 `808,632,320` 收窄 2.0MB；gate 停于此，v6 未执行。
3. **profiles 墙仍在**：768MiB 纯自烤 `rc=137@136s`，enforced=`808,058,880`（resident），最后标签 `profile src=132`；`after_profiles`/`metadata` 未达。type-decls trim 与行 CloneStr 都不是主导瞬态。

## 二、current-source 证据

| 项 | 值 |
|---|---|
| C 链 rebake | rc=0，driver_sha256=`46706d6ae0c82825c5d18cf2830706a801ff53233dd39baa0f02e9f838c31552`，report_rss=712,245,248 |
| user_path_gate ordinary | PASS compile_rss=738,944KiB |
| user_path_gate call_fixture | PASS compile_rss=767,792KiB（run 1） |
| user_path_gate cold_nested | RED `rss_limit_exceeded:806,617,088:805,306,368`（+1.31MB） |
| 768MiB 纯自烤 | rc=137@136s，enforced=808,058,880 resident，phys=797,279,288，最后标签 profile src=132 |

## 三、相位账（本驱动）

| 点 | rss | live |
|---|---|---|
| profile src=120 | 441,205,528 | 1,563,024 |
| profile src=128 | 446,202,648 | 1,651,277 |
| profile src=132 | 466,174,768 | 1,821,532 |

（live 较 round7 的 1,432,268 反升，属 share 句柄绑定 + 运行窗漂移；峰值仍 ~808MB，说明瞬态不由 retained 集主导。）

## 四、下一刀（必须换测量法）

当前逐刀盲打已到边际收益递减。下一轮先加 **per-sub-phase RSS/live trace**（`CHENG_PARSER_MEM_TRACE=1` 门控）到 `parserBuildExprCallProfileSyntaxInto` 的 split/decls/types/names/max_depth 各点，以及 `parserReadFunctionDeclsLinesMode` 内 `ParserSourceTextFromLines`/`ParserFunctionSignatureDelimiterLinesInto` 前后，一次自烤钉死 ~350-400MB 瞬态的持有者。候选刀形：

1. `ParserSplitChar` 行表 SoA/Arena（消灭每行 str 分配）；
2. `parserReadFunctionDeclsLinesMode` 的 `ParserSourceTextFromLines` 全量拼接 + 每 decl 签名扫描零分配化；
3. `ParserMaxQualifiedCallDepthLines`/`ParserReadNormalizedTypeDeclsLines` 剩余 per-line 分配；
4. 退路：`typed_expr.cheng`/`primary_object_plan.cheng` 大源拆分。

## 五、纪律记录

- 主树源码足迹=commit `90b1a17c6`（parser.cheng + compiler_csg.cheng）；他线 `VERIFY_b3meta_append.md`/`VERIFY_tamem2_append.md` 未纳入。
- 无抬帽轮；失败轮保留 guard.report/phase.trace/resource.trace。
- ordinary/call 夹具双绿为功能证据；cold_nested/v6 仍红为内存墙证据，两者不混写。
- 目标仍 active；下一轮从 §四 的 per-sub-phase trace 开始。
