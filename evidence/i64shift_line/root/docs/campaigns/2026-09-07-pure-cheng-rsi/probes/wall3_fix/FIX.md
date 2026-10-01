# 墙 #3 根修交付：held-exec bundle seal 的 darwin 等价物——不变量等价性论证与实证

日期：2026-09-10。载具 stage3 sha256_16=05af823e7db0c8ea（禁重烤，未动）。
主树 src 零写入：全部改动在 disk_guard 租约下的 scratch 克隆树完成
（keeper pid 4150，目录 /private/tmp/cheng-wall3-fix.1TVlN4j，收尾删除），
交付=本目录 `darwin_seal_bundle.patch`（对 HEAD e7e38d76a）与
`darwin_seal_bundle.9dd7a2bcd.patch`（9dd 烤制基线变体，仅平台常量名差异）。

## 结论先行

1. **墙 #3（seal 平台门）已解除**：darwin 上
   `RuntimeHeldExecParentSealBundleOwner` 从「平台即拒
   （chengHeldExecBundleSealErrPlatform）」翻转为「同等 seal 成功并发布
   owner arena」。直接反证：patched 树烤出的 seal 冒烟二进制在本机
   darwin arm64 运行 rc=0，输出
   `csg_core_production_held_bundle_seal_smoke darwin-arm64 ok`
   （含 seal 创建→arena 发布→abort 干净收尾全链，零临时目录残留）。
2. **seal 之后 darwin 的下一道门（定谳，非推测）**：
   `cheng_held_exec_parent_begin_claim_export` 首行显式平台门
   （psb:28979 附近，`chengHeldExecParentErrLinuxX8664Required`，
   9dd 文本 :28986 附近）——这是判词 53 移交判据之二「生产入口=Linux
   专属声明」的代码内落点，其后还有 fs-verity/`/proc/PID/exe` 镜像
   身份、SOCK_SEQPACKET+SO_PASSCRED、execveat(AT_EMPTY_PATH)、
   pidfd 五个 Linux 专属原语（launcher 已有 DarwinAuthority 设计分类：
   designated requirement/audit token/dynamic guest，运行时原语未实现，
   见 host_runtime cheng_host_exec_retained_runtime 的注释：
   "Darwin deliberately returns unavailable; its production arm requires
   the separate audit-token/dynamic-guest proof"）。故阶梯②的实证
   结果=不再出现 `production_launcher_e_held_bundle_seal`，代之以
   `held_exec_parent_linux_x86_64_required`——seal 门精确解除，
   幽灵终验（阶梯④）与产物运行（③）在本机仍被该设计内声明点挡住，
   如实记录边界；解除它需要 darwin 生产臂（posix_spawn suspended
   dynamic guest 载体）立项，非本席 patch 范围。
3. **Linux 路径一字未削弱**：`cheng_held_exec_parent_seal_bundle_raw`
   变为纯派发器；Linux 主体原字节搬入
   `cheng_held_exec_parent_seal_bundle_linux_raw`（memfd_create→
   写全量→F_ADD_SEALS(15)→F_GET_SEALS 回读→digest/fstat 双验证，
   逐行未动）；三处消费点在 Linux 分支仍执行与原代码等值的
   `F_GET_SEALS==15` 检查（attest 帮助函数的 Linux 分支即原文）。

## seal 保护的不变量（合同读出）

memfd 路径兑现方式（psb cheng_held_exec_parent_seal_bundle_linux_raw）：
`memfd_create(MFD_CLOEXEC|MFD_ALLOW_SEALING)` → 写入 envelope 全量 →
`fcntl(F_ADD_SEALS, 15)`（=F_SEAL_SEAL|F_SEAL_SHRINK|F_SEAL_GROW|
F_SEAL_WRITE）→ `fcntl(F_GET_SEALS)` 回读必须==15 → fd 内容
sha256==expectedHeldBundleCid → fstat 常规文件/尺寸/dev/ino 复核。

| # | 不变量 | 内容 |
|---|---|---|
| I1 | 内容钉扎 | seal 后任何 fd 持有者（含编译进程自身/子进程）不能再改字节：write→EPERM（内核强制，追溯及既有可写句柄） |
| I2 | 尺寸钉扎 | 不可 shrink/grow：ftruncate→EPERM；尺寸+全量 digest 绑定排除「半写/部分读」状态 |
| I3 | 封印不可撤销 | F_SEAL_SEAL：seal 集自身不可增删 |
| I4 | 不可第三方替换 | memfd 无路径名；唯一传播渠道=经认证 seqpacket 的 SCM_RIGHTS（子侧核验父进程镜像摘要） |
| I5 | 消费点独立再证 | 每个消费点 re-digest==激活 wire 携带的 bundleDigest 且 F_GET_SEALS==15——内核事实，非父进程声明 |

**威胁模型（定谳口径）**：防编译进程自身的并发换写/部分读/意外重写
（同进程树的 bug 与 race），非防 root/内核攻击者；父子互信另由进程
镜像摘要认证承担（cheng_held_exec_process_image_digest_into）。

## darwin 等价物与逐条对上

机制（cheng_held_exec_parent_seal_bundle_darwin_raw，单调用点内闭环，
零残留）：
私有 0700 熵名目录（TMPDIR，缺省 /private/tmp；`cheng-held-seal.`+32hex）
→ `openat(O_RDWR|O_CREAT|O_EXCL|O_CLOEXEC, 0600)` 写入 envelope 全量
（EINTR 重试，同 Linux 循环体）→ 开 `O_RDONLY|O_CLOEXEC` 第二句柄 →
**冻结点=关闭写句柄 → unlink（名消失）→ rmdir（目录消失）** → 验证：
fd 内容 sha256==CID、fstat 常规/尺寸/dev/ino、`st_nlink==0`、
`F_GETFL&ACCMODE==O_RDONLY`、lseek 0 → 返回读句柄进 owner arena。

| # | 不变量 | darwin 兑现 | 强制者 |
|---|---|---|---|
| I1 | 内容钉扎 | 冻结点后**不存在且不可再造任何可写句柄**：名已 unlink（重开→ENOENT）；O_RDONLY 经 F_SETFL 不可升级写；经读句柄 write→EBADF | 内核 |
| I2 | 尺寸钉扎 | ftruncate 需可写 fd→EBADF；路径 truncate→无路径；尺寸+全量 digest 复核同 Linux | 内核 |
| I3 | 封印不可撤销 | 无 seal 可撤销——不可变性是结构事实（可写句柄缺席）；O_RDONLY 状态本身不可翻转 | 内核+构造 |
| I4 | 不可第三方替换 | nlink==0（无名）；0700 熵名目录窗口仅存在于 seal 调用内部且返回前 rmdir；传播仅 SCM_RIGHTS | 内核+构造 |
| I5 | 消费点独立再证 | 每消费点 attest=`F_GETFL O_RDONLY + st_nlink==0`（内核可观测事实），并 re-digest==bundleDigest（原有逻辑未动） | 内核 |

**如实声明的精确差异**（不构成削弱）：Linux seals 对 seal 时已存在的
可写句柄**追溯**生效；darwin 方案靠构造保证冻结点后无可写句柄——
seal 函数是唯一创建点，写句柄局部于该函数并在返回前关闭，provider
arena 只存读句柄，SCM_RIGHTS 拷贝保持 O_RDONLY。故对「恶意父进程
私藏写句柄」这一不在威胁模型内的对手，Linux 强于 darwin；对合同
口径（防进程自身），两者同为内核强制的等价事实。

**消费点改造**（5 个 F_GET_SEALS 检查位中 3 个消费位）：
- parent activate（raw fd）：`cheng_held_exec_bundle_seal_attest_fd`
- child import / child take（owner role）：
  `cheng_held_exec_bundle_seal_attest_owner`（新增 host_runtime export
  `cheng_host_terminal_activate_receive_owner_nlink`，镜像 owner_fstat
  模式，内部复用既有 `cheng_host_fstat_nlink`）
- Linux 分支=原检查原文（`fcntl(fd,F_GET_SEALS,0)==15`），行为逐字节等值；
  其余平台（不存在）维持 fail-closed。

## 配套合同翻转（唯一测试面改动）

`src/tests/csg_core_production_held_bundle_seal_smoke.cheng` 平台分支：
darwin 从「断言 fail-closed（platform-hard-red ok）」翻转为「断言 seal
成功+abort 收尾（darwin-arm64 ok）」；未知平台仍 fail-closed。该测试
原断言即墙 #3 本体，翻转即解除记录。

## 改动文件清单

| 文件 | 内容 |
|---|---|
| src/core/runtime/program_support_backend.cheng | seal 派发器拆分（Linux 主体原样入 linux_raw）；darwin_raw 全新；attest_fd/attest_owner；9 个常量；2 个 import |
| src/core/runtime/program_support_host_runtime.cheng | +1 export：owner_nlink（17 行，镜像 owner_fstat） |
| src/tests/csg_core_production_held_bundle_seal_smoke.cheng | darwin 平台分支翻转 |
| compiler_main.cheng | **未动**（fork 协议入口无需改） |

## 验证阶梯（全 rc 实测，scratch 树）

| # | 项 | 结果 |
|---|---|---|
| 快验 | patched 树编 seal 冒烟（stage3 链） | **rc=0**（产物 7,497,408B） |
| 快验 | seal 冒烟运行于 darwin arm64 | **rc=0**，`darwin-arm64 ok`，stderr 空，零临时残留——**墙 #3 直接反证**（seal 创建+arena 发布+abort 收尾+attest_fd 全链在本机实证） |
| ⑤ | stage3 链 rsi_contract 编译+运行 | 编译 **rc=0**（7,908,976B）+ 运行 **rc=0**（stderr 空） |
| ① | 全 CLI 重烤纯 driver | HEAD e7e38d76a：**rc=2@2s×2**（verdict-48 既有破损，`CompilerVerifyX86RemoteHost str[] literal borrowed element`，kernel 线在修，重试探测仍红，bake_head_verdict48.log）→ 按任务规则**钉 9dd7a2bcd**（52/53 两次烤绿基线）+wall2 patch+本 patch（9dd 变体）：**rc=0**，858s，driver.bin 196,578,800B sha256_16=baf478f748db6be2 |
| ② | driver system-link-exec 编 rsi_minimal_smoke | **rc=1@54s**：`production_launcher_e_held_bundle_seal` **不再出现**（grep=0，墙 #3 解除实证），失败点前移至 begin_claim 首门 `HARD_RED:production_launcher_parent:held_exec_parent_linux_x86_64_required`（9dd psb:28986 附近显式声明，errcode=1）——判词 53 移交判据之二的代码内落点 |
| ③ | 产物运行 | **N/A**（②止于声明点，smoke.bin 未产出；产物运行 rc 无从绑定） |
| ④ | 幽灵终验（verify_ghost.sh，rsi_repro_structret） | **rc=1@54s 同②**：同一声明点；ghost 指纹（scope owner missing/invalid data/body missing/rc=70）全 0，但产物未生成，不构成幽灵终验通过——**BLOCKED@生产入口=Linux 专属声明点**，解除需 darwin 生产臂（audit-token/dynamic-guest 载体）立项 |

## 复现配方

```
TASK=<scratch dir via cheng_disk_guard 租约>
# 基线 A（HEAD）：git archive e7e38d76a src + cheng-package.toml，apply darwin_seal_bundle.patch
# 基线 B（烤制，verdict-48 期间）：git archive 9dd7a2bcd src + cheng-package.toml，
#   apply wall2_fix/tracked_list_dir_provider.patch + darwin_seal_bundle.9dd7a2bcd.patch
# 快验（两基线同）：
artifacts/bootstrap/cheng.stage3 system-link-exec --root:$TASK/tree \
  --in:$TASK/tree/src/tests/csg_core_production_held_bundle_seal_smoke.cheng \
  --emit:exe --target:arm64-apple-darwin --out:$TASK/seal_smoke.bin   # rc=0
$TASK/seal_smoke.bin                                                   # rc=0, darwin-arm64 ok
# 烤 driver / 幽灵终验同 wall2_fix/FIX.md 配方，树换 $TASK/tree3
```

## 资产（本目录）

- `darwin_seal_bundle.patch`（对 HEAD e7e38d76a，390 行）
- `darwin_seal_bundle.9dd7a2bcd.patch`（9dd+wall2 基线变体，390 行，
  仅平台常量名 X8664/Aarch64/Arm64 族差异；fresh 9dd+wall2 树 apply 后
  与工作树字节一致实测）
- `logs/seal_smoke.log`（快验编译 rc=0+运行 rc=0 全输出）
- `logs/stage3_rsi_contract.log`（阶梯⑤ 编译 rc=0+运行 rc=0）
- `logs/bake_head_verdict48.log`（HEAD 撞 verdict-48 证据+重试探测仍红）
- `logs/bake_driver.log`（阶梯① 钉 9dd 基线烤制 rc=0 全输出，858s）
- `logs/driver_corpus_attempts.log`（阶梯②③：rc=1@54s 声明点+seal 指纹=0）
- `logs/verify_ghost.log`（阶梯④：rc=1@54s 同声明点，ghost 指纹全 0）
- `logs/{verify_smoke,verify_ghost,verify_contract}.sh`（本机路径版复现脚本）

## 边界如实声明

1. `attest_owner`（child import/take 消费位）在 darwin 上不可达（fork
   协议止于声明点，子进程从未运行），其实证面=代码审查+与 attest_fd
   同构（差异仅 owner 侧取 fd 方式，shim 镜像既有 owner_fstat 模式）；
   attest_fd 已由 seal 冒烟在本机实证（darwin_raw 验证块内调用）。
2. 幽灵终验（判词 30 panic 不再现判据）未获通过性证明：链路在
   声明点终止，产物不存在。该终验需 Linux 环境（本机无）或 darwin
   生产臂立项后方可补跑。
3. HEAD e7e38d76a 已吸收 wall2 tracked provider（list_dir bridge 即
   wall2 设计原样），故 HEAD 基线只需本 patch；verdict-48 烤制破损
   修复后可直接在 HEAD 重烤复验本阶梯。
