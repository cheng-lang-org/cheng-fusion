# docs 索引与权威分层

> 本文件是 `docs/` 的唯一导航入口。历史 handoff、audit、patch、session、repro 日志已移除；同主题多文档已合卷（合卷来源见各文档附录标题）；细节见仓库根 `findings.md` 与 `lessons.md`。

## 权威分层

### 1. 规范层（normative）

| 文档 | 权威范围 |
|---|---|
| [cheng-formal-spec.md](cheng-formal-spec.md) | 语法与核心语义 |
| [csg-core-standard.md](csg-core-standard.md) | CSG 命名空间与方言分层 |
| [str-abi-v2.md](str-abi-v2.md) | 字符串 C ABI（SABI） |
| [../openspec/proposals/](../openspec/proposals/) | 已立项语义/架构变更 |
| [../openspec/proposals/cheng-diloco-decentralized-train-infer.md](../openspec/proposals/cheng-diloco-decentralized-train-infer.md) | DiLoCo 去中心化训练+推理（D1–D7 绿；D8 双机 inner/outer 绿，QUIC 因 sha_ni 未跑） |

### 2. 执行层（与门禁绑定）

| 文档 | 角色 |
|---|---|
| [cheng-implementation-status.md](cheng-implementation-status.md) | 实现对齐、门禁命令、工具链手册 |
| [cheng-language-introduction.md](cheng-language-introduction.md) | 活入口、模块布局、日常编译 |
| [cheng-bootstrap.md](cheng-bootstrap.md) | 自举性能基准 |
| [cold_csg_plan.md](cold_csg_plan.md) | cold/CSG 单一方案 |
| [csg_web_plan.md](csg_web_plan.md) | CSG-Web 单一方案 |
| [cheng-libp2p-convergence-plan.md](cheng-libp2p-convergence-plan.md) | P2P/网络栈单一方案 |
| [cheng-native-game-engine-plan.md](cheng-native-game-engine-plan.md) | 原生游戏引擎路线 |
| [global_roadmap.md](global_roadmap.md) | 跨主线导航（已吸收原 roadmap.md） |

### 3. 编译器 beat-c 战役（单文档合卷）

| 文档 | 角色 |
|---|---|
| [beat-c.md](beat-c.md) | **beat-c 战役唯一文档**（12 合 1）：§1 正典 KPI/基线/档案 · §2 执行入口+作战图 T0–T7 · §3 硬伤路线图 F01–F40 · §4 后端迁移(B深+backend2+pure-object) · §5 索引化(typed_expr+TailName) · §6 门禁/测量/优化(emit 预算+proof+RSS gate+leaf inliner) · §7 stairA 并行 · §8 warm skip-lower · §9 bail44 收尾 · §10 regalloc/x86 · §11 确定性内存 · §12 zero-C+SABI |

> 历史细节见 `findings.md` 与 `lessons.md`。

### 4. 产品/生态方案层（非规范）

| 文档 | 角色 |
|---|---|
| [cheng-plan-full.md](cheng-plan-full.md) | 远景架构 + 任务矩阵（含下一阶段演进附录） |
| [cheng-native-gui-plan.md](cheng-native-gui-plan.md) | GUI 实施计划（含总览/TS lowering/AI 执行语义附录） |
| [cheng-web.md](cheng-web.md) | Cheng Web runtime |
| [cheng-native-auto-fusion.md](cheng-native-auto-fusion.md) | 原生自动融合 |
| [cheng-agent-core-plan.md](cheng-agent-core-plan.md) | Agent core 路线 |
| [cheng-unimaker-business-plan.md](cheng-unimaker-business-plan.md) | UniMaker 商业计划 |
| [cheng-unimaker-mosaico-business-plan.md](cheng-unimaker-mosaico-business-plan.md) / [cheng-unimaker-mosaico-business-plan.pdf](cheng-unimaker-mosaico-business-plan.pdf) | 口袋信物商业计划书（ESP-Mosaico × UniMaker；硬件规格以乐鑫 2026-08-21 分册为准） |
| [cheng-os-passport-product.md](cheng-os-passport-product.md) | Cheng OS 护照产品合同（FOLOTOY AI Passport 评估板；货态/整包换核/能力表/五环；门禁 `tools/cheng_os_passport_gate.sh`） |
| [承道合一出海合规架构.md](承道合一出海合规架构.md) / [承道合一出海合规架构.pdf](承道合一出海合规架构.pdf) | 承道合一境内母体 + 新加坡开放中间层（CLG steward + Pte HoldCo）+ 美国商业 + 开曼封闭双基金；覆盖 Cheng / UniMaker / 具身 / RWA（工作备忘，非法意见） |
| [承道合一商业计划书-国内投资人版.md](承道合一商业计划书-国内投资人版.md) / [承道合一商业计划书-国内投资人版.pdf](承道合一商业计划书-国内投资人版.pdf) | 国内投资人版商业计划（信创/AI 原生基础设施叙事；不含 RWA、境外结构与 VPN 线，数字均标注 gate 口径；PDF 由 `_render_domestic_bp_pdf.py` 渲染） |
| [cheng-video-e2e-miaofa-miaokai-plan.md](cheng-video-e2e-miaofa-miaokai-plan.md) | 视频秒发秒开（含 seek/MoQ per-frame/progressive/p2p-home/harmony-gpu 附录） |
| [computer_use_r2c_campaign.md](computer_use_r2c_campaign.md) | R2C 战役（含 CSG Computer Use 能力边界附录） |
| [CSG可验证交易安全.md](CSG可验证交易安全.md) | CSG 编译即交易 / 金融资产安全 |
| [cheng-decentralized-compute-storage.md](cheng-decentralized-compute-storage.md) | 去中心化计算存储（含 DePIN 蓝图附录） |
| [cheng-csg-lsp-debugger-fusion.md](cheng-csg-lsp-debugger-fusion.md) | CSG+LSP+Debugger 融合（含 LSP/Debugger 最佳方案附录） |
| [cheng-package-manager.md](cheng-package-manager.md) | World Resolver 包管理（含激励/导入评审附录） |
| [hy2-tun-v1-vpn.md](hy2-tun-v1-vpn.md) | hy2-tun VPN（含本地部署/per-app/Windows/mux 附录） |
| [harmony-host-codegen-migration-plan.md](harmony-host-codegen-migration-plan.md) | 鸿蒙 host codegen 迁移 |
| [driver-os.md](driver-os.md) | driver/OS |
| [app-scoped-ai-proxy.md](app-scoped-ai-proxy.md) | app-scoped AI proxy |
| [连续系统.md](连续系统.md) | 独立产品愿景 |
| [编译提速计划.md](编译提速计划.md) | 编译提速三段（已并入 beat-c.md §6/§2，历史保留） |

### 5. 标准库与技能（参考）

| 目录 | 内容 |
|---|---|
| [stdlib/](stdlib/) | foundation / file-io / net-io / string-json |
| [cheng-skill/](cheng-skill/) | Cheng 语言 SKILL（grammar / ownership / stdlib） |
| [patents/](patents/) | 专利披露 |

## 冲突裁决

1. 规范层 > 执行层实现对齐注记  
2. 同路线单一方案文档（cold → `cold_csg_plan.md`；Web → `csg_web_plan.md`；beat-c → `beat-c.md`；roadmap → `global_roadmap.md`）  
3. 计划/愿景层不作行为承诺  

## 维护规则

- 易腐数字只写在执行层，且须可由 gate 复现  
- **禁止**在 `docs/` 新增 handoff、checkpoint、patch、packet、apply-ready、evidence、repro 类文件 — 写入 `findings.md`  
- **同主题只维护一份**：同主题多文档须合卷到主文档（附录形式），删除子文档  
- 同一路线禁止拆分重复计划（见 `lessons.md`）  
- 历史结论被推翻：在正典文档正文改正，不在 docs 堆叠订正链  
