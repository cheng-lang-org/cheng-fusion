# M3 安装面方案（路线 A 定案；2026-09-10 用户授权本席选择）

> 决策：**走 A**（darwin 生产臂逐模块接线）。理由：目标是「关掉 held-exec 平台门」，
> A 是本机唯一能真正关门的路径；B（维持 Linux 专属、终验走 linux lane）只是把终验搬走，
> 本机永久 BLOCKED 且 darwin 设计资产闲置。A 的剩余工作里 M1/M2/M4 是纯代码（本席权限内），
> 只有 M3 需要一次性系统安装面（需 root/签名，须用户执行或授权）。
> 权威依据：`docs/campaigns/2026-09-07-pure-cheng-rsi/probes/darwin_authority/DESIGN.md` §三（M0-M5）、
> §P4（execveat 不可行 → 生产臂=固定路径 suspended spawn）、:91-93/:134/:155-158。

## 一、M3 要装的到底是什么（原文口径）

- **固定路径**：`/usr/local/libexec/cheng/csg-core-native`（DESIGN.md:155 明示）。
- **完整性**：该路径 inode 打 **`SF_IMMUTABLE`**（`st_flags`；内核拒写/截断 EPERM），
  并处于 **签名 issuance bar** 下（cdhash/DR/team、非 ad-hoc、hardened runtime，DESIGN.md:91-93）。
- 语义：把 `/proc/self/exe` 与 fs-verity measure 两腿替换为「固定路径 + 安装面完整性 + 签名认证」。

## 二、一次性安装（需 root；本席不擅自执行）

> **【2026-09-10 实测更正】** 安装面**已经存在**：`/usr/local/libexec/cheng/{csg-production-launcher,csg-core-native}`
> 均为 `root:wheel 0555 schg`，回执 `/private/var/db/cheng/csg-production-launcher-install.receipt`（0400 schg），
> 内容 `status=CANDIDATE_INSTALLED`（**不是生产信任根**）、`codesign_identity_authenticated=0`、
> `designated_requirement_authenticated=0`；签名 = `Developer ID Application: Bicheng Liu (8TPZK99LFJ)` + hardened runtime。
> ⇒ 「再执行一次安装」不是当前动作；**正确动作是让 M1/M2/M4 接线 + provider-owned event source 闭合**，
> 二进制 refresh 只在 authority/anchor CID 有合法来源后才做。
>
> **【本方案的漏洞（由 P-D 施工图指出，已修）】** 原 §二 手写命令**只装了一个产物**；而
> `ChengHeldExecIdentityIssueInto`（`src/core/runtime/held_exec_identity.cheng:1244-1284`）要求**同时**收
> launcher 与 binary 两条固定路径并做别名互斥（darwin launcher 路径见 `:122-123`
> `/usr/local/libexec/cheng/csg-production-launcher`）。⇒ **必须用官方安装器一次装两条腿**，
> 且必须显式给 4 个 CID（安装器只校验格式并原样写回执；凭空取值=溯源造假，禁止）：
>
> ```text
> sudo tools/csg_core_production_launcher_install install \
>   --launcher-source:<built>/csg-production-launcher  --launcher-source-cid:sha256:<...> \
>   --binary-source:<built>/csg-core-native            --binary-source-cid:sha256:<...> \
>   --compiler-authority-cid:sha256:<...>              --external-anchor-cid:sha256:<...>
> # 目标已存在时安装器会 hard_red（launcher_target_already_exists 等）；
> # 故 refresh 须先（root）chflags noschg 三件 + 删除，且必须先有合法 CID 与本地验证过的候选对。
> # 两个产物的源码入口：src/core/tooling/csg_production_launcher_main.cheng / csg_core_native_main.cheng。
> ```
>
> 下列原始最小流程保留作**参考**（已被官方安装器取代，勿直接执行）：

> 具体承载二进制名/签名身份以冷链线 `held_identity`/`capability` 模块最终定名为准（**待其确认**），
> 下列为按 DESIGN.md 口径的最小流程，实际执行前须与该线核对路径与身份。

```text
# 1) 目录（root:wheel，0755，链上不可写）
sudo install -d -o root -g wheel -m 0755 /usr/local/libexec/cheng

# 2) 落地 launcher 二进制（由 M1/M2/M4 接线后的构建产出）
sudo install -o root -g wheel -m 0755 <built-launcher> /usr/local/libexec/cheng/csg-core-native

# 3) 签名（非 ad-hoc + hardened runtime；身份待定：Developer ID 或本机受信证书）
codesign --force --options runtime --timestamp --sign "<identity>" \
         /usr/local/libexec/cheng/csg-core-native
codesign -dv --verbose=4 /usr/local/libexec/cheng/csg-core-native   # 记录 cdhash/TeamIdentifier

# 4) 冻结点：置 SF_IMMUTABLE（此后内核拒写/截断）
sudo chflags uchg /usr/local/libexec/cheng/csg-core-native
ls -lO /usr/local/libexec/cheng/csg-core-native                       # 期望 uchg 标志在位

# 回滚（同样需 root）
sudo chflags nouchg /usr/local/libexec/cheng/csg-core-native && sudo rm -f /usr/local/libexec/cheng/csg-core-native
```

## 三、前置与顺序（不可倒置）

1. **M1（channel 定长分帧属主）→ M2（`posix_spawn START_SUSPENDED` spawn 属主）→ M4（child 镜像再证）**
   纯代码接线，先做（估 12-24h，含每轮烤机验证）；此时 darwin 臂的未接线硬 fail 码（errcode 31-34）逐个消失。
2. 再做 §二 的一次性安装（需用户 root/签名）。
3. 最后跑 **M5 终验**：幽灵终验 darwin 臂全链 + Linux lane 对照（判词 54 阶梯③④）。

## 四、需要用户提供/确认（三件）

- **root 可用性**：允许在本机执行 §二 的安装（或用 `sudo` 授权某次会话执行）。
- **签名身份**：用哪个证书（Developer ID / 本机受信证书）；design 明确 **不接受 ad-hoc**。
- **路径确认**：`/usr/local/libexec/cheng/` 是否可接受（若否，需冷链线改定名并同步代码常量）。

## 五、验收（A 路线的完成判据）

- M1-M4 各自模块：未接线硬 fail 码消失且有实测回执（wire/spawn/再证三段）。
- M3：固定路径上文件 `st_flags` 含 `SF_IMMUTABLE`、签名 triple 可验，且**运行期 launcher 自证
  其字节与固定路径安装面一致**（替换即破坏签名/immutable，DESIGN.md:134）。
- M5：held-exec 全链在 darwin 上 rc=0（不再 54s 撞声明点），幽灵终验补跑并与 Linux lane 对照。
- 任一环节未达成 → 如实 HARD_RED，**不得**回落 Linux 专属或降级成静默跳过。
