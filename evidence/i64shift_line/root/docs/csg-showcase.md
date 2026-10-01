# CSG 游戏+视频展示指南

CSG（cheng semantic game）交付全景的单一入口：一个可交互游戏（六世界）、五部双轨成片、六个物理/音频探针门禁。所有产物由同一套语义链路确定性生成。

## 快速开始

```bash
bash tools/csg_showcase.sh probe   # 探针门禁：6 项 PASS/FAIL 表
bash tools/csg_showcase.sh film    # 五部成片 ffprobe 体检
bash tools/csg_showcase.sh game    # 构建播放器并自动演示两段（含确定性重演验证）
```

`all` = probe + build + film + game 一次跑完。想手动玩窗口：`build_gui/csg_player_gui --window:artifacts/csg_world_video/csgworld/playground.csgworld`。

## 游戏：六世界

世界文件在 `artifacts/csg_world_video/csgworld/`，均为 ~1KB 级 `.csgworld` 语义资产。

| 世界 | 设计意图 | 交互支持 |
|---|---|---|
| climb | 攀绳垂直切片：绳物理 + 锚点爬升（ascent 片母世界） | 剧情锚定：W/J 被 authority 拒绝（HUD 提示），1-3/C/ESC 可用 |
| walk | 平地步态演示：标准行走周期 | 步表窗口内锚定（busy until tick ~1830），结束后 WALK/CAM 自由 |
| journey | 六镜头叙事长片母世界：行走+攀爬混合（journey 片母世界） | 剧情锚定：同 climb |
| playground | 自由行走/跳跃沙盒（busy until tick ~690 后全开放） | 全交互：W/J/1-3/C/ESC，唯一推荐自由游玩世界 |
| skeleton | 骨骼步态/运动学验证（skeleton 片母世界） | 剧情锚定：同 climb |
| ballbalance | 球上站立平衡：滚球接触 + 质心伺服（ball 片母世界） | 剧情锚定：同 climb |

交互事件被拒绝不是 bug：锚定世界的动作表拥有场景权威，动态注入会被诚实拒绝并提示「load playground.csgworld for free walk」。

## 动词表（交互键与脚本动词）

| 键/动词 | 行为 |
|---|---|
| W | 行走 4 步（空闲时排队，锚定时拒绝） |
| J | 跳跃（有冷却；飞行打印 before/apex/land 毫米轨迹） |
| 1 / 2 / 3 | 相机 1-3 切换 |
| C | 跟随相机（平滑追踪骨盆，行走不甩镜） |
| ESC | 退出 |

脚本自动化：`build_gui/csg_player_gui --play:<world> --script:<file>`。脚本文件每行 `<tick> <WALK|JUMP|CAM|Q> [arg]`（tick 为 240Hz 物理拍，Q 退出），参照 `artifacts/csg_world_video/player/play_script*.txt`。运行结束自动导出 session 并做确定性重演自证。

## 视频：五部双轨成片

全部为 h264 视频 + AAC-LC 音频双轨 MP4（24fps），由纯 cheng 的 VTBR/AAC/MP4 管线封装。

| 成片（artifacts/csg_world_video/ 下） | 时长 | 内容 |
|---|---|---|
| ascent/ascent.mp4 | 10s | 爬绳六镜头字幕片，240 帧，双轨 |
| journey/journey.mp4 | 60s | 六镜头叙事长片（行走+攀爬+THE SUMMIT 收尾），1440 帧，双轨 |
| skeleton_film/skeleton_walk.mp4 | 15s | 骨骼行走 8 步（360 帧），双轨 |
| ball_film/ball_balance.mp4 | 20s | 球上对比三幕（act1 滚球漂移 → act2 切换冻结 → act3 球顶站立伺服），480 帧，双轨 |
| duck_film/microduck_balance.mp4 | 16s | 机器鸭球上平衡：零速释放部署 + 球模式刚体伺服，384 帧，双轨；结幕卡按 manifest 自报 STABLE/SURVIVED 诚实判定（当前一炉为 SURVIVED 59 TICKS 基线） |

重生成命令见 `tools/csg_showcase.sh build` 的输出提示（ascent/journey/skeleton 三部用 `tools/csg_aac_link.sh` 配 `src/apps/{build_ascent,journey_film,skeleton_film}/main.cheng`；ball/duck 由 `src/apps/{ball_film,duck_film}/main.cheng` 各自流水线生成）。

## 探针门禁清单

`tools/csg_showcase.sh probe` 依次构建并运行（构建目录隔离在 `/tmp/csg_showcase_probes`，用完即清）：

| 探针 | 证明 |
|---|---|
| contact_support_probe | 地面接触/支撑解析，零拒绝步 |
| balance_probe | 平衡伺服门控：自由行走世界不误关、站立漂移达标 |
| phys_limit_probe | 关节距离限位（distmax/distmin）逐 tick 满足 |
| self_collision_probe | 自碰撞球对：接触检测 + 不穿透 + 分离 |
| skeleton_render_probe | 骨骼材质化 + 物理 + 膝/肘关节漂移阈值 |
| aac_bridge_probe | AAC-LC 音频桥（1s 440Hz 正弦 → 合法 AAC 包流），双轨片的音频基础 |

ball_balance_probe（球上站立合同）与 anchor_recycle_probe 随球片流水线并行开发中，暂未纳入本表；可直接构建运行：`artifacts/bootstrap/cheng.stage3 system-link-exec --emit:exe --in:src/tests/ball_balance_probe.cheng --out:/tmp/bbp`。其余扩展探针（anchor_spawn / joint_motor 等）在 `src/tests/` 同目录。

## 确定性合同

- 每个 `.csgworld` 有 facts CID；每次物理执行收敛出 **chainCid**（状态链哈希）。
- `--play` 运行把交互事件录成 session（`artifacts/csg_world_video/player/play_session.txt`：world/ticks/事件表/final chainCid），并**立即 headless 重演**——重演 chainCid 与实时链不一致即 FAIL。
- `--replay:<world> --session:<file>` 独立重放任意 session 验证同一合同。
- 成片 manifest（各片目录 `manifest.txt`）绑定 factsCid/chainCid/帧数/音频包数：片子是物理链的确定性投影。

一句话架构：`producer`（语义 facts）→ `materializer`（世界物化）→ `execution`（动作权威）→ `physics3d`（240Hz 确定性求解）→ `render`（CPU/GPU 光栅）→ `VTBR/AAC/MP4`（双轨封装），每跳以 CID/索引贯穿，无指针、无近似键。
