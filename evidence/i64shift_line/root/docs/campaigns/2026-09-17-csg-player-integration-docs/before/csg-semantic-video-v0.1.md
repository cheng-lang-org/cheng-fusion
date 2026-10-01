# CSG语义视频 v0.1 领域 schema（冻结稿）

日期：2026年9月16日。状态：v0.1 冻结。本文件在 `docs/csg-core-standard.md` 之上新增领域 schema，不改变核心 header、section、字典及规范 JSON token 规则，不新增第二 codec、root 或 proof。实现落点 `src/game/assets/semantic_video/`。

## 1. 命名与容器

- schema 命名空间：`csg_semantic_video::v0.1`。每条事实行顶层字段 `schema` 必须等于该值。
- 物理容器：CSGC。记录 = canonical JSON 行（`kind` 字段为事实 kind，决定 section 分组）；资源载荷为类型化资源，不展开成逐像素事实。
- 记录块：一个 CSGC 对象。v0.1 块上限：记录数 ≤ 1048576，CSGC 字节 ≤ 64MiB；超限为 `sv_quota_exceeded`。
- 工作名称 `CSG语义视频0.1`；扩展名与媒体类型尚未注册。

## 2. 事实 kind 与记录字段

字段顺序 = canonical JSON 键序 = 全键 UTF-8 字节升序。下列字段表已按字节序列出；未列出的键仅允许 `x-` 前缀（可选扩展，读取端必须记录忽略项），其余未知键拒绝 `sv_unknown_field`。未知 kind 拒绝 `sv_unknown_kind`。

类型记法：i32/i64 为十进制整数的 canonical JSON number；str 为 canonical JSON string；str[] 为字符串数组（元素按字节升序、去重，除非注明）。

| kind | 字段（已按字节序） | 约束 |
|---|---|---|
| `csg_semantic_video::manifest` | cap:str[]; contentId:str; entrySnapshot:str; kind; resCid:str[]; resLength:i64[]; resType:str[]; schema; tbDen:i32; tbNum:i32; timeEnd:i64; timeStart:i64 | cap ⊆ 冻结能力表且升序去重；resCid/resLength/resType 等长；CID 形合法；tbNum>0、tbDen>0；0≤timeStart≤timeEnd；world_execution ∈ cap ⟺ entrySnapshot 非空 |
| `csg_semantic_video::observation` | kind; method:str; obsId:str; schema; sensor:str; sourceClass; srcTrack:str; tbDen:i32; tbNum:i32; tickEnd:i64; tickStart:i64 | obsId 块内唯一；sensor 非空；tbNum/tbDen>0；0≤tickStart<tickEnd；sourceClass ≠ unknown 时 method 非空 |
| `csg_semantic_video::entity` | gen:i64; kind; lifecycle:str; ns:str; num:i32; schema; typeVer:str; uid:str | uid == `sv-ent:<ns>:<gen>:<num>`（validator 复算）；lifecycle ∈ {active, retired}；gen ≥ 0；块内 uid 唯一；退役后 ns/gen/num 不得复用（由 uid 唯一性保证） |
| `csg_semantic_video::assertion` | confBp:i32; confDef:str; kind; method:str; obj:str; pred:str; rev:i32; schema; sourceClass; tbDen:i32; tbNum:i32; tickEnd:i64; tickStart:i64; uid:str; val:str | uid 块内唯一；obj 须引用块内 entity.uid；pred ∈ 冻结词汇；0≤confBp≤10000 且 confDef 非空；rev≥0；时间约束同 observation |
| `csg_semantic_video::snapshot` | branch:str; ckpt:str; deps:str[]; kind; schema; tbDen:i32; tbNum:i32; tick:i64; worldCid:str | (branch, ckpt) 块内唯一；deps 升序去重；worldCid 形合法；timeStart 语义由 tick 承担（单点），无 tickEnd 字段 |
| `csg_semantic_video::delta` | baseCkpt:str; kind; opsCid:str; schema; seq:i64; tbDen:i32; tbNum:i32; tickEnd:i64; tickStart:i64; toCkpt:str | baseCkpt 须引用同分支 snapshot.ckpt 或 delta.toCkpt 链；seq 在分支内从 0 连续递增；opsCid 形合法；时间约束同 observation |
| `csg_semantic_video::correction` | basisCid:str; kind; obsRef:str; payloadCid:str; schema; spaceDomain:str; tbDen:i32; tbNum:i32; tickEnd:i64; tickStart:i64 | obsRef 须引用块内 observation.obsId；basisCid/payloadCid 形合法；spaceDomain 非空 |
| `csg_semantic_video::dependency` | consumer:str; kind; purpose:str; queryBasis:str; schema; target:str; targetVer:str | 依赖图 consumer→target 不得有环；四字段均非空 |
| `csg_semantic_video::revision` | kind; newRev:i32; oldRev:i32; publishedTick:i64; reason:str; schema; supersedes:str; targetUid:str; tbDen:i32; tbNum:i32 | supersedes 须引用块内被修订记录的 uid（assertion.uid/entity.uid/observation.obsId）；newRev > oldRev ≥ 0；reason 非空；publishedTick ≥ 0；撤销/替换是新记录，不擦除原记录 |
| `csg_semantic_video::receipt` | capReq:str[]; capVerified:str[]; configCid:str; implCid:str; kind; result:str; schema; subjectCid:str; summaryCid:str | result ∈ {pass, fail}；capReq/capVerified 升序去重且 ⊆ 能力表；四个 CID 形合法；capVerified ⊆ capReq |

- 冻结能力表：`common_core`、`semantic_description`、`spatial_reconstruction`、`world_execution`、`realtime_streaming`（`capabilities.json`）。未知能力 `sv_unknown_capability`。
- 冻结语义词汇 v0.1（assertion.pred）：`object_track`、`enter_region`、`leave_region`、`contact_candidate`、`user_operation`。轨迹关联是识别假设；接触候选不是承载成功。
- sourceClass ∈ {observed, inferred, manual, unknown}。
- 资源类型（resType）v0.1：`video_sample`、`audio_sample`、`depth_map`、`geometry`、`weights`、`index`、`media_segment`、`state_payload`、`op_payload`、`correction_payload`。
- 未知必需扩展（新 kind）在 v0.1 读取端一律拒绝；`x-` 字段忽略并回报。

## 3. 时间、身份与数值合同

- 时间：int64 tick + 有理 timebase `tbNum/tbDen`（均 >0，manifest 定义内容级 timebase；记录级 tbNum/tbDen 必须等于 manifest 值，validator 检查）。区间左闭右开；比较用 int64 交叉相乘前做溢出检查。VFR/B帧/非零起始的样本级映射属 B2 Observation 载荷，不在记录行内展开。
- 身份：内容身份 `contentId` 与实体身份（ns, gen, num）分列；跨包映射到已验证本地表属后续阶段，v0.1 块内以 uid 文本精确引用，禁止名称近似匹配。
- CID 形：`sha256:` + 64 个小写十六进制字符（71 字节），复用核心 `csgCoreIdentityCidValid` 判定。
- 数值：值域仅整数（不含分数/浮点字段）；拼写从核心 canonical JSON number 规范形（整十幂/短系数大数为科学计数法，如 90000→9e4）；置信为基点整数 confBp ∈ [0,10000]，必须带 confDef 定义文本。
- 摘要域绑定：contentId = `"sha256:"+hex(SHA256(text("csg_semantic_video.content.v0.1") ‖ 预提交 manifest 行))`，其中预提交 manifest 行为 canonical 且其 `contentId` 字段为空串；v0.1 验证器只做 CID 形检查，绑定核验属提交/发布路径。资源 CID = `"sha256:"+hex(SHA256(text("csg_semantic_video.resource.v0.1") ‖ 资源原始字节))`；`text(x)=u32le(len)‖UTF8(x)`。两域为本方案新增域字符串，不进入核心 merkle key 域。

## 4. 结构化错误表

`sv_unknown_kind`、`sv_unknown_field`、`sv_missing_required_field`、`sv_field_type_mismatch`、`sv_noncanonical_line`、`sv_timebase_invalid`、`sv_tick_out_of_range`、`sv_interval_reversed`、`sv_conf_out_of_range`、`sv_cid_malformed`、`sv_cap_unknown`、`sv_cap_arrays_mismatch`、`sv_ref_undefined`（实体/观测/检查点/被修订记录引用不存在）、`sv_ref_duplicate`（uid 重复）、`sv_delta_seq_gap`、`sv_ref_cycle`、`sv_quota_exceeded`。失败不自动修改请求能力重签成功；可选扩展仅 `x-` 且记录忽略项。

## 5. 写入与原子提交（v0.1 文件形态）

1. 暂存：全部记录行写入任务拥有的 `<target>.svstaging` 文件；writer 对每行先断言 `canonicalize(line)==line`，再调 `CsgCoreCsgcEncodeVerifiedLines` 打包。
2. 验证：对打包结果用读取路径完整校验（§2/§4 全部规则），失败删除暂存并报错，保留原有效文件。
3. 提交：验证通过后 rename 到 `<target>.svblock`；rename 失败保留原文件，禁止覆写。

## 6. 内存预算映射（B1 增量）

B1 新增 4 个模块与测试，不改共享源码，生产运行时各相增量为 0（未接线生产入口）。测试进程内工作集：记录行数组与 CSGC 字节，均受 §1 块上限约束（≤64MiB，测试夹具 KB 量级）；无跨任务持久缓存。详见本战役 `memory_budget.md`。

## 7. 专利与实现选择说明（2026年9月16日增补）

第1至6节的冻结字节合同不变。本节为规范维护与实现发布说明，不新增字段、能力名、codec、root、proof或运行时错误码。

本schema规定记录表达与结构验证，不要求使用特定识别、重建、补偿、缓存或云端协作算法。`correction`、`dependency`、`delta`字段存在不证明相应载荷算法已实现或已取得许可；CSGC格式合规也不能替代实际能力验证。类型化资源和实现配置须精确声明其算法与版本，未知必需配置仍按能力合同拒绝，不能忽略后报成功。

共同核心不强制对象ID颜色索引视频、特定神经压缩结构、跨帧污染值列表或服务器向编辑客户端排序回传的架构；使用这些处理链的具体实现仍须审查。现有字段不能被解释为对第三方专利的许可承诺。

规范与后续实现遵循[专利与实现选择规则](csg-semantic-video-ip-policy.md)。已知权项、关联条款和待关闭事项见[实施审查报告](../campaigns/2026-09-16-csg-semantic-video-patent-review/review_report.md)。该报告是初筛，未取得完整实施自由结论；不把本节增补视为已经规避所有相关专利。
