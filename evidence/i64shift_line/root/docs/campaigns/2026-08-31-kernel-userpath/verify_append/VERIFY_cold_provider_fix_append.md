# VERIFY cold_provider_fix append（COLD-PROVIDER-FIX，2026-09-07）

## 结论

`[cheng_cold] Darwin host provider preprocessing identity failed` 根因定谳并根修：
69817b8b2 在 `cold_object_cache_payload_identity` 等处引入的 `st_gid == getegid()`
身份谓词与 macOS 的「新建文件继承父目录组」语义冲突。烤机输出目录建在 `/tmp`
布局（目录组 wheel=0 ≠ 进程 egid=staff=20）时，cc 子进程写出的
`<out>.provider.host_c.o.preprocessed.i` 合法携带 gid=wheel，被确定性误拒。
非并发、非篡改、与输入大小无关；9/3 版能过仅因该检查不存在，mini 能过仅因其
闭包不需要 host runtime C provider。fail-closed 语义未放宽：所有权证明
（uid==geteuid）、内容哈希、inode/nlink/mode/时间戳稳定性检查全部保留，组谓词
只精确到「egid 或 由本 uid 持有的父目录的组」。

## 取证（插桩复现）

- 插桩头（clone 谱系 + COLDFIX-DEBUG fprintf）+ /tmp 输出目录跑大闭包，判词前一行：
  `[pi-dbg] visible-reject path=/tmp/coldfix_forensic/run_f1/kernel_driver.provider.host_c.o.preprocessed.i
   lstat_rc=0 mode=100644 uid=501 gid=0 nlink=1 size=32726 euid=501 egid=20`
  唯一被拒字段 gid；同日志 `OUTER ... payload.present=0`。
- 平台事实实测：`touch /tmp/x` → gid=0(wheel)；`touch ~/cheng-f24/...` → gid=20(staff)。
- 主线程死场：/tmp/oob_ab2/run_m26（rc=2 wall=184s，判词同）。
- 证据：~/cheng-f24/anchor_clones/coldfix/scratch_coldfix/evidence/forensic_visible_reject.log

## 根修（bootstrap/cheng_cold.c，10 处门控 + 1 个共享谓词）

新增 `cold_identity_group_admissible(path, st)`：gid==egid，或父目录 lstat 为
本 uid 持有且其 gid 与文件 gid 全等（内核创建时合法继承），否则一律拒绝；
fd 场景 `cold_identity_group_admissible_fd` 用 F_GETPATH（__APPLE__）取路径，
取不到则保持严格 egid。替换位点：
payload_identity visible（87194，致死点）、publication receipt 文件（86471）与
fd 版（113284）、cache directory_current（86899）、cache receipt（87438）、
cache lock（87468）、stale sidecar（87512）、capacity scan 文件/子目录/目标目录
（87768/87830/87866）。其余比较（uid/nlink/mode/哈希/时间戳）未动。

补丁：cheng-patches/cold_provider_fix.patch（11 hunks，基于现工作树前缀快照，
reverse-apply 校验通过）。

## 验收（全部用 /tmp wheel 组目录，即原死场布局）

| 项 | 配方 | 判定 |
|---|---|---|
| ① 大闭包 | 修版头A + 原配方（cache OFF）`--out:/tmp/coldfix_acc/acc1/kernel_driver` | rc=0，产物 170,420,464B 出，`e15dff4897ea5536a962b4f4f49b641d81ae6b9901ee321186f90cdcf90055eb` |
| ② mini | 修版头A，`fn main(): int32 = return 0`，/tmp 输出 | 编译 rc=0，运行 rc=0 |
| ③ 重烤×2 同名 --out | 独立重编修版头B 同配方 `--out:/tmp/coldfix_acc/acc2/kernel_driver` | rc=0，sha 与①全等 |
| ④ A/B 对拍 | 前缀快照旧头（staff 组目录可跑侧）vs 修版头，同输入 | 旧头 rc=0，sha 与①全等（修版零输出漂移） |
| E cache-ON | 修版头A，缓存根 /tmp（wheel 组），不设 DISABLE | rc=0，sha 第四次全等；cold_cache/{arm64-apple-darwin,darwin_host_c,link-arm64-apple-darwin} 真实建成 |

四次大闭包 sha 全等：e15dff4897ea5536a962b4f4f49b641d81ae6b9901ee321186f90cdcf90055eb。

输入：clone 冻结根 /Users/lbcheng/cheng-f24/anchor_clones/coldfix（HEAD 759062096
+ 在途快照），src/core/tooling/backend_driver_dispatch_min.cheng，
`--emit:exe --target:arm64-apple-darwin`，BACKEND_JOBS=8，CHENG_ENTRY_CACHE=0。

证据：evidence/{forensic_visible_reject,acc1_fix_a_tmp,acc2_fix_b_tmp,
acc_old_prefix_staff,cacheon_fix_a_tmp,mini_fix_a_tmp}.log + evidence_shas.txt
（路径同上目录）。


## 主线程合入复验+认证链恢复（2026-09-07，收割追加）

冷修（cold_identity_group_admissible 13 处在树）+重编车头后：配对烤机 m29=m30=e63276872ac4bfd54c13a529f723d3b06e85253113f8a0ae1f970cfa94117240（rc=0，189/188s，含 R2-C C6 九文件合入态）；全门认证 rc=0——四夹具 4/4、探针 11 绿 8 红 0 STALE，树峰 901,939,200B < 1GiB。主树现役认证驱动自此为 e6327687（层叠+冷修+C6）。主流程教训两条：①冷链源修复后必须重编车头（m27/m28 用旧二进制白跑两轮）；②烤机结束→门起跑须留租约退避窗（60s），否则夹具报 parent lease unavailable 假红。
