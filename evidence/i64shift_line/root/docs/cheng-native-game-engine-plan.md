# Cheng 原生力学与游戏引擎方案

> 本文是 Cheng 原生力学/游戏引擎路线的单一方案文档。CSG 命名空间、typed action、control surface 以 `docs/csg-core-standard.md` 为准；GUI 与 Surface Provider 以 `docs/cheng-native-gui-plan.md`、`docs/csg_web_plan.md` 为准。

## 目标

第一版不做 Unity/Unreal 式大编辑器，也不先做裸机游戏 OS。最佳路线是先闭合一个确定性游戏 runtime：

```text
Asset Manifest/CID
  -> ECS World
  -> Fixed-step Physics
  -> Gameplay Systems
  -> Render Graph / Audio Graph
  -> Cheng GUI Surface Provider
  -> Agent ControlSurface
```

核心目标：

- 游戏世界状态由 Cheng/CSG 管，不由宿主引擎黑盒管。
- 宿主只提供窗口、输入、GPU surface、音频设备、文件/网络能力。
- 物理、实体、资源身份、场景状态、回放、多人同步、Agent 控制都进入确定性事实链。
- 同一输入流、同一资源根、同一 tick，必须得到同一 `worldHash`。

## 当前落地状态

已落地第一层 proof：

- `src/game/ecs.cheng`：2 槽 direct-compatible SoA ECS World，覆盖 entity、position、velocity、mass、AABB/circle collider、deterministic int32 fingerprint。
- `src/game/physics2d.cheng`：fixed-step AABB 碰撞、分离、速度交换、step receipt fingerprint。
- `src/game/runtime.cheng`：fixed tick、8 槽 typed action 输入队列、GameTickReceipt。
- smoke：`ecs_world_hash_smoke`、`physics2d_collision_smoke`、`physics2d_determinism_smoke`、`game_tick_replay_smoke` 已用 `artifacts/bootstrap/cheng.stage3 system-link-exec` 编译成真实 Mach-O 并运行通过。

当前没有宣称完成生产级游戏引擎。`artifacts/backend_driver/cheng system-link-exec` 的 direct object lowering 对 object 零初始化、定长数组字段和标准库字符串/bytes 构造仍不稳，已记录在 `findings.md`。因此第一层 proof 临时把 ECS 容量压到 2 槽、receipt 使用 `int32 fingerprint`；后端稳定后恢复到固定容量数组/真实 CID 哈希。

## 首个生产消费方：UniMaker 水墨线

UniMaker v2「水墨」（v2 总纲 `openspec/proposals/cheng-v2-in-place-refactor.md` §UniMaker 水墨线）确定以本引擎为唯一物理基座：墨滴/墨晕/墨流/长卷动态全部是 ECS 实体，由 `Physics2dStep` 统一步进，禁止 app 侧各写内联粒子代码。由此对引擎新增两类要求：

- 力学原语：重力、空气阻力、溅射冲量、晕染衰减作为 physics2d 引擎能力落地（不是 app 代码），并配 `physics2d_forces_determinism_smoke`（同种子逐帧 receipt 一致）。
- 确定性即 oracle：fixed tick + step receipt + replay 使水墨动画可"同种子逐帧对拍"，接入 UniMaker 的 digest/pixel-oracle 门禁体系。

依赖顺序：direct object zero 修复 → ECS 容量恢复 → 力学原语 →水墨 M2/M3 接入（见 task_plan.md「Cheng 原生力学/游戏 Runtime 后续」）。

## 核心架构

### ECS World

ECS 是 Entity Component System：

```text
Entity    = 实体 ID，只表示“是谁”
Component = 数据，只表示“有什么”
System    = 批处理逻辑，只表示“怎么更新”
```

目标形态采用固定容量 SoA 数据布局：

```text
entityIds[]
positionX[]
positionY[]
velocityX[]
velocityY[]
mass[]
colliderKind[]
colliderRadius[]
spriteTextureCid[]
```

禁止把 `Player`、`Enemy`、`Bullet` 做成带虚函数和指针树的对象。对象式 API 可以作为编辑器/脚本表面，但 runtime 内部必须降成连续数组和结构化 facts。

当前 proof 版本为了避开 direct object lowering 缺口，使用显式 2 槽 SoA 标量列；这不是最终容量设计。

### Fixed-step Tick

游戏更新分固定步进：

```text
inputFacts(t)
+ worldFacts(t)
+ assetFacts
-> systems
-> worldFacts(t+1)
-> renderFacts(t+1)
-> audioFacts(t+1)
-> receiptFacts(t+1)
```

要求：

- 物理 tick 固定为 `1/60s` 或 `1/120s`。
- 渲染只做插值，不反向改物理状态。
- 不允许把物理结果绑定到当前屏幕帧率。
- 所有外部输入先排队成 `InputEventFact`，再在 tick 边界消费。

### 物理内核

第一版覆盖 2D 刚体和最小 3D 刚体，不做流体、布料、软体。

模块分层：

```text
PhysicsWorld
  -> Broadphase
  -> Narrowphase
  -> Contact Manifold
  -> Constraint Solver
  -> Continuous Collision Detection
  -> Sleep/Island
  -> Deterministic Hash
```

推荐算法：

- Broadphase：2D 用 Spatial Hash 或 Sweep-and-Prune；3D 用 BVH。
- Narrowphase：2D 用 SAT；3D 用 GJK + EPA。
- Solver：第一版用 Sequential Impulse；高稳定约束再引入 XPBD。
- CCD：先覆盖高速圆/胶囊/盒，避免子弹穿透。
- 数值：第一版优先 fixed-point 或受控 float profile；跨端确定性未闭合前不能宣称网络 lockstep 完成。

### Render Graph

渲染不属于物理系统。物理只输出 transform/visibility facts，渲染系统生成 draw facts：

```text
WorldTransform
+ Mesh/Sprite/Material
+ Camera
-> RenderGraph
-> DrawList
-> Surface Provider
```

要求：

- Texture、Mesh、Material、Shader 都以 CID/Manifest 为身份。
- GPU texture handle 只能是 `@ffi_handle`，不能变成资产身份。
- Render Graph 只引用已验证资源；缺资源 hard-fail 或等待，不伪造可渲染状态。

### Audio Graph

音频作为系统级 graph，不挂在对象回调里：

```text
AudioClipManifest
+ SpatialEmitter
+ Listener
+ Timeline/Beat Facts
-> AudioGraph
-> Audio Provider
```

第一版只做 sample playback、loop、volume、pan、spatial 2D/3D；动态合成和 DSP 后置。

### Asset Manifest

资源不以路径为身份。路径只作为导入来源，正式身份是：

```text
assetCid + bundleCid + manifestCid
```

游戏资源 manifest 至少覆盖：

- texture：format、width、height、mip、colorSpace、objectChunks。
- audio：codec、sampleRate、channels、duration、objectChunks。
- mesh：vertex layout、index format、bounds、objectChunks。
- animation：skeleton、tracks、duration、sampleRate、objectChunks。
- scene/prefab：entity/component archetype、child graph、required assets。

## CSG 方言

新增领域 facts 应进入 `csg_dialect::game`，不污染 `csg_core`。

建议 facts：

```text
csg_dialect::game::asset_manifest
csg_dialect::game::world
csg_dialect::game::entity
csg_dialect::game::component_column
csg_dialect::game::system_schedule
csg_dialect::game::input_event
csg_dialect::game::physics_body
csg_dialect::game::collider
csg_dialect::game::contact
csg_dialect::game::constraint
csg_dialect::game::tick_receipt
csg_dialect::game::world_hash
csg_dialect::game::render_graph
csg_dialect::game::audio_graph
csg_dialect::game::control_surface
```

完成条件：

- facts 可重复导出 byte-identical。
- 同一 tick 输入能重放得到同一 `worldHash`。
- 缺资源、缺 component schema、非法 action、非确定性系统顺序全部 hard-fail。

## Agent 控制面

Agent 不走截图/OCR/坐标猜测。游戏 runtime 导出 typed action：

```text
Move(entity, direction, magnitude)
Jump(entity)
Interact(entity, target)
Spawn(prefabCid, transform)
SetComponent(entity, componentKind, value)
PauseSimulation()
StepSimulation(ticks)
OpenScene(sceneCid)
```

所有 action 必须：

- 带 guard。
- 进入同一事件队列。
- 产生 receipt。
- 可回放。
- 可被 world hash 证明。

## Host Provider 边界

宿主只能提供设备能力：

- Window/Surface：`@ffi_handle`
- Texture/Buffer：`@ffi_handle` + `@ffi_map`
- Audio device：`@ffi_handle`
- Input event：事件队列推送
- File/Network：按 manifest/CID 读写

禁止项：

- 不用 Unity/Unreal/Godot/Box2D/Bullet 当 runtime 语义承载。
- 不用宿主 GUI 控件承载游戏 UI。
- 不用 WebView/Chromium/V8/Node。
- 不用轮询主循环当生产事件模型。
- 不用裸指针公开资源或物理对象。
- 不用 mock/fallback/stub 伪造资源、物理、渲染或音频完成。

## 落地顺序

1. `cheng-ecs-core`
   - Entity id、archetype、component column、query、system schedule。
   - `ecs_world_hash_smoke` 证明同输入同 hash。

2. `cheng-physics2d`
   - Circle/AABB/OBB、Spatial Hash、SAT、contact manifold、Sequential Impulse。
   - `physics2d_collision_smoke`、`physics2d_determinism_smoke`。

3. `cheng-game-runtime`
   - fixed tick、input queue、scene manifest、prefab instantiate、tick receipt。
   - `game_tick_replay_smoke`。

4. `cheng-render-graph`
   - Sprite/mesh manifest、camera、draw list、texture handle receipt。
   - `game_render_graph_smoke`。

5. `cheng-audio-graph`
   - audio clip manifest、play/stop/loop、receipt。
   - `game_audio_graph_smoke`。

6. `csg_dialect::game`
   - facts schema、roundtrip、materializer hard-fail。
   - `csg_game_facts_smoke`。

7. Cheng 原生编辑器
   - 编辑器本身用 Cheng GUI。
   - 场景编辑输出 manifest/facts，不输出宿主引擎工程文件。

## 最小首闭环

第一条产品级闭环做 2D 小场景：

```text
导入 sprite/audio
-> 生成 asset manifest/CID
-> 创建 scene manifest
-> ECS 加载实体
-> fixed tick 更新位置
-> physics2d 碰撞反弹
-> render graph 输出 draw list
-> audio graph 播放碰撞音效
-> Agent typed action 暂停/单步/移动
-> tick receipt + worldHash 可追踪
```

## 验收门禁

第一批门禁：

```sh
artifacts/backend_driver/cheng run-host-smokes ecs_world_hash_smoke
artifacts/backend_driver/cheng run-host-smokes physics2d_collision_smoke
artifacts/backend_driver/cheng run-host-smokes physics2d_determinism_smoke
artifacts/backend_driver/cheng run-host-smokes game_tick_replay_smoke
artifacts/backend_driver/cheng run-host-smokes game_asset_manifest_smoke
artifacts/backend_driver/cheng run-host-smokes csg_game_facts_smoke
artifacts/backend_driver/cheng run-host-smokes game_render_graph_smoke
artifacts/backend_driver/cheng run-host-smokes game_audio_graph_smoke
artifacts/backend_driver/cheng run-host-smokes game_control_surface_smoke
```

完成定义：

- 不依赖外部游戏引擎承载世界、物理或脚本语义。
- ECS/Physics/Render/Audio/Input/Agent 都由 Cheng runtime 显式建模。
- 资源身份是 CID/manifest，不是路径或宿主 handle。
- 同输入回放结果 hash 一致。
- 不支持能力 hard-fail 并写 report。
- macOS 首闭环能打开真实窗口，展示 2D 场景，响应 typed action，输出 tick receipt 和 world hash。
