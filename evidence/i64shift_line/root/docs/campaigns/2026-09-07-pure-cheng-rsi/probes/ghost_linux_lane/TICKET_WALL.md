# 第六门=terminal ticket 交接墙——帧链+假设实验矩阵+修法论证（判词 59）

日期：2026-09-11。基线：PIN=b6b4816e4（判词 56 重做域；27313f66 烤绿同源）。
载具：ghostx64（colima x86_64 TCG）；stage3 05af823e 未重烤。

## 一、墙现场（判词 57 遗留，2/2 确定性）

生产入口第五门（store head lease）后，pre-exec producer 封装
（339MB envelope，TCG ~48min@99.9% CPU）后：

```
子进程 entry: HARD_RED:production_held_exec_ticket_import_failed   # child import != 1 (== -1)
父:           HARD_RED:production_launcher_parent:held_exec_parent_claim_invalid  # BeginClaim errcode 9
父 teardown:  production provider started without terminal CloseReady
stdout 空 = 语料编译未始
```

## 二、帧链（生成侧/消费侧全读）

生成侧（父）`cheng_held_exec_parent_begin_claim_linux_export`
（psb@b6b4816e4 29xxx）：

```
retained verity measure → launcher identity(/proc/self/exe vs 固定路径
+verity) → 输出路径绝对+摘要 → 会话槽 → dup(retained) CLOEXEC →
socketpair(AF_UNIX,SOCK_SEQPACKET)+双端 SO_PASSCRED 回读 →
argv=build_child_argv(arg0=nativePath, 其余透传) → fork →
子: dup2(sock,198)/清 CLOEXEC → execveat(retainedFd,"",AT_EMPTY_PATH) →
父: pidfd_open → poll(通道+pidfd) 收 claim → claimOk 十合取
(status/pid/nonce/header/argvDigest/envDigest/wirePid/exeDigest/
 childImage(fstat 四元组 vs retained)/claimDigest) →
child_birth_capture(/proc/<child>/stat state 必须活) →
任一败 ⇒ reap+ClaimInvalid(9)
```

消费侧（子）`cheng_held_exec_child_import_export`（同文件 26336-26630）：

```
F_GETFD(198)<0 ⇒ return 0（普通进程, 不打印）→
平台∈{x64,a64,darwin}+SEQPACKET ⇒ 否则 -1 → 熵 32B →
argvDigest(自身 argv)/envDigest(空 env 常量)/
selfImage(/proc/self/exe vs nativePath 身份+verity measure) ⇒ 否则 -1 →
发 claim(kind=1,nonce 自熵) → CAS capsule row →
收 activate(kind=2+3×SCM_RIGHTS) → 校验(header/claimDigest 绑定/
parentPid=SCM_CREDENTIALS/exeDigest/outputPath/bundle/ownerClaim 摘要/
父镜像(/proc/<ppid>/exe vs launcher 路径身份+verity)) ⇒ 否则 -1 →
bind owner → bundle 内容/尺寸/seal 复证+finished/decision fd 形状 ⇒ -1 →
CAS Issued ⇒ 成功 return 1
```

父端 claim_invalid 的三条可达路：①子死于 claim 前（poll 只见 pidfd
HUP）；②子死于 claim 后 activate 前（父收到 claim 但 childImage 对
zombie 必败——/proc/<zombie>/exe 无链接）；③birth capture 失败。
②③两条路子的 stderr 顺序相同（先子后父），外部不可分辨 → 分支级
探针（ticket_wall_probe.py，15 patch/41 标记，克隆树 only）。

## 三、假设矩阵（按可能性排序+实验判决）

| # | 假设 | 判决实验 | 结果 |
|---|------|---------|------|
| H1 | 生成-消费不对称（argv/env/exe 摘要两侧不一致） | TW_P_ARGV/ENV/EXEDIG | **排除**（腿2: TW_P_CLAIM_OK 十合取全过） |
| H2 | 路径/权限/env 缺口（安装面/lease 链/verity） | 单腿推进逐门 | **实锤一层: store policy -20 = ~/.local 775 组写位被 directory_identity_allowed 拒（setup 缺口，非本墙本体）** |
| H3 | 时序（zombie 竞态使 childImage 必败） | TW_P_CHILDIMG | **排除**（TW_P_CLAIM_OK 含 childImage 过=子活） |
| H4 | 真 bug（wire 布局/SCM/fd 形状） | TW_C7* 家族 | 收敛中 |
| H5 | child_birth_capture（claim 后父端/proc stat 采集） | TW_P_BIRTH_OK/FAIL | **腿2 定位: TW_P_BIRTH_FAIL=唯一失败点** |

## 三.5、腿 2 探针帧链（probe driver 1e1d166db57f1bbe，小根单腿 ~55min）

```
TW_C0_NOFD            # 父进程普通入口（fd198 无, import=0, 合同正常）
TW_C_CLAIM_SENT       # 子: 全部 pre-claim 检查过, claim 已发
TW_P_RCV_OK           # 父: claim 收到
TW_P_CLAIM_OK         # 父: 十合取全过（argv/env/exe/childImage 全对）
TW_P_BIRTH_FAIL       # 父: child_birth_capture != 1  ← 墙本体
TW_C7_GOTACTIVATE     # 子: recvmsg 返回（父 birth 失败关 socket 触发）
TW_C7A_RECV           # 子: activateReceive.status != 1（EOF 回声）
HARD_RED:production_held_exec_ticket_import_failed      # 子打印, exit 2
HARD_RED:production_launcher_parent:held_exec_parent_claim_invalid  # 父
production provider started without terminal CloseReady  # 父 teardown panic
```

**两侧报错全是下游回声；唯一原发失败=父端 child_birth_capture。**
该桥三步（pidfd fstat dev/ino→/proc/<pid>/stat 读+EOF→字段 4..22 解析
+state 活性分类）在 VM 内 python 逐条复刻全过（pidfd dev=15 ino 非 0、
start_ticks=780904、state R→class 1），说明失败依赖真实 driver 上下文
（线程/fd 表/execveat 子进程），需二级探针（TW_PB_* 家族，含路径/raw
stat 转储/fd 计数）单腿定谳。

**机器码映射澄清**（曾误判 fstat 偏移反了）：machineCode 1=x86_64、
2=aarch64（cheng_host_linux_machine_code 按 uname machine 分派），
x86_64 mode@24 正确——fstat_directory_identity/scalars 的 mode 偏移
对 x86_64 无误，腿 1 的 -20=775 组写位被真 mode 组写位检查正确拒绝。
遗留潜伏缺陷（不在终验面，如实记录不修）：fstat_scalars/fstat_identity
的 aarch64 sizeOffset=48 应为 40（asm-generic stat st_size@40）、
fstat_nlink 的 aarch64 u64@16 读到 mode+uid、x86_64 u32@20 读到 nlink
高位恒 0（应 u64@16）；均无 x86_64 终验路径消费者。

## 四、setup 缺口层（已在配方落地修复）

- 判词 57 层：~/.local/share/cheng/csg-core 须预存 0700（runtime 只自建
  cheng 层，open_or_create_private_child 对 .local/.share create=false）。
- 判词 59 新层（腿1 实测）：umask 002 下 mkdir -p 产 775（组写位）→
  `cheng_host_directory_identity_allowed` 的 groupWorldWrite 检查拒 →
  `os_persistent_user_data_root_failed:-20`（.local 段）。
  **修法=配方**（vm_ghost_finale.sh/tw_leg.sh）: `umask 077`+
  `mkdir -p ~/.local/share/cheng/csg-core`+`chmod 700` 全链四段。
  代码零放宽（私有目录合同保持原样）。

## 五、腿 3 二级探针判决（probe v2 driver 31a83ef5aadb5039）+ 根因定谳

腿 3 新帧（birth 桥内部）：

```
TW_PB_FSTAT dev=000000000000000f ino=0000000000000422   # pidfd fstat 过
TW_PB_PATH /proc/1621/stat|                             # 路径对
TW_PB_PARSE_FAIL stat=
1621 (csg-core-native) S 1570 1570 1570 0 -1 4194304 62 0 0 0 1 1 0 0 20 0 1 0 1368954 338407424|
TW_PB_IDENTITY_FAIL → TW_P_BIRTH_FAIL
```

stat 内容完全正常（field 22 starttime=1368954 完整在界内），解析器源码
+VM python 复刻+str 版微探针三方全过——矛盾锁定在 **ptr 形（uint8[4096]
栈缓冲+cheng_ptr_plus+UInt8Ptr 解引用）的同一段循环**。ptr 版微探针
（全树烤制，同 stage3 载具）同输入**确定性失败：`fail: overflow
field=4`（value=1570 即"溢出"）**。

### 根因 = stage3 现行 codegen 的 u64 除法误译 × crl 溢出守卫

形状探针（tw_overflow_probe，VM 实测）：

```
T2 const_sub= -1                    # 减法正确（0xFFFFFFFFFFFFFFFF）
T1 const_sub_div= 0                 # 2^64-1 / 10 → 0（应 1844674407370955161）
T3 inline_sub_div= 0                # 同
T4 loop_spurious_overflows= 8/10    # 与 driver 行为逐位吻合
T5 named_const_sub_div= 0
```

**stage3 把 `uint64 / uint64(10)` 发成有符号 int64 除法**：高位置位值
0xFFFFFFFFFFFFFFFF 按有符号 = -1，(-1)/10 = 0 → 解析器溢出守卫
`value > (uint64(18446744073709551615) - digit)/uint64(10)` 恒真 →
`/proc/<pid>/stat` 解析在第一个字段即假性"溢出"返回 false →
child_birth_capture 必败 → begin_claim 报 ClaimInvalid(9) → 父关
socket → 阻塞中的子 import 收 EOF → 双侧报错（ticket 墙全部表症）。
该 Linux 终端路径（birth capture）在 ghost lane 之前从未真实运行过，
故幽灵潜伏至今。归 kernel/C 车头 emitter 战役（判词 30 家族新证据：
u64 除法 → 有符号除法误译，最小复现=tw_overflow_probe.cheng）。

### 根修（生产级，无除法精确等价，无合同放宽）

`core_runtime_provider_linux.cheng` `cheng_linux_terminal_proc_stat_identity`：

```cheng
# UINT64_MAX = 10*1844674407370955161 + 5，故 value*10+digit 溢出 ⟺
# value > 1844674407370955161，或 value == 1844674407370955161 且 digit > 5
if value > uint64(1844674407370955161):
    return false
if value == uint64(1844674407370955161) && digit > uint64(5):
    return false
```

语义等价证明：digit≤5 时原阈值=floor((MAX-d)/10)=1844674407370955161，
第一条件恰同；digit≥6 时原阈值=1844674407370955160，第二条件补上
value==1844674407370955161 的精确边界。判定产物（false 返回）不变。
主树直落（crl 开工/落盘双核干净）+ lane 钉 tree 走
`ticket_wall_fix.patch`（23 行，apply --check 过）。

**machineCode 映射澄清**（曾误判 fstat 偏移反了）：machineCode 1=x86_64、
2=aarch64（cheng_host_linux_machine_code 按 uname machine 分派），
x86_64 的 mode@24 偏移无误，腿 1 的 -20=775 组写位被真 mode 检查正确拒绝。
遗留潜伏缺陷（不在终验面，如实记录不修）：fstat_scalars/fstat_identity
的 aarch64 sizeOffset=48 应为 40（asm-generic stat st_size@40）、
fstat_nlink 的 aarch64 u64@16 读到 mode+uid、x86_64 u32@20 读到 nlink
高位恒 0（应 u64@16）；均无 x86_64 终验路径消费者，移交冷链线备案。

## 六、修复验证与门 4 间歇时间线（全部 rc 绑定,VM 时刻为 TCG 慢钟）

| 腿 | driver | 结果 |
|----|--------|------|
| 4 | driver_fixed 3a5987129deec296（crl 守卫修,无探针） | **identity 过、birth/activate 过**,推进至 `production_terminal_capsule_finished_readback_invalid`=ticket 墙已破、子侧仍有失败 |
| 5/6 | probe3 cb6b7c7b（探针,无 fix） | identity 门炸（`inode_immutable_missing`）→ 引出门 4 配方缺口 |
| 7 | probe3+chattr | `install_native_failed`（上一腿 immutable 挡 rm）→ 配方补 chattr -i 生命周期 |
| 8 | probe4 c0f91aac（fix+psb_min 粗探针） | identity 过→净 store 需求暴露（脏 journal `canonical record invalid`） |
| 9 | probe4（净 store） | identity 门挂（同 driver 腿 8 过）→ 门 4 非确定性实锤 |
| 10/11 | probe3 | identity 挂×2（leg 9 起门 4 连挂,VM 长驻态;colima restart 后 leg 11 **过**） |
| 11 | probe6 a24739bb（fix v2+细探针） | **TW_C_CLAIM_SENT→TW_C7_GOTACTIVATE→TW_C_OK**（role→槽映射修后子 import 全过!）子随后撞域 E 阶段一设计边界 `system_link_plan_production_build_requires_claimed_lease` |
| 12 | probe5 fa6d2d78（fix+细 C8 探针） | identity 挂一次→重试过→**TW_C8F_DECISION_FSTAT size=0 mode=0** 钉死 role 5→槽 4 映射缺陷 |

**门 4（identity）间歇定谳**：kernel 态恒 `0x180010`（i+e+V 全在,lsattr/ioctl 双验）,
driver 运行中 ~50% 读缺;colima restart 后首轮即过=VM 长驻态相关（疑似 icache
逐出/fs 可见性竞态）,机制移交冷链线;配方处置=`chattr +i` 钉持久位+有界重试
（5 次,门仍真实重跑,不跳门）+重试前清 store（panic 残留 journal 实证会炸
后续腿）。

## 七、终验判决（runall host_runall_20260911_192522.log + finale 重跑）

配置：PIN=b6b4816e4 + bake_unblock_verdict48.patch + ticket_wall_fix.patch
（crl 溢出守卫 + host_runtime role→槽映射双修）;driver 烤制 rc=0
339,061,488B sha256_16=3f85ee64adafe5d0（与腿 4 的 3a598712 差=use_begin
映射修,构成确定性双互证）;precheck 交叉编 rc=0（ELF x86_64）。

**判决（如实）**：
1. **判词 30 幽灵指纹族零再现**——七族指纹（prebound statement root/scope
   owner missing/invalid data/body missing/rc=70/held_bundle_seal/
   linux_x86_64_required）全部 12 腿生产入口深跑（含 ticket 墙前与破墙后）
   grep=0。幽灵本体已灭。
2. **ticket 墙（第六门）已破**——破墙证明=腿 4（无探针修复 driver
   3a598712,identity 过后直达 terminal capsule finish 读回=已过 ticket 墙）
   +腿 11（probe6 a24739bb,VM 重启后）的 TW_C_OK 显式实证。finale 正式腿
   （3f85ee64）则被门 4 间歇拦在 ticket 墙之前（5 次尝试 0 过+1200s 超时
   截断,见 §六;finale 超时已修为 4h）——门 4 间歇为独立基础设施缺陷。
3. **生产入口全流程收口未达**——墙后第一门=域 E 阶段一设计边界
   `system_link_plan_production_build_requires_claimed_lease`（代码内注释
   自证:域 A bundle decode view/域 B 递送未接通,阶段二由 held 变体物理
   替换）= 冷链线已立项工作,非幽灵非本席可修（禁跳门/禁放宽遵守）。
4. **门 4（identity）间歇**——见 §六;判词 59 备案,机制移交冷链线。

## 八、遗留清单（移交,本席不修）
- u64 常量除法→有符号除法误译本体（kernel/C 车头 emitter,最小复现
  tw_overflow_probe.cheng,高价值）。
- aarch64 fstat 偏移:sizeOffset 48 应 40（fstat_scalars/fstat_identity）;
  fstat_nlink aarch64 u64@16 读 mode+uid、x86_64 u32@20 恒 0。
- 门 4 间歇机制（driver 读取侧,kernel 态恒对）。
- 域 E 阶段二（bundle decode child 路径+claimed lease loadout）。

