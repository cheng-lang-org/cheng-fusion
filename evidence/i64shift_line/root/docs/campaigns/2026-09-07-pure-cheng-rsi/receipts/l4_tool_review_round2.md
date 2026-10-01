# L4 工具复审 round2（只读）

受审：`src/tools/rsi_semantic_regression.cheng`（源 sha `8ca9d02d1db1e00c…`，1117 行）。
**验证边界（先声明）**：当前修订**从未编译/运行** —— 源 mtime `2026-09-14T04:04:30`，配套二进制 `.rebuild/semantic/rsi_semantic` mtime `2026-09-13T16:59:29`，且 `find .rebuild/semantic -newer <源>` 为空。以下全部为源码级推演 + 盘上旧二进制产物对账（`.rebuild/semantic/*/guard.out.txt`、`obs_cache/*.obs`、`.rebuild/patchwork/probe4.log`）。全程只读、未编译、未取槽位。

## 1. 三处修改是否闭合旧洞

**F1 编译失败分支：闭合。** `:182-189`：
```
        if compileRc != 0:
            outVerdict = "record_reject"
...
        if len(Fmt"{fp}") <= 2:
            outVerdict = "record_reject"
```
reject 的四条落点全部配 FAIL 计数（`:384-387` 缓存侧 / `:411-413` 冷跑侧 / `:461-463` / `:512-514`）⇒ `:990` `if failCount > 0:` 拒绝写盘并 `failCount+1` ⇒ `:1059` `return 1`。**`writeBaselineVerify` 全仓唯一调用点是 `:1003`**（src 全域 grep 仅 1003 一处）⇒ 「record 失败不落盘」成立。

**残余绕过①（真洞，本轮由新注释暴露）：运行超时 `rrc=124` 仍可入基线。** `:181` 逐字：
```
        # 运行期 rc!=0 仍合法 —— 它被 <rc> 前缀锚进 fp, 是可复现的确定性读数。
```
但卷首 `:34-35` 自述 `execution.RsiRunCapture -> hostos.ExecFileCapture (单调钟到限 SIGTERM, +500ms SIGKILL, timedOut 唯一判词 rc=124)` ⇒ rrc=124 是**负载相关、非确定性**读数。corpus 7 条无第二道门（只有格子有 `:484` `if crc == 0 && rrc == 0:`）⇒ record 轮里夹具运行超时会被冻成 `entry … compile_rc 0 fp 124:<sha>`。判据方向仍是 fail-closed（judge 下一条命中缓存也过不了 `:282`，重跑多半 differ），但违反设计 §四「基线不得含坏读数」。上一轮只点名 crc=124，这条是**同一 F1 的未闭合半边**。

**残余绕过②（低）：基线写盘早于清场判据。** `:1003` 写盘，`:1048-1049` 才判残留：
```
    if leftover != 0:
        failCount = failCount + 1
```
⇒ 清场失败时工具 rc=1，但盘上基线**已经被更新**。建议把清场判据前移或写盘后二次校验。

**缓存回放侧无绕过**：`:273` `if Fmt"{lines[2]}" != "obs 0 0": return` + `:282` `if fpRcPrefixOf(Fmt"{fpLine[1]}") != 0: return` 两道独立校验（一道常量行、一道从 fp 反解真值）。物证 `.rebuild/semantic/obs_cache/fixture_call_fixture.obs` 第 3-4 行 = `obs 0 0` / `fp 1:e3b0c442…`，且 `call_fixture.cheng` 源为 `fn helper(): int32 = return 1` / `fn main(): int32 = return helper()` ⇒ 该条恒 rrc=1，新代码下永久 miss（`fpRcPrefixOf("1:…")=1`），不可能重放。
**golden 侧无绕过**：格子缓存回放要 `:456` `if jv == "pass" && Fmt"{hGolden}" == "match":`，而 store 只在 `:504` 双条件成立时写 `"match"`（`:509`）⇒ 缓存不能掩盖 mismatch。生成器空/暂存失败/夹具缺件全部 fail-closed（`:428-431, 468-471, 526-536`）。

## 2. 新代码引入的缺陷

**`fpRcPrefixOf`（`:229-239`）逐字推演**（`split` 实现 `src/std/strutils.cheng:175-190`：空串→`[""]`；`":"→["",""]`；`parseInt` `:344-365`：非数字/空→0，"abc"→0，"1abc"→1，"+1"→1，"-1"→-1）：

| 输入 | parts | head | ParseInt | IntToStr 往返 | 返回 |
|---|---|---|---|---|---|
| `"1:abc"` | ["1","abc"] | "1" | 1 | "1"=="1" | **1** |
| `":"` | ["",""] | "" | — | `:234` len<=0 | **-1** |
| `"abc"` | ["abc"] len<2 | — | — | `:231` | **-1** |
| `""` | [""] len<2 | — | — | `:231` | **-1** |
| `"0:"` | ["0",""] | "0" | 0 | "0"=="0" | **0** |
| `"-1:x"` | ["-1","x"] | "-1" | -1 | "-1"=="-1" | **-1**（与非法同值；调用方只判 `!=0`，无碍） |
| `"abc:def"` | — | "abc" | 0 | "0"!="abc" | **-1** |
| `"+1:x"/"01:x"/" 0:x"` | — | — | 1/1/0 | 不等 | **-1** |

唯一宽松点 `"0:"→0`，但落盘 fp 只有 `{rrc}:{64hex}` 或 `"-"`（`:395-398, 478-481`），且 record 的 `len(fp)<=2` 门会把 `"0:"` 挡在基线外 ⇒ **不可达，非缺陷**。`"abc:def"` 被往返校验杀掉，正是旧洞（ParseInt 静默 0）的补法，正确。

**实参顺序：两处均与签名逐位一致。** 签名 `:291-293` `fn obsCacheStore(cacheDir: str, cacheKey: str, entryName: str, srcSha: str,` / `crc: int32, rrc: int32, fp: str, golden: str, score: int64,`；调用 `:408-409` `…Fmt"{srcSha}", crc, rrc, Fmt"{fp}", "-", int64(0), 0)`；`:508-510` `…Fmt"{srcSha}", crc, rrc, Fmt"{fp}", "match", outScore,` `outCorrect)`；两处实参本身就是 `crc,rrc`（`:389-390, 472-473` 声明），顺序自洽。

**格式自洽。** `:296-304`：`if crc != 0 || rrc != 0: return` 之后才 `add(parts, Fmt"obs {crc} {rrc}")` ⇒ 逐字 `"obs 0 0"`，与 `:273` 字面量相等；golden 行永为 4 段（`"-"` 或 `"match"` + 两个数字），满足 `:277` `len(fpLine) < 2 || len(gLine) < 4`。

## 3. @borrows 形参纪律：无该风险

两处相关调用：(a) `:282` `fpRcPrefixOf(Fmt"{fpLine[1]}")`；(b) 定义内 `:230` `strutil.Split(Fmt"{fp}", ':')` / `:236-237` `strutil.ParseInt(Fmt"{head}")`（Fmt-of-形参）。
**旁证1（同类形、量产已验证）**：`:275-276` `let fpLine: str[] = strutil.Split(Fmt"{lines[3]}", ' ')` —— 同为「@borrows 函数内把 `Fmt"{arr[i]}"` 直接当另一个 @borrows 形参实参」。盘上实测命中 `cached=obs_v1` 共 **222 处**（`.rebuild/semantic/v3=38, gate=38, v2b=38, v8=38, v2=32, v7=37`）；命中要求该行及 `gLine` 解析成功 ⇒ 该形在真二进制上工作。
**旁证2**：`:197` `baselineLookupInto(Fmt"{baseText}", Fmt"{entryName}", …)`（Fmt-of-形参 → @borrows）；judge 轮 `checks_fail=0` 且 38 条全命中基线 ⇒ 工作。
**旁证3**：`.rebuild/patchwork/probe4.log` `C1 hit=1 crc=0 rrc=0` / `C1 fp=[0:deadbeef] golden=[match] score=10640 correct=1` ⇒ 同进程 store→lookup 往返成立。
**证据面提醒（疑似）**：probe 头注释称「@borrows 内联形态拿空串」，但 `src/probe_cache_semantics/cache_probe.cheng:63,72` 的 A2 内联用例落在 `main()`（非 @borrows）内，且 probe4.log 记 `A2 inline_split_count=5`（非空）⇒ 该 log 未直接复现「@borrows 内联失败」。结论按旁证1/2/3 给：对本文件两处调用**无实际风险**。

## 4. checks_pass 口径：judge 满绿 45，record 满绿 46；PASS 行数 == checks_pass 成立

- `passCount += 1` 点（16 行）：`:720, 731, 751, 773, 790, 807, 828, 836, 847, 872, 932, 934, 960, 983, 1006, 1053`；子函数 `outPass` 点（4 行）：`:383, 407, 459, 507`（经 `:773/790/807/872/932/934/960` 汇入）。
- `appendCheck(…, "PASS", …)` 点（13 行）：`:381, 405, 457, 505, 719, 729, 749, 826, 834, 845, 981, 1004, 1051`（另有 `:635` 属 self-test，不打印 checks_pass）。
- 一一配对：381↔383、405↔407、457↔459、505↔507、719↔720、729↔731、749↔751、826↔828、834↔836、845↔847、981↔983、1004↔1006、1051↔1053；无「打 PASS 不计数」也无「计数不打 PASS」⇒ **等式成立**（F3 三处已补齐）。
- judge 45 = 31 格 + 7 语料（4 夹具 + pair2_ms + closure8_multisource + corpus0_minimal_smoke）+ 7 门级（`:719, 749, 826, 834, 845, 981, 1051`）。
- record 46 = 同 45，但 `:749` 换成 `:729` `baseline_mode`（仍 1 条），并多 `:1004` `baseline_write`（+1）。
- 盘上对账（旧二进制）：judge 满绿 `v3=45 PASS / checks_pass=43`、`v4=45/43`、`gate=45/43`；record 满绿 `v2b=46/44`、`v2=46/44`（v7=44/42、v8=44/42、v4a=4/2 各含 FAIL 行）。修后应分别变为 45/45、46/46。
- 残留：`checks_fail` 与 FAIL 行数仍不对齐（`:1044-1049` N 条残留打 N 行 FAIL 只 +1）—— 上一轮已报，未修。

## 5. 新问题与其他

1. **（真残余）`rrc=124` 可入基线** —— 见 §1 残余①；建议 record 侧对 `rrc==124` 硬拒（或要求显式 `anchor` 标注），否则一次负载抖动就把非确定性读数冻成锚。
2. **（低）自检覆盖偏斜**：新增两条用例 `:684, 688` 都打 `compileRc != 0` 同一分支，`:186` 的 `len(fp) <= 2`（fp 缺失）分支**零用例**。
3. **（低，证据面）文档「坏条目冷跑重写（自愈）」对本例不成立**：`call_fixture` 恒 rrc=1 ⇒ `:296` 直接 return，旧 `.obs` 永不被覆盖，盘上继续留 `obs 0 0` + `fp 1:…` 的假绿行（安全性无碍，但 `docs/cheng-rsi-fusion-plan.md:527` / `docs/cheng-rsi-acceptance-status.md:797` 的自愈说法应改为「不再重放，但红条目残留不清理」）。
4. **（低）设计 §八 解 B / §十 V5 的 `anchor=rc_only` 平价未实现**：新门对一切 `compileRc!=0` 硬拒 ⇒ 若 8 源闭包回到 `compile_rc=2`（设计 `:21,47,158` 记载的 known-red 态），`--record` 将永久写不出基线（fail-closed，但功能性死锁）。设计件 `:181` 已注现势 `compile_rc=0`，当前不触发。
5. **（非新，仍未修）**：`--cache:` 空 → 静默写失败（F5-1）；`--run-timeout:` int32 回绕（F5-2）；`baselineLookupInto` 的 `compile_rc` 非数字被 `parseInt` 静默当 0（F5-3，`src/std/strutils.cheng:363-364` `if ! hadDigit: return 0`）；并发清场误删（F6）。
6. **无崩溃/越界面**：所有下标（`:231 parts[0]`、`:277 fpLine[1]/gLine[3]`、`:282 fpLine[1]`、`:1020/1030`）均先判长度；路径拼接 `Fmt"{cacheDir}/{entryName}.obs"` 的 entryName 全为内部常量名（无穿越）；超时默认值未收窄（`:1088-1089` 300/30 秒）。`fpRcPrefixOf` 的 int→int32 隐式收窄有既存同类（`src/rsi/csg_layer.cheng:334` `fn rsiGenOfVersionId(idText: str): int32` 内 `return strutil.ParseInt(digits)`；`src/core/backend/regalloc_production_artifacts.cheng:3291` `strings.IntToStr(strutil.ParseInt(functionIrIndexText))`）⇒ **推断**可编译（未编译，标未验证）。

## 可交付裁定

**无阻断级缺陷**：F1/F2/F3 三处修改方向正确、主体闭合（编译坏读数不入基线、非全绿不入缓存、计数对齐），余 1 条真残余（record 仍可冻 run `rrc=124`）与 3 条低危留档项；且当前修订必须先编译一次（盘上无对应二进制、无 post-fix 判词）才能宣称修复生效。
