# REPLAY_D1.md —— D1 刀静态回放账（零烤预建）

刀：BC3 墙① PatternIterator 声明局部组行注册+注册即消费（c3 夹具前进墙）。
施工依据：`.rebuild/duowall_line/DUOWALL_DESIGN.md` 墙①节；`VERIFY_phaseb_bc3_append.md` §一.2/§二；`aggregate_zero_definition_group.md` §7「for 模式绑定」行+§8 读点。
补丁：`d1_typed_expr_pattern_iterator_group.patch`（6 hunk，1 文件，+184/−3，git a/ b/ 头，`patch -p1`/`git apply` 双兼容）。
基线：构建于 HEAD `f0b068a7` 与 `0dbde57f9` 两轮实测；两轮 typed_expr.cheng 基线 sha 同为 `60e25288…`（他线落库未触本刀域），五锚断言两轮全过=锚重对线机制有效。

## 一、红臂判词（三源一致）

`typed expr binding: exact local value-definition group unavailable`（rc=1 bin=no）

1. DUOWALL_DESIGN.md 判词权威节（c36 RETEST c3 + for_range_call_fixture，独立 scratch 根探针逐字复现；c36_line 原始件目录已被清扫，判词以设计档逐字记录为凭）。
2. VERIFY_phaseb_bc3_append.md §二：t_for compile=1 同判词（bc3 线移交登记，原始件在 `.rebuild/prestage_line/base_head/docs/`）。
3. aggregate_zero_definition_group.md §7：「`for` 模式绑定——IntroductionKind=PatternIterator 不注册 decl-local 组——不可达（本补丁不涉及）」＝预登记缺口行，即本刀施工面。

机理实读链（现 HEAD 逐锚核实）：PatternIterator 声明行在 `typedExprIrRegisterDeclarationLocalGroups` 第三闸（IntroductionDeclaration 精确比较）被 continue ⇒ `valueExprTransactionDefinitionGroupRowsByPatternRow[patternRow]` 恒 −1 ⇒ `typedExprIrExactLocalValueDefinitionRow` 判词。组行合同、消费尾段、函数收尾审计（`function group was not consumed exactly once`）、`TypedExprIrAddI32ConstNode` 载体构造器、`TypedExprScopeLoopVarTablePrepare` 记录表列名全部 file:line 实读在案。

## 二、注册语义增量回放账（全语料 for 头普查，只读扫描）

普查器 `d1_replay_census.py` 镜像行扫描判据（for 头行；RangeFlags 近似=range(...) 整调用 1-2 参或 ..</.. 算符形），清单冻结件 `replay_range_form_hits.txt` / `replay_non_range_forms.txt`。

| 基线 | for 头总数 | D1 潜在触发面（range 形） | 其中 range( 整调用形 | 非 range 形（D1 不触面） |
|---|---|---|---|---|
| f0b068a7 | 25716 | 25215 | **67** | 501 |
| 0dbde57f9 | 25664 | 25176 | **67** | 488 |

- **与 C3 线回放账对齐：range( 整调用形两轮均=67**，与 C3 REPLAY（全语料 25382 for 头中 67 个直根 call iterable 全部 range( 头）逐字命中。总数差异=语料自身漂移与口径差（C3 账为结构直根 call 形子集口径；D1 触发面另含 ..</.. 算符形，两者皆 RangeFlags==true）。
- c3 夹具在账：`src/a9_wall_probe/c3.cheng:3 for i in range(200):`（红臂本体）。
- for_range_call_fixture 三形态全在账：range(n) 一参 / range(lo,hi) 二参 / `(base+1)..<hi` 算符形 ⇒ 门 c RangeFlags 联证全覆盖。

### 语义增量判定（静态推演，烤后绿判收口）

1. 本臂唯一能改变的结果=红转绿或保持红（门任一不符 skip 注册=旧判词原样）。**无绿转红路径**：组经注册即消费行寻址闭合（definitionRows≥0 ∧ consumedFlags=1 恒成立），收尾审计不新增炸点；消费按（声明行,组行）直取，无按名扫描双命中面。
2. census 为触发面上界：实际触发还需结构树 lease + PatternIterator 声明行 + （声明名∧声明行号）双键记录命中。当前绿夹具若树内含 PatternIterator 声明行，本臂触发为其新增 1 组行+1 定义行+1 I32Const 载体 ⇒ 该函数 typed IR/lowering 指纹合法漂移（DUOWALL 字节漂移预算条款覆盖），run 行为零变化；若树内无该声明行则零增量。
3. 无 for 函数：循环体内无 PatternIterator 行可命中 ⇒ 零节点零行新增，产物逐字节不变（绿判③依据）。

## 三、既有 IntroductionDeclaration 形零增量

- 三道过滤闸与 Declaration 臂体逐字节未动；补丁仅在 Declaration 臂 `groupCount = groupCount + 1` 之后并列新 `if`。
- 新 if 条件=IntroductionKind 精确等于 PatternIterator：Declaration / Initializer / ParameterList / PatternEntry / Invalid 形恒 false；非 Local kind、非本函数行的行在早闸已 continue，根本不可达臂位点。
- +2 形参（ctx, sourceContexts）对既有逻辑零读写：sourceContexts 未用有在库先例（w24 `typedExprIrAddNilZeroDeclarationLocalTemplate` 同形参数在库已编译）；ctx 仅新臂读。3 调用点（注册函数内部 1 + 外部 2）传的是调用方既有在册值（两外点所在 `TypedExprBuildIrForScopeWithFactsAndExprLayer` / `TypedExprBuildIrForScopeFromExprLayer` 实读持有 ctx/sourceContexts）。
- 成本面：每到达臂位点的声明行多一次 `typedExprIrDeclarationIntroductionKind` 纯读扫描（O(lexicalBindingCount)），零语义面。

## 四、机械验证回执（两轮同绿）

- `patch_preflight.py`：PASS（ann=0 displaced=0 wedged=0）。
- `git apply --check` PASS → 正向 apply → 与 work 副本逐字节一致（回放确定性）→ `git apply -R` 还原 → 与基线 sha 逐字同（`60e25288…`）。
- 可重跑：`bash d1_build.sh`（6 步全链，锚断言失败即响亮退出=重对线触发点）。
- 活树零写入：全程产物独占本目录，唯一 git 操作=只读 archive。
