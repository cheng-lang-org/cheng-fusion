# task_t2_a4_opaque_seq.md — 编译器尾洞 A(4)「opaque sequence element size missing」根修与 L1 解阻

日期：2026-09-12。工作克隆 `/Users/lbcheng/cheng-f24/anchor_clones/scenfix`（Y 线攻坚克隆，
本线续用）。主仓 `src/bootstrap` 零改动（仅 patch 落 `patches/`）；UniMaker 仓只读（L1 仅迭代
战役文件 `scripts/ssm1_scene_shell.build.mjs`）。现役车头：`tmp/y_zfix/cheng_yfix`（Y 线烤）
与 `tmp/y_zfix/cheng_yfix2`（本线加 A(4) 诊断，行为中性已证）。

---

## 0. 结论速览

| 项 | 判词 |
|---|---|
| A(4) 根因 | **不在编译器，在生成器**：one-click 的 M2 wiring 类型注入路径（freeVarTypes / forcedReturnType）逐字绑定、绕过 `TypeMapper.map()` → `usedStructs` 收不到 `DistributedContent` → `emitStructs()` 静默空输出 → 场景源引用未声明类型；编译器在首个 `DistributedContent[]` 槽位的元素尺寸解析处按语义 loud-fail（行为正确） |
| 编译器侧修复 | 按战役需求清单 §6.2 补**诊断**（die 处带出元素类型文本），无语义改动；r50 obj 与 r51b host obj 双重字节等同已证 |
| 生成器侧修复 | `registerInjectedTypeUse()`（struct 登记走同一 `map()` 通路）+ `reorderM2StateTypes` 缺标记从静默返回改 loud-fail |
| r51 场景源 | **host obj + android obj 双目标 RC=0 全绿**（本线新出 `y-r51b-a4fix` 重生成件，runtime 数据与 r51 存档逐位一致） |
| 回归 | canary×2 + 车头 self-check + M4b ssm1d_export sha256 + r50 双目标重编——全绿（§4） |
| L1 | 装配链已验至 apk-build 消费面；APK 产出与真机烟测见 §5 |

---

## 1. 最小复现与根因（第一性链条）

### 1.1 复现（一发即中）

```
cheng_yfix system-link-exec --in:src/.tmp-exec/y_fresh_scene_pipe.cheng \
  --emit:obj --target:arm64-apple-darwin → RC=2
stderr: cheng_cold: opaque sequence element size missing (recovery=0 depth=2)
```

诊断探针（临时烤 `cheng_a4probe`，fprintf 带出查空点上下文）一发定位：

```
A4PROBE elem=[DistributedContent] kind=2 fulltype=[DistributedContent[]]
```

kind=2=SLOT_VARIANT：元素类型 `DistributedContent` 走到大写首字母启发式分类，而
`symbols_resolve_type()` 返回 NULL → `cold_slot_size_from_type_with_symbols_visit`
SLOT_VARIANT 分支 `return 0` → die。**编译器全部尺寸解析链没有「查空回溯登记」可言——
类型文本在整个编译闭包（entry + 全部被 import 模块）中只有使用、零声明**：

- 新鲜 r51 源 38 处 `DistributedContent` 全是使用（r50 存量源 65446 行有
  `type` 块声明，导入闭包各模块均无此类型）；
- 声明缺失时元素尺寸真值不可知，编译器猜尺寸=伪造，loud-fail 正确。

### 1.2 生成器根因（三处叠加）

`ts-csg/src/csg-cheng-transpiler.ts`：

1. `transpileWithInjectedParams` 的 **freeVarTypes 逐字绑定**（`localTypes.set(name, t)`
   + `paramDecls.push`），不走 `this.types.map(t)`；
2. **forcedReturnType 逐字注入**（Y 线墙 C 修复新增：`ret = { type: this.forcedReturnType }`），
   同样不走 `map()`。r50 时代 return type 从 TS 文本自然 map 成功（`map()` 内
   `typeDeclByName.has(t) → usedStructs.add(t)`），类型块随 `emitStructs()` 出件；
   r51 因 retText 推导为 `any` 落到 forced 路径，登记被绕过；
3. `emitStructs()` 只 emission `usedStructs` 闭包 → 输出空；而
   `scene-runtime-smoke-source.mjs` 的 `reorderM2StateTypes` 找不到
   `DistributedContent =` 等 5 个标记时**静默返回原文**——把缺陷埋到三层之后才爆。

r51 与 r50 的唯一差异就是第 2 条：同一生成器、同一调用点，natural-map→forced 的路径切换
丢掉了整个类型声明块（连带 `__chtFld_/__chtJsonOf_/__chtFromJson_` CHT helper 族也无法生成）。

## 2. 修复（克隆内，两层）

### 2.1 生成器（正解）

`ts-csg/src/csg-cheng-transpiler.ts`：

- 新增 `registerInjectedTypeUse(chengType)`：注入类类型文本统一补走 `this.types.map()`，
  与 `CHT_BRIDGE_RETURN_TYPES` 先例同构（数组递归登记元素、emitStructs 递归走成员字段；
  Cheng 拼写标量如 `str/int64` 对 map() 失败但无害——builtin 无声明可出）；
- 接线 4 处注入面：freeVarTypes、paramTypes/paramOverrides（`transpileWithInjectedParams`）、
  forcedReturnType（`transpileWithInjectedParams` 与 `transpile` 两处）。

`ts-csg/scripts/scene-runtime-smoke-source.mjs`：

- `reorderM2StateTypes` 缺类型标记从 `return code` 改 **assert loud-fail**（M2 wiring 必然
  引用 DistributedContent 族，缺块=生成器缺陷，不得静默）。

dist 重建（本地 tsc，`@types/node` 缺失为既有噪音，JS 照常产出 + freeze-dist 落 dist-frozen）。

### 2.2 编译器（诊断，campaign §6.2）

`bootstrap/cheng_cold.c` 两处 die 补前置诊断行（die 消息文本保持不变，工具匹配面不破坏）：

```
cheng_cold: opaque sequence element size missing: element=%.*s kind=%d seq_type=%.*s
cheng_cold: opaque sequence element size missing in codegen: slot_type=%.*s slot=%d
```

patch：`patches/t2_a4_cheng_cold_diag.patch`（对主仓现工作树 `git apply --check` 通过，
-24 行 offset 正常匹配）。

### 2.3 重生成（y-r51b-a4fix）

one-click 重跑（findings 14707 全旗标 + HEAD 快照 projectRoot + PWA 快照 + 双视频
content-id 映射 + `--tolerate-diagnostics`；第二次起内部编译挂 `--cheng cheng_yfix2`）：

- 生成一致性：`route-reachability` edges=299、manifest counts
  `47/11064/25206/1984/1885/299/5946/41641` 与 r51 存档**逐项一致**；
- runtime 数据**逐位一致**：`unimaker_scene_data.bin` sha256 `c8f798dc…`、
  `unimaker_glyph_sdf_pixels.bin` sha256 `b746e771…` 与 y-r51-multiroute 存档相同；
  media assets 同内容寻址（vid_hgs/vid1 同哈希）；
- 场景源恢复类型块（`unimaker-react.scene-runtime.cheng` 77101 行 `DistributedContent =`，
  61 处引用）并新增该族 CHT helper（类型登记后 CHT 发射器恢复工作）。

## 3. r51 场景源全绿（本线门禁）

变换链（对齐 r50 终版配方；r50 pipe→fix3 diff 实测全部为 prim 类改写，中间步被统一 pass
子sume）：`replay(stub+@borrows, annotated=362)` → `y_prim_global_rvalue.py(164 全局，
366 temps)` → `y_fresh_scene2_final.cheng`（80464 行）。

```
cheng_yfix  --emit:obj --target:arm64-apple-darwin   → RC=0, 24,648,229 B
cheng_yfix  --emit:obj --target:aarch64-linux-android → RC=0, 25,665,567 B
cheng_yfix2 --emit:obj --target:arm64-apple-darwin   → RC=0, sha256 与 yfix 逐位一致
                                                       (a1914ec2…)
```

**A(4) 后零新错误类**——首个全量编译即双目标通过（`__m2RebindHomeList missing` 级联假象
随之消失，Y 线 §5.2 判词闭环）。

## 4. 回归（全部真实输出）

1. **canary**：两行源 + ordinary_zero_exit_fixture，cheng_yfix compile rc=0 / run rc=0；
   cheng_yfix2 self-check `cheng_bootstrap_self_check=ok`（contract_hash 8ff14966f1f009d8）。
2. **M4b ssm1d_export**：ohosdev 克隆 `src/tools/ssm1_tick_daemon_export.cheng` 闭包
   `--target:aarch64-linux-ohos` 重编 RC=0，cheng_w126_re 与 cheng_yfix 双车头产物
   sha256 均 `29d6df69…` 与 M4b 存档（artifacts/mobile_m4b_hap/ssm1d_export_ohos.o，
   §7 真机终验版）逐位一致；m6a 存档同哈希互证。
3. **r50 不回退**：`y_r50_scene_fix3.cheng` 重编 host obj 23,817,386 B /
   android obj 24,817,722 B——RC=0 且字节数与 Y 线 §3.4 记录逐字一致。
4. **诊断 patch 中性**：r50 obj、r51b host obj 在 yfix/yfix2 下 sha256 逐位相同。

## 5. L1（场景壳 APK 重建）——构建全绿、装载全绿、烟测 BLOCKED（新错误类，详见 §7）

- 装配脚本 `UniMaker/scripts/ssm1_scene_shell.build.mjs`（仅迭代本战役文件；M3 两阶段
  provider .so 接口未动，新增三个透传/合链参数，见下）。
- **构建链逐步解锁（全部真实输出）**：
  1. mobile-shell-tool：w126_re 对 9/12 现源 `primary object emit failed` → 改用
     cheng_yfix2 编出（4.8s，help 子命令自检通过）；
  2. apk-build `--mobile-capi-cheng`：7/16 车头对现源 mobile_capi 闭包（std/crypto 零值
     初始化）报 wall-B 同族 → 透传 cheng_yfix2；
  3. apk-build `--moq-publisher-prebuilt-dir`：moq 闭包
     （media_moq_publisher_main → media.MediaIngestPin 的 rawbytes.Bytes 字段读）在
     cheng.stage3/w126_re/cheng_yfix2 三代车头下同报
     `plain local copy requires an address-free value object`（编译器战役新输入）→
     按 M3 既有纪律改挂 Jul 24 M2/M3 期已验预制件（moq_core/ps/hr/cp_local.o）；
  4. one-click summary：one-click 在 [3/4] 内部全量烟测编译失败时**不落 summary**；
     `one-click.summary.json` 按管线持久产物机械重建（domCss/routeReachability 取自
     各 json、computerUseManifest/mediaPayloadAssets 现算 byteCount+sha256；
     scene 计数部分缺失已在文件内 reconstructionNote 声明，apk-build 仅将其用作
     media 存在性守卫且媒体件齐备）；
  5. **场景 provider .so 三件合链**：r51 场景闭包新增直接引用 33 个
     program-support/udp-libc 导出（rawmem_write_char、epoch/mono time、stdio、errno、
     entropy、os/fd 桥、libc_* socket shims），ps 单体导出面不足；按 moq publisher
     同构 ps+cp+hr 三 obj 合链（cp 侧 8 个重复纯助手 objcopy local 化，
     rebuild_publisher_prebuilt.sh 同纪律）+ host_bridge.c/linux_intrinsics.S
     （bridge 侧与 ps 的 6 个别名碰撞同纪律 local 化）。
- **产物**：`unimaker-ssm1-shell.apk`（`tmp/y_l1_out/ssm1_scene_shell.summary.json`
  全量 sha256；apkSha256 见 summary），adb install Success。
- **真机烟测 BLOCKED**（新错误类，非本线回归——该壳 L4 层 M3 时「本轮未达」，无绿基线）：
  壳 Kotlin 正常运行（computer_use/present_enabled 打点），~80ms 后主线程
  `FORTIFY: pthread_mutex_lock called on a destroyed mutex` → SIGABRT。
  发生在 native 库装载序列内（先于 cheng runtime create 打点），堆上互斥量被销毁后加锁。
  三代对照：无 trio 的 ps 单体 provider 从未走到过这一层（先死于 dlopen 符号解析），
  故无「此前绿、现在崩」的回归关系；根因候选=provider so 三运行时副本的全局态互踩或
  vendor 驱动 dlopen 构造期冲突（前轮 tombstone 已见 RenderThread 上
  libadreno_app_profiles 构造期同类 FORTIFY）。需真机 lldb/花园式二分 load 序列，
  属独立攻坚项（§7-B）。
- 注：`hardwareAccelerated=false` 排障轮无效（同型 FORTIFY），清单已还原为不携带该实验补丁
  的最终构建。

## 6. 待主仓入库清单

1. `patches/t2_a4_cheng_cold_diag.patch` —— bootstrap/cheng_cold.c 两处 A(4) 诊断
   （已 `git apply --check` 通过，主仓并行车道改动在 86042+ 行区，无冲突）。
2. `patches/t2_a4_ts_csg_struct_registration.patch` —— transpiler.ts：含 Y 线墙 C 依赖 hunk
   （forcedReturnType/memberCallReturnType，未入库）+ 本线 registerInjectedTypeUse 及 4 处接线；
   对主仓 ts-csg HEAD 可直接 apply。
3. `patches/t2_a4_ts_csg_reorder_loudfail.patch` —— smoke-source.mjs：Y 线 forcedReturnType
   实参 hunk + 本线 reorderM2StateTypes loud-fail。
4. 本任务文档。

## 7. BLOCKED 项与编译器战役新输入（全部实证）

1. **L1 烟测层（§5）**：壳启动 ~80ms 主线程 `FORTIFY: pthread_mutex_lock called on a
   destroyed mutex` SIGABRT。发生点在 native 库装载序列（cheng runtime create 之前）；
   与 provider so 三件合链（ps+cp+hr+bridge）的出现相关（无 trio 的 ps 单体从未走过这层），
   根因候选=三运行时副本全局态互踩 / vendor 驱动 dlopen 构造期冲突
   （tombstone 见 libadreno_app_profiles 构造期同类 FORTIFY）。需真机 lldb 二分 load 序列。
   复现：安装 `tmp/y_l1_out/unimaker-ssm1-shell.apk` → am start 即现（GBJ0222B24021692）。
2. **one-click 内部全量编译（非 L1 链路）**：r51b 全量源（entry+6 parts）在 cheng_yfix2 下
   死于 `TypeNode graph object field object_row=388 field=0 owner=csgSceneRuntime.ChtSocialContent
   type= generic_count=0` → `body-store FunctionContractAdmission TypeNode graph invalid`
   （ChtSocialContent 字段 type 文本为空的 TypeNode 入图）。场景 part 单独编译全绿，
   仅全量编闭包暴露；归编译器 lane（本线 5 类预算内第 1 类，未深修）。
3. **moq publisher 闭包（非 L1 链路，M3 靠预制件绕过）**：
   `media.MediaIngestPin` 内 `rawbytes.Bytes`（{data:ptr,len:int32}）字段读物化为
   plain local copy 被 `cold_plain_value_copy_is_independent` 拒绝
   （contains_borrowed_address=1）。三代车头（stage3/w126_re/yfix2）同拒；
   按/裸返回路径不触发（BytesView 按值返回正常），拒绝与字段级 ptr 拷贝放行的
   不对称值得编译器 lane 复审。最小复现：`src/tests/y_a4b_v1_plain.cheng`（三分支
   v1_plain/v2_var/v3_let 全灭）。M2/M3 期预制件（Jul 24）相对现源（Aug 25 提交）陈旧，
   已如实标注。

## 8. 最终判词

- **A(4) 尾洞：解除**。根因=生成器类型注入绕过 usedStructs 登记（编译器 loud-fail 正确）；
  生成器补登记 + loud-fail、编译器补诊断后，r51 场景源 host+android 双目标 RC=0，
  A(4) 后零新错误类。
- **回归零失败**：canary/self-check、M4b sha256（双车头逐位）、r50 双目标（字节数与
  Y 线记录逐字一致）、诊断 patch codegen 中性（r50/r51b 双源逐位验证）。
- **L1：构建与装载层全绿（首次），烟测层 BLOCKED**（§7-1，新错误类，非本线回归）。
  装配脚本、重生成件、设备复现路径全部就位；烟测解锁后 L1 即闭环。

## 7. 纪律

- 主仓 `src/bootstrap` 零改动（仅 patches/ 下三个 patch 文件 + 本文档，`git add -f`）；
  UniMaker 仓零改动；全程零 git commit/push。
- 克隆内新增/修改：`bootstrap/cheng_cold.c`（诊断）、`ts-csg/src/csg-cheng-transpiler.ts`、
  `ts-csg/scripts/scene-runtime-smoke-source.mjs`、`ts-csg/scripts/y_replay_pipeline_r51b.cjs`、
  `ts-csg/src/.gen/y-r51b-a4fix/`（重生成件）、`src/.tmp-exec/y_fresh_scene2*`、`tmp/y_zfix/`
  （cheng_yfix2 与全部回归产物）、`tmp/y_a4_fix_reorder.py`。
- 临时探针（cheng_a4probe 车头 + bootstrap/cheng_cold_a4probe.c 副本）已还原/删除。
