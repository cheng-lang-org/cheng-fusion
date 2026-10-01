# A2 前置草案：共享数据合同（待主树 d2 烤机窗口结束后迁入 src/game/platform/contracts.cheng）

> 状态：草案（campaign 安全区起草，未进 src/）。权威来源=开发计划「共享数据合同」节。
> 全部字段为精确 int32/int64 索引与有界值；跨记录关联禁止名称/文本/源码行近似键。
> 迁入时按现行借用契约落地：只读助手一律 @borrows；借用源入容器走 Fmt 拷贝；
> 嵌套字段写用局部物化+整体赋值（A1 探针矩阵实证的四条契约）。

## 记录定义（计划冻结前草案）

| 记录 | 字段 | 契约要点 |
|---|---|---|
| RoomKey | roomId:int32, roomEpoch:int64 | epoch 按持久分配序列，重建/复用不重置；绑定已认证服务器身份 |
| EntityKey | slot:int32, generation:int32 | 回收时 generation+1；溢出拒绝复用；跨房间引用必须带完整 RoomKey |
| AssetRow | assetIndex:int32, kind, contentCid, bundleCid, byteLength, layout | 路径只用于导入；CID 查验后才建行 |
| TickClock | tick:int64, anchorTick:int64, monoAnchorNs:int64, numerator=1, denominator=60 | 截止按相对 anchorTick 的有理时间；持久化逻辑 tick 不持久化 mono anchor |
| InputCommand | room:RoomKey, accountId, sessionEpoch:int64, commandSeq:int64, assignedTick:int64, kind, typedPayload | payload 不含客户端裁定奖励；assignedTick 服务器在有界接收窗口内确定 |
| SimState | SoA 实体、路径进度、规则版本、独立 PRNG 状态、积分/射速状态、tick | 无 GPU 句柄/墙上时钟 |
| TickDelta | room:RoomKey, tick, priorStateHash, orderedCommands, resultingStateHash, events | 仅提交后才是权威状态 |
| RenderSnapshot | 完整 RoomKey、已提交 tick、视觉 transform/资产行 | 浮点插值/骨骼/粒子不可写回 SimState |
| AudioCommand | eventId, clipIndex, action, gain, pan, startSample | 回调借用输出缓冲不跨回调持有 |
| CommitRecord | schema, sequence, previousHash, payloadLength, payloadHash, payload, commitTrailer | 含完整 RoomKey、状态变更与去重结果 |
| ContactEvent | tick, toiNumerator:int64, toiDenominator:int64, bulletKey, fishKey, shapeIndex:int32 | TOI∈[0,1] 有理数分母严格正；全序按 tick/TOI/身份/shapeIndex |

## 迁入时的 A1 实证契约清单（探针矩阵）

1. 只读记录访问器：`@borrows` 注解（跨模块调用依赖声明旗标，缺失即 move 语义误伤）。
2. 托管字段（str）复制：Fmt 插值拷贝（CloneStr 释放链有 registry_miss 前沿 W-A1-3）。
3. 托管结构体赋值=move：多副本用 @borrows 字段克隆（同 tick_replay cloneReceipt 形）。
4. 嵌套字段写：局部物化后整体赋值（fishing_platform_contract 实证）。
5. 序列化往返（A2 verify 项）：preimage 一律 str[]+add(Fmt 拷贝)+Join（ecs/runtime 既有形态）。

## 定点数值范围（A2 冻结项，占位）

- 世界坐标/速度：有界定点 int32（缩放、每 tick 位移上界待冻结）。
- 碰撞乘积：int64 有理数（分子/分母）；超界必须加宽或收紧 profile 并证明，禁止静默溢出。
- 容量：profile 配置（1024 逻辑实体起步；测试 256 鱼+512 弹+4 炮台+1 Boss；粒子 8192 独立池）。
