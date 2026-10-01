# parser merge/绑定层幽灵零槽——根修交付（判词 50 配套）

日期：2026-09-10。基线提交：实验主烤制基=67b8c8b7b（patch 锚区在现行
HEAD c5583ec14 上 git apply --check 通过+字节回程对拍一致）。载具
stage3 sha=05af823e…（禁重烤，未动）。主树 src/** 本席零写入；全部
实验在 disk_guard 租约的 scratch 克隆树（git archive HEAD）内完成。

## 结论先行

1. 判词 48 打开的通道属实，但 HEAD 冷链在纯 driver 路径上又横着两堵
   已提交的硬化墙，任何语料在 48-66s 内被杀，parser 幽灵层代码根本
   得不到执行：
   - 墙 #1：`cheng_str_managed_record_validate` 对「data 非空 + len=0」
     一律 panic，而 C 车头对 `""` 字面量的文档化 ABI 恰是该表示
     （cheng_cold.c:34370 注释自证）。本席已根修（V1 patch）。
   - 墙 #2：`system-link-exec` 入口无条件开 1GiB allocation ledger
     会话，启动期 terminal guardian 恢复用 libc list_dir 扫 journal
     目录，被 ledger `forbid_untracked_provider` 硬杀 rc=70。属冷链线
     协议设计决策，本席不停留，移交（见文末）。
2. 分配的幽灵根修（E1）：NormalizedExprLayerMoveInto 的
   move-steal+整体 record reset 形状按任务书候选方向改为「源侧安全
   detach」，语义合同全保留。全 CLI 烤制绿。
3. 幽灵运行期行为验证（阶梯②③④的 driver 侧）被墙 #2 阻断——纯
   driver 在 HEAD 上无法启动编译。已在 stage3 链补 rsi_contract 冒烟。

## 交付物（本目录）

- `parser_ghost_moveinto_detach.patch`（36 行，E1）
  仅含 src/core/lang/parser.cheng:2942 一处形状变化。
- `runtime_str_abi_validate_contract.patch`（22 行，V1）
  仅含 src/core/runtime/program_support_backend.cheng validator 合同收敛。
- 两 patch 均通过：git apply --check（现行 HEAD）+ apply 后
  cmp 字节回程对拍一致。
- apply：`git apply <patch>`（基线 c5583ec14 或其后未动锚区的提交）。

## E1：MoveInto 源侧 detach（分配的幽灵根修）

根因行级定谳（HEAD parser.cheng:2922-2942）：
`NormalizedExprLayerMoveInto` 先把 7 个句柄/标量 steal 进 `out`
（:2934-2941），再 `layer = NormalizedExprLayer()`（:2942）整体
record reset。该形状 = 默认构造值返回 + record 拷贝，正是判词 30/32
定谳的「struct 按值返回/拷贝误编译家族」双 hazard 面：
(a) reset 的释放路径若按 cheng_seq_free（refcount 盲裸释放，psb:7285
    实证无 refcount 检查）落码，已移交共享的 exprs/scopes payload 被
    real free → 悬垂 → 后续 drop-glue/validate 读到已腐坏元素；
(b) 全零记录的 store 若落错址，即产出全零幽灵槽（指纹 kind=If(序数 0)
    /line=0/str 全空——NormalizedExprIf 恒为枚举首元素，全零槽读作 If）。

修法（任务书候选方向「steal 后源侧安全 detach 的合法形状」）：
reset 改为逐字段 detach——7 句柄移交后，源侧 seq 头直接清零
（len/cap/buffer=nil，语义等价于「所有权已完全移走、源侧永不再释放/
写碰」），valueExprTree=nil、lease=false。此后无论源 record 如何被
释放都是 no-op，(a)(b) 两个 hazard 面被构造性消除。
语义合同全保留：alias 探针（DescriptorsAlias）、重复 owner 守卫、
destination release receipt（先算后偷，次序不变）、borrowed 元数据
提交合同（CommitBorrowedMetadata 未动）。

同族备忘（本席未动，供后续单变量实验）：
- `NormalizedExprLayerCommitBorrowedMetadata`（:2944-2970）末尾
  `staged = NormalizedExprLayer()` 是同构 steal-then-reset 形状；
- `NormalizedExprLayerTerminalReleaseWithReceipt`（:3060-3083）末尾
  同形状，但其前 freeSeq 已把句柄置空，hazard 面较小。
两处脚本化改写已验证机械可行（anchor 唯一+count 校验），如需同批
根修可复用本目录 `rewrite_e1_moveinto_detach.py` /
`rewrite_v1_str_abi_validate.py` 的方法（脚本用法：python3 <script>
<目标文件绝对路径>，assert 锚唯一+替换后 count 校验）。

## V1：str ABI 合同对齐（墙 #1 根修，附带交付）

三级证据链：
1. 发射器合同（C 车头，bootstrap/cheng_cold.c:34370-34376 注释原文）：
   每个 str 字面量（含 `""`）发布「只读 NUL 边界 payload」——`""` 即
   一个孤立 NUL 字节；"silent NULL is a miscompile"。canonical
   (nil,0) 只由零值 store（codegen_store_empty_str）发射，永不由
   STR_LITERAL 发射。
2. 反汇编铁证（E0 driver，lldb）：os.AtomicTreeTerminalRecoveryLock
   OwnerAcquireInto 内 `""` 常量物化为 `adr x0, 0x100051494; b .+8;
   udf #0`——data 指向自身函数体内联零 blob，len=0，flags=0。
3. 运行时自证：cheng_str_store_slot 对非 owned 记录本就原样放行
   （psb:2447-2451 的分支为 len=0 borrowed 显式留了通道），唯独
   validator 的 `s.len <= 0 || data < 65536 → panic("invalid data")`
   比发射器+store 两处合同都严。
触发链（每次 driver 运行必炸，46-66s）：
`AtomicTreeTerminalRecoveryLockOwnerAcquireInto` 的 `err = ""` 槽
跨界传入 C 桥 → cheng_atomic_tree_clear_error（psb:10307）→
cheng_str_store_slot → validate(prev={text-ptr,0,0,0}) → panic →
exit(1)。lldb validate 入口断点第 4 次命中记录
{data=0x100051494(自身 text), len=0, store_id=0, flags=0}。
V1 收敛：非 owned 静态空视图（len=0, data≥65536）合法；owned 空记录
必须 canonical (nil,0)（否则 panic）；负长度/nil+非零长/wild-page/
owned provenance 守卫一字未松。

## 实测阶梯（全 rc 实测，scratch 克隆树）

| # | 树态 | 全 CLI 烤制 | 语料（driver 链） |
|---|---|---|---|
| E0 基线 | worktree 快照原样 | rc=0 1092s sha 50037417… | trivial+三件全 rc=1「str managed store: invalid data」@46-66s |
| E1 | +parser E1 | rc=0 899s sha a794a73a… | 同 E0（此墙与 MoveInto 无关，符合预期） |
| F0 | worktree+V1 | rc=0 889s sha 738639c0… | 四件全 rc=70「allocation_ledger_libc_list_dir_provider_unsupported」@48s → 墙 #1 已破，暴露墙 #2 |
| F1 | 混合树（失误） | rc=2 @2s 未提交 typed_expr 调用未提交 parser 定义——混合树伪缺陷，弃 | — |
| F1b | git archive HEAD(67b8c8b7b)+V1+E1 | **rc=0 864s sha 26b3746d…** | 四件全 rc=70 同文 @57s → 墙 #2 在 HEAD 已提交，纯 driver 编译路径全灭 |
| S1 | HEAD+V1+E1（stage3 直编链） | rsi_contract 编译 rc=0（禁缓存 env），产物 7.8MB，运行 rc=0（139 断言活体） | V1 运行时回归面通过 |

- E1 对幽灵的运行期消除验证（原阶梯②）与 rsi_contract 寿命对拍
  （阶梯④ driver 侧）被墙 #2 阻断，如实未做。
- stage3 直编 minimal smoke 金标（V1 在树）：编译 rc=0 4s，运行 rc=0，
  输出 sha 1d740dcf…（与主树基线一致）。

## 墙 #2 移交包（冷链/csg production 协议线）

- 冲突双方（均为 HEAD 已提交）：
  入口会话 production_launcher.cheng:1307
  `CsgCoreProductionLauncherBeginHeldSystemLinkSessionInto`——
  argv[1]=="system-link-exec" 即无条件
  `RuntimeAllocationLedgerSessionOwnerBegin(1GiB)`；
  恢复扫描 merkle_store.cheng:4607
  `csgStoreTerminalJournalRecoverySelectNameInto` → os.ListDir →
  cheng_os_list_dir_bridge → psb:22269
  `forbid_untracked_provider` → abort rc=70。
- 完整帧链：main → CompilerMainProcessEntry(:8928) →
  CompilerMainRunProductionParentCommand(:8858) →
  RunPreparedSystemLinkExecParent(:1740) → RunAdmitted…ParentInto(:1490)
  → TerminalGuardianRecoverAllInto(terminal_guardian.cheng:136) →
  ProductionTerminalJournalRecoverInto(:9998) → RecoverNextInto(:4783)
  → SelectNameInto(:4607) → listDir。
- 定时：入口会话与 guardian 恢复都自 50d1ffeeb(2026-08-22) 共存；
  近期 ledger 硬化使二者由兼容转互斥。darwin 上
  RuntimeAllocationLedgerSupported 恒真、无 env 旁路。
- 后果：HEAD 上纯 Cheng driver 的 system-link-exec（唯一 AOT 编译入口）
  100% 在启动期 rc=70，任何语料到不了解析；stage3 链不受影响（C 车头
  无此 .cheng 启动路径），这解释了 gate/账本近期全绿而纯载具死锁。
- 需要设计决策（三选一，本席不代决）：恢复窗口豁免/恢复先于会话/
  tracked list_dir provider。
- 判词 42 的「gate 内 engineEmit events.log 间歇失败」与判词 41 的
  cdomain 同进程复跑异常建议按本墙+墙 #1 重新对表（同为纯 driver
  路径的载入态依赖缺陷族）。

## 环境教训（过程如实入档）

1. PATH 里的 `diff` 是 HarmonyOS 工具链假货
   （/Applications/DevEco-Studio.app/.../toolchains/diff），对相异文件
   报「相同」。本轮由此产生过两次误读（克隆树漂移误判、HEAD 快照
   误判）。对拍一律 cmp / /usr/bin/diff。
2. scratch 租约的 keeper 用 harness 后台任务承载时会被 harness 回收，
   租约随后被 prune 连目录整删（本轮丢失第一轮全部现场）。可靠形态=
   nohup+disown 的目录内脚本 keeper（argv 含目录路径过租约校验）。
3. 并行 kernel 线在飞编辑主树（本轮两次实测：worktree dirt 漂移、
   08:19:49 提交 10bd28c62）。克隆基一律 git archive HEAD 钉死并
   sha 存证；patch 生成后必须在现行 HEAD 重跑 apply --check。

## 复现配方（供复核）

```
TASK=<scratch dir via cheng_scratch_scope/cheng_disk_guard>
git -C /Users/lbcheng/cheng-lang archive HEAD src | tar -x -C $TASK/tree
python3 patch_v1_str_abi_validate.py $TASK/tree/src/core/runtime/program_support_backend.cheng
python3 patch_e1_moveinto_detach.py  $TASK/tree/src/core/lang/parser.cheng
cheng.stage3 system-link-exec --root:$TASK/tree \
  --in:$TASK/tree/src/core/tooling/compiler_main.cheng \
  --emit:exe --target:arm64-apple-darwin --out:$TASK/driver.bin   # ~15min
$TASK/driver.bin system-link-exec --root:$TASK/tree \
  --in:$TASK/tree/src/tests/rsi_minimal_smoke.cheng \
  --emit:exe --target:arm64-apple-darwin --out:$TASK/smoke.bin    # 现状 rc=70@墙#2
```
