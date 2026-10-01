# UniMaker Voice Computer Use V1 Proposal

目标：在 CSG-Web facts 中落地 UniMaker 自有界面的语音任务型 Computer Use 第一阶段，只覆盖已抽取 control surface 的 typed action，不接真实淘宝抓取、不自动支付、不绕验证码。

本次 apply 的最小闭环：

- 从 `csg.web.control_surface` 一对一生成 `csg.web.computer_use_action`。
- 为 UniMaker React 生成 3 个内置任务模板：短视频发布草稿、授权商品发布草稿、购买辅助确认前。
- 每个任务步骤必须解析到唯一 typed action。
- `external-publish`、`payment`、`destructive` 步骤必须带确认 gate。
- report 输出 action 覆盖率、模板数、步骤数、确认 gate 数和 UniMaker readiness。
- smoke 和真实项目 gate 锁住 determinism、100% control-to-action coverage、3 个模板和高风险确认。

非目标：

- 不实现 ASR。
- 不实现 OCR、视觉点击兜底或坐标主链。
- 不抓取未授权淘宝商品。
- 不自动支付或绕过验证码、风控。
