# VERIFY_r2c2_verdicts_append — R2-C2 · C1/C5/C2/C3 定谳（现树重证）

日期 2026-09-07。工作克隆同 `VERIFY_r2c2_c4_append.md`。方法：①checker 同构切边
模拟（`.w/r2c2_edgecut_sim.py`，复用 `kernel_plugin_closure_check.py` 的
`build_core_import_graph/reachable_core_closure/manifest_closure_diff`，零改动纯
模拟）；②每族消费点逐字重证。基线：严格门 221=7+162+13+39、闭包 192、Step0
18/130。C4 落地后另见该卷。

## 1. 单族切边模拟现值（取代 C6 卷 §5 数字）

| 族 | 切边 | 闭包 | arch_reach | 未声明 | 净违规 | 定谳 |
|---|---|---|---|---|---|---|
| C1 regalloc | emitter→B8、artifacts→B3 | 192→186 | 13→**9** | 162→157 | 221→213 | **止损（B6c 墙+机制墙）** |
| C5 link 暗道 | coff/elf/macho→a64_link | 192→191 | 13→**13（零收益）** | 162→161 | 221→220 | **止损（随 C3 捆绑才有价值）** |
| C2 writer | direct_object_emit→B2、native_object_emission_plan→B2 | 192→187 | 13→**9** | 162→158 | 221→212 | **止损（机制墙）** |
| C3 body | primary_object_plan→B4/B6 | 192→188 | 13→**11** | 162→160 | 221→219 | **止损（B6c 裁定在 force）** |

注意：B3/B2/B4/B6 门面是**manifest 声明源**，切边后转 STRICT_MANIFEST_UNREACHABLE
（C1 +1、C2 +1、C3 +2），需族 A 式 manifest 修剪联动——净违规账已计。

## 2. 复合终态（新情报：五族互为完集）

十边全切（C1×2+C4×1+C5×3+C2×2+C3×2）模拟：**闭包 192→172、arch_reach 13→0、
掉出恰 18 文件**（13 arch 全集 + 5 门面：B8/B3/B9/a64_link/B2/B4/B6 中在闭包者）。
单族各自残剩通道被他族封死：aarch64_encode 的末三跳（a64_link/darwin_syscall/
a64 adapter）分属 C5/C4/C1；riscv64_encode 的末两跳（encoder_events/adapter）属
C1；x86_64_encode/writers 随 C2。**C 族是一个互为完集的闭包闭合方案**——任何
单族收口都不清空 arch 面，逐族推进到全切即严格门 arch_reach 归零的终态路线图。
C4（本轮已落地）是其中唯一 S-M 档；其余四族每族都撞 §3 的同一机制墙。

## 3. 机制墙定谳（逐族消费点证据，现树）

**公共墙**：frozen stage3 零间接调用范式下，内核闭包内文件无法消费插件侧行为
（B2 探针裁定 fn 值槽对托管复合全线不可用；数据槽只载值不载行为）。严格形只有
两条路：(a) 相界重构——消费点所在流水线开「需求回执→返回组合根→再入」挂起/恢复
协议；(b) B6c 形——把中立逻辑拖出内核闭包（进插件侧/组合侧）。C4 之所以例外，
是其消费点天然以文件系统为界（对象文件=组合间数据槽），物化可整体前移到组合根
启动相而不触碰流水线。其余四族消费点均在流水线中段、以内存结构为界，两条路都
超出 S/M 档：

- **C1**：emitter 的 adapter prepare 在 `regallocProductionPlanAndRecipesInto`
  内联（regalloc_production_emitter.cheng:1005），产物 recipes 立即进入
  freeze/ack/seal/snapshot 冻结链（:1158-1398，canonical allocator 唯一生产消费
  点，工程规范 7）；caller=primary_object_plan streamed 循环（:74905/:75514，逐
  函数粒度、回滚语义耦合 phase state）。相界=逐函数挂起/恢复整条 primary 流水线
  （compiler_main 级 L 重构）；B6c 形=emitter 迁插件侧（C6 卷已判）。artifacts→
  B3 六个调用点是三相 HARD_RED 门（target-match/proof 1042/bind 101-103，rv 重
  放语义权威在 riscv64 桶），单独切边净收益 −1 且门权威外移=验证弱化，禁。
- **C5**：`codegen_a64_link_units.cheng:12` 直 import aarch64_encode，三原语
  （BlPlaceholder/Adrp/LdrImm）在 coff/elf linker 的 text buffer 发射循环内
  mid-link 消费（coff_object_linker.cheng:1550/1678/1705、elf_object_linker.cheng:
  808/949-950），host darwin exe 链接（四夹具正典路径）实时需要；非文件界、不可
  前移。且单族切边 arch_reach 零收益（sim 实证 13→13）——单独动刀=纯能力拆除。
  严格形价值完全挂 C3 相界之后。
- **C2**：writer 门面（unitKey switch，B2 裁定 fn 槽不可用）在 direct_object_emit
  四个发射点（:224/:372/:483/:4746）+ native_object_emission_plan:389 消费；输入
  是本次编译产出的对象映像（sections/bytes/symbols/relocs 内存结构），非自足工件
  ——不可预物化；内核侧序列化中间格式=新设计+相界，M-L→L。
- **C3**：B6c 裁定（plan:334-337，迁移闭包含 165 共享中立符号）仍在 force；本轮
  加实证：B4 在 BuildItemsPhase **phase 内**逐 call-op 消费
  （primary_object_plan.cheng:76882 `x64units.CodegenX64BodyRelocWordOffset`，
  x86_64 reloc 字节偏移预测织入 planning 循环），非逐函数边界可挂起。最大单点
  （78k 行枢纽），L 档。

## 4. 后续路线（交主线程排程）

1. C4 patch 施打（静态门 −3、烤机/夹具证据齐备，见 C4 卷）。
2. 严格终态路线=按 C1→C2→C3 序逐族开相界（L 级，每族一套 exec_diff+字节门全
   责任）；或接受「C4 后 218=7+160+12+39」为该阶段终态，残余交 D 族 token 收权
   与 AB 声明手术继续压（A+B 施打即 −162，先于任何 C 族相界重构）。
3. backend2 的 emitter 消费（backend2_assemble:1201）不在 kernel 闭包，零影响。

## 5. 病态处置账

本卷为纯静态模拟+源码重证，零烤机零编译负载，无病态处置事项。
