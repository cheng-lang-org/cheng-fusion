# VERIFY_step2_execdiff_0906_append —— Step2 收口尾项「组合驱动 exec_diff 复核」状态

date_utc=2026-09-06 凌晨 · 执行=主线程 · 主树=合入态（三补丁已落，见 VERIFY_merge_0906_append.md）

## 结论先行

**BLOCKED（如实记红，不 SKIP 成绿）：合入态主树的 aarch64 组合驱动装配被 1GiB RSS 守卫拦截——与 GEN2 自烤同一根因墙。** Step2 语义级收口的最后一步（组合驱动与本机驱动 exec_diff 等价复核）在当前源树上不可完成，前置=GEN2-LADDER 线的驻留释放批次穿守卫。

## 证据链

1. **冷链车头无组合参数面**：cheng_w126（9/3 烤，sha 前16 记录于历史台账）对
   `--composition-manifest:` 报 `invalid argument`；主树 bootstrap/cheng_cold.c
   grep composition-manifest = 0 处——组合装配能力只在 .cheng 侧
   （src/core/tooling/composition_manifest.cheng）。C 链按 R4 定位只产 GEN1，
   此为架构既定，非回归。
2. **组合载具装配也穿守卫**：用 wall154 遗留组合驱动 d1（187MB arm64，
   sha256 前16=31a3dc23cfb77c33，9/5 18:36 烤）为 builder 重 assembly 合入态
   kernel+plugin_aarch64 闭包：`rss_limit_exceeded rss_bytes=1128924576
   limit_bytes=1073741824`，build_rc=125。日志=/tmp/oob_ab/merge_0906/composition_build.log。
3. **根因同 GEN2**：9/2 收卷时组装 rc=0，其后 PhaseB 特性入库使源闭包增长，
   驻留需求过 1GiB 线（kernel-only 自烤死点 1.147GiB、组合闭包死点 1.129GiB 同量级）。
4. **复跑命令**（守卫穿后即成）：
   `CHENG_DISABLE_COLD_OBJECT_CACHE=1 tools/build_plugin_driver.sh --arch aarch64 --driver <组合载具> --out-dir <dir>`
   继以 `tools/user_path_gate.sh --driver <组合驱动> --baseline docs/campaigns/2026-08-31-kernel-userpath/user_path_baseline.tsv` 判 4/4 与 kernel 驱动 m2 轮（f0cf2f4d）配对等价。

## 附带定谳

- 禁缓存口径再验证：本轮显式 CHENG_DISABLE_COLD_OBJECT_CACHE=1。
- 数据点已移交 GEN2-LADDER 线：其驻留释放直接解锁本项（组合闭包 > kernel 闭包，
  释放账需覆盖更大需求面）。
- Step2 状态：脚本级 ✅ / 语义级四夹具 4/4 ✅（kernel 驱动，合入态复验 9/6）/
  exec_diff 复核 ⏸ BLOCKED（1GiB 守卫，前置同 GEN2）。不回卷已绿项。
