

# wall104.VERIFY

## wall104 报告：freeze 层相等子句墙已清（三臂连清，v6 判词三连推进至 call-result 槽定义行缺失 = 授权文件边界，停手移交）

**wall104 目标墙已死。** v6（src/tests/zz_v6_w7.cheng）烤机判词 `exact identity schema [freeze] … slot authority mismatch def_type=20 slot_type=16`（op=1，:2281-2284 冻结相等子句）消失，三轮判词推进：

1. r1 相等子句豁免 → `op row=7 managed borrow projection is broken … parent_live=0`（链式字段投影 BORROW_PROJECTION 主门）
2. r2 EntrySlot 槽域链式投影臂 → `slot row=3 definition count=0`（槽循环倒排计数）
3. r3 计数过滤同款豁免 → `slot row=7 has partial authority kind=1 exact_type=7 place=0 origin=-1 … slot_name=r1 … writers=1 defs=0`（call 结果槽）

r3 判词定性 = 新域：op11（k=2 t=7）以 target 写槽 7（r1, i32），但全函数无任何 `valueDefSlot=7` 定义行（defs=0 为全 op 扫描，非过滤所致；slot 12 同形排队）。缺的是 call-result 定义行产出（call-mirror 段 derive/lowering 职责），identity 层无行可核。修法须动 exact_def_derive.cheng / lowering——越出本线唯一授权文件 = 契约边界，停手完整移交。

### 修法（仅 src/core/analysis/exact_def_identity.cheng，三臂全 fail-closed 非弱化）

- **r1 相等子句豁免**（主循环 type+storage 子句）：fieldProjectionBorrow 形（BorrowProjection ∧ OwnBorrowShared ∧ FieldLoad ∧ 借主域有效）豁免 def/slot TypeId 相等子句，改核 hop 已证三元组冻结残形（`exactDefIdentityFieldProjectionHopTripleValid`）：derive hop 同序形状子句逐字（4 操作数/dst 双直等/base 在界/offset≥0/width∈(0,dst 全宽]/双 TypeId 已绑）+ 槽 TypeId canonical fact row 在册 + 物理 TypeId 可解析（hop 命中 ⇔ wall100 配对绑定；缺行/断链 = 证据洞，false 交回原相等子句原判词）。其余形状相等子句逐字保留。
- **r2 EntrySlot 槽域链式投影臂**（`exactDefIdentityEntrySlotChainedProjectionValid`）：derive EntrySlotTag 臂把 opOriginIds 冻结为借主槽 id（槽域拼写），基座落在「同借主根前序投影结果槽」上的链式形被原主门按 op 行误读 origin（originInRange/parentSlot/parentLive 全行域解释 = 类别错误守卫）。新臂：终态根（entry 形参槽 ∨ 全局地址槽，wall27 直等臂同款）+ entry 所有权双形态互证 + `opReadADefOpRows` canonical 读边（批 2 read-edge 总门已证规范）逐跳上溯，每跳定义行须为同借主根的 BorrowProjection FieldLoad 定义行，行号严格递减灭环、深度限 64；直等形（base==借主槽）仍归 wall27 原臂，本臂不放行。
- **r3 计数过滤镜像**：槽循环倒排计数过滤的 TypeId 相等子句同款豁免（复用 r1 helper），producer/place/origin 三过滤逐字保留，漂移行仍被跳过，计数门覆盖面不变。

### 门禁

| 件 | 结果 |
|---|---|
| 秒级门（cheng_now5 编 exact_def_identity.cheng） | r1 tc.o / r2 tc_r2.o / r3 tc_r3.o 全 rc=0 |
| 车头 cheng_w104 × v6 | compile=0 / run=0（语义参照，r=7/offset=8/n=108 夹具内断言保持） |
| 车头 × ordinary / call_fixture | 0/0 与 0/1 契约预期 |
| 烤机 r1/r2/r3（build_kernel_driver.sh） | 全 rc=0 |
| **烤机驱动 r1 × v6** | compile rc=1，判词推进①（op7 链式投影主门） |
| **烤机驱动 r2 × v6** | compile rc=1，判词推进②（slot3 计数门） |
| **烤机驱动 r3 × v6** | compile rc=1，判词推进③（slot7 partial authority = 移交墙） |
| 烤机驱动 r3 × ordinary | compile=0 / run=0 不回归 |
| 烤机驱动 r3 × call_fixture | compile=0 / run=1 契约预期不回归 |
| cold_nested | 只记录：并行 w103 线领地，本线未跑（w103r2 同窗在烤） |

### 痕迹

- 补丁：/tmp/oob_ab/identity_wall104.patch（终版 = r3 累积式 vs HEAD，439 行）；过程 identity_wall104_r{1,2,3}.patch。git diff --stat 该文件：apply 前 +135/−34（在树 w27/85/87b/91 hunks）→ apply 后 +296/−44；本臂净归属 +161/−10（5 hunks 全带 [wall104 标记）。
- 车头 cheng_w104 sha256=49ea6e7e0fa04ad880701bad164a2d01b60f075471c88b08dfd7360d94bc4d99（13 warnings 全既有 format 类）。
- 烤机产物 sha256：r1 kernel_driver_w104=8489a1308e1fffd5f2be0b9239670c810eeb7e0e25d09be1b4ba8fd13c495476（size 185068160）；r2=b72b3bd008b742574bd23a29d2e6ab4e5070ea6e34d21f6b720a33c5f4e3b153；r3（终版）=268fb1e5d6d3f804e1bec59321a5d25fc185e17f3d4ab69a417c19857c17fec4。
- 租约：并行 w101/w103 烤窗口多次 `os atomic tree: parent lease unavailable`（rc=2），串行重试全消；RSS 未触帽（全程无 rc=125）。烤机预算 3/3 用尽。
- 遗留移交：v6 下一墙 = fn=2 槽 7（r1）/槽 12 call-result 定义行缺失（call-mirror 段产出，derive/lowering 域）；车头语义参照不受影响（compile=0/run=0）。
