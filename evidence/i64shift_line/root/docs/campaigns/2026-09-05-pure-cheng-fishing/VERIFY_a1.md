# A1 基线轮回执（2026-09-05）

> **深夜反转补记**：W-A1-1 定谳反转——三文件 @borrows 注解在他线烤机窗口被树操作剥除，"跨模块借用编译器缺口"的全部证据测自被剥文件。重注解后 C 链 7/7（六 smoke+合同）compile/run 双零，p7 跨模块借用全绿，import merge 旗标到位（XMOD 打印实证）。详见 findings.md 深夜条目；W-A1-8/9/10/11 四项新契约观察同录。门禁已迁 src/tools/ 并完成 C 链预验证（9 过 1 失，唯一失=neg4 载具依赖）。neg1_ptr 保持留档：ptr 拒绝属 no-pointer 策略门禁层，本编译入口不拒（--require-pure 旗标走 pinned-token 协议，未接）。

锚点 HEAD：`73debaef2b29ac253d5fb44a88793a9a524ab22b`（共享树含他线 wall152 在途 hunks，本役未触碰 `src/core/lang/parser.cheng`）。
指示遵循：纯 Cheng 编译器为权威入口；DoD/SoA/Arena/ORC；指针类型/操作不进公开面。

## 载具与入口（现场核实）

| 载具 | sha256 前 16 | 事实 |
|---|---|---|
| `cheng`（自举编排器，2026-07-16 烤） | a979322bfe90f691 | 主入口；CSG/seed/桥面层为 .cheng 层，主对象代码生成委托 C 车头 |
| `bootstrap/cheng_cold`（C 车头，8/7 烤） | 894af1449d0d4213 | 源码已提交至 8/31-9/5，二进制落后；现烤版 bd18328c0c896903 与 8/7 版同墙 |
| `artifacts/backend_driver/cheng`（共享纯链 driver，9/2） | 0e7ca635ce10c845 | 与在途 parser.cheng 失配（parser-owned global coverage mismatch parser=5 metadata=0）；共享载具未覆盖 |

编译入口调用形：`<compiler> system-link-exec --root:<repo> --in:<...> --emit:exe --target:arm64-apple-darwin --out:<...>`；cold 链要求输入位于包根 `src/` 下。

## 六 smoke 判词（当日矩阵：VERIFY_a1_matrix.txt）

6/6 编译层阻断，未通过；不是历史绿。墙形两族 + 一崩溃：

- **W-A1-1 跨模块 @borrows 实参准入缺失**（ecs_world_hash 直断；p1/p7 最小复现）。同模块 @borrows 两连借调全绿（p1b/p6），跨模块摘要未达调用点（C 面 callee borrows_args=0）。负责：编译器所有权链（kernel-userpath 热区）。
- **W-A1-2 bridge staging PathDirExists 假阴**（★重案 631 家族运行面）：一切含 Fmt 插值的闭包经 ./cheng 被"missing bridge surface stage root"挡死（目录实际存在）。本役已落 compiler_main.cheng 站点修（直调 os.DirExists(owned)，同 GateBootstrapBridge 先例），待自举重烤生效；根修仍归跨模块借用错编链。
- **W-A1-4 零 import 最简程序 SIGILL**：./cheng 编排路径崩（p4；cheng-2026-09-05-133908.ips），同输入 C 车头直呼全绿；他线 kernel_driver_w150 当日多份 SIGILL 报告疑同族。

## 现行契约定谳（探针实证，非缺陷）

- 借用值仅许传给显式 `@borrows` 形参；非 var 托管形参默认 move（规范 §0.2/§67；p5e：结构体赋值消费源）。
- 借用源入容器（add/str[] 存储）需显式共享；本役共享入口收敛为 **Fmt 插值拷贝**（p5f：分配/释放/内容三项干净）。`CloneStr` 在 C 链运行期 registry_miss（W-A1-3，p5c，已立案）。
- 托管返回值 let 绑定、@borrows 返回托管字段（自动共享）均合法（p2/p6）。

## 已落源码改动（本役可负责部分）

1. 规范 §594 迁移：冗余显式默认初始化 8 处（physics2d.cheng ×4、game_tick_replay_smoke ×1、physics2d_forces_determinism_smoke ×3）。
2. 借用契约迁移：ecs.cheng 17、physics2d.cheng 8、runtime.cheng 4 个只读函数补 `@borrows`；preimage 的借用源 add 改 Fmt 拷贝；game_tick_replay_smoke 篡改段改 @borrows 字段克隆。
3. compiler_main.cheng staging 站点修（两处 PathDirExists/PathFileExists → os 直调，附根因台账注释）。
4. 新增：`src/tests/fishing_platform_contract.cheng`（正例合同）；`tools/fishing_gate.cheng`（baseline 全实现，其余阶段 NOT_IMPLEMENTED 硬失败）；fixtures/ 18 支探针与负例；capabilities.json。

## 设备基线（adb 现场回读）

HUAWEI DCO-AL00（GBJ0222B24021692）：Android 12 (SDK 31)、arm64-v8a、Vulkan 1.2.0（feature level=1、compute 特性在列）、Adreno 730 / GLES 3.2、1212x2616@500dpi。
缺口：计划要求冻结一开发机+一较低性能验收机，当前仅一台在线。

## done 判据

未达。能力清单已可重算且每项有判词（capabilities.json），阻塞项有最小复现与负责模块；但"复跑现有 smoke"要求 compile/run 全绿，当前 6/6 红，门禁自测（参数与失败退出码）待链通后执行。**未填任何 PASS。**

## 复现配方

```
# 单探针（例）：
tools/cheng_scratch_scope.sh fishing-a1 sh -c \
  './cheng system-link-exec --root:$PWD --in:$PWD/src/tests/ecs_world_hash_smoke.cheng \
   --emit:exe --target:arm64-apple-darwin --out:$CHENG_TASK_TMPDIR/out'
# 夹具暂存规则：fixtures/ 下 .cheng 需复制进 src/tests/ 才可被 cold 链接受，
# 用后即删（fishing_gate baseline 已内建 stage/unstage）。
```

## 纯链载具窗口跟踪（深夜续）

- 他线 round6 烤机（14:47-15:58，fp_D1r2 车头）失败于 **wall153：parser forwarding production: invalid appended forest / authority invalid row=72831**（parser.cheng 热区，正在逐模块探针归因）。
- fp_D1r2（12:39 纯链 driver）实测为世界钉死定点头：编译任意闭包报 parser-owned global coverage mismatch——通用纯编译器只能来自自举成功的 stage3（fp_D2）。
- 本役干净参照：现烤 C 链 7259fc95caa60b66，七测试 compile/run 双零，gate baseline 9 过/1 失（唯一失=neg4，[cheng_seed] 在 .cheng parser 层，纯链载具即拒）。
- fp_D2 落地后一键验证：`sh docs/campaigns/2026-09-05-pure-cheng-fishing/run_fp_d2_validation.sh /tmp/oob_ab/w152/fp_D2`（7 测试直跑 + 门禁编译 + baseline PASS 断言，回执落 verify_fp_d2/）。
