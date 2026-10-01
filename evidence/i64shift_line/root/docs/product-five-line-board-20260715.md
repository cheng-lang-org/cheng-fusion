# 五线并行板 (2026-07-15)

用户目标: 视频秒发+秒开+丝滑 | 鸿蒙宿主生成化 | 节点真数据 | 小优 CU 全覆盖 | 远端视频本地化

## 现状基线（台账）

| 线 | 已有 | 当前阻塞 | 本波子代理 |
|---|---|---|---|
| 秒发 | ingest rank-2 1.157x; door① 仍 2.8–4s; SHA256 编码器 7 函数 | #60 wiring 未进生产消费者 | `#60 SHA256 wiring land` |
| 秒开/丝滑 | seek v2; 暂停音频对称; 门②③ PASS | peer 死地址; 预暖未落; tap 仪表无 | `Video S3 prewarm peer` |
| 鸿蒙宿主生成化 | M3 切片0-2 落; 蓝图入库 | #57 GLES WIP; 三文件未接 WriteHarmony | 随 #43/M3 后续 |
| 节点真数据 | mdns 双进程绿; 安卓 full 被 RSS 挡 | #43 v1 连坐雷; 鸿蒙刷新零定义 | `#43 nodes snapshot v2` |
| 小优 CU | SABI+taskKind; #58 安卓去 Mock 真 JNI | 鸿蒙 NAPI 镜像; #66 S1a roomId | 鸿蒙 follow-up + `#66` |
| 远端本地化 | 与 S3/S6 同轴 | 预暖+peer+安卓流式 | 并入 S3 代理 |

## 诚实边界
- 「一口气完成」五线终态 = 多会话战役; 本波交付**可落账切片** + 硬阻塞显式化
- 真机 deviceOnly / 鸿蒙 UNAVAILABLE / Qwen 权重下载 = 需机主窗与授权
- 编译器 RSS 墙 (compat_ffi aarch64) 挡节点 full backend 装机

## 验收正典
见 `docs/cheng-video-e2e-miaofa-miaokai-plan.md` §1 五门 + 节点/小优各自 smoke
