# VERIFY_r2c2_c4_append — R2-C 余族收编线（R2-C2）· C4 darwin 单通道（v2 返工版）

日期 2026-09-07。工作克隆 `/Users/lbcheng/cheng-f24/anchor_clones/r2c2`（APFS cp -c，
锚点=主树 15:55 工作态；主树只落 `patches/r2c2_c4.patch` 与本卷，主树代码零接触）。

**版本史**：v1（同日早）= 组合根进程内预物化——主线程 m35 终验 **v6 夹具编译穿帽
1,077,821,440B > 1GiB**（rc=3 rss_limit_exceeded），已回滚；本卷为 **v2 返工版**
（子进程隔离物化）+ 完整 A/B 定量。四族定谳卷（`VERIFY_r2c2_verdicts_append.md`）
不受返工影响，仍有效。

## 1. 起点现值复测（克隆内实测，2026-09-07）

| 门 | 结果 |
|---|---|
| Step0 `--require-closure` | rc=0 PASS：109/109、uncovered=0、direct_violations=0、indirect 18/130、divergence 246 |
| 严格门 `--require-strict-closure` | rc=1 FAIL_STRICT **violations=221 = 7+162+13+39**（闭包 192、声明 37） |
| `kernel_plugin_manifest_gate.py` | rc=0 PASS（5/4/5; exact; unique） |

## 2. C4 定谳推翻（v1 卷结论保留）

消费点 `SystemLinkExecRuntimeMaterializeDarwinSyscallProviderObject`
（system_link_exec_runtime.cheng:2383 系）数据封闭：入参全数据、物化产物走文件
系统、记账三件套（providerObjectPaths/compileLogPaths/missCount）为 result 结构体
字段。C6 卷 §5 判的「织入流水」实为记账织入非行为织入——文件系统即组合边界，
物化可整体外移到组合根，内核臂转 consume-or-fail-closed。**该定谳在 v2 仍成立**
（v1 回滚的是物化的内存形态，不是外移结构）。

## 3. v1 回归定量（A/B 同树同头顺序实测，本线克隆 m31 基）

| 驱动 | v6 编译 RSS | 门树峰 | 对 1GiB 帽 |
|---|---|---|---|
| no-C4（8df93837…） | 920,658 KiB | 942,753,040B | 余 124MiB |
| v1 进程内预物化（2984d6e0…） | 1,048,384 KiB | 1,073,545,216B | **余 196KiB（侥幸贴线）** |
| **v2 子进程隔离（fdf99162…）** | **936,002-937,776 KiB** | **958,465,224 / 960,282,624B** | **余 ~108-110MiB** |

**机制**：v1 在父进程启动相经 B9 门面直调 darwin provider 发射器，发射链
（BodyIR/regalloc/aarch64 发射/对象写）的 arena 与 touched 页驻留垫在本进程
一切后续相之下——v6（最重夹具）实测 **+124.7MiB**。m31 克隆贴线 196KiB 纯属
侥幸；m35（+4MiB 级源码生长）必穿。教训：克隆内「贴线通过」不算过——**新增
产物/审计层的内存必须对基线做差，不是对守卫做差**。

## 4. v2 施工（2 文件，150 行 patch）

1. **内核臂拒收形**（system_link_exec_runtime.cheng，同 v1）：删 `darwinprov`
   import（全文件唯一使用点）；darwin 臂保留 HARD_RED 门、emit/target 门、
   objectPath 推导、missCount 累加，物化写臂换成 `FileExistsNonEmpty` 消费门，
   缺失即 ` system link exec: darwin syscall provider unit is not in the kernel
   composition (object missing: {objectPath})`（C6 拒收形，无兜底臂）。
2. **组合根子进程隔离物化**（backend_driver_dispatch_min.cheng）：
   `BackendDriverDispatchMinPreMaterializeDarwinSyscallProvider`（@borrows）在
   `CompilerRequestNew` 之前（借用源活性无争议，先于一切编译/链接流程）以
   `hostops.RunFileLogged` spawn **自身 `emit-darwin-syscall-provider` 子命令**
   （本文件既有子命令，直达 WriteObject，无递归——main 注册后直接派发，不经
   system-link-exec）。与兄弟 provider 的子进程形同构（`.compile.log` 落盘）。
   子进程=顺序相：进程树峰 = max(物化相, 编译相)，父进程零发射驻留。失败判词
   ` system link exec: darwin syscall provider emit failed: rc=… log=…`（兄弟
   provider 形）；argv0 缺失即 `absolute argv0 required` 拒收。

### 4.1 明示不做（对接面，同 v1）

`compiler_composition_aarch64_main` 未改：`CompilerMainCompositionProcessEntry`
（compiler_main.cheng:9064）硬契约禁止进 ProcessEntry 前 argv 解码/托管分配。
行为面=arm64 plugin-driver 组合根入口 darwin exe 转 fail-closed 拒收，接线归
插件驱动领地（C6 §8.1 同款先例）。kernel-only 驱动不受影响。

## 5. 静态门验收（v2 施打后克隆实测，与 v1 同值）

| 门 | 前 | 后 |
|---|---|---|
| 严格门 violations | 221 | **218=7+160+12+39**（闭包 192→190，B9 门面+provider 出闭包） |
| Step0 `--require-closure` | PASS 18/130 | **PASS 18/128**，direct_violations=0 |
| manifest gate | PASS | **PASS**（TSV/清单零改动） |

host_ops import 增于 dispatch_min（tooling，不在 kernel entry 闭包，Step0 盲区外）
——闭包/门数字不受影响，实测如上。

## 6. 烤机配对 + 门（v2 全链，车头 /tmp/cheng_w126_re）

### 6.1 配对（全冷禁缓存，同 out 路径 ×2）

| 轮 | rc | 耗时 | driver sha256 |
|---|---|---|---|
| c4v2_r1 | 0 | 219s | fdf99162fd4e03efd222bc817f17c3fb3d2b1d05cf546207635792eb98f12986 |
| c4v2_r1b | 0 | 223s | **fdf99162…（逐字节全等）** |

### 6.2 门（两次：A/B 四夹具 + 全量含探针，均 rc=0）

- A/B 四夹具门：4/4 PASS（ordinary/call_fixture/cold_nested/v6 判词与基线逐字
  同）；v6 编译 RSS 936,002 KiB。
- 全量门：**rc=0**——4/4 PASS 判词同基线；probe_pass=12 / probe_red=7（全为已知
  红：defer/for/match/closure/generic/try/array）/ **probe_stale=0**；
  max_process_tree_peak_bytes=960,282,624B。
- 报告契约：`provider_object_count=5`（子进程产物经内核臂消费入链）、
  `system_link_exec_runtime_execute=1`、`real_backend_codegen=1`；记账三件套
  由内核臂原样产出。

## 7. 树峰 vs 锚（验收升级栏，锚=C 链同闭包现役管理线 717-748MiB）

| 量测 | 值 | 对锚差值 | 判 |
|---|---|---|---|
| 烤机 report_rss（no-C4） | 722,075,648B | 锚带内/贴下沿 | 基线自证 |
| 烤机 report_rss（v2 r1） | 725,614,592B | **+3.5MB（+0.49%）** | 贴锚，C4 增量可忽略 |
| 物化子进程自身峰值（/usr/bin/time -l 实测） | **6,782,976B（6.5MiB）** | 锚下两个数量级 | 即用即放极限形：顺序相、父进程零驻留 |
| 门 v6 行（no-C4） | 942,753,040B | **+20.2% vs 748MiB 上沿** | **超 20% 触发核账——基线固有**（v6 夹具自重，内存线持有者账，非 C4） |
| 门 v6 行（v2） | 960,282,624B | +22.4% vs 748MiB 上沿；**C4 增量 +2.2%** | 同上归因：超额属基线，C4 增量 15MiB 级 |

按「>20% 开持有者核账」口径：门侧 v6 超额在 **no-C4 基线即已触发**（+20.2%），
属 v6 夹具编译自重（内存线持有者账面）；C4 v2 对锚增量 +2.2%（fork COW 采样窗
+父进程新代码页），物化相自身 6.5MiB。烤机侧全量贴锚。

## 8. 病态处置账（铁律执行序）

1. v1 穿帽（主线程 m35 终验）：rc=3 rss_limit_exceeded——已回滚，本卷 v2 修复。
   根因=进程内发射驻留（§3）；修复=子进程隔离（§4.2）。
2. v1 首轮烤机借权违规（16:58，cold `@borrows … managed argument lacks exact
   live source`）：就地修（@borrows+调用点前移），17:07 一次通过。
3. run1 探针 guard 量测抖动（并发负载窗）：串行重跑复现通过，无进程病态。
4. run2/3 两次 STALE=克隆锚点后主树 sizeof/SEQ-FIELDGET 基线漂移伪影（主树 src
   与克隆零漂移，git status 全量 diff 实证）；克隆基线按被测快照实况校正。
5. 全程无 >10min 车头（191-223s 带）、无 >5min 夹具，零 kill 动作。

## 9. 交付物与哈希

| 物 | sha256 |
|---|---|
| patches/r2c2_c4.patch（v2：2 文件/5 hunks，150 行；reverse-check 过） | 53b7f23db80474ab3ee37b2f94d91728b86d2885e7170774c358f52a1504ddb8 |
| 车头 /tmp/cheng_w126_re | 3ad3bc972ad7d82c238aa1e67e7790c1a0781c6d67d749f9eb463b0d60543777 |
| driver c4v2_r1=c4v2_r1b | fdf99162fd4e03efd222bc817f17c3fb3d2b1d05cf546207635792eb98f12986 |
| A/B 基线 driver（no-C4，仅台账） | 8df9383795d1d370eacc93c9ec7272659f10681407057bddbbc18f30b025d407 |

## 10. 边界与风险（如实记录）

1. 行为面（较 v1 增）：物化经子进程——成功路径产物/路径/记账全同（门 4/4 实证）；
   `.compile.log` 现由子进程运行日志落盘（兄弟 provider 同形）；写失败判词从
   WriteObject 错误文改 `rc=… log=…` 形（失败路径文案演进，如实记录）。
2. 早退路径 stray 文件（同 v1）：预物化后早期失败时对象残留输出目录。
3. fork COW 采样窗 +15MiB 级（§7）：守卫采到 fork 瞬间共享页时父+子账面短暂
   翻倍；顺序相语义不受影响。若内存线后续要求归零，可换 posix_spawn 精确属性
   或 vfork 形（host_ops 域，非本线 face）。
4. m35 终验归主线程：本线 A/B 在 m31 基完成（v2 帽余 ~108MiB，m35 源码生长
   ~4MiB 级不构成穿帽风险）。


## 主线程 v2 合入复验（2026-09-07 深夜，收割追加；v1 回滚事故闭环）

r2c2_c4.patch v2（子进程隔离物化）git apply 干净落地；静态门严格 221→218（闭包 192→190、arch_reach 13→12、间接边 130→128）；配对烤机 m38=m39=8dd503c4012c2e06da61985d66bd015b1eb403198048625205b60cb70c1bed9f（rc=0）；**主线程终验 rc=0**（上轮 v1 即死于此）：v6 PASS 0/0（COMPILE_RSS 1,042,080KiB≈994MiB 帽内；超 768MiB 锚 +22.4% 为 no-C4 基线即有的固有项——v6 夹具自重，持有者账挂内存线待核，非 C4 增量 +2.2%）。主树现役认证驱动=8dd503c4（层叠+C4v2）。事故闭环：v1 进程内预物化 +124.7MiB 发射驻留（A/B 实证）→主线程终验抓杀回滚→v2 子进程隔离（父进程零驻留、物化子进程 6.5MiB、烤机对锚 +0.49%）。教训已入 lessons：克隆内贴线通过≠过，新增产物内存对基线做差不对守卫做差。
