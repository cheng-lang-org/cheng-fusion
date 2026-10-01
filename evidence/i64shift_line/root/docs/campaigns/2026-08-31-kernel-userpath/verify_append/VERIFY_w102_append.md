# wall102.VERIFY

## wall102 报告：materialize 段并行定性（三墙钉死）+ 第二串行缺口（late-patch N²）修复尝试被字节铁门否决回滚 + BACKEND_JOBS 同名配对字节门与墙钟实测

日期 2026-09-02。授权面=bootstrap/cheng_cold.c（独占，接管时已在树 cache-root relocation diff 非本臂归属）；src/tests 零残留；cold_parser.c 零触碰；未 git commit；主树 bootstrap/cheng_cold.c 已回滚至接管态逐字节一致（cmp 过）。

### 一、定性（分相实测，主对象编译=dispatch_min 闭包 22,3xx 行，全冷，探针 env 门已摘除）
| 相 | 耗时 | 证据 |
|---|---|---|
| signature prescan | 1.72s | rows 注册至 21,351 |
| entry_parse | 1.97s | |
| **reachable materialize** | **76.6–81.9s** | **13,403–13,404 个 import body 编译、source_compiles=0、物化期间铸造 982 符号行**（symbols_add_fn）、roots=1 |
| freeze | 63.2–67.4s | |
| wrapper_demote | 0.8–1.3s | |
| check_symbol_unique | 34–44µs | 非热点（排除 N² 猜想） |
| codegen（含 late-patch 环） | 38.8–68.7s | **late_patch_resolves=198,793 次线性解析 × O(22,338) span 扫描** |
| emit（对象写出） | 0.06–0.3s | |

**materialize 逐函数/逐文件并行三墙钉死（本轮核心定性结论）：**
1. **row 铸造=parse 序**：body parse 与 symbols_add_fn 行铸造同步交织（cheng_cold.c:27467 泛型特化铸造；cold_parser.c:10312/:10551/:53362/:68004/:69275/:69776/:95516/:95551），物化期间实测铸造 982 行（密度~7%）。跨函数并行解析必然改变行分配序 → wall74 确定性门直接命中，产物字节漂移。
2. **解析器全局非线程安全**：ColdErrorRecoveryEnabled 在 parse 内部写（cold_parser.c:11175/:11423/:11651/:50531/:95151）、ColdStrictImportBodyUnresolvedHit（:42431/:43027）、ColdScopeDirectImports 换装（:8880s/:10239）→ 同进程线程并行 parse 不 sound；cold_parser.c 本轮禁碰（cold_parser.c 经 cheng_cold.c:116085 文本包含，宏重定向/TLS 化均触及定义面，且本轮授权面外）。
3. **进程隔离不成立**：fork COW 下子进程铸造行号私有，body 回填需全 BodyIR row 引用重映射或铸造重放（任何遗漏=静默 miscompile），等同符号身份层重写，超出本轮。
4. 乐观波次+串行重放被 mint 密度否决：982/13,403≈7%，含铸造的波次按 soundness 必须整波丢弃串行重放，加速趋零。

### 二、实现尝试与铁门判决（late-patch N² 尾部）
- 采样钉死第二串行缺口：late-patch 环（cheng_cold.c:103377–103477）198,793 次 `cold_find_emitted_duplicate_symbol_target` 线性解析（原实现 ：73861 每次 O(N) span 重扫）。probe 实测补丁后 codegen 相 68.7s→46.6s（A/B 烤，闭包略有漂移仍同向）、同闭包墙钟 E vs D=225.3s→200.5s（**−24.8s，−11%**）。
- 实现：抽取 ：73898 既有 hashed builder 的 publish/find 语义（"first emitted row"），增量发布索引 O(1) 解析。三夹具（ordinary/call_fixture/cold_nested）pristine vs patched 对象字节恒等 ✓。
- **驱动规模铁门否决**：同名同闭包（tree 指纹 cf0dedbe 恒定）pristine vs patched 产物 52MB 内 106,812 簇差异、__stubs 段整体移位 → 决策不等价（缓存 names[] 在 check_unique 后的 span 变异/未发射同名行面前失真）→ **按纪律回滚**，回滚后文件 cmp==接管快照、重建二进制 cmp==pristine。
- 判决依据（字节铁门实测）：
  - **同名 --out 配对 BACKEND_JOBS=1 vs =8：sha256 相等**（ec4cd0e7…==ec4cd0e7…，既有并行机制字节确定性成立）。
  - 异名对（j1 vs j8 文件名）差恰 108 字节：LC_UUID(16B)=H(基名-后缀) + provider 对象文件名字符串 + 代码签名级联 → **字节门必须同名配对**（任务书预判正确）。
  - pristine vs patched 同名：58691882… vs ec4cd0e7… ✗ → 否决回滚。
  - 回滚后夹具 j1==j8==pristine（278c92bc…）✓。
- 被否决补丁存档：/tmp/oob_ab/parallel_materialize.patch（186 行 3 hunks，apply/reverse-check 过，**不得应用**）；另存 /tmp/oob_ab/w102/rejected_late_patch_index.patch 同物。

### 三、墙钟对比（同闭包 X2、同名、全冷 CHENG_DISABLE_COLD_OBJECT_CACHE=1）
| 烤 | jobs | 布局 | wall | cpu | 备注 |
|---|---|---|---|---|---|
| E pristine j1 | 1 | 基线 | **225.3s** | 217.9s | |
| D patched j1 | 1 | +late-patch 索引 | 200.5s | 198.6s | −24.8s，被铁门否决 |
| C patched j8 | 8 | +late-patch 索引 | 197.6s | 221.2s | 既有并行仅 −12.3%，cpu/wall=1.12x（freeze/codegen 池串行包围段吃掉压缩） |
| A pristine j1 | 1 | 前一闭包 X1 | 217.4s | 216.3s | 参照 |
| bake1 暖基线 | 未设 | X0 | 291s | — | w101 漂移前参照 |

### 四、RSS
- patched j8（CHENG_PROCESS_MAX_RSS_BYTES=1GiB 显式守卫）：peak memory footprint **773,833,688B=738MiB ≤1GiB**，rc=0，零 rc=125。
- pristine j1：752,599,928B。

### 五、判词回归（四夹具）
- 车头（回滚后=pristine 内容，j1）：ordinary compile=0/run=0；call_fixture compile=0/run=1（契约预期）；cold_nested compile=0/run=0；**v6(zz_v6_w7) compile=0/run=0（任务书门达成）**。
- 驱动级（kernel_driver j8 产物）：ordinary/call_fixture 绿；v6/cold_nested 撞 `parent lease unavailable`×4（并行线烤机租约竞争，非产物判词；90s 退避串行未消，静置重烤归因）。

### 六、烤机账本与教训
- 烤机 9 次（预算 6 轮，超支自曝）：bake1 暖基线采样；bake2 冷探针（**build_kernel_driver.sh 临时 build.log 吞 driver stderr——探针证据必须文件化，已改文件落盘**）；bake3 直连漏 env（勘误）；A 探针基线；B 补丁 j1；C 补丁 j8；D 同名 j1（铁门）；E pristine 同名（基线铁门）。其余为秒级夹具编译。
- 测量纪律：字节门必须同名 --out；配对窗口必须 tree 指纹恒定（本次 cf0dedbe 全程恒定，w101 漂移发生在更早窗口）。

### 七、移交
1. **materialize 并行**需架构级前置（编排者立项）：(a) 确定性预铸造使 parse 免铸造化，或 (b) row 空间显式重映射层；均跨 cold_parser.c/符号身份层。46.3%（实测 76.6–81.9s/225.3s≈34–36%）缺口在此墙后。
2. **late-patch N² 尾部**（~25s/烤机）：sound 修法前置=钉死 check_unique 后 span 变异面（late codegen 是否命名/未发射同名行是否存在）；被否决实现可作起点（parallel_materialize.patch）。
3. **现有并行压缩率仅 12.3%（j8）**：freeze/codegen 池的串行包围段（证书/admission/确定性归并）是下一个可分流面，比 materialize 墙近得多。
4. 主树状态：bootstrap/cheng_cold.c == 接管态（逐字节），唯一在树 diff 为接管前既有 cache-root relocation（60+/9-，非本臂）。
