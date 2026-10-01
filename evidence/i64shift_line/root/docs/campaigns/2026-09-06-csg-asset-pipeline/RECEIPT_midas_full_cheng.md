# MiDaS v2.1-small 全图纯 Cheng 单帧深度回执（2026-09-08）

## 结论

MiDaS v2.1-small（MobileNet 式反转瓶颈编码器 + refinenet 解码链，185 节点 / 97 卷积）
全图在纯 Cheng 中定点实跑，单帧 64×64 深度图与 torch fp32 真值对拍：

| 指标 | 值 |
|---|---|
| 相关系数 | **0.99997571** |
| 最大绝对误差 | 18.89（1.95% of 均值 967.34） |
| 平均绝对误差 | 16.02（1.66%），近常量系统偏置 +16 |
| p50 / p90 / p99 | 16.05 / 16.38 / 16.72 |
| depth 范围 | cheng [726.6, 1063.2] vs truth [740.0, 1078.4] |

且与 numpy 镜像仿真逐位一致（corr/maxerr/p50 三元相同）→ 实现即契约。

## 定点契约

- 权重 WS=1e6（int32），激活 AS=1e4（int32）；BN eps=**1e-3**（gen-efficientnet 实际值，
  1e-5 会造成逐块漂移发散）
- 卷积 int64 累加 → `trunc(acc/WS) + bias`（bias 为 AS 域；Cheng 整数除法向零截断与
  `trunc_div` 一致，整数加法可交换故求和顺序无关）
- ReLU6 = clamp[0, 6·AS]；残差加块输入（bn3 钩子真值是 post-add）；SE 恒等（导出模型已禁用）
- 上采样：refinenet 链 align_corners=True，output_conv 内为 False；权重 65536 网格
  **右移 32**（双重定点缩放）；端点钳制 `y0 ≤ ih-1`（fy=0），y1/x1 补防越界

## 权重派生链

1. torch.hub `MiDaS_small`（midas_v21_small_256.pt）→ state_dict（artifacts/csg_asset_pipeline/midas_v21_small_state.pt）
2. **scale=1e6** 重导 `.midasw`（旧 1e3 版把 running_var=0.00176 舍成 0，BN 折叠增益失真，
   是解码器发散总根因；修复后编码器 corr 全部 1.0000）
3. Python 侧 BN 折叠（float64）→ requantize → `folded.midasw`（194 条目，97 conv × w/b）

## 交付物与哈希（sha256）

- 程序：`src/tests/midas_full_64.cheng`（32746 行，含逐节点 CHK 聚合 + 深度文本导出）
  `efff2bee406fc3d383c020eafdf407dd257e48b30bf852e9ce5d42ed3aba3dad`
- 折叠权重包：`artifacts/csg_asset_pipeline/folded.midasw`（66.3MB）
  `c79b1699beb71c5da8cbe016584ab29dcaad2dc2659a020860c612ddec85ce02`
- 可执行（C 车头 cheng_w126_re arm64）：`dec204cf1e1a9830602df1e5d0d3daaced95ec8cd0c951c0f78a19bfbb1c410e`
- 深度输出：`artifacts/csg_asset_pipeline/cheng_final_depth.npy`；运行日志 `cheng_run7.txt`

## 复现

```
midas_full_64.exe <folded.midasw 路径>
# 输出 weights/CHK 185 行/DEPTHBEGIN..4096 值..DEPTHEND
python3 docs/campaigns/2026-09-06-csg-asset-pipeline/tools/receipt_final.py
```

## 已知偏差

- +16（AS 域）/1.66% 近常量正偏置：截断偏置累积，均匀分布于全部像素，非噪声。
- 真值中间激活 `*_bn3` 均为 post-residual 钩子值；`*_se` 恒等于 act 输出（SE 恒等实证）。
- 本回执为 C 车头（cheng_w126_re）验证；自宿主生产驱动复验待 const 接口缺口绿炉
  （csg_asset_gate baseline 复验同批待办）。

## 工具（本目录 tools/）

gen_stem32 / fix_dw_and_dump（dw ic 环去除+深度导出）/ fix_dw5_pad / fix_up_layout2
（NCHW 循环序）/ fix_up_clamp（端点钳制）/ receipt_final / localize_diverge /
probe_*（bisect 用）。
