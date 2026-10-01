# task_r_orc_miss_fix.md — R 战役：鸿蒙真机 ORC 误释放（p=0x1）根因定位与解阻

日期：2026-09-12。承 task_m6q §1.2（QUIC 握手期 ORC 误释放/SIGSEGV，BLOCKED）。
修复全部发生在专用克隆 `/Users/lbcheng/cheng-f24/anchor_clones/orcfix`（cp -cR 主仓）；
UniMaker 侧仅迭代 ssm1smoke/scripts 战役文件；主仓 src/bootstrap 零改动（patches/ 与
本文档除外）；两仓 git 零写操作（patch 文件按任务授权 git add -f 进 index）。
设备 HUAWEI Mate 70 Pro+（serial 3KN0224C18003262），车头 /private/tmp/cheng_w126_re。

---

## 1. 判词

**ORC 误释放（p=0x1）根因三层定位完成，真机解阻达成**：QUIC dial 窗口从
「0.1-0.4s 必崩（registry_miss fail-stop / SIGSEGV 漂移）」变为「全链跑通
（fetch OK + sha256-match + T_FETCH done）」。T_RECEIVE 首帧链路首次在真机出数
（totalMs≈2022-2028ms），当前停在新暴露的下一层 `manifest_load_failed`（§5），
非本次 p=0x1 层，见 §6 待办。

## 2. 根因（编译器层机制，真机实证）

**冷后端 drop 胶合 canonical identity 碰撞**：

1. `bootstrap/cold_parser.c` 的 `cold_ensure_object_drop_helper` /
   `cold_emit_value_object_managed_releases_visit` 按 ObjectDef 生成
   `<cold-drop-object:N>` 释放胶合。真机 so 的符号化回溯证明 **多个不同布局的
   具体类型（MultiAddress 40B / SegmentRead 32B / Result 物化）的作用域 drop
   全部解析并调用同一个 helper（本次 = cold-drop-object:51，其真实布局 152B/
   19 字）** —— caller lr 稳定落在 `cold-drop-object:51 +0x284`（两轮独立
   符号化一致，见 §4 lr 证据）。
2. helper 按错误的大布局逐字发射 `cheng_mem_release`：非指针 payload 字
   （str 的 len|store_id 打包字、**flags 字（owned=1）**、Bytes.len）与越界字
   被当托管指针释放。**p=0x1 即 str.flags 字值**；p=0x21/33 即 len 字；
   p=so 静态地址即 const 串 data；随机栈字即 SEGV 轮。
3. 死法漂移机制（解释 M6q §1.2 交叉矩阵）：
   - release(p) → registry miss → `registry_miss_fail` fail-stop（诊断版 psb
     打出 p/lr/hdr）；
   - 同型 release 走 cached/命中路径时 `is_ledger`/refcount 对 header=p-8
     deref → **SIGSEGV addr=0xfffffffffffffffd（= 1-8+4，size 字段）**，
     pc 落 `cheng_mem_header_is_ledger+bc`（fp 链符号化实证）；
   - 一轮 SEGV 的 pc 落入 so 字符串常量区（控制流被越界字破坏的返回地址劫持）。
4. **darwin/ohos 代码生成逐字节一致**（夹具 + 同源 ssm1q obj 反汇编 diff，
   parseMultiAddress 等 0 差异）——宿主不崩纯因车头内置 runtime 的 release
   对垃圾指针宽容；**M6b 安卓真机 PASS 亦为老代际 psb 宽容下的假绿**（内存
   损坏同样发生，仅未暴露）。

## 3. 最小复现结论（宿主优先路径的答案）

- darwin 冷驱动夹具（克隆 `src/tests/r_orc_repro_stackinit.cheng`：全局槽位
  var 借用链 + var 未初始化 fill + Result 提取，先 4KB 栈污染成 1）**rc=0 不
  复现** —— 三形态在宿主发射正确且 runtime 宽容，问题为「真机 psb 严格
  fail-stop × 胶合错误 release」的组合暴露。
- 宿主不可复现 → 转 obj 反汇编对比 → 发现两 target 指令流一致 → 定性为
  「胶合错误 × psb 严格性」→ 真机 lr/fp 链符号化收口。

## 4. 诊断基建（本轮沉淀，UniMaker shim + psb，全部真机实测）

1. **stderr→hilog 桥**（M6q 已有）+ shim SIGSEGV/SIGBUS handler：直出
   sig/addr/pc/lr/sp/fp + **fp 链 12 层回溯**（handler 内 usleep 400ms 让中继
   线程刷出，`_exit(88)`）。
2. **psb lr 捕获钩**：`cheng_mem_release`/`_atomic` 入口经 shim
   `cheng_miss_diag_store_lr`（`__builtin_return_address(1)` = release 真实
   调用方返回地址）+ miss diag 打 `lr=`；shim 另打 `SSM1_BASE lr_fn=` 基址
   锚点（静态偏移 nm 可查）→ lr 精确符号化。**注意 (0) 拿到的是 psb 包装内部
   地址，必须取 (1)**。
3. miss diag 已含 p/lr/hdr/len/dead/live/q（M6q patch），本轮沿用。

## 5. 真机终验输出（真实 hilog，2026-09-12 06:46/06:48 两轮一致）

解阻后（psb 防波堤 + 源级槽位原地填 + 死代码删除）：

```
udp_probe OK send=4 wait=1 recv=4 connectB=0 sendB=4 waitB=1 lip=192.168.1.2 ...
T_PUBLISH worker serve rc=97 resp=OK chunks=45 headerLen=4625 kfChunk=0
    kfLen=65572 fileLen=2955365 port=4443 state=listening
fetch stage=0 elapsedMs=160/163   fetch stage=1 elapsedMs=311/313
m6q orc_miss p=0x5b716086d8 lr=... (5 条, 全为胶合误释放: const 串/静态地址,
    防波堤忽略, 不再 fail-stop)
fetch stage=3 elapsedMs=1514
fetch ok chunks=45 kfChunk=0 manifest=4625B chunk=65572B
    sha256-match=be20ab8ec6be22e984ffc92163bb5b73e2d22e4394b92d44cd127de18d3eb5a6
T_FETCH done fetchMs=1666
assemble+load bytes=2955365 resp=ERR manifest_load_failed
T_RECEIVE click->first-frame-on-screen totalMs=2022
    (fetchMs=1667 loadMs=2009 renderMs=13) state=ERR not_inited
    render=render rc=-6 detail=ERR frame_meta_invalid
SSM1 SHARE E2E FAIL fetchOk=true kfScheduled=false rendered=false
```

- **必崩点消除**：旧版 stage=1 后 95-113ms 必死；现进程跑完 fetch 全链且
  sha256-match（数据面 QUIC 环回握手/传输/校验真实工作）。
- **T_RECEIVE 出数**：首帧链路分解首次可得，但 `state=ERR not_inited
  rc=-6 frame_meta_invalid`——未达秒开闭环。
- 残余 miss diag（5 条/轮，p=so 静态地址）为胶合对 const 串的误释放，被
  防波堤中性化，不影响正确性但每次仍打点（观测面保留）。

## 6. 剩余层：manifest_load_failed → frame_meta_invalid（如实 BLOCKED）

- fetch 流整文件 sha256-match（数据面正确），但 `assemble+load →
  manifest_load_failed` → play/tick rc=14 not_inited → render
  frame_meta_invalid。两轮复跑稳定复现。
- 判读：下一层问题，两种可能（a）drop 胶合的**合法块误 release**（越界字
  恰为真实块指针时防波堤无法识别）在 load/manifest 缓冲上的次生损坏；
  （b）dial 首跳失败转 lip 重试（`dial->first-frame ready: 1.32s`，异常慢）
  与 assemble 的独立缺陷。需编译器根修落地后复验判别。
- 另：`dial->first-frame ready 1.32s` 中 dial 首跳（127.0.0.1）疑似超时转
  lip，fetchMs=1666 距秒开目标尚远，属传输层另案。

## 7. 修复与产物清单（patches/，评审后 apply）

1. `patches/r_orc_psb_guard_and_lr_diag.patch`（对 psb HEAD 态，146 行）：
   - **防波堤（解阻核心，随编译器修复回退）**：release registry-miss 由
     fail-stop 降级为 diag+忽略；release/retain/refcount 入口忽略
     `p < 64KiB` 非堆垃圾字（挡 is_ledger/refcount deref SEGV）。真实
     double-free 仍由 registry 命中路径 quarantine/double_release 检测暴露。
   - **lr 捕获钩**（`cheng_miss_diag_store_lr/get_lr` importc，shim 提供）
     + miss diag 增打 `lr=`。
   - 含 M6q 诊断 hunk（对 HEAD psb 的同内容，评审时与 m6q patch 去重）。
2. `patches/r_orc_quic_addr_owned_deepcopy.patch`（146+79 行，对主仓 HEAD，
   含 M6q native_runtime 三处同内容 hunk，评审去重）：
   - `multiaddress.cheng`：新增 **Result-free** `parseMultiAddressInto`；
     parse 返回值 data 深拷 owned 化。
   - `native_runtime.cheng`：init server **槽位原地填充**（消除 owned
     MultiAddress 局部——非零局部的作用域 drop 即触发胶合误释放）；
     `CopyAddrInto`/`AssignAddrTextInto` 存槽改深拷 owned；dial setup 死代码
     clientAddr parse 删除（其 drop 即真机首炸点之一）。
   - 含 M6q debug fdwrite/debug_set 三处（同 m6q patch 内容）。
3. `patches/m6q_psb_head_registry_miss_diag.patch`（已有）：psb 诊断 hunk。
4. **UniMaker 侧（战役文件直改）**：`scripts/ssm1_napi_shim.c` SIGSEGV/SIGBUS
   handler（fp 链回溯 + stderr 桥刷出）+ `cheng_miss_diag_store_lr/get_lr`
   C 钩 + `SSM1_BASE` 基址锚点；`scripts/ssm1_harmony_build.sh` PSB obj 覆盖
   变量。真机构建物：orcfix `artifacts/mobile_m6a_hap/psb_ohos_rguard.o`
   （8.99MB）、`libssm1napi.so.candidate`（46MB，16KB LOAD align 达标）、
   装机 HAP（06:48 轮）。

## 8. 编译器战役输入（主仓入库建议，高价值）

- **根因坐标**：`bootstrap/cold_parser.c` `cold_ensure_object_drop_helper`
  / `cold_emit_value_object_managed_releases_visit` / `cold_canonical_object_identity`。
- **机制**：多个具体类型（MultiAddress/SegmentRead/Result 物化）的 drop 解析
  到同一 canonical helper（真机符号化：caller lr 双轮稳定落
  `<cold-drop-object:51>+0x284`），helper 按错误布局逐字发射 release——
  非指针字（flags=1/len/越界字）与 const 串被当托管指针释放。
- **修复方向**：drop helper 选择按 exact TypeId/布局严格分型；str 字段
  drop 必须走 flags 门；seq 字段走 seq 路径；杜绝跨布局共用。
- **回归判据**：`r_orc_repro_stackinit.cheng` 夹具 + psb 恢复 fail-stop 后
  真机全链仍绿；防波堤 patch 可回退。

## 9. BLOCKED / 待办（如实）

1. **秒开闭环未达成**：T_RECEIVE 分解已出（fetchMs=1667 loadMs=2009
   renderMs=13）但 state=ERR（§6 manifest 层）。dial 首跳 1.32s 异常亦待查。
2. 编译器 drop 胶合根修在主仓编译器战役（bootstrap 与 src 由并行会话持有），
   本战役只交付定位证据与防波堤。
3. 防波堤为定向缓解：miss 忽略会放过「释放外来指针」类错误的崩溃暴露
   （diag 打点保留观测）；真实 double-free 检测路径未削弱。编译器修复后应
   回退并复验。
4. 锁屏密码仍需人工解锁后才能 aa start（两轮构建间隙遇锁屏各耽误一次）。
5. 主仓工作树存在并行会话改动（bootstrap/cheng_cold.c 等），本战役未触碰。
