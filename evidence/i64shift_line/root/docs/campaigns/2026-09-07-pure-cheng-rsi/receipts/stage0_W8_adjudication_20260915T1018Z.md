# STAGE0-W8 Leader 裁定（2026-09-15T10:18Z，绑 HEAD 60e37f0e）

## 复核
- patch `stage0_W8_20260915T101752Z.patch` sha16 `48728dbaee7cdbb4`；numstat `11 0 src/core/lang/typed_expr.cheng`；`git apply --check` fwd=0 / `-R`=1；`patch_preflight.py` PASS (`ann=0 displaced=0 wedged=0`)。
- 夹具 `stage0_W8_let_if_ternary_multiline.cheng` sha256 `84c776638f5efa83…` = 内核归档 `.rebuild/b_line/b16_fixture_tree_repro_let_if_ternary.cheng` **逐字节相同**。
- 判点 `typed_expr.cheng:6432`（`TypedExprIrAppendNode`，审计 6421-6432）；根因 = 多行 if-ternary 绑定初式的 if 种子取到外围 `BindingInitializer` 事件 role（`parser.cheng:34878` 直接取事件 role）⇒ typed_expr 控制语句守卫 `role==Condition`（:60886-60889）落空 ⇒ 文本臂以空 origin 栈建节点。补丁 = 在结构臂/文本臂之间 `return -1`（fail-closed，不放宽 origin 审计）。
- **W3+W8 同文件合叠**：`git apply --check` 两种顺序 **rc=0/0**。

## 裁定
- **候选 patch 接受**为段 1 候选；**零编译未验**（运行时效果、下游位移、`op=38` 族 b17 跨行字段链是否覆盖均未测）。
- 备选方向（parser 改种子 kind / typed_expr 用包含根条件子树）未 A/B，暂不纳入。
