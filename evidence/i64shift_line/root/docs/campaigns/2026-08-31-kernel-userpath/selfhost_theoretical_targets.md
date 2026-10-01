# 自宿主烤机理论极限目标（Phase C 批次 3 验收标准）

日期：2026-09-05。定标依据：本文件取代「以 C 链为靶」的相对目标——C 链只是现任，不是极限。

## 正式目标

| 指标 | 理论极限 | 当前自宿主实测 | 当前 C 链参照 |
|---|---|---|---|
| 全树烤机时长（35 条目） | **50–70s** | ~75min（4,500s，64×） | 280s（jobs=8） |
| 烤机进程树 RSS 峰值 | **100–200MB** | >12GiB（60×） | 717MiB（wall153 实测） |
| user-path 单夹具冷编峰值 | **≤200MB 同类** | 924MiB（gate 实测） | 同级 ~840MiB |

## 推导

### 时间 50–70s
- 逻辑工作量恒定：277 文件/73 万行/14,588 函数的 parse→semantic→lowering→plan→regalloc→codegen→link。
- C 链已优化路径 992s→240s（memo 两波）→280s（现态），B2 materialize 并行后理论 50–70s（战役既定目标，docs 烤机性能计划在案）。
- 双链同为原生码做同一逻辑工作：.cheng 侧消除实现性开销（跨条目驻留、O(N²) 扫描、缺 memo）后应收敛到同一量级；SoA/DOD 结构面不构成原理性劣势。

### 内存 100–200MB
- 理论驻留 = 最大单条目工作集（AST/IR/对象缓冲，arena 逐相释放）+ 全局符号表 + 流式输出缓冲。
- 前提三件（均已立项或部分落地）：L3 生命周期批次 2/3（跨条目/跨相 arena 释放点）、mmap 真归还档（wall150 已落 256KiB 阈值，曲线已见末段回落 420–550MiB）、全程序数据不常驻（W5 memo/按需物化方向）。
- 现存 620–726MiB 平台=35 条目 lowered IR+对象缓冲全程驻留（wall153 画像），是批次 2 的正靶。

## 大项分解（按依赖序）

1. **L3 批次 2**：lowering/codegen 分批释放（codegen 相 620–726MiB 平台的正靶，结构性改动）。
2. **memo/条目缓存平移**：C 链路径的 wall89 条目缓存+W5 fact memo 方法论平移到自宿主路径。
3. **B2 materialize 并行**：50–70s 时间极限的主体。
4. **O(N²) 清剿**：W5 模式（事务键扫描数组化）在自宿主路径的同类普查。

## 执行约束

- 全部大项**等自举阶梯清零后**在自宿主路径立项（wall152/154 在爬；否则每墙重测漂移）。
- C 链路径可提前验证方法论（W5 模式已验证）。
- 验收口径：tools/cheng_mem_protocol.sh + user_path_gate 既有纪律，双口径互证。

## 阶段 2 实测定谳（2026-09-05，phasec_stage2 线）

- C 链车头路径 50-70s **不可达**（两刀撞结构性边界，止损停手）：materialize 并行骨架在烤机路径是死代码（primary 恒走 reachable_only=1，真实物化走串行 fixed-point，cheng_cold.c:103864），真前提=wall102 三项（确定性预铸造/row 重映射/isolated snapshot），架构级。
- **首份 primary 逐相权威账本**：prescan 2.0s / entry 3.1s / **admission 184.6s（72%，头号热点）** / codegen 66.5s（已并行）/ emit 0.2s。仅 materialize 理想并行下限 ~97s。
- **修正后路线**：50-70s 的正确载体=.cheng selfhost_direct 管线接管（自举阶梯 GER2/GEN3 达成后）；admission 族（exact 校验互递归）用 mutation-epoch memo（移交 spec 在 VERIFY_phasec_stage2_append.md）；materialize 并行随 L3 批次 3 架构项。
- 交付：phasec_stage2.patch（+69/−4 门控诊断与默认恒等开关，字节铁门 4 连 EQ，四夹具 A/B 8/8 绿）——入 merge 队列。
- 教训两条：CHENG_ENTRY_CACHE=0 不翻译禁缓存总闸（须显式 CHENG_DISABLE_COLD_OBJECT_CACHE=1）；禁热替换运行中的 bash 脚本。
