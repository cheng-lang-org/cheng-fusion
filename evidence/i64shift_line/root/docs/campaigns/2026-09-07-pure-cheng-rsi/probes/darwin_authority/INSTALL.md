# DarwinAuthority M3 安装面操作书：安装 / 升级 / 卸载

日期：2026-09-11（判词 58 交付）。上游合同：判词 56 五原语判决（本目录
DESIGN.md）、`src/core/runtime/held_exec_identity.cheng`（issuance bar
判定器）、`src/core/runtime/production_held_exec_darwin_capability.cheng`
（HARD_RED 声明）。工具：`tools/m3_install_surface.sh`（本批新增）。

## 0. 合同速览

固定路径（held_exec_identity.cheng 常量，darwin-arm64）：

| 角色 | 路径 |
|---|---|
| binary | `/usr/local/libexec/cheng/csg-core-native` |
| launcher | `/usr/local/libexec/cheng/csg-production-launcher` |

issuance bar 四项（判定器 `heldExecDarwinIssuanceBarError`，短路灯）：

| # | 项 | 内核/工具事实 | 缺失时判词错误串 |
|---|---|---|---|
| 1 | 签名有效 | 内嵌代码签名可解析，`codesign --verify --strict` 过，cdhash 在 | `held_exec_identity_e_darwin_signature_missing` 等 |
| 2 | 非 ad-hoc + DR | CodeDirectory 无 adhoc 位；DR blob + team id + signing id 在 | `..._darwin_adhoc_signature` / `..._darwin_designated_requirement_missing` |
| 3 | hardened runtime | cd flags 含 runtime(0x10000) **且** library-validation(0x2000) | `..._darwin_hardened_runtime_missing` |
| 4 | SF_IMMUTABLE | `st_flags & 0x20000`，内核拒写拒替换（schg 下 rename/write/truncate 全 EPERM） | `..._darwin_system_immutable_missing` |

四项全绿 = 「固定路径上不可变且签名认证的字节」成立，psb darwin 臂
M3 两腿（retained/launcher identity）才有接线对象。

**本机现态（2026-09-11 实测，logs/m3_install_verify.log）**：两条固定路径
已于 2026-08-22 安装（root:wheel 0555 + schg + Developer ID 签名，
team 8TPZK99LFJ），四项全 PASS——本机安装面已在位，M3 接线（另批）可
直接消费；本操作书用于首次安装、换面升级与卸载。

## 1. 前置条件（执行 M3 前用户需备齐）

1. **签名身份**：钥匙串内有效 codesigning 身份。本机实测 4 枚（含
   `Developer ID Application: Bicheng Liu (8TPZK99LFJ)`，脚本默认选它；
   可 `--identity <hash|名字子串>` 指定）。证书过期/吊销 = preflight 红。
2. **root 授权**：安装/升级/卸载全部步骤需 root（`sudo -E`）。脚本
   `--yes-i-know` 有但非 root → 硬错误拒绝（不静默降级 dry-run）。
3. **产物文件**：待安装的 Mach-O arm64 可执行文件路径
   （`--binary`，可选 `--launcher`）。产物如何编译产出不在本操作书范围。
4. 一次性预检：`m3_install_surface.sh preflight`（无 root、零写入）。

## 2. 安装（首次）

命令形态（真实执行前必跑一遍不带 `--yes-i-know` 的同命令看 dry-run 计划）：

```
tools/m3_install_surface.sh install --binary <产物> [--launcher <产物>] \
    [--identity <hash>] [--timestamp]
# 确认计划无误后加 --yes-i-know 并在 sudo -E 下重跑
```

步骤、失败语义与回滚（脚本逐步自动执行；任一步失败即停，不留半装态）：

| 步 | 命令 | 失败语义 | 回滚 |
|---|---|---|---|
| 1 | `mkdir -p /usr/local/libexec/cheng` | 父路径权限/只读盘 | 无需回滚（目录无害） |
| 2 | `chown root:wheel <dir> && chmod 0755 <dir>` | 非根/文件系统不支持 | 同上 |
| 3 | `install -m 0755 -o root -g wheel <src> <dst>` | 拷贝/属主失败 | 脚本自动 `rm -f <dst>` |
| 4 | `codesign --force --sign <id> --options runtime,library <dst>` | 签名失败（身份无效/熵/写拒） | 自动 `rm -f <dst>` |
| 5 | `codesign --verify --strict <dst>` + `-dvvvv` 必须 `Authority=`（非 adhoc） | 严格校验失败 | 自动 `rm -f <dst>` |
| 6 | `chflags schg <dst>` | 非根/越权 | 自动 `rm -f <dst>` |
| 7 | alias 检查（binary/launcher dev.ino 与字节不得相同） | 命中 = 判词 `launcher_binary_aliased` | hard-fail，两文件已 seal，走卸载流程清场 |
| 8 | issuance bar 复验（= `verify` 子命令） | 任一项 RED | 自动 `chflags noschg` + `rm` 两条产物，整面回零 |

双产物注记：bar 的判定器要求 binary 与 launcher 不互为别名（同 inode 或
同字节都拒）；两文件分别签、分别 seal。签名参数必须
`--options runtime,library`：bar 第 3 项同时要 runtime 与
library-validation 两个 CD 位（实测只给 `--options runtime` 的产物被
判词单检出 `hardened_runtime_missing`，logs/m3_issuance_bar_probe.log）。

## 3. 升级（换面）

```
tools/m3_install_surface.sh upgrade --binary <新产物> [--launcher <新产物>] \
    [--identity <hash>]        # 先看 dry-run，再加 --yes-i-know + sudo -E
```

| 步 | 命令 | 失败语义 | 回滚 |
|---|---|---|---|
| 1 | `cp -p <dst> <dst>.pre-upgrade.$$` 备份 | 备份失败 | 中止，目标原封不动 |
| 2 | `chflags noschg <dst>` | 非根/flag 异常 | 中止，目标原封不动 |
| 3 | 拷贝新产物到同目录 `<dst>.upgrade.$$` + 属主 0755 root:wheel | staging 失败 | 清 staged+备份，目标原封不动 |
| 4 | 对 **staged** 文件签名（同 install 第 4 步参数）+ 严格校验 | 签名/校验失败 | 清 staged+备份，目标原封不动 |
| 5 | `mv -f <staged> <dst>` 单次 rename | rename 失败（跨设备等） | 清 staged+备份，旧面完好 |
| 6 | `chflags schg <dst>` 重新 seal | seal 失败 | 走备份回滚 |
| 7 | bar 复验 | 任一项 RED | `noschg` → `mv <备份> <dst>` → `schg`，旧面还原 |
| 8 | 成功后删备份 | — | — |

### 替换窗口的原子性论证

- **换名不原地写**：新字节先在旁路 staged 文件上完成拷贝+签名+校验，
  然后用**一次 `rename(2)`**（同目录、同卷）原子替换目录项。rename 语义
  上要么旧项要么新项，不存在「半个新文件挂在正式路径上」的中间态；
  正在运行的进程持有的旧 vnode 不受 rename 影响，继续执行旧字节直到
  自行退出——不存在运行中镜像被就地改写导致的 cdhash/执行漂移。
- **禁止原地写**：对 `<dst>` 直接 `cp`/`dd` 会产生「路径不变、字节半新
  半旧」窗口，运行中进程的镜像与代码签名同步撕裂，且中途失败留下
  半写态——这是本流程明令禁止的形状。
- **先解 seal 的原因**：SF_IMMUTABLE 位下内核连 rename 替换都拒
  （EPERM），故第 2 步必须先 `noschg`；窗口内替换本身是原子的，seal
  只在窗口两端起作用，re-seal 后新字节重新被内核钉死。
- **staged 必须与目标同目录**：rename(2) 不跨文件系统；跨卷 `mv` 退化为
  拷贝+删除（非原子）。staged 放同目录使第 5 步恒为同卷原子 rename。
- **签 staged 而非签后改**：签名绑定 staged 字节，rename 不改字节，
  因此正式路径上的最终字节与其签名、cdhash 恒一致。

## 4. 卸载

```
tools/m3_install_surface.sh remove [--keep-dir]
# dry-run 确认后加 --yes-i-know + sudo -E
```

| 步 | 命令 | 失败语义 | 回滚 |
|---|---|---|---|
| 1 | `chflags noschg <dst>`（逐文件） | 非根 | 中止，未删任何东西 |
| 2 | `rm -f <dst>` | 删除失败 | 中止（部分态如实暴露，不自动补） |
| 3 | 目录空且无 `--keep-dir` → `rmdir <dir>` | 非空/权限 | 保留目录并告警（无害） |

卸载后 psb darwin 臂回到「安装面缺失」语义（见 §6）：显式 HARD_RED，
无兜底。

## 5. 判定器预验（无 root 证据，判词 58 实测）

判定器本身的正确性在安装前用 scratch 产物验证（不开 root）：

- 载体：`probes/darwin_authority/probes/m3_issuance_bar_probe.cheng`
  ——直接调用在案判定器 `heldExecDarwinIssuanceBarError`；
  `probes/darwin_authority/probes/run_m3_issuance_bar_probe.sh` 在
  `cheng_scratch_scope` 内冻结 HEAD src（6a106eb32556）编译并造四腿对照件。
- 结果（logs/m3_issuance_bar_probe.log，四腿 verdict 全 OK，
  legs_mismatched=0）：

| 腿 | 产物状态 | 判定器输出 | 结论 |
|---|---|---|---|
| unsigned | 去 signature 的 Mach-O | `signature_missing` | 第 1 项 FAIL 路径正确 |
| adhoc | `codesign -s -` | `adhoc_signature` | 第 2 项 FAIL 路径正确 |
| real+runtime | Developer ID，`--options runtime` | `hardened_runtime_missing` | 第 3 项把 library-validation 位缺席单检出 |
| real+runtime,library | Developer ID，`--options runtime,library` | `system_immutable_missing` | 第 1-3 项全过，仅第 4 项缺（root-only，`chflags schg` 非根实测 EPERM） |

- 交叉证据：判定器解析的 cdhashCid 与 `codesign -dvvvv` 的
  `CandidateCDHashFull sha256=` 三条腿逐字符相等（match），两个独立实现
  对同一 CodeDirectory blob 认同。
- 第 4 项的正向（PASS）证据在本机由已装固定路径给出
  （logs/m3_install_verify.log 四项全 PASS）。

## 6. 安装面缺失时的显式 HARD_RED 行为（与判词 56 骨架联动核对）

psb darwin 臂（`cheng_held_exec_parent_begin_claim_darwin_export`）现状
（判词 56 骨架，本批零 src 写入，如实核对）：

| errcode | 常量 | 语义 | 现可达性 |
|---|---|---|---|
| 20 | OutputPathNotAbsolute | 输出路径非绝对 | 可达（骨架已接线） |
| 33 | DarwinRetainedIdentityUnwired | retained 身份腿（fs-verity measure 的 darwin 等价=安装面 issuance bar）未接线 | 可达（fd<0 与依赖序末端均 33） |
| 34 | DarwinLauncherIdentityUnwired | launcher 身份腿（/proc/self/exe 的 darwin 等价=固定 launcher 路径 issuance bar）未接线 | **已声明未可达**（骨架在 33 处短路，M3 接线拆分时启用） |
| 31 | DarwinChannelFramingUnwired | M1 通道分帧未接线 | 未接线（M1） |
| 32 | DarwinSpawnAuthorityUnwired | M2 spawn 权威未接线 | 未接线（M2） |

- 数码 31-34 与 DESIGN.md §三 M1-M3 排序、骨架注释依赖序一致；命名 face
  （`production_held_exec_darwin_capability.cheng` 的
  `HARD_RED:production_held_exec_darwin_system_immutable_signed_vnode_unavailable`
  与 held_exec_identity 的四条 `held_exec_identity_e_darwin_*` 错误串）
  与数码 face 语义对齐，**未发现不一致**。
- 联动结论：**安装面就绪 ≠ darwin 臂转绿**。psb 数码 33 在 M3 代码接线
  落地前仍照返；本操作书只负责把 OS 侧的「安装面缺失」这一条红清掉
  （本机该红已清，verify 绿）。接线属后续 ticket（本批禁 src 写入）。

## 7. 脚本速查

```
m3_install_surface.sh preflight                 # 只读体检（身份/目标/flags/当前 bar）
m3_install_surface.sh verify                    # 四项逐行 PASS/FAIL（退出码=是否全绿）
m3_install_surface.sh install   --binary F [--launcher L] [--identity H] [--timestamp]
m3_install_surface.sh upgrade   --binary F [--launcher L] [--identity H]
m3_install_surface.sh remove    [--keep-dir]
# install/upgrade/remove：缺 --yes-i-know = dry-run 打印命令序列（退出 0）
#                               有 --yes-i-know 非 root = 硬错误（退出 2）
```

证据文件（本目录 logs/）：`m3_issuance_bar_probe.log`（判定器四腿预验）、
`m3_install_preflight.log`、`m3_install_verify.log`（本机在装面四项全绿）、
`m3_install_dryrun.log`（三流程 dry-run 计划 + root 门拒绝实测）。
