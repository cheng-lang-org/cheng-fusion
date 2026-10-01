# lottery_line 普查定谳（零烤槽，2026-09-21）

任务：WDFS 刀之后 aarch64 冷后端布局彩票家族全量审计 + 活症状（TLS 握手相 60% 挂死/OPEN 帧未达）定位。

## 0. 窗口铁证（机器可查）
- 编译器自最后已知好烤后零变化：`git diff ac41af29e..HEAD -- bootstrap/` 为空
  （ac41af29e = WDFS 刀 = 同日 vpn 闭包 4 烤同 sha c5618d91 的时点）。
- 移动端闭包内唯一功能变更是 `src/quic/native_runtime.cheng`（a85e5b5f9 泵 recv
  所有权门 + DialPumpReadyCode 每轮 `cur=dialSlot` 重钉）。vpn_proxy/*、std/*、
  quic 其余文件零变化（`git diff ac41af29e..HEAD --name-only` 全清单核对）。
- p1vis(+4 import)/p1phase1/slabk1 均在 compiler 模块（src/core/**），不在移动闭包。
- a85e5b5f9 提交词自证：「层3 鸿蒙 PUBLISH 回归待设备回归+ohos 闭包重建后补验」
  —— 移动闭包含此 hunk 的第一次烤就是本次回归烤。
- ⇒ 「新布局」= 新 hunk 的 BodyIR，不是编译器新抽彩：编译器字节恒等 ⇒ 同源函数
  编译结果恒等 ⇒ WDFS 属面（确定性 per-layout 误编译）不可能由本次重烤新触发。
  60% 间歇签名也与布局彩票（同布局 100% 可复）不符，与时序/跨线程门竞争相符。

## 1. WDFS 属面普查（plan 表 {R3,R4,R5,R6,R7,R13,R14,R15,R9,R10,R11,R20} + array-base R12 跨写冲突）
区门（cheng_cold.c）：`cold_a64_loop_allowed_op` :39402 只放行
NOP/SCOPE_END/I32_CONST/COPY_I32/I32_ADD/I32_SUB/I32_AND/I32_CMP/ARRAY_I32_INDEX_DYNAMIC(限形)；
`cold_a64_loop_build_one` :39471 对 [header..last] 逐 op 验门 ⇒ **含调用/任何其他 op 的环
永远无 plan**（新泵门 hunk 含 CALL ⇒ 结构免疫）。while 免疫面见 WDFS REPORT（空块吞 ret →
term_allowed 拒）。逐位点（file:line 均为 bootstrap/cheng_cold.c @HEAD c03ad5470）：

| # | 位点 | 状态 | 红夹具形态 |
|---|------|------|-----------|
| W1 | peephole 边界 scratch R3 :40093-40107 | 已修(ac41af29e R2) | for 环 mask31 sum=1 rc=1→3040 |
| W2 | 通用 dispatch 边界 scratch R3 :41529-41538 | 已修(R2，前史刀) | for 环 `s=a[i]` 只读 a[0] |
| W2b | OBJECT_REF 分支 :41497-41506 | 干净(R2+注释) | — |
| W3 | 数组 peephole 载入/基址臂 :40074-40129 | 干净（R0/R1/R2+preg/R12 皆为拟写） | — |
| W4 | binop-copy peephole :40134-40188 | 干净（out=preg(dst)/R1；无第三人） | — |
| W5 | 区内通用臂 I32_CONST :40276 / COPY :41352 / ADD,SUB :41370 / CMP :41811 / AND :41841 / ARRAY_INDEX :41488 | 干净（仅 R0/R1/R2+preg(dst)） | — |
| W6 | cached load/store :39597-39620 | 干净（仅 reg↔preg mov） | — |
| W7 | terminator :73719-73904 | 干净（flush 先于 R9/R0 复用；CBR 左右值 preg/R0/R1） | — |
| W8 | helper scratch：ldr/str_sp_off、add_large 用 x16；ldr_off :33734 rt==rn\|\|rt==16 时用 R10 — 全调用点核对（:34168-34394 :35826 :36122 :41282 :73795-73821）均在无活 plan 语境（flush 后/非区 op）；a64_patch_bcond :33415 纯分支字改写无寄存器 | 干净 | — |
| W9 | R20/R19 交叉面：R20 仅 plan 表+prologue 存档 :73656；:74827 读 R20 在 codegen_program（进程入口约定，无 plan 语境） | 干净 | — |
| W10 | na 寄存器缓存 :39212-39242 | **只写死机器**（na_find 零调用者）→ 不可能衰减误读 | — |

**WDFS 属面活位点：0。** 历史两活位点均已刀，家族在 HEAD 闭合。

## 2. 三误译模式 emit 臂对应（任务指定第三面）
- P1 or-of-shifts（int64 内联 `(v>>n)|(v<<(64-n))` 丢 `<<` 项，2026-09-20 5c41e41d4 实证三目标一致）：
  a64 臂 :40351-40362 / x64 :43768-43782 / riscv :47756+ 逐臂核对均为 1:1 ldr/op/str，结构正确
  ⇒ 丢弃臂在共享 lowering/opt（非 a64 emit）。opt 侧 I64_OR 重写族 ：51061-51215（|0→x/|−1→−1/
  x|x→x/吸收/双 NOT/x|~x→−1，:51136 域）带 writer_count+dominance 守卫，逐条审未现误击；
  真臂未定位。**现状：源侧 uint64 战术绕行掩蔽（sha384.cheng），realizer 洞未根修**；
  红夹具在库：src/tests/int64_shift_semantics_probe.cheng（or_term 行）；HEAD 红绿未知 → 排队一烤定谳。
- P2 BytesLen 二读衰减：STR_LEN 臂 :41382 每次重导出正确；na 缓存死代码（W10）；
  史上红为 squash 前编译器，现 HEAD 无对应活臂。源侧 [scalar-once] 注释为历史战术层。
- P3 聚合 var 出参 copy-back（`out = wire`/EncryptInto seq）：copyback_line 七形状无红（裁定档案已灭失，
  主旨见任务书）；OPEN 链共用函数反证：FillTextFrame 同函数同 copy-back 臂同时服务 AUTH 帧
  （AUTH 已达服务器 ⇒ copy-back 活），⇒ 非本次红臂。

## 3. 活症状静态定位
- OPEN 链（VpnProxyMuxOpenStream → FillTextFrame → MuxWriteFrameRaw → TcpTlsWriteFrame
  → EncryptIntoWithSeq → WriteRecord）：每函数均与已工作兄弟（AUTH/hello）共臂；
  FillTextFrame 为直线 BytesSet×16+RawmemCopy，无环 ⇒ 无布局彩票形态。
- 唯一进入本次烤的行为差 = a85e5b5f9 泵门（native_runtime.cheng :4978-5002/:5027-5069/:5618-5627）：
  gate 先于重钉求值 + park 门只豁扫描窗。双角色（client+listener datapath 同进程）下 unlocked 泵
  逐轮交替重钉 cur，一轮以错侧 cur 入场 ⇒ 两 recv 臂同轮双跳、逐轮交替（饥饿推演：
  入场 cur=S → client 门(S==C)假→跳；重钉 C；listener 门(C==S)假→跳；重钉 S → 次轮同构）。
  纯 client（拨号环重钉）下 client 臂获救；listener 臂在该环恒饿。
  该门是否通达手机拓扑症状（relay worker 的 DIALJOB 收获/泵推进依赖），静态不可定谳 → 排队运行时证据。
- 结论：**本次红不是编译器布局彩票复燃**（§0 铁证）；建编译器刀无红夹具可立，按红夹具纪律不建。

## 4. 排队验证阶梯（验证槽执行，零烤槽不跑）
1. A/B 定谳刀：scratch clone 内 `git checkout ac41af29e -- src/quic/native_runtime.cheng`，
   其余 HEAD，重烤移动闭包 → 真机同场景对照。挂死跟 hunk 走 ⇒ 红在 quic 线源语义（层3 补验义务，
   归 quic lane）；不跟 ⇒ 回到编译器域并以坏烤 binary 为 marshal 窗取证起点。
2. 若走 A：服务器帧时间线（AUTH 后首帧 type/seq）+ 手机侧 WFRAME/WRAW 判词（源内既有诊断点
   vpn_proxy_main :2350/:2436）对时序；泵门态探针（pump_code/recv_allowed/park 三标量逐轮落盘）。
3. P1 定谳（独立小烤）：int64_shift_semantics_probe.cheng @HEAD aarch64 一烤；红 ⇒ 开
   or-of-shifts 根修刀（ lowering/opt 域，先二分 opt 开关再指臂）。
4. 编译器回归面（无论 A/B 结果都要跑）：金丝雀 2/2（two-line + ordinary_zero_exit_fixture）+
   wdfs_peephole_r3_redgreen.cheng 绿保持 + 三炉字节一致。
5. 纪律：临时域 tools/cheng_scratch_scope.sh；1GiB 进程树守卫；/usr/bin/diff；金丝雀先于一切判读。

## 5. 置信度
- WDFS 属面闭合：高（46 处 active_loop_plan 全枚举 + 全 allowed-op 臂逐行 + helper scratch 全调用点）。
- 窗口隔离（编译器零变化）：高（git diff 机器证据）。
- 泵门饥饿机理：中（源码推演成立，拓扑通达性待运行时证据）。
- P1 真臂位置：低（已类域未指臂；排队探针定谳）。
