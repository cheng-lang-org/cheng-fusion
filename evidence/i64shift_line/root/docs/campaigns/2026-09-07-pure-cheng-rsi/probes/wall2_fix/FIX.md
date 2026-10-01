# 墙 #2 根修交付：tracked list_dir provider——三因子互锁解除（判词 50③ 配套）

日期：2026-09-10。载具 stage3 sha=05af823e…（禁重烤，未动）。
主树改动=src/core/runtime/program_support_backend.cheng 一处
（patch：`tracked_list_dir_provider.patch`，46 行，对 9dd7a2bcd 与
04d39d084 的锚区均 apply --check 通过——两 HEAD 该区域同文）。
验证在 scratch 克隆树（git archive 9dd7a2bcd + 本 patch）完成，
主树 src 零实验写入；全程临时产物走 disk_guard 租约
（keeper pid 78458，目录 cheng-wall2-fix.wTnpoH，收尾已删）。

## 结论先行

1. 选型=**tracked provider 注册**（三候选中唯一不弱化任何一份合同）。
   修法：`cheng_os_list_dir_bridge` / `cheng_os_list_dir_free_bridge`
   不再「forbid + 裸 libc 指针跨界」，改为在 bridge 内部把 libc listing
   字节拷入 ledger 可见分配器（cheng_malloc/cheng_free）后交付——
   provider 从 untracked 变 tracked，forbid 站点在此边缘按事实移除，
   其余 forbid 站点（裸 ptr 版 cheng_list_dir、三个 thread provider）
   一字未动，全会话期照常武装。
2. 实测：三因子互锁**已破**。修复后 driver 的 system-link-exec 启动期
   在活跃 1GiB ledger 会话下完整通过 guardian 恢复路径（原 rc=70 死点
   的 os.ListDir 现正常返回），两次运行确定性通过，全程零
   `rc=70`、零 `allocation_ledger_libc_list_dir_provider_unsupported`。
3. 新暴露**墙 #3（平台门，预存，非三因子残留）**：held-exec bundle
   seal 平台检查只接受 Linux x64/a64（psb:25614-25618，
   memfd_create+F_ADD_SEALS 全 Linux 专属；darwin 探测返回
   DarwinA64 即拒）。driver 的 system-link-exec 在 darwin 上是恒定
   生产 parent 路径（compiler_main:8938-8968：argv[1]=system-link-exec
   必走 fork 协议；派发表的进程内 pure 路径不可达），故修复后启动期
   54s 死于 `production_launcher_e_held_bundle_seal` rc=1（修复前同
   入口 48-57s 死于 rc=70）。darwin 上「driver 编语料到产物」被墙 #3
   封死，属 held-exec 生产协议的平台设计决策（与判词 50③ 同性质），
   本席按合同移交冷链线，不代决不绕过。
4. 阶梯⑤绿：stage3 链 rsi_contract 编译 rc=0（3.25s，产物 7.9MB，
   S1 金标 7.8MB 吻合）+ 产物运行 rc=0（assert 全过静默语义，
   stderr 空）。
5. tip（04d39d084）另有**预存烤制破损**：bd149df96（kernel goal2
   closure integration）使 `CompilerVerifyX86RemoteHost` 的 str[] 字面
   量 element=2 借用形状触发 verdict-48 冷链门禁
   （`str[] literal borrowed element requires an explicit owned value`，
   探针 bd149df96 rc=2 @3s 实证；9dd7a2bcd 无此破损）。本席基线钉在
   任务指定的 9dd7a2bcd，破损移交 kernel 线。

## 三因子因果重述（修复前，判词 50③ 在案事实）

1. 入口：driver argv[1]=="system-link-exec" 即无条件开 1GiB
   allocation ledger 会话（production_launcher.cheng:1302-1311，
   `RuntimeAllocationLedgerSessionOwnerBegin(1073741824, …)`）。
   begin core 硬性要求进程堆基线为零（psb:21061-21066 注释自证
   "heap, registry, and probe baselines are all exactly zero"）——
   这封死「先恢复后开会话」的重排路径：恢复本身要分配
   （ListDir 名字表、journal 字符串），会话若后开必撞非零堆。
2. 恢复：启动期 guardian 恢复是每次 system-link-exec 的必经路径
   （production_launcher.cheng:1549 →
   production_held_exec_terminal_guardian.cheng:136 →
   merkle_store.cheng:4607 `csgStoreTerminalJournalRecoverySelectNameInto`
   → os.ListDir），扫描 terminal journal 目录。
3. 拒止：os.ListDir → `cheng_os_list_dir_bridge`（psb:22268）→
   `forbid_untracked_provider` → 会话活跃即 abort rc=70
   （"allocation_ledger_libc_list_dir_provider_unsupported"）。
   forbid 的真实事实基础：libc_list_dir 的结果缓冲是 raw_libc_malloc
   的 C 堆内存，经 `cheng_os_list_dir_free_bridge` 以 c_free 释放——
   未跟踪内存跨越 provider 边界进出，ledger 无法对它记账。

三者在 48-57s 处互锁：会话①活跃使③武装，②必经③把守的边缘，
任何语料到不了解析。

## 选型论证：为什么不弱化任何一份合同

**候选 A 豪免名单（恢复窗口旗标放行）——否**。需要在 forbid 边缘
引入可变全局旗标，任何后续代码置位即可放行裸 libc 跨界；供应链事实
合同从「绝对事实」弱化为「旗标条件事实」，且未修复的 untracked 内存
继续在账本视野外流动（事实被压制而非消除）。等价进程内 env 后门。

**候选 B 初始化重排（恢复先于会话）——否**。结构上不可行：
begin core 硬性要求零堆基线（psb:21061-21066），恢复自身分配
托管字符串，重排后要么 begin 硬失败、要么放松零堆检查——后者使
1GiB 内存证据不再覆盖进程入口起的完整堆，合同①被直接弱化；
且恢复的位置在协议上承载「root owner 已签发后才可恢复」的
owner 移动链（production_launcher:1539→1549），上移即重构
guardian 准入协议，合同②承受无收益风险。

**候选 C tracked provider（本席采用）——三合同全保**：
- 合同①（ledger 会话=1GiB 内存证据）：入口会话原样（同点位
  compiler_main:8943、同 1GiB、同零堆 begin）。listing 字节现经
  `cheng_allocation_ledger_allocate_locked` 入账——会话活跃时
  cheng_malloc_locked 直通 ledger slab（psb:5978-5986），分配事件、
  live 计数、1GiB 预算全覆盖。证据面严格变强：原状态是整进程被杀、
  合同不可证；现状态是 provider 字节在证据内。
- 合同②（guardian 恢复=崩溃恢复合同）：恢复调用点位、时序
  （root owner 签发后、任何新 admission 前）、durable journal 语义
  逐字节未动；同一 os.ListDir 现返回 tracked 字节而非 abort。
- 合同③（forbid_untracked_provider=供应链事实合同）：合同的事实
  内容是「会话期无未跟踪内存跨界」。修复前该 provider **违反**此
  事实故被拒；修复后跨界载荷即 cheng_malloc/cheng_free 产物，
  事实不再被违反，forbid 在此边缘移除是因为它守护的条件已不存在。
  合同本体无旗标、无窗口、无 env：裸 ptr 版 list_dir 与三个
  thread provider 照旧武装；且 psb:6067-6069 的
  `allocation_ledger_cross_domain_free` + 6051-6053
  `duplicate_or_untracked_free` 仍会对任何真正 untracked 指针
  硬失败——tracked 方案自带 enforcement，放行面为零。

## 改动（patch 全文见 tracked_list_dir_provider.patch）

`cheng_os_list_dir_bridge_export`（psb:22267-）：bridge 内完成
libc listing → cheng_malloc 拷贝 → c_free 原始缓冲，跨界指针必为
tracked 产物；`cheng_os_list_dir_free_bridge_export`：c_free 改
cheng_free（非 tracked 指针在会话期被 6051-6053 硬拒）。
两处 forbid 随事实移除。nil 传递、空目录、NUL 终结字节语义与
原实现逐字节对齐；会话外路径行为不变（cheng_malloc 即普通分配器）。

## 实测阶梯（全 rc 实测，克隆树=9dd7a2bcd+wall2，psb sha 20438359af2ff216）

| # | 项 | 结果 |
|---|---|---|
| ① | 全 CLI 重烤纯 driver（stage3 编 compiler 闭包） | **rc=0**，878s，driver.bin 196,545,632B sha256_16=7e03cc4b1bb68be9 |
| ② | driver system-link-exec 编 rsi_minimal_smoke | rc=1@54s（修复前 rc=70@48-57s）——**原死点（guardian 恢复 ListDir@活跃会话）确定性通过，余下失败=墙 #3 seal 平台门**（详见下） |
| ②' | 二次运行（对首次残留 journal 做真实恢复） | rc=1@54s 同文——恢复路径会话期两次实证通过；全程日志零 rc=70/零 forbid 字样（grep 计数=0） |
| ③④ | 语料产物运行/幽灵终验 | **BLOCKED@墙 #3**（darwin 无生产 fork；本机无 Linux 运行时，colima 无实例；不起 VM 不属本席授权） |
| ⑤ | stage3 链 rsi_contract 编译+运行 | 编译 **rc=0**（3253ms，7,909,024B，sha256_16=4fbf300d32dc7de2），运行 **rc=0**，stderr 空（assert 静默通过语义） |

墙 #3 证据链：`production_launcher_e_held_bundle_seal`
（production_launcher.cheng:1604）← `RuntimeHeldExecParentSealBundleOwner`
返回 -1 ← `cheng_held_exec_parent_seal_bundle_raw` 首检平台
（psb:25614-25618，仅 LinuxX64/LinuxA64；darwin=DarwinA64 拒；
memfd_create/F_ADD_SEALS 无 darwin 等价物）。driver 的
argv[1]=system-link-exec 恒入生产 parent（compiler_main:8938-8968），
派发表 8802 的进程内 pure 路径在该入口下不可达。
移交判据：darwin seal 替代机制或「生产入口=Linux 专属」的显式
声明，由冷链/csg production 协议线决策。

## tip 破损备忘（非本席域）

- bd149df96 起全 CLI 烤制 3s 即 rc=2：
  `str[] literal ownership body=CompilerVerifyX86RemoteHost element=2 …
  borrowed element requires an explicit owned value (recovery=0 depth=2)`
  ——bd149df96 前端改动使旧远程验证体的 str[] 字面量暴露借用形状，
  触发 verdict-48 add-借用源同族门禁。修法按判词 48 配方
  （share()/owned 拷贝），kernel 线域。
- 04d39d084 之上主树工作区仍有并行线脏改，本席 patch 已按两 HEAD
  锚区 apply --check 双验，落地不受影响。

## 资产（本目录）

- `tracked_list_dir_provider.patch`（46 行，唯一 src 改动）
- `logs/bake_9dd7a2bcd_wall2.log`（阶梯①全量输出+哈希钉）
- `logs/driver_corpus_attempts.log`（阶梯②两次运行全量输出）
- `logs/stage3_rsi_contract.log`（阶梯⑤全量输出）
- `logs/{verify_smoke,verify_ghost,verify_contract}.sh`（复现脚本；
  verify_ghost.sh 为墙 #3 解除后的幽灵终验现成配方）

## 复现配方

```
TASK=<scratch dir via cheng_disk_guard 租约>
git -C <repo> archive 9dd7a2bcd src | tar -x -C $TASK/tree
git -C <repo> show 9dd7a2bcd:cheng-package.toml > $TASK/tree/cheng-package.toml
cd $TASK/tree && git apply <repo>/docs/campaigns/2026-09-07-pure-cheng-rsi/probes/wall2_fix/tracked_list_dir_provider.patch
<repo>/artifacts/bootstrap/cheng.stage3 system-link-exec --root:$TASK/tree \
  --in:$TASK/tree/src/core/tooling/compiler_main.cheng \
  --emit:exe --target:arm64-apple-darwin --out:$TASK/driver.bin      # rc=0 ~15min
$TASK/driver.bin system-link-exec --root:$TASK/tree \
  --in:$TASK/tree/src/tests/rsi_minimal_smoke.cheng \
  --emit:exe --target:arm64-apple-darwin --out:$TASK/smoke.bin       # 现状 rc=1@54s@墙#3（修复前 rc=70@墙#2）
```
