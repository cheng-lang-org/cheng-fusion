# DIFF_FORENSIC — aarch64 冷后端误译家族决定性取证（好 10/10 vs 坏 1/10 padding 差分）

线: `.rebuild/diffforensic_line/`（产物独占; 纯 binary 只读分析, 零烤; 2026-09-21）

## 0. 差分结论一句话

**A/B（HEAD 泵门态 vs hunk 回退态, 同编译器 kd_abv_1）全对象 2315 函数指令流差分 = 恰 2 个函数（`msquicNativePumpCodeUnlocked` +125 指令、`msquicNativeDialPumpReadyCode` +6 指令）, 且两函数逐指令对源语义**忠实**（gate 求值→重绑→包裹调用→continue→收割次序全对）; 三已知误译模式在 A/B 差分中均不现形。padding 形状敏感（10/10→1/10）的真臂在 A/B 恒等面之外, 好烤/坏烤 binary 本仓已灭失, 定位必须由 VPN lane 补交样本（§2 清单）。**

## 1. 差分账

样本（在库）:
- A = `.rebuild/abverdict_line/binaries/A/cheng_hy2_tun_core.o`（HEAD c03ad5470 含泵门 hunk; sha256 3772443b…25c9d47; 15,257,917 B）
- B = `…/binaries/B/cheng_hy2_tun_core.o`（仅 `src/quic/native_runtime.cheng` 回退 ac41af29e; sha256 c5618d91…3702a; 15,257,253 B）
- 同一编译器 kd_abv_1（sha256 751af957…e4b0）; 源快照 CID A=aa2ee533… / B=18b1c0e9…（bake report 实证两臂源确不同、编译器确同一）
- arch: ELF64 AArch64 REL（android 移动闭包, build_cheng_hy2_tun_core.sh 配方）

方法（`align2.py`, 迭代修正三次解析缺陷后的最终口径）:
- objdump -d 逐行解析（ADDR: BYTES\tMNEM\tOPS）; 归一化=函数内相对偏移 + 编码字节 + 助记符 + 立即数; 分支目标 `<sym+off>` 保留符号相对量; 内部名 `cheng_cold_<modhash>_N`→`#N` 两边对齐。
- 三层过滤: 编码层差（跨函数分支距离随布局漂移, 1083 函数）与 adrp 最近符号注解差（230 函数）均为布局噪声; 最终**指令流+立即数**口径下差分 = 恰 2 函数。
- 独立旁证: `.text` A 比 B 大 524 B = 131 指令 = #3882(+125)+#3909(+6) 精确和; `.rela.text` A 比 B 多 6 项 = 3 对 GOT（2 读 = 两 gate 各一次 `msquicNativeCurSlot` 读, 1 写 = 拨号环 `msquicNativeCurSlot = dialSlot` 重钉）; `.data`/symtab/strtab 尺寸恒等; 函数头地址两侧全同（除 #3882 内部, #869 起地址重新对齐）。

泵门函数逐臂对源核验（A 侧 `native_runtime.cheng` :4964–5060, 相对偏移为 #3882 内）:
- `let clientSlot = msquicNativeSlotByClientDatapath(…)` → 0x2a0–0x2bc（helper 调用+落槽）
- `var clientRecvAllowed = clientSlot >= 0 && msquicNativeCurSlot == clientSlot` → 0x2c0–0x41c（嵌套短路: bool1≥0 @0x2c8; CurSlot 读 @0x350【GOT ref】; ==比较 @0x370; 合取 @0x400–0x418）
- `if clientSlot >= 0: msquicNativeCurSlot = clientSlot` → 0x3b4–0x434（重测 ≥0 后 **GOT 写** @0x420; 次序在 gate 判定后 = 源注释「gate 判定先于重绑」 faithful）
- `if clientRecvAllowed:` 包裹 → 0x43c–0x45c; `msquicNativePumpDatapathCode(dpId, clientSide)` 调用 @0x48c（双参装载正确）; `clientCode < 0 → return -1` @0x49c–0x50c（0xffffffff 返回序列在 0x4ec）
- `msquicNativeLastPumpReceived` 读→iterReceived/pumpReceivedAny 双置位 @0x510–0x564; `LastPumpDroppedMalformed → continue`（远跳回环头 @0x5a4）; `clientCode > outcome` 收割 @0x5a8+
- #3909: `msquicNativeCurSlot = dialSlot` 重钉 @rel 0x210–0x224（GOT 写, B 侧无此臂）
- **判词: 忠实。无跳过的写、无衰减的重读、无丢 copy-back、无丢移位项。**

## 2. binary 清点与索取清单

| 样本 | 状态 |
|---|---|
| 好烤 10/10 binary | **灭失**（原在 `.tmp-exec/vpn-rewind-verify/`, 按临时域纪律已清） |
| 坏烤 1/10 padding 变体 binary | **灭失**（同上） |
| A（HEAD 泵门态） | 在库 ✓ |
| B（hunk 回退态） | 在库 ✓ |
| `.rebuild/wdfs_line/evidence/` 68 文件 | 灭失（c03ad5470 已登记, 权威替代物=ac41af29e 刀本体） |
| `msquicNativePumpCodeUnlocked/DialPumpReadyCode` 符号 | 内部名带模块哈希（A=46453ee3, B=7e3f4bfe）, 故 REPORT §2 的 13 符号 raw diff 全为地址漂移伪差 |

向 VPN lane 索取（定位 padding 真臂的必要件）:
1. 好 10/10 与坏 1/10 两个 `cheng_hy2_tun_core.o`（或整 exe）+ 各自 sha256;
2. 两臂的 padding diff（加在哪个文件哪一行的什么变量）与两臂源快照 root_cid;
3. 两臂各自编译器 sha256（须钉 binary 级, 见 §5 附带发现）。

## 3. 误译模式归族（任务指定三模式）

- **P1 int64 or-of-shifts 丢项: A/B 差分排除证**——差分仅 2 函数且都不含 64 位移位复合形; 现库旁证: `src/tests/int64_shift_semantics_probe.cheng` @HEAD 编译运行绿（abverdict phase 6, or_term=0180...=split_or, verdict GREEN）; 生产红实证在 5c41e41d4（2026-09-20, SHA-384 三目标全错）, 其真臂据 lottery 普查在共享 lowering/opt（I64_OR 重写族 :51061–51215 带守卫未现误击, **真臂未定位**）; 源侧已 uint64 旁路（src/std/crypto/sha384.cheng :3–6）掩蔽。**结论: 合成探针绿 ≠ 洞闭合, 生产形状红未根修, 属面=共享 lowering, 位点未钉。**
- **P2 局部标量重读衰减: 排除证**——冷后端本就是全栈槽式发射（每值 store→load 往返, 样例见 §1 汇编）, A/B 两侧重读全为同槽同值; lottery 普查 W10: na 寄存器缓存 :39212–39242 死代码（na_find 零调用者）, STR_LEN 臂 :41382 每次重导出; 无活衰减臂。
- **P3 聚合出参 copy-back 丢失: 排除证**——OPEN 链全部数据面函数（FillTextFrame/MuxWriteFrameRaw/TcpTlsWriteFrame/EncryptIntoWithSeq/WriteRecord 及 mux/relay 面）在 A/B **指令流恒等**, 差分不触及; 与 census「AUTH 已达 ⇒ FillTextFrame 同 copy-back 臂活」反证闭合。
- **padding 形状敏感本身（10/10→1/10）: 未获差分**——坏臂在 A/B 恒等面（其余 2313 函数）之内, 无好/坏对无法指位; 这是本线唯一未闭环项, 索取清单 §2。

## 4. 红夹具（真实源形状, 非合成; 交验证槽一烤定谳）

1. `fixtures/rotr64_realshape.cheng`——P1 生产形状逐字最小化（50d1ffeeb 版 sha384Rotr64: int64 有符号 ashr 变量移位 + **int32 移位计数** + `(64-n)` + @borrows 掩码 helper 链 + U64FromBytes byte 常量构造; 双 oracle: 丢 `<<` 项即 rc=1）。与绿探针的形状差=helper 链+byte 构造, 即合成夹具缺口本身。
2. `fixtures/pumpgate_realshape.cheng`——泵门形状骨架（for 预算环+全局状态+client 合取 gate/listener 析取 gate+条件全局重绑+gate 包裹调用+continue+双收割出口+budget 耗尽出口; 双 oracle rc 判）。设计用途: 好/坏 padding 两变体各烤一次（PADDING 注释位加/不加一个全局标量）, 同编译器下输出必须恒等——**这是对 padding 形状敏感性的直接可复现壳**。

## 5. 附带发现（取证副产物）

- **编译器三烤确定性: 代码层成立。** kd_abv_1/2/3 字节差仅 49 B（LC_UUID 16 B @1529 + 签名区 ~33 B @3319396–3319429）, `objdump -d` 差分仅第 2 行文件路径。REPORT 的 `three_bake_disasm_equal=NO` 为**口径伪差**（disasm_sha 把含路径的 header 行一并哈希）; census「编译器字节恒等⇒同源恒结果」前提在代码层成立。但「同编译器」归因仍须钉 **binary sha**（LC_UUID 层即不同）。
- A/B 的 13 个导出符号 raw diff 全为地址漂移伪差（内部名模块哈希不同导致按名配对失败, 实际 common=2315）; abverdict REPORT §2 的「DIFF_COUNT=13」应按本线 §1 口径改读为 **2**。
- `.tmp-exec/` 已清空、`clone_roots/abverdict_a|b` 已于本日 11:56 被他线清扫（本线开工前已提取两臂源到 git, 无依赖）。

## 6. 修法方向（到设计门槛为止, 施工另派）

1. **padding 真臂定位**（唯一活缺口）: 等 §2 样本→同 §1 口径好/坏对齐→差分函数集即误译函数→逐臂对源（跳过的写/衰减重读/丢 copy-back/丢移位项四判据）→回 cheng_cold.c 发射位点。PADDING 变体夹具（§4.2）可先行双烤缩小形状面。
2. **P1 根修刀**（独立, 不等 padding）: `rotr64_realshape.cheng` 一烤定谳 HEAD 红绿; 红→在共享 lowering/opt 二分（I64_OR 重写族 :51061–51215 逐开关）指臂; 绿→红只在 50d1ffeeb 时点编译器, 登记为历史缺陷随现行版本闭合复核。
3. **泵门域结案**: A/B binary 级忠实 + 真机 A/B 无差（5bdb73644）双证, a85e5b5f9 泵门 hunk 从误译嫌疑面**除名**; 后续间歇失败按链路质量域处理（同 5bdb73644 判词）。

## 报告末尾四件套

- **差分结论一句话**: A/B 全对象指令流差分=恰 2 函数（泵门 +125 / 拨号重钉 +6）且逐臂忠实, 三已知误译模式均不现形; padding 10/10→1/10 真臂在恒等面内, 好坏 binary 已灭失待 VPN lane 补交。
- **误译臂定位数**: 0（A/B 域内）; 待样本域: 1 项在索。
- **红夹具数**: 2（真实源形状, 待一烤定谳）。
- **置信度**: A/B 差分与忠实判词=高（三层噪声过滤+指令/重定位/.text 字节三口径互证）; P1 属面=高（普查+本线复核一致）; padding 真臂位置=不可判（样本缺失）。
