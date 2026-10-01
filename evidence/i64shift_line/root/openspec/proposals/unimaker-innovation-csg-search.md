# UniMaker Innovation CSG Search

状态：`archived / scoped slice complete 2026-08-16`。用户已明确要求“制定计划并实现”。
本状态只覆盖仓内 4 份真实存量文档的 CSG 纵向切片；正式 embedding 模型和外部语料仍为
明确未完成边界，不计入本次完成信用。

## 目标

把 UniMaker 当前存量专利交底书和学术论文纳入可验证 CSG 检索与侵权候选分析：

```text
真实文档字节 + 来源身份
  -> innovation facts
  -> CSG-Core strict admission + canonical CSGC
  -> 哈希绑定的量化向量收据
  -> 精确检索 / 潜空间候选召回
  -> 权利要求要素 × 产品证据逐项对齐
  -> candidate-only claim chart receipt
```

## 边界

- 复用既有 `csg_dialect::unimaker_product` profile，新增 `innovation_*` fact kind；不修改
  `csg_core::v1`、CSGC、Merkle、proof、profile-set CID 算法。
- 潜空间只返回候选。向量相似度、全要素候选命中均不得声明法律侵权、有效性、新颖性或授权结论。
- 学术论文输出贡献、方法、实验与引用重合候选，不称为“论文侵权判定”。
- 未公开材料只能进入私有 capability 域；本切片只使用仓库中已经存在的公开/存量材料。
- 外部专利库、论文库和正式 embedding 模型尚未接入时，不声明全球查新或生产语义召回完成。

## 数据与身份合同

- 运行时图采用 DOD + Arena + SoA；所有跨节点关系只存 `int32` 行索引。
- 文本 ID 只用于外部 CSG fact identity 和构建期查找，不作为运行时跨节点关联键。
- 向量使用 `int32` 定点量化，维度 `1..4096`、元素 `[-32767,32767]`，避免跨平台浮点排序漂移。
- 每个向量收据必须绑定：

```text
source_fact_cid
model_cid
tokenizer_cid
tool_cid
vector_cid
dimension
normalization_scale
quantization
```

- 搜索和 claim chart 只比较完全相同的 model/tokenizer/tool/dimension/scale/quantization 合同。
- claim chart 必须逐一覆盖独立权利要求的全部 `required=true` 要素才可设置
  `allRequiredCandidate=true`，并始终设置 `candidateOnly=true`。

## Files / Action / Verify / Done

```text
src/apps/unimaker/innovation_csg.cheng
  action: Innovation DOD/SoA、封存校验、定点向量检索、claim chart 与 CSG facts
  verify: no-pointer 静态门；targeted compile/run；确定性 root/CSGC/排序/负例
  done: 所有关系为 int32；无第二 CSG codec/root/admission；候选输出不越权

src/core/csg_core/validator.cheng
  action: 扩展既有 unimaker_product closed-set fact kinds/fields
  verify: strict admission 接受完整 innovation facts，拒绝缺字段/未知 kind
  done: profile-set 不变；unknown kind 继续 hard-fail

src/tests/unimaker_innovation_csg_smoke.cheng
  action: 真实存量文档身份、CSGC roundtrip、检索、claim chart、负例
  verify: 运行 marker 与逐项断言
  done: 无 mock 生产接口；测试向量明确只验证算法合同

tools/unimaker_innovation_csg_gate.sh
  action: 钉住真实源文件字节、1 GiB 进程树、源码/编译器/工具/产物哈希
  verify: gate rc=0 且 receipt 字段完整
  done: 不以单 smoke 外推 production launcher/global corpus 完成
```

## 禁止

- 禁止用向量近似键替代文档、权利要求、要素或证据的精确身份。
- 禁止裸指针、`@importc`、`&`、`ptr`、`ref T` 进入新增生产模块。
- 禁止调用方自报 hash 后不复算向量 CID。
- 禁止把测试向量宣传为真实模型 embedding。
- 禁止以单一相似度阈值直接输出“侵权/不侵权”。

## Archive receipt

```text
unimaker_innovation_csg_gate_rc=0
csg_core_validator_replacement_scope_static_gate_rc=0
csg_core_fact_field_closed_set_gate_rc=0
candidate_only=1
production_model_embedding=0
external_corpus=0
facts_root=sha256:9a42fb4ab289d6df4122f6ec0b9679103d42fa84adc9c69a143e5e5c529978dd
fact_count=31
csgc_byte_count=10486
source_sha256=99c6c571349f2295a2a0b566e9aa2a088e76a99c4c9972cbad1959d2679d8c05
validator_sha256=7a0c187510b9448bf8e3bafdf9005c5fd4664e54a0fe4a8eae9d18c5bd9af2ba
test_sha256=0c39f36d59f23d8cb4160b7f68a81435dde2e8f17a6d04359190c34460841acf
compiler_sha256=3a8fc762f4c0b909abaacd0596e13162b161cbc4ebc9dd78066ca2614b58a3d8
tool_sha256=2b934e9376eb739685442375305522041fbb657d6dde1152ee816a200e596f2c
executable_sha256=4ac14553630edd319e84e9c1b784a2dc4758fb0f648c7bd39c47a8317409f7ee
stdout_sha256=f727eaf3bc92b592ab204dbb28ce23d56e3c0f15f255c4b3a03387fcd537d5ff
```
