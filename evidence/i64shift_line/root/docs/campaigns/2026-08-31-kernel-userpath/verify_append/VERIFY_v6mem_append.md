# VERIFY_v6mem_append —— [V6-MEM] v6 内存持有者核账+守卫观察者膨胀根除（monitor −91%）2026-09-08

date_utc=2026-09-08 · 代理=V6-MEM（战役 R「v6 内存持有者刀线」）· 克隆=/Users/lbcheng/cheng-f24/v6mem（cp -cR 主树工作态全量含 artifacts；src/bootstrap/tools 与主树进场态全等，进场后唯本刀）· patch=cheng-patches/v6mem.patch（sha256=95cfc78e80d19a9ef3f6a285d9657dd62baa1e5ec13deba05c4aee11118fa67b，主树 `git apply --check` rc=0）· 自烤驱动=kernel_driver sha256=2eb84ffc0fd60d8ad46c7533fceefa010bf0e9992d5051eeffaeff627d41794c（cheng_w126_re 车头 212s 全冷）· 刀面=tools/beat_c_process_group_guard_runtime.py + beat_c_process_group_guard.sh（sha 锚同步）——禁触面零接触。

## 结论先行

**v6 超锚账翻开后是三本：①守卫口径虚高=monitor 观察者膨胀 200-365MiB（本刀根除，365→32MiB 恒定）；②driver 编译臂基座 ~600MiB 树峰（组合驱动固有：二进制只读面 517MiB resident+百万小分配基座，1 行输入同 603MiB——烤机产物架构域，非夹具可变）；③v6 特有增量 +190MiB vs ordinary（typed 密集，无 MSL 归因通道——MSL lite 破坏 atomic lease 已实证，挂账 typed/TypeArena 域与 OWN-WALLS/GEN2-P1 衔接）。观察者刀后：静窗 v6 守卫树峰 933MiB→727MiB（768MiB 锚内，−5.3%）；四夹具门 4/4+12 绿 7 红逐字零漂移（gate_rc=0，对 m14 认证判词）；guard fd_flag 合同 PASS 且 positive_report_sha256 与改前恒等（ca27e538…）；配对烤机同路径 sha EQ（b2=b4=2eb84ffc…）。主线程收割 patch 后全战役门表 RSS 形态回归真实基线。**

## 一、画像账（拆三本前的实测形态）

采样口径：外部进程树采样（0.3-1s）+ guard resource trace（0.01s）+ vmmap/heap/sample 现场抓取；门 exact env 形（run_guard_phase 全禁缓存集+BACKEND_JOBS=1）。

| 对象 | 峰值 | 证据 |
|---|---|---|
| v6 driver 进程本体 | 819-847MiB（dp3/dp5） | 外部逐 pid 采样；单调爬升 96s+尾段冲刺，无阶段释放 |
| monitor python 观察者（guard exec 同 pid） | **365-381MiB**（t+8s 前冲顶） | m46vm2 vmmap：MALLOC_LARGE(empty) 168M+SMALL(empty) 163M 尸体，live 仅 13-20M |
| 守卫树峰（门表口径） | 890-938MiB | driver 与 observer 峰值时刻部分重叠 |
| ordinary 对照 driver | 629MiB | 同壳同驱动（ord2），v6 特有 ≈+190MiB |
| 1 行最小输入 | 树峰 603MiB（driver ~500MiB） | mini1 轮 rc=0——恒定基座与输入无关 |

driver 峰窗 vmmap（400MiB 时刻）：MALLOC_SMALL 362MiB dirty/96 段（活分配 1,557,568 个 310.8MB，碎片 19%）+__LINKEDIT 574M virtual/320M resident+__TEXT 443M/197M resident=烤机组合驱动二进制自重；heap dump：577×64KB（cheng_call_on_large_stack 族）+百万级 ≤1KB 小分配（16B×308k/32B×117k/112B×166k…）。

**并案核对（对 RATCHET-DIAG 移交请求）**：v6 峰窗 VM_ALLOCATE 仅 2080K virtual/96K dirty（2 段）——**车头闭包的 InternPool pow2 阶梯 352MiB 在 v6 不同构**（单件编译 intern 活集小）；registry 同判非主质量（MALLOC_LARGE 活块仅 12MiB）。v6 主质量=MALLOC_SMALL 活集+二进制只读面，属编译臂基座域。

## 二、观察者膨胀根因（三源，全部实证）

1. **stable_regular_file_snapshot 驻留双倍**（主源）：prepare_command_identity 对 driver（170MB）走 chunks 累积（1MiB×170）+`b"".join` 再拼一份=**340MiB 同时驻留**，digest 后 data 被全部调用方丢弃（12 处调用 11 处 `_`）。sleep 轮（/bin/sleep 小文件）同点仅 44.5MiB——膨胀与 command 镜像大小线性。
2. **1MiB chunk digest churn**：stable_held_file_snapshot/command_self_image_fd_digest/held_output_digest 三处 1MiB chunk 流式读，对 self-image（185MiB）等大文件造成大段池尸体（128.0M+34.6M MALLOC_LARGE empty 段实证）。
3. **process_snapshot 每 pid 每 tick 走 psutil.Process 异常链**：spawn 密集 target（spawner probe：286-290 短命子进程）下 27,700 异常/s 级 churn→402MiB；对照 sleep 空载 42-48MiB 稳。kernel_driver 的瞬态子进程链（C4v2 物化族）触发同型。

定位方法学：ru_maxrss 阶段打点（spawn_blocked_enter 时刻已 365.8MiB=膨胀在 python 阶段）→MONITOR_PYTHON wrapper 证 bash exec 前仅 16.4MiB→逐段收敛到模块级 prepare_command_identity。

## 三、刀体（三修，全语义等价）

| 修 | 位置 | 等价论证 |
|---|---|---|
| ①流式快照 | stable_regular_file_snapshot：默认 16KiB 流式 digest、不累积不 join，返回 (None, digest, identity)；唯一 data 消费者（private_single_link_snapshot 字节对拍）显式 with_data=True 保原样 | sha256 对有序块流与全量 bytes 恒等；identity 三点核对（fd before/after/path stat）原样；12 处调用 11 处本就丢弃 data |
| ②digest chunk 16KiB | stable_held_file_snapshot/command_self_image_fd_digest/held_output_digest 三处 1MiB→16KiB | 同上；块尺寸不影响流式 digest 结果与 identity 核对；16KiB 落 malloc small zone 深复用带，消除大段尸体 |
| ③TBSDINFO 直读 | process_snapshot Darwin 主路径+rusage 复检：psutil.Process+create_time+status 三连→proc_pidinfo(PROC_PIDTBSDINFO) 单 syscall（p_start/p_stat/p_pgid 同内核字段）；新增 DarwinMetricNotReadyError 哨兵（rusage non-positive 早窗→None） | psutil 的 create_time/status 本就派生自同字段；pid 复用检测（start 对比）语义恒等；fork 早窗原版被 psutil 前置路径报告为 absent，哨兵路径对齐该可观测行为；真实内核错误仍走 MeasurementUnavailable 严格升级 |

sha 锚合同：beat_c_process_group_guard.sh MONITOR_RUNTIME_BUILTIN_SHA256 同步至 099177c9…；file_contract（无写位/nlink=1）保持。

## 四、验收

| 门 | 结果 |
|---|---|
| guard fd_flag 合同 | **PASS** rc=0（reject_count=8 全拒）；positive_report_sha256=ca27e538… 与改前恒等——判词/report 字段零漂移 |
| 观察者 A/B | spawner probe 402MiB→**42→11MiB**；v6 编译轮 monitor 365→**32MiB 恒定**（全程曲线平直） |
| 四夹具门（b2 驱动+刀后 guard） | **gate_rc=0 pass=4 known_red=0 stale=0**（ordinary 664/call_fixture 687/cold_nested 775/v6 893MiB 环境窗）；probe 12 绿 7 红**逐字对 m14 认证判词**（match/closure/generic/try/array 七红在位） |
| 配对烤机 sha EQ | b2=b4 同路径 kernel_driver sha256=**2eb84ffc0fd60d8ad46c7533fceefa010bf0e9992d5051eeffaeff627d41794c**（rc=0；首拍 b3 因 out basename 嵌入 __LINKEDIT 不同 sha≠——lessons 191 条重犯实录，同路径复拍即 EQ） |
| 静窗 v6 对锚 | 复验两轮：树峰 **727,302,144B=694MiB（锚 −9.7%）** / 终值轮 **712,704,000B=680MiB（锚 −11.4%）**——均 768MiB 锚内；monitor 32-33MiB 恒定曲线平直；终值轮环境窗实测三线他编译在飞（seqbridge/kfreplay/annotrel），数字为常态负载窗口径 |
| 树峰 vs 锚（门环境窗轮） | v6 门行 914,912KiB=893MiB=锚 +16.3%——差值主体=driver 本体（kfreplay/annotrel 他线编译并行窗），持有者=②基座+③v6 特有（挂账） |

## 五、移交账（下一批刀靶）

1. **v6 特有 +190MiB vs ordinary**：typed 密集路径（TypeArena/行布局/typed facts 展开域）——归因通道受限（MSL lite 破坏 os atomic tree lease 已实证：msl2 轮 abort「parent lease unavailable」）；建议下一刀自带分相 RSS 计数器（CHENG_COMPILER_CSG_STDERR 的 csg_stage rss_bytes 只覆盖 9MiB 级注册表面，MALLOC 310MiB 主账无 instrumentation）。
2. **driver 基座 ~600MiB 树峰**：二进制只读面（__LINKEDIT+__TEXT ≈517MiB resident）+百万小分配工作集——组合驱动（dispatch_min 单进程全闭包）架构域，四夹具共吃、与夹具内容无关；与 GEN2-P1 条目化（200-300MiB 理想态）同一结构方向。
3. **观察者残留**：monitor 32MiB=python+psutil 基线，已至仪器自然底。

## 六、证据目录

克隆 /Users/lbcheng/cheng-f24/v6mem/.w/：prof_m46b1/b2（m46 驱动基线）、prof_m46vm2（observer vmmap）、dprof_dp1-dp5（driver 画像+vmmap/heap）、obs_miniconda（psutil 对照）、spawn_probe/2/3b（假设检验）、msl2（MSL 反证）、wrapper_entry（bash 阶段排除）、diag1-4（阶段打点）、gate_v6mem1.log（四夹具门）、bake_b2-b4.summary（配对烤机）；快照类曲线均任务级目录，已随轮清理 cache/tmp。


## 主线程合入复验（2026-09-08 晨，收割追加；注意本卷 driver sha 均为线内克隆自烤口径）

v6mem.patch（tools/beat_c_process_group_guard 两文件）git apply 干净落地主树；主线程终验门（run_m31 驱动跨冷修/C6/sizeof/generic/seq_fieldget 全层叠态）rc=0——四夹具 4/4、12 绿 7 红 0 STALE。观察者刀的实效已由全战役门表回归真实：此前多轮「树峰 1.05-1.07GiB」读数中 monitor 观察者占 200-365MiB 虚高成分，本刀后门表树峰回落至 902-994MiB 真实区间。挂账（typed/TypeArena +190MiB 域、driver 基座架构面）已移交后续内存刀批次。


## 主线程合入复验（2026-09-08，收割追加；本卷口径为线内克隆自烤，跨树以主线程配对为准）

v6mem.patch git apply 干净落地主树（tools/beat_c_process_group_guard.sh 1 行 + runtime 调用）；主线程配对烤机 m48=m49=56be37003a273d7eefc6baa1da983c0593ea7fd9f1ba3d90d543e24acb4f9024（rc=0）——**与 m46/m47 同 sha（v6mem 刀不改发射面，符合预期）**。主线程认证门首跑 rc=3：（probe_tuple.compile）——门在 v6mem patch 改动 guard 后 command identity 校验严格化，属新合同生效需对齐门调用形（identity 基线未更新，非源码回归）；重试壳按 non-lease 规则不重试。待门合同基线更新后复跑。主线程教训：/tmp/oob_ab2 二次被清致测量壳断链——测量基础设施已全部迁移树内 .rebuild/（rebake_v2.sh/gate_retry_v2.sh），/tmp 不再承载任何独份资产。


## 主线程合入复验（2026-09-08，收割追加；本卷口径为线内克隆自烤，跨树以主线程配对为准）

v6mem.patch git apply 干净落地主树；主线程配对烤机 m48=m49=56be37003a273d7eefc6baa1da983c0593ea7fd9f1ba3d90d543e24acb4f9024（rc=0，274/307s）——与 m46/m47 同 sha（v6mem 刀不改发射面，符合预期）。主线程认证门首跑 rc=3：guard_abort command_identity_drift（probe_tuple.compile）——门在 v6mem patch 改动 guard 后 command identity 校验严格化，属新合同生效需对齐门调用基线（非源码回归）；重试壳按 non-lease 规则不重试。待门合同基线更新后复跑。主线程教训：/tmp/oob_ab2 二次被清致测量壳断链——测量基础设施已全部迁移树内 .rebuild/（rebake_v2.sh/gate_retry_v2.sh），/tmp 不再承载任何独份资产。

## 回归修复账（2026-09-08 午前，V6-MEM 追加；纠正上文「校验严格化」定性）

**对上文定谳的纠正**：认证门间歇 rc=3 `command_identity_drift` **不是**「identity 校验严格化/门调用基线需对齐」——失败 report 的 `command_identity_error` 字段实证为 `PermissionError: monitor runtime script is not an authorized single-link regular file`：monitor runtime script（`tools/beat_c_process_group_guard_runtime.py`）仓内刻意保持 555（写位合同：loader file_contract 与 verify 双端同检防篡改），**git apply/checkout/编辑器保存按 umask 重写为 755 打开写位**。间歇形态=git 操作落在门的不同相：启动前已脏→loader file_contract fail；门跑动窗内被 git 操作打脏→verify 期 held fd fstat 见脏 mode（fd 不锁 mode）→drift。主树 07:22 实测两文件 755（patch 合入时刻 mtime）即证。判定合同本身正确无放宽，本刀修复=恢复权限+错误可操作化，非门基线对齐。

**修复**：①主树两文件恢复 555；②EPERM/drift 错误文案附 mode 八进制+成因+`chmod 555 <path>` 指引（纯信息增量，判定零放宽；增量 patch=`cheng-patches/v6mem_v2.patch`，55 行，sha256=b0a2b38f88d0fd3db7696f6b03c39fcfda7e76b1d9d8532f7b780e2f9b77e089 之全量对拍基线、对已合入 v1 主树 apply --check rc=0）；③**交付合同：应用/检出本线触及的 guard 两文件后必须保持无写位（555），git apply/checkout/stash 会打开写位，guard 以 file_contract 或 command_identity_drift 精确拒绝并提示修复命令**。

**复验**：guard fd_flag 合同 PASS（reject_count=8；positive_report_sha256=ca27e538… 与改前恒等；anchor=ab667d06…）；克隆全门 ×2（555 态零触碰）rc=0/0、pass=4/4、probe 12 绿 7 红逐字零漂移。线内复现轮（probe_tuple drift）为自我同型污染（gate 跑动中 chmod u+w 编辑 runtime 加诊断打点）——反向实证合同工作正常；诊断打点已摘除，刀面仅余可操作化文案。
