# 纯 Cheng 最小内核闭环完成计划（2026-09-03）

> 数据/所有权/指针/C 冷链以 `docs/pure-cheng-kernel-zrpc-dod-soa-arena-orc-plan.md` 为准；
> 本计划只管闭环阶段 A-F。

目标：驱动能正确编译自己（GEN2/GEN3 字节固定点），768MiB 守卫内，四夹具 + 闭包全绿。
不变量：产物字节一致（配对铁门）、验证强度零减弱、守卫零弱化、每步独立验收。

## 现状快照

| 维度 | 已达 | 缺口 |
|---|---|---|
| 四夹具 | 2/4 正式绿 | cold_nested/v6 尾墙在途 |
| 语言特征覆盖 | ~15/30 种 | **6 种 parse 缺失 + 5 种管线缺臂 + 1 种未测** |
| 内存 | 873MB @ ordinary | 自举需 <768MiB @ 闭包编译（当前架构必超） |
| 回归门 | user_path_gate.sh ✅ | 需扩展覆盖新增特征探针 |
| 制度 | Step 0 ✅ Step 1 ✅ Step 2 ~95% | Step 3/4/5 |

## 依赖总图

```
Phase A: 四夹具收官（在途）
    ↓
Phase B: 语言特征实现（parse 层 6 种 + 管线层 5 种）
    ↓ （新增特征探针入回归门）
Phase C: 内存架构（mmap + 按需物化 + 生命周期切分）
    ↓ （768MiB 守卫下闭包编译可行）
Phase D: 闭包自举阶梯（编 683k 行闭包，逐墙清偿）
    ↓ （驱动自编自产出 exe）
Phase E: GEN2/GEN3 字节固定点
    ↓
Phase F: Step 4 CSG 取件 + Step 5 归档
```

## Phase A：四夹具收官【在途，~2-4h】

| 线 | 墙 | 文件 | 状态 |
|---|---|---|---|
| w95 | cleanup_cfg:5421 consume authority | cleanup_cfg.cheng | 已交付，尾墙在 w64 系 |
| w108 | body_ir_access:1623 decode admit | body_ir_access.cheng | 已交付 |
| w92 | primary bridge bind/sep 设计裁定 | primary_object_plan.cheng | 在途 |
| w94 | freeze appended storage 证据道 | exact_def_freeze.cheng | 已交付 |
| w88r | 内存 W1 批次 1 | csg_core 三文件 | 已交付（723MB 达标） |

**验收**：`user_path_gate.sh --driver <最新>` = 4/4 PASS。
**动作**：全绿后更新基线入库（`user_path_baseline.tsv` → 全 PASS）。

## Phase B：语言特征实现【预估 10-20 代理日】

### B1 parse 层缺失（6 种，需 parser.cheng + typed_expr.cheng 新增语言支持）

| 特征 | kernel 使用量 | 实现范围 | 预估 |
|---|---|---|---|
| while loop | 16 文件/863 次 | parser 循环体解析 + typed_expr while 节点 + BodyIR 循环 lowering | 2-3 日 |
| for loop | 31 文件/3,398 次 | parser for-in 解析 + typed_expr 迭代器 + BodyIR 循环 | 2-3 日 |
| closure/lambda | 5 文件/20 次 | parser 匿名 proc + typed_expr 闭包捕获 + BodyIR | 2-3 日 |
| try/except | 4 文件/7 次 | parser 异常处理 + typed_expr + BodyIR EH 模型 | 3-5 日 |
| tuple type | 6 文件/15 次 | parser tuple 类型 + typed_expr tuple 操作 | 1-2 日 |
| enum 表达式 | 10 文件/21 次 | parser enum 成员表达式 + typed_expr enum 值 | 1 日 |

**注意**：这些是**语言特性**，不是 bug。实现需走完整流程：
1. docs/cheng-formal-spec.md 语法定义
2. parser.cheng 解析规则
3. typed_expr.cheng 类型检查与语义
4. lowering_plan.cheng 降级
5. primary_object_plan.cheng 发射
6. 回归探针入 user_path_gate
每特性 = 完整编译器前端到后端的垂直切片。

### B2 管线层缺臂（5 种，parsed 但审计/lowering 缺臂）

| 特征 | kernel 使用量 | 缺臂域 | 预估 |
|---|---|---|---|
| sizeof | 10 文件/1,010 次 | typed_expr nested call | 0.5 日 |
| match/case | 9 文件/56 次 | typed_expr value-def producer | 1-2 日 |
| when | 9 文件/145 次 | typed_expr for-range 绑定表 | 0.5-1 日 |
| generic[T] | 4 文件/122 次 | typed_expr node authority | 1-2 日 |
| assert | 7 文件/120 次 | 待重测定性 | 0.5-1 日 |

### B 阶段验收

每特性一个最小探针加入 `user_path_gate.sh` 基线；全部特性探针全绿 = Phase B 完成。

## Phase C：内存架构【预估 5-10 代理日】

### C1 生命周期切分（w88 批次框架内）

| 批次 | 窗口 | 预期回收 | 文件面 | 状态 |
|---|---|---|---|---|
| 批次 1 | W1 事务链事务中间产物 | −336MB 驻留 | merkle 五文件 | **已批在途** |
| 批次 2 | W4 lowering 中间物（~98MB） | −98MB | lowering_plan.cheng | 待批 |
| 批次 2 | W5 world/universe（~170MB） | −170MB | system_link_exec + compiler_world | 待批（先采样） |
| 批次 2 | W2 源文本 share | 峰值 −87MB | snapshot_builder/incremental_plan | 待批 |

### C2 mmap 驻留 + 按需物化

- 规范事实磁盘态 = cargo store 内容寻址（583MB 磁盘已有）
- mmap 只读映射替代全量内存物化
- import 图驱动按需物化（对标 C 冷链 cap-512 惰性收集）
- 预期：驻留从「全闭包常数」变为「工作集比例」

### C 阶段验收

- ordinary RSS < 500MB（从 873MB 降）
- 768MiB 守卫下 kernel 闭包自编译可行
- 字节铁门全程

## Phase D：闭包自举阶梯【预估 2-8 周，不可精确预估】

驱动 .cheng 管线编 683k 行 kernel 闭包。每面墙 1-4h。阶梯深度取决于
语言特征覆盖率（Phase B 后应 >90%）与闭包形状复杂度。

**方法**：ignition chain 工具（drvBake → probes → gen2 → gen3）逐步推进。

**风险**：
- 阶梯深度不可预估（w102 教训：预估 3-5 日 → 实际 1.5h 证明不可行）
- 语言交互效应（两个特性单独可用但组合出墙）
- 内存随深度增长

**缓解**：
- 常驻回归门（每清一墙入库）
- 毒化网常开（UAF 立即爆）
- 分相位推进（每穿一个相位打一次 checkpoint）

## Phase E：GEN2/GEN3 字节固定点【3-5 日，Phase D 后】

- ignition chain：drvBake → probes → gen2 → gen3
- 字节逐位比较
- 三方哈希绑定（源/编译器/工具）
- 768MiB 守卫全程

## Phase F：Step 4 CSG 取件 + Step 5 归档

- backend2_cid 客户端扩展
- csg-core 对接
- 归档入库

## 排期总表

| 阶段 | 代理日 | 墙钟（3-5 线并行） | 前置 |
|---|---|---|---|
| A 四夹具收官 | 0.5 | 2-4h | 在途 |
| B 语言特征实现 | 10-20 | 1-2 周 | A |
| C 内存架构 | 5-10 | 1-2 周 | 可与 B 并行 |
| D 闭包自举阶梯 | **不可预估** | **2-8 周** | A+B+C |
| E GEN2/GEN3 | 3-5 | 3-5 日 | D |
| F Step4/5 | 5-10 | 1-2 周 | E |
| **总计** | — | **2-4 个月** | |

## 关键风险

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| 语言特性实现引入新墙 | 高 | B 阶段延期 | 每特性垂直切片+探针入回归门 |
| 闭包自举阶梯深度超预期 | 高 | D 阶段数月 | Phase B 覆盖率>90% 后预演 |
| mmap 驻留引入新类 UAF | 中 | C 阶段延期 | 毒化网+quarantine 已就位 |
| 并行线文件冲突 | 中 | 各线重试 | 文件面互斥+rebase 纪律 |
| 内存切分破坏编译正确性 | 中 | C 阶段回滚 | 字节铁门逐步验证 |

## 与现有战役的关系

- **四夹具收官**（在途）→ Phase A → 解锁 Phase B
- **w88 内存 L3**（在途）→ Phase C 首批 → 与 Phase B 并行
- **docs/memory-time-limits-plan.md** → 本计划的资源维度详细版
- **docs/cheng-minimal-kernel-plan.md** → 本计划的结构维度详细版
