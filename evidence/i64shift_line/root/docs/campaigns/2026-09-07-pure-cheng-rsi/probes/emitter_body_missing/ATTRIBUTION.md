# emitter_body_missing 探针：stage3「确定性 body-missing」归因

日期：2026-09-09。载具：`artifacts/bootstrap/cheng.stage3`
sha256=`05af823e7db0c8ea1a69cbd01eda84fcd4b8ff8049d38178663fd357d840f276`
（`compiler_class=cold_bootstrap, cold_compiler=cheng_cold`，binstamp v7）。
探针时 parser.cheng（脏树，含他线在途改动）
sha256=`93539526c0e988b74bf2923f45b44805ba361358afd085689f7a9b5aa4da03f3`。
本目录全部探针只读 src/**；CLI 面实验在 `tools/cheng_scratch_scope.sh`
 scratch 内做 APFS 克隆树（`clone_inner.sh`），原树零写入。

## 结论先行

「确定性 body-missing 发射墙」（判词 30/39/43/44）**不是发射器丢体**。
T1/T1b（add 形状改写）rc=2 确定性 2/2，T2（同函数纯布局改写、零 add）
rc=0 绿 —— 布局不敏感，形状敏感。真实机制是三级链：

1. **门禁（根因）**：`add(target, value)` 的 value 是**托管类型**（str 或
   含 str 字段的 struct）的**借用源**（如 `layer.scopes[i]` 序列索引读，
   ownership=3=`COLD_EXPR_OWN_BORROW_SHARED`）时，
   `parse_builtin_add_after_name`（`bootstrap/cold_parser.c:86309`，
   die 点 `:86392`）`die("add(value) borrowed source requires explicit share")`。
   门禁本身是合法的所有权规则（借用源入托管 seq 需显式 share），问题在于
   它对「迁移型改写」的必然触发 + 下游的误导性包装。
2. **吞噤断言文本**：`die()`（`bootstrap/cheng_cold.c:323`，打印点 `:373`）
   先把真实消息打到 stderr（`recovery=1 depth=2`），随后 longjmp；
   import 体急切解析循环（`cheng_cold.c:79410-79426`）对失败函数**静默
   `continue`**，体不落 `ColdFunctionBodyStore`。
3. **误导性转换**：可达调用目标缺体时惰性直析
   `cold_try_compile_import_function_from_source`（`cheng_cold.c:80150`）
   重析同函数再撞同一门禁，longjmp 被捕获后转成
   `cold_die_missing_reachable_body`（`cheng_cold.c:74122`）→
   `reachable function body missing: parser.NormalizedExprLayerMoveInto`
   → `[cheng_cold] primary object emit failed`，rc=2。

「任何布局级改动都炸」被本轮证伪：T2 纯布局改写全 CLI 编译绿。
真实判据：**迁移型改写通常引入 `add(<托管seq>, <借用源>)` 形状**
（逐元素 clone/append/直 add 都要元素级搬运），每次都撞同一门禁；
纯字段搬运/句柄搬运/整体 reset 不含该形状，全绿（见矩阵）。判词 34
的「36 字段直移版编译通过」与此一致。

## 最小独立复现（秒级，不依赖 parser.cheng）

`s11_add_borrowed_managed.cheng`（23 行）：

```cheng
type
    Fact =
        surface: str
        ordinal: int32

    Layer =
        scopes: Fact[]
        n: int32

fn MoveInto(out: var Layer, layer: var Layer) =
    var cloned: Fact[]
    for i in 0..<layer.scopes.len:
        add(cloned, layer.scopes[i])   # 借用源 → 门禁
    out.scopes = cloned
    out.n = layer.n
    layer = Layer()

fn main(): int32 =
    var a: Layer
    var b: Layer
    var f: Fact
    f.surface = "x"
    f.ordinal = 1
    add(b.scopes, f)
    MoveInto(a, b)
    if a.scopes.len != 1:
        return 1
    return 0
```

编译命令（`run_probe.sh <name>`，scratch 内）：

```
cheng.stage3 system-link-exec --root:<scratch> --in:<scratch>/src/s11_add_borrowed_managed.cheng \
  --emit:exe --target:arm64-apple-darwin --out:<scratch>/s11.bin
```

实测 rc=2，报错原文（logs/s11_add_borrowed_managed.err）：

```
.../src/s11_add_borrowed_managed.cheng:17 (offset 504) add target=cloned value=layer.scopes[i] definition=9 place=4 ownership=3
cheng_cold: add(value) borrowed source requires explicit share (recovery=0 depth=2)
[cheng_cold] primary object emit failed
```

连跑 5/5 全炸（logs/s11_add_borrowed_managed.run2-5.{rc,err} 同文）。

## CLI 面（战役原配方，scratch 克隆树）

| 实验 | 改写 | rc | wall | 证据 |
|---|---|---|---|---|
| T0 基线（当前脏树原样） | 无 | 0 | 1330s（22m10s，CPU 1223s，串行） | 会话内实测，binary 绿 |
| T1 | MoveInto 换 CloneInto 逐元素循环（`rewrite_t1.py`） | 2 | 296s | err 含真实门禁行 + `reachable function body missing: parser.NormalizedExprLayerMoveInto` |
| T1b | 同上重跑（新克隆） | 2 | 291s | 同门禁同转换，2/2 确定性 |
| T2 | 函数头插 `var probeSink: int32; probeSink = 0`（纯布局、零 add、零语义差，`rewrite_t2.py`） | **0** | 1194s | **全 CLI 编译绿 →「任何布局改动都炸」证伪** |

T2 与 T1 同函数同模块：唯一决定性变量 = 改写是否引入
`add(<托管seq>, <借用源>)`。布局本身不敏感。

T1 err 原文（logs/t1_cloneinto_loop.err）：

```
src/core/lang/parser.cheng:24 (offset 1141) add target=clonedScopes value=layer.scopes[i] definition=146 place=4 ownership=3
cheng_cold: add(value) borrowed source requires explicit share (recovery=1 depth=2)
cheng_cold: reachable function body missing: parser.NormalizedExprLayerMoveInto
cheng_cold: reachable cold function body missing (recovery=0 depth=1)
[cheng_cold] primary object emit failed
```

注意 `recovery=1`：import 模块内门禁消息先打后吞，随后才出现缺体表面——
两条 stderr 行共存即是本判词的直接铁证。

## 特征矩阵（独立面，载具=stage3，arm64-apple-darwin）

| # | 形状 | 托管元素 add | 结果 |
|---|---|---|---|
| s02 | var struct 字段搬运（2×int32） | 无 | rc=0 绿 |
| s03 | seq 字段搬运 + `layer = T()` | 无 | 绿 |
| s04 | 双 seq 字段搬运 + reset | 无 | 绿 |
| s05 | ref 句柄搬运 + lease bool + reset | 无 | 绿 |
| s06 | 嵌套托管 object 整体搬运 + reset | 无 | 绿 |
| s07 | CloneInto 循环+双 add+句柄搬运（DeepTransfer 形状，元素 int32/标量） | 标量 seq add | 绿 |
| s08 | var 收据 object 实参调用 | 无 | 绿 |
| s09 | MoveInto 全镜像（alias 探针+panic 守卫+收据+全字段搬运+reset） | 无 | 绿 |
| s10 | 仅 reset | 无 | 绿 |
| s11 | **`add(Fact[] , Fact借用索引读)`** | **托管 struct** | **rc=2 门禁 5/5** |
| s12 | 同 s11 但构造新 owned 值再 add | owned | 绿 |
| s13 | `add(str[], str 借用索引读)` | **str** | **rc=2 同门禁** |
| s14 | s11 + `share(layer.scopes[i])` | 显式 share | 绿（值正确） |

必炸判据（充要实测）：`add(seq, v)` 编译期定性 v 为
BORROW_SHARED/BORROW_UNIQUE（ownership=3/4）且元素存储非 PLAIN
（托管）。免疫判据：value 为 owned/move（构造、局部 var、`share()`
包装、标量）。

## 归因函数级定位（Surface A：C 车头，stage3 直编 CLI 的真实路径）

- 门禁 die：`bootstrap/cold_parser.c:86392`
  （`parse_builtin_add_after_name`，起 `:86309`；borrowed 判定
  `:86364-86370`；打印 `add target=... ownership=...` 后 die）。
- 吞哑：`bootstrap/cheng_cold.c:323 die()`，`:373` 恒打真实消息 +
  `recovery=%d depth=%d`，`:380` longjmp。
- 急切 pass 静默跳过：`bootstrap/cheng_cold.c:79410-79426`
  （`fn_parse_fail → continue`，体不落 store）。
- 惰性重析转换：`bootstrap/cheng_cold.c:80150
  cold_try_compile_import_function_from_source`，捕获 longjmp 后
  `:80280-80287 cold_die_missing_reachable_body`。
- 表面文本：`bootstrap/cheng_cold.c:74122
  cold_die_missing_reachable_body`（"reachable function body missing: "）。
- share() 出口：`bootstrap/cold_parser.c:52334`（`share(x)` builtin；
  spec 0.2.1 escape rule，拒绝 var 唯一借用，接受 BORROW_SHARED 共享拷贝）。

### Surface B（.cheng 自宿主镜像，供 kernel 战役）

stage3 二进制本身是 cheng_cold（报告 `compiler_class=cold_bootstrap`），
故 stage3 直编 CLI 的缺体来自上述 C 车头；判词 32 已证同族缺陷也在纯
Cheng 后端传播（stage3 自烤 driver 复现）。纯 Cheng 面对应物：
- 所有权/借用前端：`src/core/analysis/{ownership,borrow_checker,borrow_ir,exact_def_*}.cheng`；
- add intrinsic 计划消费：`src/core/backend/primary_object_plan.cheng:20641`
  （「add/seqs.Add 的权威语义源…」）及 `:75860-75900`（pobj 侧
  「zero-scan 把丢 call-reloc 旗为 missing body」同族注释——.cheng 后端
  自己的缺体误报家族）。

## 对 kernel 战役的可执行修复建议

两级：(a) 诊断面——`cold_die_missing_reachable_body` 系转换点必须把
被吞门禁文本（`ColdDieError` 已存）一并打印，禁止把「门禁拒绝」伪装成
「缺体」；(b) 语义面——parser.cheng 迁移型改写在借用源元素 add 处用
`share()`（s14 实证绿）或字段级 owned 拷贝（s12 实证绿）即可落地，
C 车头无需改门禁本身。
