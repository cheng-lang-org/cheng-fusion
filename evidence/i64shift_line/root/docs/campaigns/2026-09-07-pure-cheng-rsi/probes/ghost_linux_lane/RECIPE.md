# 幽灵终验 Linux 通道配方（判词 57 现场）

日期：2026-09-10。目标：在生产入口（system-link-exec，Linux 专属，判词 54）
下给出判词 30 幽灵 panic 的运行期终验判决。

## 判据

1. 判词 30 panic `prebound statement root has no role kind=1` 全日志零再现；
2. 同族幽灵指纹（`scope owner missing` / `invalid data` / `body missing` /
   `rc=70` / `held_bundle_seal` / `held_exec_parent_linux_x86_64_required`）零再现；
3. 幽灵语料 rsi_repro_structret 产物行为正确：rc=0，stdout=`7`
   （name=="hello" / kind==7 双 assert 静默过）；smoke 腿 rsi_minimal_smoke
   rc=0。任何 panic/异常原文带回（可能暴露 E1 未覆盖面）。

## 前提（全部实测核定，含三面新墙定谳）

- 树态=**dacd3d28e**（显式钉死；HEAD 已被冷链线推进到 b6b4816e4=判词 56，
  该提交 Linux 主体逐字节保留，其上烤制亦绿=27313f66，附带互证）。
  dacd3d28e 含全部幽灵根修：E1 MoveInto 源侧 detach（parser.cheng:2899）、
  V1 空 str validator 合同收敛（psb:2372）、detach sweep、wall2 tracked
  provider（psb:22278）。
- 载具 stage3 sha256_16=05af823e7db0c8ea（禁重烤，判词 53/54 同源）。
- **烤制解锁 patch（前置）**：bd149df96 起 HEAD 全 CLI 烤制 3s rc=2
  （CompilerVerifyX86RemoteHost str[] 字面量 Fmt/借用元素触发 verdict-48
  门禁）。修法=判词 48 配方 owned 化：数组字面量内 Fmt 与裸 str 元素包
  `strings.CloneStr(...)`（share() 实测仍拒——门禁只认 OWN_MOVE/canonical
  字面量，cold_parser.c:44551；本函数 17 行语义零差，
  bake_unblock_verdict48.py 自动生成+落 patch 文件）。仅克隆树内。
- **target 必须 x86_64-unknown-linux-gnu**。aarch64 全量烤制定谳为结构性
  墙：primary.o 单一 .text >128MiB 时 R_AARCH64_CALL26(±128MiB) 在任何
  输入节边界都放不下 veneer（9 分钟烤完后 `relocation truncated to fit`
  实证；x86_64 rel32 ±2GB 无此墙）。
- **运行环境=x86_64 系统级 VM**（Apple Silicon 上 qemu TCG 仿真：
  `colima start --profile ghostx64 --arch x86_64 --cpu 2 --memory 4
  --disk 12`；仿真慢 10-20x，VM 内单腿生产编译 30-60min 属预期，
  长跑必须 VM 内 setsid/脱挂，禁靠 ssh 会话存活）。qemu-user 不可行：
  /proc/self/exe 指向解释器，launcher 身份合同不可满足。
- **fs-verity（硬合同）实测定谳**：
  - begin_claim 对 launcher/native verity measure（psb:26076/26101），
    child publish 对 --out 产物 verity enable（psb:27307）；
  - colima VM rootfs 默认无 verity 特性（enable=95 EOPNOTSUPP）→
    **在线 `sudo tune2fs -O verity /dev/vda1` 解锁**（verity 是
    RO_COMPAT 特性，rootfs 可在线加，实测 enable 即刻可用）；
  - **禁 loop 挂载**：held_exec_identity 的 openat2 带
    RESOLVE_NO_SYMLINKS|RESOLVE_NO_XDEV（held_exec_identity.cheng:653），
    跨挂载点=EXDEV → `held_exec_identity_e_linux_openat2_failed`
    HARD_RED（实测）；固定路径必须落真实 rootfs 链；
  - enable_arg=**128 字节**全零缓冲（v1/sha256/4096 前 12 字节）：ioctl
    size 位=0x80，内核按 128 字节 copy_from_user，40 字节缓冲越界读垃圾
    →EINVAL（cheng provider 的 128 字节构造本来就是对的；
    FS_IOC_ENABLE_VERITY=1082156677、FS_IOC_MEASURE_VERITY=3221513862
    经 strace+官方 fsverity 工具逐一对上）。
- 生产入口合同：driver 装 `/usr/libexec/cheng/{csg-production-launcher,
  csg-core-native}`（hardlink 同 inode），`--out` 绝对路径。
- 真实链接=外部 musl-gcc `-static`（cheng_cold.c:110243 起），失败详情
  只在 `<out>.link.log`——**任何烤制失败处理分支必须先抢救 link.log**。

## 判词 59 增补（ticket 墙根修+新门事实）

- **第六门（ticket 交接）已破**：双真 bug——①stage3 u64 常量除法误译
  （→有符号除法）×crl /proc stat 溢出守卫恒真（父端 birth capture 必败）；
  ②host_runtime use_begin role 词汇 id 直映射槽位（DecisionReader=5→槽 4
  永不 populate）。修=ticket_wall_fix.patch（crl 无除法精确守卫+显式
  role→槽映射），runall 自动应用。实测 TW_C_OK（子 import 全过）。
- **墙后=域 E 阶段一设计边界**（`requires_claimed_lease`，域 A/B 未接通，
  阶段二由 held 变体替换）——非幽灵，冷链线已立项。
- **门 4（identity）间歇**：本内核 fsverity enable 不落 FS_IMMUTABLE_FL
  （GETFLAGS 仅 EXTENTS|VERITY）→ 安装后须 `chattr +i`（单 inode 钉一次，
  两名同 inode）；即便钉位，driver 运行中仍 ~50-100% 读缺（kernel 态恒
  0x180010）——有界重试（5 次/腿，重试前清 store）+建议 finale 前 VM
  重启；机制移交冷链线。
- **lease 链全链 0700**：umask 077 + chmod 700 ~/.local、~/.local/share、
  ~/.local/share/cheng、…/csg-core（775 组写位=os_persistent_user_data_
  root_failed:-20）。
- **VM 时序**：双腿各 ~55min（envelope 339MB 哈希为大头）；finale 超时
  已提至 4h；失败腿父进程 panic 会留脏 journal（canonical record invalid），
  重试/复跑前清 ~/.local/share/cheng/csg-core。
- runall PIN 已提至 b6b4816e4（判词 56 重做域基线）。

## 命令序列（单进程通道；禁中途改脚本——bash 按字节偏移续读，活编辑竞态会毁在飞现场）

```sh
MAIN=/Users/lbcheng/cheng-lang
LANE=$MAIN/docs/campaigns/2026-09-07-pure-cheng-rsi/probes/ghost_linux_lane

# 0) 空闲门：主机无他线在飞烤制（本例冷链线在其私有克隆烤 darwin 目标，
#    零共享面）、kernel 线 evidence 目录无活跃写、目标 VM 无在飞大编译。
bash $LANE/run_ghost_linux_lane.sh probe

# 1) 单进程全链（HELD 租约 keeper=进程 fd9；分相跨命令会被 disk_guard
#    prune 连目录整删——判词 50⑤ 同坑）：
GHOST_VM_PROFILE=ghostx64 bash $LANE/run_ghost_linux_lane.sh runall
#    a. git archive dacd3d28e src + cheng-package.toml（树态钉死）
#    b. 预检腿: stage3 交叉编 rsi_repro_structret → x86_64 ELF rc=0
#    c. verdict-48 解锁 patch（17 行）落克隆树+bake_unblock_verdict48.patch
#    d. 全 CLI 烤制（CHENG_DISABLE_COLD_OBJECT_CACHE=1，~8min）:
#       stage3 system-link-exec --root:$HELD/tree
#       --in:src/core/tooling/compiler_main.cheng --emit:exe
#       --target:x86_64-unknown-linux-gnu --out:$HELD/driver_linux_a64.bin
#       rc=0；确定性复现=sha256_16 0f51056b6cf6ed8f（339,061,384B）
#    e. VM 终验（vm_ghost_finale.sh）: rootfs tune2fs -O verity →
#       安装+verity enable（enable_errno=0, digest 实测）→
#       生产入口双腿编译（VM 内 TCG 仿真 30-60min/腿，脱挂跑）→
#       产物运行 → 七族幽灵指纹 grep 清查 → vm_receipt 回传 logs/
#    f. 清场: VM 任务目录+/usr/libexec/cheng 安装件+暂存+HELD
```

## 交付物（本目录）

- `RECIPE.md`、`run_ghost_linux_lane.sh`（host 编排，phases=
  probe/precheck/bake/finale/runall/cleanup）、`vm_ghost_finale.sh`
  （VM 侧终验）、`verity_enable.py`（128 字节 enable+measure 回读）、
  `bake_unblock_verdict48.py/.patch`（烤制解锁）、`logs/`（全 rc 日志、
  link.log、driver report、vm_receipt）。
