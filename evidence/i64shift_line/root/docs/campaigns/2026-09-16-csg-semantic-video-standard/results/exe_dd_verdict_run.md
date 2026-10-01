# exe_dd_verdict_run.md — 0xDD 三臂判决夹具实跑（2026-09-20，驱动=08-31 冻结 cheng.stage3）

判词：**绿。三臂全部编译通过并出判决，CloneStrRange 修法与悬挂视图机制双双获运行时
实锤。一处字面差异如实登记：臂1 实测 139（SIGSEGV）而非报告预期的 221——归因=
0xDD quarantine 毒制度（ce469ed71，2026-09-03 入树）晚于 stage3 冻结件（08-31），
同一 UAF 在无毒制度运行时下呈崩溃形而非静默毒形；机制结论不受影响，「221 毒签名」
这一特定形态当前无驱动可复现（见 §4）。

## 1. 方法与驱动好用性

- 驱动：`artifacts/bootstrap/cheng.stage3`（Mach-O arm64，2026-08-31 04:26，
  3310144 B）。配方先例 `.scratch/fj_pc/fj_gate.sh`：darwin 直出
  `--emit:exe --target:arm64-apple-darwin`，**无需 ELF64 双 main 补丁**（那是
  ohos 交叉 obj 路径）；exe 形含 wrapper main 且 main 真执行——臂2/3 退出码 72
  只能由 program main 计算得出，自我证明。
- 金丝雀判活（先于一切判读）：`src/tests/ordinary_zero_exit_fixture.cheng`
  → compile_rc=0（unresolved_symbol_count=0）/ run_rc=0。驱动好用性基线绿。
- 产物纪律：全部构建产物在 `tools/cheng_scratch_scope.sh` scope 目录内随命令
  退出销毁；任务脚本 `.scratch/exe_dd_verdict/run_one.sh`；源码零改动；无 commit。

## 2. 判决矩阵（退出码原文）

| 臂 | 夹具（ff7014af3） | 形状 | 预期（triage §6：退出码=text 首字节） | 实测 | 判定 |
| --- | --- | --- | --- | --- | --- |
| 金丝雀 | ordinary_zero_exit_fixture.cheng | 两行 main | compile 0 / run 0 | compile_rc=0, run_rc=0 | PASS（判活） |
| 臂1 复现 | exe_dd_repro_viewexpr.cheng | SliceBytes 视图逃逸其基座临时 | 221（0xDD 毒） | compile_rc=0, **run_rc=139**（SIGSEGV 11，复跑再 139，确定） | 机制实锤 / 签名形差异登记 |
| 臂2 对照A | exe_dd_ctrl_clonerange.cheng | CloneStrRange owned 拷贝 | 72（'H' 完好） | compile_rc=0, **run_rc=72** | PASS 精确对齐 |
| 臂3 对照B | exe_dd_ctrl_namedbase.cheng | 命名 owned 局部再取视图 | 72（'H' 完好） | compile_rc=0, **run_rc=72** | PASS 精确对齐 |

三臂编译日志均 unresolved_symbol_count=0，运行 stdout 均为空（判决全由退出码承载）；
臂1 唯一 stderr 为 shell 的 `Segmentation fault: 11`，无运行时诊断输出。

## 3. 三臂判决的机制含义

- **臂2=72 ⇒ CloneStrRange 一行修运行时实锤**：owned 拷贝不携带源借边，基座
  8MB 临时释放后 `text[0]` 照读 'H'（0x48=72）。
- **臂3=72 ⇒ 毒化主体=表达式临时的语句末释放，实锤**：同一 SliceBytes 视图，
  基座绑定为作用域级命名局部（不在语句末释放）即完好——排除 SliceBytes 本身与
  wrapper trampoline。
- **臂1=139 ⇒ 悬挂视图 UAF 运行时实锤（崩溃形）**：与臂2/臂3 唯一差异=视图逃逸
  其基座临时；`Int32(text[0])` 同码在臂2/3 干净跑通，排除 str 索引 codegen 因素，
  崩溃被差分锁定在「读已释放基座」。
- 顺带证据：stage3（08-31）**接受**「std str 局部进表达式」全部三形状并出正确
  codegen——triage §7 的 typed-expr/parser 红确系 08-31 之后的演进回归（当代
  knife 拒、老驱动收），与该节推断一致。

## 4. 臂1 字面差异归因（139 vs 221，原样登记）

- 报告预期 221 的前提是运行时带 0xDD quarantine 制度（读为静默毒）。
- 该制度入树时间：`git log -S chengQuarantinePoisonByte -- src/core/runtime/
  program_support_backend.cheng` 唯一命中 **ce469ed71 2026-09-03**——晚于
  stage3 冻结（08-31）。stage3 运行时释放的 8MB 托管块不毒化、直接归还 OS，
  悬挂视图读即 SIGSEGV（大块释放的经典 UAF 崩溃形）。
- 结论：**机制（视图逃逸其已释放基座=UAF）不因驱动代差动摇；「0xDD=221 静默毒
  签名」形态当前无驱动可复现**——当代 knife 对该形状 typed-expr 门拒（triage §7
  在案），唯一能编该形状的 stage3 运行时无 quarantine 毒。补齐 221 形复现的唯一
  路径仍是 kernel lane 修复 typed-expr 红后用当代驱动重跑三臂（届时预期
  221/72/72）。
- 附注：臂1 夹具内注释「echo 打全 0xDD、rc(exit)=1」是 echo 瘦身前的残句，与
  报告 §6 权威判据（退出码=text 首字节，221 毒/72 完好）矛盾；本次按报告执行。

## 5. 证据清单

| 面 | 路径/原文 |
| --- | --- |
| 驱动 | artifacts/bootstrap/cheng.stage3（Mach-O arm64, 2026-08-31, 3310144 B） |
| 配方先例 | .scratch/fj_pc/fj_gate.sh（darwin --emit:exe + 金丝雀） |
| 任务脚本 | .scratch/exe_dd_verdict/run_one.sh（scope 生命周期内跑，产物即焚） |
| 毒制度入树 | ce469ed71 2026-09-03（git log -S chengQuarantinePoisonByte） |
| 夹具 | src/tests/exe_dd_{repro_viewexpr,ctrl_clonerange,ctrl_namedbase}.cheng @ ff7014af3 |
| 预期来源 | results/exe_dd_poison_triage.md §6 |
| 构建产物 | 全部在 cheng_scratch_scope.sh scope 目录，命令退出即销毁（退出码原文已录 §2） |
