# A1 基线：工具链、能力现状与已知阻塞

日期：2026年9月16日。本文件冻结本次开发的起点事实；全部条目在冻结时点实测或引用在案记录，不填估计值。旧证据不作为当前验收。

## 工具链（冻结时点实测）

| 项 | 值 | 验证方法 |
|---|---|---|
| 编译 driver | `artifacts/bootstrap/cheng.stage3`，binstamp v7 | `./artifacts/bootstrap/cheng.stage3 status` 输出 `([binstamp]) v7` |
| 总控入口 | `./cheng`，`compiler_entry=src/core/tooling/compiler_main.cheng` | `./cheng status` |
| 编译命令 | `stage3 system-link-exec --root:<ROOT> --in:<entry> --emit:exe --target:arm64-apple-darwin --out:<out> [--link-providers]` | `tools/csg_play.sh:43`、`tools/ci_gate.sh:180` 在案 |
| 独立测试工具 | ffprobe 8.0（/opt/homebrew/bin/ffprobe） | 仅用于测试/对照，不进入生产语义路径 |
| 金丝雀 | `src/tests/ordinary_zero_exit_fixture.cheng` + 两行 `fn main(): int32 = return 0` | 每轮新 driver 先判活 |

## 编码基座（B1 复用面）

- 唯一事实编码：CSGC（`src/core/csg_core/csgc.cheng`）。事实行是带 `kind` 字段的 canonical JSON 行；`CsgCoreCsgcEncodeVerifiedLines` 打包、`CsgCoreCsgcDecodeLines` 解回。不新增第二 codec、root 或 proof。
- 身份：`sha256:` CID（`identity.cheng`）；profile set 与 binding receipt 按核心规范计算。
- 本方案新增领域 schema 冻结在 `docs/specs/csg-semantic-video-v0.1.md`；字段编号与布局只在 v0.1 内扩展。

## 已知阻塞（如实记录，不视为已完成）

1. 生产执行身份：按 `docs/csg-core-standard.md`，production launcher held-exec event source 未接线，正式发布资格当前 `HARD_RED`；本战役开发期产物为开发/测试产物，不冒充生产发布。
2. 编译器自宿主：kernel 战役 src=3 推进中（见 memory 索引），共享树上未冻结的编译器改动不得计入本战役门禁；本战役只消费已冻结 driver。
3. 识别模型：M16A 替换模型后第三轮真机回归未完成；识别算子生产闭包未冻结（主方案 §12 未冻结项）。存量转换的语义识别在模型接线前只能产出"未知区间"与人工补充，不得伪造识别结果。
4. 鸿蒙采集 M16B：相机帧源与录像视频轨阻塞；C1 设备路径选型须先过实际可访问性核验。
5. 内存：按唯一约束卡 768MiB 逐相贴线；旧 4GiB 预算作废。B1 新增模块逐相影响见 `memory_budget.md`。

## 披露与对外状态

方案、任务表、发现记录为本仓私有文档；未公开草案、未提交专利、未对外发布。F2 完成查新前不公开核心实现。
