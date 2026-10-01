# task_y_scene_walls.md — UniMaker 场景壳重建四墙复验与攻坚（Y 线）

日期：2026-09-12。工作克隆：`/Users/lbcheng/cheng-f24/anchor_clones/scenfix`（主仓 `cp -cR`，主仓
src/bootstrap 零改动）。现役编译器口径：`/private/tmp/spsb_repro/cheng_head`（9/12 06:19）与克隆内
修复烤 `tmp/y_zfix/cheng_yfix`（本线重烤，含 Z 线 patch）。M3 §6-A~D 四墙逐墙复验。

---

## 0. 结论速览

| 墙 | M3 定性 | Y 线复验定性 | L1 状态 |
|---|---|---|---|
| C | materializer 对 EcomFeedPage:112 throw + type.any 静默死 | **策略门误读**：throw=覆盖债计费器（allow 旗标即过）；「静默死」=缺 `--tolerate-diagnostics` 时 `reportStageDiagnostics` 的 `fail()` 策略退出；type.any 19876 条系 UniMaker 9/8 未提交改动所致（M3 时 9911，翻倍）。M2 接线 `homeDisplayContents` 的 any 返回类型已由 `forcedReturnType` 覆盖修复，**新鲜场景源 13.7MB 已出件**（entry+6 parts） | 生成链全通；尾洞=A(4)（见墙 A） |
| D | glyph-sdf-precompute 工具静默构建失败（工具无解） | **guard 双层 bug，工具无罪**：① `beat_c_process_group_guard_runtime.py` `materialize_command_snapshot` 漏传 `with_data=True`（9/8 commit 84d5fe397 引入）；② guard .sh `MONITOR_RUNTIME_BUILTIN_SHA256` 未随 84d5fe397 的 runtime 改动同步 → 所有 guard 调用 `stage_sha_mismatch` 即死 | **已修**（克隆内），glyph 像素 34.8MB+scene_data 45.9MB 真实出件 |
| A | 借用合同机械注解不可收敛 | **可收敛**：r50 源两层命名变换后现役编译器 host+android 双目标全绿；新鲜 r51 源 @borrows pass 重放后余一类 A(4) `opaque sequence element size missing`（repro 已备） | 解阻（r50 基准）；r51 尾洞 A(4) 转编译器战役 |
| B | 7/16 backend_driver 零值初始化禁令对 UniMaker 闭包无解 | **属实但已被现役编译器解除**：`web_scene_media_block_cache.cheng` 全闭包在 w126_re 与 cheng_yfix 下 rc=0 | 解阻（换现役车头） |

---

## 1. 墙 C（场景源生成）——上游漂移适配，已解阻

### 1.1 EcomFeedPage:112 硬失败定性（真实复现）

单路由复现命令（克隆 ts-csg 下）：

```
node scripts/unimaker-one-click.mjs --out-dir tmp/y_wc1 --project-root /Users/lbcheng/UniMaker/React.js \
  --retained-scene-only --no-run --stop-after materialize --viewport 390x844 \
  --mobile-scene-route "ecom_main:app/components/EcomFeedPage.tsx:EcomFeedPage"
```

输出：`Error: dropped JSX child expression at app/components/EcomFeedPage.tsx:112:13 shape=jsx-drop-map`。
被丢表达式是整个三元 `filteredProducts.length === 0 ? (...) : (<grid>{filteredProducts.map(...)}</grid>)`。

定性：**不是回归，是覆盖债计费器**。commit `2b0cb9901`（dropped JSX child 硬失败+形状白名单）把
8/26 时代的「静默丢弃」改为 throw；TSX 在 L112 的 `.map` 形态 7/11 commit（4a9bb3e，仅加 ASI
useEffect）前后未变。8/26「同形态可过」实为静默丢 UI。该 throw 由 `--allow-dropped-shape:*`
显式放行（管线的官方口径，findings 14707/14713 的 r50 命令即带全旗标）。

真实根因链（为什么 map 没被物化）：`getAllProducts()` 为模块级 CSV 懒加载
（`parseProductsFromCsvRaw(csvRaw)`，`?raw` import），材料器静态求值面无 CSV 管线 →
`filteredProducts` 不可静态解析 → 三元与 map 双双落入 drop。若要真物化需给评估器加
CSV/`parseProductsFromCsvRaw` 内建——**数据驱动列表实例化机制**（r50 lane 在途的
`__m2RebindHomeList` 族）才是正解，本线按 tolerate 口径放行。

### 1.2 type.any「静默死」定性（真实复现 + 破解）

47 路由全量重建（findings 14707 命令 + `--pwa-content-snapshot-file` + 12GB heap）：
materialize 通过（allow 旗标），csgc 200MB×2 写出后进程无输出退出，日志尾部 19876 条
`unsupported csg-web fact: type.any ...`。24GB heap 重跑**同一位置同一死法** → 非内存问题。

根因：`unimaker-one-click.mjs:4321`

```js
function reportStageDiagnostics(label, diagnostics) {
  if (!options.tolerateDiagnostics) fail(`${label}:\n${diagnostics.join("\n")}`);
```

「静默死」= 无 `--tolerate-diagnostics` 时把全部诊断 join 后 `fail()` 的策略退出。
M3 §6-C 的「~9911 条诊断后进程静默死亡」即此。type.any 由 9911 → 19876 翻倍：
UniMaker 仓 9/8 有一批未提交改动（37 文件 +778/−2942，App.tsx/NodesPage/PublishVideoPage 等），
新增调用形态超出抽取器类型面。**上游每次改 PWA 都会推移此数**；工具侧按 tolerate 口径放行，
同时把 type.any 消零立为上游整改/材料器 lane 的持续指标。

### 1.3 过墙证据

加 `--tolerate-diagnostics` 后（attempt 3）：`[1/4] extract → csgc 1106918 facts → [2/4]
Materializing` 全部通过（此前两步从未在同一次运行内连着过）。attempt 4（guard 修复后）结果见 §2.3。

### 1.4 新增上游硬阻断与绕行（attempt 4 尽头）

tolerate 口径打通后，47 路由全量在**最后一步**（场景源发射的 M2 数据驱动列表接线）死于硬 assert：

```
AssertionError: M2 wiring transpile failed: homeDisplayContents: return type: unsupported type 'any'
  （scene-runtime-smoke-source.mjs:3286）
```

`homeDisplayContents`（HomePage useMemo 闭包，sortType+searchQuery 筛选排序）本体无未提交 diff，
但 9/8 在途编辑改了其依赖文件，transpile 的返回类型推导落到 `any`。此失败不受
`--tolerate-diagnostics` 管辖（独立 assert）。

**绕行（UniMaker 只读前提）**：以 `git archive HEAD` 在克隆 tmp 重构「已提交态」React.js 树
（补拷未跟踪的 tsconfig.json/pwa-smoke 媒体），one-click `--project-root` 指向该快照。
HEAD 态与在途态**同样失败** → 断因不在 9/8 在途编辑，而是 r50（9/3）当时的中间树态不可复原
（r50 lane commit 76b54b6e1 台账印证：attempts 15-19 终墙=`__cht_apply body-store-freeze`，
即 M2 接线在 9/3 树上确实通过、随后树态漂移）。

**修复（克隆 ts-csg）**：`csg-cheng-transpiler.ts` 增加 `forcedReturnType` 覆盖
（`narrowAnyReturnToVoid` 同款接线，两处 return-type 失败点均接入），`buildM2HomeWiring` 以
`"DistributedContent[]"` 传入（与 r50 出件签名 `fn homeDisplayContents(...): DistributedContent[]`
逐字一致，非新造类型）。dist 重建（tsc；@types/node 缺失为既有噪音，JS 照常产出）。

---

## 2. 墙 D（glyph-sdf-precompute「静默构建失败」）——guard 双层 bug，已修

### 2.1 真实复现（attempt 3，tolerate 过墙后第一个新死点）

日志尾部：beat guard 以 `status:1, stdout:'', stderr:'', timedOut:false, killed:false` 退出，
`guard.receipt.txt` 0 字节、`link.log` 0 字节——与 M3 §6-D「无输出 rc=1、link.log 0 字节、receipt 空」
逐字同形。**exe 本体已构建成功**（guard argv 内 `--expected-command-sha256:acc41996…` 即 one-click
对编好 exe 的哈希绑定），死在 guard 预检/快照层。

### 2.2 双层根因（均为 commit `84d5fe397` 2026-09-08 引入/遗留）

**第一层（直接死因）**：guard .sh `MONITOR_RUNTIME_BUILTIN_SHA256=ab667d06…` 烤定于旧 runtime；
84d5fe397 改了 `beat_c_process_group_guard_runtime.py`（哈希变 099177c9…）却未同步烤定值。
loader 语义 `stage in ("", builtin) or fail("stage_sha_mismatch")`——`process-runner.mjs:217` 每次传
磁盘现算哈希作 stage → 9/8 起 stage≠builtin 恒成立 → **每次 guard 调用立即 rc=1**，receipt 空、
无任何输出。M3 9/11 撞的即此。

**第二层（修一层后露出）**：84d5fe397 把 `stable_regular_file_snapshot` 重构为流式摘要
（`with_data=False` 默认返回 `data=None`），但 `materialize_command_snapshot`（runtime:2721）的
调用点漏传 `with_data=True` → 修掉第一层后 guard 走到命令快照即
`TypeError: object of type 'NoneType' has no len()`（手工复现抓到完整 traceback）。

两层手工最小复现（`/private/tmp/y_echo.sh` 退出 0 脚本 + 全同款 guard 参数）：
- 修前第一层形态：`guard_error=monitor_runtime_loader stage_sha_mismatch`，RC=1，receipt 空。
- 修第一层后：`TypeError ... write_all(fd, source_data)`，RC=1，receipt 空。
- 注意 `.sh` 与 `.py` 是哈希绑定的对：改 `.py` 必须同步 `.sh` 的烤定值。

### 2.3 修复（克隆内，两处）

1. `tools/beat_c_process_group_guard_runtime.py` `materialize_command_snapshot`：
   `stable_regular_file_snapshot(source_path, "command executable", with_data=True)`。
2. `tools/beat_c_process_group_guard.sh`：`MONITOR_RUNTIME_BUILTIN_SHA256` 更新为修复后 runtime
   的 sha256（`ff2ff76d…`），恢复 .sh↔.py 防篡改绑定。

验证：全同款 guard 参数跑 `/bin/echo` 级 trivial 命令 `GUARD_RC=0`、receipt 无 guard_error
（修前同参数 RC=1）。

### 2.4 过墙证据（attempt 4，真实输出）

guard 修复后 47 路由全量重建一路走到：

```
route inventory: complete=true, expected=47, generated=47
route reachability: complete=true, reachable=47/47, edges=296
scene csgc: 46101487 bytes (149231 facts, routes=47, nodes=10880, layouts=40843, paints=9068)
runtime/unimaker_glyph_sdf_pixels.bin  34,836,480 B   ← glyph 预计算 exe 在修复后的 guard 下真实跑完
runtime/unimaker_scene_data.bin        45,903,257 B
```

即 M3 §6-D 的工具「静默构建失败」整体解除：exe 构建→guard 执行→像素/场景数据全链产出。

---

## 3. 墙 A（场景源 × 借用合同）——两层命名变换后收敛，双目标全绿

### 3.1 关键事实纠偏：M3 测的是未经注解 pass 的存档件

one-click 在编译前对 runtime 模块副本（`src/.tmp-exec/<base>_scene_runtime.cheng`）做 @borrows
注解 pass（`unimaker-one-click.mjs:1533-1564`，跳过 @exportc/cheng_*）；`.gen` 存档的
`unimaker-react.scene-runtime.cheng` 是 **pass 之前的原始件**。M3 probe 日志（apkdev
`scene_w126_probe*.log`）与 Y 线初测都用它，故「第一个借约错即停」。
对存档件重放该 pass：**346 个 helper 获得注解**（138 个为发射期自带），`__chtJsonOf_*`、
`__m2JsonStr` 等族全部就位。

### 3.2 Z 线注解-夹注释因子：排除（按协调者指令实测）

- 补丁预检：`patch_preflight.py` FAIL 属 C 注释续行以 @ 字样开头所致的工具误报
  （displaced=0、wedged=0 两大核心信号干净；ann 命中行 25774/26385/68533/91704 等全在 hunk 区外，
  系补丁之前既有的 C 注释文本）。
- awk 全源扫描：r50 场景源 **0 个「@ 行与 fn 之间夹注释」断附位点**（138 个 @borrows 全紧贴）。
- 重烤 `cheng_yfix`（cc -O2 单文件 bootstrap/cheng_cold.c，BC=0；金丝雀两行源 +
  ordinary_zero_exit_fixture compile/run 双 rc=0）后重编：错误与 w126_re/cheng_head **逐字一致**
  （`__chtJsonOf_DistributedContentLocation → __chtJsonOf_DistributedGeoPublic`）。
  **定性：该因子在本场景源上不存在，排除**（对生成器防回归仍有价值）。

### 3.3 收敛路径：两个命名变换类，全部最小复现

以 r50 场景源（68675 行，`unimaker-react.scene-runtime.cheng`）为底：

**A(1) borrowed-actual 类**（M3 主诉）：`borrowed actual cannot bind non-var non-@borrows formal`。
→ 现有 @borrows pass 重放即解（§3.1），无迭代级联。

**A(2) 原始类型全局直传调用实参**：`call argument transfer authority`（`__m2DistributedContentFromJson
→ __m2JsonStr` formal=0）。
- 最小复现 `src/tests/y_walla2_e_mainonly.cheng`（main 内 `boolToStr2(g_flag)` 即拒）；
  局部变量版 `y_walla2_c_local` 与 let 中转版 `y_walla2_d_globalvialet` 均 rc=0 run rc=0。
- 附带定性：`y_walla_e8.cheng`（同参数两次传 JsonNode 给按值形参）被拒是**正确语义**
  （按值托管形参=消耗，二次传=use-after-move）；`y_walla_e10_borrows.cheng`（@borrows 形参版）
  compile rc=0 run rc=0 = 生成器正解形态。

**A(3) 原始类型全局算术 rvalue**：`managed direct-read edge missing/extra`（`return 0 - g_status`）。
- 最小复现 `src/tests/y_walla3.cheng`（20 行，rc=2 同错）；let 中转版 `y_walla3b/3d` rc=0；
  仅修 `.len` 不修算术的 `y_walla3c` 仍拒 → 算术 rvalue 即触发点。

**统一机械规则**：模块级原始类型全局（bool/int32/int64/float）的一切 rvalue 使用（调用实参、算术）
须经本地 `let` 中转。实现 `src/.tmp-exec/y_prim_global_rvalue.py`（字符串字面量免疫、复合赋值
LHS 免疫），对全源插入 370 个 temp。

### 3.4 过墙证据（真实输出）

```
cheng_yfix system-link-exec --in:src/.tmp-exec/y_r50_scene_fix3.cheng \
  --emit:obj --target:arm64-apple-darwin → RC=0，y_r50_scene_fix3.o 23,817,386 B
同命令 --target:aarch64-linux-android（CHENG_PROCESS_MAX_RSS_BYTES=12884901888）
  → RC=0，y_r50_scene_fix3_android.o 24,817,722 B
```

对照：同源未经变换时 w126_re / cheng_head / cheng_yfix 三车头同错同位（§3.2）。

### 3.5 编译器战役需求（结构性项，源级 workaround 已证）

1. `@borrows source authority`：借用实参链经本地别名（`var node = rawNode`）时「exact live source」
   断链（`y_walla_json_ctx` 族实测）——生成器现规避（直传 param），编译器若能穿别名追踪可减约束。
2. 原始全局 rvalue 门（A(2)/A(3)）：现行为对每次读要求激活内 fresh 绑定；若全局读天然权威合法，
   可放宽为仅写后读序检查。**在放宽前，生成器必须内置本线 pass**（否则 370 站全炸）。
3. `__chtJsonOf_*`/`__m2*` 生成 helper 的 @borrows pass 已是管线硬依赖；`lessons.md` 的
   「@borrows 必须紧贴 fn」地雷在 84d5fe397+Z patch 后对注释透明（本线实测无回归）。

---

## 4. 墙 B（零值初始化禁令）——7/16 driver 特有，现役全绿

`web_scene_media_block_cache.cheng` 自带 12+ 处显式零值初始化（`var i: int32 = 0` 等）。

```
y_wallb_zeroinit.cheng（var i: int32 = 0 / var total: int64 = 0 / while 累加）:
  cheng_yfix  compile rc=0 run rc=0
  w126_re     compile rc=0 run rc=0
web_scene_media_block_cache.cheng 全闭包 --emit:obj (host):
  cheng_yfix  rc=0（obj 出件）
  w126_re     rc=0（obj 出件）
```

M3 §6-B 的「`[cheng_seed] redundant explicit default init`」仅存在于 7/16 的
`backend_driver/cheng`（apkdev 克隆内可复现）。**该 driver 对 UniMaker 场景无解的判词保持成立，
但解法不是改源，而是用现役车头**（w126_re 及之后全部放行零值初始化）。场景壳装配禁用 7/16 车头。

---

## 5. L1 判词与剩余路径

- **四墙判词**：A/B/D 解阻（均有真实编译证据）；C 生成链全通（47/47 路由、csgc、glyph 像素、
  scene_data、13.7MB 场景源发射全绿）。
- **L1（场景壳 APK 重建）本轮未达**，尾洞两枚，均已精确定位：
  1. **A(4)**：新鲜 r51 源（@borrows pass 重放后）在现役编译器余一类
     `opaque sequence element size missing`（`bootstrap/cheng_cold.c:30602/38594`，
     `cold_payload_size_from_type_with_symbols` 对某 SEQ_OPAQUE 元素类型查空）。
     repro：`scenfix/src/.tmp-exec/y_fresh_scene_pipe.cheng` + `cheng_yfix` 一发即中。
  2. 8/31 stage3 的 smoke 编译报 `csgSceneRuntime.__m2RebindHomeList` missing 为**级联假象**
     ——该 fn 在新源 runtime 模块 78162 行真实存在（本轮 grep head 截断曾误判缺失），
     真因是同编闭包里更早的 producer 缺陷（即 A(4) 族）。
  - r50 存量源 + Y 线变换双目标全绿（§3.4），但 r51 运行时数据（scene_data/pixels）与 r50 源
    不配套，混装=伪造，不做。**L1 收尾 = 编译器 lane 解 A(4) 或给出源级改写坐标 → 复用
    `scripts/ssm1_scene_shell.build.mjs` 装配**（provider .so 两阶段 M3 已绿，接口未动）。

## 6. 编译器战役需求清单（结构性项汇总）

1. **A(2)/A(3) 原始全局 rvalue 门**：body-store-freeze/post-opt 两 gate 对模块级原始全局的
   任何 rvalue 使用拒绝。已证 workaround=let 中转（370 站）；若全局读天然权威合法，建议放宽为
   写后读序检查；放宽前 Y 线 pass 必须进 one-click 后处理。
2. **A(4) opaque sequence element size missing**：现役编译器对新鲜场景源某 SEQ_OPAQUE 元素类型
   尺寸表查空。需 cold 端在 die 处带出元素类型文本（现仅裸消息），并判定是类型跨 split-part
   引用还是符号表缺注册。repro 件已交（y_fresh_scene_pipe.cheng）。
3. **A(1) @borrows source authority 穿别名**：借用实参经本地别名（`var node = rawNode`）时
   exact live source 断链。生成器已按直传规避；编译器若支持别名追踪可减约束。
4. **Z 线 patch 与本线**：`z_annot_comment.patch` 在克隆内验证为行为透明（场景源 0 断附位点、
   错误逐字不变），主仓入库排期不受本线阻塞。

## 7. 纪律与产物清单

- 主仓 src/bootstrap 零改动（一次误 apply 已当场 `git apply -R` 还原并核实无残留，
  `git diff bootstrap/` 仅剩并行车道既有未提交内容）；UniMaker 仓只读（仅 `git archive`/read）；
  全程零 git 写操作（克隆内 apply 不计）。
- 克隆内改动：
  - `tools/beat_c_process_group_guard_runtime.py`（with_data=True）+ `tools/beat_c_process_group_guard.sh`（builtin sha 同步）——墙 D；
  - `ts-csg/src/csg-cheng-transpiler.ts`（forcedReturnType + memberCallReturnType）+ `ts-csg/scripts/scene-runtime-smoke-source.mjs`（M2 接线传 `"DistributedContent[]"`）+ dist 重建——墙 C 尾洞；
  - `ts-csg/scripts/y_replay_pipeline.cjs`、`src/.tmp-exec/y_*.py|*.cjs`（管线重放/变换脚本）、
    `src/tests/y_walla*.cheng|y_wallb*.cheng|y_wallb_zeroinit.cheng`（最小复现夹具族）、
    `tmp/uni_head/React.js`（UniMaker HEAD 态快照，git archive 产物）。
- 详细战役需求见 §6；§3.5 为墙 A 专节。上游（UniMaker）建议：type.any 消零、CSV 数据链静态化
  或改走数据驱动列表实例化。
