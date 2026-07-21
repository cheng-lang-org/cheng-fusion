# fixtures/mutation — 变异证明网(mutation net)

对语义夹具 / receipt / 计划快照做结构化变异, 逐算子实跑现有门, 出 kill 矩阵。
破坏类必须 100% 被其 kill 契约指定的门杀死且信号精确; 保持类(无变异/等价变换)必须 0 假红;
杀不死的算子登记进 `gapRegistry`(带加固规格), 不硬凑 100%。

## 文件

- `mutants.json` — 算子台账(schema `cheng_mutation_net.v1`): 门清单、缺口登记(GAP-1/GAP-2)、
  26 破坏性算子 + 4 保持类算子, 每条破坏性算子绑定精确 kill 契约(gate + signal [+ authorityGate + authoritySignal])。
- `../tools/mutation_net_gen.ts` — 生成器: 台账加载校验 + 基础工件构建 + 26 个算子实现。
  `bun tools/mutation_net_gen.ts --check` 校验台账 ↔ 实现覆盖对齐。
- `../test/item27_mutation_net.ts` — 实跑 harness: `bun test/item27_mutation_net.ts`。

## 门

| 门 id | 实现 |
|---|---|
| span_validator | `tools/grammar_span_receipt.ts` preflightParserSpanReceipts(GSR01..GSR07) |
| m9024_coverage | m9024 buildGrammarSourceCoverageReceipt(唯一权威门禁) |
| m9024_contract | m9024 validateChengGrammarObligationContract |
| m9024_bundle_base / m9024_bundle_profile | m9024 validateBase/PipelineProfileSourceBundle |
| m9023_ledger | m9023 validateSemanticContractLedger |
| corpus_gate | item26[A] 同口径语料谓词(item27 内对内存变异副本执行) |
| evidence_verify | `tools/evidence_verify.py`(临时 evidence 树换入变异 receipt 真跑, rc=1+FAIL 信号) |
| oracle_selftest | TREE `tools/flagship_gen2_oracle.sh` 自测子网 |

## 缺口

- **GAP-1**(已闭合 2026-07-21)evidence receipt 无入库 verifier 门 → `tools/evidence_verify.py`
  (manifest 逐文件重算/done==claim 逐字节/journal 尾 verdict/index↔receipt 一致/形状校验/孤儿双查),
  M-EVIDENCE-SEED-SWAP 与 M-EVIDENCE-VERDICT-DROP 已改挂 kill 契约。
- **GAP-2**(已闭合 2026-07-21)parser span receipt provenance 四哈希只验形状不验锚 →
  `grammar_span_receipt.verifyProvenanceAnchors`(GSR08)+ `fixtures/semantic/toolchain_anchor.json`
  (driverBytes/toolchainManifest 发布钉住对, driverBytes 可对 driver 字节独立复核; synthetic:* 仅测试模式),
  M-FORGE-PROVENANCE-SELFCONS 与 M-PROVENANCE-TOOLCHAIN-SALT 已改挂 kill 契约。
  遗留: 真实 driver receipt 多世代盐并存(pr1/corpus/pr_oracle 三 driver), grammar_bind_run 的锚接线
  待 receipts 用同一 pinned driver 重产后接入并同步重钉 anchor。

当前状态: **kill 26/26 = 100%, 登记缺口 0**。新算子若杀不死, 登记进 `gapRegistry`(带加固规格), 不硬凑 100%。
