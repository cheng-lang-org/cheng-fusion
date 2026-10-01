# VERIFY_r4_pickup_gates_append — R4-PICKUP-GATES 取件门自动化（篡改必拒 + 离线 fail-closed）

日期：2026-09-06。线名 R4-PICKUP-GATES（战役 R / 清验收口径 3 最后非阻塞项）。
范围：`tools/pickup_tamper_gate.sh`、`tools/pickup_offline_gate.sh` 落主树；主树源码零接触（smoke 载具 `src/tests/backend2_plugin_cache_smoke.cheng` 只读复用）。
载具：`artifacts/bootstrap/cheng.stage3`（sha256 `05af823e7db0c8ea…`，门禁口径），每腿双跑 rc+判词+stderr md5 零漂移。在线→组合→exec_diff 等价臂依赖 GEN2 守卫穿帽，本线不做，接口留注于 offline 门头注。

## 1. 拒收面触发点（file:line，现役树）

| 触发点 | 位置 | 判词 |
|---|---|---|
| 字节门 sha256 | `src/core/backend2/backend2_plugin_cid.cheng:160-165` | `csg_pickup_byte_gate_mismatch cid=… offset=… expectedByte=… actualByte=…` |
| 字节门 count | `src/core/backend2/backend2_plugin_cid.cheng:157-159` | `csg_pickup_byte_gate_count_mismatch …` |
| BindCheck（四元组重算） | `src/core/backend2/backend2_plugin_cid.cheng:143-148` | `csg_pickup_cid_rebind_mismatch cid=… recomputed=…` |
| provenance 门 d | `src/core/backend2/backend2_plugin_cid.cheng:170-184` | `csg_pickup_provenance_reject cid=… origin=… …` |
| LoadCached 键二次校验 | `src/core/backend/csg_plugin_pickup.cheng:176-177` | `csg_pickup_cache_key_mismatch cid=… receiptCid=…` |
| LoadCached 全门重跑 | `src/core/backend/csg_plugin_pickup.cheng:182-183` | （命中后同一 VerifyGates） |
| Store 先过门再落盘 | `src/core/backend/csg_plugin_pickup.cheng:240` | （VerifyGates 先于 WriteAtomic） |
| ④ FAIL_CLOSED（离线 miss） | `src/core/backend/csg_plugin_pickup.cheng:375-378` | Err 报文 = MissingError |
| MissingError 规范报文 | `src/core/backend/csg_plugin_pickup.cheng:337-341` | `codegen_plugin_missing=<triple> installed=[…]` |
| 已装清单（非 panic 判定，字典序） | `src/core/backend/csg_plugin_pickup.cheng:306-328` | — |
| T2 离线缺省（仅显式 `CHENG_CSG_PLUGIN_ALLOW_NETWORK=1` 开网） | `src/core/backend/csg_plugin_pickup.cheng:95-96` | — |
| root 未配置显式 Err | `src/core/backend/csg_plugin_pickup.cheng:159-160` | `csg_pickup_cache_root_unconfigured` → 同一 fail-closed 报文 |
| 组合准入包装 | `src/core/backend/csg_plugin_pickup.cheng:548-572` | `CodegenCompositionAcquireArtifactForTriple` |

## 2. 门禁表

### tools/pickup_tamper_gate.sh（1 健康 + 2 脚本级外部翻转 + 5 内建篡改，全部双跑）

| 腿 | 篡改手段 | rc | 判词（stderr 逐字，实测冻结） | stderr md5 |
|---|---|---|---|---|
| healthy.a/b | 无（unit 往返接受） | 0 | stdout=`PLUGIN_CACHE_UNIT_OK`，stderr 空 | `d41d8cd98f00b204e9800998ecf8427e` |
| ext-artifact-byte.a/b | 脚本对缓存 artifact offset7 翻单字节（XOR 0x01），经 offline-miss 腿 Acquire | 1 | `csg_pickup_byte_gate_mismatch cid=35e02d9880474ffb6fdf835e0c2b6cea3e3b413b7c5f9983b7e9de79a46d309f offset=0 expectedByte=251 actualByte=139` | `017a9f7fce4ee6de8067ca69e287c2d8` |
| ext-receipt-cid.a/b | 脚本对 receipt 自指 cid 首字符 `3`→`f`（合法 hex 过解码层） | 1 | `csg_pickup_cache_key_mismatch cid=35e0…309f receiptCid=f5e0…309f` | `a0e1d57cdee6552614de4d5ed1de2685` |
| tamper-artifact.a/b | smoke 内建同款字节翻转 | 1 | 同 ext-artifact-byte 判词 | `017a9f7fce4ee6de8067ca69e287c2d8` |
| tamper-receipt-cid.a/b | smoke 内建 cid 翻转 | 1 | 同 ext-receipt-cid 判词 | `a0e1d57cdee6552614de4d5ed1de2685` |
| tamper-receipt-quad.a/b | contractVersion 1→2（解码放行，BindCheck 必失配） | 1 | `csg_pickup_cid_rebind_mismatch cid=35e0…309f recomputed=e0aa2991b6a65c769763b6bad6d3dceb4cab8a156ea61612df5db0f15d8381d6` | `31e8316cd5d4af9f882d0f68c1b721b8` |
| tamper-proof-local.a/b | proofCid 翻一字节（伪造 local 自证） | 1 | `csg_pickup_provenance_reject cid=35e0…309f origin=local proof_not_self` | `5bdf0651adf52eaee43fd561bf4f21d1` |
| store-gate-reject.a/b | 带病 artifact 直接 Store | 1 | `csg_pickup_byte_gate_mismatch cid=35e0…309f offset=0 expectedByte=251 actualByte=167` | `7c2c16692e56c4891be53e837b6f60a4` |

确定性根据：夹具四元组 patternFixed32(11)/patternFixed32(23)/arm64-apple-darwin/version=1 + artifact `"cheng-plugin-artifact-fixture-v1"` 全冻结 ⇒ pickupCid=`35e02d98…309f` 恒定，判词全场确定。

### tools/pickup_offline_gate.sh（3 报文腿 + 断网负证 + 无 fallback 写外证，全部双跑）

| 腿 | 场景 | rc | stdout 报文（逐字，实测冻结） |
|---|---|---|---|
| offline-miss.a/b | 缓存有 x86_64 合法件，断网取 arm64 缺件 | 1 | `codegen_plugin_missing=arm64-apple-darwin installed=[x86_64-unknown-linux-gnu@ad9c9e69908b0ec0a16db9f68a1a659b88081d8059df5b3d56d41284495881ea]` |
| offline-miss-empty.a/b | 空缓存断网 | 1 | `codegen_plugin_missing=arm64-apple-darwin installed=[]` |
| offline-root-unset.a/b | 缓存根未配置（argv2 空） | 1 | 同 `installed=[]` 报文（root 未配置同走 fail-closed） |

附加断言（每腿）：stderr 恒空（md5=`d41d8cd9…`）；输出禁含 `csg_pickup_fetch`（allowNetwork≠1 零触网痕迹）；no-fallback 外证（脚本级查盘：被查 arm64 条目 `35/<cid>.csgplugin{,.receipt}` 不存在，预装 x86_64 条目 `ad/<cid>.csgplugin{,.receipt}` 仍在）。

### 退出码合同（两门同）

| rc | 含义 |
|---|---|
| 0 | 全绿 |
| 1 | 判词/rc/漂移不符（`gate=FAIL`） |
| 2 | 载具/环境失败（driver 不可执行、smoke 源缺失、编译失败、scratch/TMPDIR 合同违反） |

## 3. 证据（双跑零漂移 + 门本体负例自检）

- 门级双跑：两门各全量跑两轮，均 `gate=PASS` rc=0（tamper 11 PASS、offline 6 PASS 计数含 compile）。
- 门本体负例自检（scratch 内对脚本副本篡改一处冻结判词，`BACKEND2_GATE_ROOT` 钉主仓）：`expectedByte…139→999` 与 `installed=[x86_64-…→installed=[i386-…` 两个 doctored 副本均 `gate=FAIL` rc=1 且逐腿 FAIL 定位 —— 门判词非装饰，篡改必抓。
- 首轮探针（判词来源）：stage3 现编 smoke 后逐腿实测 stderr/stdout 原文，全部常量与实测逐字节一致，零理想串。

## 4. 复跑命令

```
bash tools/pickup_tamper_gate.sh          # rc=0 全绿（默认 stage3 驱动）
bash tools/pickup_offline_gate.sh         # rc=0 全绿
# 第二口径（不入门禁判定，仅如实记录）：
bash tools/pickup_tamper_gate.sh artifacts/backend_driver/cheng
bash tools/pickup_offline_gate.sh artifacts/backend_driver/cheng
```

ci_gate 接线（照 `check "pickup-tamper-gate" bash "$ROOT/tools/pickup_tamper_gate.sh" "$STAGE3"` 形态）留主线程窗口，本线未动 `tools/ci_gate.sh`。

## 5. 边界与留接口

- 在线→组合→exec_diff 等价臂依赖 GEN2 守卫穿帽：offline 门头注已留接口注（smoke `online-miss-stub` 腿 + `CsgPluginPickupAcquire allowNetwork=true` 路径 S4-C 已接线）。
- 第二口径现役驱动 `artifacts/backend_driver/cheng`（sha256 `0e7ca635…`）未跑认证（GEN2-WAVE2 在飞，认证态 `0be3b00b` 属烤机固定点域），按红线不入本线门禁判定。
- 临时产物全程 `tools/cheng_scratch_scope.sh` 生命周期，零跨任务残留。
