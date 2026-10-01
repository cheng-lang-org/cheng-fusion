# L4 语义 oracle 核心工具独立代码审查（只读）

审查对象：`src/tools/rsi_semantic_regression.cheng`（1066 行，源 sha `e252520f52d8bb69…`）
配对产物：`.rebuild/semantic/rsi_semantic`（工具 sha `e742917823a9e303…`，与 `.rebuild/semantic/v2/PASS` 记载一致）
参照：设计件 `design_semantic_regression.md`（含 §十三）、账本 §6.1o–§6.1cf、`.rebuild/semantic/*/PASS`、`.rebuild/semantic/obs_cache/*.obs`、`.rebuild/semantic/*/guard.out.txt`
纪律：全程只读（未改任何文件、未发起编译、未取 `.rebuild/COMPILE_SLOT.lock`）；行号以当前工作树为准。

---

## 一、结论（按严重度）

### F1（中高）`--record` 对 7 条语料条目**没有任何语义门禁**：编译失败/超时会被冻结成基线期望值

- 判据入口：`judgeFingerprintInto` 在 record 模式**无条件返回 pass**（`src/tools/rsi_semantic_regression.cheng:176-178`）。
- 语料腿没有第二道门：`corpusEntryRun` 只在 `verdict == "pass"` 时判 PASS 并落基线行（`:366-371`），全文没有 `crc != 0 ⇒ FAIL` 的分支；编译失败时 `fp` 直接置 `"-"`（`:357-360`）。
- 对照：31 格**有**第二道门（`crc==0 && rrc==0` 才做金标，`:445-459`；`verdict=="pass" && golden=="match"` 才 PASS，`:466`），所以 record 轮里格子坏读数被拒（正确）。
- 后果（可复现的坏路径）：`--record` 轮中编译器编译超时（`crc=124`，超时判词锚 `src/tests/rsi_execution_negatives.cheng:137-138,158`）或任意编译错误 ⇒ 该条打印 `status=PASS`、基线写入 `entry … compile_rc 124 fp -`、并同步落观测缓存（`:370-371`）。此后同一载体**永久**命中该缓存重放 `fp -`。
- 该缺陷在**最需要它的场景**下触发：账本 §6.1q 实测窗口只有 3–12 秒、默认 `--compile-timeout` 300 秒（`:1037`），记录轮极易撞超时。
- 与设计件矛盾：§四 `:89-90` 明文「任一条失败 ⇒ 拒绝写基线（基线不得含坏读数）」。注意 §八 `:150-159`（解 B）与 §十 V5 `:202` 又**允许** known-red 条目按 `compile_rc` 平价，所以正确修法不是一律拒，而是：① 明确区分「设计内 known-red」（须显式标注 `anchor=rc_only`，且 rc 白名单化）；② 其余 rc（尤其 124）一律 FAIL 并拒写基线；③ 写基线前对语料腿加 `crc==0 || anchor=rc_only` 门。
- 现势影响（不夸大）：冻结基线 `receipts/semantic_baseline_05af823e.txt` 38 条 `compile_rc` 全为 0 ⇒ **当前无假绿**；这是「未来重记录轮」的洞，且一旦发生会把基线变成拒绝一切正常载具的坏锚。

### F2（中）缓存「只缓存全绿观测」的硬契约**在代码里根本不存在**（有物证）

- 设计 §十三 `:241` 与工具卷首注释 `:208-209` 都声明不可放宽的不变式：`crc=0 && rrc=0 && judge=pass`（格子再加 `golden=match`）。
- 实现：`obsCacheStore`（`:257-270`）**不接受也不检查 rc**，第 `:266` 行把 `"obs 0 0"` 写成**常量**；`corpusEntryRun` 落缓存的条件只有 `verdict=="pass"`（`:366-371`），不看 `crc`/`rrc`；`obsCacheLookupInto` 同样的绿检查（`:245`）比对的就是这个常量，且 `outCrc/outRrc` 从初始化后再未被赋值（`:222-223`，从不解析 `lines[2]`）⇒ **该守卫在任何输入下都不会拒收，是空操作**。
- 物证（盘上原始件）：`.rebuild/semantic/obs_cache/fixture_call_fixture.obs:3-4` = `obs 0 0` + `fp 1:e3b0c442…`，即一条 **run rc=1** 的观测被标成「全绿」并在 V2/V2B/V3/V3F/gate 各轮重放（冻结基线同条 `fp 1:e3b0…` 可对账）。
- 与 F1 组合的放大面：record 轮的 `fp -`（编译失败）同样满足 `verdict=="pass"` ⇒ 会被写进 `obs 0 0`，缓存从此「确认」一条编译失败为绿。
- 修法：`obsCacheStore` 增 `crc/rrc` 形参写真值；lookup 解析并校验；落缓存前补 `crc==0 && rrc==0` 门（known-red 平价条目单列一个显式档，不要用 "0 0" 冒充）。

### F3（低中）`checks_pass` 系统性少 2：三条 PASS 判词不计数，账本引用的读数是错的

- 机械核对全部 `appendCheck` 与计数器配对（见下表），**恰好三处 PASS 未计数**：`:671`（`compiler_sha256`）、`:680`（`baseline_mode`）、`:699`（`baseline_present`）。
- 与盘上判词逐一对账（PASS 行数 ↔ 汇总 `checks_pass`）：`v3/v3f/v4/gate` 45↔43（少 671+699）、`v2/v2b` 46↔44（少 671+680）、`v7/v8` 44↔42、`v4a` 4↔2（少 671+699）。**全部吻合，无其它解释**。
- 同类：`workdir_leftover` 每条残留打一行 FAIL（`:982`）但 `failCount` 只 +1（`:996-998`）。
- 影响：不影响判词（出口只看 `failCount > 0`，`:1008-1010`），但账本 §6.1y/§6.1z 与 `tools/a4/audit_claims.py` 把 `checks_pass=43` 当读数核对 ⇒ 证据面失真；设计 §一 `:25-27` 的「38 指纹 + 1 incumbent + 7 门级」也与此数对不上（且 `compiler_present` 只有 FAIL 分支，从来不打 PASS）。
- 修法：三处补 `passCount = passCount + 1`（或在判词里改名为 `checks_judged` 并同时打印 `checks_lines`）。

### F4（低）`ledger_incumbent` 在无 correct 观测时归因错误（判词误导）

- `:929` 要求 `bestCorrect >= 0`，否则落 else 打印 `incumbent=… oracle_best_correct=… (incumbent 越 oracle 重算最优)`（`:934-935`）——真实原因是「某域无 correct 观测」（`:787-790` 已判 FAIL）。
- 实测物证 `.rebuild/semantic/v4a/guard.out.txt`：`oracle_best_correct=-1` 却写「越 oracle 重算最优」，同一根因被记成 3 条 FAIL（`task_space_correct`/`task_best_correct`/`ledger_incumbent`）。方向是 fail-closed，仅判词归因需修。

### F5（低）边界与算术的零碎口子

1. 空值选项目志不校验：只查 timeout `> 0`（`:1060-1062`）。`--cache:` 空 ⇒ `cacheDir=""` ⇒ `cacheFileFor` 得 `/<entry>.obs`（`:213-214`），落盘失败且**静默**（`obsCacheStore` 不查 `os.WriteFile` 返回值，`:269-270`）；`--fixtures:`/`--ledger:` 空则落到 fail-closed FAIL（可接受）。
2. 超时值走 `strutil.ParseInt`（int64）→ int32 收窄（`:1050-1052`）：`--run-timeout:4294967326` 回绕成 30，静默接受。建议改为解析到 int64 后显式上界检查。
3. `baselineLookupInto` 只校验字段**名**（`:161`），不校验值的形状；`compile_rc` 用 `strutil.ParseInt`（`:164`），而该函数遇非数字**静默返回 0**（`src/std/strutils.cheng:344-365`）⇒ 手改坏的 `compile_rc x` 会被当 0 参与判定（`fp`/`src_sha` 是字符串比较，改坏即 differ/drift，无此问题）。**判死方法（不改树、需编译，本席未做）**：基线副本把某条 `compile_rc 0` 改成 `compile_rc x`，预期仍 `baseline=equal` 判 PASS。
4. 崩溃残留粘滞：三处共享路径按「存在即硬拒」（`:833-845`）、平铺源按「内容不同即硬拒」（`:279-286`），启动期不做残留清理 ⇒ 上一轮崩溃后需人工清场才能再跑（fail-closed，但会表现为莫名的 `shared_stage_path_occupied`）。

### F6（低，疑似）并发清场会误删同目录另一实例的暂存件

- 清场按前缀删 `<root>/src/rsi_sem_work` 下**所有** `sem_*`（`:964-975`），未加实例隔离。两个冷轮并发时，后跑者会删掉先跑者的源/产物 ⇒ 先跑者出现 `differ`/`stage_failed` 假 FAIL（不会假 PASS）。
- 现状自洽性：账本 §6.1t 明说热缓存轮「任何时刻可安全调用」、冷轮须持槽，故按纪律使用不触发。
- **判死方法**：同窗口起两个冷轮（不同 `--cache:`），观察先起者是否出现 `verdict=differ`/`stage_failed`；或给工作目录加 pid/实例后缀后复跑同场景。

---

## 二、任务点名的四问：已核实**无问题**的部分（避免只报坏消息造成误判）

1. **判据是否依赖候选自报** —— 否。格子的 PASS = ① `fp` 逐字节等于冻结基线（`fp` 由本工具跑候选产物实测 stdout 全串 sha 得到，`:440-443`；`textSha256` 与 C1/C2 锚算式同源，`:86-89`）+ ② `golden=match`，金标由工具内 `generator.RsiGeneratorGoldenAnswer` 独立重算（`src/rsi/generator.cheng:100-131`），不消费候选输出。候选程序 stdout 里的 `compares` 虽由程序自报（`src/rsi/evaluator.cheng:30-34`），但整条 stdout 已被 `fp` 锚死 ⇒ 改 `compares` 必然改 `fp` 判 differ，**不能自报刷分**。
2. **缓存命中是否可能复用错键** —— 键行是**整行逐字**比较（`:242`），含工具自算的载体 sha（`:666`） + 调用方工具 sha + 条目名 + 条目源 sha；坏头/短文件/任何不等一律 miss 重跑（`:228-255`）。不传 `--cache-key` ⇒ 全禁用（`:228-229,674-676`），fail-safe。唯一信任边界是 `--cache-key` 由调用方给（`semantic_gate.sh:38,46` 传工具二进制 sha），工具无法自证；传错键才会复用错观测。
3. **`--self-test` 是否恒真** —— **不是恒真**：7 例全部真跑 `judgeFingerprintInto`（`:618-643`），覆盖 identical / stdout 变 / rc 变 / 源漂移 / 缺条 / 无产物 / record 直通，任一期不符即 `failCount>0 ⇒ rc=1`（`:647-649`）。但有一处结构弱面：`selfTestCheck` 的期望比较（`:595`）与判据的比较（`:190-201`）用的是同一个 str `==`/`!` 原语 ⇒ **该原语整体失效时 self-test 仍会 7/7 全绿**（这是任何自检的边界，非本次实现的独创缺陷，但设计件未声明）。另两处覆盖缺口：self-test 完全不碰缓存/聚合/落盘；且 `record_mode_pass`（`:640-643`）把「record 恒 pass」固化成期望行为，故 V1 永远抓不到 F1。
4. **fail-closed 完整性** —— 机械核对全文 27 处 `appendCheck(...,"FAIL")`：每一处都有 `failCount/outFail/pairFail/c8Fail/leftover` 或 `return 1` 配对，出口 `failCount > 0 ⇒ rc=1`（`:1008-1010`）⇒ **不存在「打印 FAIL 但 rc=0」的路径**。缺读数路径（编译器缺失、基线缺头/缺条、夹具缺件/空件、语料档关闭、账本不可读、暂存回读不符）全部走 FAIL。

---

## 三、边界与算术核对（逐项实测）

- `strings.CloneStrRange` 对负/越界 `start,count` 有钳制并返回空串（`src/std/strings.cheng:478-492`）⇒ `:82,113,573,1046-1056` 各处切片不会越界读。
- 选项目志前缀长度逐一相符：`--ledger:`9（`:1046`）、`--fixtures:`11（`:1048`）、`--compile-timeout:`18（`:1050`）、`--run-timeout:`14（`:1052`）、`--cache:`8（`:1054`）、`--cache-key:`12（`:1056`）；`compiler_sha ` 前缀长 13（`:573`）；`argc` 含程序名、位置参数 3 ⇒ 判据 `argc<4`（`:1023`）与遍历 `4..<argc`（`:1041`）自洽（§6.1p 的越界已修）。
- `lineTokenInto`（`:94-116`）终止性成立（`i` 每轮严格增），不会死循环。
- `Fmt` 嵌套字面量已零命中（机械扫描 `{Fmt"` = 0 处），`:968-969` 是先物化后取名的正确形。
- 分母口径：`spaceTotal` 由 `types.RsiTaskDomainCellCount` 派生（`:763-766`，d0=7×3、d1=5×1、d3=5×1=31），枚举循环用 `0..<(Max+1)`（`:711-762`）；一旦 types 常量与枚举漂移即 `task_space_enumerated` FAIL（fail-closed）。
- 摘要行 `entries={cellTotalText}+7`（`:1007`）里的 `+7` 是硬编码常数，追加语料腿时会失真（仅展示面）。

---

## 四、与设计件不一致清单

| # | 设计件 | 实现/实测 | 性质 |
|---|---|---|---|
| 1 | §四 `:89-90`「任一条失败 ⇒ 拒绝写基线（基线不得含坏读数）」 | 语料 7 条在 record 轮恒 pass，坏读数可入基线（F1） | 实现弱于声明 |
| 2 | §十三 `:241`「只缓存全绿观测（crc=0 && rrc=0 && judge=pass）」 | `obsCacheStore` 硬编码 `obs 0 0`；`corpusEntryRun` 只看 judge（F2，物证 `fixture_call_fixture.obs:3-4`） | 声明在代码里不存在 |
| 3 | §一 `:25-27`「38 条指纹 + 1 条 incumbent 腿 + 7 项门级检查」 | 判词行 PASS 数 45（judge）/46（record），`checks_pass` 43/44；`compiler_present` 无 PASS 分支（F3） | 计数口径不一致 |
| 4 | §十三 `:247`、§6.1cf 写作 `tools/a4/semantic_gate.sh`、`tools/a4/unlock_decisive.sh` | 实际件在 `docs/campaigns/2026-09-07-pure-cheng-rsi/tools/a4/` | 文档路径漂移（照抄命令找不到件） |
| 5 | §十 V5 `:202` 期望闭包条目 `compile_rc=2` | 冻结基线该条 `compile_rc 0`、`fp 0:e3b0c442…`（§十 表头已自标过时，§6.1y 已登记） | 已登记，不算新缺陷 |
| 6 | §五/§十 引用的 `types.cheng` 行号（常量 44-56 / 语料 101-109 / 白名单 112-141） | 现值 45-51 / 114-132 / 135-164 | 行号漂移，不影响判据 |

---

## 五、未取得/未验证（如实登记）

- **未编译、未运行、未取编译槽位**（任务硬约束）：上述结论全部由源码 + 盘上既有原始件（`.rebuild/semantic/*` 判词与 `.obs`）对账得出；F3 的 45↔43 对账是纯盘上计数，不需要新编译。
- F5-3（`compile_rc` 非数字静默当 0）与 F6（并发清场）**属疑似**，判死方法已写在各条内；两者都需编译/并发实验，本席未做。
- 未复核外部件 `semantic_gate.sh` 之外的内核线调用方是否都按 `--cache-key:<工具 sha>` 传键（只读抽查了 gate 一处）。
