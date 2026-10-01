# darwin_quic_fix_v2_scanpark.md — 泵门第二版（按读方分形态/扫描停靠）落地 + 三层验证（2026-09-21）

判词：**层 1 绿、层 2 绿、层 3 = A 3/3 绿 + B 2/2 绿（scan_failed 签名消失）+ C 入站腿 2/2 绿；
C 出站腿红，卡点钉在冻结安卓 sv_serve 端点（本轮改动面之外，单角色对照 PASS 隔离）**。
修复 = `src/quic/native_runtime.cheng` 泵门 v2 增量 + `src/tools/ssm1q_loopback_export.cheng`
扫描环 per-bind bind+pump 重构，未 commit，diff 冻结件
`.scratch/darwin_ohos_reg/v2_scanpark/v2_scanpark.diff`（native_runtime 部分在 v1 已 commit
a85e5b5f9 基线上）。

## 1. v1 层 3 红的机制定谳（代码级修订归因）

层 3 实测（rounds/dor_pub_1/2 05:26–05:31，VPN 摘除后）：A 三轮全绿、B 两轮红——
鸿蒙 PUBLISH listen OK，安卓 q2_fetch_new 60s 超时零输出，serve 侧
`T_SERVE conn=13 resp=FAIL serve_negotiate_4 detail=scan_failed spins=3000 stream=4`。

代码级根因（对任务书机制的一处修订）：**v1 位置门（cur==serverSlot 才准收）没有错，
错在 ohos 双角色扫描形根本不绑槽**。`QWaitReadable` 在 `q_listening==true` 形下每
spin 只在轮首泵一次且 **cur 保持遗留值不 bind**（fb 轮引入的「轮首单泵+扫内不泵」形，
其注释自述是为绕开 F-H5 无门时代的跨槽错读）——位置门下 `cur≠serverSlot` 恒成立 →
整个扫描窗零 recv → fd 恒可读（数据压在内核缓冲）→ `WaitReadableForSide` 立即返回 →
3000 spins≈5s 烧尽（实测 4.9s，1.6ms/spin）。darwin 不中因为
`ssm1_moq_serve/fetch` 的 `ServeWaitReadable/FetchWaitReadable` 是 **per-bind
bind+pump 形**（bind k 后泵，k==owner 处门开）。「会话注册 tick 跳一格」只是饥饿的
起点，真正饿死扫描的是轮首泵永不绑槽。

## 2. v2 gate 最终形态（一句）

**泵 recv 双分支 = `(slot<0 F-H5 例外 || cur==owner) && (无停靠 || cur==park)`**；
停靠信号 = per-side 单槽 int32（`msquicNativeScanParkListener/Client`：≥0=扫描环停靠
在该 bind 槽，-2=扫描活动中（等待窗，全部泵让路），-1=无扫描），由
`msquicNativeScanParkSet(side,slot)` 声明；扫描环（QWaitReadable）重构为
**无条件 per-bind `park=k → bind(k) → pump(1) → AppRecvAvailableAt(k)`**，退出清位。
 recv 只发生在 `cur==park==k==owner` 的 bind → avail 置位与扫描位置精确对齐 →
**ks≡owner 槽，错槽彩票关闭**（谁停靠谁读，泵只在无人停靠时收）。

设计对任务书的一处偏离（按代码实际调整，推演在案）：**保留 v1 位置门，不取消**。
逐 bind 推演：若取消位置条件仅靠 park（`slot<0 || park!=serverSlot`），扫描在
k≠owner 的 bind 自泵 recv → 数据落 owner 槽 → 全局 AppRecvAvailable(side,stream)
置位 → 扫描按序停在当下 k 并以 k 构造读端 → ks 错槽（B 形 owner=0 时 k=1 命中
avail 返回 1，negotiate 写绑槽 1 非 server-ready 即死）——位置门是 ks 正确性的
承重墙；park 的价值是**堵他泵毒窗**（accept 空闲泵/跨线程泵在扫描中途 recv →
avail 提前置位 → 扫描按序返回错 k；darwin RAW 探针 k=3/6 同型），以及让「双角色
轮首单泵」形可以安全改为 per-bind 形（fb 时代的跨槽错读正是无互斥下他泵混入）。

线程模型（已读码钉死）：darwin exe 与 ohos PUBLISH 的扫描/泵同线程交错，普通
int32 足够；ohos dual 双线程下走宽松可见——最坏停靠可见滞后一个泵 tick（毫秒级）
或一次多余让路，扫描烧尽是微秒级量级，不依赖内存序（`msquicNativeScanParkSet`
注释同文）。跨线程 cur 竞争残留：他线程 AppRecvAvailableAt 锁内 pin cur 可使
本线程单次泵门误判跳过一次 recv（纳秒窗 vs 毫秒 spin，下轮补收，非丢包）。

## 3. 改动面（主树未 commit）

| 文件 | 内容 |
| --- | --- |
| `src/quic/native_runtime.cheng` | +2 停靠 var、`msquicNativeScanParkSet` 导出、泵双分支各 +2 行停靠条款（v1 位置门保留，门判定先于重绑不变） |
| `src/tools/ssm1q_loopback_export.cheng` | `QWaitReadable` 重构：停靠声明 + 无条件 per-bind bind+pump（废止 `q_listening` 形态分叉与轮首单泵/唤醒泵），park 三态退出清位 |
| darwin 工具（ssm1_moq_serve/fetch） | 零改动（本就是 per-bind 形，且单线程下 park 恒 -1，门行为与 v1 逐位等价=层 1/2 直接继承 v1 绿） |

根治项 F-J 处方（`AppRecvAvailableAt` 按 session 槽键控 + 按 owner 槽返回）归 quic
lane，本轮不做，指针留档（QWaitReadable 注释内）。

## 4. 验证判据与回执

层 0 烤证：金丝雀 2/2（ac_two_line_canary bake=0 run=0、ordinary_zero_exit_fixture
bake=0 run=0）；serve_mac `5f10efe1…`、fetch_mac `474318c5…`（18MB 级，配方
`.scratch/darwin_ohos_reg/v2_scanpark/layer1_v2.sh`，沿 fix_landing layer1_formal.sh）。

**层 1 Mac 环回（4702，载荷 huguangsheng.ssm1 c11e2997… 2,955,365B）：绿 ×2**——
R1/R2 均 `conn=1 served=2 totalServed=2 manifest=4625B chunk=65572B` +
`fetch ok chunks=45 kfChunk=0 manifest=4625B chunk=65572B
sha256-match=be20ab8ec6be22e984ffc92163bb5b73e2d22e4394b92d44cd127de18d3eb5a6`，
FETCH_RC=0/0。

**层 2 跨机（Mac serve 4805 → 安卓 GBJ0222B24021692 q2_fetch_h WLAN，载荷封套
ac_env_r.ssm1 c55de971… 582,457B）：绿**——`fetch rc=0` + `fetch ok chunks=1 …
sha256-match=1eb20a17e77cb2b8c57045939af6e20fc19dc6cb091021a08d74fbcaf90ee629` +
`WRITE_OK bytes=582340` + 机上 sha256sum==1eb20a17 + Mac 拉回 sha256==1eb20a17 +
字节数 582,340，三方全等。轮前温度 40.0°C ≤ 43°C。
如实登记：首次 v2 轮（06:02）红——serve 零 conn、客户端 20 次重试 FAIL
negotiate_ack_4；同端口同载荷 v1 对照（.scratch/darwin_quic_fix/fixed/serve_mac）
3 分钟后绿（conn=1 WRITE_OK 582340）；当时 Mac load 飙至 213/swap 20GiB 满
（ld 链接成批资源性失败同窗）→ 判环境窗非 gate 回归；v2 同 binary 复跑即绿
（load 仍 207）——code 侧双证：darwin serve 进程 cur 恒 0（InitServerSession 在
cur 槽注册，listen 后无改绑），owner=0 时 v2 门与 v1 逐位等价。

**层 3 鸿蒙（重烤 .so → HAP 1000071 装机）**：
- 链路：`ssm1q_v2_ohos.o`（11,944,657B，stage3 05af823e，source
  ssm1q_loopback_export.cheng，undefined 集合与 v1 obj 57 项逐一全等）→
  `libssm1napi.so.v2` 58,645,048B sha256 76255512c708e90c…（16KB LOAD align 4/4
  0x4000，必需导出全 defined，cheng 残余 undefined=0；配方 link_so_v2.sh，沿
  rev_link_so.sh）→ hvigor strip 后 48539cdfa2133398… = HAP 内嵌件逐字节全等 →
  HAP 签名 137,130,650B（SignHap BUILD SUCCESSFUL）→ `bm dump` versionCode
  **1000071**/1.0.68（装机前 1000070 备份：jniLibs 前件
  `libssm1napi.so.pre_v2_1000070`=b61920c5、app.json5 bak_1000070；1000069 整包
  回滚点仍在 .scratch/darwin_ohos_reg/hap_backup_1000069.hap）。
- **A 3/3 绿**：rega_svb `BASE_SSM1 RECEIVE PASS totalMs=1982`；rega_ssm2
  `SSM2 UNSEAL PASS payloads=2 totalMs=2303`；rega_d3 `D3 DECODE PASS chunks=45/45`
  + `D3 PLAYDONE totalMs=32952 depthFrames=45`。
- **B 2/2 绿（本轮判焦点）**：dor_pub v2r1/v2r2 均 `fetch ok chunks=45 kfChunk=0
  manifest=4625B chunk=65572B sha256-match=be20ab8ec6be22e984ffc92163bb5b73e2d22e4
  394b92d44cd127de18d3eb5a6`，wall 1943/1945ms，fetch_rc=0，进程存活；
  **`scan_failed` 计数=0**（v1 代两轮该签名 3000 spins 烧尽），serve 侧
  `T_SERVE conn=12 resp=OK served headerLen=4625 kfLen=65572`。
- **C 双角色：入站腿 2/2 绿**（v2r2/v2r3：PUBLISH 与 SVFETCH 并发中，安卓
  q2_fetch_new → HAP 4444 fetch ok sha256-match 全等）；**出站腿红，卡点钉死在
  冻结安卓 serve 端点**：sv_serve_android（09-17 14:52 冻结件，F-H5/dual-role 锁
  37b873055 之前代）transport 层完成握手（HAP dial_ok）但 app-accept 永不落地
  （serve 日志 `accept timed code=0` 连发、`SV_SERVE_DONE served=0`），客户端
  negotiate_ack 等 1s 后会话超时断开 → `FAIL negotiate_ack msquic: pipe closed`
  rc=38。隔离对照：**同 v2 .so 单角色出站（无 PUBLISH，§18.7 同形）PASS
  totalMs=1658 rc=0，serve 端 served key=sv-closure length=28897** —— v2 客户端
  面无回归；出站客户端路径零 v2 改动码（sv_libp2p_fetch_export 无扫描停靠点，
  全程 park=-1，门=逐位 v1）。v2r1/v2r3 两轮无效（sv_serve 未在听，我的启动败，
  出站 rc=42 拨号超时对空口）；终轮重跑被 PIN 墙阻断（AskUserQuestion 未获应答，
  按纪律不代输）。C 出站腿判据自此挂起，清偿前提=安卓侧用当代树重烤
  sv_serve_android（归 quic/工具 lane）。

## 5. 并行 lane 事故留档（共享树自伤，规则 10 同族）

07:44 他 lane 提交 `938af0ca6` 把 `src/quic/native_runtime.cheng` **整体回退到
pre-v1 F-H5 形**（字节等同 22a8857bb，即 a85e5b5f9 的 v1 gate 被抹），连带清除我
未 commit 的 v2 工作树编辑（该提交本身是 plate/duck 线 docs+findings 变更，
native_runtime 回退疑为其本地 checkout 卷入）。清偿：`fix_landing.diff`（v1，与
22a8857bb 基线逐字节吻合，应用后文件 sha256=6b9e0f1c… 与本轮 pre-edit 留档哈希
逐位全等）+ `v2_scanpark.diff`（零偏移干净应用，patch_preflight PASS×2：ann=0/
displaced=0/wedged=0）；确定性复证受机器 load>160 阻断于 darwin ld（codegen 通过），
树状态由「fix_landing 哈希逐位吻合 + v2 patch 零 offset 零 reject」双证。教训入
lessons 候选：共享树上他 lane 的 checkout/commit 可无声回滚热区未提交编辑——热区
编辑必须当场留 frozen diff（本轮 v2_scanpark.diff 即因留档而可精确恢复）。

## 6. 护轨与清场

真机全程：hdc 外层看门狗（120–500s kill -9）+串行+轮间 sleep 3s+轮内温度门
（鸿蒙 340–360 ≤430 熔断线；安卓 400/410 ≤430）；既有安卓守护 serve
4444/4460/4480 逐端口零扰动；我起的 sv_serve_android 38120 已 pkill 清零（netstat
复核仅存既有三实例）；4443 零接触。Mac 侧 serve 实例即杀；无 hilog 残留进程。
主树仅两文件 M（v2 gate + QWaitReadable），无 stash/checkout/reset/commit；
probe_initvar_tmp.cheng 已删；临时产物全在 `.scratch/darwin_ohos_reg/v2_scanpark/`
与 rounds/ 任务目录内。

## 7. 证据清单（.scratch/darwin_ohos_reg/v2_scanpark/ + rounds/）

| 面 | 文件 |
| --- | --- |
| diff/指纹 | v2_scanpark.diff、pre_edit_sha256.txt、../darwin_quic_fix/fix_landing.diff（v1 恢复件） |
| 层 1 | layer1_v2.sh、canary_*.bake.log/out、fixed/sha256.txt、serve_l1_r{1,2}.log、fetch_l1_r{1,2}.log |
| 层 2 | layer2_v2.sh、l2_serve_v2b.log、l2_fetch_v2b.txt、l2_v2b.ssm2（拉回件）、l2_serve.log/l2_fetch.txt/l2_fetch_ctl.txt（环境红轮+v1 对照绿轮留档） |
| 层 3 烤链 | ssm1q_v2_ohos.o、bake_ssm1q_v2.log、link_so_v2.sh、libssm1napi.so.v2、libssm1napi.so.pre_v2_1000070、app.json5.bak_1000070、hvigor_1000071.log、verify_hap_v2/ |
| 层 3 轮次 | rounds/rega_{svb,ssm2,d3}.{run.log,verdict.txt,hilog.key}、dor_pub_v2r{1,2}.*、dor_dual_v2r{1,2,3}.*、svro_r1.hilog.stream（单角色出站 PASS）|
| 事故 | 938af0ca6 回退（git show 可溯）、ssm1q_v2_ohos.o undefined 对拍 tmp/v1_undef.txt==v2_undef.txt |

## 附：dual 收官轮（2026-09-21 11:18，VPN 关窗执行）

sv_serve_android_v2（ff72bcdb，38120）+ 1000071 同进程双角色：入站安卓 q2_fetch_new→`fetch ok chunks=45 sha256-match=be20ab8e…` rc=0；出站鸿蒙 SVFETCH→安卓 v2 serve `LIBP2P SVFETCH PASS totalMs=2716 rc=0`（对照 v1 冻结端点 rc=42/15384ms）；守卫 negotiate_send/noapp/exit42_70/crash=0/0/0/0，PID_ALIVE=1，temp=36.0°C，IN_OK=1 OUT_OK=1 **VERDICT=PASS**。层 3 矩阵全绿（A 3/3、B 2/2、C 双腿）。
