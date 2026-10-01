综合方案：**Cheng Native Auto Fusion**

目标不是把 CSG、LSP、Debugger 做成几个孤立按钮，而是把它们合成一条证据流：模型写代码前先拿编译语义、编辑诊断、运行证据，再决定怎么改。

路线选择是 **Agent-first, Training-later**：先用工具化 Agent 建立可验证代码能力，再用 Agent 产生的可回放样本训练小型补全/修复 adapter。Cheng 语义不写死进模型权重，始终以 compiler、CSG、LSP、Debugger、formal spec 和测试结果为准。

**核心架构**
- `GPT-5.5`：控制面，负责理解目标、决定写入、最终回答。
- `DeepSeek V4 Pro[1m]`：上下文引擎，吃大范围 CSG/LSP/Debug 证据，压缩成影响面和风险清单。
- `DeepSeek V4 Flash`：并行探针，只跑只读查询，比如 LSP diagnostics、CSG references、symbol impact。
- `ChengEvidenceHub`：统一账本，所有结论都必须绑定文件、行号、符号、CSG 节点、LSP 诊断或 Debug 报告。
- `ChengTrainingTrace` / `ChengEvalCase`：成功任务保存可训练 trace，失败任务保存可回放 eval case；样本必须脱敏、带验证命令和 outcome。生产主格式是 content-addressed `CHENG_AGENT_TRACE` shard + manifest，JSONL 只做显式 debug/export。

**Cheng 三层工具**
- CSG 层：`cheng_csg_emit`、`cheng_csg_query`、`cheng_csg_roundtrip_check`  
  用 canonical `CHENG_CSG` 做模块、符号、导入、调用、ownership/no-pointer 影响面。
- LSP 层：`cheng_lsp_snapshot`、`cheng_lsp_code_action_preview`  
  做实时 diagnostics、hover、definition、references、completion、确定性修补建议。
- Debug 层：`cheng_debug_report`、`cheng_crash_report`、`cheng_profile_report`、`cheng_trace_map`  
  把崩溃、profile、line-map、symbols 映射回源码和 CSG 语义节点。
- TS-CSG 转换层：`ts_csg_emit`、`ts_csg_runtime_closure`、`ts_csg_cheng_source`、`ts_csg_cheng_csg`、`cheng_native_compile_run`
  把 TypeScript 项目的 CSG-Core/CSG-JS/runtime closure、Cheng source/CHENG_CSG lowering、native compile/run 结果写入同一个 evidence ledger；`complete:false` 是阻塞证据，不是可运行声明。

**运行流程**
1. 用户提出 Cheng 任务后，Auto Fusion 判断是否触发 Cheng 工具链。
2. Flash 并行跑轻量只读探针：当前文件 LSP、相关 symbol、调用方、导入链。
3. Pro 读取 CSG/LSP/Debug 证据，生成 `ChengContextMap`：影响文件、风险点、建议读取窗口、验证命令。
4. GPT-5.5 只读取必要行段，生成最小改动。
5. 写入前执行 `beforeWriteTool`：没有 CSG/LSP 证据支撑，或者违反 ownership/no-pointer，就阻止写入。
6. 写入后重新跑 LSP；跨模块改动重跑 CSG；运行问题重跑 Debug/Profile。
7. 最终回答只引用证据账本里的结论。
8. 成功任务写入 `ChengTrainingTrace`；失败或未验证任务写入 `ChengEvalCase`，不直接进入训练集。

**UI 效果**
- 用户只看到一套 ToolFormer 卡片，不出现多个助手。
- 卡片显示：`Cheng LSP diagnostics`、`CSG impact map`、`Crash report`、`Profile report`。
- 点击证据能跳到文件行、符号、报告。
- Monaco 编辑器支持 `.cheng` 的诊断、补全、跳转、hover。

**硬约束**
- 不用 mock。
- 不用 regex 冒充 Cheng 语义。
- 没有真实 Cheng LSP/CSG/Debugger 时硬失败。
- DeepSeek Pro/Flash 只能调用只读 Cheng 工具。
- 写文件、跑命令、apply patch 只能由 GPT-5.5 主循环触发。
- CSG 只认官方 `emit-cold-csg` 的 canonical `CHENG_CSG`。
- TS-CSG provider/runtime 改动必须绑定新鲜 `ts_csg_emit` 和 `ts_csg_runtime_closure` 证据；没有 closure 报告时禁止改 `ts-csg/src/runtime-providers.ts`、`ts-csg/src/csg-core.ts`、`ts-csg/src/cheng-source.ts`、`src/core/runtime/*`、`src/runtime/*`。
- 训练数据只能来自已验证 trace；失败样本只能作为 eval/repair case。训练模型只做局部 completion/repair，不参与 ownership、no-pointer、ABI、跨模块影响面的最终裁决。

**实施顺序**
1. 加 `ChengToolchainResolver`，统一发现 `cheng.stage3`、`backend_driver/cheng`、LSP command。
2. 扩展 `EvidenceLedger`，加入 `cheng.csg`、`cheng.lsp`、`cheng.debugger`、`cheng.profile` 来源。
3. 注册 CSG/LSP/Debugger 工具到 `harness-runtime-core` 和 `ToolRegistry`。
4. Monaco 接入 Cheng LSP。
5. Auto Fusion 接入 Cheng hooks。
6. ToolFormer 展示 Cheng 证据卡。
7. 加 gate：CSG roundtrip、LSP smoke、Debugger smoke、Fusion routing、权限测试。
8. 加 Data Loop：`ChengTrainingTrace`、`ChengEvalCase`、脱敏、验证命令、可回放 outcome、二进制/压缩 shard 主存储。

**TS-CSG 接入增量**
1. `EvidenceLedger` 增加 `ts_csg_emit`、`ts_csg_runtime_closure`、`ts_csg_cheng_source`、`ts_csg_cheng_csg`、`cheng_native_compile_run`。
2. `cheng_native_tools` 通过真实 `node ts-csg/dist/cli.js` 和 `backend_driver/cheng system-link-exec` 产出临时 artifact，不内联大型报告。
3. `cheng_write_gate` 对 TS-CSG lowering/provider 和 Cheng runtime provider 路径要求新鲜 TS-CSG closure evidence。
4. `claude-code-ts` 当前证据入口是 `bun run fusion:audit`，输出 `conversion-reports/full-ts-cheng-fusion/summary.json`；该报告已经记录 buildable 子集的 `ts_csg_emit`、`ts_csg_runtime_closure`、`ts_csg_cheng_source`、`ts_csg_cheng_csg` 和 `cheng_native_compile_run` 命令节点。
5. 当前 `summary.complete:false` 是有效阻塞状态：全量 `01-14` 仍有 R-block TypeScript 诊断，`src/07-tool.ts` 需要从 `deobfuscated/modules/tool-system` 可追溯 reintegration，buildable 子集的 `cheng-csg` 仍被 JS/Node runtime requirements 阻断，生成的 Cheng source 只作 lowering 证据，不能声称纯 Cheng native 可运行体。

**Data Loop 增量**
1. `ChengTrainingTrace` 记录 instruction、evidence、diff summary、checks、outcome、validation command、trainable 标记。
2. `ChengEvalCase` 记录失败或未验证任务的 replay command 和 expected outcome。
3. 默认脱敏绝对路径和密钥；没有 `compiled` / `tested` / `verified` / `passed` 结果的 trace 不标记 trainable。
4. `cheng_training_trace_record` / `cheng_eval_case_record` 原生工具写入脱敏 payload、content-addressed `.cagt` shard、默认 Brotli `.cagt.br` 和 `cheng.agent_trace.manifest.v1`。
5. JSONL 只在 `debugJsonl:true` 时额外导出，供 CI 审计和人工检查；训练导出应从 manifest/shard 派生，不能把 JSONL 当主存储。

**预期效果**
- 复杂 Cheng 任务平均效率提升目标：**40%+**
- 无效文件读取减少：**50% - 80%**
- token 消耗降低：**40% - 70%**
- 首次补丁失败率降低：**30% - 60%**
- 崩溃和性能定位效率提升：**60% 左右**

最终形态就是：Cheng 代码不是被模型“看文本”，而是被工具按编译语义、编辑状态和运行证据理解，然后模型只在证据约束内做最小改动。