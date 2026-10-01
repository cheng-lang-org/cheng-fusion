# bahrain-traffic-contraventions 证据

目标页：`https://services.bahrain.bh/wps/portal/TrafficContraventionsPayment_en`
（GDT 交通违章缴付门户）。管线：`html-csg-render`
（fetch → parse_html → css_collect → emit_tsx → fonts → csg_extract → validate
→ materialize → **compile_link** → run_raster → encode_png）。

## 目录

| 文件 | 内容 |
| --- | --- |
| `compile-receipt.json` | 编译耗时 / 峰值 RSS / 编译器与源码 sha256 / 等价性与回归结论 |
| `pixel-diff.json` | 浏览器真值截图 vs 纯 Cheng 原生光栅的逐像素对拍 |
| `pixel-diff-heatmap.png` | 差异热力图（32px 分块，红=差异大） |
| `listeners.ground-truth.json` | CDP `DOMDebugger.getEventListeners` 抓到的浏览器事件绑定真值 |
| `event-parity.json` | 事件 1:1 对账与命中计数 |

## 浏览器真值

- `live.png` — Chrome 真值截图，1280x800
- `snapshot.html` — Chrome 内联计算样式后的单文件 DOM（管线输入）
- `fonts-extra/material-icons.woff2` — 图标字体

真值抓取与管线消费必须用同一个 UA（该站点按 UA 返回不同标记）。
`listeners.ground-truth.json` 用的是与 `snapshot.html` 相同的移动 Safari UA。

## 结论摘要

- **compile_link**：600000ms 预算超时 → **18052ms**（>33x 进入预算内）
- **事件 1:1**：静态可转译绑定 7/7（click 6、change 1）全部落到 Cheng 监听器
- **像素**：精确一致率 66.03%，±16 容差内 84.21%，MAE(RGB) 20.87

未达成项与边界见各 JSON 的 `outOfScope` / `verdict` 字段，均为实测值而非估计。

## 最新阶段耗时（2026-08-29 09:23）

| 阶段 | ms | 占比 |
|---|---:|---:|
| fetch | 5.1 | 0.0% |
| parse_html | 6.1 | 0.0% |
| css_collect | 46.2 | 0.1% |
| emit_tsx | 68.3 | 0.2% |
| fonts | 1.6 | 0.0% |
| **csg_extract** | **1,429.1** | 4.1% |
| validate | 10.4 | 0.0% |
| materialize | 311.5 | 0.9% |
| **compile_link** | **19,106.3** | 55.0% |
| **run_raster** | **13,578.9** | 39.1% |
| encode_png | 76.6 | 0.2% |
| render_check | 94.1 | 0.3% |
| **合计** | **34,734.2** | |

### csg_extract 已解决（8,650 → 1,429 ms）

held `csg-cli` 于 08:57 被重建（21,953,216 字节），新二进制接受 `--canonical-input`，
跳过的正是前文识别出的"对已验证规范行做二次 JSON 规范化"。
`render.png` 与 `page.cheng` 与基准逐字节一致，确认 bit-exact。

### run_raster 剩余热点（已定位，未修）

`sample` + `CHENG_COLD_DUMP_FN_MAP=1` 索引翻译后，热点分两组：

- **分配器簿记**（约 3,386 样本）：`cheng_allocation_ledger_slot_at` 1258、
  `cheng_ptr_plus` 906、`cheng_allocation_ledger_any_active_locked` 508、
  `cheng_bytes_set` 441、`cheng_allocation_ledger_owner_thread_active_locked` 273
- **CSS/属性查找**（约 1,296 样本）：`WebDocumentInlineStyleValueAt` 248、
  `WebDocumentInlineStyleNameAt` 235、`WebDocumentGetAttribute` 226、
  `WebCssClassListContainsSpan` 215、`WebCssIsWhitespace` 209、`WebStyleSheetComputeStyle` 163

属性查找疑似线性扫描且每次调用做字符串解析；分配器每次分配都要查 ledger。
两处都属于运行时核心改动，未做。

## 官网首页回归验证

从官网 URL 现场重抓真值后整链重跑（`html-csg-chrome-snapshot` → `html-csg-render`
→ `html-csg-pixel-diff` + `html-csg-listener-census`），结果与离线快照版本一致：

| 项 | 结果 |
| --- | --- |
| 真值截图 `live.png` | 与上一版**逐字节一致**（浏览器渲染稳定） |
| `snapshot.html` | 差 1491 字节，仅为门户 `digest!` 令牌与导航态 URL 变化，无结构差异 |
| compile_link | 18,649 ms |
| EVENTCHECK | total=7 hitok=3 dispatched=7（click 6/6、change 1/1） |
| 像素 | 精确 66.03% / ±16 内 84.21% / MAE 20.873（与上一版完全相同） |

管线确定性得到验证：同一页面不同时点抓取，转译与渲染结果可复现。

## 字形光栅化重写（run_raster 提速）

`src/core/runtime/web_raster_runtime.cheng` 的 `RasterGlyphMaskBuild` 原先对每个像素做
**8×8=64 次超采样**，每次都是一次 O(边数) 的 even-odd 射线判定，实测每个字形掩码约 33ms。
字形图集本身是健康的（实测 `entries=292 hits=767 misses=292`，命中率 72%），瓶颈在暴力采样。

改为**扫描线扫描**：每条扫描线收集轮廓边的交点、按 x 排序（精确有理数比较），
再对每个子采样列用前向游标 O(1) 摊销回答。语义完全对齐原实现（同一组采样点、
同一 even-odd 规则、同一严格不等号），只是求值顺序不同。

| | 改前 | 改后 |
|---|---|---|
| 可执行耗时（> /dev/null） | 22.62 s | 11.89–14.19 s（约 1.7x） |
| 管线 run_raster | 20,154 ms | 15,344 ms |
| 渲染 PNG | — | **与改前逐字节一致**（sha256 `da1573c0…`，61,217 B） |
| 保真指标 | 66.03% / 84.21% / 20.873 | **完全相同** |

门禁：`tools/build_backend_driver_clt.sh` 全过（status + self-check + raster 冒烟），
`web_runtime_font_smoke` 输出 `ok`。

> 注意：内存没有稳定改善（峰值 RSS 仍在 5–6.3 GB 间波动），这部分尚未解决。

## 未解决的两项（根因已定位，含实测数据与已否方案）

### csg_extract 7.0 s：88% 是同步子进程

`node --cpu-prof` 给出：`spawnSync` 占 csg_extract 自身耗时 **88.4%**。
（`sample` 对 Node 无效，抓到的几乎全是 `__psynch_cvwait`，看不到 JS 栈。）

跑的是 `csg fact-identities --mode sandbox <facts.jsonl>`，规模曲线：

| facts | 200 | 500 | 1000 | 2000 | 5266 |
|---|---|---|---|---|---|
| 秒 | 1.15 | 2.36 | 3.50 | 8.64 | 13.40 |

即 **约 0.8s 启动 + 约 2.4ms/fact**。TypeScript 本身只占 0.55s
（`createProgram` 341ms、`check` 207ms），大头全在 Cheng CLI 这次扫描。

已否方案（都别再试）：
- `emitCsgWebFromTsAsync`（validate 与 fact-identities 并发）→ 无实质收益，
  那 10s 是扫描本身，并发不掉。（副作用：输出与同步版逐字节一致，已保留。）
- `CSG_SKIP_FACT_IDENTITIES=1` 跳过扫描 → 下游硬失败
  `pure Cheng web subgraph identity 1 is missing`，身份是渲染路径必需的。
  **该开关已撤回**，避免留下会炸的配置。

下一步：让 `csg fact-identities` 本身变快（给 subgraph CID 做记忆化）。

### compile_link 23.6 s（parse 阶段）

修完 getenv 与前缀扫描后 profile 已经平摊，无单点热点。剩余前几名：
`cold_exact_op_consumes_definition_memo`、`cold_exact_op_consumes_definition`、
`cold_op_names_definition_candidate`、`cold_exact_body_dominators`。

线索：`body_invalidate_dominators()` 在每次 CFG 变更时**先释放再重建**支配树缓存，
增量构建 body 期间等于每次变更重建一次。改它要动 CFG 权威语义，风险高，未做。

已否：`BACKEND_JOBS=14` 并行 codegen 实测**更慢**（23.9s → 29.2s，RSS 192→229MB）。

### 内存 5–6.3 GB

`vmmap -summary`：`Writable regions Total=5.7G written=5.6G resident=258.2M swapped=5.3G`
→ 是分配 churn，常驻工作集只有约 258MB。
隔离：去掉 `WebRasterDumpPixels` 后 RSS 降到 4.27GB，但耗时几乎不变。
下一步：该函数每行 `str[]` `add` 2561 次再 `Join`，800 行约 205 万次短字符串分配，
需要可变的 string builder 才能根治。

> 本次全部计时在 load average ≈ 9 的主机上完成，绝对数字带 ±30% 噪声，
> 对比结论均取自同条件 A/B。
