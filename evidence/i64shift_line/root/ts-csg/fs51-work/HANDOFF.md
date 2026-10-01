

## 追加(c301 第4轮·验证被共享树 WIP 回归阻断)
- 纯 HEAD cheng_cold.c+补丁独立二进制(/tmp/p2m_driver/cheng)构建成功;A/B 双跑:**键完全稳定(f3bf97f3… 两轮一致)**——证明稳定文件名改造正确、键机制可靠;但仍 miss+exit2:纯 HEAD cold 对当前 runtime WIP 无法通过 borrow 校验(WebDocumentDispatchListeners body missing),工作树 cold(615 行 diff,含 op-lane 半成品)同样编不过(fx 轮 af9e04af 双轮同键 miss+exit2)。
- 结论:phase1 出口缺 store 的修复方案已明确且补丁就绪,但**验证被共享树无关 WIP 回归阻断**——任何可用二进制都无法对当前 entry 完成 compile⇒store⇒hit 闭环。待 op-lane 的 cheng_cold.c/cold_parser.c WIP 落定后,重跑 pbab.sh 即可闭环。
- 本目标可交付部分已交付:①entry 稳定名改造(html-csg-render.mjs,管线级恒 miss 根因消除);②根因三重定位(唯一文件名/phase1 缺 store/WIP 回归);③诊断基建(CHENG_CACHE_DIAG=1);④全套 A/B 方法论与数据。HANDOFF 即时更新。
