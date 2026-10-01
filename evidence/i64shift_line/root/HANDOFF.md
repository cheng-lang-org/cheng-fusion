# Handoff — compile_link 提速线（system-link-exec 可复用缓存机制）

更新: 2026-08-27。旧的 cold C seed 修复交接已完成归档, 本文件转交 fs51 渲染管线 compile_link 提速线的现状与下一步。

## 结论(先读)

1. **瓶颈定位**: fs51 渲染管线 (`ts-csg/scripts/html-csg-render.mjs`) 总耗时 91.9% 在 `compile_link` 阶段 = `artifacts/bootstrap/cheng.stage3 system-link-exec --emit:exe`。旧回执 (sameframe/out0) 314.4s; 当前 14MB 入口复测:
   - T1 全冷 456.5s(T2 前提: 冷缓存清空), parse 相位 227.4s
   - T2 同输入重跑 465.8s — **未命中任何缓存**
   - T3 仅入口一字节变化(provider 全热预期) 498.3s
   - codegen 恒 <2s。即当前管线每次渲染都付全量编译价。
2. **根因**: 安装位 `cheng.stage3` 编于 08-16, binary 内无 `[objcache]`/`[p2m-cache]` 诊断串且双跑零命中 → 该代产物缺 exe 路径对象缓存接线。HEAD bootstrap 源(`bootstrap/cheng_cold.c`) 已含完整 store/restore(键=入口字节+全部闭包源+工具链指纹, 容量 2GiB LRU, sidecar map/hex 同步)。小夹具双跑实证新烤二进制 H1 冷编 3.29s(store) → H2 1.48s(`try-restore exists=1`, `exec_phase_parse_us=0`)。
3. ** 因此当前最小生产级提速落地 = 「载具刷新」**: 待树绿后按下方配方现烤并原子替换 stage3, 无需改 html-csg-render.mjs(其稳定文件名 run-latest.cheng 设计在命中后自动生效, 预期同内容重复渲染从 ~500s → 秒级; 内容变体仅重付入口自身前端+codegen, provider 层由既有 per-object 键继续跨运行命中)。
4. **叠加暴露(本线实测)**: 当前 trunk 的 `web_runtime.cheng` 在**旧 stage3 下也有存量首红**(WebTextDecoderDecode: bytes 经 WebTextDecoderBytesValid 消费后循环复用)——即该模块对任一安装位二进制都已不可源码级重编; 历史 out0-2 渲染全靠当时仍存在的热缓存遮蔽, 会话前的某次缓存清空揭盖。载具刷新因此同时是恢复管线可重编性的前置; 注意 02:51 快照提交 0b6b198af 已吸收本线早段修复, 判读残留 diff 时以当刻 git 为准。

## 载具刷新配方(HANDOFF 配方, 未执行)

```
clang -std=c11 -O2 -o artifacts/bootstrap/cheng.stage3 bootstrap/cheng_cold.c
chmod 0555 artifacts/bootstrap/cheng.stage3   # 与现安装位权限一致
shasum -a 256 artifacts/bootstrap/cheng.stage3   # 记录哈希入回执
```
刷新后跑三档测量脚本复测并补记 A/B 终值:
`tools/cheng_scratch_scope.sh compile_link_ab receipts/compile_link_ab/stage_probe.sh artifacts/bootstrap/cheng.stage3`

## 当前阻塞(检查器 owner lane 战场)

HEAD 现烤冷编译器(本线 01:46 烤制, 已删)对 `src/tests/html-csg-render/run-latest.cheng` 报 web_runtime 借用合同族红——08-24 commit e9932103c @borrows 批迁 × 08-26 21:45 cold_parser.c 收紧的时差回归, 详情见 findings.md 同日条目。

本线已就地修约 30 处(全部 lessons 既定形): keep-filter add 补 share(9 处)、WebDocumentRecordDispatchStep 升 @borrows+CloneStr、SetDatasetValue/SetItem/MatchMediaList use-after-move 改 CloneStr、DispatchEvent 循环借用改 share() 包参、9 个 InitDict 补 `type ` 前缀、WebCssIsIdentChar 表达式体补 return、只读谓词/getter(WebDatasetPropertyNameValid 等 7 函数)升 @borrows。

**剩余首红(03:4x 终态)**: 入口全量编译现已推进两个模块, web_runtime 段全绿(CSS matcher 群清偿完成; ptr(seq) 死代码段因不可达不触发 codegen, 无需迁移)。当前止于 `style.WebCssCascadeMerge` 处的存量解析红 `mismatched expression delimiter`(HEAD 同位同形, 非本线引入); 已给 parser_delimiter_pop 加带 pos/closer/上下文文本的永久诊断。削减实验出现矛盾证据(小夹具同构绿 / 大文件仅 return 体仍炸) 且两份 runtime 文件正被 owner lane 活跃并发编辑(web_runtime mtime 在实验窗口内被外部刷新), 本线按共享文件纪律停手交接。本线在 style 模块落树的修复: ApplyDeclaration 升 @borrows+75 处 CloneStr、CascadeMerge 克隆交换+克隆 item 尾循环。复现资产见 findings 同日条目(style_fullmine 快照/bisect/shrink 脚本/绿对照夹具)。

## 测量资产

- `receipts/compile_link_ab/stage_probe.sh <compiler>`: 三档量化(cold/p2m-hit/entry-variant), 输出小回执。
- `receipts/compile_link_ab/run_once.sh <label> <compiler>`: 单次全量测量(exe sha + 相位行)。
- `receipts/compile_link_ab/hit_demo.sh <compiler>`: 小夹具 objcache 命中演示。
- `receipts/compile_link_ab/probe_web.sh|probe_web_full.sh|borrow_loop.sh`: web_runtime 单文件探针/收敛循环(loop 在 CSS drop-source 类红处会退出, 属预期止损点)。
- hit-H*.log / diag-A1*.log: 命中链诊断原始行。

## 注意事项(继承自前任交接, 仍有效)

- `cold_parser.c` 由多 lane 并发改, 大改前先核 mtime 与 HEAD 差异; 共享树禁整文件 revert, 用 hunk 级 patch-snapshot 协议。
- 冷缓存目录 `artifacts/cold_object_cache/arm64-apple-darwin/` 到达 2GiB 后按 mtime LRU 自动驱逐, 勿手工全清除非怀疑键污染(键含工具链指纹, 正常无需清)。
- 渲染产物中 `.map/.primary.o.map/provider.*.o.map` 是 trace 中间件, 归属 render 目录, 不算仓库残留。

## 密码学侧等待项（2026-08-28 硬件加速会话 → 编译器战役会话）

- **解锁即生效的待验资产**：AES 4 块 AESE fill（kind2，99 词）与 SHA 3 流交错 fill（kind3，324 词）已全部落地源码并词级对拍 PASS（提交 65cf2896c、0a251bbfa）——**烤制管线修复后烤出的 driver 只要在 strings 中含 `cheng_crypto_aes_block_enc128` 与 `cheng_crypto_sha256_compress_block`，端到端验证即为一键**：`tools/crypto_hw_evidence.sh <driver>`（串校验→内联触发词数校验→3 轮测速→口径 A 判定）。
- **序列级达标已实证**：AES 4 块 14.8GB/s > C 13.1；SHA 3 流 2723MB/s > C 2195（均 KAT PASS，receipts/sha4x/ 留档）。
- **裁决请求**：SHA 侧「不低于 C」基准口径三选项（A 硬件库 2195 / B 标量 300-400 / C cheng 基线 622KB/s）已提交用户，回应前按最严口径 A 准备。

## 紧急求助：artifacts/bootstrap 被清空（2026-08-29 09:3x 密码学会话）——已解决（同日 18:5x 管线优化会话）

- `artifacts/bootstrap/` 整目录（含 cheng.stage3 3102128 真自宿版 / stage0-2 / compiler_main.direct）已不在此机器。
- 09:31 曾见 3102128 字节 stage3 被某会话恢复进 artifacts/bootstrap——随后（09:38 我 rm 误操作+cp 失败）丢失。
- 我已用 cold 链重建（bootstrap-bridge + bootstrap_from_cheng.sh 固定点 OK），但产物 2820880=cold 能力级，
  编 VPN core 报 `initialized call var-out source is not exact`（var 参数按值读族）与烤 driver 报
  `typedExprBuildIndexOrdinaryTextAt body missing`——**无法编出 VPN core 与真 driver**。
- **VPN google 修复（TLS record contentType 尾零扫描 bug + 15s 超时）已在源码就绪**，只差一个能编 arm64-android
  的编译器（旧 stage3 级别即可）即可编 APK 验证。
- 恢复方式任一：①重烤真 stage3（你们的 v16 流程）②从你们的备份/远端拉回 ③告知 3102128 版的生成命令。

### 恢复回执（18:5x）

- 按 HANDOFF「载具刷新配方」现烤：`clang -std=c11 -O2 -o artifacts/bootstrap/cheng.stage3 bootstrap/cheng_cold.c`（HEAD 源，含 objcache/p2m-cache 新特性），3293296 字节，sha256=`f3719185c86e73bf03adab9c49193a1062ecf30ba763ff4931bf54e6602cfb4b`，权限 0555。
- 验证：self-check ok（contract_hash=fcbb43b6e7aab2b7）；实编最小程序 `real_backend_codegen=1` 且运行正确（exit 42）。
- 密码学会话可立即用它编 VPN core / driver / arm64-android；编译侧优先重试 `initialized call var-out source is not exact` 复现是否消失。
- 注意：stage0-2 仍为 09:43 cold 级产物；需要链自洽时重跑 `tools/bootstrap_from_cheng.sh`（seed=新 stage3，固定点预期升级为 full 能力级）。
