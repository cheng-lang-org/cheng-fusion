
# wall125b.VERIFY

## wall125b 报告：内存 L3 批次 2 W5（merkle-store bootstrap/world-universe 子集）——三层证据+差分定量坐实 bootstrap 路径独占 ~449MB；落地 3 个相边界 relief 点（+18 行，编译门过）；配对验收被 ts-csg 线在途烤机管线迁移阻断（老配方烤机在迁移树上组合描述符三元串 0xDD 毒化，rc=9 fail-closed，与补丁无关=无补丁 B 同病）；烤机 2/3 轮，未 commit

日期 2026-09-03。授权面：merkle-store bootstrap 路径簇（compiler_snapshot_lowering_bridge/snapshot_cargo/merkle_store_pipeline/merkle_store_identity/csgc）。本批净改动=src/core/tooling/compiler_snapshot_lowering_bridge.cheng +18 行 3 hunk（备份 /tmp/oob_ab/memline3/batch2_w5/backup/…pre_w125b，sha256=02c9272d…）。基线 HEAD=be0f0b19b。LIFECYCLE_DESIGN.md 开工时不存在（w111c 同记），现场重采样重建证据链。

### 三层证据（全部现场实测，驱动=backend_driver/cheng 0e7ca635）

1. **分配层**：全量 heap——bootstrap 窗口驱动进程滞留 ~280–350 万个 non-object 小块（均值 ~129–140B，合计 ~360–490MB）；vmmap MALLOC_SMALL 脏页 434–455MB。lldb 只读采样块内容=canonical fact line 文本、envelope store 路径串、短数字串。MallocStackLogging 两次均致进程崩溃（rc=139 @33s/413MB；w111c 同记 rc=1 panic），如实弃用。
2. **相位层**：sample×39 窗符号化——未计账段（相位账外 ~100–165s）两条主活跃链：①EnsureInto→MerkleBootstrapAtInto→BootstrapExclusive→csgStoreBootstrapPut/WriteObject→csgStoreIdentity*→csgcEncode（=w111c 移交链）；②EnvelopeStoreCommitInto（单窗占 worker 78%）→ReadHeadOrAbsent→SnapshotReadCurrent/FindRequest→ReceiptDecode。csg→lowering 检查点 RSS before=643MB——大头在 snapshot 窗已落账。
3. **工作区状态层**：主仓根 envelope store 恒一份=**1006 代 head 链/18122 文件/88.5MB**；FindRequest 每读全链创世遍历（no-weakening 设计逐代重读重哈希）。cargo store 名含驱动二进制身份→每次重烤后首跑必走全量 bootstrap（186 对象）。

**差分定量（决定性）**：同驱动同夹具同 --out 连跑：run1（bootstrap 冷路径）226.4s/**716,668,928B(683.5MB)** vs run2（store 复用路径）56.2s/**245,710,848B(234.3MB)**——**bootstrap 路径独占 ~449MB/170s**，W5 归因定量成立；且证明复用路径释放逻辑正确、滞留差全部来自 bootstrap 窗口的分配 churn×malloc 高水位棘轮（可释放的均已 receipt 守卫释放，无"驻留到 emit 的大块"——W4 结论在 merkle 簇复现）。

### 修法（W1 相边界物理释放模式）

compiler_snapshot_lowering_bridge.cheng +18 行=3 hunk，在 snapshot 构建链三个提交相边界调用既有 `os.ProcessMemoryPressureRelief()`（库内 15+ 同形先例：compiler_csg、ReceiptDecode 尾部）：①Cargo store ensure 成功后；②Envelope store commit 成功后；③Authority issue 成功后（=snapshot-build→lowering-bind 交界）。语义零面、字节中性；A 烤机（1081s 全闭包真编译）rc=0=补丁编译门过。

### 配对验收：被外部在途管线迁移阻断（非本批文件面）

- 烤机 2/3 轮成功：A（含补丁）=f62d3ca04ef545c20eabedadb275ad0e138ef6119dd4b39cc15b615f6e2d9648；B（B 克隆树仅反 3 hunk）=d7390aa48d2bf3bf631b8ec88996b2e676100d710f1a7d756735d62bd2796ba0；同 size 212,387,424B；A/B src 全树 diff-rq 核对仅 2 文件异=我 hunk 文件+w122 线 14:58 在途探针文件（经 nm/strings 验证 A 未嵌入探针、与 B 同态，配对同性成立）。
- **四夹具×双侧全部 rc=9 `codegen_plugin_missing`（stderr 0xDD 毒化填充的三元串）**：含无补丁 B 同病+B 树自根复测同病+老驱动同命令正常——判为 ts-csg 线在途迁移（build_kernel_driver.sh +71/−48 未提交且 14:34/15:17 两次改写、plugin_manifest_* 10:11 manifest 化、composition_manifest.cheng 15:13 新建、新脚本需 --composition-manifest 而安装位 stage3 8/31 拒识）致老配方烤机的组合描述符三元未填充，毒化网 fail-closed 生效。第一次烤机尝试（新脚本+旧 stage3 rc=2 invalid argument；新脚本+backend_driver rc=139 segfault）一并如实记录。
- 预算判读：成功烤机 2/3；有效配对需在迁完成后的新管线上双侧重烤=2 轮，超限，按纪律停手。**字节铁门/RSS 对比/判词回归三项门禁顺延**，现成脚本 /tmp/oob_ab/memline3/batch2_w5/pair_verify_w125b.sh（40×45s 租约退避），管线拥有线完成安装后一键补验；毒化网本次以 0xDD fail-closed 形态生效（无 UAF/悬垂命中，uaf_scan_clean）。

### 交付与统计

- /tmp/oob_ab/wall125b.patch（43 行，vs HEAD be0f0b19b 累计式，git apply --reverse --check PASS，sha256=ac0942be756ff40f40106300a6492a1790b06e72ee4be500ed7daa6049ba848d）
- /tmp/oob_ab/memline3/batch2_w5_report.md（三层证据/差分/修法/阻断记录全量）
- /tmp/oob_ab/memline3/batch2_w5/：probe/（rsslog/heaplog/sample×39/符号化脚本/差分与 MSL/leaks 脚本）、pair/（rc=9 全套失败输出）、bake 两 log+report+driver+map+sha256、git 指纹、backup/
- src/tests 零残留；他人文件零触碰（build_kernel_driver.sh/plugin_manifest/composition_manifest 均未动）；B 克隆树已删（743MB）；主树仅含本批 3 hunk，未 git commit
