# parser.cheng steal-then-reset 同族清扫（判词 50 备案清偿，判词 52 配套）

日期：2026-09-10。实验基线=9dd7a2bcd（git archive 克隆树，disk_guard 租约，
parser.cheng sha c124d8ec…）；载具 stage3 sha=05af823e…（禁重烤，未动）。
主树 src/** 本席零写入；patch 交付后对现行 HEAD 04d39d084 复验
apply --check PASS + 9dd7a2bcd 基线字节回程 cmp 一致。

## 结论先行

1. 全文扫描 `x = T()` 整体 record reset 形状共 7 处：真共享面 2 处
   （判词 50 备案两点全部落实），按 E1 同款源侧 detach 改写；其余 5 处
   无前置 steal/零共享面，备案不改（避免无谓布局扰动）。
2. 守卫/receipt/合同语义一字未动：alias/重复 owner 守卫、borrowed tree
   释放/lease 撤销次序、destination release receipt、terminal receipt
   三判定与 panic 全保留。detach 与整体 reset 值语义逐字段等值（每字段
   写入与默认构造完全相同的值），仅消去「默认构造值返回+record 拷贝」
   这一误编译暴露面（判词 30/32 家族的双 hazard：释放路径裸释放已共享
   payload→悬垂；全零记录 store 落错址→幽灵零槽）。

## 扫描清单（行号=9dd7a2bcd）

| 行号 | 函数 | 形状 | 共享面 | 处置 |
|---|---|---|---|---|
| 2433 | parserSourceRewriteCoordinateMapFromExactRewriteInto | 入口预清 out | 无（无前置 steal，旧值独占走正常 managed assign） | 备案不改 |
| 2995 | NormalizedExprLayerCommitBorrowedMetadata | steal→reset | **有**：exprs/exprNext/scopes/exprLookup 句柄+tree 刚移交 out（typed_expr.cheng:65699 活调用，提交后 staged 即弃） | detach 改写 |
| 3102 | NormalizedExprLayerTerminalReleaseWithReceipt | freeSeq→reset | **条件有**：5 个 seq 头已被 freeSeq 清零，但 valueExprTree 共享指针仍存活；全零记录拷贝保留落错址/误释放面 | detach 改写 |
| 28225 | parserBuildExprCallProfileSyntaxInto | 入口预清 profile | 无 | 备案不改 |
| 28346 | ParserBuildExprCallProfileExactInto | 入口预清 profile | 无 | 备案不改 |
| 30655 | ParserStructuredSourceFactsReset | 终态独占清场 | 无（payload 独占，合法释放） | 备案不改 |
| 30667 | ParserStructuredSourceSliceReset | 终态独占清场 | 无 | 备案不改 |

扫描方法：`grep -nE '^ +[a-z][A-Za-z0-9.]* = [A-Za-z_][A-Za-z0-9_]*\(\)'
parser.cheng` 全量枚举（含点号 LHS 变体，无非标准类型名漏网），逐点读
函数全文定性前置 steal 与 payload 可达性。

## 改写

- patch：`parser_detach_sweep.patch`（67 行，2 hunk，仅 parser.cheng
  :2995/:3102 两处）。脚本化改写 `rewrite_detach_sweep.py`（锚唯一
  assert + 替换后按函数体切片 count 校验；注意 staged lease=false 在
  函数内 borrow 撤销处已有既有行，校验按切片而非全局计数）。
- detach 形状=19 字段逐项置零/置空：sourceCount/questionResidualCount
  清零；exprs/exprNext/scopes/exprLookup.slots/exprLookup.buckets 五个
  seq 头 len=0/cap=0/buffer=nil；valueExprTree=nil；
  valueExprTreeBorrowLease=false——与 NormalizedExprLayer(:994) 字段
  全集一一对应，无遗漏字段（对照类型声明核对）。
- ②处注释明示 receipt 三判定（storageReleased/bufferCount/
  retainedBytes）与 panic 守卫未动，detach 后判定逐项等值。

## 实测阶梯（全 rc 实测，scratch 克隆树）

| # | 验证 | 结果 |
|---|---|---|
| ① | stage3 链 rsi_contract 编译（CHENG_COMPILE_SKIP_CACHE_ROOT 禁缓存） | rc=0，3812.9ms，产物 7.9MB |
| ② | rsi_contract 运行 | rc=0，173 个 assert 合同点静默全过（assert 失败才打印；比 FIX.md 时代 139 又增判词 51 迁移用例） |
| ③ | 全 CLI 烤制（compiler_main.cheng→driver.bin，输入 639401 行） | rc=0，885.6s（14min46s，正常窗口），driver sha 237b6deb… |
| ④ | patch apply --check（现行 HEAD 04d39d084） | PASS |
| ⑤ | patch apply + cmp 字节回程（9dd7a2bcd 基线） | 逐字节一致 |

## 与并行线隔离

04d39d084（kernel 前端内存墙 perf）的 parser hunks 在 :26556-:36724，
与本席两锚区 :2992-:3149 完全错位；NormalizedExprLayer 字段布局在新
HEAD 逐字段未变（:995-:1003 对照），detach 字段名在新 HEAD 有效。

## 复现配方

```
TASK=<scratch dir via cheng_scratch_scope/cheng_disk_guard>
git -C /Users/lbcheng/cheng-lang archive 9dd7a2bcd | tar -x -C $TASK/tree
mkdir -p $TASK/tree   # archive 解包前
cd $TASK/tree && git apply <PROBE>/parser_detach_sweep.patch
CHENG_COMPILE_SKIP_CACHE_ROOT=1 cheng.stage3 system-link-exec \
  --root:$TASK/tree --in:src/tests/rsi_contract.cheng \
  --emit:exe --target:arm64-apple-darwin --out:$TASK/rsi.bin   # rc=0 ~4s
$TASK/rsi.bin                                                    # rc=0
CHENG_COMPILE_SKIP_CACHE_ROOT=1 cheng.stage3 system-link-exec \
  --root:$TASK/tree --in:src/core/tooling/compiler_main.cheng \
  --emit:exe --target:arm64-apple-darwin --out:$TASK/driver.bin # rc=0 ~15min
```
