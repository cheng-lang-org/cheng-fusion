# DELIVERY_D1.md —— D1 刀交付说明（预建件，落库等预建三刀提交窗）

## 冻结件清单（本目录独占）

| 件 | 内容 | sha256 前 16 |
|---|---|---|
| `d1_typed_expr_pattern_iterator_group.patch` | 施工件（typed_expr.cheng 单文件，6 hunk，+184/−3，git a/b 头） | 见 `MANIFEST.sha256` |
| `d1_apply_edits.py` | 补丁生成器（5 组锚断言精确串替换，锚=原文字符串，行号无关） | 同上 |
| `d1_build.sh` | 可重跑构建链（archive→应用→再生成→preflight→apply 电池→普查→清单） | 同上 |
| `d1_replay_census.py` | 语料 for 头普查器（只读） | 同上 |
| `REPLAY_D1.md` | 静态回放账（红臂三源/命中清单/零增量判定/机械回执） | 同上 |
| `replay_range_form_hits.txt` | range 形命中清单（文件:行:头文本） | 同上 |
| `replay_non_range_forms.txt` | 非 range 形不触面清单 | 同上 |
| `base_head/` `work/` | 基线副本与应用后副本（逐字节回放凭证） | 同上 |
| `d1_build_run.log` | 最近一轮全链构建日志（BUILD_RC=0） | 同上 |

权威基线：HEAD `0dbde57f9`（typed_expr.cheng 基线 sha `60e252888940016f`；自 f0b068a7 起基线未漂）。

## 串行关系（与预建三刀）

1. **本件为预建**：与预建三刀同域（typed_expr.cheng）。预建三刀落库提交窗后执行重对：
   `cd .rebuild/d1knife_line && bash d1_build.sh`——脚本自动从新 HEAD 重抽 archive、按原文字符串锚重放（行号漂移免疫）；任一锚被他线改动即断言失败响亮退出，届时手工重锚该锚后重跑。
2. 重对后脚本内含**二次 preflight + apply 电池**，PASS 即为可烤态。
3. **并入预建批烤轮**（DUOWALL §与预建三刀的串行/并行关系条款）：合并基座一次重烤，B 臂=预建三刀+D1，各刀判词各自清除即刀域绿；烤机预算批内零增量轮。D1 不单独立烤。
4. 撤销只走冻结件：`git apply -R d1_typed_expr_pattern_iterator_group.patch`。严禁按文本删行。

## 红绿口径（并入批烤轮的门禁子集，引 DUOWALL 墙①红绿口径）

- **红臂**（已三源钉死）：c3 夹具（src/a9_wall_probe/c3.cheng，`for i in range(200)`）+ for_range_call_fixture ⇒ 判词 `typed expr binding: exact local value-definition group unavailable` 逐字。
- **绿判**：
  ① 两夹具该判词消失、verdict 前进（下一墙未知，如实记录）；
  ② for_range corpus 绿夹具（arith_index/local_cond/seq_len/variable_start）run rc+stdout 逐字零漂（.o 漂移允许）；
  ③ 无 for 合同夹具 primary.o 逐字节恒等；
  ④ 金丝雀 2/2×每轮（新驱动烤完立刻跑）；
  ⑤ seq-for 夹具（probe_for_array 族）判词零漂移（D1 不触面自证：门 c RangeFlags==false skip）。

## 施工内容摘要（详见 REPLAY_D1.md 与补丁注释）

- 签名穿线 +2 参（`ctx: TypedExprSourceContext, sourceContexts: TypedExprSourceContext[]`）：注册两函数 + 3 调用点。
- 注册臂（`typedExprIrRegisterDeclarationLocalGroups` 循环体内、Declaration 臂后并列）：门 a 复用既有两闸；门 b pattern 行合法+防双注册；门 c 环变量记录（声明名∧声明行号）双键精确命中 ∧ RangeFlags==true；门 d loopVarTableBuilt。全门不符=skip=旧判词（fail-closed 零放宽）。
- 载体：`TypedExprIrAddI32ConstNode`（range 形环变量类型权威=int32）。
- 注册：组 CSR 十列与 Declaration 臂逐列同构；组行回写双映射；事务根映射密度守卫照抄。
- 注册即消费（行寻址）：镜像消费尾段调 `typedExprIrAppendValueDefinitionExact` 后直写 definitionRows/consumedFlags=1；不调按名消费本体。
- detached 指纹不变式：载体 ownerStatement=-1（AppendNode 恒写）+组根键 −1；零新增顶层函数、零新增 op 枚举、零身份面改动。
