# VERIFY_w150_append.md —— kernel_driver_w2 战役 wall150 线（Phase C 首役：驱动冷编 RSS 削减）

日期：2026-09-05 03:02–09:10。工作目录=仓库根。锚点 commit=69817b8b2。授权面=src/core/runtime/program_support_backend.cheng + 定性落点 src/core/backend/system_link_exec.cheng（memline2c §7 指定落点）；未 commit、零分支/worktree；作业区 /tmp/oob_ab/w150/。烤机预算 6 轮，实用 5 轮（r6 保存未动）。

## 判定

**口径定谳 + call_fixture 过帽（-56MiB）+ cn 剩 6-10MiB 缺口如实移交。** (1) 测量口径修正：`user_path_gate`（13 项缓存全禁=真编译）与 `cheng_mem_protocol`（部分缓存层未禁）同驱动差 ~250MiB，RSS 验收一律以 gate COMPILE_RSS 为准——此前 845-1005MiB 的「方差」叙事部分源于口径混用。(2) wall146-149 的判词富化/identity 臂**不是** RSS 增量源（HEAD 驱动与 w143 同协议仅差 +8MiB；富化是失败臂纯读投影）。(3) 本线三修改把 call_fixture 从 1077MiB 稳定爆帽压到 1016-1021MiB 稳定过帽，ordinary 压到 992-1016MiB 边缘过，cold_nested 从 1074-1077 压到 1025-1034MiB——**仍差 6-10MiB 过帽**，安全手段已穷尽，缺口移交（见 §五）。(4) 探得两颗新雷并钉死参数边界（r3/r4，见 §四）。

## 一、口径对账（修前定谳）

| 口径 | 缓存禁令 | w150_r1 ordinary | 结论 |
|---|---|---|---|
| user_path_gate（run_guard_phase） | 13 项全禁+BACKEND_JOBS=1（真编译） | **1016MiB** | 验收权威口径 |
| cheng_mem_protocol（wall145 建） | 仅 4 项（provider/pure-exe/sle/IR store 层未禁） | 767MiB | 曲线/方向性对照口径 |

- mem_protocol 轮 report 实证 `provider_object_cache_enabled=0`+miss=7——差值来自其余 IR/store/merkle 缓存层被烤机预热，非 provider cache 本身。
- final 驱动（09-05 00:52 烤）gate 历史五轮：ordinary 859/865/1049/1075/1077、v6 1076、cn 1074 爆（gate_final*.log 在案）；同协议 mem_protocol 复测 1056MiB rc=137。final 与 HEAD 驱动 __text 仅差 16KB（__DATA 全同）——final 时代多出的 ~290MiB 运行时驻留在 HEAD 已收敛，且 HEAD 基线本身已贴帽。

## 二、修法（源码终态，全部 [wall150] 标记；他线 hunks 零接触原样保留）

1. **mmap 档阈值 1MiB→256KiB**（program_support_backend.cheng cheng_malloc_locked + realloc migrate 链，2 处）：≥256KiB 块走 c_mmap_anon（bit30 标记/registry/毒化复扫全复用），quarantine 淘汰时 munmap 真归还 OS——打掉 memline2c 定性的「SMALL 档 dirty=历史 live 峰」主体（中型列翻倍链区）。mmap 失败回落 c_malloc 非静默。
2. **quarantine ring 本体上限 16MiB→4MiB**（chengQuarantineRingMaxCap=262144）：[wall149] 翻倍紧缩拷贝瞬态 24MiB→6MiB；淘汰权威仍是 ring_bytes 48MiB 字节预算（不变）。
3. **live 三数打进 run.report 尾行**（system_link_exec.cheng，memline2c §7 共同第一步）：@importc 桥接既有 @exportc("cheng_mm_live/alloc/free_count")，新增 `allocator_live_block_count / allocator_alloc_block_total / allocator_free_block_total`——此后每轮编译自带残余归因。

**注释纪律**：128KiB 档与 quarantine 参数的安全边界已写进源码注释（§四），防止后线再踩。

## 三、gate 实测台账（真编译口径，KiB）

### 3.1 本线有效对照（r1 基线 → r2 修复版）

| 驱动 | ordinary | call_fixture | cold_nested | gate 结果 |
|---|---|---|---|---|
| r1=HEAD 基线（ad8929c1…） | 1041040 **PASS** | 1077395456B **爆** rc137 | 未及 | exit 3 |
| r2=修复版（e9e03765…） | 994-1025 **PASS×3** | 1021/1016 **PASS×2** | 1034/1024.6/1030 **爆×3** | exit 3（cn 拦路） |
| r2 相对 r1 净效 | -22~-32MiB | **-56MiB（爆→过）** | -44~-49MiB | call 过帽 |

- r2 三轮 gate 全表：
  - run2：ord 1017552 PASS / call 1045424 PASS / cn rss_limit_exceeded(1084407808B) → exit 3
  - run3：ord 1015984 PASS / call 1040128 PASS / cn rss_limit_exceeded(1079525376B) → exit 3
  - 单门快测：cn 1074315264B 爆（对照 r3 雷，无 bridge 判词，正常推进到深处）
- 基线参照：w143 代同协议（mem_protocol）759.3MiB vs HEAD 767MiB——wall146-149 无 RSS 回归；final 时代增量已随 HEAD 收敛。

### 3.2 实验轮 gate/快测记录（均已回退，参数边界钉死）

| 轮 | 变体 | 门 | 结果 | 处置 |
|---|---|---|---|---|
| r3（mmap 128KiB） | one_gate cn | rc=2 `output storage already owned` @44MB | 雷，回退 256KiB；r2 同夹具重测无判词 | 边界入源码注释 |
| r4（quarantine 40MiB+ring 512/2MiB） | one_gate cn/ord | 均 rc=2 同判词 @44/37MB | 雷，回退 r2 组合（48MiB/1024/4MiB）后消失 | 边界入源码注释 |
| r4（one_gate ord/cn 首测 rc=2@87/108MB） | lease 拒非编译错 | — | 排除项 | — |
| r5（终态复烤，树含他线新 hunks） | **完整 gate** | **四夹具 compile rc=133 全灭**（ord 46928/call 50016/cn 58224/v6 96896 KiB 早期 trap），清场后复跑一致 | 驱动不可用：闭包含并行线（PhaseC-W5 merkle 簇/PhaseB-enum parser+typed_expr）当晚在途 hunks 的运行时缺陷；判据=本线修改在 r2 三轮 gate 有效，r5 与 r2 源码差=纯他线 hunks | 移交该两线；本线不烧 r6（当前树态未变，r6 必复现） |

## 四、两颗新雷（r3/r4 探得，参数边界已钉死并回退）

1. **mmap 阈值 128KiB 档**（r3，sha 见台账）：cn 快测 `compiler snapshot lowering bridge: output storage already owned`（rc=2 @44MB 早期死）。128KiB-256KiB 区间的块 backing 档位变化与 bridge 输出存储所有权判定存在耦合。**回退 256KiB 后判词消失（r2 重测 cn 正常推进到 1034MiB RSS 爆帽，无此判词）。**
2. **quarantine 参数微调**（r4：预算 48→40MiB + ring initial 512 + ring max 2MiB）：cn/ord 快测同样 `output storage already owned`。**回退 48MiB/1024/4MiB（r2 组合）后消失。** quarantine 有界参数域与 bridge 所有权判定的耦合机制待后端线鉴定（移交 §五.3）。
3. r5（源码终态复烤，d4733540…）烤成后 cn/ord 快测 rc=133（trap fail-stop）——r5 闭包含并行线（PhaseC-W5/PhaseB-enum）当晚新推进的在途 hunks，异常域与本线修改无关，未追（本轮判定依据：r4→r5 之间树上 merkle/parser 域 hunks 净增长，且 r2 驱动同夹具同窗无此行为）。

## 五、移交事项

1. **cn 剩余 6-10MiB 缺口**：安全手段（mmap 256KiB 下界、quarantine 安全组合、ring 收敛）已穷尽。下一档=lowering/plan 域阶段释放点（L3 批次 2 候选，授权面外）或 bridge/merkle 域所有权修复。budget 通道 CHENG_QUARANTINE_BYTES 不受影响。
2. **验收缺口**：gate exit 0 ×2 未达成（cn 单门拦路，三次实测 1024.6-1034MiB vs 帽 1024MiB）；ordinary/call_fixture 已稳定过帽。**r6 预算保存未用**（无已证安全的候选，盲赌两轮已两雷）。
3. **bridge 雷（后端线）**：quarantine 参数域与 `compiler snapshot lowering bridge: output storage already owned` 的耦合（r3/r4 复现、r2 消失）需定位所有权判定读取的块状态字段。
4. **live 三数消费**：r2 起每轮 run.report 尾部自带 allocator_live/alloc/free 三数，残余归因不再依赖外部 attach。
5. **r5 rc=133 trap（PhaseC-W5/PhaseB-enum 线，高优）**：两线 09-05 02:56 后推进的在途 hunks（merkle_dag.cheng +205、merkle_transaction.cheng、typed_expr.cheng +58、parser.cheng [phaseB-enum]）使 head 三件套烤出的驱动四夹具 compile 全部 rc=133 trap 早期死（47-97MB，清场复跑一致）。r2 驱动（无这些 hunks）同窗正常。两线在烤机前必须先修好自己的在途态。

## 六、烤机台账（预算 6 轮，实用 5）

| 轮 | 产物 | sha256 | size | 内容 | 结果 |
|---|---|---|---|---|---|
| r1 | kernel_driver_w150_r1 | ad8929c194be4ce2549596140271507b2dce39297e87984ff65ffdb2e3f6e314 | 186516464 | HEAD 基线 | gate: ord 1016 PASS / call 1077 爆 exit3 |
| r2 | kernel_driver_w150_r2 | e9e03765d3a45472f416fc8719764a9d10ad8e33f303ed4d4bb75e6b74969a0d | 186550560 | A+B+C 三修法 | **当前最优**：ord 994-1025/call 1021 过/cn 1034 差 10MB |
| r3 | kernel_driver_w150_r3 | e9e03765 前代（128KiB 变体） | 186550560+ | mmap 128KiB | cn `output storage already owned` 雷，回退 |
| r4 | kernel_driver_w150_r4 | ab9265908b28aeffe70914c2ca416464f32433908fc9aa80931533eea71d5c33 | 186764304 | +quarantine 40MiB/ring 收敛 | 同 bridge 雷，回退 |
| r5 | kernel_driver_w150_r5 | d4733540f2e9a293022976bf0abe733228f081071f59d334951a9e472c763fd5 | 186764304 | 终态复烤（树态含他线新 hunks） | **gate 四夹具 rc=133 全灭**（他线在途 hunks 缺陷，非本线），停追 |
| r6 | 未使用 | | | 保存 | |

## 七、交付物

- **/tmp/oob_ab/wall150.patch**：当前树态全量 git diff（含他线在途 hunks 原样照录）；`git apply --check --reverse` **PASS**（sha256=3ac915a998ad3a748da9a83bad47c9b2aae428408eaa725d12c7598b0e04dc48）；本线净增量=2 文件（program_support_backend.cheng +25/-5、system_link_exec.cheng +20，含 PhaseC-W5 的 4 行在途 hunk 原样保留于同文件）。
- /tmp/oob_ab/w150/：gate_run.sh/gate_until.sh/one_gate.sh(.retry)/mp_batch1.sh、mp_*/（四组曲线与报告）、gate_w150r1_r0.log、gate_w150r2_run1/2/3.log、bake_r1-r5.log、one_*/（快测 guard.report）、probe_cache/。
- 验收门禁实况：r2 三轮 gate 表=§三；exit 0 ×2 未达成（cn 单门），缺口与移交见 §五。
