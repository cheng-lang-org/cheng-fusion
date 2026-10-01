# Findings 索引（自动生成，勿手编）

来源 findings.md（2006 行 / 111 节）。再生：`python3 tools/findings_index.py`。
行号为生成时快照，漂移后按标题 grep。

## 开放工单（96）

| 行 | 标题 |
|---|---|
| 142 | 2026-06-10 stage3 cannot link tcp host resolver bridge without compiled whitelist update |
| 154 | 2026-06-10 ChengPerAppVPN 缺失 ClaudeCode 目标阻塞浏览器代理 |
| 166 | 2026-06-10 macOS VPN status 误走 mobile protect connect |
| 184 | 2026-06-10 x86_64 linkerless VPN server 复合返回 sret 空指针 |
| 200 | 2026-06-10 backend_driver 编译 bridge 仍触发 8GiB RSS guard |
| 212 | 2026-06-09 移动端范围收敛为全局 TUN/PAC |
| 258 | 2026-06-09 Android PAC STOP 主线程阻塞并触发 seccomp SIGSYS |
| 286 | 2026-06-09 Harmony 默认出口门禁仍锁旧 Windows IP |
| 298 | 2026-06-09 Android PAC GET 后本地 proxy listener 关闭 |
| 318 | 2026-06-08 pure Cheng Darwin self obj 仍未过 8GiB |
| 332 | 2026-06-07 Darwin/Linux/Windows selfhost perf gate 子代理并行复核 |
| 384 | 2026-06-07 VPN status FdReadWait timeout 参数不可靠 |
| 394 | 2026-06-07 UniMaker v89 APK install-commit 被设备包管理器阻塞 |
| 414 | 2026-06-07 UniMaker v88 APK 安装被设备包管理器阻塞 |
| 432 | 2026-06-06 RSA CRT computed pInv route traps in bigint.bigBitLen |
| 462 | 2026-06-06 RSA CRT local output-slot half exponent exceeds scratch timeout |
| 491 | 2026-06-06 cold fixed-array const length in P256 Montgomery scratch is unstable |
| 519 | 2026-06-06 RSA CRT output-slot half exponent signs but fails verification |
| 547 | 2026-06-06 RSA CRT slow 模幂在 cold 运行期触发 trap |
| 571 | 2026-06-05 Darwin pure ordinary 回归已清除：flag bridge / codesign 崩溃 |
| 601 | 2026-06-04 纯候选 `--export-roots` 请求解析失败且无 report |
| 639 | 2026-06-03 纯 Cheng system-link-exec 候选编译 ordinary fixture 长跑无产物 |
| 685 | 2026-06-03 cold parser 对注释行触发 trailing tokens recovery |
| 718 | 2026-06-04 BodyIR EGraph 跨模块 BodyIR/SoA 参数丢失 nested operand payload |
| 753 | 2026-06-04 lowering_plan_smoke 当前 Darwin exe 链接缺文件读取桥 export root |
| 781 | 2026-06-04 lowering_dense_phase_hotpath_smoke 当前 Darwin exe 链接缺 atomic fetch_add 符号 |
| 810 | 2026-06-05 pure self-compile 触发 std/os 内部 C bridge ZRPC 拒绝 |
| 839 | 2026-06-05 aarch64_encode helper 与内建 int32 转换重名导致 call resolution drift |
| 888 | 2026-06-05 coff_object_linker 调用 std/bytes 小写私有名导致 call resolution drift |
| 931 | 2026-06-05 pure self-compile 进入 lowering_plan 后 expr id mismatch 缺少定位 |
| 970 | 2026-06-05 body_ir_egraph 显式默认初始化违反当前 Cheng 规范 |
| 998 | 2026-06-05 handle_table 私有符号跨模块调用 |
| 1025 | 2026-06-05 std/bytes 调用 std/system 私有浮点 bit bridge |
| 1052 | 2026-06-05 pure self emit:obj typed expr 阶段超过 8GiB RSS |
| 1123 | 2026-06-05 Dense Store source+name 索引遇到 overload 硬崩 |
| 1150 | 2026-06-05 pure self `emit:obj` 14GiB 诊断在 streaming TypedIR 后触发运行时崩溃 |
| 1179 | 2026-06-05 stage3 构建 vpn-proxy-macos 触发 reachable body/provider link 缺口 |
| 1209 | 2026-06-06 media_video_e2e_native_player_smoke Darwin link pulls Windows RSA PSS symbols |
| 1242 | 2026-06-06 media_video_e2e_native_player_smoke TLS x509 root signature mismatch |
| 1272 | 2026-06-06 远端 Windows VPN CertificateVerify 与本地同版本结果不一致 |
| 1301 | 2026-06-07 UniMaker 全路由 CSS coverage 未闭合 |
| 1338 | 2026-06-08 Darwin pure candidate CSG profile 前崩溃 |
| 1369 | 2026-06-09 Android Google test reaches fake IP but HTTP connect times out |
| 1378 | 2026-06-09 Android one-click Google test uses Java DNS resolver instead of VPN fake-DNS dataplane |
| 1387 | 2026-06-09 Linux vpn-proxy server build misses mobile weak provider roots |
| 1395 | 2026-06-09 packet_header_model cold inline-if reads branch identifier as top-level source |
| 1403 | 2026-06-09 packet_header_model cold selects string AppendBytes overload for Bytes payload |
| 1411 | 2026-06-09 std buffer unqualified imported BytesFromString resolves to local module |
| 1419 | 2026-06-09 handshake13 cross-module cipher enum ABI drifts in ExpandLabel call |
| 1427 | 2026-06-09 ecnist cold var context copy drifts large struct arguments |
| 1435 | 2026-06-09 ecnist cold imported bigint const needs module prefix |
| 1443 | 2026-06-09 ecnist cold imported hkdf const needs module prefix |
| 1451 | 2026-06-09 sha384 cold parser rejects case-of syntax |
| 1459 | 2026-06-09 quic common expression body division needs explicit return |
| 1467 | 2026-06-09 handshake13 cold misses side constants in comparisons |
| 1475 | 2026-06-09 x509 cold imported Asn1Int64Next kind mismatch |
| 1483 | 2026-06-09 handshake13 cold StringList typed-let initializer mismatch |
| 1491 | 2026-06-09 minasn1 cold misses local tag constants |
| 1499 | 2026-06-09 hysteria2 protocol cold misses tcp request id constant |
| 1507 | 2026-06-09 qpack cold misses literal field line constant |
| 1515 | 2026-06-09 libp2p multistream cold alias int32 becomes object kind |
| 1523 | 2026-06-09 quic connection cold misses native stream side constants |
| 1531 | 2026-06-09 TLS ALPN typed let kind drifts in cold Linux server build |
| 1539 | 2026-06-09 sha512 case/of is unstable in cold Linux TLS closure |
| 1547 | 2026-06-09 QPACK imported body extraction is unstable around short-circuit condition |
| 1555 | 2026-06-09 UDP datapath bit-or assignment is unstable in imported cold body |
| 1563 | 2026-06-09 gf256 imported expression loses module constant |
| 1571 | 2026-06-09 quic multiaddress imported predicate loses module constant |
| 1579 | 2026-06-09 MsQuicTransport object-return init exposes MsQuicSettings payload width mismatch |
| 1587 | 2026-06-09 Harmony global PAC requires system permission |
| 1595 | 2026-06-09 Linux server crashes evaluating disabled native QUIC debug joins |
| 1603 | 2026-06-09 Android PAC stop closes listener from the wrong owner |
| 1611 | 2026-06-09 Android PAC stop can hang inside blocking local client read |
| 1619 | 2026-06-09 Android PAC stop wake needs an explicit local control byte |
| 1627 | 2026-06-09 Mobile PAC stop flag needs C atomic visibility |
| 1635 | 2026-06-09 Mobile PAC remote TCP connect must be stop-aware |
| 1643 | 2026-06-09 Mobile PAC listener poll needs stop-event wake fd |
| 1651 | 2026-06-09 Mobile PAC stop must signal on every stop call |
| 1659 | 2026-06-09 Mobile PAC listener stop early returns must close fd |
| 1667 | 2026-06-09 Mobile PAC accept must not pass empty sockaddr buffer |
| 1675 | 2026-06-09 Mobile PAC local proxy error must be visible in status |
| 1683 | 2026-06-09 Mobile PAC GET must never close without HTTP response |
| 1691 | 2026-06-09 Mobile local proxy reads must be fd-driven |
| 1699 | 2026-06-09 backend driver refresh passes Mach-O constants but blocks in generated compiler CSG RSS |
| 1709 | 2026-06-09 backend driver refresh CSG blocker needs time and RSS together |
| 1719 | 2026-06-09 CSG processed-frontier reduces refresh RSS but not enough |
| 1730 | 2026-06-09 Phase delta ledger is source-closed but needs runtime report proof |
| 1739 | 2026-06-10 Android global PAC protect-only loses SYN-ACK on Huawei |
| 1753 | 2026-06-10 ChengPerAppVPN bridge Darwin provider misses mobile protect ABI |
| 1761 | 2026-06-10 Cheng cold export-root misses combined attributes |
| 1769 | 2026-06-10 std_crypto_tls_smoke X.509 object initializer mismatch |
| 1777 | 2026-06-10 晚：cold 跨模块 str→bool 调用缺陷（x64 emitter 集成时发现） |
| 1783 | 2026-06-11 header 金字标题缺失定位（布局引擎 inline-flex 工单） |
| 1787 | 2026-06-11 Cheng direct std/rawbytes BytesLen `.len` lowering 不稳定 |
| 1890 | 2026-06-12 pixel oracle v142 矩阵：新方法学基线 59.18%，三类真值侧缺口定位 |
| 1951 | 2026-06-12 VPN exit Linux x86_64 OPEN 路径 trap |

## 按主题

### 编译器 cold/bootstrap（57 节，开放 53）

- ⛏ L142 2026-06-10 stage3 cannot link tcp host resolver bridge without compiled whitelist update
- ⛏ L332 2026-06-07 Darwin/Linux/Windows selfhost perf gate 子代理并行复核
- ⛏ L432 2026-06-06 RSA CRT computed pInv route traps in bigint.bigBitLen
- ⛏ L462 2026-06-06 RSA CRT local output-slot half exponent exceeds scratch timeout
- ⛏ L491 2026-06-06 cold fixed-array const length in P256 Montgomery scratch is unstable
- ⛏ L519 2026-06-06 RSA CRT output-slot half exponent signs but fails verification
- ⛏ L547 2026-06-06 RSA CRT slow 模幂在 cold 运行期触发 trap
- ⛏ L601 2026-06-04 纯候选 `--export-roots` 请求解析失败且无 report
- ⛏ L639 2026-06-03 纯 Cheng system-link-exec 候选编译 ordinary fixture 长跑无产物
- ⛏ L685 2026-06-03 cold parser 对注释行触发 trailing tokens recovery
- ⛏ L718 2026-06-04 BodyIR EGraph 跨模块 BodyIR/SoA 参数丢失 nested operand payload
- ⛏ L753 2026-06-04 lowering_plan_smoke 当前 Darwin exe 链接缺文件读取桥 export root
- ⛏ L781 2026-06-04 lowering_dense_phase_hotpath_smoke 当前 Darwin exe 链接缺 atomic fetch_add 符号
- ⛏ L810 2026-06-05 pure self-compile 触发 std/os 内部 C bridge ZRPC 拒绝
- ⛏ L839 2026-06-05 aarch64_encode helper 与内建 int32 转换重名导致 call resolution drift
- ⛏ L888 2026-06-05 coff_object_linker 调用 std/bytes 小写私有名导致 call resolution drift
- ⛏ L931 2026-06-05 pure self-compile 进入 lowering_plan 后 expr id mismatch 缺少定位
- ⛏ L970 2026-06-05 body_ir_egraph 显式默认初始化违反当前 Cheng 规范
- ⛏ L998 2026-06-05 handle_table 私有符号跨模块调用
- ⛏ L1025 2026-06-05 std/bytes 调用 std/system 私有浮点 bit bridge
- ⛏ L1052 2026-06-05 pure self emit:obj typed expr 阶段超过 8GiB RSS
- ⛏ L1123 2026-06-05 Dense Store source+name 索引遇到 overload 硬崩
- ⛏ L1150 2026-06-05 pure self `emit:obj` 14GiB 诊断在 streaming TypedIR 后触发运行时崩溃
- ⛏ L1179 2026-06-05 stage3 构建 vpn-proxy-macos 触发 reachable body/provider link 缺口
- ⛏ L1209 2026-06-06 media_video_e2e_native_player_smoke Darwin link pulls Windows RSA PSS symbols
- ⛏ L1395 2026-06-09 packet_header_model cold inline-if reads branch identifier as top-level source
- ⛏ L1403 2026-06-09 packet_header_model cold selects string AppendBytes overload for Bytes payload
- ⛏ L1411 2026-06-09 std buffer unqualified imported BytesFromString resolves to local module
- ⛏ L1427 2026-06-09 ecnist cold var context copy drifts large struct arguments
- ⛏ L1435 2026-06-09 ecnist cold imported bigint const needs module prefix
- ⛏ L1443 2026-06-09 ecnist cold imported hkdf const needs module prefix
- ⛏ L1451 2026-06-09 sha384 cold parser rejects case-of syntax
- ⛏ L1459 2026-06-09 quic common expression body division needs explicit return
- ⛏ L1467 2026-06-09 handshake13 cold misses side constants in comparisons
- ⛏ L1475 2026-06-09 x509 cold imported Asn1Int64Next kind mismatch
- ⛏ L1483 2026-06-09 handshake13 cold StringList typed-let initializer mismatch
- ⛏ L1491 2026-06-09 minasn1 cold misses local tag constants
- ⛏ L1499 2026-06-09 hysteria2 protocol cold misses tcp request id constant
- ⛏ L1507 2026-06-09 qpack cold misses literal field line constant
- ⛏ L1515 2026-06-09 libp2p multistream cold alias int32 becomes object kind
- ⛏ L1523 2026-06-09 quic connection cold misses native stream side constants
- ⛏ L1531 2026-06-09 TLS ALPN typed let kind drifts in cold Linux server build
- ⛏ L1539 2026-06-09 sha512 case/of is unstable in cold Linux TLS closure
- ⛏ L1547 2026-06-09 QPACK imported body extraction is unstable around short-circuit condition
- ⛏ L1555 2026-06-09 UDP datapath bit-or assignment is unstable in imported cold body
- ⛏ L1563 2026-06-09 gf256 imported expression loses module constant
- ⛏ L1571 2026-06-09 quic multiaddress imported predicate loses module constant
- ⛏ L1579 2026-06-09 MsQuicTransport object-return init exposes MsQuicSettings payload width mismatch
- ⛏ L1699 2026-06-09 backend driver refresh passes Mach-O constants but blocks in generated compiler CSG RSS
- ⛏ L1709 2026-06-09 backend driver refresh CSG blocker needs time and RSS together
- ⛏ L1761 2026-06-10 Cheng cold export-root misses combined attributes
- ⛏ L1769 2026-06-10 std_crypto_tls_smoke X.509 object initializer mismatch
- ⛏ L1777 2026-06-10 晚：cold 跨模块 str→bool 调用缺陷（x64 emitter 集成时发现）
- ✓ L1808 2026-06-11 scene-runtime 0.15s/1687B 空 obj 之谜 = 生成源混入桩 main 触发 DCE 团灭（已修）
- · L1848 2026-06-12 设备 MoQ 双进程时延被 opaque-local-reassign miscompile 硬阻塞（修复域=主线 2c）
- · L1909 2026-06-12 批次5 call 表达式节点化——形态实测 + cold 全局 str 回读缺陷
- · L1937 2026-06-12 VPN exit DNS smoke 触发 seq_set_grow 头损坏

### 编译器 纯后端/lowering（6 节，开放 4）

- ✓ L6 已解决（记录）
- ⛏ L200 2026-06-10 backend_driver 编译 bridge 仍触发 8GiB RSS guard
- ⛏ L1242 2026-06-06 media_video_e2e_native_player_smoke TLS x509 root signature mismatch
- ⛏ L1338 2026-06-08 Darwin pure candidate CSG profile 前崩溃
- ⛏ L1787 2026-06-11 Cheng direct std/rawbytes BytesLen `.len` lowering 不稳定
- · L1814 2026-06-12 战役批次1 + PQC线首批

### UniMaker 视觉/功能 1:1（16 节，开放 11）

- ⛏ L212 2026-06-09 移动端范围收敛为全局 TUN/PAC
- ⛏ L394 2026-06-07 UniMaker v89 APK install-commit 被设备包管理器阻塞
- ⛏ L414 2026-06-07 UniMaker v88 APK 安装被设备包管理器阻塞
- ⛏ L1301 2026-06-07 UniMaker 全路由 CSS coverage 未闭合
- ⛏ L1611 2026-06-09 Android PAC stop can hang inside blocking local client read
- ⛏ L1619 2026-06-09 Android PAC stop wake needs an explicit local control byte
- ⛏ L1627 2026-06-09 Mobile PAC stop flag needs C atomic visibility
- ⛏ L1659 2026-06-09 Mobile PAC listener stop early returns must close fd
- ⛏ L1719 2026-06-09 CSG processed-frontier reduces refresh RSS but not enough
- ⛏ L1783 2026-06-11 header 金字标题缺失定位（布局引擎 inline-flex 工单）
- · L1865 2026-06-12 水墨 M1 主链闭环：3x glyph SDF + 明朝體真机落地（v142）
- ⛏ L1890 2026-06-12 pixel oracle v142 矩阵：新方法学基线 59.18%，三类真值侧缺口定位
- · L1921 2026-06-12 水墨 M2 动画主体闭环：引擎驱动落墨→溅射→消散真机验证（v144）
- · L1962 2026-06-12 水墨首帧加载动画：3D 流体引擎真机收口（v150）
- · L1972 2026-06-12 LBM 水墨物理引擎真机收口（v152）：墨滴入水首帧动画最终形态
- · L1998 2026-06-12 M3 墨晕转场 + 气效收口（v162 已装机）

### 网络 MoQ/QUIC/libp2p（4 节，开放 4）

- ⛏ L1369 2026-06-09 Android Google test reaches fake IP but HTTP connect times out
- ⛏ L1387 2026-06-09 Linux vpn-proxy server build misses mobile weak provider roots
- ⛏ L1419 2026-06-09 handshake13 cross-module cipher enum ABI drifts in ExpandLabel call
- ⛏ L1595 2026-06-09 Linux server crashes evaluating disabled native QUIC debug joins

### 平台 Windows（3 节，开放 3）

- ⛏ L286 2026-06-09 Harmony 默认出口门禁仍锁旧 Windows IP
- ⛏ L318 2026-06-08 pure Cheng Darwin self obj 仍未过 8GiB
- ⛏ L1272 2026-06-06 远端 Windows VPN CertificateVerify 与本地同版本结果不一致

### 平台 Linux/RISCV（3 节，开放 2）

- ⛏ L571 2026-06-05 Darwin pure ordinary 回归已清除：flag bridge / codesign 崩溃
- · L1944 2026-06-12 VPN exit Linux 编译嵌套字段实参漂移
- ⛏ L1951 2026-06-12 VPN exit Linux x86_64 OPEN 路径 trap

### 内存/性能（1 节，开放 0）

- · L1990 2026-06-12 水墨真实感+性能终轮（v157 已装机）：触碰式增量 LBM + GPU 淡出 + 骨架编排

### 其他（21 节，开放 19）

- ⛏ L154 2026-06-10 ChengPerAppVPN 缺失 ClaudeCode 目标阻塞浏览器代理
- ⛏ L166 2026-06-10 macOS VPN status 误走 mobile protect connect
- ⛏ L184 2026-06-10 x86_64 linkerless VPN server 复合返回 sret 空指针
- ⛏ L258 2026-06-09 Android PAC STOP 主线程阻塞并触发 seccomp SIGSYS
- ⛏ L298 2026-06-09 Android PAC GET 后本地 proxy listener 关闭
- ⛏ L384 2026-06-07 VPN status FdReadWait timeout 参数不可靠
- ⛏ L1378 2026-06-09 Android one-click Google test uses Java DNS resolver instead of VPN fake-DNS dataplane
- ⛏ L1587 2026-06-09 Harmony global PAC requires system permission
- ⛏ L1603 2026-06-09 Android PAC stop closes listener from the wrong owner
- ⛏ L1635 2026-06-09 Mobile PAC remote TCP connect must be stop-aware
- ⛏ L1643 2026-06-09 Mobile PAC listener poll needs stop-event wake fd
- ⛏ L1651 2026-06-09 Mobile PAC stop must signal on every stop call
- ⛏ L1667 2026-06-09 Mobile PAC accept must not pass empty sockaddr buffer
- ⛏ L1675 2026-06-09 Mobile PAC local proxy error must be visible in status
- ⛏ L1683 2026-06-09 Mobile PAC GET must never close without HTTP response
- ⛏ L1691 2026-06-09 Mobile local proxy reads must be fd-driven
- ⛏ L1730 2026-06-09 Phase delta ledger is source-closed but needs runtime report proof
- ⛏ L1739 2026-06-10 Android global PAC protect-only loses SYN-ACK on Huawei
- ⛏ L1753 2026-06-10 ChengPerAppVPN bridge Darwin provider misses mobile protect ABI
- · L1900 2026-06-12 水墨 M2 第一块：ink overlay 通道真机闭环（v143）
- · L1916 2026-06-12 批次3 求值器 miss 桶消化——形态实测

