# exe_dd_poison_triage.md — cheng wrapper-main exe 形 reply 0xDD 毒值只读归因（2026-09-20）

判词：**根因定位（静态闭合 + 现场定量指纹全命中）。动态复现被当前树两个独立红灯
挡住，如实登记缺口。** 0xDD 腐坏不是 wrapper trampoline / 双 main 补丁 / ORC
registry 问题，而是探针 main 的 reply 读回链里一句
**「owned 临时 str 的 @borrow_result 视图逃逸语句」**——基座临时在语句末释放并被
运行时毒化，视图悬挂，echo 读回 `len × 0xDD`。wrapper-main exe 形"特有"是观察
假象：**exe 形是唯一真正执行 main 的形态**，腐坏代码两形态都带着，只是宿主形
从不运行它。

## 1. 0xDD 毒值语义（第一性入口，源码行）

0xDD = **已释放托管内存毒**（free-poison + 有界 quarantine 制度，wall75 内存制度线）：

- 填充常量：`src/core/runtime/program_support_backend.cheng:1834`
  `const chengQuarantinePoisonByte: int32 = 221`（=0xDD）。
- 填充点：同文件 `cheng_quarantine_release_locked`（:2025 起），托管块物理释放
  唯一收口在 ：2069 `cheng_bytes_set(payload, chengQuarantinePoisonByte, size)`
  ——整块 payload 逐字节填 0xDD 后进 FIFO quarantine（预算 48MiB），淘汰前只
  **复扫检测写**（:1895 `cheng_quarantine_scan_locked`），**读是静默毒**——所以
  程序不 fail-stop、安静打印毒，与现场一致。
- 设计注释自述：:1820-1821「释放后任何读写立刻呈可判别毒形态（0xDD ≠ 0xFF，
  与合法 -1 默认、move-out 置零均不同）」。

**读回 0xDD ⟺ 读已释放（毒化）内存，use-after-free 读形。**

## 2. 根因定位（文件：行 + 机制）

肇事句（两份探针 main 同形）：

- `src/tools/ssm1q_client_probe.cheng:1395`
- `src/tools/ssm1q_fetch_file_probe.cheng:1403`

```cheng
var text = strings.SliceBytes(rawbytes.BytesToString(outBytes), 0, len)
rawbytes.BytesFree(outBytes)          # :1396 / :1404
echo(strings.ConcatStr(strings.IntToStr(rc), " | " + text))   # :1397 / :1405
```

机制一句：`BytesToString`（rawbytes.cheng:128 → `strFromBytesCopy`，
system.cheng:2843 → `strOwnedAlloc` :2831，flags=Owned）产生 **8MB owned 临时
str**；`SliceBytes`（strings.cheng:505 → `StrSubView`，system.cheng:422）返回
**零拷贝视图**（out.data=源内偏移，flags=0，不 retain 基座）；临时 str 在语句末
释放 → 8MB 块进 quarantine 毒化（0xDD×8MB）→ `text` 悬挂 → echo 读毒。
`@borrows` 只管形参、视图不会自动 retain/copy——库合同早有在案：
`lessons.md:248`（2026-07-26「flags=0 + store_id 的 interior str…跨生命周期必须
真实 full-base retain 或 byte/NewStringCopy」）。

## 3. 现场定量指纹（机制预测 vs 实测，全命中）

机制预测：echo 输出长度 = scan 长度（毒化前扫原始 outBytes 缓冲，遇 NUL 停，
正确值 = q_copy_out 返回的 rc）；内容 = 全 0xDD 无杂字节。对 `.scratch/rev/`
三份现场 exe 输出逐字节计数：

| 现场件 | rc 字段 | 0xDD 字节数 | 首行其余字节 |
| --- | --- | --- | --- |
| new_out.txt | 68 | **68** | 仅 `68 | `（0x36,0x38,0x20,0x7C） |
| plain_out.txt | 535 | **535** | 仅 `535 | ` |
| sep18_out.txt | 529 | **529** | 仅 `529 | ` |

**rc == 毒字节数，逐一相等，零杂字节。** 竞争假设全部被该指纹淘汰：

- 「outBytes 缓冲整体被毒后 scan」：0xDD≠0，scan 会一路扫到 cap=8MB，输出应为
  8MB 毒——与 68/535/529 不符，排除。
- 「wrapper 跳过初始化/段错位（双 main 补丁）」：内容会是 BSS 零或堆垃圾混合
  值，不会是整齐 0xDD 填充，排除。
- 「ORC 双释放/别名」（D 假设）：现场无 `cheng_quarantine` UAF abort（exit 70）、
  无 `cheng_orc_release_failure`，毒形精确等于"单一合法释放 + 迟到读"，排除。

## 4. 形态依赖的真相（A/B/C/D 假设裁决）

- **A（trampoline 生命周期）— 否**。wrapper/entry bridge
  （`src/core/backend/primary_object_plan.cheng:74090`
  `PrimaryObjectPlanRegallocEntryBridgeBodyIr`：setCmdLine → register_line_map →
  entry → profile_flush）不触碰任何托管缓冲；它只是让 main 真正被执行。
- **B（reply 缓冲归属/寿命令牌丢失）— 部分为真但非本案机制**：归属确实在
  exe 形"丢"——但丢失点是 main 源码里的视图逃逸，不是编译器在边界丢证据。
- **C（--emit:obj+patch 双 main 错位）— 否**：补丁只改符号名（
  `.scratch/fh/patch_prog_main.py`，strtab 追加 + st_name 改写），且宿主形
  （q2_fetch_h，`.scratch/rev/rev_fetch_harness.c`）用同一补丁件全绿。
- **D（ORC 析构多跑）— 否**：见 §3 指纹淘汰。
- **形态依赖正解**：C 宿主形 C main 直调 `ssm1q_fetch_client_run`
  （harness :34），只读 `assembled_len/assembled_copy`（:41-55），**main 从不
  运行**，毒链从未执行；wrapper-main exe 形是唯一跑 main 的形态，于是"只死
  exe 形"。「削版对照排除 main 因素」的削版变量是 fetch/协议逻辑；凡展示
  reply 的变体都保留同一 str 尾链——**存活常量正是肇事句**。

## 5. 建议修法（最小，一处一行 ×2 文件）

视图换 owned 拷贝（lessons.md:248 钦定形状）：

```cheng
var text = strings.CloneStrRange(rawbytes.BytesToString(outBytes), 0, len)
```

- `src/tools/ssm1q_client_probe.cheng:1395`
- `src/tools/ssm1q_fetch_file_probe.cheng:1403`

`CloneStrRange`（strings.cheng:478，`NewStringAlloc`+拷贝）不携带源借边，临时
释放与之无关。未动手：任务约束源码改动只限编译器 runtime/trampoline 文件，
且当前树编译门对这两个文件所在形状有活跃红（§7），改了也无法当场验证——
交报告 + 建议补丁文本。跟进（编译器战役）：ownership 门应对
「@borrow_result 视图逃逸其基座临时语句」报错（非法形走门禁），而非静默毒。

## 6. 复现缺口（如实）

三臂夹具已落 `src/tests/`（可编译即自动出判决：退出码 = text 首字节，
0xDD=221 毒 / 72='H' 完好）：

- `src/tests/exe_dd_repro_viewexpr.cheng` — 复现臂（SliceBytes 视图逃逸）
- `src/tests/exe_dd_ctrl_clonerange.cheng` — 对照臂 A（CloneStrRange owned 拷贝）
- `src/tests/exe_dd_ctrl_namedbase.cheng` — 对照臂 B（命名 owned 局部再取视图，
  剥离"临时释放"变量）

被两个独立红灯挡住：

1. **repo 根 `./cheng`（7/16 baked）已死**：两行金丝雀
   （`src/tests/ordinary_zero_exit_fixture.cheng`）system-link-exec 烤制 rc=0
   但 exe 运行 rc=139（SIGSEGV）；无缓存配方下构建器本体 rc=132（SIGILL）。
   老驱动不得用于归因（纪律 3）。
2. **当前树唯一当代驱动是 kernel lane 的插桩 knife**（
   `.rebuild/s1b_step3/r9/kd_orcd10`，orcd10_knife 克隆，金丝雀双 run_rc=0）：
   三臂在其 typed-expr/parser 门被拒（签名见下 §7）；且已知绿的
   `src/tests/_probe_orc_double_drop_regression.cheng` 在其下运行期
   `cheng_orc_release_failure code=registry_miss` + ORCMISS 探针打印
   deref16 全 0xDD——当前 HEAD（或 knife 组合）存在活的 ORC/typed-expr 红，
   编译级与运行级复现均不可归因。插桩驱动不滚雪球，按缺口交付静态归因。

## 7. 顺带发现（交编译器战役 / r9 线）

当前树对「std @borrows/@borrow_result 局部 str 进入后续表达式」存在
typed-expr 红，复现件与构建日志全留档（`.scratch/exe_dd_triage/*.build.log`）：

- 签名 A：`typed expr: call declaration static argument type unavailable
  name=echo/ConcatStr args="…" + strings.IntToStr(Int32(text[0]))`——三个臂
  （SliceBytes / CloneStrRange / 命名临时+SliceBytes）全灭，证明红覆盖大于
  borrow_result 视图本身。
- 签名 B：去掉表达式后 `let firstI: int32 = Int32(text[0])` 形态落在更早的
  `parser receipt: normalized expression parser node missing kind=5` 红。
- Sep 19-20 树能编译完全同形的探针（q2_fetch_new/q2f 系列在证）⇒
  Sep 20 树演进引入回归（r9/r10 注解位移事故家族嫌疑），它同时挡住本案
  probe 的重编——修复该红后，§6 三臂即可出 221/72 判决，自动闭环本案权威验证。

## 8. 证据清单

| 面 | 路径 |
| --- | --- |
| 毒值语义 | `src/core/runtime/program_support_backend.cheng:1834/:2025-2070/:2069/:1820-1821` |
| 肇事句 | `src/tools/ssm1q_client_probe.cheng:1395-1397`、`src/tools/ssm1q_fetch_file_probe.cheng:1403-1405` |
| 视图/临时实现 | `src/std/strings.cheng:505/:186`、`src/std/system.cheng:422/:2831/:2843`、`src/std/rawbytes.cheng:128` |
| 库合同在案 | `lessons.md:248`（2026-07-26）、`:260`（默认 move） |
| entry bridge | `src/core/backend/primary_object_plan.cheng:74090` |
| 现场输出 | `.scratch/rev/{new_out,plain_out,sep18_out}.txt`（指纹计数见 §3） |
| C 宿主形不跑 main | `.scratch/rev/rev_fetch_harness.c`（:34 直调 fetch、:41-55 只读 assembled） |
| 双 main 补丁 | `.scratch/fh/patch_prog_main.py` |
| 三臂夹具+金丝雀 | `src/tests/exe_dd_{repro_viewexpr,ctrl_clonerange,ctrl_namedbase}.cheng`、`src/tests/ordinary_zero_exit_fixture.cheng` |
| 构建/失败日志 | `.scratch/exe_dd_triage/`（arm1-3、canary*、orc_probe） |
| 现象登记 | `results/reverse_transfer.md` §2/§遗留① |
