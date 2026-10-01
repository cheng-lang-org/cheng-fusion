# Lessons

- **2026-09-17 CSG播放器能力不能跨入口否定（用户指正）**：新 `semantic_player` 的svblock记录/证据链未接像素解码，不等于已有CSG播放器不能上屏。须分别核查 `src/apps/csg_player/main.cheng` 的csgworld实时渲染、M17 SSM1平台媒体解码与场景渲染、以及新svblock消费者。评估存量视频收益应优先核查SSM1实际播放链和同质量输出，不得用仅保留原片的B2封装开销代表全部CSG编码方案。历史播放记录、现存源码、当前可执行产物及本轮上屏验证分别表述；默认二进制缺失不能抹去已记录的实现能力。

> 整理(2026-07-03): 全文精简重写(847→约370行)。已完结战役只留结论+可复用方法论,更早的已解决段在 `lessons_archive.md`。zero-C 六条铁律已固化在仓库根 `CLAUDE.md` 4b,本文不重复展开。
> 整合(2026-07-14): form54–58+AMB 四节合卷为「gen2 自举病作战手册」并按 GEN2AH4 判决修正(form56 V0 证伪);工作流节里错档的 UniMaker 条目并回 UniMaker 节,选择器/播放/设备认证条目聚簇合并。
> 压缩整合(2026-08-16): 264 条重排为「常备参考(主题整合)+日期教训流(链式战役按族合并)」双层;墙链/round 只留生产形与铁律,逐轮回执、exe 哈希等状态移除(状态以 progress.md 为准);跨条目重复规则归一。规则内容未删。


- 【2026-08-24 VPN-DNS 战役】arm64-android 端 str[] 跨调用破坏类实锤两处:fake_dns 导出 `Join([Join(domains,..)],..)` 恒产空串(文件 mtime 更新但 0 字节);解析器 `parts[]`+add+Join 构域名部分损坏。修法=单 rawbytes 缓冲 BytesGet/Set 累积 + 一次 BytesToString(SliceView 定长),离线 darwin 5/5 过。同日教训:desktop(darwin) 通过≠android 目标通过,冷后端按 target 分路径验证。
- 【2026-08-24 VPN-DNS 战役】诊断通道可信度分级:C 桥全局原子计数(ring/fd_write 钩子)> JNI nativeStatusJson(持 g_core_call_mutex 时返回 CachedStatusJsonMarked 旧快照,worker 存活期冻结!)> UI uiautomator 抓屏(混叠双窗口)。worker 存活时 wd.log status 行可能是会话初期的缓存——先看 isCached 标记再下结论。
- 【2026-08-24 VPN-DNS 战役】华为 ROM 浏览器流量绕行:VPN「已连接」且系统服务 DNS 正常进 tun,但华为/Kiwi 浏览器的 DNS+TCP 完全不走隧道(出口零拨号、环缓冲零新增),google 可直连故假象存活。VpnNetworkProvider:0 = 系统层无活动 VPN 网络。待查:浏览器私有多网络通道/IPv6 泄漏/per-app 路由;`setUnderlyingNetworks(null)` 替代钉死 Network 对象已落地。
- 【2026-08-24 VPN-DNS 战役】pm install -r 偶发静默卡死(无输出无 Success):重试一次多数成功;彻底卡死仅 adb reboot 解。装完必验 lastUpdateTime 变化,否则后续所有"装机验证"全在测旧包。
- 【2026-08-24 VPN-DNS 战役】deferred-direct DNS pump 真机全超时(baidu 等国内域也 NXDOMAIN),桌面端正常;ENOTSOCK(88) 曾现于 probe 路径。未修,见 scratchpad/HANDOFF-vpn-dns-answer-chain.md。
- 【2026-08-29 RWAD session】os.ReadFileBytesResult 的 err.msg 跨 Result 搬运(return Err[T](r.err.msg))触发退出期 ORC registry_miss 且被搬 str 内容损坏;字面量 Err/仅直读不搬运 rc=0,后续托管分配可掩盖。业务侧 FileExists 预检+字面量 Err;复现器 src/tests/orc_registry_miss_repro.cheng。
- 【2026-08-29 RWAD session】Ed25519 双约定迁移:geScalarMultBase(-B)与 geScalarMultBasePos(RFC8032)并存,验签入口带 epoch 分派(verify 的 negA 解码约定无关可共享);官方向量用 python cryptography 交叉生成最可靠。
- 【2026-08-29 RWAD session】osSliceStr 是闭区间[start,stop]含 stop,半开习惯静默错位;match 是 cheng 保留字禁作变量名。

- 【2026-08-29 RWAD session 2】托管 struct(GcfVote 含 Bytes 字段)add 消耗后复用=use of consumed,多组票各自重建元素;数组/roster 作只读参数跨多次调用必须加 @borrows,否则首次调用即被 move 消耗。治理 quorum 必须绑成员资格表:纯签名验证下任意假钥票都是有效签名,不校验 roster 等于谁都能提案权。


- 【2026-08-29 RWAD session 3】跨仓依赖清查先 grep 全仓引用点再分类:代码 import 依赖/运行时工具依赖/文档归属声明三层;本例只有第三层真实存在,文档反转即可闭环。改共享文档用精确 edit 逐条,禁止 sed 多行 pattern(实测把标题吞进行尾
- 【2026-08-29 RWAD session 4】ORC registry_miss 根因定谳=含托管 str 字段 struct 在构造器 sret 边界双重所有权:Err[T] 只对 OWN_MOVE 实参绑 consume(cold_parser.c L43788),borrow 来源位拷贝进 composite 无 retain;CloneStr 加固后崩点移至构造器自身 sret 边界,证明第二处缺陷。同族病灶对象字面量构造器已修(L37939),函数调用构造器形状未覆盖。runtime 探针法:release miss 点 dump ptr/邻近条目+全序列 trace uniq 找重复;program_support_backend.cheng 随 system-link 编译进程序可热改。独立 cc 编 cheng_cold.c 可行但缺 provider archive,端到端验证需先打通 provider bundle。

## Active

- 【2026-08-31 libp2p browser】桌面右栏 1:1 禁止用 `outerHTML` 再走 Cheng 排版：左边是完整 CSSOM，快照里没有 `<link>` 样式、display:none 重复节点会被 Cheng 重新堆出来，坐标与左边无关。正式路径=load complete 后先把 WebView 切到最终半宽，再抓 `getBoundingClientRect` + `getComputedStyle` + Range 文本盒（CLB2），Cheng 只按这些盒子 GPU 绘制。CLI 仍走 HTML compile；桌面/Android 失败必须暴露 snapshot 错，不得静默退回 HTML 排版。右栏事件必须打回左栏同一 CSS 坐标（pointer/key replay），DOM 变化用 rAF 合并重抓；禁止只画静帧。`#` / `javascript:` 链接不得 BeginLoad 关右栏。实时刷新走 `RefreshSnapshot`，失败保留上一帧，不得把 pending input 盖到活页面上。元素/样式 1:1 走 CLB3：字重/字体/阴影/overflow 裁剪/opacity/z-index/::before::after/逐字合并的文本盒/img+inline SVG。禁止只用底色矩形冒充完整样式。右栏 1:1 必须画左边 WebView 的计算盒子（CLB 快照），禁止把抓来的 HTML 再排一遍当桌面右栏。抓盒脚本由 Cheng 持有并导出，host 只 eval 回传字节，禁止 ObjC 内嵌 JS 源。Cheng 编译 CLB 并 GPU 绘制。HTTP 正文必须一次拷贝。全屏 loading 遮罩不画；Cheng 下拉不 replay，输入和按钮同步左栏后再 refresh。WK `evaluateJavaScript` 必须同步返回 CLB 字符串，禁止 `whenClear().then(capture)`：Promise 不解包会装 `CLB2-FAIL` 开空右栏（nodes=0），遮罩误判会永远不回调。失败/零盒不得 `rightOpen`。同域 iframe 按盒子偏移走进子文档。遮罩消失用 `webkit.messageHandlers` 事件再抓，禁止挂起等待。原生 `<select>` 的脸是选中 option 的 **text** 不是 `value`（value=1 显示成「1」就是这个）。禁止向上扫祖先 `querySelector('select')` 把搜索框/input 收成别人的 option。`<select>` 的 option 子节点不 walk（闭合列表会盖住后面的控件）。Cheng 下拉点选后把 value 写回左边同一控件（不 click 打开原生菜单）再 refresh。右栏不是 load complete 画一帧就停：左边每次 click/input/change/scroll/keyup 以及 MutationObserver 看到的 DOM 变化，用 rAF 合并后重抓 CLB 再编再画。禁止轮询。抓盒进行中再来事件就排队，导航世代不对的回包丢掉。原生 `<select>` 打开时 option 在 UA 层没有布局盒：抓盒必须用 `el.options` 在打开态画出每行（有 getBoundingClientRect 用真盒，否则按控件上方/下方合成），禁止只画空白面板。

- 【2026-08-28 wall12】`FinalPlanValid` 不得把含 nested reloc 的 `LedgerFunction` 整颗当 `var` 传入（helper 无 reloc 能过、含 call 的 main `ReceiptMismatch=7`）。对齐 `FrozenPlanValid`：分字段传 `plan/recipes/receipt`。`StrictValidateInto` 不能改成 `var plan`——`DirectObjectEmitValidatePlanObjectForTarget` 会 `call var unique-borrow authority is not exact`。Seal 算身份 CID 前必须先把 `itemIds/symbolNames` 放到 plan 上，否则过 ledger 后爆 `symbol identity rows empty`。CallOp 编码禁止 `PutCallOp(callSequence[i])` 按值掏 `targetSymbol`/`argSlots`，按下标写；两实参还要用 `@borrows PutI32SeqBody` 传 seq，否则 MatchesBodyIrIngress 二次哈希红。无 pin 的 `--emit:exe` 不得因 `semanticDebugBound=0` 卡死 WriteLineMap。中间代 kernel_driver 随手删，只留最新/v16。Cheng parser 对无参函数注解（`@borrows` 等）必须精确绑 routine row：`@borrows` 打在 `type` 块上是非法形，cold C 解析器会放过、kernel driver 走 normalized decl read 报 `function target missing for @borrows`。删类型上的注解，不要改 TargetDecl 放水。Form-B `):\n    RetType\n    =\n    body` 的 `=` 在返回类型下一行时，`ExtendRoutineHeaderReturnType` 不得按 bodiless-importc 帽回退到 lineLimit；下一 token 是缩进 `=` 则并入头部，套件由 `ExtendRoutineSuiteRange` 接管。非法无 `=` 缩进体仍回退（m3 负例）。`var name:\n    Type` 绑定 Form-B 必须在套件循环推进 cursor 之前延伸语句范围（`ExtendBindingEntryFormB(tree, cursor+1, statementLimit, tokenLimit)`）；只在 `ProcessBindingEntryRange` 内延伸太晚——类型行已被当独立语句。更深缩进以**行首** `var/let/const` 列为基准，不能用名称列。`var decl = decls[i]` 把托管 `NormalizedFunctionDecl` 整颗搬走，slot 变空，后续 `@ffi_handle` 读到 `importc=0` 误判 `requires importc`；只跳过 ffi_handle 的 copy 不够。必须 Clone 再写回，AppendInto 只读 `importc` 布尔，禁止按值掏元素。v16 编 125 字节 Form-B 探针功能对（m1 run=3）。1GiB 根修：快照 SoA 列写成 `{n,o}` 打包引用，不把整列炸成 JSON；`physicalSoa` 按 snapshot kind 扫描（merkle 重排后不是 lines[1]）；`cargo.csgcBytes` 仍是 JSON CSGC，`soaCid` 哈希 packed，禁止把 packed 拼进 merkle 对象。打包会话的 `ByteBuf` 全局禁止 `@borrows` 打在 `var` 上（v16 normalized decl 拒），`@borrows` 打在改它的函数上。338 代 envelope 的 FindRequest 全量解收据会把小编译顶到 1.1GiB+；探针编译清仓后 m1/m2/zero 进 1GiB。`ArtifactCid` 算 CID 只哈希物理字节，禁止为了 CID 再 `DecodeLines`。`kernel_manifest_smoke` 用 v16 编组合插件驱动仍越帽约 17MB。禁止提限。


- 【2026-08-29 RWAD session 6】str 的 ORC ABI={data,len,store_id,flags} 四段,flags=chengStrFlagOwned 标所有权;作用域释放走专用导出 cheng_str_release_scope(data,flags) 不经通用 release 入口——trace 探针必须挂这里否则漏计。owned 返回已有 snapshot_retain 机制;double-release=某 lowering 路径复制 Owned 标记未走 snapshot。trace 分析陷阱:同指针两次 release 的 payload 指纹会变(free 清零),按 (ptr,head) 二元组去重会漏掉 double-release,必须按 ptr 单键计数。

- 【2026-08-29 RWAD session 5】cold 编译器验证回路:cc -O1 独立编 cheng_cold.c 可行,但必须放镜像位置(artifacts/bootstrap/)+显式传 --toolchain-root,否则 provider_object_count=0。08-21 cold_parser WIP 定谳=强制 API 所有权注解迁移机制:borrow 实参绑 byval 托管形参一律编译拒绝,修复模式=@borrows(只读)/var(可变),两例验证(bfs helpers/DscContains)。全仓约 2000 处待注解,按目录分批。ORC registry_miss 完整因果=byval 托管形参位拷贝双 owner;新检查把静默错误变 loud。

- 【2026-08-22】批量脚本改码必须逐站点 diff 核验后才能继续:remove_tails.py 的 emit 循环漏发循环体(检测到 while true 后跳到尾块,中间 body 行从未 append 到 out),一次毁掉 2 文件 7 个循环体,其中 exit_dns 混有他 session 未提交 WIP。恢复靠 HEAD+diff 考古+手工回插。铁律:脚本删行必须显式收集待删行号-打印-二次确认-再删,严禁跳过不 emit 式隐式删除;跑完立即 git diff 全文核验,删除行数与报告不符立刻停。
- 【2026-08-22】frozen stage3 (Aug16) 审计误报新类:while true 无 break 循环之后的不可达语句(哪怕只是 BytesFree+return)触发 managed var carrier source is not exact / managed element field read lacks exact array root,报错指向循环所在函数,与所有权语义无关(极小复现:types+空循环+尾块即红)。修法=删除不可达尾块(死代码)。同族真红:var X: Bytes = var参数视图 初始化载体(TakePrefix/Append 旧形),修法=consume-and-replace(x = Drop(x,n),旧块经按值参数释放)。

## 2026-08-22 所有权注解迁移收官(DEV-27/STAGE3-27 双 27 全绿)
1. 托管类型(含 Bytes/str 字段)的 borrow 实参永不物化 plain copy——正确通路是 callee 加 @borrows 后 materialize 循环头 continue 直接传视图;plain copy 物化只服务 address-free 纯值。
2. 注解漏网高发区:同族函数的基础版(Epoch 变体注了,基础 signEd25519Raw/verifyEd25519 漏)、smoke 自身 helper、库函数注释承诺 copies 但实现位拷贝(RankSelected/SignVote)。
3. borrow 视图字段禁止 move 进 owned 结果(SignVote 的 voterPk=member.pk)——必须显式深拷贝;数组元素二次消费(m0res.value add 两次)在严格所有权下必炸,测试重构用确定性重算替代克隆。
4. 编译器诊断无 callee 名时,双探针定位法:materialize 物化点打 callee+idx,emit die 点打 fn+slot;两探针输出对齐即锁定调用链。

## 用户定则(长期有效)

- 【2026-07-11】每条后端性能线的发货终判 = **该架构真硅上的交错墙钟**（x86 判在 Linux 本机、B深/arm64 判在 Mac），字节账/obj 缩幅/往返计数一律只是必要条件非充分证据（M2b: obj 只缩 -1056B 仍 k5 +16.8% 回归）；qemu 等翻译层墙钟无效。跨机移植包（如 arm64 SIB 哨兵-2 臂）必须内嵌"目标机墙钟门未过不得启用"条款。
- 【2026-07-11】编译器内存墙(如闭包 lowering 超线性 RSS)的处置 = **极限确定性内存管理根修**(定点释放/流式生命周期/超线性算法修), swap 磨炉不是可接受路径; 相关 164-segv intern 释放案是确定性内存线的被阻前沿, 须根因定谳(语义 UAF vs codegen)后复活, 不许长期停在"禁用回退泄漏"态。
- 【2026-07-11】/tmp 重启即清空——重要产物（多日战役树/冻结快照/driver/补丁/夹具）一律禁放 /tmp 或 scratchpad，放持久盘（如 ~/cheng-f24）；补丁生成即落主仓 docs/，不落易失树内 docs/。本条因 f23 点火工作区 3 天工作随重启全灭而立（重建代价=从 300M 转录本考古挖回）。
- full selfhost 触发 RSS hard guard 时，默认动作是沿阶段账本修真实生命周期/物理释放；未经用户明确同意，不得提高上限继续跑，也不得把提限产物计入完成。临时提限只能是隔离诊断，并保留原上限失败证据。
- 【2026-08-16 用户指正】诊断跑必须带内存帽：无帽 emit-csg 诊断跑（merkle 闭包）footprint 可爬到 40GB+，macOS 直接强杀还殃及并行会话。形态=`CHENG_PROCESS_MAX_RSS_BYTES=<soft>`（编译器自身 fail-stop RSS 门，越界 panic 而非吃满机器）+ 外部看门狗按硬帽 SIGKILL 整进程组（run_capped.sh）。bake 沿用 1GiB 正式口径；大闭包诊断跑 soft=8GiB/hard=12GB，宁可诚实红也不许 OOM 全机。
- 【2026-08-27 用户指正】编译内存「理论极限」=确定性内存管理算出的**理论下界**，不是把 1GiB 硬帽改名。下界=寿命合同下消费窗 `max(相位强制重叠 live)` + 全程 ORC（48B/函数+64B/源文件），不含 2x/3x/+88MB 虚高。1GiB 只是官方进程硬帽。实测远大于下界是生命周期没按合同释放，修相位驻留，禁止提帽。

## 历史战役摘要(已完结,只留结论)

- **B5 移动端 aarch64 emit(2026-06-27)**: 真阻塞源=cheng_cold.c 的 aarch64 ELF object emit 路径未完成(非 src/core/backend;pure Cheng emit 基础设施已在但 cold 路径未切);后期 bail 演变为 SABI v2 violation——cold CSG/re-parse 合成源丢 @exportc 致 utf8_view param 被判非 C-ABI,且 cold 有多条 fn re-parse 路径,修单处不解;解阻=修 re-parse 保留 @exportc 或等 zero-C 后 cold 退役;SABI str param migration 会加剧此问题,需同步修。
- **K 计划(2026-06-20~22 已闭环 gaps→0)**: 槽分配器/store_shape/前端 no_node 三根因的修法与铁律已并入 cold 合同段;exec_diff GATE PASS + census×2 确定性 + bootstrap 定点不变是该战役的验证模板。
- **zero-C 2026-06-25/26 会话遗产**: v2 阶段编号权威源=`openspec/proposals/cheng-v2-in-place-refactor.md`(阶段1=表达式求值器换文本,阶段5=内存/PhaseArena),全局导航=docs/global_roadmap.md,勿混淆阶段号;PQC 三件套(mlkem/mldsa/slhdsa)NIST KAT 走 stage3 --link-providers 口径全绿并进 ci_gate。
- **combo A/B v2 迁移(2026-06-27~28)**: typed_expr 85 v2 SoA 列双轨+全消费者 read 点迁移完成;方法论(分段迁/先叶后父/删 v1 前提/归因法)已并入 combo 段;降 gap 的剩余路径=迁 write 点+删 v1 seq+str intern+Arena,多会话工程。

# 常备参考(主题整合)

## 通用工程纪律

### 测量与验证(compiler 主线)

- **UniMaker Android capture 证据链纪律(2026-07-04)**: APK summary 只证明打包/链接,不证明像素;必须有 `unimaker.android_headless_capture.v1 status=ok`、raw header/byteCount/sha256/viewport 校验和 retained pixel oracle 报告三者同时存在才算进入像素阶段。capture 命令环境必须写成 `VAR=value LD_LIBRARY_PATH=value ./exe`,不是 `VAR=value && ...`;成功写 raw 后显式销毁 EGL/pbuffer 并 `_Exit(0)`。每轮 one-click/APK/capture/pixel 后立即扫删 `.csgc/.csgc.debug/.csgweb`。
- **★census/大编译必须独跑,并发早死会被误读成 driver 缺陷(2026-07-03)**: dispatch_min 整编 census 峰值 ~6.5GB;并发跑第二个 census 会被杀(无 SEGV 标记,纯内存争用),曾被误读成"driver SIGSEGV rc=139"并幻觉出"数字来自 macOS 参考驱动"——全假。macOS 本机再犯实证:同 binary 同输入 ru_maxrss 并发 2.96GB vs 独跑 2.09GB。规则:① census/大编译串行不并发;② 凡入账主计划/commit message 的相表数字必须独跑产出(跑前 `pgrep -f zc_enumerate` 确认);③ agent 报"崩/换机器/口径变"先查 SEGV 标记+并发挤内存+原始日志铁证,幻觉 provenance 是低质信号。
- **★build-backend-driver freshness cache 不含 primary_object_plan.cheng——只改它不重建 driver(2026-07-03)**: freshness 指纹只含 candidate_freshness_core_types/lowering_plan/system_link_exec_* 字节数。只改 primary_object_plan 时命中缓存直接 restore 旧 driver(<1s 秒回=缓存命中没重建)。改后必须用运行时探针确认 driver 真含改动,或同时改指纹文件/require-rebuild 全编;秒回时绝不信"新 driver"。
- **★冷编码器三组件嵌套写静默丢失——`a.b.c[i] = v` 与"元素级 var 实参"都不落地(2026-07-04)**: 三组件路径元素写和三组件元素作 var 实参在冷编码器下都是静默 no-op——写进临时拷贝,原树不变,编译不报错。经 var 参数拆两级即正常。诊断特征:"写了但读回旧值"、依赖该写的下游元数据永远为空。规则:① 行级持久化一律走 Store 系 helper(ir 作 var 参数);② 新增嵌套写前先用最小夹具验证形状;③ 看到"某字段永远空/释放永远不生效"先怀疑写丢失,再怀疑逻辑。
- **★ZC meter 自身可以是被测缺陷的宿主——测量崩溃先验 meter 再追源(2026-07-02)**: cold arm64 FIELD_REF 字段偏移 >4095 经 `a64_add_imm` 的 `value<<10` 溢进 bit22,指令静默变形。规则:① census 数字跨轮漂移或枚举器自身崩,第一步 lldb 钉崩点+otool 反汇编核指令编码;② 裸 `a64_*` 编码原语没有 imm 位宽断言,传变量偏移的调用点全是同族嫌疑(修法=一律走 `a64_emit_add_large` 系组合器);③ meter 修复后全链路基线重定,旧数字作废。夹具/census 用现源 meter,不依赖 pinned 二进制。
- **★快照式自动提交树上 commit 级二分归因失效,用同 HEAD 文件级回退矩阵(2026-07-03)**: 本仓 "update" 自动提交是多 lane WIP 混卷的工作树快照,历史 commit 不构成可二分原子变更。正解=同 HEAD 逐嫌疑项拔除→重建→复测,N 轮全崩同一帧即洗清全部被拔项、锁定未拔项。崩溃归因看崩溃逻辑位置不看 RSS 死点;同一缺陷 macOS libmalloc 崩、Linux cold slab 可能静默,跨 lane 数字不可互证。
- **ZC/夹具口径(2026-06-29~07-02)**: 攻 zero-C 前沿用 full census(全模块)口径,单文件窄口径只作避争用 spot-check;全清夹具(期望 count=0)在 REQUIRE_PURE=1 下撞 provenance 门 ABORT,须 REQUIRE_PURE=0 直跑验 `.o 产出 + count=0`;族修复后同族计数可能不降反升=前置 bail 解除后暴露的下层前沿,判回归只看总数不涨+异族逐行持平+golden 字节一致;zc_enumerate 位置参数是 `.cheng` source,候选 driver 走 `ZC_DRIVER=`(混用得 no_object 伪失败);batch 常量测前现场复核,工作树值会被并发改回。
- **快验与生产证明是两条命令口径(2026-06-26/07-01/07-10)**: 迭代快验用增量 `build-backend-driver`(~7s);`--require-rebuild` 是 Pass B 全量重建(500-600s),才是"新源码进生产 driver"的自举证明。dry-compile 绿不代表 full selfhost 绿;它只量 source closure scan。改 CSG/lowering 源码不会加速已安装的旧 driver。
- **ZC 候选 driver 必须禁缓存重建后再量 RSS(2026-06-30)**: 显式 `BACKEND_INCREMENTAL=0 BACKEND_MULTI_MODULE_CACHE=0 CHENG_DISABLE_PRIMARY_OBJECT_CACHE=1`,否则量的是旧二进制。
- **诊断 baseline 易腐,动手前先实测当前态(2026-06-25)**: 旧诊断在当前 HEAD 早已不同,照旧硬修=白干一轮;阻塞源会随并发迁移变化,每次实测报错勿信旧记录。
- **perf 诊断 sample/instrument 优先,复杂度理论≠实测热点(2026-06-25)**: 代码阅读猜 O(n²) 两次全错,真热点靠 5 万级样本钉准;pure-backend 对全局 struct 定长数组字段元素读按值拷贝整个数组(反汇编铁证)——优化前先反汇编证拷贝行为。Self-probe 超 30s 先 `sample` 再定优化点。
- **perf 门禁数字必先问 codegen 路径(2026-06-29)**: ci_gate perf-theory-ratio 跑 stage3(cold runtime provider 口径);纯 Cheng driver(selfhost_direct)从未通过 perf 门,任何"纯 Cheng perf X 倍"旧结论先核实路径。理论下界按最大可用并行度建模,验收跑并行样本看 real/theory。
- **exec_diff 口径(2026-06-30)**: gate 默认测 official driver;源码已修但产物未刷时失败只证旧产物,先 `EXEC_DIFF_DRIVER=<候选>` 单样例复测再动源码;多个 byref/seq/str miscompile 同现先查 disasm 是否同一 whole-call 被重复发射(typed_expr 重复 LetCall),在 lowering 层做同线同 target/args 结构化去重并保护真实 `f()+f()` 语义;走 `emit:obj + cc-stub` 链路,SKIP 是阻塞不是通过。
- **证据必须绑 driver hash(2026-06-30)**: 路径相同≠二进制相同,mtime 新≠内容同步;summary 必须写测试时 `driver_sha256`,audit 现场算当前 hash 三方一致才算 gate 绿;hash 漂移不恢复旧 driver,对当前 driver 重跑 gate;candidate 绿不等 official 绿(driver_kind 必记);证据导入禁自覆盖,唯一证据先落独立 log。
- **beat-c completion 纪律(2026-06-30)**: 外部失败尝试只进 diagnostic ledger 不进 completion proof;crypto oracle 无 bail=44 ≠ 全树 44 完成(oracle 与 full ZC 分两口径记账);source 侧 bridge 编过≠完成,必须产出低 RSS candidate driver 跑 fixture 证明;Pass B A/B 分层以 `tools/pass_b_ab_compare.sh` 为权威。
- **honest revert + estimatedDelta 不可信(2026-06-25/30)**: 零收益/反向的优化诚实撤回不留 no-op 提交;workflow 估算 delta 必须 canonical 实测,0 measured 即 revert 不假报。
- **env-gated 探针在 selfhost driver 恒假阴性(2026-06-25→07-01 根因闭环)**: os.GetEnv 链(cstrlen 折叠 codegen bug)恒返空串,driver 内 FAIL_TRACE 全失灵;探针门改走 `cmdline.ParamStr`(实证通道完好)或先修 cstrlen 折叠。
- **cc 绿/ci_gate 绿 ≠ runtime wire 真执行(2026-06-30)**: strings 找到字面量只证源进 binary 不证分支进入——必须 env=1 端到端跑通+trace 真触发+emit 真改才算 done;同名 metric(csg_b_ms vs csg_e_ms)比对前先确认同一字段。
- **短 smoke 必须输出 marker 并由 gate 检查**: `mov w0,#0; ret` 是假绿;小 oracle 逐项 echo ok:/FAIL: 并带 expected/got。
- **差分/fuzz 生成器必须自带纯 oracle 自检(2026-06-24)**: 跑批前先证 expect 正确(如 pure-clang mirror);双向 FFI 用两个独立程序,lane 级 PASS/FAIL 才可归因方向。
- **表达式缺口修复标准(2026-06-30)**: 优先补 typed value node 统一语义(条件表达式进普通 RHS operand 路径),不写 return/let/call 专用下降;新 lowering helper 必须同时有"旧 driver 失败/新 driver 成功"最小 fixture 和真实 oracle 改善;函数指针参数 missing_call_target 只接受真 indirect call(sret ABI 证明),禁把形参名注册成静态 target;`fn f() -> T` 返回类型解析缺失会伪装成后端 gap(bail=803 案),先查 callee scope.returnType 再动 backend;跨模块字段类型归一化不准剥 `[N]` 后缀;索引在调用方 source 解析,聚合按值用 FieldLoad byte-exact copy。

### 共享工作树与多会话

- **共享文件撤回/提交铁律**: 绝不 `git checkout --`/`git restore` 整文件(抹并发 WIP 不可逆);改共享核心文件前查 mtime+WIP;提交用 `git apply --cached` 只 stage 自己 hunk——详见 CLAUDE.md 4b-5/4b-6。看原始版本用只读 `git show HEAD:path`。
- **patch-snapshot revert 协议(2026-07-01 实证生效)**: 任何可能 revert 的共享文件,动手前先 `git diff HEAD -- file > baseline.patch` 快照;revert = `checkout HEAD` + 立即 `git apply baseline.patch` 原子对,再 diff-of-diff 逐字节验证并发 WIP 无损。它是兜底,不是对共享文件做无把握实验的许可证。
- **未提交改动会被并发 "update" commit 吸收(2026-07-02)**: 工作树不留半成品,edit 落盘即正确;重要修复立即在 lessons/plan 留独立记录防归因丢失;A/B 归因用 `git archive <pre-commit> | tar -x` 导出快照树,不靠 stash。
- **共享树 build-verify 必串行,commit-protect 保命(2026-06-25)**: 并发 build-verify 会互相 `git reset --hard` 清掉;改完立即提交。
- **并发对比先重测当前基线(2026-07-01)**: op-lane 持续提交会漂移 canonical 基线,任何对比前在"0 自己改动"状态重测;测量工具本身也可能被并发改(zc_enumerate 默认 RSS 上限 12GiB→1GiB,需 `ZC_ALLOW_HIGH_RSS=1 ZC_RSS_LIMIT_BYTES=<bytes>` 才拿到可比数字)——全 source 同时 ABORT 先怀疑工具/环境变了。
- **driver corrupt 先查 stage2 vs cheng_cold.c mtime(2026-06-28)**: stage2 旧 + cheng_cold.c 新 = 中间态(旧 stage2 编新语法源生成不一致 C 致 runtime corrupt),等重建链。stage3 是 self-copy 冻结二进制: 能验"被编译源进 exe"的改动,不能验编译器 runtime 源改。
- **归因方法**: 反向迁回自己的精确 hunk 重测,勿 stash/checkout 整文件跑 clean HEAD;二分定点 commit 后用 `git log -S <可疑符号>` 找夹带代码;只读 review 并发改动(`git diff --stat` + 定向 rg)安全,改才是禁的。
- **外部进程**: 不 kill/TERM 非本会话编译/Claude 进程,只报告冲突并改跑隔离验证;外部遗留进程常带 RSS guard 绕过 env,内存峰值先查实时 PID/RSS 定位到具体进程。
- **多 agent 并行**: 同一核心文件不交给多个代理同时改,合并手动核 diff;并行子代理改同批文件要扫冲突标记+语义断裂;用户要求子代理并行必须真实 spawn_agent,并行 shell 不算;主线程保留最短关键路径。冲突标记清零或生成 merge commit 不等于语义合并完成;必须用 `--cherry-mark`/range diff 找出双方非等价提交,逐项证明。
- **二进制产物污染源文件**: 自动提交曾把 Mach-O 写进 `.cheng` 源路径并 commit;恢复用 `git show <最后源码commit>:path > path`。
- **isolated worktree 可能被 harness 中途回收**;已证明的改动要重打到 main 并在 main 重新验证。
- **多 lane 时差回归**: lane 改 bootstrap 检查器与改树注解若不同刻落地,其间烤出的二进制会带「旧检查器+新树」错位组合(2026-08-10 实证:h124 无 ptr 豁免撞树里新增的 strDataPtr @borrow_result)。判读新签名先做时序对表:二进制 mtime vs 相关 bootstrap/树文件 mtime;错位则按「现树 bootstrap+在案补丁」重烤新谱系二进制再判。
- **lane 高频协改期的红三形态**: 「unresolved function / reachable body missing / primary object emit failed」先按撕裂读处理:对 mtime 复核、隔 1-2 分钟重试;同错误跨两次同步仍存在才是真实缺口。编译入口 --out 目录必须先 mkdir。
- **「同读数两代」可被回退证伪(2026-08-09)**: 外部高频重构期的收敛判据=同读数连续 ≥3 代且跨 ≥30min,或对方自门绿+源码静默数小时;单次「愈」读数一律记为瞬态,不得解挂下游。
- **追编译器 bug 前先核对快照新鲜度与 findings 修复时间线(2026-08-15)**: 多 lane 并行仓里,"活 bug" 必须先用**最新源现烤/最新快照**复现一次再立案,否则在已修的尸体上做二分(「PathFileExists 恒假」用 15:52 快照追两轮子代理,实为共享 lane 20:5x 前已在当前源修好)。内建 op 按「调用点别名拼写」发射(如 `chengpath.X`)的排查捷径:换 import 别名重编,行为翻转=内建/intrinsic 层,行为不变=真函数体层。

### 子代理与并行

- **子代理验收声明必须亲验产物存在性(2026-07-21)**: 子代理收官报告可能与真实产物状态完全脱结(全树 grep 零命中、输出目录无二进制)。采信前必须亲验最小事实集:产物文件存在性、符号存在性(全树 grep)、关键命令独立重跑一次。报告的方案描述与代码事实不符时,以代码为准。
- **子代理额度以实时工具状态为准(2026-07-26)**: 每轮先查实时 agent 状态,在文件互斥且子任务可独立验证时持续补满并发槽;不能因旧会话状态放弃可用并行,也不能让两个代理同时改同一热文件。
- **子代理死产误判(2026-08-16)**: transcript 首小时只有任务行≠死产(写入可能延迟到收工),误判后重派同任务=两路并发写同一批共享文件的高危事故。判死产需更强证据:interrupt 探活一次或等更长窗,重派前必须先确认原派已终止。
- **后台 agent 的 `timed_out` 通知只杀任务壳(2026-08-09)**: 实例不死续跑。判活必须 `ps`+工作日志 mtime+resume 探活三联;凭通知即开新 lane 会造出并发多 lane。
- **一次性子代理不适合巨型机器 pinpoint(2026-08-14 双 drop/round91)**: 数月的所有权/清理发射机器、12k 行重写+数小时 lane 爆改,一次性读-only pinpoint 子代理 50-80 分钟无果;这类活直接交给 lane 或走精确行号级小任务。
- **并行只能发生在 authority 冻结之后(2026-08-14)**: `BACKEND_JOBS` 不能直接复用到 import body 解析。worker 仍共享 Symbols/arena/错误恢复栈时,多线程解析就是数据竞争;一次输出相同不能证明安全。正确顺序:串行完成 source/declaration/type/BodyIR/Symbols seal,再让 codegen worker 只读冻结表、写私有 action/fragment,按函数序号确定性合并。发现未隔离并行时应立即使该入口不可达并加防回潮门。
- **矩阵并行化(2026-08-14)**: CHENG_FUSION_MATRIX_PARALLELISM(未设=1 串行,安全默认),受控 worker pool 结果保序、与串行逐元素等价;census/大编译类仍禁并发,矩阵并发只调度小编译、每子进程仍受 1GiB RSS 帽。伪 driver 测并行时产物必须 cp 二进制,否则 macOS syspolicyd 对新建脚本的首次执行验证(~420ms/个、串行排队)污染墙钟。
- **共享文件 stash 二分协议(2026-08-14)**: `git stash push -- <pathspec>` 只暂存指定文件(他人 WIP 不动),stash pop 原子恢复;用于判定「测试红是我引入还是既有」。
- **cheng-fusion 效率对比三口径(2026-08-14)**: CLI 单发/ MCP 长驻/ 等价手工 shell。同口径才可比:手工基线必须完成同一可观察结果;不得拿「工具快速失败路径」对「手工成功路径」算 speedup。工具进程 rc=0 ≠ 任务完成——编译型工具必须解析报告判定可用性(driver 不兼容时全 CFAIL 但 MCP 调用 rc=0)。

### bash / zsh / 环境陷阱

- **bash 管道吞 rc/截输出(一日三踩)**: `cmd | tail; echo $?` 拿到的是 tail 的 rc——假绿过 tsc、假绿过 EBNF gen、截丢过 RC 行。纪律: 取证一律 `cmd > /tmp/x.log 2>&1; echo RC=$?` 再读 log;要尾部就 tail 文件,不在管道里判 rc。
- **zsh 特殊参数**: `path` 是与 `PATH` 绑定的特殊数组,作普通循环变量会改坏命令搜索;`status` 是只读参数,EXIT trap 禁止写 `status=$?`(统一 `exit_code=$?`)。shell 临时变量统一用任务限定名(`artifact_file`/`task_root`)。
- **DevEco/OpenHarmony 的 diff 劫持 PATH 返回假一致**: 对真实不同的两文件输出 0 行;`cmp` 与 `/usr/bin/diff` 才见真差异。凡 diff 结论与哈希冲突,先 `which diff`;生成 unified patch 一律 `/usr/bin/diff -u` 绝对路径。
- **对拍/差异判定一律 `cmp` 或 `git diff --no-index`(2026-08-09)**: 本机 `diff` 可对尺寸差 1513B 的文件返回 rc=0 零输出;断言一致性必须以直接命令的 rc 或 cmp 为准。
- **官方 gate 脚本 `#!/bin/bash -p` + 钉死 PATH 里用 `rg`** = harness 假红(连带 fail 标签)。修法=换 `/usr/bin/grep -Fxq` 等钉死 PATH 内等价工具。
- **关缓存 `CHENG_DISABLE_*` env 会话持久**: 同一 shell 随后跑 `ci_gate`/`build-backend-driver` 会全量冷编(分钟级),别当 hang/回归。
- **rg 捕获 helper 不能用于布尔判断(2026-08-01)**: 把 `rg` 输出捕获后再 `printf` 的 helper 返回 printf 状态,零命中也变 true;分支判断必须有单独 helper 原样返回 rg 的 0/1,并把大于 1 视为扫描错误。`rg -c ... || true` 会把扫描错误伪装成零命中,同理禁。
- **正则门禁必须用 mutation 证明运算符是字面量(2026-08-02)**: `rg` 中未转义的 `||` 是空 alternation,会让缺失状态检查的 mutant 假绿。
- **macOS 环境陷阱**: /tmp 大量落可执行并立即 exec 触发 Gatekeeper 验签 dyld 卡死(唯一 probe 路径+$TMPDIR+低并行);新 Mach-O 卡 _dyld_start 可能是宿主并行 cc 资源瞬态,先恢复环境再重跑。
- **CHENG_ROOT 环境污染链(2026-07-17)**: shell profile 固定 export CHENG_ROOT=主树 → 克隆内构建的二次自举子进程绕过 --root 读主树实时源码,报错误导归因。克隆内一切 driver 构建必须同一命令行 cd+export CHENG_ROOT=克隆根;复核报错先 grep 输出里的主树绝对路径,命中即污染判废重跑。
- **取证读码污染变体(2026-07-17)**: 取证臂声称基于克隆分析,实际 Read 的是主树路径下未提交重写版源码。铁律:①取证读码一律用克隆绝对路径,报告 file:line 附克隆内 grep -n 复算;②复核别人案卷先做行号对表,对不上=读码污染判废;③主树 dirty 期,任何以主树路径出现在证据链里的引用一律不采信。
- **CHENG_BACKEND2=1 空 provider_cache 陷阱(2026-07-17)**: 克隆树首次直接跑 CHENG_BACKEND2=1 构建,provider.o 会编出错误 @exportc 导出名,看似 backend2 回归实为环境态陷阱。先用非-backend2 模式全量预热一次(填充 provider_cache)再开。
- **并发探针必须识别进程,不匹配参数里的文字(2026-08-01)**: 未锚定的 `pgrep -f 'system-link-exec|...'` 会把监控日志、文档命令或自身探针参数误判为重任务。模式必须从 argv 首项开始,先证明 executable basename。
- **诊断显示字段名≠实义,先核 RecordXxx 实参序再归因(2026-07-24)**: ZC 显示 `call_ordinal=12` 是按形参名渲染,实参却是 errorCode/errorDetail/-1——12 是错误码不是第 12 个调用。凡 detail 串形似 key=value,先读写出该串的调用点实参再谈机制;「形似巧合」是最贵的诱饵。
- **探针读取已释放内存(2026-08-15)**: 给 die 路径加诊断打印时,必须检查打印点在 free() 之前还是之后;诊断字段优先用 free 前已拷出的局部变量。
- **探针/诊断收尾**: 临时探针(env 打印/instrument)用完必须回滚,修复保留;probe 夹具留 src/tests/ 下带 repro 语义即可。

### 磁盘 / 临时产物纪律

- **临时产物必须绑定拥有进程(2026-08-16)**: 大型 driver 每个约 650MB;固定 `.tmp-exec`、`--keep-build-tree` 与裸 `/tmp` 会在数次重烤后填满磁盘。默认 `tools/cheng_scratch_scope.sh`,退出即删;跨命令目录必须向 `cheng_disk_guard.sh --register` 登记拥有 PID。
- **盘满三增长点(2026-08-21 实测 2.2Gi 可用)**: ① `/private/tmp/zc_round2` 1536 隔离树 + `iso-r*`/`held_*` 共 44G，disk-guard 旧只盯 `.tmp-exec`/cold cache，lease 登记不到这些目录；② `artifacts/backend_driver/cheng.r2..r16` 每代 313MB exe+308MB .o，一轮迭代 ~10G；③ Cursor `state.vscdb` 25G（Cursor 开着不能 VACUUM，交给已有 `cursordisk.maintenance`）。隔离烤完只留 persist 小回执，工作树当场删；driver 代际只留 `cheng` + 最新 2 代。清扫入口=`cheng_tmp_scavenge.py` / `cheng_driver_gen_prune.py`，disk-guard 在隔离>8 或代际文件>6 或可用<4GiB 时自动跑。禁止把 193MB `compiler_main.exe` 副本堆在 `/private/tmp`。
- **盘满还有四条旁路(2026-08-21 再测 2.5Gi→33Gi)**: ④ Cursor `cursorDiskKV` 主体积是 `bubbleId`/`checkpointId`（单会话 13 万+ 行、检查点每份 ~40MB），不是 sqlite 空洞；`cursordisk.maintenance` 在 Cursor 开着时只空转等待，7 天保留等于几乎不删。保留改为 2 天，真正回收必须退 Cursor 后跑 `cursor_kv_cleanup.py` 再 VACUUM。⑤ Electron 自动更新残留：`Library/Caches/*updater*` + `*.ShipIt` + `pending/*.zip` 一次 2–4G。⑥ `~/.cc-switch/backups` 每 2 天一份 1G sqlite，只留最新一份。⑦ `~/.grok/sessions/**/recap_requests|compaction_requests|images` 旧会话堆积。⑧ 三台 Colima（cheng-lane-vz / chengx64 / chengarm64）各宣示 100G 盘，实际已 32G。清这些旁路不要动微信原件、Huawei SDK、iOS runtime。
- **长跑编译与 mutation 只保留最终小回执(2026-08-12)**: 临时树必须建在唯一任务专用根,每候选结束后立即清除 source copy、object/map、旧二进制,只保留最新可执行、哈希、摘要回执;禁止把多轮 1–5GiB 工作树并排留在 /private/tmp。清理目标必须先只读解析成任务专用绝对路径,禁止宽目录/glob。
- **长门禁必须逐次回收运行树(2026-08-11)**: 长编译或 mutation contract 每次只允许一个可追踪运行目录;结果写入固定小回执后立即删除工作树。启动下一次前复查活跃进程、运行目录数量和磁盘占用。
- **证据工作树必须有界且及时回收(2026-08-09)**: 只复制 compiler-resolved 可达导入闭包,禁止每个 mutation 复制整仓;长跑前先预算 `fixture_count * closure_bytes`,超过 2 GiB hard-fail;数据卷低于 64 GiB 不启动新多副本门;每个正式长探针在同一 shell 内 `mktemp -d` + EXIT/INT/TERM/HUP 精确删除;启动前清理同前缀孤儿目录。
- **临时证据必须即时回收(2026-08-14)**: 每个临时原子固定 `mktemp -d` + EXIT trap;只在路径命中任务专用精确前缀、且确认无活跃进程后,用绝对路径 `/bin/chmod` + `/usr/bin/find -depth -delete` 真正回收;禁止 Trash 冒充磁盘回收;清理失败必须覆盖原零退出码。清理只读证据树时先恢复 owner 写权限再删,禁止海量 permission-denied 半清理。
- **正式 lane 的 evidence 目录在 /private/tmp 可能被外部清理(2026-08-15)**: receipt 原文必须先落到 repo 外日志并立即抄录 hash;lane 成功后第一动作是把 lane-receipt JSON 和 stage3 sha 落盘到独立文件。
- **重型编译/门禁必须全局串行并限制完整进程树(2026-07-30)**: 历史两个 `unimaker-react` 分别占 56/33 GiB,swap LOW,WindowServer watchdog 重启。启动任何重型任务前确认无外部重型进程和低 swap;Darwin 采样只作诊断,正式硬门使用 Linux cgroup v2。禁止直接运行生成产物:所有 compiler/app 执行都走同一进程树 guard,启动前拒绝同产物已有活进程,超限 TERM→KILL 并等待全部后代退出。
- **大型正式门启动前后都要检查 `df`(2026-08-15)**: 低于 20GiB 立即终止仍增长的进程组;mutation 结束后的磁盘回落同样可能触发硬门。
- **ts-csg 中间产物清理**: one-click/APK 链路默认不保留 `.csgc/.csgc.debug/.csgweb`;`ts-csg/tmp` 只允许当前正在验证的产物;每轮结束用 `find` 扫仓库与 /tmp 生成区(`rg --files` 会漏 ignored tmp);清理必须在生成/编译进程结束后串行执行;glyph SDF 预计算缓存只保留当前内容地址 key;清理生成物时先区分 tracked 源文件/空占位。
- **ts-csg APK 构建树清理**: APK 打包完成后先把最终 APK 固定到 outDir 根并更新 summary,再删 Gradle `app/build`、`.gradle`、Android build;extract-cache 默认不留,只有显式 `--keep-extract-cache` 才保留一个 key。

### 进度与证据口径

- **进度只认当前主树可复验证据(2026-07-24)**: 临时目录、已删除工作副本、历史 smoke 和旧哈希只能作为恢复线索;进度分子必须是已语义合入当前主树、绑定当前源码/编译器/工具哈希并通过对应门禁的交付项。后续百分比采用固定验收清单加权,禁止按补丁数量、忙碌时间或"曾经绿过"上调;发现漏项只能认定旧估算无效,禁止用可变分母制造"进度倒退"。
- **进度百分比必须固定分母(2026-08-05)**: CSGC 单格式、CSG 工程子系统和完整生产目标是三个不同分母;一旦向用户报告完整目标进度,后续只能按同一份完成标准更新。
- **剩余工时必须只按生产闭环估算(2026-08-09)**: 提案完成、静态门通过、focused smoke 和不可达基础设施一律不折算生产完成度;新审计暴露的是原先漏算的既有工作时,应先重定基线,不能把分母扩大伪装成实现倒退。
- **聚焦所有权见证不能冒充生产接线(2026-08-08)**: 与生产函数同形的轻量 primitive 可证明局部生命周期和编译器可执行性,但不能证明生产模块可达接线;只有直接导入生产模块的完整闭包编译并运行通过才可计 dynamic production credit。Linux 编译 target 必须使用仓内 canonical `x86_64-unknown-linux-gnu`/`aarch64-unknown-linux-gnu`。
- **进度口径必须绑定用户点名的目标(2026-08-01)**: 用户问"本次重构进度"只报告该目标的工程完成度;连续汇报必须保持同一分母,不能擅自换成更大范围后造成表面倒退。
- **长任务进度只随验证闭环更新(2026-07-31)**: 每完成一个有动态或静态门禁回执的步骤,必须同时给出总体完成百分比和剩余 AI 小时;仅定位、改码未验证或外部环境阻塞都不增加进度。
- **生产进度必须绑定可释放的门禁(2026-08-02)**: 文件数、静态检查数和 mutation 数只能表示风险被压缩,不能自动换算成生产完成度;连续汇报同一百分比时必须指出当前首个 RED 与数字不变的原因。
- **新发现问题必须做同夹具双快照归因(2026-08-09)**: "现在才看见"不等于"历史遗留"。每个新首红必须冻结同一 fixture/参数/源码闭包/守卫,分别运行改动前后编译器;旧快照同首红才可判既有,旧绿新红才是回归。逻辑权限问题把同一攻击 fixture 跑在改动前后接口上;`git diff`/字符串命中只能定位来源,不能代替动态对拍。
- **门红先分「实现回归」与「合同漂移」(2026-08-01)**: 语义演进后自有测试脚本未跟进的失败签名与真回归相同,但修法相反——先对实现做动态证伪,再谈改实现。
- **report 字段是 provenance 不是质量分(2026-08-16)**: `full_backend_codegen=0` 在完整面 C 烤下是诚实回执,不是待修红。遇 report 字段先读写点条件(谁在什么条件写 1/0),再定红绿,不按字段名望文生义。设 env 让报告变 1 而管线不换=盖章说谎,与假绿同罪。
- **编译性能目标必须服从同口径工程下界(2026-08-12)**: `30–80ms` 只能作为热缓存、增量编译或小闭包的冲刺目标,不能反向规定完整冷编译;"理论下界"必须注明模型(物理读带宽/CPU 除并行/关键路径/当前算法不是同一个数字)。冷编译、热全量、增量命中和 no-op 必须分开报告;行数本身不能推出耗时。当 10万-30万行正式闭包仍以分钟计时,先判定存在算法级或测量口径问题;性能收敛应消除重复全表扫描和伪串行,不能靠跳过证明、放宽校验、增加超时或强求固定毫秒数冒充优化。
- **编译器正确性改动必须同时守住复杂度(2026-08-11)**: 每个 parser/TypedExpr/BodyIR/authority/regalloc 改动都必须用同一冻结源码做前后 A/B(2-20 秒短探针+采样,再查阶段计数与峰值);旧绿新慢即性能回归。热路径证明必须是一次构建、索引查询或带不可变代际的 memo;禁止循环内重复全表扫描、全源哈希、完整递归闭包验证。正确性前沿不能与性能验收分账。性能倍率必须同口径:每个数字必须绑定包含集合、`full_backend_codegen`、函数数和逐阶段时间;阶段计数为零时只能判测量链缺口。
- **性能改动必须用稳态中位数定性(2026-08-15)**: 单次 cold A/B 的首轮页缓存/频率差不得冒充数量级杠杆;只有预热后多轮(≥5)交替中位数才释放性能信用。性能原子要同时看两种负载:普通闭包不退化 + 生产大闭包真实收益,分开表述。
- **性能根因方法论(2026-08-15)**: 冷编译器内置 rss_bytes 读 `getrusage.ru_maxrss`(Darwin=生命周期高水位,只升不降),看内存回落必须用外部当前值采样;system-link 产物 exe 的 __LINKEDIT 嵌入输出 basename,任何字节对拍必须同输出路径;假设要被同死点 A/B 证伪后才准动手全量(改分配器前先测该负载的分配/释放模式)。
- **长编译先用 dry-compile 建模,禁止空轮询(2026-07-23)**: 进入 full compile 或正式 1GiB 门前,先对同一冻结源码跑 `dry-compile`,记录 dry 实测时间、full theory 分相时间和 retained RSS 预算;时间窗读 `full_compile_theory_time_guard_recommended_ms`,内存窗读 theory rss estimate;dry 不执行 CSG/lowering/object/link,理论值不能代替正式门实测。冻结树 dry/full 必须同时显式绑定 `--root:<frozen-root>` 和 `--in:<frozen-entry>`,并清空继承环境重建最小 env(外部 CHENG_ROOT 会让 parser 把活工作区当 shared root)。长编译期间继续做只读审计,等待不计有效 AI 工时。
- **「最小探针」必须报告真实 source/import closure 与 compiler 优化级别(2026-07-23)**: 入口文件小不等于闭包小;O0 compiler 对数十万行闭包逐 declaration 重算 CID 时单个首红可耗十几分钟。取得 phase sample 后立即停止,迭代改用 O2 current-source + 正负 fixture,完整闭包只在 batch 收口运行一次。
- **相位探针必须证明调用点到输出 sink 的可达闭包(2026-07-23)**: 只在生产路径插 TraceStage 不等于能观测到;stderr allowlist、环境开关、输出回执任一未接线都会静默丢点。可执行合同必须同时锁探针调用顺序和 sink allowlist,并有删除 allowlist 行的反例。
- **门禁复验并行度纪律(2026-08-10)**: 600s guard 的 smoke 编译在 3+ 重编译并行时必超时(ABORT rc=124 空 stderr,非红门)——重负载下门复验一律串行;判读空 stderr rc=1 先查 guard status=ABORT/timeout 再下结论。

### 工作流杂项

- 用户指令边界: 要求跳过某切片=立即停该切片并清理自己引入的不一致,gate summary 只报真实执行+显式跳过数;说"不要恢复"=停止重写目标文档并同步修 task_plan/progress/findings;问进度=直接给百分比+下一缺口;已有代码不删,归属不明的只旁路修复。
- 秘密处理: 读 .env 只看 key/结构不打印口令;无订阅/额度字段返回真实"数据缺失"或 hard-fail,不编造 quota。
- 语法/编译路径不稳时记 findings.md(复现命令/实际错误/影响/下一步)再推进业务,不把业务绕写当编译器已修。
- 性能对比称"同等内存安全条件"必须有完整 leak/ORC/ASan 门禁证据,否则只能叫性能对比。
- 用户目标是"codex rust 核心 1:1"时主线优先 codex-rs 核心协议/app-server/TUI/exec parity,pixel oracle 只作入口验证不抢主线。
- 自举/性能长跑用独立进程组+INT/TERM/EXIT trap 清理,结束 ps 查残留(不留 PPID=1 编译进程);primary trace 类诊断必须支持 filter 窄化。
- libp2p 全球统一版本: 联网只属 resolve/fetch/world-head 阶段,compile/lowering/codegen/link 只消费本地 CID 快照+cheng.lock.toml;LSP/Debugger/包管理共享 world snapshot+compiler canonical facts,禁各自二次猜源码事实。
- CSG/lowering 热路径 perf 规则: 复用 source context 勿重复建;多行 rewrite 测长→一次分配→线性写入+长度合同(禁 O(n²));resolved call fact 按 source 建游标一次,路径归一化只做 source 级一次。

## RSS / 内存纪律

- **RSS guard 纪律**: 桌面默认 1GiB 外层守卫且必须在工具自身实现(编排器只能收紧);高 RSS 需第二把钥匙(`ZC_ALLOW_HIGH_RSS=1`+显式 bytes),遗留 env 静默提权必须夹断,requested/effective/max 分开记录。guard 必须父 shell 轮询整棵进程树 RSS 超限 KILL(driver 内部 guard 与单纯传 env 不可信),超限写结构化 `rss_limit_exceeded` ABORT。`rc=137+rss_limit_exceeded` 是确定事实不是未知失败,不要反复重跑期待偶然绿。guard 改完用 `CHENG_PROCESS_MAX_RSS_BYTES=1` 实测行为;编译 RSS 到几十 GB 是编译器 bug 证据不是慢编译。大闭包诊断用最小入口/小 fixture/dry-compile,默认 8GiB 上限+串行。
- **cold RSS 契约:legacy env 名是硬拒不是兼容层(2026-07-25)**: `CHENG_PROCESS_MAX_RSS_BYTES` 是唯一合法限值通道;`PROCESS_MAX_RSS_BYTES` 等四个旧名任一存在,cold 与 backend driver 一律 `invalid cold max rss` 硬拒。harness 历史上四个名都设过,表象是下游 emit/link 错——先取 compiler stderr 原文再归因。
- **RSS 守卫首次越界值不是自然峰值(2026-07-18)**: process-tree guard 在首次采样到超限后立即终止,报告峰值通常只比阈值高一个页或一个增长批次;禁止据此做阈值边缘微调。1GiB 守卫的小幅越界不是预算余量。先 dry-compile 排除 source scan,再缩短阶段工作集重叠并物理释放整块 owner,最后在同一上限下从头跑到自然完成。
- **进程树守卫自身也必须有截止时间(2026-07-18)**: fork 后 readiness pipe 的 read、TERM 后 wait 和 KILL 后 reap 都必须各有独立截止时间;每条退出路径生成同一 schema report,区分 startup_timeout/rss_limit_exceeded/timeout/measurement_unavailable/cleanup_timeout。收到信号时清理必须先重新枚举并记录 `pid+start identity` 再按 identity TERM/KILL。
- **RSS high-water ≠ live data ≠ 落盘文件大小(2026-06-28)**: 异常涨先 grep module-global `var g*Buf` + 循环内 concat/Join(O(N²) churn);pressure relief=0 有两解(真 live / allocator 不受触发),先查目标内存走哪个 allocator;调试工具易夹带进主源且 ci_gate 拦不住。
- **CSG 峰值结构定论(2026-06-27~07-02)**: phase_memory_ledger(rss/structured/unstructured_gap 分层)是权威;欠估全在 gap;循环增量根因是"弃而不回收"非"保留";机械 chunking/单纯 prune/局部变量复用实测无收益已撤回;filtered 路径真根因是 source-context 全文件重建。
- **Cheng 层 free/Arena 硬前置(2026-07-02)**: cheng_seq_free 不在 cold runtime bridge 白名单(@importc 直接 ud2 trap);任何 Cheng 层 free/Arena 原语落地前必须先统一或暴露配对 free。seq grow 的真符号是 program_support_backend 的 `@exportc cheng_seq_set_grow_export`,改 runtime 需重建编译器才生效。
- **Codex 会话内存被超大工具输出撑爆(2026-06-27)**: 扫描/日志/census/diff/反汇编先重定向 /tmp 文件,只回传 rc/wc/固定摘要/哈希;rg 必带 --max-count/-l;并行工具调用别塞多个大输出命令。
- **大 struct 按值传参 deep-copy(2026-06-30 实测 ~19x 退化)**: cheng 默认按值,大 struct 含动态数组=deep-copy 全 storage;stub/scaffold 调热路径的大 struct 入参必须 `var` 或 `@borrows`,csg 相耗时暴涨 >10x 即怀疑 deep-copy。
- **共享 bump arena 上的动态 SoA 列会制造确定性 RSS 膨胀(2026-07-18)**: 独立动态列扩容放进只能整体回收的共享 bump owner,旧列块在 arena 释放前不回收(实测 1,165,414 行输入下 32 列累计 512MiB vs 理想 149MiB)。生产修复二选一:已知行数一次预留全部物理列;未知行数整表换新 arena、一次复制所有 live 列并立即释放旧 arena。禁止调高 RSS 门槛掩盖容量模型错误。dry/full 理论账本必须用实际物理列数、元素宽度、列 capacity 与 arena/intern owner 计算。
- **AoS/SoA 内存账本不得混算(2026-07-18)**: AoS 用 `capacity * sizeof(Row)`+行内字符串 payload;SoA 逐物理列计数+唯一 intern/arena owner;禁止 AoS sizeof 后又叠加各列。聚合层新增 sidecar 时,capacity/live/retained 三套公式、clone/move/reset 和失败原子性测试必须同一改动锁步更新。

## zero-C / bail 战役定论(2026-06-30~07-01)

- **★8连证伪定论**: 任何对 typed_expr.cheng 的 partial mutation(单文件 hoist / source pre-extract / PObjP mirror / 纯 ghost module / 无语义 comment / 调用点位移)都经 stage3 self-host 重生触发 +20~+143 bail cascade;atomic lockstep(跨文件全部受影响处同 session 同步改)实证 0 cascade。bail=44 不存在单 session 物理可达修复;cc+ci_gate 双绿完全不抓 bail cascade,必须 stage3 rebuild + full ZC delta 实测。
- **★给既有函数加签名参数本身必 fail(2026-07-01)**: 加 1 个零值占位形参、函数体 0 逻辑改动,driver build 直接 fail——永久排除"加签名参数"路径;任何涉及加形参的方案先单独跑"零值占位+0 逻辑"最小 build smoke。
- **safe atomic pattern**: enum 扩展 + struct field + SoA 列 + producer 设值 + consumer 读已在 scope 的字段(不改签名)= 四包真闭环;per-site 实测 fail rate ~30%,每 site 独立 verify+revert 预案,禁 batch apply。
- **typed_expr WholeCall `-1` sentinel 是下游消费者合约**: 单方上游放宽必 cascade;裸调用语句 `rhsNodeIndex=-1` 直接落脆弱文本路径——bail=44 架构性根因。
- **bail=0 家族真闭环 pattern**: 根因全是 PObjP text-only 同名歧义;dead-overload rename 1 字符与 active-wrapper dedup 都是零语义 delta 0 cascade;判定关键 = grep 全树 caller 闭包完整 + 语义 100% 等价。
- **bail=92 修复方法论(2026-07-01)**: trace-first——先运行时诊断推翻假设再动手;新收口分支用 `elif` 结构隔离(不在原 if 加条件);坚持 0 cascade 才 commit。
- **arena 懒初始化 guard 必须在首次写入之前(2026-07-01)**: guard 放在 Add 之后,未崩路径静默损坏数据伪装成 bail/not_ready;同 pattern 排查姊妹函数。
- **E-P 差值跨函数恒定 = 函数级固定成分欠计(2026-07-08)**: 恒定则只查 prologue/epilogue/固定 op 序列的 predictor↔fill 对称性;修后小帧路径逐字不动是零漂移判据。
- **官方 driver 自带被修 bug 时 bake 自举循环(2026-07-08)**: 三解:① stage3 cold bake 出验证 driver(~10s);② CODEX_ALLOW_C_PROVIDERS=1 出 cold-hybrid 完成态;③ 修复 commit 后 ci_gate 重建官方位再复核(最干净)。
- **上下文相关 bail 禁硬凑单文件红 repro(2026-07-08)**: 单文件五变体全绿≠形态无缺陷——provider 编译上下文相关缺陷,红证据=provider compile log 自身(FAIL_TRACE 行)。
- **cold-hybrid OR-liveness 环内跨 dial 插调用 miscompile 边界(2026-07-08)**: per-peer OR-liveness 环内两次 dial 之间加任何函数调用(空身体也触发)会使后续撤销腿读坏点;裁决逻辑必须放调用方。
- **文本路径删除门禁**: 先节点接管证明等价(fixture/oracle gaps=0、关旧派发后 `.o` 字节相同),再原子删除整条标签链;census gap=0 ≠ 文本可删。
- **zero-C 元教训**: `build EXIT=0` 是假绿(system-link-exec 对发不出的函数静默回退 cold provider),真信号=纯路径 `--emit:obj` rc;ASM 文本路径≠纯路径;任何即兴测量不可信,先有可靠枚举工具再定向;zero-C 与 op-lane 是同一战场,活跃期无并行物理空间;诚实 defer 是合法 workflow 结果。
- **★FAIL_TRACE 探针 env 本身切换被测 fill 路径(2026-07-08)**: `CHENG_PRIMARY_OBJECT_FAIL_TRACE=1` 经 keepBodyIrForZeroScan 关掉 emit-first,诊断 run 走 predictor 路径而生产走 emit-first——"探针全 0"只证诊断路径没失败。判读 plan.error 归属看名字形态: 带 `_` 前缀=symbol 名=fill-fail 臂,无前缀=build 相臂。
- **Pass B 预警(2026-07-01)**: 树上带多文件未提交 WIP 时 `--require-rebuild` 必现 SIGSEGV,与单点改动无关;先确认树状态。
- **函数名 intrinsic 不能替代通用所有权 lowering(2026-08-14)**: 按业务函数名直接展开 getter 会绕过 exact value-definition 发布,把无资源 POD 聚合变成 sentinel authority。优先删除白名单走通用调用路径;归因用同一最小夹具证明旧编译器命中白名单失败、新编译器删白名单后产出非零对象并运行通过,并用可编译 C mutation 锁死回潮。

## combo SoA / v2 迁移方法论

- **双轨改造 checklist**: 必须同步 append/clone/MoveInto/AssignInto/LiveBytes 全部 IR 传递点的 v2 列,漏任一列即静默丢数据;StrReplace 短 old_string + replace_all 会子串匹配更深缩进的同文本造成错位插入,用含上下文的长唯一 old_string。
- **read 点迁移模式**: 巨函数迁移=保留 `let node` 分段迁+分段 build 隔离错误,全迁完 grep 0 残留才删 let;chain 函数签名迁移先叶后父再改调用点;删 v1 对象 seq 的前提=全部跨文件消费者 read 已迁完;部分迁移不降 gap。
- **ArenaArrayInt32 设计**: 不含 arena 引用(grow realloc 后 stale),read/write 显式传 arena;LE byte 拆分读写。
- **类型注册表偏移不一致会段错(2026-06-28)**: 同一 (类型,字段) 出现两条偏移不一致记录时,不同查找路径读到 bogus 偏移;排查=lldb disasm + cheng.map 反查。
- **hunk 级集合差复核**: 判断"我的迁移点是否全在 op-lane 未提交 hunk 内"用 rg 行号 + `git diff` hunk 范围 + awk 集合差。

## gen2 自举病作战手册 (2026-07-12→14 合卷: form54–58 + AMB + GEN2AH3/4 判决)

- **归因铁律(先分树分代)**: 同签名先测 cold 烤 gen1——gen1 也红=源态/路径问题; 仅 gen2 红=miscompile(gen1 发射时打坏)。位置敏感签名(如「恰好 1 个 prior plain fn 后 @exportc 必红」)=栈垃圾依赖前置布局的旁证, 非独立病。
- **1s 冷烤定谳环**: 整段誊抄嫌疑源函数进独立夹具 → stage3/gen1 冷烤 driver(~10s) → 编夹具 + otool 静态断言(不必跑产物); 迭代成本 16min gen2 烤 → 1s。冷种子复现=源码真 bug 非上代遗传。census 口径: 先查前端语句列表完整性, 再看后端槽; 别在反汇编层追鬼影。
- **双体反汇编 diff(gen2-only 崩定谳)**: cold 烤的 gen1 与 gen1 烤的 gen2 出自同一棵树 → 同一源函数两份机器码直接并列 diff = miscompile 铁证; 崩点用 ips imageOffset 经 map/primary.o 符号反推函数名。
- **修必须进「烤 gen2 的 driver」**: gen2 行为由烤它的 driver 决定; 修落树后先冷烤新 gen1 再自烤 gen2, 顺序错=白烤。
- **已定谳 form 表**:
  - form54: AppendCallArgs 裸 `else:` 无条件覆盖已解出实参槽→幽灵槽读栈垃圾; 修=`elif slotId < 0:`。
  - form55: GlobalStore/读兜底类型集漏 `LocalStrTag`→str 模块全局从不持久化; nm 无 `cheng_global_` 符号即中。
  - form57: 嵌套 `*(Int32Ptr(...)) = v|bit30` 丢 value 物化; 修=hoist 中间量——**hoist 拆嵌套是零风险通用修形**(一切嵌套复杂实参/嵌套 deref-store 同族)。
  - form58: 裸枚举常量 RHS 定型失败即 `continue` 丢整条 LocalDecl; 修=continue 前补 LookupEnumConstType 三行。exportc 位置敏感签名由此治愈。
  - form59: `StripVarType(Value(nvsTypeRes))` 把 `Value(Result[str])` 内联返回的 str 实参截断成 32 位 `ldr w0` 且重复发射两次调用; 病专属 Value(Result) 内联嵌套形; 修=hoist 具名中间量。铁证=崩点位移到下层前沿(非回归)。
  - form60(两处): ①条件链「聚合参数.seq字段.len」被绑到 seq 头聚合暂存槽,填充侧载址不载值→空 seq 守卫恒真直落 NULL 索引;修形=len 先提标量再进条件链;树 hoist 只拆触发形,发射器根修另立刀。②条件文本臂把 `flags.len` 经 IdentPrefix 截成 `flags`→bool[] Aggregate→Cmp 比栈地址;修=realizer 根修(SingleField 拒多段+Aggregate 拒 Cmp)。
- **已证伪路径(禁重试)**: ① form56 V0(parser primitive ptr-cast 表+早退)——对 gen2 五红站零改善且反伤 gen1; ② 整份拷贝主仓热文件进 f24; ③ stage3 cold 烤含主仓新 typed_expr 的树(unresolved); ④ typed_expr 加本地重复表函数(整文件敏感翻转)——跨模块调用形态才可烤。
- **相对 --root 双登记(已修)**: provider 子进程继承 `--root:.` → 相对/绝对双登记 → 同名 ambiguous。修=命令绝对化 --root/--in。**路径等价性以绝对路径为唯一口径**; 双名(普通 fn+@exportc 出口)是长期合法形态别当伤修。
- **验收网口径**: `t4_gen2ah_matrix.sh` 一键矩阵; `bl_self_scan.sh --max 0`; oracle=`f24_gen3_oracle.sh`(掩 LC_UUID/签名后逐字节)。

## Cheng 源码写法生产形(所有权/借用/ABI)

### 借用与 @borrows 总则

- **`var T` 与 `@borrows + T` 是两种不同借用**: `var T` 自身就是独占可变借用;`@borrows` 下的非 `var T` 是共享只读借用,两者不能互换。只读大对象若写成 `var T`,会制造不必要的 unique authority、重借冲突和循环 late-merge;需要写入的 out/state 才保留 `var T`。`@borrows` 可与确实写入的 `var` out/state 参数共存;若当前 compiler 对合法混合签名仍物化大对象,应根修 primary,不得把只读计划改成 `var` 绕过。
- **`@borrows` 只管形参,不会把 view 变成 Owned(2026-07-26)**: `flags=0 + store_id` 的 interior str、`return items` 的 managed sequence、borrowed ref field 都不会因注解自动 retain/copy;跨 pool/tree/formal 生命周期必须真实 full-base retain 或 byte/NewStringCopy。`@borrows` 必须沿 helper chain 逐层闭合;外层已标注不代表内部 default-MOVE callee 自动借用。release receipt 的只读统计 helper 也必须 exact `@borrows`。
- **只读操作只留一个借用入口(2026-07-27)**: `Has/Get/Find` 同时保留 value 与 `var` 两个重载,overload resolution 会选中默认 MOVE 的 value 版本,caller 后续 `Clear` 也成 use-after-consume。唯一读 API 从公开入口到底层 probe 全链 `@borrows`;写路径独立 mutable helper。
- **`@borrows` 有方向边界(2026-08-10)**: 只读 callee 聚合适用;终局消耗型 callee(panic 族)严禁——by-value 才能让 owned 临时 move 消善后(`panic(Fmt…)` 成语生态)。给 callee 加 @borrows 前先数两侧的 owned-temp 调用点家族,家族>个位数即反向(站点 CloneStr 化)。committed checker 禁 panic 终局调用挂 owned 临时善后。
- **去掉 `@borrows` 后 `str` 形参会吃掉实参**: 借用字段/借用形参不能直接绑到无 `@borrows` 的 `str`;每次消耗调用前 `CloneStr` 出独立 owned。
- **`@borrows` 读文件不要再 `CloneStr` 一层(2026-08-14)**: 内层已 `@borrows` 就直接把 path 传下去;外层再 Clone 出 owner=1 的 `driver_c_new_string` 指针,收尾却走 `cheng_mem_release` → ORC 不认。公开 `ReadFile` 漏 `@borrows` 会吃掉路径,后面报 consumed;只读臂补 `@borrows`,不要在夹具里 Clone 绕。`WalkDirRec` 递归 `var str[]` 再借会 `body-store-freeze consume-only edge`:对外 `@borrows` + `CloneStr` 进内层,遍历用本地 pending 栈。
- **只读报告/向量/路径复用同一 owned**: 漏 `@borrows` 会吃掉调用方,表面是下一句 consumed 或 `body missing`;只读臂补 `@borrows`,不要在夹具里 Clone 绕。
- **持有型 constructor 不能机械改成借用(2026-07-27)**: constructor 把 managed 形参直接移入新对象字段时,默认 MOVE 是正式所有权合同;同一个真实 Owned local 需要同时成为新对象字段 owner、又保留给后续最后一次消费时,在 caller 边界用一次 `share(ownedLocal)` 拆出第二个 owner;借用值仍禁止 `share`。
- **generic move-out API 不能为单一路径改成全局借用(2026-07-26)**: `Value[T](Result[T])` 的既有合同是 move-out;borrowed Result 的只读 accessor 直接投影 `result.value`,由当前函数的 `@borrow_result` 传播 owner origin。
- **`@borrows` 函数体内 `Join([借用参数, …])` 字面量必红**: 生产形=`+` 拼接(借用读取产新 owned);需要 owned 原样返回用 `"" + 参数`。聚合元素 `add(dst, seq[i])` 按 checker 指示 `share(seq[i])`。
- **`share(x)` 只收 owned**: spec 0.2.1 行 67「share(x) 禁止接收借用值」;`share(参数)` 放进会被冷内联的小函数会在内联后报 `share(value) lacks exact source definition`——路径多读用 `strings.CloneStr(参数)` 每次独立克隆后 move,share 只用于循环元素/字段投影。`share(x.field)` 对"地址承载 plain 对象"(rawbytes.Bytes 这类 ptr+len)字段借用必 die:这类字段复制只能显式深拷贝(`rawbytes.BytesSlice`)。
- **texpr 只读查询禁止 `ir: var TypedExprIr`**: 只读 Lookup/Canonical/Const/At/FieldHop/ManagedStr/PriorBinding/StatementAt 一律 `@borrows ir`;Append/Build/Add 才保留 `var`。
- **借来的元素读取流进非 var 非 @borrows 形参 = 非法源码(take-bug 定谳)**: 规范 0.2.1——ident/field/index 属 Borrowed;let-of-borrow = reborrow。修源(`share()`/`CloneStr` 或 callee 加 `@borrows`)属业务侧源改,不是编译器放水。
- **默认 move 不能被后端隐式 retain 反转(2026-07-25)**: 命名 owned RHS 与临时 owned RHS 一样默认 move;绑定、赋值、var 参数替换、容器 add 都必须消费精确 value-definition;只有显式 `share(x)` 或 borrowed 值进入 owning 目标时才生成 retain。borrowed let/var 初始化保持 reborrow;可变绑定覆盖为 owned 时结束借用并建新定义。只读检查函数用 `@borrows`+非 `var T`;调用者"检查后消费"=先借用检查,再在互斥分支恰好 move 一次,禁止先 move 再靠隐式复制继续读。focused gate 必须锁定 ORC `retain=0` 的默认 move 正例,覆盖 owned/borrowed/mixed 的 branch、loop 与多 managed Phi;合成 schema 绿不能替代 native 计数。
- **字段 place 必须逐跳物化(2026-07-24)**: `FIELD_REF` 的结果是当前字段地址载体,不等于字段值;下一跳前必须读取精确 TypedExpr 类型——内联 object 保持地址载体;`ref object` 从该地址加载保存的指针恰好一次;seq/index 等其他边界走各自结构化节点,不能把所有 offset 相加。生成 BodyIR 前先验证完整 operand graph、循环、root identity、每跳 source/type/offset/size/align 和最终形参类型;验证失败必须零写入;开始生成后资源不可用直接 panic,禁止留下半条 IR 再转文本兜底。

### 整值拷贝 / 投影 / 冻结陷阱(2026-08-13/14 密集族)

- **`var x = owner.field` 对托管数组常常是 projection borrow,不是 take**: 直接改 `owner.field`,或 Rec 清空后再 `= []`;`owner.field = []` 后投影 live=0。
- **`var seq = struct.strArrField` 再 sort 是 16B header 投影**: 按下标 CloneStr 进新数组再 sort。
- **冻结投影与释放禁止整段 header 互换**: `TypedExprSourceContext`(~368B)不能当值实参;循环里再传 `var` 会 late-merge;`ArenaArrayInt32Get` 把 16 字节 handle 当值传会缺权威,改传 `offset/len` 标量;`ParserValueExprTree` 禁止传 `nil`,无树路径另开不含该形参的函数;`ref object` 形参按值传引用;`add(ref.seqField, x)` 会把字段降成无类型 8 字节 OBJECT_REF——Rec 按下标拷到本地列再整列赋回;`err = err + ":" + other` 是对 var str 无权威 PAYLOAD_LOAD,先 CloneStr 再 Fmt;`if cond: cid = callA() else: cid = FixedBytes32()` 弄坏临时,两臂各自 `let` 后立刻比较。
- **`csg.typedIr` 字段投影再传给 `TypedExprIr*At(ir, i)` 会被当 unique-borrow**: 读列就地 `ArenaArrayInt32Get(ir.arena, ir.nodes2_*, i)`,不要把整份 IR 当 var 实参。
- **TypedExprIr 禁止从 lowering 整份取出再置空**: ~4920B header 拷贝 freeze 拒;同一调用不能同时传 `lowering: var` 和 `lowering.typedIr: var`(overlapping unique);helper 若也收整份 plan,外层 for 再传会 unique-borrow 拒,循环改递归或 helper 不收整计划。
- **`plan: var` 禁止在循环里再传给 `var` helper**: 循环里直接读 `plan.symbolNames[i]` 等,需要 owned 名就当场 `CloneStr`;只读大对象 helper 不收 `var` 整计划。`ObjectSymbolsAt(table: var)` 同病。
- **NormalizedExpr 整值取出必须整值写回**: `var expr = layer.exprs[i]` 是整值移出,槽变零值(`kind=If` 是枚举零、`line=0`);只写回几个字段=把 Return/Call 掏成假 If。行号权威是 `ParserValueExprCallPosition`,字段写回槽,不许填假行号。
- **NormalizedExprLayerReset 释放树后必须字段置 nil**: `tree = nil` 清不掉 `layer.valueExprTree`,第二次当 owner 放已 Released 树 → lifecycle 红。不许把 lifecycle 检查改成静默 return。
- **封缄 typedSourceTexts 身份字段 Rec 后还要给 TypedIR frontier 用**: 整值移出再 `ClearSourceTextAllFields` 会掏空 `workspaceRoot`;就地读行,只 `ClearSourceTextBody`。
- **聚合 adopt 禁止整结构拷贝再置空**: `var artifact = made.artifact; made.artifact = T()` 置空会释放 cid/bytes,adopt 结果悬空;`cid = CloneStr(...)`,`bytes = BytesTake(...)`,再清空源。
- **`if/else` 两次 `var` 调用写入同一局部会弄坏临时值**: 两臂各自 `let` 后立刻交给 helper。
- **循环里把 `var` 形参再传给 `var` 实参会 late-merge**: 只读形参改 `@borrows`;必须变异的循环改递归(每层自己的 var 形参,没有回边 phi),或把可变状态放进 `ref` 再按值传指针。值结构包装 `var State` 在循环里当 var 实参即使 helper 已 @borrows 也报错:`State = ref object`,helper 取 `state: State` 不取 `var`。
- **`var` 形参不能再借给另一个 `var`,整份赋值回 `var` 形参也是 MOVE(2026-08-14)**: `ReleaseSequence(values: var T[], tally: var T)` 再调 `RecordSequence(values, tally)` 会 freeze;记账只读 `len/cap` 就拆标量;释放走 `system.cheng_seq_free(&values)`;失败字面量走 `@borrows` + `panicStr`。`var owned = clone(seq); add(owned, x); seq = owned` 是 managed replace 当场炸——就地 `add(seq, x)`。定长数组同:只读臂 `@borrows frame: uint8[N]`,写入臂才留 `var`。
- **全局 `var str` 赋值的 previous-drop 必须认 STR flags-load 形**: 用最小 in-tree 夹具定性,不要在 parser 大函数里猜 op row。
- **`var s = Fmt...; s = Fmt"{s}..."` 是 live borrow 上的 replace**: 会发 MANAGED_REF_MOVE_REPLACE;前缀/后缀各自 `let`,最后一次拼;`ExecCmdResult.output` 用 `ExecShellInto` 写独立 `var`。
- **`var b = a` 对 seq/嵌套动态数组共享底层**: 负例/变异测试必须显式逐项 clone。
- **borrow_result 的所有返回路径必须同根(2026-07-27)**: 命中返回 owner 子字段 view、缺失返回新建 managed 值,不能只加 `@borrow_result`;保留值 API 时明确 Owned value 语义,由 canonical library 深拷。
- **借用释放 helper 必须清空原槽(2026-07-31)**: `fn release(value: var str)` 执行物理 release 后若不把完整 record 清零,调用方 scope cleanup 会再次当 Owned 释放;move store 发布目标后必须清空 source 与本地转移 record。
- **transformer 形(move-in 返回新值)不能标 `@borrows`**: 体内病根是「`var out = bodyIR` 先 move 后面还读 bodyIR」:先只读算出 newOps/newTerms,最后一次性搬字段;合法性验证放字段搬移之前;调用方要新旧对比时重建两份等价值,不 Clone 绕。
- **借用元素存 var-out 字段是寿命耦合病根**: 消费者的字段投影在外层回边 `parent_live=0` 冻结;交付点做独立 owned 拷贝(`BytesSlice(b,0,BytesLen(b))`);「外层 while 内 var + 内层 var-out + 托管字段投影」把泵抽成独立函数消回边。
- **托管 value-object 的 move 必须转移唯一 owner(2026-07-24)**: `var dst = callReturningManagedObject()` 不能新建槽后只做字节拷贝并跳过 retain;真实 move 复用唯一 call-result 槽,或原子转移全部托管字段并把源标 moved。`add(out, composite)` 后再逐字段 release/clear 不是 move。
- **FFI 所有权注解必须双侧一致(2026-08-15 双 drop 案)**: os.cheng 四个 @importc 声明 @borrows,而 program_support_backend 的 @exportc bridge 按_by-value 拥有并 drop → 调用方与 bridge 双释放。修=bridge export 同加 @borrows。parser 编辑后必须 rm -rf artifacts/cold_object_cache 对应架构目录,否则旧对象缓存遮蔽改动。

### 字面量 / 构造器 / 返回值

- **`str[]` 字面量元素必须是 MOVE 或纯静态字符串**: 借用元素(@borrows 参数、字段投影、`Value(res)`、seq[i] 的 let 绑定)统一 `share(...)` 包裹;`[identity.sourceId]` 这类字段借用要 `CloneStr` 再进字面量;同一 `Join([...])` 里复用一个 owned str 会第二次 consume,每次都要 `CloneStr`。
- **`int32[]` 字面量既不能做构造器字段也不能 `let` 绑定**: 一律 `var` + `add` 逐元素构建。
- **字段投影(即使 owned 参数的 `x.f`)不能绑定 plain 形参**: 调用处 `share(x.f)`,或把只读被调方升 @borrows;@borrows 构造器/builder 存托管字段必须克隆(`strings.CloneStr`/`InferenceShapeCopy`/手工序列拷)。
- **构造器(MAKE_COMPOSITE)字段实参必须是 owned(MOVE/PLAIN)或哨兵**: managed 字段裸传 `.field` 借用拒;修复=字段借用包 `share()`、str 形参 `CloneStr`、标量保持裸读。`Value(result)` 作为调用实参直传且 payload 是 managed 对象时,先 `let x = Value(result)` 再传。
- **条件初始化托管局部:占位+重赋值是坏的**: `var x: rawbytes.Bytes` 隐式零初始化后首次赋值;零值语义与空占位等价。
- **托管局部(尤其 Result[T] 的 let 绑定)必须在每条退出路径都被消费**: 错误分支显式释放后再 return;同值"先 share 后 move"也触发,正确形=中途用 share/CloneStr 副本、最后一次用 move 原值。
- **Result 字段和 FixedBytes32 禁止投影进消费形参**: `res.err.msg`/`res.value` 进 `Err(...)`、`Fmt`、非 @borrows str 前必须 `CloneStr`;FixedBytes32 逐字节 `CopyInto`,零值用 `var zero: FixedBytes32`;`req = WithSymbolVisibility(req)` 是整份拷贝,未封面前直接写 `req.symbolVisibility`;超大函数里 `res.err.msg` 抽小 helper。
- **封条结构的托管字段不能 `let x = req.field`**: 会把 str 搬走,StrictValidateSeal 重算 CID 对不上;`let reportPath = strings.CloneStr(req.reportPath)`。
- **托管 `str` 生产者必须用 `cheng_malloc` 配 `cheng_mem_release`**: `strOwnedAlloc`/`NewStringAlloc` 走 `HeapNewCompat`;内层已 `@borrows` 的读文件不要再 Clone 一层。
- **Raw Bytes 与 ByteBuf 必须显式区分 owner/view(2026-07-20)**: `BytesFromString`/`ByteBufView` 是 borrowed view 禁止 `BytesFree`;`BytesAlloc`/`ByteBufToBytes` 返回 owner 必须释放;哈希已有 ByteBuf 直接 hash view;扩容必须 checked-add/checked-capacity;固定 32 字节追加直接写入已确保容量的 buffer。
- **growable raw buffer 必须显式终结所有权(2026-07-23)**: 生成最终 `Bytes` 走清空源 buffer 的 `take`;所有成功与错误返回都由 `take`/`release` 终结。
- **view 返回值不能按 owner 释放(2026-07-27)**: `rawbytes.BytesFromString` 返回指向输入 str 存储的视图,合同 `@borrows + @borrow_result`;不得 `BytesFree`、写入长期容器或跨根生命周期保存。
- **同一函数里本地 Bytes 不能再返回 str(2026-08-14 musl)**: 哈希函数只回 `FixedBytes32`,拼 CID 字符串放另一个函数;不要 `ByteBufFree` 完立刻 `Concat`/`Hex`。CID 不能 BytesView 栈(`BytesAlloc` 写入再 `Sha256Fixed`),provider/launcher 禁 `\bptr\b`。
- **大对象禁止按值搬、同名包装必须写模块前缀(2026-08-14)**: `Result[Switch]`/`return sw`/`var working: Switch = sw` 走 value-object decomposition 过不了;`var Switch` 原地写,工厂改 `XxxInto(out: var T, ...)`;`switch.setDidAuthConfig` 会解析成自己,写 `didauth.setDidAuthConfig`;`None[T]()` 对托管 T 报 managed producer authority missing,用 `var x: Option[T]` 隐式零;指针字段 `node->f` 传给 @borrows 没有 value-def,用值对象 `var T` 的 `.f` 或先绑本地 var/CloneStr。
- **BufferStream/ZeroQueue/YamuxStreamState 禁止 `newBufferStream()` 或整份搬回**: `resetBufferStream` + `state.streams[i].field =` 原地写;只读 Bytes/str 形参升 @borrows,`share(Bytes)` 拒;`protoToBytes` 用 `ByteBufferTakeAllBytes` 出独立 owned;解码走 protoGetXxxField 返回 `Result[bool]`;跨模块同名函数(各 transport 的 start)禁止集体 @borrows,调用写全限定名;`Lp2pProtocolHandler[]` 不能 add/`[i]=`;gossipsub handler 不要调会拖 DID+multibase+ed25519 整棵闭包的函数。
- **跨模块 `T[N]` 官方 cold 算不出元素布局(2026-08-14)**: `MultiAddress[16]` 等在 import scan 报 unresolved;列表语义用 `T[]` + add/setLen,按 index 当表用的 init 时 setLen(n);固定数组托管字段 drop helper 报 invalid 同样改 `T[]`。
- **`var` 投影根必须是活的可变 place(2026-08-14)**: `work.fieldSeq[i]` 传给 `var T` 形参是两层投影,冷检查拒;先 `MoveInto` 到栈上 `var`,在这个活根上调用,再 `AppendMove` 进 seq。
- **官方 cold 逃避 T* / `var Switch` 形(2026-08-14)**: `var Switch` 形参只要存在就 body-store-freeze(空函数也挂);`*T` 传给 `var T` 同形(OBJECT vs PLAIN);`let row = seq[i]` 再读字段:整份对象元素赋值照样 freeze。export 根不要 `*node` 进 `var NodeRuntime`;不要 `&Switch`;cstr 用 `system.strFromCStringCopy`。`len(node->feedEntries)` 不能穿过 T* 托管字段,用 `var NodeRuntime` helper;`cstring(void* 形参)` 会改写形参槽类型,先拷到本地 `var boxed: void*` 再转。
- **同名模块身份:对象跟函数一样按 origin 留两行(2026-08-14)**: 两个 multiaddress 的类型都叫 `multiaddress.MultiAddress`;登记从 origin 盖 `decl_path`,查找走 local-name 链 + `cold_object_visible_for_current_imports`;drop helper/formal 按 ObjectDef 行号定 TypeId,禁止按名字重解析;字段解析按声明模块路径最长前缀选同树对象。对象同名按 origin 留两行、查找按 import path 过滤已够用,不要再给调用方改 `as` 别名。
- **泛型实例不得继承模板的 declaration origin(2026-08-14)**: 应用实例 `declaration_origin_row = -1`,origin 只属于源码声明,否则 canonical type def row 拿模板当 canonical 报 metadata drift。

### var / 循环 / CFG 形

- **`ref object` 必须 `new(T)`,`var t: T` 是空指针(2026-08-13)**: `Init(state)` 写字段 SIGSEGV;`var state: T = new(T)` 再按值传引用;`Destroy` 保持消费。emit:obj 绿不等于能跑;Materialize 必须真跑一遍。
- **`ref object` 全局/形参禁 `== nil` 比较(2026-08-14)**: 全局 `atomic.I32`(ref object)的 `if g == nil` 编成 GLOBAL_ADDR+PTR_LOAD_I64,freeze 拒;只判断 NewI32 的局部返回值;CAS/Store 走 `@borrows lock: atomic.I32` 按值传句柄。全局 atomic 不能直接进 `@borrows AddI32`(borrow view 是 OPAQUE_REF,形参是 PTR);准入只认「只被 GLOBAL_ADDR/PTR_LOAD_I64/COPY_I64/PTR_CONST 写过的 8 字节 SLOT_PTR」当 raw handle。
- **禁用显式默认值初始化**: `var text = ""`/`var n = 0`/`let x: T = 0` 是显式默认值,合法表面禁止;`var text: str`/`var n: int32` 靠类型隐式零初始化;pure/cheng_seed 同拒 `var i: int32 = 0`。out-param 槽同形。对象字段默认值走 `var x: T`/`T()`/省略字段。
- **泛型默认值必须用类型标注的隐式初始化(2026-08-05)**: 简单类型以及可能专用化为 scalar 的无约束泛型 `T()` 非法;`out = V()` 迁移为 `var defaultValue: V` 后 move;缺失值路径保持普通所有权语义,禁止 share/clone、按调用点白名单或换算法绕过。
- **冷 WIP 回归形(2026-08-14)**: `fn(): bool` 复合字段完全无法构造时是冷编译器 WIP,源码侧无生产级绕过,等冷车道修,不做 60 处 let-hoist 陪葬。
- **本地游标推断初始化会复用污染槽(2026-07-14)**: `var lineEnd = start` 写显式类型再赋值;从 var 参数拷标量写显式类型副本(`var i: int32 = p`),推断副本可能被后续自增污染。

### ABI / 布局 / 语言杂项

- **str 是 24 字节值布局(data@0/len@8/store_id@12/flags@16)**,动态序列是 16 字节头;str builder 写单字节走 `RawmemWriteI8/StrDataPtr`,`out[i]=Char(x)` 按 char 宽写会破缓冲。
- **模块导入别名拼写决定全局状态实例**: 同模块 plain 与 `as` 别名 import 各拿独立全局拷贝;新增导入沿用全仓既有拼写。
- **跨模块多实参调用中栈槽 int64 字面量带脏高 32 位**: int64 实参先物化显式 int64 局部变量再传。
- **从 var 参数拷标量、跨模块类型布局权威在后端**、MonoTime 相减用 `MonoTimeNs(end)-MonoTimeNs(start)`(跨模块操作符解析会漂)。
- **线程**: owner ref 必须强持有到 join/detach 安全点;pthread detach 失败必须硬退出;work-stealing pop 末项必须 CAS;运行时并行必须真 OS 线程+worker 侧效果验证,API 改名不算;函数级并行必须接入 active primary task path。
- **Darwin arm64 C ABI 栈参按自然尺寸打包**(int32 4B、bool 1B 且相邻字节是脏 padding),与 AAPCS64 8B 槽不同;FFI 对拍双向各验、bool 按 1 字节、先涂栈再调;`@exportc` 移动端边界 ≤8 个标量参数,复杂配置分短 ABI setter。
- **Cheng 普通 str 返回走 ARM64 x8 隐式返回槽**,只有 @importc out-pointer bridge 在 x0;跨函数返回大 object 会丢字段(cold/provider 路径),用 out-param 或标量硬合同。
- **热路径 trace 两反模式(2026-07-04)**: Cheng 实参 eager 求值,`DebugLine(Fmt"...")` 在 trace 关闭时也每调物化;开关判定用 per-call `os.GetEnv` 残余仍 GB 级。修法定式=调用点门控+进程级缓存布尔(`if TraceOn(): DebugLine(Fmt...)`);门控放被调函数内部无效。
- **`expr?` 只保留 let/call 解包传播,禁 `return expr?`**;`int32[N]` 是定长数组不是容量提示;`type A =` 缩进字段块即 object;`strutil.Split` 分隔符是 char。
- **`@importc` 和 `@` 中间不能有空格**: `@ importc(...)` 被当成残缺 `@borrow_result`。
- **cmdline.ParamCount 含程序名(2026-08-14)**: 官方 C 上无参 `ParamCount()==1`,四个用户参数是 5;改夹具要同步门禁里的 fixture sha。held CLI(musl)的 `ParamCount()` 会大于真实 argc,`--mode` 必须紧跟子命令,禁止按 ParamCount 扫到 argv 外。共享入口若绑定完整进程向量,backend runtime 的 paramCount(=argc-1)与 `__cheng_rt_paramCount`(=argc)口径不同,禁止混给同一校验函数;CLI 门必须用真实 argv probe 及缺参、多参负例锁定。
- **`held CLI` 单条 identity 必须 `CsgCoreMerkleBuild`+`csgMerkleBind`**(TS `stableJson` 对不上 canonicalize 会在 merkle_line 炸);全量 extract 的 `CsgCoreValidateFactLines` 在 musl 上 ORC,生产形是 MerkleBuild+Bind 只 canonicalize 一遍,不要先 canonicalize 再 BuildBound。

## cold 编译器合同(cheng_cold.c / cold_parser.c)

- **编辑口径**: cold 层是 C 实现,按 C 声明/定义顺序修,勿把 Cheng 零前置声明语义外推;`src/core/*` 编译器源改进不了 stage3,验证靠小 repro + census(CLAUDE.md 4b-3);冷路径用中性 `cheng_*` bridge + 显式 roots。
- **自举判据**: 定点=contract_hash `e202c0c35424eb36`,不是字节相同(stage2/3 差 1 字节是故意的 s2-/s3- tag);/tmp/cc 有 compile-bootstrap/bootstrap-bridge/self-check 子命令可直接重建 stage 链。
- **cold combined 必须按预处理 TU 审计(2026-08-09)**: `cheng_cold.c` 定义 `COLD_CHENG_INCLUDE` 后 `#include "cold_parser.c"`;parser helper 在 cheng_cold.c 原始文本零命中是预期。parser/combined 同步验收必须以 `clang -E` 的真实预处理 TU、实际 O2 compiler build 与 source-closure hash 为准;raw `rg` 只能定位物理文件。
- **C 聚合入口必须绑定传递依赖(2026-07-25)**: 只记录聚合入口 SHA 不能证明实际编译源;热树中 parser 在门禁运行期间漂移时测试仍可能绿。C 门禁必须从真实 depfile 或唯一闭包算法冻结全部传递 `.c/.h`,编译前后逐字节对拍;正式门还必须从该闭包私有快照编译。
- **仓内 `bootstrap/cheng_cold` 二进制可能陈旧于冻结源码(2026-08-10)**: 对未触碰函数报 body-missing/unresolved 伪报。任何编译判读前先核二进制 mtime 与来源;仲裁/验收一律用冻结源同刻新烤二进制(cp bootstrap/*.c *.h 到 /tmp + cc -std=c11 -O2 单 TU),禁止拿仓内陈旧二进制当裁判。
- **parser 陷阱**: 十六进制 `0x..` 字面量会被折 0(常量一律十进制);`const A = B * C` 做第二个数组长度不折叠直接崩,数组长度写纯字面量;跨行 call 不进 if 条件(先绑本地再单行 if);二元表达式必须按优先级降级;`for i in range(n)` lowering 成 `0..<n` 不准跳过;scanner 必须字符串+字符 literal 感知;函数调用参数个数严格(Cat/Cat3/Cat4 固定),跨行逗号被当分隔符,嵌套调用计 1 参;`-object.field` unary field 不支持,写 `0 - object.field`;`Fmt` 必须结构化 lowering;`strings.ConcatStr` 必须内建降 BodyIR;module 状态用 struct live 字段不用模块级累加器,新增状态补全部 Reset 点;`parse_return` 只扫 return 表达式解析期间新增 blocks 且先查 block 参数自身的 CBR;str const 与 i32 const 都要进 `parse_const_member_line`。
- **codegen/优化禁忌**: 禁 BodyIR canonical hash 函数去重(不同函数并址);SSA/等价证明前禁 CSE/跨 slot 值复用,只允许 DSE+可证代数恒等;DSE 活跃根必须含 terminator/call_arg side table/会读写容器的 dst slot;LICM 先只读分析验收敛再变换;强度折减原地改常量必须校验 op_read_count==1 排他;block op ranges 不保证单调,压实 tombstone 先快照再写;`compile_body` 已到单函数安全边界,先扩容再堆补丁;BodyIR side table writer 未消费必须给明确 missing kind 禁静默 fallthrough;predicate/word count/reloc offset/emit 必须消费同一 op 集合;worker 本地 code 合并必须连 `global_patch_*` 按函数 base offset 重定位。
- **ABI/layout**: 复合字段按实际 field size 8 字节对齐(`int32[N]` 按 4 对齐会被 64-bit payload copy 错位);复合拷贝按真实 byte size 精确(8B 主循环+4B 尾),禁盲 `off+=8` 越字段;元素宽>4 的元素级 store 走 ARRAY_OPAQUE_INDEX_REF_DYNAMIC+PAYLOAD_STORE;SLOT_ARRAY_I32 默认 4B×4 步长是笼统槽 kind;fixed-array 取址/var-arg-by-ref 路径必须回填 slot_aux(数组长度);字段赋值写回原地址用 PAYLOAD_STORE(禁复用读取临时 slot 再 copy);`items[i].field=v` lower 成元素 place ref + PAYLOAD_STORE;双层就地嵌套写 `g[s].items[i].field=v` 延伸 opaque-ref 索引链(element_size 用真实元素宽);非空 seq 字面量用 mmap backing 不用栈(进字段/sret 悬空);payloadless enum 进 int32 ABI 前必须物化 tag;显式 `int64(uint64(ptr))` 必须物化真实指针值;runtime 释放路径读 mapSize 走布局常量+raw load。
- **import/transitive**: import_sources 必须传递闭包(裸名跨模块调用才解析得到);全局符号同名同类型只允许 opaque/partial→concrete 收紧 refine,真 mismatch 仍 hard-fail;imported 签名参数 layout 必须在全部 transitive object layout 完成后 refine;同一源文件不同 alias 各自物化收集(只剪枝递归不剪 alias);禁重复扫描+大 symbols 预分配;入口模块自己的 const 要在 imported 签名收集之前收;隐式泛型 `fn f(x: var T[])` 无显式 `[T]` 也要进 generic_names;@importc 不得进泛型特化(`is_external` 总闸+generic_count=0 双保险);bodyless @importc 后续缩进行不是函数体;imported overload 按参数 kind 解析不按 name+arity;`T[][]` 第一组 `[]` 是动态序列后缀非泛型;`ptr` 形参落 SLOT_OPAQUE+param_type=ptr(校验看 param_type);可达 import body 严格解析 hard-fail(ColdErrorRecoveryEnabled 只包非关键预扫);未声明调用禁自动注册 external、禁返回 0 slot 假成功(parse_call 与 parse_call_from_args_span 两条路径都要);strict 暴露旧语法文件时优先迁移源码,不扩 parser 兼容;`std/result` 是 object 语义按 ok/value/err.msg 字段 offset lowering;构造 `Err[T]` 先物化嵌套 ErrorInfo;对象字段默认值覆盖三条路径。
- **setjmp/die 纪律**: die()/SIGSEGV handler 不改 ColdErrorJumpDepth;每个 setjmp 站点对称 ++/--;JMP_STACK ≥1024。
- **Mach-O/ELF writer**: @importc 符号一律无条件加 `_` 前缀;__TEXT 按实际 code_offset+code_size 页对齐;符号/reloc 表按真实数量分配禁固定截断;defined symbol 先按 section 映射,BR26 目标落 data region 必须 hard-fail(防 data-as-code);确定性对拍固定 codesign identifier(ad-hoc 会把 basename 写进 CodeDirectory);入口 wrapper `bl main` 先保存 LR;栈参超 x0-x7 后 callee 从 FP+32+offset 读;cold_max_frame_size >4KB 后 prologue/load-store 全需大立即数编码,报告必记最大帧;materializer 写 object field 前做 slot 边界检查。
- **cold 单 TU 超 128MB 时烘焙 BL 会绕回函数中间(2026-08-14)**: ARM64 BL ±128MB,跨距更大的同模块调用被写成无 reloc 的 26-bit 立即数,绕回落在别的函数中间;私有符号必须用 `cheng_cold_<salt>_<idx>`(Apple ld 把 `.L`/`L…` 当汇编临时标签,`MH_SUBSECTIONS_VIA_SYMBOLS` 不在其上拆 atom);函数已是 N_EXT atom 时禁止再插函数中标签;同模块 BL 必须留 BRANCH26 reloc。
- **Mach-O 大对象链接 veneer(2026-08-14)**: __text >128MB 时 BL 跨不过,唯一正解是 MH_OBJECT flags 带 0x2000(MH_SUBSECTIONS_VIA_SYMBOLS),ld 才能把符号拆 atom 并插 branch island。双链都要修:C 侧 macho_direct.h 两个 obj writer + Cheng 源侧 macho_object_writer.cheng 三处与 linkerless_object_writer.cheng 一处;stage3 二进制内嵌 C runtime,必须重烤 stage3 才生效。
- **exe 蹦床 main BL 裸立即数 = island 崩根源(2026-08-14)**: obj 里 _main 蹦床对用户 main 的 BL 被编译期裸立即数补丁而非重定位;flags=0x2000 开启后 ld 重排 atom,obj 相对偏移全失效,该 BL 落进 island 空洞区崩。生成 driver 的 _main→main 调用必须走 reloc;「BL 落进簇中空洞」=裸立即数/加数错的指纹,不是 ld 错绑。
- **Darwin FN_ADDR 的 ADRP+ADD 必须发 PAGE21/PAGEOFF12,禁止按 buffer 字节预填页偏移(2026-08-16)**: ADR 是 PC 相对字节差;ADRP 页差依赖 `__text` 低 12 位,ld64 终址与内部假设不同。Darwin 发 `ARM64_RELOC_PAGE21`+`PAGEOFF12` 留给 ld64;ELF/COFF 内部链接器自修路径预填合法;CALL 已经走 BRANCH26,ADRP 必须同一重定位模型。
- **Mach-O 对象的地址物化必须走重定位(2026-08-16 07:4x)**: ADR→ADRP+ADD 解 range 时 Darwin .o 预填页偏移=错(跨页点调错函数且五变体全同字节可证);正解=发 PAGE21/PAGEOFF12 交 ld64。同窗多 hunk 回归:先做全变体矩阵(含全 revert 锚)再归因——三个「顺理成章」嫌疑全被字节全同洗清,真凶是没进嫌疑单的第四改动。
- **CHENGCSG/CSG 格式**: 公开名只叫 `CHENG_CSG`/`emit-cold-csg`(字段长度前缀+hex bytes),内部 BodyIR 快照叫 `CHENGCSG`;canonical facts 必须从 PrimaryObjectPlan 导出;reader 必须读 writer 保存的参数 ABI 三元组/block_term/return_kind=0 形态,禁按 `param_slot[i]=i` 猜;批量读逐次 ensure(循环前一次 ensure 在 60+ block 函数踩内存);CSGC row 新增字段同步 FIELD_TAGS+roundtrip;columnar 增列只能走 flags/feature gate,不得 bump version;prefix string table 不截 high surrogate;单 fact 32-bit presence mask 限 32 字段。
- **CSG sidecar 等价卡口** = 同一 facts 经 cold reader/codegen 两次产出 `.o` bit-identical+链接运行一致(不要求与 Cheng direct bit-identical)。
- **emit 路径选择**: 普通 emit=exe 不因普通 import 切 provider/system linker;源码/导入闭包含 @importc 且 primary object 有 undefined 才走 host-runtime/system-link 暖路径;provider 不完整 hard-fail,禁 host_runtime.c 扩成 stub 池;provider executable(emit=exe+providerModules>0)必须进 provider compile+system link;provider 编译器选择先尊重 CHENG_NO_BACKEND_DRIVER_HANDOFF(防递归调用自身 hang);export roots 按模块所有权+primary undefined 精确选择;Linux linkerless 核心服务走 __cheng_linux_syscallN 闭环;GLOBAL_ADDR 用例必须同时跑 xarch/WASM/ELF;WASM 结构检查禁无条件 true 旁路。
- **artifact 刷新门禁**: build-backend-driver compile 非零直接失败;候选先过行为门禁,新 inode 临时文件原子 mv 覆盖,安装路径重新 codesign 后再跑同组门禁;禁 hardlink 到 bootstrap 固定路径;`--help`/旧 stage3 会生成或忽略 --out 刷正式 artifact,探测命令先读源码或显式临时 --out;恢复缺失 artifact 不能拿旧候选补位;Xcode linker/签名 policy 卡住用 CLT 直编(tools/build_backend_driver_clt.sh);entry semantics 合同随 dispatch_min 命令面同步;报告如实写 scope,禁固定假绿;临时诊断输出必须进静态 no-debug marker 门禁。
- **cold regression 口径**: 满跑会超时,判回归用同 truncated 子集对比 FAIL 集逐条相同;zero-regression gate 递归跑自身两次,日常默认关;重型穷举显式开;`emit=obj` report 成功但 stderr 有 `reachable import body not found` 是假成功,回归锁 strict stderr 合同(无 `cheng_cold:`);transitive import 类修复一次锁四类复现。
- **已修战役结论存档**: #35 SLOT_ARRAY_I32 四坑同根(元素宽/slot_aux 回填/const 时序);#37 双层嵌套写续接分支;#40 @importc 幻影泛型;K store_shape 全局聚合拷贝(FieldLoad 精确 byteCount 禁 8B 向上取整=越写相邻栈槽);K 槽分配器同名不同尺寸聚合 rebind;`no_node` 永远先怀疑前端没建 typed-IR 节点;miscompile 修复只覆盖已验尺寸——迁移前写同形同尺寸最小 repro;搬子系统撞 miscompile 逐字节干净回退。
- **cold/provider 组合陷阱**: bool 参数/返回多层传递会误判或挂住,门禁用 int32 状态码;WalkDirRec 路径上 strutil.Contains 可能误判,用显式前缀;provider 持久 raw pointer 全局值存 uint64 调用处转 ptr。
- **冷快照模块身份约束(2026-08-14)**: `cold_source_snapshot_resolve_document` 把源 realpath 映射为相对 `<root>/src/` 的模块身份,不是安全检查——/tmp 快照没有模块身份必报 leaves package root。修法=输入快照目录从 mkdtemp(/tmp) 改到 mkdtemp(root/src/cheng-fusion-tmp-)(目录名不带点);import 闭包路径 dot-segment 检查必须在 normalize 之后(resolve_document/lookup_path 两处)。
- **★写 Cheng 前必读 `docs/cheng-formal-spec.md`(2026-07-15)**: 语法/所有权/var/默认值/no-pointer 以 formal-spec 为准,不凭记忆猜。
- **★符合直觉的语法必须真修,禁止业务层绕过(2026-07-15 用户铁令)**: ①判据=formal-spec 合法/直觉表面(不是「用户随口写的非法形」);`str=nil`/`x==nil` 是 formal-spec 硬禁,门禁拦红后改 `""`/`Len()==0`。②合法形 residual/bail → 修 realizer(primary/backend 共享根、poison-on-miss、与文本 golden 一致),禁止把 std/业务改成 hoist 局部/let 拆写/换 API/裸指针补丁当默认解。③战术 hoist 仅临时探针,结束必须还原。④改 residual 先问「是非法形还是 realizer 洞」。记忆落点:本条 + AGENTS.md 工程规范第 3 条。

## 规范边界: 裸指针 / ZRPC / provider

- Cheng 规范层/业务层禁裸指针: `ptr`/解引用/地址算术只属 runtime/provider/host ABI 边界内部,必须回收到 DeviceBuffer/bytes_view/utf8_view/handle/capability 结构化值域;内存权威=ORC/SoA/NoAlias;不为让 provider 编过而增强通用 lowering 支持裸指针;文件路径不 StrDataPtr(用 cstring/strToCStringTemp);多返回值走 receipt handle 不传本地变量地址;runtime 源里的 `ptr` 是迁移债务。
- ZRPC 收口必须同时收生产 API+测试调用面+导出名(旧 helper 先降模块私有再整条桥链删除,防 `.data/ptr` 回潮);`@ffi_map(int32[])` 不承担生产 buffer bridge(实测 ABI 拆分不符预期),输入走 Bytes+bytes_view,驻留走 DeviceBuffer。
- 推理生产 API 必须是 ORC/SoA/NoAlias 可证明的值或 capability 句柄;现存 ptr kernel 入口只算迁移债务,不算 ZRPC 生产完成。
- 公开 Cheng 源码只以 `var` 形参隐式借用为合法正例;显式 `&`、`ptr`、`@importc` 必须作为公开门反例,不能拿 compiler/runtime 内部源码冒充用户语法。`BodyLoadLocalAddress` 只属于后端 IR/ABI 合同,验收只能用 IR 单元合同。

## 工具纪律(form61/62 / fusion / 劫持)

- **★cheng-fusion 优先**: .cheng 符号/引用/签名查询先用 cheng-fusion MCP(lsp_query/line_map_read/csg_query/evidence),优于 Grep;冻结快照树无 cheng-package.toml 时回退 Grep/Read;addr_symbolicate/crash_triage/orphan_slot_scan 无替代品。
- **fusion 工具口径必须先核对再当证据(2026-07-22)**: `cheng_exec_diff` 把 fixture 快照复制到临时目录再编译,只覆盖「源在 package root 外」一种形态;`cheng_zc_census`/`cheng_shape_matrix` 等钉住 artifacts/backend_driver/cheng 的工具判据随 official driver 新旧漂移;`cheng_csg_query`/`cheng_lsp_query` 的命中面上限是 facts 闭包,多 lane WIP 树下 facts 即产即陈;字符串字面量不在任何 CSG/LSP 查询面内,定位报错落点用 grep 是正确工具。
- **工具纪律与 form61/62(2026-07-19/20)**:
  - **语义组合门**: 递归语法笛卡尔积无限且大量重复,不能称"全覆盖"。正式方案必须从规范生成有界合法/非法语义模型:高风险交互族 bounded exhaustive,其余 t-wise 覆盖;模型显式覆盖语法义务、使用位置、目标 place、ABI、生命周期和 regalloc 压力边界;每例绑定确定 seed/case ID/shard/source/compiler/tool hash。双后端相同只算 differential,不是正确性 oracle。缺真实逐阶段回执时必须 RED,严禁虚构 node/decl index。
  - **后端 regalloc 接线审计**: backend2 的 frame 虽有 residency/loop-carry/temp-register 规划,却明确剥除了 regalloc;按目录名、注释或"有寄存器优化"估算进度会把整条漏掉。每个后端都必须独立证明 canonical allocator 的可达 import、唯一 build、冻结 plan/action/fragment 消费和对象字节回执;仍有独立启发式分配器即判未接线。
  - **多线进度口径**: 点火、regalloc、Fusion 沉淀、终点发布门是四个不同分母,禁止混成一个百分比。
  - **1GiB 证明口径**: 把阈值精确设为 1073741824 不等于证明硬上界;用户态轮询只能证明已采样点不超限;报告写着 `hard_memory_limit_proof_status=not_provable_userspace_poll` 时终点硬门仍是 RED;生产硬 cap 必须来自可独立验证的 kernel/VM aggregate limit。
  - **form61(所有权纠偏)**: 全局 call-RHS 分派标量臂只收 I32/I64/Ptr、聚合臂只收 Aggregate,LocalStrTag 两不沾→同名幽灵栈槽认领,全局永不写;managed call-result 必须先落带精确 ownership 的本地结果,再走 retain-new-before-release-old 的 managed store;禁止用裸 memcpy 或无条件 release。
  - **form62**: 条件区域写槽被无条件 use 按名复用(槽支配缺陷)——use 点只从 dominating definition 物化+失败臂注销+帧总闸。
  - **pinned 二进制病**: seed/stage3 可携带 HEAD 已修的旧 bug,树绿≠二进制绿;烤机失败先对齐二进制与 HEAD 年代。
- **otool -r 不带 -v 只有数字 symbolnum**(无符号名),call-owner 归因必须 -rv;Mach-O __TEXT 的 addr/size 可用纯 JS load-command 解析替代 otool -l(每对象省 1 spawn)。
- **macOS 新生成 shell 脚本首次 spawn 触发 syspolicyd 验证**(~420ms 且串行排队);性能测试产物必须 cp 二进制。
- **Cheng Fusion MCP 也是生产身份链(2026-07-24)**: Cheng 改动先用 Fusion line-map/evidence 定位,完成后用 exact entry/source 的 CSG roundtrip/snapshot audit 复验;shell focused gate 与 MCP 各自验证不同边界,不能互相冒充。MCP 的 dead LSP、stale driver、roundtrip 拒绝都必须保留红灯修工具根因,禁止退回 grep 后记绿。
- **诊断工具与生产编译器必须绑定同一源码/编译器哈希(2026-07-23)**: 旧 /tmp driver 报错而当前 cold compiler 通过时,先证明工具漂移,禁止为兼容陈旧诊断修改合法源码。
- **Cheng 改动前先审 known 复杂度缺陷再上规模(2026-08-01)**: 性能扫描前先审被测路径已知复杂度缺陷(index 类 O(n²) 分配路径 2k facts=4.9GB),不加规模护栏直接上 10k/50k 扫描,测量本身就制造内存事故。

## codex 转译 lane(app-server / TUI / CLI / provider)

- **纯 Cheng provider 主线**: 生产链路只编 `src/core/runtime/*_provider.cheng`,C provider 只能迁移不能修补/恢复/包装;provider bundle 用 pure_cheng_provider_bundle.sh 统一并复用 OUT_DIR 防内存尖峰;闭合判据=真实符号+unresolved=0+运行结果(provider_object_count>0 且 standalone_no_runtime=0);provider object 不夹带跨域符号;app-server 编译必须 system-link-exec 一体化 materialize;runtime provider archive 禁 allocator/entry/panic stub 冒充闭合;no-fallback 硬化到底:CSG reader 不对 stmt_count==0 合成默认 return,不支持的 op die/trap。
- **provider 内存/ABI 陷阱**: libc 路径/内容参数必须 provider 内 calloc/memcpy 显式 NUL 副本(str.data/strToCStringTemp 对 @exportc 入参不保证);写文件直接 `fwrite(content.data,1,len)` 禁转 C string;栈上 Cheng array/object 不当 C 输出缓冲(fread/lstat 用 heap buffer+raw 字段读);popen 结果按 FILE* fread 禁混用 fd read;socket/WS 写二进制用 str.data+offset 循环写满禁 NUL 结尾转换;SO_NOSIGPIPE(socket 写用 send+WS accepted fd),exit 141=SIGPIPE 先查写断连;WebSocket 按帧 header 精确读+过读按 fd stash;HTTP 多 chunk 响应首次读到完整 header 时立即保存 status/body_offset,错误文本禁带响应 prefix(token 泄漏);HTTP 响应转 JSON 一遍分配一遍转义禁逐字符 Concat;varargs libc 走固定签名,TIOCSWINSZ 按有符号 int32;ANSI 直接写 byte 27;StrFromBytesCopy/RawmemPtrAdd 在 provider 冷路径产坏值,用 calloc+RawmemCopy+str 字段构造;provider export 间禁易污染全局递增 counter 做外部 handle。
- **SQLite provider**: 禁 sqlite3 CLI `.parameter set` 承载文本绑定(UUID 被当算术求值);执行前 SQL 语法层物化 ?/?N 为 literal,缺绑定/越界 hard-fail;禁 @ffi_handle/全局递增 statement handle;Connection 显式携带 path/readonly+固定非零 stmt handle;fixture helper 全落 sqlite_provider.cheng 真实现。
- **app-server/MCP 协议**: 所有 batch/approval 走同一条真实 NDJSON streaming 路径(禁按 prompt/body 切 buffered 分支);EOF 像 SSE 返回 S<status> 不无限空串;JSON-RPC response 判 error/result 必须 top-level key scan(嵌套 "error":null 干扰);thread/start/resume/fork 不静默吞 permissions/config/runtimeWorkspaceRoots(permissions+sandbox 并存 hard-fail,自定义未实现 hard-fail 不默认 danger);approval 必须走真实 resolve POST;MCP stdio client 最小闭合=initialize→initialized→tools/list→tools/call→resources/read→close stdin→wait exit 0;MCP server 无 stdin exit 78,stdin 是 JSON-RPC transport 禁 CLI append 语义,长连接区分 timeout(继续等)/EOF(退出);exec session state 用 append 注册/rebuild 更新,ProcessWait 后只 drop 记录禁二次 close fd;HTTP transport 读 header 前必须 poll 超时关闭;unix socket 用短路径(sun_path 限长);大函数拆小 helper;codex wire.cheng 禁 fake @importc 声明 std 函数;Seatbelt profile 用 $TMPDIR 临时文件+sandbox-exec -f(禁塞 JSON argv),env override 在 fork child 内 setenv。
- **resume/fork**: 按 Rust 语义 updated_at 顺序读候选 rollout cwd(新 rollout 命中优先旧 DB 精确命中);resume --last 统一复用 query plan 禁双份分页循环,cwd 过滤走 ThreadListParams.cwdJson,offset 用 Int32ToDecStr 非负;禁从 exit 78 跳假 thread/resume——完整链未闭合前不冒充可用;内部 cwd mismatch/missing 不泄漏给用户也不吞成功 fallback;16 参数大函数在冷路径 ABI 漂移,用 context object+selection object,config 复制逐字段构造。
- **TUI oracle**: 必须读真实 `.snap` 逐 byte 对拍并报首个 diff 行列,禁内嵌 oracle/trim/ANSI strip/空白归一化;递归扫 `tui/src/**/snapshots`;insta 头接受 `--- ` 尾空格变体;raw body 含最终换行;区分 raw render_lines/`terminal.backend()` quoted rows/Buffer Debug 三种形态;多字节符号一律按显示列宽算;footer/hint 按列宽截断是合同;markdown/复杂快照用源行驱动 renderer 不存静态期望;各类快照 padding 规则以对应 `.snap` 逐 byte 实测为准,不跨类共用 padding 常量。
- **current gate 纪律**: 新增子项先单跑再跑 full current(只改聚合列表=虚假覆盖率);并行 runner 的 rc 用 `|| rc=$?` 捕获再写文件;state 类并发收紧 1;manifest compile 在大 gate 内串行;translation-core/长 gate 用短 TMP 根(长路径下新 Mach-O 被验签 kill);低风险切片门禁不外推产品 runtime 完成;读 $HOME/keychain/cheng.real 的 smoke 先隔离环境+正式 driver 才准入;未闭合产品入口 exit 78 且进 gate 防回潮(禁 not yet available+exit 0);网络 provider smoke 用本地 mock(argv 传入+校验请求日志),exec HTTP mock 必须回 NDJSON 到 turn/completed 并校验 POST body;smoke 字符串检查随输出格式同步(rg -F 静默退出陷阱);relfacts 与生产测试模式分开编,期望值常量从唯一常量源读取;marker+shell oracle 只证最小入口可运行,文档不得写成 runtime parity;转译边界:核心 member 需 relfacts 验证,非核心 marker ported 即可,由 translate plan 强制。
- **dashboard/OAuth**: OAuth 保存必须保留 token endpoint 真实 account_id/chatgpt_account_id(与 JWT nested claim 不一致 hard-fail);refresh 进度只在仍有 loading 账号时广播,final snapshot 只发一次;Login 是同源本地 endpoint,先开可见 loading 页再跳转;manual device-code 失败透传 HTTP status+body;端口预检 SO_REUSEADDR+打印占用 PID;ChromeDriver DevToolsActivePort 先修启动通道(--remote-debugging-pipe);旧 rehost 账号授权按 restored-accounts.json 的 codexHomePath 读;一键登录入口必须显式打开 WebDriver/浏览器才走 fresh-login 分支。
- **crash 排查**: 先 CHENG_CRASH_TRACE=1 留 run.log,只有含 cheng_crash_raw_v1 的日志才能交 crash-report;Darwin 符号化用 image_slide+line-map+__TEXT vmaddr,pc 在 libSystem 时优先符号化 lr/frame chain;优先用自带 debugger 能力(debug-report/print-line-map/print-symbols/crash-report),报告不足先给编译器补结构化 breadcrumb,不猜源码行。

## UniMaker / ts-csg / 移动端

- **同源真实性**: React/PWA 与 retained 渲染不同先查 Cheng layout/runtime/host(同一套页面,不假设两套);DOM/CSS complete≠PWA 1:1——state CSS variant/conditional DOM/局部 render helper 内联/真实 effect data source/event hit-target 任一缺失都不同;真机对比先确认真实 routeId 与真实焦点包名(dumpsys/resolve-activity),同包名覆盖安装;useEffect 异步态只能真实 provider/host state 注入(cheng_mobile_host_runtime_set_state 通用桥),严禁从截图硬编码。
- **route/交互事实**: UniMaker 交付顺序固定为功能完整性优先于 UI 1:1;route/render/handler/media/action/surface gate 未闭合前不追像素阈值。route edge 只记真实 React 事件链,不为 reachable 数字硬造直达边;区分 unreachableWithoutIncomingEdge/WithIncomingEdge;route inventory≠交互可达(看 initial route BFS);隐藏侧栏/弹层建真实 route+注入 state;重新 mount 的 route 事件携带弹窗状态 reset。`memo(Component)` 生成并消费 component_alias;IIFE block return 按顺序求值局部 const;JSX prop 先解析真实值再考虑布尔化;组件 slot/owner 静态值优先于同名 global;同名组件不后者覆盖;局部 no-arg handler 间接调用沿 local_write→function_value→call 追踪;root 选择走 render-root 语义+owner useState 初值+rootComponent 精确限定(root text 会命中子页按钮);发布页 route/component 权威=App.tsx renderPublishPage。`state && <DOM>` 已知 nullable object state 按首屏短路剪枝;初始可判定的隐藏弹层必须裁剪;带 conditionalStateRef 的节点可为交互保留;runtime 只消费 materializer 结构化 effect(route:/set:/toggle:/invoke:/stop-propagation),未知 hard-fail;touch release 先派发 route/click 再做 text focus 默认动作;hit-test 同时消费预编译 rect+当前 route layoutBoxes。
- **单次命中仲裁**: 按 React/DOM 事件模型区分子 event 与同节点 route——子控件 click event 优先于祖先 route;同一节点同时是 route 与 event 时 route 必须保留(应用市场:添加按钮需 `social_app:toggle` 并停留当前 route,卡片本体必须进入对应页面)。事件可达必须同时证明 event_handler 与 hit_target 同 node;首屏静态 disabled 但由 guard_state 解锁的按钮保留事件时也必须保留命中区。
- **DID/设备认证**: DID 导入必须按 UniMaker Android 原生语义走系统 BiometricPrompt,attestation purpose=2 并携带 trim 后的 latest_bundle_text;认证要用 `BiometricPrompt.CryptoObject(signature)` 把指纹/人脸结果绑定到本次 attestation 签名,不能只先弹认证再普通签名,也不能复用 30 秒 auth window 的旧 Keystore key;不能复用创建链 purpose=1 后再补字段;错误码对齐原生;迁移安卓原生实现时连 SDK guard 一起迁移。Android DID 入口必须禁用 Capacitor 路径:`unimaker-native://...` 只由原生 App 接管;点击 DID 创建/导入只 handoff 到原生 Compose+BiometricPrompt。用户可见文案统一叫"设备认证",禁 bio 直译类中文词;改名不能只扫 UI——progress/task_plan/docs、host 日志、错误码、smoke 断言也要同步;正式仓库零命中必须用 `rg -a --hidden --no-ignore` 覆盖 rawfile runtime 和 build cache,先清可再生生成物。DID 导入 scene-data 校验要按 `;` 拆 effect segment,不能用 startsWith 误判缺失;profile-only/身份页没有 mediaPlaybackSlots 时 APK 校验允许空 mediaPayloadAssets。
- **布局/渲染**: `<img height:auto>` 由 materializer 写真实 aspect-ratio;masonry 容器高度取每列最后 item bottom 去尾 gap;children 无条件 Fragment 展平;卡片媒体绑内部 aspect-ratio 容器非卡片根;object-cover 提升到 media_playback_slot.objectFit;390 viewport 两列 item 合同 x=8/199,w=183;block 后 inline cursor 同步 flow y;保留 useVirtualized=true 且 wrapper 显式 width:100%;style/script/noscript/template 子文本不可绘制;Tailwind 任意圆角/边角变体走通用 length parser;white-space 全合法值支持;CSS variant 的 media 读当前 viewport;width/height 同时更新 paint geometry;静态 border-radius 无 paint op 也保留作 runtime 回退;no-fill gradient 按 DOM 节点顺序绘制;solid fill/stroke 圆角也进 GPU command 由 rounded SDF shader 消费。
- **ContentCard 位置行**: React 语义是 `formatContentLocationLabel(content.location) || content.locationHint`;派生静态值进入 JSX expression 子节点时,最终文本 fallback 也必须用派生上下文。
- **M2 首页 feed 桥**: `node_contents_refresh` 是 NodesPage 按 peer 刷新,不是首页 `subscribeDistributedContents` 全量 feed;首页网络新卡上屏必须有独立 distributed feed refresh ABI/事件源并解析 JSON→`__m2Contents`。首页 feed 桥分三段验收——Cheng runtime 入口 `cheng_app_distributed_contents_update_utf8` 证明 JSON→`__m2Contents`→rebind;Android create/resume snapshot 只证明冷启动/恢复注入;双机新卡实时上屏还必须另有宿主全量 feed 订阅事件调用该入口。`social_feed_snapshot_cstr` 这类全量 snapshot 入口必须自己 drain 入站 publish metadata。
- **glyph/字体**: Unicode variation selector 零宽跳过,其它缺字 hard-fail;汉字主字体锁 `匯文明朝體.ttf`;SDF 预计算源只带 font/text 事实(禁内联像素;日志 WriteLine 双行协议,禁字符串+/Join/数组字面量拼);cache key=generated precompute source+依赖闭包 hash(输出路径必须占位化后入 key);按内容寻址+hit 后解析校验,--require-glyph-cache-hit 防偷跑;空 input 无 glyph run 合法;动态 state 文本必须覆盖所有现存文本 font-size bucket,不能只挂 textStateRef 节点;结构化暴露 glyph fail code/route/node/codepoint;SDF 文本裁剪按 glyph run 实际视觉边界扩 scissor;retained mobile glyph 上传缓存身份必须同时覆盖 entry/glyph/run/runGlyph/pixel counts,否则动态文本新增 run 后 runtime 跳过 metadata-only 上传,Android host 收到未知 runId 后硬崩。
- **Android host/渲染**: GPU command schema 增列同步 Cheng runtime+mobile shell codegen+生成 host C+APK 工程(stride 合同当前 17,含 rotation);图片/SVG/glyph cache 容量由 scene upload batch 决定禁固定小 cap;跨端资源身份函数必须 exact smoke;frameCallback 在 nativeTick 返回后主线程同时查 needsFrame||frameDirty(否则吞帧);OES 视频 updateTexImage 后必须消费 getTransformMatrix,基础 UV top=1/bottom=0 集中走 rotated_uv;compositor action=0&&count=0=移动既有 cache,空 paint bounds layer 不标 valid 不进 frame;媒体 Agent/Intent 控制进 render priority queue+receipt+frame counter。视频播放帧泵必须每个已调度 Choreographer frame 都调用 nativeTick,不能 `!frameDirty return` 短路,否则强制帧永远没机会生效(播放状态已变但视频按脏帧低频跳动)。Progressive ES 拉流运行在 render/present thread;host sink 返回 FIFO full(2) 时必须记录当前帧游标并立即返回,绝不能 SleepMs 等 FIFO 空(消费者被同线程阻塞,表现为只播一段后停住)。M2 详情页数据同步不能每 tick 从陈旧 route_apply 重置 `isVideoPlaying`;route_apply 只能作为一次性事件消费,播放态只在媒体源身份切换时重置。视频详情页播放语义必须来自真实播放按钮/控件,不能把 `<video>` 本体 onClick 或 autoPlay 编译成全屏/自动播放;暂停后继续播放只发 `Play`,不要先 `OpenAsset`(重开解码链卡顿)。
- **Scene lifecycle snapshot**: 只能恢复到同一 runtime 身份(至少覆盖 manifest/contract/bundle hash);APK 更新后旧 snapshot 直接灌入新场景会崩,按身份不匹配删除并冷启动;同身份 snapshot 恢复 false 时必须销毁半恢复 handle、删除坏 snapshot、同路由冷启动,禁止抛成 Activity 崩溃。`cheng.scene.state_snapshot.v1` 是事务恢复,不是逐个模拟用户输入;恢复时必须用 `WebSceneSeedStateValue` 写完整 state 表再统一 dirty/route refresh,用 `WebSceneSetStateValue` 会在半恢复状态触发绑定副作用直接崩;snapshot 只 seed state 不自动更新 input/textarea 的 value/paint glyph run——picker 重建后必须按 active route 的 text-input handler stateRef 把 restored state 重新投影回文本控件再统一 refresh。
- **性能/发热**: 状态变化后祖先可见性走 nodeId 结构索引禁全表扫(CPU 爆炸案);冷路径初始化禁数组赋值右侧带调用的三元;scene data 已排序时顺序唯一校验+游标+专用 append,禁逐条回通用 API 全表扫;大段 hit-test helper 别塞 web_scene_runtime(cold primary emit 边界);触摸入口直接消费 layoutBoxes/hitTargets/eventHandlers。host .so 不走 gradle/CMake(apk-build 用 prebuilt clang/ld-link 直编),加系统库改 prebuilt link 两处+API level 对齐;真机验证前核对 runtime 源码/retained object/.so/APK 时间戳+strings 语义标记(防旧 object 伪装);scene/glyph `.bin` 外置后 host 必须导出对应 read 函数并真实打包。headless executable 没有 Activity/JVM/AssetManager,媒体资产走 `CHENG_HEADLESS_ASSET_DIR` 的 NDK 文件路径;PNG 用 AImageDecoder+libjnigraphics;像素级首帧仍需真机 Activity/OES 或 NDK-only frame decode。
- **媒体门**: `data-csg-media-role` 无真实 mediaManifest 不生成 media_playback_slot;黑屏先看 PID logcat 首帧时间 vs 截图时间;retained media C ABI 的 str 走 strToCStringTemp,host callback ≤8 参数;默认视频资产优先 React 实际使用的文件(旧 4KB 同名资产致暗帧);首页视频只作 masonry 卡片 surface,详情 route 才允许全屏;PWA 内容路由生产默认必须消费真实 `unimaker_distributed_contents_v1` snapshot,没有 snapshot 就 hard-fail;真实 snapshot 里 content 可为空但 title 有效,也可能只有视频没有图片,转译按 PWA 语义接受并剪掉数据不可达 route,不能捏造;CDP 自动 snapshot 必须连接现有真实 PWA 浏览器会话,禁启动空新浏览器当生产数据源;MediaFirstImage 只证 PNG 资产验证,未收到 host texture receipt 前 textureReady=false 显式保留。Compositor layer cache/dirty rect 必须裁到当前视口在 layer-local 坐标中的交集;cache 纹理尺寸不能被超宽文本撑到屏外(Adreno/SurfaceComposer 在 eglSwapBuffers 附近 native crash,表象像点击未生效)。
- **APK/真机流程**: versionCode 严格大于已装;install 卡 binder 先 dumpsys lastUpdateTime 判是否真更新;华为风险确认页抓 UI tree 点两层"继续安装";若进入锁屏密码认证,不得仅凭安装命令状态宣称成功/失败,必须用 dumpsys versionCode/lastUpdateTime 和 base.apk hash 复核;再卡分解 install-create/write/commit 定位;logcat -s cheng-mobile-shell 抓初始化窗口;mobile one-click 有 mobile routes 未传 --viewport 默认 390x844;retained 运行时 viewport 从 surface/density 同源;APK 成功复制 app-debug.apk 并写 summary 后默认删中间树,只有显式 --keep-build-tree 才保留;APK 资源/合同逐字节 hash 校验,native .so 校验最终 APK ELF 动态符号(Gradle 会重打包);runtime bundle/contract payload 显式传入并记真实字节数+sha256,禁 {} stub;产品表述"纯 Cheng 原生 GUI",Kotlin/ArkTS 只是宿主桥。
- **发布自动化真实性**: 先闭合 AI 模式 code-level 全自动发布(语义任务图/MediaStore 唯一匹配/资产准备/真实 publish 入队回写)再做 GUI 倍速慢放;慢放必须映射真实 GUI 状态/组件操作,延迟=真实耗时×倍数,禁语义可视基准/固定间隔/卡片动画冒充。文件选择器只属于用户手动上传路径;Computer Use 自动发布必须走 MediaStore/私有 cache→`WebSceneApplyMediaSelectionPayload`→真实 `mediaFiles` 语义态,不能触发或依赖 Android 文件选择器。手动 picker 打开前必须把 ref/kind/resultMode/resultStateRef/restoreRoute 放进 `onSaveInstanceState` 并在 `onCreate` 先恢复;picker 覆盖/返回期间 `onActivityResult` 可能先于 `onResume`,允许抽首帧并写 runtime state,但严禁调度 nativeTick/present,必须用 `activityResumed && surface.isValid` 门控 frame scheduling(旧 SurfaceView BufferQueue abandoned 后 eglSwapBuffers SIGABRT);封面帧走 MediaMetadataRetriever→mediaPreviews 动态纹理→mediaFiles 选中态 DOM;选择结果必须在进入 render 队列前把 route/snapshot/pending picker/media payload 写入 lifecycle 文件,冷启动按 restoreOnColdStart 恢复并显式 REORDER_TO_FRONT;手动上传统一用 ACTION_OPEN_DOCUMENT+CATEGORY_OPENABLE+persistable read grant;华为图库视频预览页右上确认按钮真实 bounds [1024,116][1174,266],点 1100,190 才返回,点中间播放区会进系统预览链。发布页还必须有 scene DOM 消费 `mediaFiles=__array_nonempty`,JSX 的 map 未完整 materialize 时先在 materializer 生成结构化选中态节点。
- **Computer Use 执行卡归属**: 只能存在于小优聊天消息流;Android 宿主不得安装全局顶层 overlay/card;宿主只保留执行状态、媒体选择、GUI replay ABI 和日志。
- **Android 发布桥真实性**: `external-publish` 不能只解析 UI 事件,`cheng_host_publish(path, kind)` 必须真实进入平台发布链;最低闭环=GPS state 已写入、`content://` 通过 resolver 复制到私有 cache、MIME 决定媒体 type、socialPublishEnqueue 成功后事件式推 feed snapshot;无 GPS/无媒体要返回错误,禁止 no-op、猜 type 或固定占位地址。发布页 route-enter 已写入 `locationStatus=ready` 时,点击发布必须直接使用现有定位 state,不能再同步触发一次反地理编码;外网反查失败不能阻断已具备定位的发布链路。组合 effect 形如 `external-publish:content;location_capture:...` 时,发布 kind 必须先用 `__csg_scene_effect_segment_with_prefix(...,"external-publish:")` 截出本段再解析。改 materializer 或 scene-runtime-smoke-source.mjs 后必须重新跑 one-click materialize 再打 APK,只改源码不刷新 retained 输出,真机仍跑旧 scene data。
- **ts-csg(cheng-source.ts)**: TS block-scoped 同名 const/let 在平铺 locals 冲突→duplicate 检查改 delete+覆盖;this 属性要收集 property_write value op 类型;localFromIdentifierOp 的 property_read 返回属性自身 hidden binding;非字面量接收者字符串操作需 Cheng 字符串运行时库才能 lower;smoke 用 stage3 编译时 chengSmokeEnv 显式传 cheng 路径+repo root。
- **编译路径**: glyph SDF 预计算生产编译用 `stage3 --emit:exe`;one-click 与 output smoke 的 retained/glyph 生产验证走 stage3,不用 backend_driver obj-link 当 APK 前置门禁。generated retained runtime source 避免 `for item in seq:` 形态(冷编译器报 expected .. in for range),稳定写法用 `for i in 0..<seq.len:`。
- **Android 编译口径**: `CHENG_CSG_TYPED_IR_BATCH_LIMIT` 是 Android artifact 构建专用 RSS/时间旋钮,不是全局默认优化(compiler 默认 640,Android 构建可 4096);报告必须同时看 batch limit/round_count/round_ms/report_rss_bytes,总耗时没明显下降就拆 CSG source/profile rebuild,不盲目加 batch。`mobile_ffi/unimaker_compat_ffi.cheng` 全量单体 Android 编译触发 8GiB RSS guard;对象缓存只能复用成功产物,不能解决首次单体编译;全后端要做源/入口拆分。
- **Harmony**: ArkTS Record 对象字面量初始化用赋值位置 helper;CompileArkTS 比 BuildJS 严格,改 ArkTS 必须 assembleHap 全验;prebuilt core .so 走 CMake skip+ProcessLibs 打包,旧 .so 只验上层 UI 不解锁新符号;鸿蒙 cheng_gui_host.c 是手维护权威,stale build_gui_host.sh 禁跑(会 clobber);改发布端协议=重编 publisher 出 moq_core.o 覆盖 prebuilt→assembleHap→hdc install;新 rawfile 资产放 resources/rawfile 并在 host extract 列表加一行。
- **CSG 产品线**: 金融/资产安全先完整实现生产语义+确定性证明+signer gate+hard-fail 测试,不为编译器缺口弱化模型;CSG 产物主格式二进制 CSGC,JSON/JSONL 只作 debug;纯 Cheng 数据编辑器只支持唯一无版本 CSGC header(headerSize=64)其他 hard-fail;c-csg/py-csg/cheng-csg 默认生产入口必须纯 Cheng CLI(Python 只做显式 bootstrap/oracle 启动壳),facts/lower/compile/prove/migrate 全走纯 Cheng,多 TU 合并由纯 Cheng emitter 做,migrate receipt 失败嵌入 frontend report。
- **React 参照仓移动会打红 CHT/parity 门禁(2026-08-14)**: UniMaker/React.js 是活工作区,并发未提交重构会引入编不了的新 handler 形态,门禁红先归因参照物 mtime/git status 再动本仓。
- **materializer 静态求值层改动的验证半径(2026-08-14)**: nullable state 的静态剪枝/求值 tier 顺序是契约承重墙;改这层必须跑 one-click-output smoke 全量;半成品 WIP 断言阻塞门禁时 known-gap 化+正典挂账,不硬改凑绿。
- **fixed/overlay 命中语义**: `position:fixed` 的百分比宽高必须按 viewport containing block 解析;同 fixed layer 内必须用祖先 stacking context/z-index 得到 paint order,layoutBoxes/GPU 命令/hit test 共用该顺序;pointer hit 与 event hit 分离,普通 pointer-events:auto overlay/disabled 控件即使没有 click handler 也必须挡住底层路由/事件(否则弹层点击穿透)。
- **UniMaker 导航性能**: route transition compositor 只做原子替换缓存层,禁注入 facts 未声明的水墨转场;interaction/event/text/box/paint range 索引由各自拓扑 mutation 显式失效,禁绑通用 graph.version;state route cache 按 facts 建 stateRef→route 精确 revision;Android requestFrame() 幂等(已有 Choreographer callback 只标脏)。
- **UniMaker 播放验收五门**: ①先核已装 versionCode==目标 APK;②触摸致播放态变化后必须在真实 input drain 点失效 cached compositor;③本地 MP4 须独立 demux audio→AMediaCodec PCM→AAudio,音频时钟约束视频放帧,无 `local_audio_playback_started` 不得称"正常播放/有声";④`handleVideoClick` 初始 false 必须 OpenAsset+Play,证据=present_media_surface playing>0+media_playback_frame+音频/EOF;⑤不得自动改系统音量。秒发+秒开须组合报告串联 version 门/publish enqueue/feed snapshot/播放帧/音频/EOS/pacing,enqueue→snapshot 延迟默认 <=1000ms。
- **UniMaker 生命周期恢复视频崩溃**: 恢复快照后的 dirty/transition compositor 帧也可能含 media surface;提交 GL 前先跑 `__csg_scene_prepare_active_route_media_surfaces` 注册真实 texture,只在 active-route 首帧 prepare 会 `draw_media_surface missing texture` native abort。
- **UniMaker 主视频资产门**: 预览/首帧验证只做辅助;默认移动端主视频构建时必须证明 AAC 音轨、短边>=720、长边>=1080、时长>=5s、帧率>=24fps,否则 hard-fail。
- **UniMaker 华为真机安装前置**: `pm install` 触发华为风险链前先确认手机 DNS/直连可用且 VPN/代理不劫持校验;风险页勾"已了解"后继续,最终锁屏密码确认只能用户完成。
- **UniMaker Android 发热/耗电**: 生产路径禁默认每帧 logcat;glyph SDF atlas 仅像素版本变化才上传 pixel buffer,普通刷新走 metadata-only(否则反复搬 35MB 字体纹理);生产 APK 默认 `ink_launch=0`,水墨 overlay active 时视频播放会叠加驱动渲染线程,`ink_frame` 日志受 debug 属性控制。
- **Linux one-click**: poster 解码走 sharp,Darwin 的 sharp-darwin-arm64 在 chengx64 上硬失败,须同时落 `@img/sharp-linux-x64`+`@img/sharp-libvips-linux-x64`;`--retained-scene-only` 默认不保留 extract cache,要复用必须加 `--keep-extract-cache`。
- **生产 one-click 的 TS 桥只能 exec 固定安装 inode(2026-08-14)**: Linux 打开 `/usr/libexec/cheng/csg-cli`(O_NOFOLLOW),fstat 后再 spawn 同一路径;env/相对路径/tools/csg 都禁止;Node 的 `/proc/self/fd/N` 会卡死(uv_spawn 给多余 fd 加 CLOEXEC);全量 UniMaker extract 约 90 万行 JSONL;杀 one-click 父进程不会带走 held CLI 子进程,杀 extract 必须把 held CLI 子进程一起收掉。
- **生产 one-click 抽 CSG 必须 held-exec CLI(2026-08-14)**: ts-csg 桥在 pack/validate 前精确 HARD_RED:production_launcher_runtime_primitives_missing;Darwin 没有 held-exec issuer,生产 one-click 抽不出 UniMaker 事实;wiring gate 锁的是 one-click→buildM2HomeWiring→homeDisplayContents,不是 invoke=0;不要为了绿 one-click 在 TS 桥假接 CLI。
- **Darwin held-exec / 1GiB 不能假接(2026-08-14)**: `CsgCoreProductionLauncherMainActivateHeldBinaryInto` 是唯一 arming 边;Darwin 无 fd 寻址 exec,函数在 spawn 前返回,provider slot 为空,IssueInto 精确 HARD_RED;跨进程 pathname 对拍即使绿也是 `reviewed_default_path_untrusted`,credit=0;1GiB 封条 `macos_has_no_bound_kernel_or_vm_aggregate_limit`;不要往 slot 塞收据冒充接线。
- **held CLI 的 `--mode` 必须紧跟子命令(2026-08-14)**: musl held CLI 的 ParamCount() 会大于真实 argc,`while i <= ParamCount(): ParamStr(i)` 读到 argv 外;只看 argv[2] 是不是 `--mode`;TS 桥一律传 `--mode sandbox`。
- **Linux musl held-exec 布局(2026-08-14)**: `uname.machine` 是 `x86_64` 不是 `linux-x86_64`;musl 动态链上 ByteBuf+DomainBytesCid 会 ORC registry_miss,Activate 存款用堆拷哈希;`execveat(AT_EMPTY_PATH)` 已在 colima chengx64 上跑通。

## VPN lane

- **macOS ChengPerAppVPN**: 任务指向 ChengPerAppVPN 时只走 macOS NetworkExtension/App Proxy 链路,不把 Android/Harmony VPN 的打包安装验证混进同一目标;生产数据面=Cheng native local proxy+Vultr tcp-tls-forward(SSH -D 只许临时诊断);Packet Tunnel 必须有真实 TCP 转发数据面+matchTools 覆盖 CLI 子进程;NEAppProxyProvider 主线同时校验 ExtensionPointIdentifier/principal class/entitlement/真实编入源文件/profile ProviderType;新建配置用真实 `NEAppProxyProviderManager()`+providerBundleIdentifier;appRules 健康不只看 connected——selected=1 出现 installed=0/changed=1/matched=0/missing_rule_paths 即判不健康触发 repair;runtime watch 不能在配置权限拒绝后循环 repair(saveToPreferences 会反复弹系统窗),遇到 permission denied 只记录待用户确认并退出 watch;tcp-tls-forward dialer_proxy 是两层 TLS record 嵌套,reader 必须显式保留 pending;并发 accept 不能把 Cheng heap ref 上下文跨线程传递,worker 只收 fd 在线程内重载 config/identity;handshake 模块基于全局 client/server 状态,并发握手必须在进程内串行化或改成显式 handshake context,否则互相覆盖密钥报 tag mismatch;Chrome 退出接管后托管策略只允许 ProxyMode=system 或不写;Developer ID 必须 timestamped 签名+stapled notary+syspolicy_check 过再激活 sysext。
- **Android/Harmony VPN**: 产品线只做全局 TUN/全局 PAC,不做用户可配置 Per-App;addDisallowedApplication 只用于 VPN owner 自排除;出口 socket 确定性顺序=native fd→VpnService.protect(fd)→android_setsocknetwork(networkHandle,fd)→connect(实测反序超时;禁 Java socket protect/ParcelFileDescriptor.fromSocket/进程级 bindProcessToNetwork);TUN 接口地址用独立 host /32(fake-ip 池单独作路由覆盖);TUN 路由 Builder 层排除出口 IPv4 /32+CIDR 补集覆盖其余;普通 UDP 443 未修好前 hard-drop 非 DNS UDP;PAC 只发布 setHttpProxy+本地代理,禁默认路由/DNS 劫持;Harmony 普通签名无 SET_PAC_URL 时 PAC hard-fail 不伪装;连通性测试先确认系统默认 active network 是 VPN 再用普通 socket 走默认路由(禁对测试 socket bindSocket);DNS 测试用绑定 VPN network 的 DatagramSocket 显式查询(Network.getAllByName 华为会缓存绕过);STOP 是强制控制面动作,不依赖 connected 态;移动 TUN fd 是 raw IPv4 packet(仅 macOS utun 有 4B AF header),共享数据面显式传 frameMode;证书/root/key 相对路径必须有真实 config_path,ABI 变更同步 Android JNI+Harmony NAPI+product gate;协议与 GUI 状态留在 Cheng core/GUI contract;Harmony extension 读沙箱固定 canonical config(禁侧信道控制文件);native core CMake 依赖完整 source closure+export roots 覆盖新 syscall。
- **Android VpnService STOP ANR(2026-07-16)**: ACTION_STOP 在 onStartCommand/binder 线程同步 stopVpn/nativeStatusJson → 华为 Timeout executing service ANR;修=STOP 与 START 一样丢到独立线程,stopSelf 放 finally;`assert_clean_logs` 忽略 DeadSystemException。after-stop ORC 采样禁 dump 风暴:service exported=false,adb QUERY=Permission Denial;门禁若 10× launch_app+dump_ui 会把主线程打满;正解=prefs 优先读 `orc: live=`/`mem_live`,UI 最多 2-3 次,永不对 QUERY 用 start-foreground-service。resilience 恢复口径(华为):`kill -9`=Operation not permitted;`am crash` 后即便 stopIfKilled=false 也不 sticky 拉起;生产恢复=desired_running+MainActivity/BootReceiver 的 app-uid startForegroundService。
- **Android 门禁 dump_ui attempt 污染(2026-07-16)**: `dump_ui` 曾用全局 `attempt`,被循环调用时成功路径把外层 attempt 打回 1→死循环;修=改用 `_dump_ui_attempt`,ORC 失败回落 prefs。
- **Android 门禁 tap 铁律(2026-07-16)**: `tap_proxy_start` 有 `start-button.coords` 时禁止先跑 `ui_has_clickable_text`(华为 null-root dump 会卡数分钟并触发 ANR);正解=系统 VPN 探针清残留→直接 cached tap→用 desired_running/system VPN 确认,失败再补一击;ANR 后 `am crash` 可回收(禁 sticky 测里的 force-stop)。
- **移动端 core 链接根(2026-07-16)**: `src/std/buffer.cheng` 改成 `@importc("cheng_seq_next_cap")` 摊还扩容后,Android/鸿蒙 `build_cheng_hy2_tun_core.sh` 的 PROGRAM_SUPPORT_ROOTS 必须同步挂上该符号,否则 NDK/--no-undefined 链红;双端脚本同改。
- **VPN 吞吐战役(2026-06-28 定论)**: WAN UDP/QUIC 测试先确认路由有无 Clash/utun 整流(Clash 全局模式丢入站 UDP,绑 en0 绕开后握手秒通),再怀疑传输层代码;测真实 proxy ceiling 在 exit VPS 起自建 HTTPS 源绕开 cloudflare 限速;瓶颈定论=vultr exit 容量+server QUIC cwnd cap;fork-per-app-conn 已合并(env 门控默认关 mux),测 fork 需停 installer(会回收端口 SIGKILL fork parent)。

## QUIC / 媒体 lane

- **HANDSHAKE_DONE 战役(2026-06-19 定论)**: 服务端 DONE 短包曾绕过重传队列(直发不 RecordSentParts,真丢包无人补)——修法=DONE 改走 server 帧队列白嫖现成 RTO/ack 恢复;PipeWrite 对小控制帧快速返回不同步 drain;accept 侧真正执行 handshake deadline 回收半开 session,dial 入口先 abort 残留 session;loopback 不丢包测不出此类 stall,真机跨设备才算验证通过。
- **安卓 ES 流媒体**: 旋转元数据随 esindex 走全链路(ffprobe rotation→MQES v2 头→bridge 按 version 解析→同一归一化函数,存原始带符号值);音频=流式 ADTS AAC 完整镜像视频 ES 链路(帧头自配置免 csd)+NDK AAudio 输出+音频主时钟对齐视频 release;所有 QUIC open/prefetch 必须 render-thread tick-pull(裸 pthread 不驱动 Cheng QUIC pump);跨设备握手 flaky 打法=发布端重发布拿新 ephemeral port+安卓立即重设 peer+冷启重拨。
- **MoQ 完成度诚实口径**: 原生 QUIC/MoQ 不从移动 ABI 补假完成——先二进制请求帧+真实 qconn stream 读写+native runtime smoke;进程内 stream smoke≠真机 QUIC 端到端完成;段流 serve 用 WriteRange 不 FIN 同连接续服。

## 产品与对外口径

- **Cheng 的原始产品轴是跨语言原生执行底座,不是语言替代(2026-08-09)**: 首要假设固定为三件事共同成立——自研 IR/优化后端在同等 workload 上比 C/Rust 主链编译更快;主流语言经各自 extractor 一键降到 canonical CSG;同一 Cheng runtime/backend 提供无 WebView/宿主 JS 语义依赖的原生 Computer Use 与多端渲染。主流语言继续承担入口生态,Cheng 是 canonical semantic/native target、runtime 和 backend;三个假设必须分别实证,任何一项未闭合都只能称路线,不能把子集 smoke、转出 facts 或性能目标写成一键转译完成。
- **闭合 CSG 成功证明不应退化为重复 goal 博弈(2026-08-09)**: 当用户意图已原子确认成为 canonical CSG、输入状态由权威快照绑定、唯一 admission/执行器/回执完整证明 `before -> operation -> after` 时,CSG 成功本身就是构造性证明。证明边界:CSG 证明 formal intent 到 symbolic state,不自动证明自然语言到 formal intent 的翻译,也不自动证明传感器 facts 等于物理世界。外部 harness 只保留为离线 conformance/mutation oracle,不能进入每次任务的第二套目标语义。
- **终态 goal 验证与执行过程约束不可混算(2026-08-09)**: harness 的 goal 命令若从权威状态读取、目标谓词完整且验证器不能被被测动作篡改,已足以独立证明目标是否达成;正确分层=`goal/spec -> CSG enforcement -> external harness oracle`,外部 goal verifier 必须保持独立,不能与 Cheng/CSG 共用同一错误实现。
- **专利状态口径(2026-07-15)**: Cheng/Vexa 第一批 5 件发明专利已通过专利代理机构初审并提交申请;覆盖面为结算与验证协议层(CSGC 事实编码/预言机准入/编排回执/可恢复状态单元/AI 候选门禁),语言层保持开源,专利防御性使用。Vexa 归属(2026-07-16 用户修正):Vexa 是朋友的独立项目,已获中贝通信 1000 万元天使轮,不是我们自有的产品层;自有协议层叫 CSG-Core,Vexa 是联合专利布局方与协议的首个外部产业落地场景(外部背书)。
- **专利状态与文本核验更新(2026-09-09 用户补证)**：202611094996.6《一种确定性事实图编码验证及根哈希生成方法及系统》受理通知记载申请日2026-07-22，公布通知与实审通知均记载2026-09-08；公布和进入实审不是授权。202611324802.7《一种智能体符号落地方法及系统》受理通知记载申请日2026-08-28，不能再把符号落地当作未申请草稿。首案同题名代理来稿与first5旧骨架明显不同，权项含固定头部、确定性字典、独立解码及唯一根模式；后续布局须优先核对局方正式全篇，不以旧合集或“提交版”文件名代替实际提交字节。其它各件申请状态不能由一件通知推定；内部未公开草稿不直接构成现有技术。
- **事实根必须按技术与专利文本版本区分(2026-09-10 用户追问复核)**：当前docs/csg-core-standard.md定义facts_root为Patricia Merkle DAG的语义绑定根，validator的事实根入口确实调用Merkle bound builder；完整CSGC物理字节另有csgc_object_cid，二者不能混用。符号落地本地提交版权6明确Patricia Merkle，权7明确成员与非成员证明。首案对应代理稿中的整体内容哈希描述不能代表当前CSG方案，后续规范变化也不能证明首案正式公布文本已同步修改。sha256前缀不区分平面摘要与Merkle构造，必须查看预映像和计算关系。
- **工程优化必须先于专利和论文结论(2026-07-30)**: 顺序固定为:唯一实现收口→正反动态门→实测与源码哈希冻结→专利权利要求和论文实验同步;任一工程门仍为 RED,文档必须保持明确限制。
- **闲鱼 GLM5.2 三折 API 文案必须写"招代理"**(渠道/代理招募/合作接入),不是"API 代理服务"/自部署 proxy 商品。
- **小红书创作平台登录态判定(2026-07-17)**: 图片上传后接口跳出 401/登录页,不能直接断言账号已退出;必须重新检查用户当前可见的创作平台标签页与右上角账号标识。
- **Clash Verge 模式持久化必须通过应用状态并做冷启动验收(2026-08-09)**: 直接修改 config.yaml 并调用 Mihomo /configs 热重载,只能证明当前内核已切换;前端退出或重启时会把生成文件重新写回。模式切换必须走 Clash Verge 自身的状态入口;验收必须完整退出重启后同时核对界面、基础配置和 Mihomo 运行态。
- **设备盲点连招险情(2026-07-14 最高级)**: 距上次设备交互 14 分钟后直接 7 连盲 tap+input text,落进机主真实支付宝 HK。铁律:①每次 adb input 前 dumpsys mCurrentFocus 核验目标 app 前台;②空窗 >2min 必须先截图重定位;③多步流程逐步执行禁一条命令连招;④input text 前确认聚焦控件属目标 app;⑤发现第三方(尤其金融)app 前台只允许 HOME,立即报告。

# 日期教训流(链式战役按族合并)

## 2026-07-10 CompilerCSG/Primary 有界生命周期

- source streaming 只有在每个 source/function 的局部 facts 直接归约进 compact V2 accumulator 并立即 `TypedExprFactTableRelease` 时才成立;先追加到全局 typedExprFacts、最后再复制到 V2 仍是双份全量常驻。
- 裸 `ParserReadNormalizedExprLayerFromText` 不具备跨 source profile/import 图,不能作为 qualified external call 的 ABI oracle;闭包 oracle 必须用 `ParserReadNormalizedExprLayerForSourceClosureWithExternalPackageRoots`。
- TypedIR fixed point 的收敛条件是"是否仍有 reachable-but-unprocessed function",不是"本轮新增 reachability 是否为 0"(后者漏掉同轮较晚进入 frontier 的函数)。
- declaration-only/importc-only source 合法地产生 `expr=0/facts=0/slice=0`;有 expr 却无 slice 才 hard-fail,零 expr 却新增 facts 同样 hard-fail。
- arena-backed SoA 表不能用普通赋值制造第二所有者;function rows 合并前必须先建 source-scoped dense index(线性 HasFunctionAtLine + 未初始化 dense store 会 O(N²));重建 frozen store 前先释放旧 store。
- primary reachability 必须使用单调 frontier queue,每个函数只 lower/取边/释放一次;每发现一个新函数就重扫全图会把流式生命周期重新变成 O(N²)。
- import edge 解析后的 profile graph 才是 metadata context 的唯一语义源;禁止先为未解析 profile 构造整批 context、逻辑清空后再重建;高水位运行时里"先分配再释放"不等价于"不分配"。
- reusable facts context 只能长期保留整源只读 metadata/lines;`exprLineColumns` 的 nested columns 是函数切片 scratch,消费后必须按触及行清空。
- 外部调用的 reachability 与 normalized expr 必须共用同一个 import-graph resolver;actual-call 扫描接管后 member 扫描不得再次解析同一 import call site。
- compact resolved-call snapshot/index 不能按 emit mode 或 skipped-function 数量提前释放;全量 typed facts 可先释放,compact snapshot 统一在 primary 完成后释放。
- 文本 embedded/return call-head 扫描只能作为候选边:登记 callTargets 前必须先解析同名真函数,再用 TypedIR 证明 ref/ptr/seq 类型物化;声明 RHS 与 return whole-call 必须共用同一判定。
- primary/backend2 内部合成槽名只能使用无损、标识符安全的编码;禁止直接拼限定调用头或带符号 node index(`.` 会被解释成字段访问,`-1` 会被解释成算术)。
- build-level bounded scratch 必须覆盖同一语义函数的所有生产调用路径;只接 streaming 分支而漏掉 reuse/fallback 分支仍形成按函数 allocator 高水位。
- lookup/arena 改成 retained-capacity 原地 reset/rehash 后,任何 clone 都必须深拷贝可变 slots/buckets;生命周期修复后必须继续搜索同一变量的后续 `= Zero()`(前置 reset 后再次零赋值会完全抵消容量复用);性能报告必须区分 logical reset 与 physical release;跨层 scratch 复用不能只审调用方(callee 入口仍 Release 则 caller 的 Reset 无效),三项作为一个合同锁进门禁;行级稀疏索引不能用"每行一个动态 seq"(flat SoA:line head + value + next,slice 只复位 touched heads)。

## 2026-07-17 指针类断言必须解引用验内容(#135 三度翻案)

- 指针"垃圾"判定三件套=①解引用读内容 ②对槽位加 watchpoint 找全部写入者 ③指针值跨会话不同仅是线索非判决(堆地址本就随分配变化)。与「数据先行」「exit code 判别」同族:先证据链触底再归因。

## 2026-07-17 编译证据与内存度量合同

- 成功编译的 stderr 合法地可以是 0 字节;固定到 `/dev/fd` 的同一输入重复读取必须用 `pread` 或显式重置 offset(连续 read 会把第二次读取变成空输入制造伪漂移);用旧 driver 编译测试不会激活当前 compiler 源码新语义。
- 报告字段有依赖关系时必须按拓扑顺序重绑定(先生成底层 receipt/hash,再生成依赖它们的汇总);生产 receipt 缺 provider raw hash 等证据时 shell harness 不得自行合成"证明"。
- Darwin 内存报告必须区分 current resident RSS 与 `phys_footprint`;用户态轮询只能证明 observed_sample_peak<=limit,报告必须拆成 `observed_sample_limit_status=proved` 与 `hard_memory_limit_proof_status=not_provable_userspace_poll`。

## 2026-07-18 CompilerCSG 语义与门禁族

- **语义身份索引性能合同**: overload 唯一性索引禁止用 `Join` 生成复合键;双桶 SoA,哈希只选桶、命中逐字段精确比较;名称桶每个 source+name 只挂一个代表行(每个 overload 都挂入名称链会同名退化为 O(N²));已知行数的单次索引一次 reserve、记录 retained capacity 和 probe visits。
- **合法浮点字面量与失败原子性**: 合法十进制字面量不得被当成 hard-fail fixture;门禁必须锁定正确舍入后的 IEEE-754 bits;测试 lowering 认领后的失败只能构造内部 malformed TypedIR,并验证 append-only delta 完整回滚后只留结构化 poison。
- **表达式层所有权**: `NormalizedExprLayerReset` 只清逻辑内容并保留 capacity,不等于 RSS 释放;阶段终止必须先 Reset 清字符串,再把整层置为新空值,门禁断言 `cap==0`。CompilerCSG 生产输出不得持有 `NormalizedExprLayer`;复用 `linkPlan.exprLayer` 时直接只读分片,禁止再物化一份全量 selected view。
- **raw owner clone**: 含显式释放 Arena/intern pool/sealed build index 的聚合值,按值 `return source` 不能充当可证明 move;未提供 `var` 源清空合同前,兼容 `Clone` 必须真实深拷贝,生产所有权迁移只走 `Into/MoveInto`。失败原子性测试的 owner 快照也必须深拷贝(浅拷会让原地污染同时改写快照而假绿)。
- **生命周期状态机门禁**: 读取源码字符串的 smoke 只能证明代码形状;生产释放 wrapper 与测试必须共用可直接调用的 transition helper;门禁至少执行成功顺序、提前/重复 transition 拒绝、abort owner 清理、terminal owner 置零;近似 retained bytes 只能标为非权威 diagnostic。
- **T79 反汇编错位归因**: 看到写点/读点 offset 相邻不能直接推出"同字段双布局";必须先把机器指令逐条映射回各自源语句。已隔离根因=多行 `add(seq, helper(...))` 只生成了内层 helper,外层 `add` 整条未进入 IR;生产修复必须统一读取有函数边界的完整语句跨度,两个 consumer 共用同一结构化结果。最小 A/B 只能证明根因方向,终判仍是 reverse-mutation、GEN2 tiny、terminal、oracle、gen3 全链。
- **rebase 到活 HEAD 必验被调函数存在性(0543be970 残缺提交)**: 跨基座 rebase 落账前,对 diff 新增的每个外部函数调用 git grep 其定义在目标 HEAD 存在(不只验 apply 干净);reject 信号出现时优先怀疑被调符号在 HEAD 已变(活 HEAD 重写期,旧基座存在的 helper 可能已被泛化删除)。
- **defer 语法与自举语义必须双重过门**: 正式规范只允许 `defer: suite`,shorthand 本身非法且旧 pure 前端会把内部 `f()` 当普通调用立即执行;先把非法 shorthand 迁为规范 block 并在 parser hard-fail,再用 cold/GEN2 的正常退出、提前返回、同作用域 LIFO、嵌套作用域和循环退出可执行门禁证明语义。未完整实现的形态必须 hard-fail;禁止整体回退无关 SoA,也禁止改成手写释放掩盖编译器缺口。
- **structured slice 必须按 source 聚合**: parser 的函数 slice 使用局部 `scopeId=0` 根;同源多个函数不能逐 slice 调 `NormalizedExprLayerAdd`(重复根和重复局部 ordinal 被 index 拒绝);必须用 `slice.sourceScopeIds/sourceStatementOrdinals` 恢复稳定 source ID,检查函数范围不重叠,按源码顺序生成一套稠密 source-local 域;`functionIndex` 的分配顺序不能冒充 source span 顺序,切片前显式按 `(startLine,endLine,functionIndex)` 稳定排序并对排序后的范围做重叠 hard-fail。`os.ProcessRssBytes()` 不得按 function slice 调用把监测 syscall 带进生产热路径。
- **混合提交的回归归因**: 一个提交同时修改 SoA 布局、lowering、链接生命周期和控制流语义时,提交级 A/B 只能证明"回归由该提交引入";必须分别用布局/生命周期 smoke、语法门、语义可执行门和固定点门建立因果链;混合提交不能用整体 revert 做故障隔离。
- **跨模块聚合布局禁止复制字节魔数**: 真实布局 `sizeof(TypedExprFactTable)=552` 而 primary lowering 的 500B fallback 没随类型变化,整体值复制越过局部槽位,表现成后续阶段随机损坏;跨模块传递聚合值时布局必须从同一结构化类型描述或 `sizeof` 推导,严禁复制常量;新增字段的同一提交必须包含布局等值门禁。已经很大的聚合继续平铺十余个动态列会跨过后端聚合布局错误边界,必须收成单 owner nested SoA 并完整实现 init/clone/hash/strict validate/move/release。
- **helper 绿不等于 public lowering 绿**: 新增结构化 evaluator 后测试直接调用 helper 只证明 helper 本身;所有汇聚点仍必须逐一接线并通过 public 入口。跨位宽整数转换必须同时绑定源宽度、源 signedness、目标宽度和目标 signedness(ARM64 的 I32->I64 `ldrsw` 只能符号扩展,uint32->uint64 必须显式零扩展;门禁至少包含最高位为 1 的输入)。expected-type 具体化必须区分裸泛型 `T` 与包装泛型 `refT/varT`(包装泛型必须保持同一 wrapper 后再替换内型,无法证明时 hard-fail)。provenance 属于语义合同,本地同名 load/手工节点不能证明 `std/system.load` 的 resolved-call 路径。
- **显式泛型必须由声明驱动实例化**: `f[T](x)` 的 T 不能只当 call-head 文本,也不能由外层 cast 或 sink 猜测;声明索引保存有序泛型名,调用实参按数量和名字形成唯一 substitution,冲突 hard-fail;resolved-call 事实必须绑定结构化显式泛型实参和实例化返回型;通用 top-level token 扫描器若先更新括号深度再判断目标,`[` 这类 opening delimiter 永远不可见——opening delimiter 必须在进入子深度前按当前深度判定。
- **source-local range 不能直接索引全局层**: 消费端必须同时维护 source-local cursor(验证 sidecar)与 global cursor(访问物理列),并用第二个非空 source 的 local start=0 反例锁门;单 source smoke 不能证明坐标系正确。
- **单点宽度/尺寸收窄必须先交付全矩阵再动手(#133 三轮教训)**: 一次 sizer 收窄牵动"后端×访问路径"整张 stride 决策网;矩阵表(行=访问路径,列=后端,格=行号+三档状态)先行交付作完整性凭据。同族:S5 意图变量(线程×会话生命周期×采样时序三维)。规则:改任何"单一真源"的决策输入前,先枚举全部消费闭包并落表。
- **并发意图变量修复的三维审计范式(S5/S7)**: ①线程维——全调用路径×线程枚举;②会话生命周期维——teardown/建流边沿的粘滞/漏检/误吞三态;③时序维——采样式检测对"事件压缩进单帧"不鲁棒,改用世代计数器等结构性信号。验证范式=逐帧状态机推演表,复核员独立重推+自构第 N+1 场景对抗。
- **烤制点杀者复发:种子链一律中性目录烤+拷回**: 同一字节二进制在 scratchpad 秒过、在 artifacts/bootstrap/cheng.stage0 路径 dyld 层挂起/SIGKILL(sample 钉 _dyld_start)。免疫配方=git clone --local 到中性名目录→烤链→验证→产物拷回主树;seed 换装/重烤一律走此配方。

## 2026-07-19/20 验证与融合纪律

- **Regalloc Ack 必须绑定冻结 Action 与对象字节**: `BeginSymbol -> ActionAt/Ack -> SealSymbol -> Finalize` 必须是单调状态机(一次最多一张未消费 ticket,ticket 保存完整 Action 语义快照;漏取、乱序、伪票、重复或逆序字节区间全部 hard-fail);receipt 的机器证据必须由 object 现场独立重算(每函数 Ack 根等于 emission ledger 根,函数 receipt 集合等于 object 外部 text symbol 集合);call ABI 先在 BodyIrAccessFact 保存 declared/inferred width 再投影;AArch64 adapter 的 F64 保持 Stack class(X16/X17 搬运 raw bits,D16/D17 运算);跨寄存器类 ABI 的 runtime oracle 不能用 identity 函数配 tail-branch(C 调用者可能直接读到未被 callee 改写的入口 D0 形成假绿,测试要先毒化 D0)。
- **已暴露的问题族必须进入 cheng-fusion 前置证明**: 人工复盘只能解释一次事故,不能防止同族复发;ABI/address-channel、reloc predictor/filler、clone/release 所有权、共享 bump SoA 扩容、artifact 触发清单、GEN2/GEN3 原始固定点都必须变成可执行规则(preflight 在重烤前 hard-fail)。内存模型必须从真实物理列、容量、元素宽度、扩容历史和 owner 生命周期推导,同时校验报告口径。
- **临时预检目录不等于 cheng-fusion 沉淀**: /private/tmp 中测试通过只能算预检快照;只有源码、测试、fixtures、文档和 registry/CLI 接线实际进入正式仓并从正式目录复跑 strict typecheck/门禁后才可称"已沉淀";同步前必须证明正式仓目标 tracked 文件仍等于预检基线;重计算必须在 exact-1GiB 私有 child 中执行,长生命周期 MCP 只校验完整 receipt。
- **列表字面量必须由调用候选的期望类型驱动**: `[e...]` 不能脱离上下文固定猜成 `T[]`(正式语义同时允许 `T[]` 与 `T[N]`,`[]` 没有独立元素类型);调用类型化必须先取得声明候选,再按每个候选的参数期望类型递归校验实参,最后要求唯一候选;静态参数门禁必须覆盖动态序列、固定数组、空列表、长度不符、异质元素和候选歧义。调用声明身份不能继续依赖另一套 raw-text `StaticExprType`。

## 2026-07-22 统一语义快照禁止版本碎片与假迁移

- 版本化语义快照表示"每次源码事件有唯一 sourceVersion 与 CID 绑定",不是给 schema/API 叠加 V1/V2/schema_vN;新系统必须直接替换原生产格式、生产入口和全部消费者;禁止保留旧新双轨、兼容别名或用改名冒充迁移完成;schema、cargo、validator、builder、LSP、backend receipt 必须作为一个原子消费闭包迁移并在同一当前树重编。并行代理共享 tracked 文件时,每次门禁前必须重算实际源码哈希;历史 PASS 哈希与当前文件不一致时立即作废证据。

## 2026-07-23 parser 身份与门禁族

- **多 lane 接管与 cold 后端侦察**: 多 lane 同改一个文件被覆盖后,等对方终态稳定(40+ 分钟无动静)再以「逐行确定性谓词」重导;失联 lane 的统一病形=consumer 先行落码、producer 未落;每个 lane 的验收必须含「烤 dispatch_min rc=0」,缺这条按未完成计。replace_all 批量插入必须立即清点宿主函数(replace_all 后不逐一审计宿主=未完成的编辑)。cold 后端 bug 侦察链=stripped 二进制用 cheng_line_map_v1 把 .Lcheng_cold_N 映射回函数名→lldb 断点+寄存器+otool 反汇编→最小复现+对照定谳;先复现再修,禁止业务层绕。cold std 闭包与普通模块的代码生成可不同(int64ToStr min 守卫在 std 闭包失效);验证 std 函数行为必须在真实 std 编译路径下探针。
- **显式 `--root` 必须支配相对输入**: `--root:B --in:src/main.cheng` 中相对输入唯一属于 B,禁止用 access/存在性优先选择 cwd;输入与输出是两套合同(相对 input/csg-in/provider 输入归显式 root,相对 out/report 归 invocation cwd),实现用两个具名函数禁复用 boolean 启发式;冻结快照验证不得靠 cd(snapshot) 掩盖解析错误,必须保留 cwd 同名碰撞并增加双根 mutation。
- **嵌套调用不能窃取外围 statement root**: 只有 call node 自身就是 statement root 时该 fact 才能携带 `valueExprRootNodeIndex`;把子调用沿 parent 链绑定到外围 root 会让 child call identity 与 root call identity 冲突,完全合法的 `Outer(Inner(x))` 在前端 hard-fail;statement root 绑定必须使用 `rootEventByNode[callNode]` 精确等值。
- **receipt 的 `valid` 布尔不是验证能力**: 普通布尔可复制、可篡改;line-map/DWARF/崩溃回源等消费者必须在同一调用边界重放 strict validation;攻击例必须覆盖篡改范围后同步伪造可见 CID/`valid=true`;文本 receipt 的 CID 字段必须逐字节限定 64 位小写十六进制且每个 schema header 恰好出现一次;原子 rename 是不可逆 commit 点,commit 后禁止再用普通 Err/false 报失败。
- **Fusion 源码合同绑定证明链,不绑定偶然分支极性**: 源码门把 `if x` 写死为唯一证明时,合法改成 `if !x` 的等价结构也会假红;每次升级合同都必须同步增加能穿透旧门的反例。
- **Symbol 身份文本只能保留生产者原值**: Function qualified name 已由 CompilerCSG `node.symbolText` 精确产出,Type/declaration 阶段只能验证,不能用 `module + 分隔符 + name` 重建并覆盖。
- **多 binding 不能复制 initializer 证明**: 一个 initializer root 可以拥有多个 PatternBinding,但只有一个 aggregate RHS 类型与 ownership;每个 binding 必须有独立 projection/extraction TypedNode 与结构 TypeId;上游缺 exact member identity 时先 hard-fail 非叶 Pattern;门禁要按 function/root 注册 expected declaration range。
- **receipt 自洽不等于 current-source**: 依赖闭包摘要必须由 producer 与 consumer 共用唯一算法重算,并与当前源码逐字节相等;内嵌 toolchain manifest 的哈希字段不能只验 64-hex,consumer 必须按唯一 schema 重建其精确字节再对拍。
- **wildcard 声明、冻结环境与 Fusion pin 必须精确**: `let _ = value` 是丢弃赋值不产生 declaration row(RHS 标 `AssignmentRhs`、declaration CSR=-1/0);declaration span 的 RHS 终点必须取语义 root 终点(建树后用 exact node end 固化);RHS 建树继续追加内部 declaration 时,回写外围 binding 的 span 必须使用 parse 前冻结的 `bindingDeclarationCount` 精确半开区间;冻结树 dry/full 必须清空继承环境并显式重建最小 env(外部 CHENG_ROOT 会让 parser 把活工作区当 shared root 形成两个同名 owner);Fusion 源码哈希属于冻结工具身份,修改 evidence/oracle/CLI 后 candidate builder 必须在复制前比较真实字节与 schema pin;调试收据删除行级 modulePath/functionName 后,消费者不能再从行文本重建 DWARF 身份(生产者必须一次生成按 sourceId 严格递增的 SoA)。
- **无源码坐标、缓存接口与诊断工具必须判别**: 无源码坐标不是通用可选值,只有 implicit Module 可以同时持有 nameSpan/nameToken/declarationSpan=-1 且必须同时证明 type/owner/function=-1,非 Module 立即 hard-fail;function fragment cache 必须把 `functionInterfaceCid` 同时写入 admission、key、row、cache CID 和持久化格式;诊断工具与生产编译器必须绑定同一源码/编译器哈希。
- **Type declaration 必须双向绑定结构根**: `declarationTypeSyntaxRootId` 只做范围校验不构成身份;每条 Type declaration 必须验证 root kind、producer source、declaration owner token,并建立 declaration↔RHS root 双射;`Symbol.typeId` 指向声明 RHS 不指向含自身 declSymbolId 的 Alias row(否则自哈希环);向已排序 Symbol 表追加未排序 Type Symbol 后禁止继续对混合数组二分。
- **全源码表达式域**: 全源码 exact expression 不能把"未落入函数行范围"直接当错误或顶层声明证明;合法顶层 const/var initializer 必须由 parser 的 exact statement-root、declaration CSR、声明 kind、lexical scope 和 `functionRow=-1` 联合证明;CompilerCSG 只消费该身份并把表达式划入可达函数、不可达函数、非函数声明三个互斥域,禁止按行号、文本或补集猜测。
- **杂项**: binding-block 成员行不带 const/var 头,旧逐行 assignment 扫描会把 parser 已产出的 initializer 再追加一次,必须由 exact BindingInitializer statement-root 阻断;Fmt 插值 lexing 在主 token 流完成后追加嵌套子流,token canonical identity 必须是 `(producerSourceId, sourceLocalRow, lexicalParentTokenId)`;克隆/快照 A/B 法在身份类闸上会自造假象(driver 的 workspaceRoot 由种子烘焙根决定,撞 AppendOwner 双根拒重守卫是设计行为),身份类闸只能用真树真根复现;闸名模糊时先做诊断 driver(把 error 扩成带运行时值);行扫 expr 行缺树节点 stamp 的修复=把树 root node/span/role 升级盖上(ParserValueExprStampConditionFact 模式);指针到 seq 的箭头与对象内联 seq 头赋值是两类不同落点(读侧重标 SEQ_*_REF,写侧在字段赋值函数与 walker 各自补 seq 终段)。

## 2026-07-24 身份与证明族

- **注解语义不能从源码行恢复**: 语义 admission 必须从 name token、target token 与递归 root/child CSR 解析注册名和参数,未知名字 hard-fail;按行查 `@name` 会让字符串参数里的 `@trusted_abi` 伪造能力;负例不能只删除注解,应把能力名放入另一个合法注解的字符串参数并证明仍被拒绝。
- **CSR 区间不是边身份**: `childStart/childCount` 只绑定连续区间,不能证明区间里的 target;可独立消费的行 CID 必须按 ordinal 哈希实际 child rows;结构 token 逐跳绑定 source 与 span;source corpus、producer declaration、parser receipt 是三种不同证据,只有当前 driver receipt 能把 required obligation 变成 witnessed;精确身份改名必须全键同步(callName 改 `chtInline_<fid>` 后,`(name,fid)` 复合键恒查空→闭包不下钻、本地 callee 全 unsupported 静默退化——改任一身份键格式前,先枚举所有以它为复合键的查表点)。
- **Combined 只保留唯一当前版本**: 禁止用 v2/v3/latest-final 等名字派生 combined lane、补丁或 manifest;恢复补丁必须原地升级唯一 canonical 目录和唯一 current manifest;旧候选只保留为显式 rejected/superseded 证据。
- **先数 delimiter,再判 parser residual**: `unterminated statement expression depth=N` 先对原始字节做 delimiter 对拍(两处 `Err[Compiler[...][]]` 实际用 `>` 关闭 `[`,净缺口正好为 2);只有 delimiter 匹配且符合 formal spec 的形才修 primary parser(`for item in` 后缩进续行的 range 是合法 continuation,不与源码 typo 混类)。
- **Receipt producer 不能冒充 current-source compiler**: 能生成 parser receipt 的测试产物只证明其自身 driverBytesSha256,不等于支持 system-link-exec 的 current-source compiler;塞进 *_COMPILER 环境变量前必须先独立执行一次真实编译命令;门禁回执必须分别记录 compiler、receipt producer 和被测 executable 的绝对路径、SHA-256 与角色,三者不可用同一个"driver"混写。
- **lane 连写期 cp 快照 bootstrap 必然撕裂(函数半在)**,build.sh 的 source before/after drift 硬拒是有效防线;种子重建必须等 bootstrap-only 静默信号;诊断编译器 provenance 丢失类问题,「括号包裹/let 中转」两个 $0.02 探针比静态追 28k 行 C 快一个数量级。

## 2026-07-25 身份与设备杂项

- **source snapshot 的文档身份不得取自文件系统**: `documentCid` 必须严格复用 `CompilerWorldDocumentCidInto`(规范化 package authority 与 canonical owned module path 做长度前缀 SHA-256);dev/inode/ctime、诊断路径、源码行和名字都不能进入文档身份;symlink 只用 realpath 投影;capture 前冻结 canonical package_id;Linux native 证据必须同时绑定 controller 物理 ISA、guest ISA 与 ELF ISA,并读取 guest /proc/cpuinfo hard-fail QEMU TCG。
- **设备验证杂项**: 鸿蒙 `hilog -r`=清空 buffer(不是 read),读取当前缓冲用 `hilog -x`,清空后按 pid grep 最稳;全局表「count 只增」族的回收键必须在每条失败路径就位(msquic datapath 表的 stop 键只在 SetupSession 才赋值——dial 失败时回收 no-op,槽位永久泄漏,16 次后表象=网络全断 ICMP 却通;审全局表先看「分配点/回收键/每条失败路径是否都能到达回收」三点,再看容量);EGL present 门卫必须看 surface 死活不能只看应用层开关(surfaceDestroyed 与渲染线程 mid-frame swap 是结构竞态,swap 失败按 eglGetError 分流:可恢复生命周期事件→跳帧,其余→abort)。

## 2026-07-26 ORC 与 seed 族

- **ORC 计数必须覆盖真实分配器**: `alloc==free && live不变` 只能证明进入 Cheng 内存注册表的对象平衡;托管结果若误走 raw calloc/mmap 且 flags=0 会完全绕过计数并以"平衡"假绿;托管 producer 的验收必须同时绑定 BodyIR owned 定义、后端该函数内 cheng_malloc 重定位、owned flag=1、精确 scope drop,以及 allocator/flag 两个负 mutation。
- **symlink seed 更新必须替换目录项**: 对 symlink 路径执行普通 cp 会跟随链接覆写外部 target;final closure 产物先在持久 evidence dir 完成 fixed-point/self-check/真实 compile/run,随后用目标目录内 `O_EXCL|O_NOFOLLOW` regular temp,复核旧 inode/readlink 未漂移后原子替换目录项并 fsync parent。

## 2026-07-27 账本与回执族

- **报告拼接必须先核 helper 的真实换行合同**: 不能根据 helper 名称或调用形态猜测边界;必须读取 writer 的精确实现,同时核对嵌入块前后两侧各自的尾/首 LF。
- **动态报告顺序必须由最终 canonical 事实生成**: 含动态 source/edge 行的报告不能用静态 key 常量;先严格读取并限界 N/E,再由唯一函数生成完整有序 key tuple、精确 count 和 `SHA256(u64be(len(UTF8(key))) || UTF8(key)...)`,缺失、额外、重复、换序全部拒绝;raw parser edge 只用于发现,Bind 后只用 canonical plan edge 的正式字段生成 manifest/CID。
- **native descriptor 必须绑定单一 workload**: current-driver 与 dry-compile 的 argv、环境变量和产物合同不同,descriptor 不能只接受两组 identity 的并集;Linux 正式 descriptor 只能声明 native delegated cgroup v2、Linux controller host 与 rootless OCI 全后代内存范围。
- **stage3 desymlink 必须按当前目录项重新证明**: 历史 desymlink 回执不能外推当前目录项;每次正式闭包前必须重新 lstat/readlink;`regalloc_preflight` 报 "EBNF parser map producer projection is not current"=spec/parser 漂移,唯一修法是 regen;regen 后剩余的 "zero production receipts" 是真实 witness 工作量,不得伪造 receipt;多会话并发下 frontier probe 返回 `entrySourceClosureTrusted=false` 时先跑 quiesce probe 确认静默窗口。
- **唯一 schema 的审计必须同步原子迁移**: producer/validator 迁入唯一嵌套表后,Fusion 审计必须只读取最新正式路径;旧扁平字段不能以兼容双读保留;门禁加入 legacy-path mutation。
- **冻结回执只约束其绑定的工具字节**: 任一 frozen/tools stable 回执只对其中逐字节绑定的工具闭包有效;同一热域重新写入后旧回执立即失效;stage23 coordinator 热写期间必须暂停 epoch 再生、stage3 烘焙、正式 snapshot/frontier 与全树 quiesce 结论。
- **bootstrap 签名优先进程内闭合**: bootstrap 复制并 patch 已签名 thin Mach-O 后,若仓内已有严格的 ad-hoc CodeDirectory SHA-256 生成与逐页校验,就应在进程内重算签名,彻底消除 system("codesign")/bare PATH/execvp 后代;进程内签名只接受已证明的 thin arm64、单一 ad-hoc SHA-256 布局;signer 禁止把整个 Mach-O 以 PROT_WRITE|MAP_SHARED 映射后原地改哈希表(内核会把代码页标成 wpmapped/tainted,后续执行触页时 cs_invalid_page 直接 SIGKILL;正式路径只读解析/散列代码页,仅以精确 pwrite 更新 CodeDirectory);"只允许 patch 页哈希不一致"不能证明 patch 内容正确——refresh 前必须从 canonical contract 生成整份 staged image SHA 并逐字节对拍。
- **可变 partial 文件永远不是恢复删除权威**: `O_CREAT|O_EXCL`、同 uid、regular、0600、固定名字只能证明当前目录项形态,不能证明 partial 字节由本事务创建;崩溃原子 authority 必须来自已完成、只读、fsync 且内容 CID 可独立重算的业务产物;mutation 不得先把 0600 改成 0444 再声称覆盖 partial 分支。
- **record field 类型必须与字段名同逻辑行**: 正式 fieldDecl 不允许把 fieldName: 与类型拆到下一逻辑行;新增 SoA 字段后必须先跑 fresh cold parse。
- **失败清理必须证明仍拥有目录项**: `O_EXCL` 创建成功不等于稍后仍拥有同名路径;失败清理必须持续持有父目录 FD 和创建文件 FD,只在 named 与 held 的 dev/ino/mode/nlink/uid/gid 全等时 unlink;成功写入也不能 close 后才首次按路径校验(关闭前必须从 held FD 复核 named 身份、size 和完整内容 hash)。
- **obligation 数量不等于独立 mutation 数量**: 多个 production obligation 复用同一 synthetic receipt、同一 token authority,再循环翻转相同字段,只能证明一个通用拒绝分支;parser forwarding 的正式门必须为每类 Token/Node/Stmt/Region/Decl/Pattern/Annotation/Scope/Type 建立真实正例与唯一 fixture bytes,分别攻击 cross-source、same-source wrong sibling、outside-parent、target CID、authority kind/role、span/child cardinality/order。
- **LSP cancelRequest 不能冒充 workspace build 版本**: `$/cancelRequest.params.id` 只标识协议 request id,不能解释为 sourceVersion;只有存在 exact `request-id → jobCid/sourceVersion` 映射时才能取消对应 ticket;未知或已完成 request id 不得改变 active job。
- **manual consume 不能复用 trusted ABI 布尔**: `@trusted_abi` 只能标出低层 ABI 边界,不能证明 managed owner 已被消费;正式 manual-consume 必须绑定 exact target/source formal 行,并携带线性 token;普通 managed 容器变长仍 hard-fail。manual-consume 的 post-call 定义不能占用 CallOp result(两个语义 owner 共用一行);BodyIR 必须用稀疏 sidecar 提供独立 definition row。
- **Canonical clone 必须闭合每个终止出口**: 只要 Build 边界生成独立 owner,成功 release 与 clone 之后的每个失败出口都必须释放同一物理资源集合(不能只释放 cargo 而遗漏 nested declaration table 的字符串列);统一 cleanup helper 固定释放顺序,成功 move 后只由 candidate release 执行一次;错误文本若来自待释放 owner,必须先生成真实 owned copy 再执行 cleanup;真正的 alloc/free/live 对拍必须来自可执行 smoke 的运行时计数,单一成功 smoke 或静态结构绿都不足以证明闭环。
- **exact schema 门禁不得先去重**: 对字段列表先做 dict.fromkeys/set 去重会让重复列假绿;exact schema 必须直接比较原始有序 tuple、总数和逐项唯一性;把 smoke 当文本读取并搜索关键字不算执行证据,门禁必须用 current-source production driver 在硬内存守卫下真实编译运行,driver 缺失就明确 RED。

## 2026-07-29 ownership 门禁族

- **ownership sidecar 必须被 canonical access decoder 消费**: shape/CID、codec roundtrip 和物理释放只证明 sidecar 自洽;若 `BodyIrAccessDecode` 不从 sidecar 生成 source consume 与 target post-call definition,下游仍是普通 CallOp;门禁必须攻击 use-def 结果(entry source 非 OwnMove、同 definition 二次 consume、post-call 前使用、CFG 合流歧义、删除/重复/交换/整表重哈希)。
- **take 出 managed SoA 后所有失败出口共用唯一 release**: 从 owner 字段把 managed SoA move 到局部并立即清空 owner 后,局部就是唯一物理 owner;后续任一验证失败都必须经过同一个显式 `release + poison` helper;门禁应枚举 take 之后的全部失败出口。
- **文本 mutation 不得冒充正式反事实**: 在内存里改 Cheng 源码后只跑 Python needle/正则 validator,即使显示 mutations_rejected=N 也没有证明生产 validator 拒绝坏事实;最小反证固定包含 exact validator 开头 return true、snapshot helper 开头 return true、failure cleanup 被短路,任一仍被接受整组作废;focused 门的负例会主动制造只读树/hardlink/symlink,EXIT 清理不能吞错;冻结 source snapshot 的 uid/gid 不能继承系统临时目录(staging 创建后先原地绑定调用者 euid/egid 再复制封存)。
- **focused PASS 与 production RED 必须用退出码隔离**: 同一个门禁打印 status=RED 后自然退出 0,会被只看进程码的上层聚合器判绿;production 默认入口遇到 authority 缺失必须非零退出。
- **preexisting pending 与本次 partial pending 必须分治**: 同名 preexisting pending 没有 provenance 必须 preserve + hard-fail(不能按 uid/mode/name 猜归属);本次创建且持续持有 FD 的 partial 有精确删除权威(核 held==named、nlink=1、mode、size、bytes 后 unlink+fsync);门禁必须注入"首段写成功、下一次 write 失败"。
- **definition 与物理释放门禁**: BodyIR 物理 row 顺序不是 CFG dominance,必须用 canonical reachability/dominance 事实;非空 managed provider 禁止 flags=0 或零 ledger 假释放;静态或 focused NOT_RUN 不得返回生产绿。

## 2026-07-31 身份与泛型族

- **快照行号不能进入跨快照语义 CID**: `type_row`/`object_row`/`declaration_origin_row` 只是一次快照内精确的 SoA 投影;声明 owner 必须统一为 `H(document_cid, token_byte_offset, declaration_kind)`;focused gate 只证明同一 Symbols 表内一致不算闭环,必须覆盖非恒等 row 映射、无关声明插入、子集导出、writer/read/rewrite 固定点和 owner CID mutation。
- **PLAIN 不等于没有精确身份**: `COLD_MANAGED_STORAGE_PLAIN` 只证明不需要 ORC retain/release/drop,不能据此删除 value-def;具有精确 TypeId 的 nominal 参数仍必须建立不可变 PARAM 定义;回归必须覆盖"外层函数不是 @borrows,其 PLAIN 参数传给内层 @borrow_result"的真实嵌套路径。
- **Mach-O Code Signature 长度必须区分载荷与对齐区**: `LC_CODE_SIGNATURE.datasize` 可以大于 `CS_SuperBlob.length`(差值是对齐填充);精确镜像校验应要求 `12 <= SuperBlob.length <= datasize`、所有尾部填充字节为零;直接要求相等会拒绝 codesign 认可的合法链接器签名,放宽为忽略尾部会接受隐蔽载荷。
- **canonical API 与托管 proof helper 必须保持真实合同**: 名为 FromCanonicalLines 的入口不能先调用会规范化输入的普通 builder(canonical 入口必须在任何变换前冻结原始字节并逐字节拒绝差异);接收含 str[] 等托管字段的 proof 只读 helper 必须显式 @borrows(漏标的内层 helper 仍会把 proof 当拥有值释放,scope 退出触发 registry_miss)。
- **kind 与 size 不能使用两个泛型解析上下文**: scoped kind 后再调用 unscoped size 是第二次语义解析(同文 Result[T] 会被错误物化为 closed application);kind、size、layout、formal TypeId 和 return TypeId 必须消费同一个冻结 generic binder;回归覆盖同一文本的 open/closed application、缺失本地 application row、伪造 binder/origin/template/closed row。
- **泛型应用必须先建立结构身份再物化布局**: 泛型应用的唯一身份是 `Apply(template declaration owner CID, ordered argument TypeNode CIDs)`;ObjectDef 只能保存 TypeNode row 不能再复制 CID;函数 generic binder 的本地投影是 declaration-origin row 不是 FnDef row;同一 owner CID 的 TypeDef/ObjectDef alias 必须共用 canonical TypeId,冲突 hard-fail。
- **陈旧编译器不能定谳当前源码语义**: 动态首错若来自早于当前 parser/cold source 的 stage3,只能证明该旧二进制不支持当前源码;exact identity 问题必须先用 current-source cold 编译器运行最小合法 fixture;所有回执同时记录 compiler hash 与 source closure。
- **Merkle 增量发布只认最终根可达集合**: 多个 insert/replace/delete 顺序 path-copy 时,每轮 rebuilt nodes 的并集包含中间 root 和失效祖先;发布前必须从最终 DAG root 沿 overlay child CID 遍历,只写最终可达的新节点;首次 Store 发布也必须有正式纯 Cheng API,测试不得手工复制写入顺序。

## 2026-08-01 CSG authority 族(合并)

- **内容承诺不等于信任来源**: CID 链只能证明内容自洽;由待验证输入自身提供的 expected CID 仍是自证;局部 membership proof 只证明返回项存在,不证明结果集合完整;未经外部 trust root 认证的内容摘要必须显式命名为 `claimed`;生产读取函数不得接收调用方提供的 expected CID;content-addressed manifest 不得承诺一个反过来包含自身 manifest CID 的 authority CID。
- **producer 与 validator 必须共享同一 generic scope**: validator 不能再调用 unscoped 类型解析器重建期望值;scope 必须由 canonical ObjectDef row 显式传递到每个叶 projection 检查。
- **发布回执绑定本代,不绑定瞬时 latest**: 单调 generation 系统中,成功提交的稳定事实是"本代 immutable record 与 fence 已一致落盘";回执验证必须绑定本代 fence,latest 只用于开始下一次 CAS。
- **停用生产入口必须覆盖源码与实际可执行副本**: 删除源码分支不等于旧能力已不可达;仓内 active dist、frozen dist 或发布副本仍可能继续执行旧实现;缺席门必须同时检查源入口、writer 文件和每个实际运行副本。
- **单条内容哈希不能冒充集合根**: JSONL 全文本 SHA-256 不等于带 profile、fact identity 与 DAG 语义的 facts_root;sidecar、report 和测试 oracle 也必须调用唯一纯 Cheng Patricia root。
- **证据路径合同必须约束环境覆盖后的物理路径**: 只检查脚本没有硬编码 /tmp 是假安全,调用者可通过环境变量把同一门重定向到易失路径;创建 evidence 目录前必须 canonicalize root 并拒绝系统临时目录;mutation 要改 case 分支本身。
- **唯一实现要检查所有语言和所有可达级别**: "生产当前没导入"不能证明第二实现已消失;CSGC/root/proof 的唯一物理所有者固定为 cheng/core/csg_core,其它语言只允许显式桥接;适配器不能只在名字上声称委托,必须检查实际 import 和 call,同时拒绝足以重建 wire 的低级字节 API;唯一 authority 门不能禁止合法消费者携带回执字段(缺席门应约束退役模块/计算函数/codec/旧入口);删除第二权威要区分数据与 codec(fixture 是测试输入不因含 TSV 文本就自动成为第二实现;静态扫描 helper 已区分零命中和扫描错误时,外围不得再加 `|| true`)。
- **对齐前必须分别证明乘法与加法**: `align_i32(product, 8)` 的安全前置是 `product <= INT32_MAX - 7`;先用除法证明乘法可表示,物化唯一 product,再依赖短路求值;静态门必须有最后安全值、首个溢出值和每个证明步骤的可编译语义变异。
- **纯源码 owner 不等于根入口执行 authority**: CLI 的函数调用全部指向纯 Cheng 只能证明源码 owner 唯一;wrapper 可替换 compiler、PATH 工具或预置 cache binary;缓存 stamp 若只含调用者可重算的输入摘要且不核对 output digest,选定 cache 目录的环境变量就是直接 executable injection;shell wrapper 中未固定绝对路径的 bash/find/xargs/shasum/awk 也属于环境旁路;current-source compiler receipt 必须来自外部受守卫构建;receipt 自哈希、只读权限、固定路径和 producer 二进制哈希都不认证"谁运行了 producer"(门禁必须重放其原始 evidence closure 或验证外部 trust anchor 签名,并用全量重算伪造负例锁住)。
- **首次 store 初始化不能跳过 transaction receipt**: genesis 只建立可寻址闭包,不是业务提交;首次编译必须排他发布 genesis,再通过同一 request/plan/apply/receipt 路径产生 generation 1;禁止为"首轮特殊情况"另造无回执入口。
- **聚合缺席门必须双重绑定规则与扫描输入**: absence gate 文件进入 tool manifest 并固定哈希,其实际读取的源码进入 source manifest 并拒绝被扫描树内 symlink;子门成功只接受一条完整 canonical 回执、零 stderr 和零返回码;静态回执必须显式携带 `STATIC_PASS` 与 `dynamic_completion_credit=0`。
- **relation sidecar 只记录变化,不拥有第二 root**: Assert/Retract 日志必须携带 canonical schema/binding、连续 ordinal 和唯一 CSG fact identity;replay 的最终集合必须经唯一 Patricia physical order/root API;大日志解析保留原文加行偏移,同 key reassert 复用槽位(避免内存随历史事件增长);连续 ordinal 不能单独证明日志未被整行截断——canonical sidecar header 必须承诺 event_count,decoder 用实际记录数精确对拍。
- **静态模式不能先分配动态证据目录**: `STATIC_ONLY`/lint 模式必须在创建 dynamic work directory 之前退出;`rg -c ... || true` 会把扫描错误伪装成零命中。
- **协议身份升级禁止按字符串替换**: `standard=csg_core::v1` 不代表 facts schema 或 base profile 也要版本化;manifest 若声明 profiles 就必须同时声明可独立重算的 `profile_set_cid`。
- **producer 接 canonical report 不等于 dialect 已准入**: 每个真实 producer 的输出 kind 必须在有限 profile registry、root binding 与精确字段合同三处闭合;profile 名称不能由实现语言或目录名推导;新 profile 必须原子更新 manifest CID 与跨语言只读 allowlist。
- **rename 原子不等于掉电持久**: 文件/目录内容 fsync 后执行原子 rename 仍不够;成功后必须 fsync 共同父目录。
- **生成代码的准入不能依赖单行排版**: JavaScript 生成器可在数组参数中合法换行,单行 grep 会误报缺失;必须用有固定身份的 AST parser 并用多行正例锁住;active/frozen 字节一致只证明分发复制正确,不证明当前 source 已经构建。
- **parser 严格性必须做函数级 AST 验证**: 全文件 substring 能被其它函数、注释或死代码满足;必须用绑定身份的 parser 找到唯一命名函数,检查真实调用节点、强制严格读取是第一条语句,并对前置 return 与旧读取分支做负断言;source、active、frozen 三者各自验证。
- **持久 authority 路径不得信任进程环境**: 用户级生产 store 只能由内核有效 UID、OS account database 与固定平台后缀派生(HOME/XDG/cwd/用户名都是可变输入);路径认证逐段 no-follow 持有 descriptor,核验 owner/mode/device/inode,把 mkdir、descriptor chmod、child fsync、parent fsync 和重开身份对拍作为一个完整提交合同。
- **authority verifier 必须单一复用**: 下游门复制 KV 字段/self-hash 校验会复制同一个可伪造边界;必须调用同一个能重放 raw evidence 或验签的 verifier;当前无法认证时就明确 RED。
- **增量 transition 必须允许 profile 集合变化**: profile set 由 facts 推导不是仓库常量;transition 协议要同时证明 before/after binding,不能用"两侧 profile 必须相同"简化。
- **静态 scanner mutation 不能替代动态 authority**: 修掉 `|| true` 并覆盖 rc>1 是必要条件;NON_PRODUCTION_LINT 门不得计入动态完成度。
- **多产物发布必须只有一个可观察提交点**: active/frozen 等同代产物不能靠两个顺序 rename 声称原子;用不可变 generation 加单一 current pointer,或证明全部 reader 共享同一 publication fence。
- **内容寻址声明必须由实际持久对象回读证明**: manifest 中的 object CID 只是声明;生产 HEAD 前必须从固定 store 对象路径回读真实 bytes 重算 object CID,同时验证 directory 与语义 root;逻辑 facts root、CSGC directory CID、完整 object CID 是三个不同层级。
- **平台签名必须验证身份并绑定源码闭包**: ad-hoc/code-directory 自签只能校验 bytes,没有发布者身份;production compiler 签名合同必须同时绑定固定签名者 requirement、source closure CID 与 compiler bytes。
- **有界读取必须覆盖索引元数据**: 限制每次读取窗口只约束单次复制,不约束 section/index 数组;内存合同必须同时约束窗口、目录项数量、整数范围和累计分配;mmap reader 的所有临时 Bytes 仍遵守普通 owned buffer 规则。
- **Shell 绝对路径不是独立进程证明**: Bash 可定义带 `/` 的函数名;权限 verifier 要由清除 BASH_ENV/ENV 的 privileged 子 Bash 执行,并以跨进程 trace/exec 证明真实外部二进制恰好运行一次。
- **标准入口不能同时把 relfacts 写成 CSGC 和 JSONL**: 主 facts/proof 使用 CSGC,`csg_relfacts::v1` 使用 canonical JSONL delta;物理格式总表、CLI、replay 合同与测试必须一致;架构从"CLI unavailable"变成"纯 Cheng CLI required"时必须同步修改消费该结论的静态门。
- **动态 authority 必须先于证据分配**: 唯一 verifier 应在 compiler、guard、preflight、report、executable 乃至动态 evidence allocation 之前直接 hard-fail;失败目录可能被误读为已启动;Store 行为回执必须同时输出并对拍 object CID、directory CID 与 facts root。
- **权限收紧必须服从内核操作前置条件**: fs-verity 要求 O_RDONLY fd 但 enable 时调用者仍须拥有 inode 写权限,mode drop 必须位于 enable/首次 measure 之后;fs-verity 的 EEXIST 只是"已启用"状态;EACCES 不得解释为只读成功;静态 ABI scanner 不能把自身禁止规则字符串纳入扫描域;增量算法不能只用"结果 root 等于全量 root"验收(必须证明公开入口的整个可达调用图不含 full rebuild,unchanged 必须零重建);资源拥有者返回结构化错误时也不能提前逃逸(先只在成功分支读取 receipt,再无条件 close,close 失败优先于原错误)。
- **语义 producer 与物理 CSG 权威必须拆开证明**: TypeScript/React extractor 可以生产领域语义 facts,但不能因此拥有 CSGC 编码、解析、root 或 admission 权威;生产编排必须显式调用 canonical 纯 Cheng tools/csg;"间接依赖的 wrapper 当前也会调用 Cheng"不能替代入口级权威绑定。唯一物理实现的证据至少包括:源码与已打包资产中第二 codec 缺席、strict source admission、重复 pack 字节一致、重复 CSGC admission,以及唯一 facts_root、profile set CID 和 fact count;字符串 marker 可藏在死代码,独立门必须解析调用 AST;AST 静态可达仍不替代 current-source 动态回执。
- **facts_root 的 profile 集合不可压成单 profile**: 同一 canonical facts 的 facts_root 必须绑定唯一、UTF-8 字节序升序、无重复的完整 profile 集合,并原样贯穿 builder、manifest、transaction、proof 与 snapshot cargo;manifest 必须显式承载完整集合并拒绝缺失、重复、乱序和篡改;同一 dialect 的历史 fact kind 前缀必须显式归一到同一个 canonical profile(`csg.web.*` 与 `csg.js.*` 都属于 `csg_dialect::web`,无映射的命名空间 hard-fail);profile_set_cid 是可独立引用的身份,域负载必须以长度前缀绑定 standard、schema namespace 和 canonical profile 集合。
- **编译器所有权修复三则(2026-08-01)**: registry_miss 类 bug 一律先做 20 行最小复现再谈修复(平铺 vs 嵌套 vs 调用 vs 直读变体矩阵切出唯一必要组合;lldb 只用于确认 glue 无罪);修受管值拷贝优先「镜像同族既有协议」(str 元素读早就是 borrow,record 元素读漏接→补同款 wash;每条错路都有现成合法先例可抄);borrow_result 值只能入 @borrows 形参,retain 发射必须避开宿主实参区。
- **复核线三则(2026-08-01)**: /tmp 不是工作区,验证资产放仓外持久目录(仓内只留结论与探针源码);性能扫描前先审被测路径已知复杂度缺陷;门红先分「实现回归」与「合同漂移」。

## 2026-08-02 账本与并发族

- **mutation 工作副本不得与工作树共享 inode**: 负例 fixture 禁止用 hardlink 复制待变异源码;必须做真实字节复制并在变异前断言 source/copy 的 dev+inode 不同、source nlink=1、source SHA-256 前后不变。
- **package launcher 不能按名称检查后再执行**: launcher 不得硬编码仓库路径或用户 HOME(仓库/package 由 launcher 自身 canonical path 推导,HOME 由有效 UID 对应可信账户数据库派生);`[ -f ] && [ ! -L ]` 后再执行存在 TOCTOU,必须先打开 gate FD 绑定 dev/inode/mode/nlink/size/mtime/ctime 与 bytes hash 再从该 held FD 执行;launcher 自身在执行前无法靠自身代码建立外部信任,必须报告 `launcher_exec_identity=HARD_RED`;跨 exec 的完整 identity 必须由 launcher 传入 clean environment,gate 逐项对拍后再做自己的前后 fence;authority 入口改名时必须原子迁移其父级完整 contract。
- **专用精确账本不能扩大通用 allocator 常驻面**: 为 CSG owner ledger 证明控制面字节,不能把通用内存注册表改成超大固定 BSS 或固定容量 hard-fail;正确边界是按 owner begin 懒建 runtime-owned mmap/slab 控制面;手工相加若干全局 sizeof 不能标记 exact;ownership transfer 不能只接收 caller 提供的 generation,必须验证目标 owner capability 并原子迁移两侧 live/count/backing/event chain。
- **禁止第二物理 authority 不能误伤传输哈希**: TS 本地计算 facts_root/fact_hash/subgraph/proof 属于第二语义 authority,必须禁止;对纯 Cheng 已写文件做流式 SHA-256 并与 Cheng receipt 对拍属于传输完整性,必须保留;静态门不能笼统禁止 createHash,应锁定输入来源、函数作用域、摘要用途和回执绑定。
- **精确账本必须先验证身份再解引用**: owner active 时,非 nil payload、retain/release/free 输入都不可信;必须先在专用锁内通过 O(1) live index 验证 owner slot、owner generation、record generation 与执行线程,再读取 header;active owner 快速判定应放在 ledger 自有 mmap 控制面并原子发布。
- **FFI 借用必须是可转移线性能力**: 线程 ID、pthread_t 和 TID 都可能复用,不能充当借用所有者身份;跨线程释放必须只验证不可伪造的 `(handle generation, borrow generation)`;同一 payload 同时只能存在一个 live handle(否则经另一个 handle retire/free 会制造 UAF);双 handle 操作必须在同一锁内先完成两侧全部 preflight 再一次提交;FFI 输出指针也是 ABI 的写入集合(按实际宽度对齐且两两不重叠,所有验证完成前先清零输出);锁内 corruption/fail-stop 禁止进入 allocator、managed string 或 stdio(只能 raw write 和立即进程退出)。
- **空锁和轮询锁不能产生并发证明**: no-libc 的空 lock/unlock 即使单线程 smoke 全过也不提供并发互斥证据;Linux 统一使用 `0=unlocked, 1=locked, 2=contended` 的 futex 事件锁;固定地址 runtime state 的初始化也是发布事务(先写 identity,再原子发布 ready 并 wake);非递归锁切换前必须先做 `lock-held -> may-lock` 调用图审计并拆出 `*_locked` 内核(直接替换会把旧递归路径变成死锁);多锁路径必须固定唯一顺序并用精确 allowlist 锁住。
- **0/1/2 futex 解锁必须容纳合法的 1→2 竞争**: 解锁线程读到 1 后,等待线程可以合法地把状态提升为 2;必须以重新读取的 releaseState 重试 CAS;非递归 provider 不能只有 lock/unlock,锁内内核需要不改变锁状态的 `assert_owner`。
- **不可逆提交后的回执禁止宽参数写集合**: close 先退役 owner 再写回执时,数十个独立输出指针即使全部非 nil 也可能互相别名;必须使用单一固定布局 wire,并在退役前验证 wire 与 error 区域的对齐、范围溢出和不重叠;回执摘要必须从实际 wire 字段计算,不能再从 owner slot 独立取一遍同名状态。

## 2026-08-03 所有权唯一性不得先放宽再补授权

- 同一语义来源允许模板与多次物化 replay 共存时,必须先分别建模 `semantic_origin`、`template_identity`、`replay_identity` 和 `physical_definition`,再由 sealed、可独立重算的 sidecar 授权每个重复定义;四层身份未闭合前,原有 OwnMove 唯一性必须保持 hard-fail。修改 provenance/ownership 唯一性前,静态审计必须先回答"哪些重复合法、由谁授权、如何防伪、如何序列化和跨后端消费",并先建立负例;先删除全局唯一性检查、再在集成中发现需要授权接口,属于架构审计失败。
- 授权不只证明"对象 A 是对象 B 的等价克隆",还必须证明"克隆被放在获准的控制流位置并按获准顺序执行"(relation proof 与 placement proof 缺一不可);cleanup authority 的逻辑 unit 不等于单行事实(return snapshot 与 guard snapshot 可同时存在;必须用精确 CSR/row domain 表示完整集合和顺序);unit 的语义范围与物理 op/call/term 范围不能自动建立等价(必须显式保存 `unit -> effect` CSR、semantic row、physical domain/row 和 effect role);cleanup effect role 固定为 Definition/Consume/Clear/Transition/Execute/Predicate 六类;cleanup 生成的新增 block/term 不全属于 unit(op-site split 的 source bridge 与 continuation 是 owner structural anchor;为追求"全量覆盖"把用户 continuation 塞进 cleanup payload 会制造错误 authority)。
- portable authority preimage 只能包含语义字节和精确 CID/row(target path、linker symbol、data label、relocation offset、LocalSlot 可变 ownership 不得进入 source-control root;裸 TypeId 必须同时绑定 TypeArena artifact CID);Merkle/root 只能证明给定字节的一致性,不能证明这些字节获准出现在当前控制流位置(schema 静态冻结,物理范围是已预知接口的晚绑定值;做到一半才新增接口按威胁模型遗漏处理);Cheng 的顶层符号可见性不能推出导出聚合字段私有(payload 类型小写+导出 handle 不构成 opaque capability;生产授权必须命中模块私有 live registry,通过 `(int32 owner_id, int32 generation)` 的原子 issue/claim/release 状态流转);snapshot 自洽不等于与当前 CompilerCSG 配对(外部 lowering authority 必须同时绑定 facts/HEAD/manifest/receipt 与当前 graphCid,重复 claim、stale generation 和 release 后复用必须作为固定负例);authority 实现动手前必须先冻结完整状态机和接口表;"读取当前外部状态"和"提交内部授权状态"必须定义唯一并发线性化点(先取得唯一 PlanOwned lease,再读取当前 HEAD,任何漂移都消费 lease 并 hard-fail)。

## 2026-08-04 CFG 所有权必须来自不可变定义图

- 托管存储分类必须从 exact TypeId 对应的 canonical ObjectDef 递归计算,不能用类型文本反查布局;历史 value-def 只能用自身不可变的 TypeId、place、origin、ownership 和 CFG 前驱证明,不能与已推进到后续定义的 LocalSlot 当前头比较;同一 owner root 的两条唯一借用边在 CFG/循环合流后仍是唯一借用(借用合流不产生 consume);`BODY_OP_NOP` 的不同语义必须由 place kind 和完整 tuple 区分;`while true` 必须生成无条件 CFG 边(保留永不可能的 false 边会伪造前驱);分支 value-def 的身份和存活必须由不可变 op 行与数据流证明,禁止线性扫描选择"最新版本";借用字符串写入返回聚合字段前必须显式克隆(编译器还需把"借用经聚合字段逃逸"纳入静态拒绝)。
- **所有权接口必须先冻结完整交互矩阵**: `Owned/Borrowed/Move/Share` 开始实现前必须先穷举"类型组合 × 存储位置 × 调用/容器/返回/drop × CFG"的授权矩阵,并把每条边固定到 TypedExpr、CallOp、BodyIR value-def 和物理 lowering;做到一半才发现缺边,按前期审计遗漏处理。用户已明确授权 OpenSpec apply 并要求自主推进后,后续同一目标内的可逆生产实现不得再停下来重复询问;自主推进不降低证据标准。
- 容器写入不得把 borrowed 值自动变成 shared copy:源码没有 `share` 就必须 hard-fail;Owned/Plain 值写入 `str[]` 时必须原样转移完整 24 字节 data/len/store_id/flags,禁止清零所有权字段后把泄漏伪装成借用元素。

## 2026-08-11 live registry payload 不得整体复制

- live registry 的 payload 不得通过公开 Projection 整体复制出来;proof、Replay nodes、物理 CSGC 和 artifact bytes 必须留在唯一 owner 内,跨模块只传 compact summary、opaque claimed handle 与 binding;给 borrowed payload 补全量 clone 虽可绕过所有权首红,却会制造第二 authority 并破坏 1 GiB 峰值,完成信用固定为零。

## 2026-08-14 driver 构建战役(合并 rounds,只留定谳结论)

### str[] 元素读取 take-bug 案卷(规范定谳)

- **症状链**: 生成 driver dry-compile 必报 closure source path invalid index=0;探针钉死=收集器 ordered.len 正确但 14 个元素全是空串(seen 正确);反汇编证据=let 读取 seq[i] 是干净拷贝,紧随其后的第二个 op 把 24 字节零槽存回 elements[idx]——let 绑定按 MOVE 所有权对 seq 元素发清源 store。str[] 触发、i32[] 不触发=managed-only move-out bug。
- **根因**: let 绑定借来的 field/seq 元素时,bind 路径先试 field-take/seq-element-take——对本地可变 seq 的共享借用投影也升级为 unique 并成功 take,元素被清零。
- **规范裁决(formal-spec 0.2/0.2.1)**: ident/field/index 属 Borrowed;「let/var 绑定若 RHS 为借用视图,新变量标记为借用(同作用域 reborrow)」;take 只属于 var(copy-out 半边)→ hunk1(take gate 到 is_var)是唯一正解。hunk2(let 转 owned retain copy)违反 0.2 且破坏多消费,已弃。
- **hunk1 的下游效应是正确编译器行为**: 借来的元素读取流进非 var 非 @borrows 形参=非法源码,编译期拒绝是对的;修源(share()/CloneStr 或 callee 加 @borrows)属业务侧源改。
- **@borrows 摘要机制定谳**: result_ownership_summary 只由 @borrow_result 推导(cheng_cold.c,有=借用/无=Owned),与 @borrows 完全解耦;CloneStr 契约被 gate 硬锁(强制 @borrows、禁止 @borrow_result)——@borrows fn 的 owned 返回是合法形态。share(borrowed) 是规范违法的,一律 strings.CloneStr。
- **站点清册法**: hunk1 后逐站浮现的规范违法用 build 诊断逐站判型清空(src/core 剩余约 68 站分 P1 helper 加 @borrows / P2 调用点 CloneStr / P3 逐 callee 验证);web_runtime/lsp_server/mobile_shell 的 add 站多数是 i32/FixedBytes32(按值非违法),不做盲批量。

### liveness/plan 边/词法器三根因

- **liveness 失败函数族**: var 元素 take 在循环体内消费 seq 当前定义但未在循环内重发布新定义,回边路径携带已消费定义→点活跃性 join 出混合态→容忍路径按 not-live 处理→下游在 driver 编译上下文错乱。点名=插入排序 swap 家族(Backend2SortStrings/CalleeAbiViews/phase 报告排序/provider 集合);swap 语义定谳=let tmp = out[j-1](借用)+后续覆写=悬垂借用,改 strings.CloneStr 即从失败名单消失。修法方向=take 必须像 add/field-store 一样发布 seq 的新当前定义。
- **plan 边丢失**: rebuild 边时未设置精确 origin 三元组(ownerProducerSourceIndex/importDeclarationSourceLocalRow/importItemSourceLocalRow),struct 零值默认 0→去重比较 0==0 全命中→除第一条外全被当重复丢弃。教训:**重建结构时零值字段会穿过 panic 守卫,去重键必须逐字段精确**。
- **词法器 O(N²)**: ParserValueExprAppendToken 每 token 调 SourceText=整份源码逐字节拷贝,N token × O(N)=O(N²)(x509.cheng 切片 lex >120s→2s,60x);修=纯长度边界检查点改用零拷贝 len 视图。
- **round5b 里程碑(全链 GREEN 的修复清单)**: ① Mach-O 0x2000 veneer 双链;② 蹦床 main BL 重定位;③ let 元素读取 take-gate;④ 规范违法源站 CloneStr/@borrows;⑤ plan 边重建 origin 三元组;⑥ 词法器 per-token 全源拷贝。
- **旧种子误判闭环**: 同一工作树新烤 direct 在相同夹具上 3.055s 完成、峰值约 249MiB,旧 10GiB 现象是陈旧/错误生成代码,不是当前算法;归因必须同时比较 compiler/source/report hash。在 lldb 下运行大编译会绕开/延迟内部 RSS 守卫,不得把 debugger 下的内部限值当硬证据。zc_enumerate 的 RSS 上限是固定发布合同 1073741824,不能按闭包行数放大。Bash 3.2 在 set -u 下展开空数组会报未绑定变量,先按数组长度分支。
- **相位实测(round6/7)**: 全量 emit:obj 109.3s = parse 76.8s + codegen 31.2s + emit 1.2s;lowering 并行 requested=14 active=0 未生效;codegen 并行实际未生效且串行 31.2s 远快于并行时代 214s(14 线程共享 2GB 工作集 L3 抖动使并行倒挂,串行是当前更优形态);import-body 并行池机器全写完但 num_import_jobs=1(worker 需隔离 snapshot+确定性 publication,不是一行翻转)。
- **T1 系(codegen 工作集)**: T1-1 冷 codegen scratch arena pool(每函数 mmap/munmap 一对→每线程缓存 1 个回收 arena;产物逐字节相同,~4%);T1-3 序列路径每函数释放冻结原体 op/slot/call_arg slabs 只留 clone(对象级字节证明,累计 5.2%)。对象级逐字节相同是"无语义漂移"的直接证据,driver sha 变化=闭包源漂移。

### 跨平台/Linux 族

- **'silent 255 startup crash' 叙事反转**: ledger x86_64 exe 是 musl DYNAMIC(PT_INTERP 指向 musl loader,VM 里没有→exec ENOENT),之前的 255 是 sloppy docker 链的假信号;hello 是内链 static 所以一直跑。教训:**静默启动失败先查 PT_INTERP/loader,再查代码**。
- **ORC 双 drop 案(定案)**: .cheng 运行时正确(每次分配 insert、每次释放 remove);bug 在 parser 层 drop 插入(复合局部/Err 返回链的托管字段被插入两条 drop)——同属 lane consume-edge 机制域;最终定案=FFI 所有权注解错配(os.cheng 四个 @importc 声明 @borrows 而 @exportc bridge 按 by-value 拥有并 drop),修=bridge 同加 @borrows,回归 fixture 双平台绿,xproc 四输出与 Darwin 金样逐字节相同(跨进程逐字节门达成)。方法论:用地址复用+insert/remove 全记录序列,直接区分「未插入」vs「双释放」,比单点断言强得多;插桩必须全回滚(0 残留)。Darwin 同样失败(此前「Darwin 过」是假象——fixture 从未跑过 Err-drop 路径):**"平台 A 过平台 B 败"先查两平台是否真的跑过同一分支**。
- **errno 桥(定案)**: linux provider 的 __errno_location 每次调用返回新清零 cell 的地址(且 --allow-multiple-definition 下压过 musl 真 __errno_location)→ Linux 上 errno 恒 0。修=双 provider 移除 __errno_location/___error 导出+新增 cheng_linux_errno_cell_location(MAP_FIXED_NOREPLACE 稳定 cell)+双 host_syscall_tail 失败路径存 -errno+bridge 优先 cell。教训:**x86_64 syscall 会写 RFLAGS 进 r11——syscall 后不得用 r11 作为保留值(两次踩坑)**。
- **a64 O_* 标志**: x86 O_NOFOLLOW=0x20000 在 aarch64 是 O_LARGEFILE,O_DIRECTORY=0x10000 是 O_DIRECT→目录 open EINVAL;修=uname 平台分支。教训:**平台常量核对必须查目标内核头(arch/arm64 fcntl.h),不能按 x86 语义假设**。
- **Darwin atomic 回归=改错函数**: 把 AF_INET6 30→10 改在 cold_write_darwin_aarch64_syscall_provider_object(注释误写 on Linux)→Darwin 上 cheng_host_is_darwin() 恒 false→丢 O_CREAT。教训:**改 provider 常量前必须确认所在函数(emit 注释会骗人);平台判定常量是敏感资产,改动要字节级回归验证**。代理字节级 diff(143 处差异唯一功能性差异=2 字节)是铁证手法。
- **Linux x86_64 driver 交叉构建打通(7 关)**: TEXT_SET_INSERT x64 移植;fchmod provider 双架构;fsverity 裸指针 store→逐字节迁移;export cap 256→1024;musl 链接器需 /opt/homebrew/bin 在 PATH;system-link fallback 成功后清零 stats.unresolved_symbol_count;安装门接受 external 模式+cold-route 作为 cross-host 首次引导。aarch64 前沿:target BodyIR capability rejected op=kind 63(x64 后端缺精确物理实现)=零-C 前沿。
- **CI gate 基线**: 旧 stage3 全量 19 pass/19 fail(失败集中旧 stage3 已知缺口+lane WIP);bootstrap-bridge 单跑被 preflight rejected(重烤需要正式 authority 契约);端局=先让 lane 收敛+新 stage3 链固定点,再以新 stage3 重跑。
- **held-exec 集成(round16)**: launcher 15 文件集成;production gate 按设计 fail-closed(Darwin 拒产 exe,HARD_RED:provider slot 空);driver 的 production_launcher admission 不是构建期静态链接,而是每次编译从当前树源码解析→集成后所有 driver 行为统一;Darwin 上 fixture 合法性不能用 driver 侧验证,只能靠 C 侧 dump 或快照对比。
- **colima VM 物流**: 本机双架构 VM(chengarm64/chengx64);scratch 镜像无 sh,docker run 直接 exec exe,每次 run 是新容器 /work 不跨 run 持久;VM 内 DNS 断无法 pull;fixture caseName 合法集=canonical/noncanonical/leadingzero/extrafield/unordered/duplicate/gap。

### R4 运行时内存损坏的定位方法 + 指针存储宽度铁律

- 随机 SIGSEGV/SIGTRAP(allocator 损坏)→先用 guard malloc 抓第一个真实越界(freelist 被坏 free 污染会掩盖真现场),再反汇编对应 helper 核对每次 store 的字节宽度。本案真凶=char 经 raw ptr 解引用赋值走了 PTR_STORE_I64(8B 存储,比语义宽 7 字节)。
- 铁律:对无元素类型的裸 ptr 解引用赋值,值类型宽度不决定存储宽度,必须显式窄化指针类型(UInt8Ptr+uint8(...))。
- 消费语义:`Libp2pMoqSegmentStreamClientOpen` 的 conn 是 by-value 消耗形参,调用方想保留错误路径的 ConnClose 必须传 `qconn.ConnDup(conn)`(仓库既有惯例)。

## 2026-08-15(合并)

- **PLAIN 分支追加的精确活性**: 资源无关的 PLAIN 值追加到序列是非消费读取;全函数唯一 consume 列可能合法指向后续覆盖或兄弟分支的 scope-end,不能用 `consume == 0` 判当前分支,也不能清除该不可变边。正确判据=追加点只有一个精确 current definition 且该 definition 在追加前仍 live;动态 A/B 必须覆盖 early-continue 分支。
- **派生 CFG 索引的安全性能用法**: 派生 predecessor CSR 只能在 `built_generation == cfg_generation`、block/edge 范围精确一致后使用;最终 authority 仍须回查 immutable terminator kind/target,不能把缓存行升级为语义权威。性能原子要同时看两种负载(普通闭包不退化+生产大闭包收益,分开表述)。Darwin formal process guard 的 snapshot-command 必须显式传 Xcode monitor Python。
- **探针/模拟主机口径**: 每相位超时是防挂死预算,不承载正确性权重;模拟主机按统一因子缩放是口径适配不是放松验证;arm64 Mac 上不存在"快速 x86_64 Linux"(vz 对 amd64 静默回退 TCG,必须 ps 核对 -accel);fs-verity/ext4 镜像跨主机搬运无效(inode 属性丢失),必须在目标机全管线重建。
- **formal GCC argv 权限与磁盘硬门**: exec pathname 的父目录可在调用时不存在,但只能先记 absent candidate,必须等 syscall exit 精确为 ENOENT 才签发;GCC 的不可变 argv 允许词法 `.`/`..` 但解析必须逐组件 lstat 禁 symlink;`-pipe` 不会消除 linker plugin/CRT object 这些固定 argv,正确权限模型是把实际文件作为独立 rootfs frozen closure;20 分钟正式相位前先跑最小 GCC 探针(几十秒暴露 exec/argv 权限缺口)。
- **冷编译器两个 authority 缺口(19:2x)**: `let x = seq[i]` 在循环里产生 STACK_LOCAL BORROW_SHARED,旧数据流只认 CFG_MERGE/MEMORY_VERSION 回边把合法重定义当 live——修法是只认精确 source edge+同块 BORROW_PROJECTION+consume=0,不给行序猜;`out = out + key + "=" + value` 对 var str 生成 PAYLOAD_LOAD 出的 24B SLOT_STR scratch,sentinel validator 只认 OBJECT scratch——修法是限定一个 PAYLOAD_LOAD producer+STR_CONCAT/COPY_COMPOSITE consumer。
- **str[] literal loop-carried / pointer payload authority(20:0x)**: str[] literal 的 staging append 对 loop-carried owned str 有 forward CFG merge source,旧 validator 只认 consume==op+1 的 forward merge,循环多次使用会漏;`SLOT_PTR` 与 `SLOT_STR` transient payload 同族,加 sentinel authority 前必须限定 type 为空(否则误吞 type=ptr 的正规 raw ABI 槽)。
- **类型块半成品 WIP(19:1x)**: 类型块被删而返回类型引用全保留,是"语法不报错、TypeNode 才炸"的半成品形;先在编译首红处回溯类型定义,再查 artifact 内 bridge_surface_source 比查 git HEAD 更快。zc 自测把"平台 fail-closed"当 failed 会让 canonical self-test 永远红;正确形态=验证精确 HARD_RED 后显式 skip。

## 2026-08-16 emit-csg 墙链(合并,只留生产形)

### 查询臂 IR 墙链(第九~二十二墙)

- 查询臂 emit-csg 走 `thread.StartPtr` 16MB worker(`program_support` 同口径),主线程 8MB 栈会在 TypedExprIrAppendNode(序言 334KB 大帧)写穿 guard——先 lldb 再改,不许按猜去 Clone。
- 循环内禁止 `let decl = decls[i]` 整值移出;逃出循环的 scope 用 `typedExprFunctionScopeCloneOwned`,禁止 `share(scope)` 再 drop。
- 同一句 registry_miss 要以缺席的下一句 trace 定位,不能猜 Attach;`BorrowedView`(return ctx retain)再 AppendMove(refcount==1)非空必炸(模型对撞,禁止弱化 unique 门)。
- IR 节点必须绑保留 TypeId:`AddI32ConstNode`(脱糖 i32_const)、`AddOpNode`(BindingInitializer 的 i32_add)、`AddParamNode`(ParamRef)、`AddLetCallNode`(void)都按 `typedExprIrReservedScalarTypeId` + `BindNodeStructuralType`;禁止填假 TypeId、把 Unknown 当 Owned、弱化 value-def 门。
- CallResult 身份要走 call-event(`nodeProducerIds`+`callEventNodeIds`),按 origin 贯穿;void 内建无 declaration 行,走 `TypedExprBuiltinCalleeReturnType`+TypeArena 保留 TypeId,禁止造假 resolvedCall 行或只 continue 跳过校验。
- ArgLink 是脊,所有权在 operand0 已入账的 value 节点;exact 从 `nodes2_exprClasses[operand0]` 取,`AddRhsCallArgLinkNode` 同时戳 node.exprClass。
- Finalize 禁止 `var validatedTable = table` 整值拷托管列再覆盖(空表起步,身份列 share(table.*),投影列 share(final*);禁止整值拷 var T 再覆盖托管字段)。
- arg-owner Missing 且 qualifier 空时:新只读 `TypedExprLookupSameSourceFunctionDeclFromNameSource` 查 `ctx_function_decl_name_source`,Unique 才收行/返回类型(借 ctx,禁止 var owned = ctx);sparse 验证用 prepared 的 name+source 行重验(resolver 回空时走 `TypedExprLookupPreresolvedCallTargetSignatureFromFact`),禁止把 fact 行抄进 expected。
- IfStmt 条件有 parser Identifier 时走已有 `TypedExprIrBuildStatementValueRoot`(Condition 根),禁止编假 Desugared、填假 parser_node。
- `var` 无初值是 Declaration 引入,要单独登记/消费 group(RegisterValueDefinitionFunctionGroups 给 Local+Declaration 登记;AddLocalDeclStatement 在零初始化叶子上消费)。
- callDeclaration 文本列要 ParserOwnedText(NormalizeTypeText 标量是视图,add 进 index 后源串释放→悬空复用)。

### Linux held-exec 视图像墙链(getenv1→15 合并)

- 总病形:**校验时读到的文本是"视图像"(已释放/借用的字符串),不是没写**。生产形统一=文本列/哈希前先 `ParserOwnedText`/`CloneStr` 自有拷贝;禁止把门改成不比、改 Hash 列集、软化 ledger abort。
- Darwin emit-csg / Darwin system-link-exec **不走** unsealed `AppendLocalSymbolsInto`（查询臂或 Darwin held-fd HARD_RED）。pin `:17303` 必须 Linux drv。新烤若带入热 lane `typed_expr`/`compiler_csg` 可能先撞 `HARD_RED:production_held_exec_launcher_required`；同 VM 重跑上一件（getenv14）仍旧墙=件的问题不是 VM。禁止重装 launcher 猜过。
- **已装 launcher ≠ 树 parent（10:24x）**：vz 固定路径仍是 10:0x 55KB smoke（launcher `4f20bc81…` / native `ba73559c…`，`CANDIDATE_VERIFIED` 但 `production_ready=0`）。合同 parent=`CsgCoreProductionLauncherRunSystemLinkExecParent`：只 `execveat` 固定 `csg-core-native`，用 fd198 SEQPACKET ticket 把 child `heldImport` 标成 1；没有 `launch dispatch_min`。smoke 忽略 argv、rc=0 打 launcher-leg、不发 ticket。树要的是 `csg_production_launcher_main`+`csg_core_native_main`，不是把 getenv15 塞进 named path。不匹配就停手报 pin，禁止重装猜过。
- **scratch+retained-fd 发不成 getenv15（10:25x）**：named-path 是验+exec，不是“打开任意件当 child”。`named_path_matches(fd, /usr/libexec/cheng/csg-core-native)` + verity measure；parent self 必须是 `/usr/libexec/cheng/csg-production-launcher` inode。scratch getenv15 现场 `FS_IOC_MEASURE_VERITY failed … Inappropriate ioctl for device`。合同拒就停，禁止拷进 `/usr/libexec`、禁止烤 parent 猜过。
- `:17303` Local Symbol 末子句 `definitionCount != groupCount` 与 schema `:11088`（非 binding 必须 `groupRow=-1`）/ TypedExpr `:4170`（允许 def>=group）合法形对撞。三末子句合取要求表==TypedExpr 且 def==group。修若必须改 typed_expr 造假 group 或删非 binding 行=停手只报 pin；禁止删子句、禁止把门改成不比。
- 具体站点:walk 用 `PathLastSep` 取父长度禁视图像(`ParserOwnedText(text)` 在 count>=len 被编成头拷贝,`typedExprOwnedPrefix` 一律 CloneStrRange);无 `--seven-stage*` 旗时用已有 `CompilerExecutionIdentityMake` 从当前密封请求造身份,禁止无条件 SevenStageIdentityCurrent、禁止标 collector active;插入排序浅拷后移位放掉 packageId——排序按下标排再 OwnManifestEntry 落新数组,禁止浅拷 owned 结构后 entries[j]=entries[j-1];模块节点盖章吃 work.modules 视图像——ParserOwnedText 后再哈希;source table 的 semanticSource/modulePath 文本列 owned 后再写。
- C 内建所有权族(10:8x→10:12x): `os.getEnv` 被 cold_parser 收成 `BODY_OP_GETENV_STR` 并 publish 为 owned producer,但 x64 hosted 只存 libc 指针+长度不 cheng_malloc——改 os.cheng 源是死代码,下一刀在 C 内建(ARGV_STR 同形:strlen→cheng_malloc→memcpy→owned flags);`BODY_OP_STR_STRIP` 视图像再 release 才是 retain 墙(STR_STRIP 必须 cheng_malloc 拷贝写 owned flags,与 ARGV/GETENV 同族);`BODY_OP_BYTES_TO_HEX` 同病(x64 走 glibc calloc 不写 flags/store_id,7 轮 self-consistency 把栈 leftover 写成 flags=1 后 scope-exit registry_miss;Darwin a64 显式 flags=0 drop no-op 假绿=漏释不是没跑到)。**内建 emit 必须与 parser 的 owned producer 发布一致;勿把 leftover flags=0 当修,禁止 flags=0 装借用。**
- hosted FileHandle 必须走 openat+ledger cell(magic/generation/kind=Fd,槽内 fd+1;公开句柄仍是 cell 指针;register_stream_locked 的 FILE* abort 保留;禁止裸 fd 当长期身份);package roots 必须在构造时已 lexical(PathAbsolute(cwd,".") + FindNearest 把 /. 交进 binding;`--root`/debug-text/emit-csg/dry-compile 走已有 CleanDotPath);ledger 活时同线程 16MB 栈(cheng_call_on_large_stack),pthread thread_provider abort 未删。
- owned 空串走 `return ""`(data=.text,flags=1)在 ledger 下当堆释放——空 owned 走 stringsEmpty()(data=nil)。
- x64 ARGV_STR 失败路径 rel8 回绕进指令中间(成功臂超 127B,uint8 存成短跳→#UD):失败路径用已有 rel32 patch;短跳回填越界 die 禁静默截断;禁 qemu 特判(「qemu 缺指令」是归错因)。
- named_stat/store_absent 是环境:固定路径必须走 tools/csg_core_production_launcher_install(verity+chattr+i);生产建店 `csg store-bootstrap --mode strict`;Linux ext4 必须 tune2fs -O verity;不要改检查变软。
- **报告非确定(sln10)**: 同 exe 同输入报告非确定=事实流稳定、病在规则集合去重层(连续两次 SetInsert(share(rule)) 的 share() no-op/move 实参形或集合跨阶段复用/竞态);此病直接威胁跨进程逐字节验收,修前报告不得作为对拍金样。

### Rec/栈/复用族

- `*Rec` 自递归模拟 for 是栈杀手定式(单帧 512KB×24 层即穿 16MB worker):同簇 index-walk Rec(UnorderedSourceProfiles/MetadataContexts/CollectImportEdgeModules/ProfilesRec 等)统一 `while true`+游标推进;ModuleNodesRec 必须 ParserOwnedText 后再哈希;禁止再加 pthread、撤 16MB worker、弱化 ProcessResourceGuard。2026-08-20 后续:typed_expr/type_arena/compiler_csg 共 86 个尾递归转 while(9+42+35),N320 收敛从栈崩推进到慢但持续。
- 整值快照复用只许当前 open block(循环里按值 Compare 在 SubInPlace 发出前固化循环前载荷;mutated_after 看不见回边写);8B 指针视图仍可跨块;CALL 接到 cell 的地址投影(FIELD_REF/LOCAL_ADDR/SEQ_INDEX_REF)就算写,不卡 UNIQUE;作废闭包必须覆盖一切「cell 地址逃逸」形,@importc var-out 是指针写,不得按 ownership 过滤。扩闭包救不了循环回边。
- ORC importOrigins:数组抽到本地 ArenaArrayInt32Add 后写回,禁止 `= nil` 或空数组替换(字段直传 Add 不改 header,coverage 会空)。
- emit-csg plan 边身份活:禁止 `var edge = linkPlan.importEdges[i]` 整结构拷走唯一串(SystemLinkPlanCloneImportEdgeAt 按字段 CloneStr);exact import 空 target=视图像被放掉,expected/空 supplied target 走 ParserOwnedText(spec.targetModulePath)从 import 声明收回。
- 症状随烤制漂移的正确嫌疑序:第一嫌疑=stale 数据被复用/读到(编译器优化的作废条件漏)而非未初始化内存;区分法=修复候选 revert 对照(关复用即稳)比 MallocScribble 更快。
- Darwin 布局硬套 Linux 已成族:fileio dirent(d_namlen@18 vs linux name@19)与 fs.stat(IsDir 假阴)同根——host runtime 跨平台 struct 解包必须逐字段核对目标 ABI(musl/glibc 与 XNU 布局差异);凡 Linux 上「值离奇/假阴/越界」先查解包偏移再查逻辑;Linux hosted readdir 是 dirent64 布局(Linux 用 reclen 边界+name@19 的 bounded strlen,Darwin 保持 namlen)。
- 重烤演练暗礁(05:1x): Darwin 逐字节对拍口径——exe 整文件含 LC_UUID/adhoc 签名/输出文件名三层包装不确定,恒等判定用去包装字节或 CSG cid/map;对拍前必须关 cold_object_cache(二发 8.9s 缓存命中=假对拍)。沙箱演练布局:--in 快照铺 <root>/bootstrap/;bridge out-dir 要 ENOENT;BBD 用 /private/tmp 不用 /tmp;cwd 必须离开仓根否则误写官方 artifacts;C 链与完整面产物不同目录。「若此刻冻结可发?」演练是廉价高杠杆动作(一发暴露发版硬阻断+流程暗礁)。
- embedded patch slot:需要固定相对位置的 patch slots 不能声明成两个独立全局数组再相信 linker 顺序,必须放进显式对齐聚合,用编译期 offset/size 断言和实际二进制 scanner 双重证明;交叉编译目标不等于宿主 self-image 格式,codesign/ELF no-sign 必须从 held self-image 的原始 header 分类(根据 target triple 猜宿主格式会在 Linux→Darwin 交叉编译时走错权限路径)。

## 2026-08-17 原子写 helper 选型：NoReplace 不是 CLI --out 的 drop-in
- `chengpath.WriteTextFileNoReplace`/`PathStableWriteNewText` 是 no-replace + 发布后 fd readback；scratch/`/var/folders` 路径上会 panic `stable_file_published_readback_failed`。CLI `--out` 与 overwrite 语义走仓内已有 `LinkerCoreWriteRawBytesAtomic`（`.tmp`+写全+rename）。
- `rawbytes.BytesFromString` 是 `@borrow_result` 视图，不能当 `var Bytes` 交给 unique-borrow 写盘；要 `BytesAlloc`+逐字节拷。包装函数必须 `@borrows`，否则 `outPath` 被 consume，错误路径再用就红。
- 审计行号可能是内存写（`csgProjectionStreamWriteText`）或已原子的 AtomicTree（`csgStoreBootstrapWriteObject`）；先 grep 真 `WriteFile*` 再改。

## 2026-08-17 死码（unconditional return 后同作用域语句）只词法跳过，不发射不 admission
- exact-identity 全层（managed read edge→var carrier→unique-borrow→schema freeze→@borrows authority）以入口可达 CFG 为根；死码块（preorder<0）的跨块证明全部无法成立。逐证明位打补丁（区域局部 op 序）会在下一层反向回归——该路线已证伪并全还原。
- 正解（已落地）：`parse_statements_until`/`parse_inline_statements` 死尾分支词法跳过（cold_skip_dead_suite_statement：括号/字符串/三引号/注释/缩进感知，suite 有界），零 BodyIR 发射零 admission，沿用 cold_drop_exact_scope_locals 的 dead-tail 先例。回归夹具：src/tests/zztmp_probe_concat_b.cheng（最小）、zztmp_probe_concat_varout.cheng（全形）。
- 回归隔离方法论：对照编译器必须同源码谱系（r35d=旧 cold_parser 烤件，对照被外部 lane 23:29 改写污染）；正确对照=当前源去掉自己补丁重烤（r36g）再对拍，rc_diff=0 + obj 差逐件行为验证。
- Darwin exe 对拍 80B 级散差=LC_UUID/adhoc 签名层，语义对拍用 --emit:obj（同路径双跑逐字节恒等）。

## 2026-08-18 durable recovery singleflight

- 跨进程 `flock` 只解决串行，不解决重复启动的 owner-arena 单调增长；恢复锁必须按 store/root 与 lock inode 建进程内稳定 binding row，循环复用同一 OFD，并用每次递增的 `int32` generation token拒绝 stale release。上层再以稳定 registry row 做 `Ready→Waiting→Held→Ready` 和 epoch 事件等待；重复启动不得新增 singleflight row，等待期间不得持 registry/runtime 锁，取得锁后必须重验 HEAD fence。
- 合法的 owned `str` 三元表达式传给真实只读 cstring helper，首红应在 helper `@borrows` 与 primary 的 dynamic-str DATA projection 闭合；禁止把三元拆成静态字面量分支来躲过编译器。

## 2026-08-20 DeepSeek Harness：官方 API 不收图片

- 自定义 pi-ai 网关未声明模型默认 `[text, image]`；官方 `deepseek-official` Flash/Pro 必须 `[text]`。公开 chat-completions 解析器只认 `text` 部分，发 `image_url` 就是 `INVALID_REQUEST`。
- 多声明会把图写进持久会话，随后每轮（含上下文注入）重发，只能开新会话。勾选框是对端点的断言，不是探测。
- 【用户指正】问的是 `deepseek-official` / `deepseek-v4-pro` 的 harness 配置，不要拿自定义 Grok/`defaultInput` 当答案。v4-pro 公开 API 是纯文本；给它写 `inputModalities: [text, image]` 就是 `INVALID_REQUEST`。
- 重启 `dsh web` 必须用用户自己的 shell 环境。Grok agent 进程里的 `DEEPSEEK_API_KEY` 会压过 `~/.dsh/.credentials.yaml`（env 层永远赢），把假钥送给官方 API，报 `AUTH / API key is invalid`。用户密钥在 `~/.zshrc`。


## 2026-08-21 ts-csg 管线在 Darwin/共享fs 的三面墙

- `validateCsgFacts` 无条件要求 Linux held-exec CLI（`/usr/libexec/cheng/csg-cli`），Darwin 恒 HARD_RED。新鲜 TS 抽取只能在 Linux guest（colima-cheng-lane-vz，有 node v22 + csg-cli）里跑；Mac 上只能走 retained 缓存命中路径。
- extract-cache 的 v8bin 会被任何一次成功抽取的 `pruneExtractCache` 清掉（并行 lane 共享同一目录）。缓存消失后别猜键，直接在 guest 重跑 `--stop-after extract --retained-scene-only --keep-extract-cache`。
- freeze-dist 的原子发布用 renameat2 RENAME_EXCHANGE，9p/virtfs 不支持（EINVAL=22），共享 fs 上必挂。guest 里验证 ts-csg 改动：`node_modules/.bin/tsc -p tsconfig.json` 直出 dist 即可跑物化逻辑；freeze 合同留给原生 fs lane。
- macOS stage3(arm64-darwin) 不能在 x86_64 Linux guest 执行——全链冒烟（含 cheng 编译步）需要 VM 自己的 Linux 编译器，勿硬凑。

- 【两次实证】ts-csg 抽取缓存是三 lane 共享目录（virtfs 同挂载），任何 lane 跑 one-click 都会 prune 掉别家键（retain=0 全删）。8/21 17:19 与 20:02 两次被并行 lane 清空，后者发生在 2.5h 抽取刚落盘 9 分钟后。修法：one-click 支持 `UNIMAKER_EXTRACT_CACHE_DIR` 私有缓存目录（默认行为不变），本 lane 用 `tmp/extract-cache-r13`。重抽取前先确认没有别的进程在写同一棵树。
- 【r91–r112 实证】探针红 ≠ 真阻断，三亚型：①入口双注册（rawbytes layout drift 仅入口触发）②组合上下文字形（os str-seq 仅全闭包入口触发）③入口泛型未单态（result Ok[T] 仅入口触发）。判定标准动作：先造最小消费方入口复探再定性；依赖模式（管线实际形态）绿即非阻断。
- 【r110 实证】裸别名类型（type X = str[] 后用 var X）过不了冷端 SLOT_SEQ_STR/SLOT_SEQ_I32 字形检查——cold_dynamic_seq_element_alias_resolves_to 先验 [] 后缀。修法：签名一律写字面 str[]/int32[]，别名 struct-literal 构造改 return out。
- 【r105 实证】只读收地址承载类型（ByteBuffer/ElfObjFile/str/uint8[]）的参数一律 @borrows；容器存键必须自有——Put 类保持按值、调用点 CloneStr；Get/Find 类 lookup 加 @borrows（含小写 core 逐层）。
- 【r110 实证】managed replace invalidated borrow：快照局部（借自 var 参数的字段读）寿命不得覆盖 m = nextMap 提交点。修法：构建循环抽 @borrows 帮手返回 owned 新值 + frees 提到提交前。
- 【r108 实证】批量重探针/CI 与并行 lane 构建抢核 → 大批伪失败（10/38→30/38）。判伪动作：单门禁手动复跑；错峰重跑全量。


## 2026-08-22 Darwin 原生 held-cli 打通（r13）

- 【实证】cold 后端在 darwin/arm64 对窄宽度 load intrinsic（`let x: uint16 = load(ptr)`）不截断到声明宽度——u16@6 读出 0x88C00001（低半是对的、高位是相邻字节）。同源症状：IntToStr 打出 mode=98724（=33188|0x10000）。修法：stat 解码一律用对齐宽 deref（type 块声明 `X = uint64 *` 等）+ 移位掩码提取字段，见 path.cheng PathStableIdentityFromStat platformCode==2 分支。Linux 分支别动（生产已验证）。
- 【实证】新树 CLI `fact-identities --mode strict` 强制逐行 canonical JSON：数字取 plain/scientific 更短者（平手取 plain；1000→1e3 而 500→500；|scale|>4096 强制 scientific；指数无 + 号）。ts-csg stableJson 已实现同款 canonicalNumberText 对齐；旧 Linux 二进制的 sandbox 模式不查此项，跨 lane 时以 strict 为准。
- 【实证】fact-identities 输出走 --out 文件（行宽恰 167B、输出文件自身哈希钉扎），stdout 不再承载行。桥接 csg-cheng-bridge.ts 已切新合约。
- 【流程】Darwin 全链冒烟顺序：改 cheng 源 → stage3 system-link-exec 重编 cli.cheng（~5s）→ rm+cp 到 ~/.cheng-held/csg-cli（555，cp 直接盖 555 会 EPERM）→ tsc 出 dist → one-click 带 UNIMAKER_EXTRACT_CACHE_DIR 私有目录。230MB facts validate 原生 ~5min，对比 guest TCG 85min 墙。

## 2026-08-22 csgc pack 提速 2.06x（r14 Darwin）
1. 主因：pack 对同一 330MB 流做了 3 次完整 JSON parse+serialize（读端校验 1 次、csgcCanonicalFactOrder 校验 1 次、PhysicalOrder 内部再 1 次）。新增 CsgCoreCsgcEncodeVerifiedLines：调用方已验证 canonical 时直接从原文派生 factHash/key，跳过全部重复解析；原 EncodeCanonicalLines 语义不变。
2. csgcBuildFactSections 原来对每行做两遍 CsgCoreJsonKind 扫描；融合为单遍（首遍存 rowKindIds，排序后一次映射到 section）。输出逐字节不变。
3. cli pack 尾部 canonical_jsonl_bytes 用增量计数替代 CsgDataEditLinesText 整包渲染（省一次 330MB 分配拷贝）。
4. 实测（110 万行/330MB）：旧 2205s → 新 1070s，cmp 逐字节一致。剩余瓶颈=读端校验解析、tokenize、字典哈希；要到 5-8 分钟需流式单遍融合 read+verify+tokenize（接口跨界重构，另开任务）。
5. 教训：并行 lane 重写 path.cheng 后用裸 load(未类型化 ptr) 又触发窄读截断 bug（darwin/arm64 load 只取 32 位）；必须用类型化指针解引用（PathStableUInt64Ptr(base)）。跨模块小写函数可直呼（merkle_dag.csgMerkle*），无需加公开包装。

## 2026-08-22 scene pack json_node_limit_exceeded 根因（r16 诊断）
1. 物化器生成的 raster_image_data 资源 fact 把整张图片像素编码成 JSON 数字数组（400 宽图约 28 万数组元素节点），超过 CsgJsonMaxNodeCount=65536，held-cli pack 拒绝。单 fact 内容合法，是预算过时。
2. 预算提到 2097152（最坏瞬时 AST 约 100MB，构建 CLI 可承受；嵌套深度 256 的栈安全上限不变）。冒烟测试边界同步改 flatArray(2097152)，csg_core_json_canonical_smoke 全绿。
3. 教训：二进制负载（像素/base64/音频）不应内联进 JSON fact——glyph SDF 像素已有 .bin 外置先例（writeGlyphSdfPixelAsset），raster_image_data 应走同模式（fact 只存 hash/path/byteSize）。Fix D 候选，属 materializer lane 改动，需协调消费端。
4. 诊断手段：csg-cheng-bridge.ts chengCsgPackFacts 失败时把 tmp jsonl 转储到 /tmp/csg-pack-fail-dump.jsonl（保留），行级问题秒定位。r16 场景 pack 失败靠它一次锁定 raster_image_data 超限。

## 2026-08-22 编译超时根因：图片像素内联成代码（r17-r19 诊断）
1. 症状：[3/4] 编译 266MB 生成源码 300s 超时。第一性排查：4,764,071 行里 add(__csgImgPixels 占 452 万行——物化器把每张静态图的每个像素 emit 成一条 add() 语句，约 250MB，占源码 95%。实测该文件编译吞吐 ~0.13MB/s（34 分钟 CPU 未完成），放大超时只是掩蔽。
2. 修复（数据驱动）：CSD1 数据资产升 v6 增 raster image section；materializeCsgWebSessionToChengSource 返回 imageAssets（按像素内容去重、按 imageId 排序）；paint 注册改调 __csg_scene_image_pixels(imageId, out) 从启动时加载的资产切片复制；非 mobileAppExports 的桌面 dump 路径保持内联（桌面无 mobile host 读资产，属环境差异非降级）。
3. 教训：数据永远不该以逐条语句形式烧进代码——数组字面量/二进制资产+运行时加载才是正解；超时第一时间问『理论下界是多少、为什么达不到』而不是放大超时。

## 2026-08-22 超时排查方法论（web-csg gate 三连超时的复盘）
1. 超时第一动作是分段取证不是加预算：把长流水线切成段，用产物 mtime 链（csgc.debug→csgc→font-subsets→scene-manifest）+ 进程 CPU 时间定位卡在哪段；每段的合理耗时要有理论估计（extract 322 文件 ≈27min、materializer 像素外置后应分钟级、glyph cache hit 秒级），实测对不上就是根因所在。
2. 长流水线的 runner 超时错误必须携带 child 输出尾部，否则超时是盲盒（本次 gate 超时连 extract cache hit/miss 都看不到，被迫盲试）。已修 process-runner.mjs：超时 Error 附 stdout/stderr 尾部 4KB。
3. 缓存键含 dist 内容 hash——共享 dist 每次重冻都会使 extract 缓存整体失效一次，属预期行为；重冻后首跑预算要按无缓存全程估，不能按上一轮有缓存耗时估。
4. 并发跑两条重流水线（lane 全量 + 我的 gate）互为放大器：任何超时结论在 CPU 争抢下不可信，先串行再下判断。

## 2026-08-22 编译器平方级解析与模块拆分方案（r19-r21）
1. 采样证明：36MB 生成源码编译 98.6% 时间在 cold_parse_expr_impl（parse 阶段），symbols_find_object_local 线性查找随作用域膨胀 → 单文件成本约 O(n²)。实测：236k 行 >46min 未完；118k 行 11.2min；(236/118)²×11.2≈45min 吻合。
2. 解决：one-click [3/4] 增 splitGeneratedChengSource——按顶层 fn 边界切分（装饰器前挂），@exportc/fn main/全局变量/@importc 留入口，其余 fn 按字节均衡装入 K=ceil(bytes/2.5MB) 个 part 模块；入口 import 全部 part。三文件冒烟验证：跨模块非限定调用、part 改 state 全局、main 读回全部可用（SMOKE_RC=0）。
3. 字体外置：CSD1 v6 已带 raster image section；字体走 font_subset 图资源（WebSceneLoadFontResourceFace）经 __csg_scene_font_face_by_slot(slot) 加载，mobileAppExports 下不再内联 base64（省 18MB 源码）。桌面 dump 路径保留内联（无 mobile host，属环境差异）。
4. 教训：生成器输出规模直接决定冷编译器可用性；任何『数据当代码』的 emit 模式都会撞上解析平方墙。后续候选：cold parser 符号表哈希化（根修）。


## r28-r29 全量切分编译攻坚（ox 车道）
- 切分编译已验证：17.4MB 单文件 parse 46min+ → entry+7 parts 后 **12.4 秒**（exec_phase_parse_us=12390390），平方级解析根因确认并绕除。
- 双模块接线生效：scene-runtime.cheng 首次进入编译闭包；helper 重复定义（live emitter 内部还调用了'死'函数导致双份）→ ambiguous overload；注入副本前必须全仓 grep 调用点，不能只 grep 定义。
- 核心库借用墙三连（add(value) borrowed source requires explicit share）：web_style_runtime ComputeStyle 嵌套取元素、web_runtime inlineStyles、web_react_runtime propNames/propValueStrings。修复范式：str 用 strings.ConcatStr(x,"")，嵌套容器元素用局部 var 中转拷贝。逐个由编译器报错定位（report stderr 的 add target=/value= 行）比猜测快。
- 秒级复现驱动：写最小 driver .cheng（import 目标核心模块+调用目标函数）直接 system-link-exec --emit:obj 验证修复，避免每次跑 3h 管线。
- **未决**：chtInline voice-session 处理器把捕获的 struct 自由变量（roomState: RealtimeChessRoom 等）以值传递给多个下游调用——cheng 默认 move，第二次传参即 'use of consumed managed value'；share(struct含数组字段) 触发编译器 'value-object decomposition tree is not exact'。需要 codegen 层重构（每次调用从 graph 重读 / 单次使用排布）或编译器补 share 的非精确分解建模。属 cht-voice-dual-state-bridge 车道与编译器裁决范围。

### r29 补充：借用翻转路线的完整结论
- cheng 参数语义实测：`name: var T` 借用形参（var 在类型前）；借用链可多级传递；同一调用里同一 lvalue 不可绑两个 var 形参（overlapping places）；rvalue/临时值不可绑定 var 形参；借用实参必须是 mutable stack local（let 声明不行）；str 复用传参用 strings.ConcatStr(x,"") 拷贝。
- 结构体（含数组字段）复用传参：share() 触发 'value-object decomposition tree is not exact'；var 借用在字段投影处触发 'no exact unique root'。两条编译器内建路线都未覆盖 CHT 生成的捕获-结构体-多次下游调用形态。可行出路只有两个：CHT 发射器改为逐调用从 graph 重读结构体状态，或编译器补 share 对复合值的精确分解。已定位到 cold_parser.c cold_exact_owned_object_field_decomposition_projection_valid 一带。

### r29 终局：CHT 快照结构体的精确约束与可行边界
- 实测定律：含序列字段的 codec 结构体（RealtimeChessRoom 等）其 drop-helper 分解不精确（value-object decomposition tree is not exact）。任何作用域退出（含早退 return）时仍持有该类值即编译失败。retain 侧支持 SEQ，drop 侧验证不通过——编译器不对称缺口。
- 可行形态（已验证编译）：值只被消费一次——`json.Stringify(__chtJsonOf_T(x))` 一次性吃掉 x 得快照串；每个使用点 `__chtFromJson_T(json.ParseJsonNodeOrDie(ConcatStr(snap,"")))` 现场重建为临时并立即移入调用。禁止把该类值赋给跨条件边界的局部变量。
- str 复用统一 strings.ConcatStr(x,"")；len/== 已 @borrows 不消费；赋值右值、字段投影、rvalue 绑 var 形参均为消费/非法点，pass 脚本必须统计。
- materialize-managed-args-pass.mjs 已实现上述全部规则（快照化+现场重建+str 包裹+赋值点处理），除 leaveCurrentRoom 的守卫-早退形态外全部编译通过；该形态需等 drop-helper 修复或生成器改读图。cold_parser.c/cold_types.h/cheng_cold.c 有车道未提交改动（1637 行），正是此域，勿动。
- 教训：多轮编译错误定位时先做『纯基线对照』——pristine 本身就编译不过（f067 len 前的 finalize 消费），说明 voice-session 代码从未完整编译过，后续错误都是逐层暴露而非回归。

### r29 追补：materialize-managed-args-pass v3 架构与剩余边界
- v3 通用规则：多使用 managed 捕获一次性 Stringify(JsonOf(x)) 消费；每个使用点 FromJson(ParseJsonNodeOrDie(ConcatStr(snap,""))) 现场重建移入调用方；字段读取走 __chtFld_T_f 提取器（拷贝字段后用 JsonOf 整体消费）；别名(var b=a)解析到根捕获；裸重赋值也参与 str 传播；赋值右值裸标识按 str 局部包裹（__chtRef 全局存、字段存均消费 RHS）。
- 无编解码器结构体（RealtimeCallSignalEnvelope/ChtInlineObj_aaae4d77/RealtimePayloadBaseOptions 等）：无 JsonOf ⇒ 无法快照/提取/克隆值。生产者纯函数时可用「构建块克隆」按使用点重建（envelope 已解）；参数形态的 codec-less 多用途（sendCallEnvelope 的 envelope 参数）在当前编译器下无解——根因仍是 drop-helper 分解不精确 + CHT 生成器把同一对象发给多个消费调用。
- 工程教训：脚本生成时模板字符串转义层级极易错（\\b 变退格、split("\n") 变真换行）；修 script 应整文件重写而非多次 replace；编辑应用必须单 splice 操作完成『替换+前插』否则索引偏移吃掉相邻行。

## 2026-08-23 整文件读写在共享大文件上是截断机关

- 现象：tools.read 对 ~50KB/1110 行的 diloco/core/diloco.cheng 返回在 ~1037 行处静默截断；把该快照 join 后 tools.write 回写 = 无声截尾，当日发生两次，settle 门禁两次被打红。
- 铁律：共享业务文件一律用 edit 工具做字面替换（失配即报错，永不静默截断）；整文件 read→write 仅限自己独占的小文件。写后必须 `wc -l` + 与已知完整副本 diff 校验。
- 附：@borrows 函数级注解官方链接受，但会改变调用点检查（PeerIdCopyFill 注解令 JoinCohortFill 投影权威报错）——注解必须逐函数双链验证，禁止成族批量上。HEAD 链对 `out = T()` 托管整体赋值的拒绝是回归（stage1_bootstrap 自身零处此构造），业务侧不可修，等 lane。


## r30 managed-args-pass v3+：消费定律落地与 2-D 数组硬阻塞
- **消费定律（最终版，取代早前「读全局即炸」误诊）**：任何托管结构体参数/局部必须在其存续的每条退出路径前被恰好消费一次；守卫早退只是「跳过消费」，报错归因于值过期而非读取动作。空函数体对照实验（X3）是破案关键：错误与函数体无关、与参数过期有关。
- codec 局部变量两分法：**突变流**（对该局部有字段存储）→ 入口快照串 + init 行原地重建 `var x = FromJson(Parse(snap))`、其余用途一概不动（保单主人语义）；**纯值流** → init 行改产快照串（原变量名消失）、每个使用点现场重建。判据用 mutationRoots（扫描期记录 `root.f =` 存储目标）。
- 未知调用点（callee 不在 fnInfo）：str 参数一律 strings.ConcatStr 拷贝；裸结构体参数一律 freshFor 现场重建——不依赖形参信息也能保正确。
- 链式投影 `root.f1.f2...fk`：fieldType 播种需同时识别 GetStr/GetBool/GetInt64 与 `__chtFromJson_T(`（结构体字段）；walker 贪婪吃掉整条点链，逐级包 `__chtFld_prevTy_f(...)`，每级返回 owned 拷贝故可继续提取。字段名位置（out 以 "." 结尾）禁止裸词替换。
- 裸投影弃值语句（如 `snapshot.callSessions` 单独成行）是隐藏消费点且纯无副作用——直接删行。
- **名义类型实测**：超集结构体传窄形参编译拒绝（exact identity schema）；CSG 输出存在此类潜藏类型错（buildBaseEnvelope 收 Base 型却传 ChtInlineObj_*）。通用修法＝收窄转换临时：srcLocal 接住 fresh/实参 → 逐字段拷入 narrowLocal（str 用 ConcatStr 借读、其余移动）→ JsonOf(srcLocal) 整体消费。
- **pass 自生成代码必须排除管理**（codec/extractor/genArr 函数名 ^__cht(JsonOf_|FromJson_|GenArr_|GenFromArr_|Fld_)），但 fnsAt 必须保留其条目作边界只跳过处理——否则前一 fn 的 [start,end) 吞并 codec 行造成交叉污染（本轮 room codec 被注入自指快照的教训）。
- **2-D 托管数组是当前编译器硬缺陷**：P[][] 作 param/local、.len/add/索引/for-in 全形态失败（stage3 报 lacks exact current definition；dev 报 opaque sequence drop TypeId aux 16≠24，已带新插桩说明 lane 正在修）。阻塞面=board: Piece[][] 序列化链（JsonArray_aea2ce91c8 及所有含 T[][] codec）。1-D 全正常。chess 游戏逻辑本体在 parts 内不受影响。
- 工程教训追加：往 .mjs 写正则字面量必须「写后 eval 功能验证」（本轮 \( 双反斜杠陷阱连犯两次）；探针计数签名（snapshots/freshSites/fieldReads/strWraps/extractors）变化是回归第一信号；fixer 改共享行内变量后必须置 changed=true 否则替换文本被丢弃。
- 本轮前沿推进：sendRealtimeEnvelope / finalizeRoomVoiceSessions / chengRtApplyEnvelope / createRealtimeChessSignalEnvelope 全部转绿；当前唯一阻塞=__chtJsonOf_RealtimeChessRoom 经 ChessGameState 触达 2-D board codec，等 lane 修复或改 CSG 板件表示（拍平成一维+维度字段属生成器层决策，须产品侧裁决）。

### r12 追补：2-D 拍平变换落地 + 契约准入新前沿
- **2-D 阻塞已解（pass 层保真方案）**：flatten-2d-arrays.mjs 把 `E[][]` 字段改存 `E[]` + `Rows/Cols` 两个 int64，JsonOf 用 for-in 分块重嵌套（先提升 value.field 到局部再迭代——pristine 只证明过参数迭代合法），FromJson 逐元素 add 进局部平铺数组后一次性字段存储。JSON wire 格式完全不变。波及面确认：全仓仅 board 一处 2-D，parts 零引用；孤立 helper（T[][] 参数）变为不可达即不再被检查。
- **探针方法论重大教训**：生成的 .cheng 探针必须打印完整错误文本而非 OK/FAIL——本轮 type 块缩进错误(4空格 vs 8空格)和 fn 体语句缩进错误制造了「3 字段阈值」「拷贝读法无效」等一连串假结论，浪费多轮编译。正确格式下 11 个 str 字段逐一移动完全合法（无数量阈值）。
- **真定律**：毒化是类型级传递的——结构体只要**声明**了 T[][] 字段（即使从不访问），其所有值的分解即不精确，且沿包含链向上传染（board→ChessGameState→RealtimeChessRoom）。
- 新前沿：stage3 的 FunctionContractAdmission [body-store-freeze] 拒绝 handleVoiceAction（"void return tuple is broken" slot kind=1 size=4 type=int32）与 leaveCurrentRoom（call_arg identity, callee=createRealtimeChessSignalEnvelope 的 store 构建载荷）。arity 全仓机械校验 2889 处零失配。空体测绘显示其后还有 cheng_app_set_window（入口 pristine、历史编译通过、字节未变）同样被拒——疑似 admission 表对函数数量/全局行号敏感（producer=10536），空体会使拒绝点漂移到无辜函数，黑盒二分在该 checker 上不可靠。此域属 cold_parser/cheng_cold 车道现役工作区（dev 二进制已带 [ev0]/[hop] 追踪插桩）。
- dev 二进制现状：layout.ByteSpanSlice "plain object producer lacks exact result authority"，自身回归中，不可作主驱动。

### r13：契约准入前沿定性 + void-return 修复
- **已修**：CSG 在 void 异步处理器里发射 JS 风格 `return 0`（handleVoiceAction 两处）——void 函数返回字面量被 body-store-freeze 拒绝。pass 新增变换：void fn 内 `return <数字>` → `return`（按签名返回类型门控，844 处字面量返回中仅 void 命中者改写）。
- **当前阻塞定性（黑盒证据链）**：
  1. leaveCurrentRoom call_arg identity：store 构建的 ChtInlineObj 载荷 → producer 调用 → Stringify(JsonOf(producer(...))) 三层链被拒；同型三层链在 sendRealtimeEnvelope 里通过——差异不在形态。
  2. 截断 leaveCurrentRoom 后失败点跳到入口 cheng_app_set_window（字节与历史成功轮完全一致、f64 参数"lacks authority"、删裸参数语句无效）——**admission 失败点随模块内容/全局 producer 序号(10536)漂移到无辜函数**，证明该 checker 存在全局状态/索引敏感缺陷，黑盒二分不可用。
  3. 结论：leaveCurrentRoom/set_window 的拒绝大概率同为 lane 准入层缺陷，非业务侧可修；dev 二进制同期在 layout.ByteSpanSlice 上自身回归。
- 工程教训追加：长编译命令必须显式传 timeoutMs（bash 默认 60s 会静默截杀）；诊断性截断严禁 splice 到文件尾（会连带删除后续所有函数定义，制造第二个假错误）；每次「修复」后必须以计数签名+错误文本双重确认回归状态。

### r14 追补：前沿测绘方法修正 + 字体借用墙定性
- 前沿测绘的正确姿势：截断函数体必须**仅在函数体内**替换为 return（上一轮 splice 到文件尾连带删光后续定义，制造了 __cht_apply_checked 假错误）。正确测绘结论：handleVoiceAction(void-return 修复后)与 leaveCurrentRoom(截断后)均通过，下一个真实拒绝点是入口 cheng_app_set_window。
- set_window 拒绝与全局存储无关（删除 3 处 global store 后原样复现），f64 参数行被报 "lacks aggregate/reference authority"。
- 顺带暴露的下一层：__csg_mobile_load_font_N 调 scene-runtime 的 __csg_scene_font_face_by_slot(slot, face: var font.WebFontFace) 报 unresolved。已用最小探针排除三假设：同模块全局绑 var ✓、跨模块全局绑 var ✓、声明形态正常 ✓——即该调用在真实模块语境下的解析失败属 lane resolver/admission 缺陷类，非业务侧可修。注意该 helper 只是转发 borrow 给 scene.WebSceneLoadFontResourceFace（真正写入方在 stdlib），业务侧任何「拷贝进局部」方案都会丢写入、语义不等价，禁止。
- 本轮净变化：无新增 pass 变换（两条新前沿均定性为 lane 域）；canonical 状态可复现（snapshots=55 freshSites=173 fieldReads=112 strWraps=736 extractors=50 + flatten 1）。

### r15：字体墙根因 + set_window 内容敏感实证 + 深编译在途
- **字体墙根因确认**：WebFontFace.data: int32[]（托管序列字段）——跨模块 var 借用「含托管序列字段的 结构体」触发与 2-D 同族的 exactness 缺陷。三特征最小复刻（第三方类型+全局实参+条件位调用，但无序列字段）通过 ⇒ 序列字段是必要条件。业务侧禁修（拷贝方案丢 WebSceneLoadFontResourceFace 的写入）。
- **set_window 内容敏感实锤**：函数体内加 2 行无害语句后即被准入（前沿随之移到字体墙）。其拒绝非全局序号漂移而是自身内容触发的 checker 缺陷；具体毒因子未定位（裸参数回显删/留均失败过，位置/数量参与判定），黑盒不可工程化。
- **诊断态深编译观察**：绕过三墙后（set_window 加行、7 个 load_font 空体、leaveCurrentRoom 截断），system-link-exec 进入 >50min 的 100% CPU 深编译——远超历史任何失败轮的时长，疑似首次深入 parts 全量代码gen。结果在途（后台 job bash-135）。若 OK 则证明剩余阻塞面=恰好被绕的三处；若爆炸则说明绕墙本身触发优化期病态行为。均属 lane 情报。
- 工程教训：run_code 的 bash 默认 60s 超时会静默截杀长编译（本轮再次踩中）；后台 job 无超时上限适合 3h 级管线。

### r15 终：映射实验完成——缺陷 C 系统性确认
- 67 分钟深编译（后台 bash-135）越过 set_window/字体/leaveCurrentRoom 三墙后，撞第三处同族墙：
  `__csg_scene_image_pixels(imageId, outPixels: var int32[])` ×3 处 unresolved——var 形参
  直接是托管序列。**定律升级：跨模块调用把全局绑定到「类型含或即托管序列」的 var 借用形参，
  系统性失败**；波及全部字体/图片/像素路径。
- 合成最小化两次尝试均通过 ⇒ 该缺陷依赖真实模块语境（大函数体/特定声明序），黑盒最小化不可达；
  报告改用真实现场引用制（lane-defects/README.md）。
- 合成探针附带发现：含 1-D 序列字段结构体的合成默认值局部直接流入 Stringify 即触发同一
  [body-store-freeze] 拒绝——业务代码因 pass 改写不再呈现此形态，但暴露 checker 对序列聚合的
  默认值路径本身有洞。
- 映射结论价值：剩余阻塞面 = 恰好三类 lane 缺陷（A 序列毒化[已业务侧绕除]、B 准入内容敏感、
  C 序列 var 借用跨模块），无未知第四类。lane 修复 C+B 后全量编译应直达链接成功。

### r16：缺陷 C 根因翻转——裸调跨模块符号，业务侧已修
- **根因（推翻 r14-r15 的「序列借用墙」定性）**：entry 调 `__csg_scene_font_face_by_slot`/
  `__csg_scene_image_pixels` 是**非限定名**，且 entry 根本没有 import scene-runtime
  （只有 parts 有 qualified 导入）。合成探针全过正因它们是限定调用——「托管序列相关性」
  是巧合（CSG 恰好只把 seq 型 helper 放进 runtime）。
- 修复：entry 加 import + 28 处调用加 csgSceneRuntime. 前缀；已固化为 one-click
  post-process（重跑安全：先归一化再限定）。验证：两墙消失，深编译 67min→2h05m。
- 教训（方法论级）：「合成最小复现通过」既可能是缺陷不成立，也可能是**复现缺了真实语境的
  某个无关紧要却致命的维度（如限定符）**。黑盒二分前先核对失败/通过样本的全部表面差异清单。
- 缺陷 B 升级证据：被拒 producer consume=0（死代码未被 DCE）+ 准入结果依赖全局编译上下文
  （同函数体内容在不同模块规模下结论翻转）。lane 修法方向已写入报告。
- 剩余生产阻塞 = 缺陷 B 独苗（set_window + leaveCurrentRoom）；绕行（截断/死语句）非生产级，
  等 lane。深代码gen ≥2h 单线程亦属 lane 性能信号。

### r17：缺陷 B-LCR 根因破案——TS 可选字段转译丢失（业务侧已修）
- **根因链**：createRealtimeChessSignalEnvelope 的 TS 形参类型含可选字段 move?/moves?；
  leaveCurrentRoom 站点字面量不含它们 → 转译器把「声明类型」物化成 36a8dc12（8 字段，
  可选变必填），把「站点字面量」物化成 f5bfca68（6 字段）→ 名义类型不匹配，报
  call_arg identity。sendRealtimeEnvelope 通过是因为它根本没有三层嵌套链（先前记忆有误）。
- **修复**：pass 新增 inline-site retype——站点局部类型重定型为 producer 形参类型
  （仅当形参字段集 ⊇ 站点字段集；未赋值 extras 保持零值，与 TS 缺省可选语义一致）。
  验证：retype: 1 local(s) aligned ✓。
- 方法论教训：(1) 编辑脚本内的正则经多层引号传递时双重转义极易翻车，改用 indexOf+回溯
  标识符的无转义写法；(2) 「同型链通过」的记忆必须重新 dump 对照再引用——
  sendRealtimeEnvelope 的真实形态与印象不符，直接对照才找到真差异。
- 剩余唯一阻塞：defect B-set_window（死 param-load 准入，lane 域）。验证编译在途。

### r19：缺陷 B-set_window 终审 + 迷你复现交付
- 裁剪入口法（只留 imports+相关全局+两个 fn）把 2h 全量编译压成秒级迭代，一击定性：
  V-a（体内 scale 零出现）同错复现 ⇒ 被拒的是「未使用的 f64 参数 param-load」；
  同体 uint64/int32 未用参数不触发 ⇒ admission 对 f64 的 authority 分类错误。
- 业务侧终审：任何消费 scale 的方案都是捏造语义（布局常量是硬编码设计尺寸，不能改成
  设备值），禁。lane 修法：admission 放行未读标量 param-load，或 DCE 前置。
- 交付 lane-defects/defect_b_setwin_minrepro.cheng（秒级复现件）+ README 更新。
- 方法论：当全量编译昂贵时，「裁剪出最小依赖闭包」比黑盒二分更快更准——先算依赖再实验。

## 2026-08-23/24 会话教训流（磁盘清理/rc 测量/守护生命周期）

- **rc 取值紧邻原则（命令替换覆盖变体）**：`echo "$(basename $g) rc=$?"` 里 `$()` 先执行并把 `$?` 重置为替换的 rc——六门禁"全绿"实为假测量（一门真红静默漏过）。取证一律 `cmd; rc=$?` 先落变量再做任何展开；管道尾部取 rc 同族（既有条），命令替换是第二个变体。
- **删除前三查与删后一复核**：删任何非自建路径前①pgrep/lsof 查活跃（"无重型编译在飞"≠"无进程在用"——unimaker 管线 out-dir、lane 的 /tmp/local_out.log 两起事故）②看 mtime（ls 先看后删，顺序不能反）③识别所有权；删后 du 复核体积真降（体积不动=半清理信号）。`rm -rf` 被只读位 dr-x------ 静默半清且 2>/dev/null 吞错——先 chmod -R u+w 再删（既有条重犯，升级为硬流程）。
- **zsh 通配失配中止整条命令**：`rm -f a b ~/.x/logs*.sqlite* c` 中一个 glob 无匹配→整条 rm 不执行（无报错静默跳过）——多目标删除逐条拆或先校验 glob。
- **artifacts/ 非纯缓存**：artifacts/backend_driver 含正式 current-source 驱动件（门禁直接依赖）——清理仓内 artifacts 前必须 grep 工具引用；误删后重建又被编译器墙挡=双重阻塞。
- **/private/tmp 守护脚本预期会消失**：重启/外部清理两实证——守护脚本须有可重建模板（内容落仓外持久位或可从 progress.md 复原），重挂后 pgrep 验活。
- **disk-guard lease 绑常驻进程**：lease 注册到短命 shell PID 会被 guard 按生命周期正确清理（guard 行为对，用法错）——跨命令目录用 keeper 常驻进程持有。
- **变异合同门禁的 perl 无 /g 假接受**：变异目标串在检查区出现 ≥2 次（lane 演进新增检查）时非全局替换只杀一处、门检仍命中另一处→"mutation was accepted"——变异必须锚定唯一上下文或 /g 全杀；门钉也要随合同演进同步重钉（更强形可接受，降门槛不可）。
- **bash 门禁脚本输出 status=failed 但 exit 0 的自检法**：跑门后既看 rc 也 grep status= 行，两口径都要对上才算绿。

### r20-r22：全量真身验证完成——业务侧修复全部保持
- 新鲜全量（18.2MB 入口 / 6631 元素 / 4.1MB 运行时）编译 ~2h：**唯一拒绝点 =
  set_window（已知 lane 缺陷）**，无未知墙。三业务侧修复（限定化/retype/pass 全家）
  在真身上全部成立。
- 车道活跃证据：捕获其 one-click 管线运行中（r18-parity-gate-e 输出目录）。
- 终态：业务侧可做的已全部做完且验证；等 lane 对 defect_b_setwin_minrepro.cheng
  的 f64 authority 修复，落地后一键管线直达可运行二进制。

### r23：变换冒烟检查脚本落地
- 新增 ts-csg/scripts/materialize-transform-smoke.mjs：纯文本扫（秒级、零编译）断言
  六项——pass 快照存在 / 2-D 拍平 / void 无字面量返回 / inline 站点与形参对齐 /
  入口限定化无裸调 / runtime import 在位。当前全绿。
- 用途：车道改动或管线重生成后先跑它，再决定是否值得 2h 编译。
- 工程教训：经 harness 传递的模板串里写正则/转义序列会多层塌缩——写文件类代码一律
  用「写入后立即执行验证」闭环，发现语法错直接字节级修复。

### r25：跨线协同接入 + 前瞻风险登记
- 发现车道活跃工作区 src/.gen/r16-probe2/（A-LINE-HANDOFF.md 分钟级更新）——已投放
  B-LINE-DEFECTS-POINTER.md 把 set_window 缺陷接入其协同通道（其门禁止步 [3/4]，
  从未到达全量编译段，故其清单未含我的缺陷）。
- 车道门禁自身三阻塞：[2/4] CHT 自定义 props 回调/匿名箭头转译缺口（A 线材料器域）、
  [3/4] digest sealed-formal-refine（cold 符号注册域，二次注册合并 die）、
  阻塞③ exportc 跨模块链接回归（_probe_answer Undefined symbols）。
- **前瞻风险**：B-set_window 修复后 obj 编译通过，但 --emit:exe 链接段可能撞车道
  阻塞③（exportc Undefined symbols）——届时按其 retest_exportc.sh 最小复现对跟进。
- 协同方法论：跨线交付物要放进对方「正在读的目录」并指明验证命令与预期输出，
  而不是只留在自己的报告里。

- **回退共享文件补丁后必须立即重编译并 grep 编译错误**（2026-08-24 实测）：脚本化字符串替换回退时残留悬空 or-or 造成语法错误，gcc 失败但验证命令用旧二进制继续跑，陈旧二进制掩盖真实回归达数轮。正确流程：任何对 cheng_cold.c/cold_parser.c 的脚本化编辑（含回退）后第一步永远是重建并确认 grep error 为空再跑验证；否则一切 rc 结论无效。

- **日志与中间产物用完随手清**（2026-08-24 用户指令）：/tmp 验证日志单文件可达 800MB+（千万行级），累积 11GB+。纪律：每轮验证结束后立即删当轮日志与 .rep；子代理结算集成完毕即删其日志链；只保留活跃进程正在写的最新文件与 /tmp/oxa_cold 活跃二进制。

- **int32-signed IP byte trap (2026-08-25 x.com cold-start crash line)**: cheng int is int32 SIGNED; IP octets carried as int32 read back NEGATIVE once >= 0x80, corrupting compares/joins/hashes. Rule: mask every byte pulled from a packet buffer with & 255 into 0..255 before arithmetic or use as a key; never treat IP bytes as signed values.

- **uint32 multiply silent wraparound (2026-08-25 same line)**: uint32 multiplication wraps mod 2^32 SILENTLY; any intermediate product that exceeds 32 bits corrupts the result with no error (checksum / session-key / capacity formulas all hit this). Rule: widen intermediates to int64 BEFORE multiplying, or assert upper bounds on both factors; never multiply-then-mod and assume it is fine.

- **frozen heartbeat = death precursor (2026-08-25 same line)**: the 5s status heartbeat going silent is NOT idle, it is the process freezing/exiting - in the x.com cold-start case the wd.log heartbeat gap appeared BEFORE failstop.log (some earlier stalls were actually the dying window of the ORC suicide). Ops rule: treat a heartbeat gap of more than 2 periods as a crash (pull debuggerd/tombstone + check failstop.log) instead of waiting for a user report.

- **BuildId 变体错配=符号化隐形坑（2026-08-25 后台存活崩溃线）**：设备 tombstone 的 .so BuildId 是唯一真伪判据——本轮 RelWithDebInfo 本地库(03a8…)与设备(ea50…)不一致，差点用错变体符号化；核对后确认门禁装的是 Debug 变体，用 cxx/Debug 未剥离 .so 直接 llvm-symbolizer 解出 cheng_cold_fa6f60c8_486。纪律：符号化前必先 llvm-readelf -n 对 BuildId，命中哪个变体用哪个。

- **后台存活=ORC 自杀稳定复现器（2026-08-25）**：无需 x.com 冷启风暴——门禁 background_survival 阶段连接成功后 ~3s 即触发 registry_miss/normal_release/wrong_object_or_owner SIGABRT，复现率 100%（run7）。诊断从此可在门禁内闭环，failstop.log(2KB原始栈)+tombstone 双留档均自动产出。

- **结构体副本传参 Close = ORC 二次释放（2026-08-25 x.com 冷启双释放根因，已修复）**：`var tcpLink = links[i].tcpTlsLink` 取副本再传给 CloseTcpTlsForwardLink——Close 在副本上 BytesFree 共享的 pending 缓冲后，数组元素仍持悬垂指针；函数返回时 ORC 深释放 links 数组元素字段 → 同一缓冲二次 free → registry_miss。探针定位法：每个嫌疑释放点前用 WriteTextFile 覆盖写唯一标记到 files/probe_marker.txt，崩溃后幸存文件直接指认现场（本轮 cls_tls_1 → cD_done 之后即崩）。规则：凡带 var 参数的 close/free 类函数必须对存储位置原位调用，禁止先拷贝局部变量再传入；同理 QuicLink 副本还会造成 streamOpen 标志分叉。修复后两轮 x.com 冷启风暴均存活。

- **SliceBytes 谓词误判（2026-08-26 vpn 隧道线）**：`SliceBytes(buf, start, len)` 在 start+len 越界或 len<0 时返回的切片被部分谓词误判为有效，静默产出错位数据。规则：切片前显式断言 `start>=0 and len>=0 and BytesLen(buf)>=start+len`；谓词判断一律基于 BytesLen 而非切片成功与否。

- **route_mode 重装覆写（2026-08-26 vpn 线）**：应用重装/数据清除后 setglobal.sh 写入的路由模式会被首次启动的默认配置覆盖回 fast，表现为"修好的 bug 复发"。纪律：验收前必查 `run-as ... cat files/config.json | grep route_mode`；改默认值必须同时改 Kotlin 默认与脚本两处。

- **managed str 跨临时边界必须 CloneStr（2026-08-26 vpn 双释放线姊妹条）**：把临时 struct/array 字段里的 managed str 存入长生命周期容器（全局表、arena 外槽位）而不 CloneStr，ORC 下必 UAF/二次释放。规则：所有权移交边界一律 `strings.CloneStr` 显式深拷贝；热表用裸字节 arena（定长 stride+NUL 补齐+LE 标量）彻底绕开托管语义——本线 fake-DNS 表与会话表两次验证此模式。

- **C 桥 pthread 栈默认值陷阱（2026-08-26 核心重编崩溃根因，已修复）**：bionic `pthread_create(attr=0)` 默认栈 ~1MB，而 cheng 冷函数帧可达数 MB——Java 侧 Thread(size) 设大栈救不了 C 桥起的线程。规则：任何从 C 起线程跑 cheng 代码的桥，必须 `pthread_attr_init + pthread_attr_setstacksize(64MB)` 并对 attr API 返回码硬失败；运行时已有 bigstack 变体时优先复用而非新写 trampoline。

- **VPN 开关=Chrome DnsConfig 刷新钥匙（2026-08-26 验收手法）**：冷启 Kiwi 会硬锁 DNS_PROBE_FINISHED_NO_INTERNET 且不再发包；保持 Kiwi 存活，开关一次 VpnService（off→on），Android 网络变化广播即触发 Chrome NetworkMonitor 重建解析器，下一页立即恢复。验收序列：确认 mCurrentFocus 含包名→tap 开关→等 rules 恢复→再加载页面；Chrome 负缓存约 1 分钟，失败页需再刷一次。

## r26 set_window f64 参数准入：业务侧零出路的机制级证明（2026-08）
- 现象：void fn 的未用 f64 参数 param-load 被 body-store-freeze 准入拒绝；uint64/int32 未用参数不触发。
- 实验矩阵：裸 echo 消费被 DCE 剥离；存入从不读取的全局被剥离；卫语句 `if !(scale > 0.0): return` 的比较 op 同样 consume=0 被拒。
- 机制结论:DCE 在准入前折叠一切非观察副作用，checker 只认观察消费者（读回全局/@exportc 调用/返回值）。给未观察参数"造消费"只剩捏造语义一条路，违反禁兜底原则。正确修法只在车道侧：准入放宽或 DCE 前置死参剔除。
- 方法教训：判定"业务侧能否绕过"时，必须逐类实验（值消费/存储消费/控制流消费）证伪，而不是凭一次失败下结论；但全部证伪后应立即停手，不要滑向取悦 checker 的语义发明。

- **bash 工具 heredoc 禁令靠自律不靠记忆（2026-08-27 VPN 线）**：本会话两次用 <<EOF 追加文件才自我纠正。规则：任何文件写入一律 str_replace/Write 工具落盘或 python3 -c 单行，bash 内联禁止 heredoc/多行脚本（dsh 持久终端靠提示符判界，瑕疵即死等超时）。
- **同机多 supervisor 抢端口：装新监督单元前必查 enabled 单元（2026-08-27 VPN 服务线）**：dosg 上遗留 cheng-vpn.service(--config 形式) 未被发现，与新 cheng-hy2-tun.service(exit 形式) Restart=always 互搏 7443，NRestarts 累计 419、混沌实验测的是内战不是产品。规则：任何机器装 systemd 服务前先 `systemctl list-unit-files` 查相关名 + `ss -ltnp` 查端口既有持有者；同类同端口单元只留一个，其余 stop+disable。
- **fake-ip 表必须有 LRU 驱逐（2026-08-27 VPN 线）**：固定容量 fake-DNS 表 + 长会话 = 表满后所有新域 a=0.0.0.0，应用假连接永不自愈（Chaos-2 判定 FAIL，UI 仍显示已连接）。修复三原则：槽位 lastSeen 时间戳、表满驱逐最久未用、驱逐后探测必须回绕 host 池（线性探测只向上走会棘轮式漏掉下方空闲槽）。
- **服务稳定性探针必须端到端（2026-08-27 VPN 线）**：restart 后 EADDRINUSE crash-loop ~65s 期间 `ss -ltn` 端口监听缺位，以端口存活做健康检查会漏报/误报；健康判定一律用端到端请求（curl 真实目标）。root 依据：无 SO_REUSEADDR 时 TIME_WAIT 残连即令 bind 失败 20 次连败（RestartSec=3s × 20）。

- **数据面拨号失败必须 fail-fast 上报终态（2026-08-27 VPN Chaos-3）**：TUN 单线程循环里出口拨号持续失败时，若只 RST+删链+吞错继续，应用会"假连接"（UI 已连接、新流量全死、监督者收不到任何信号、永不自愈，Chaos-2 实测 20+ 分钟）。修复：连续 3 次 EnsureRemoteOpen 失败且跨度 ≥30s → 清链+停 runtime+return Err → 终态走既有监督重启链自动重建会话（Chaos-3 实测服务端恢复后 81s 全自动回到 204）。规则：任何长驻数据面循环，持续性资源不可达必须在阈值后向上抛终态，由监督者重建刷新全部句柄（网络句柄/DNS 表/会话表），而不是原地吞错。

- **拨号阻塞主循环 → netd 拉黑 VPN DNS → 全网络污染假死（2026-08-27 VPN 线最深机理）**：TUN 单线程数据面里同步出口拨号（3.4-11s）阻塞期间，排队的 DNS 查询超时，netd 把 VPN DNS 服务器（198.18.0.1）标记为坏——该状态持续整个 VPN 网络生命周期，此后一切解析落到蜂窝明文被 GFW 污染（google→Facebook 段 IP），应用感知"网页打不开"，只有重建 VPN 网络（开关一次）才重置 netd 状态。这也是"需要手动开关 VPN"的隐藏机理。判别方法：`ping 域名` 看返回 IP——198.18.x=健康 fake-ip；真实/污染 IP=netd 已拉黑。根治=数据面异步拨号（拨号等待中继续服务 DNS），任何会话级重建都不重置 netd 状态。
- 【2026-08-27 reissue256】通道对齐族第十二例：frozen 分类器收窄（stamp 判定）后，所有"记录列 vs 再推导"读取面要一次排全——merge 代表腿是缺陷 C 第四出门。方法论：work 副本注入定向探针（函数名+行窗双门控 env），真实树零残留；跨跑 stderr 确定性必须剥离他线 ungated 探针行与 intern TypeId 漂移位后再 diff，否则把环境噪声误判为 nondeterminism。

- **共享工作树禁用整文件回滚命令（2026-08-27 密码学会话误滚他会话未提交改动）**：`git restore <file>`/`git checkout -- <file>` 会把同文件内他人未提交改动一并抹掉且 git 不可恢复。规则：多会话共用一棵树时，撤销自己改动只能 `git apply -R` 精确反向自己刚打的补丁；任何整文件回滚先 `git diff <file>` 确认只有自己的 hunk。

- **cold 宽容 ≠ Cheng 规范合法；他线热文件的"非法形"先停等不抢修不放宽（2026-08-28 entry-bridge-wall 第二十七墙弯路）**：primary_object_plan.cheng 两批 hoist 合并残留同 scope 重复 `let`（17 名）+ 重复 `@borrows`，cold 对拍全编过（遮蔽语义 exe rc=2、@borrows 幂等），据此误判 parser duplicate 判词过严，放宽三处 parser（词法绑定插入侧/validate 遮蔽放行 + @borrows 幂等）并迁源码去重。主代理裁决：判词为 7 月既有门禁、拒绝合法，重复是他线 WIP 半成品，全部回退（sha 复原核验）停等他线收敛。规则：① cold 接受只证明 cold 宽容，规范合法性以 docs/cheng-formal-spec.md + Cheng parser 既有判词为准，对拍只用于证伪不用于证"合法"；② 他线 10 分钟内热改的文件撞"非法形"，默认 WIP 半成品停等（mtime 稳定 ≥15min 且形态消失再复推），严禁抢在他线收敛前修源码或放宽判词；③ 自己打出的放宽/迁移补丁回退后必须核 sha 复原到改前值并与他线工作区逐字节对账。

- **held-CLI 扫描的主导成本是重复 canonicalize，不是 merkle（2026-08-29 UniMaker extract 提速 18.3min→5.2min）**：838k facts 实测（69k 样本外推+全量验证）validate 11.2min / fact-identities 3.2min 中，每行 1-3 次 JSON canonicalize 占大头，field-scan、patricia 树构建、sha256 全部线性且便宜。修复走 EncodeVerifiedLines 同构先例：cli.cheng validate/fact-identities 新增 `--canonical-input`（caller-proven canonical 契约，sandbox only），bridge stableJson 输出本就被 pack 读端全量校验接受，省掉全部重复解析；CsgCoreValidateCanonicalFactLines 走 canonicalLinesProven 路径直接 BuildBoundFromCanonicalLines。输出与旧路径逐字节一致（69k 对拍 + parity 测试）。两个坑：① 单进程 merged-scan 会把 identities 输入绑到 TS context build 之后，丢掉 validate 与 web-build 的重叠——双进程双 flag 保留 Promise.all 才是最优时序；② 同机多会话下 cli.cheng 会被他线还原，编辑前先 git diff 核基线，编译前再核一次。主仓 artifacts/bootstrap 被清理时可临时用 cheng-patches 下同日期同大小 stage3 副本编译（one-click 用 --cheng 传路径）。

- **密码学 driver 编 VPN core 的借债/投影墙清偿定谳（2026-08-30 会话，a053f0006→f5745f478 树上）**：HandleExitConn 借债链六函数（Sha256Hex/AuthMatches/ServerCcRxText/RequireServerHy2Config/Hy2ServerAuth/HandleExitConn）@borrows 后逐轮浮现 20+ 墙，全数清偿，收敛到最后一个墙 `initMsQuicTls13HandshakeMessagesInto`（新 provenance 证书审计拒绝 `out.items[i] = Fresh()` 的 var-out 发布，5 种形全试尽：loop-store/MessageClear 循环/CopyInto 循环/独立函数/while/32 行静态展开，审计均死）。已验证形状定谳：① 借用 var 形参根读 → 非 @borrows 值形参 = 拒（薄包装对首选拼 @borrows，std 级联深则调用点 CloneStr/BytesSlice fresh copy）；② @borrows 调用结果赋 local = plain copy 拒，直返 Ok(borrowed) 也拒，正解=var 根中转（var x: T; x = local.field; return Ok(x)）；③ 字段实参喂 mover 构造器（QpackMakeHeaderField/MakeUdpMessage/MakeAuthResponse）= 调用点 CloneStr，构造器本体不能 @borrows（结果会藏借用）；④ @borrow_result（BytesFromString）结果 = 视图，赋 local 拒、喂 @borrows appendBytes 可、喂非 @borrows 拒（fresh copy 一层）；⑤ 整结构进数组槽：MessageCopyInto(out.items[idx], msg)（@borrows var-out 槽位形，idx 先落 local）过；同一循环挂在别的函数体内审计死，函数体形状敏感；⑥ var-out rootpub 拒绝在 ClearTrustRoots 处可恢复（recovery=1 警告级）但同类在 initMessagesInto 处致命——审计严格度随上下文漂移，勿据单点判定宽严。剩余墙归属精确定性：同形最小复现（TmpMessage[32]+Fresh 循环 store）独立编译通过 → 形状本身可认证，失败只在完整模块上下文（rootpub 的 arm_pfr 漂移 3813↔5485 跨 pass、root_epoch 全局态跨函数残留），即 cold_parser.c/cheng_cold.c 他线未提交的 provenance 证书/reissue 机制（+933/+1010 行）的上下文缺陷，归属编译器会话收敛；.cheng 侧已尽，勿再盲试形状。最终根因（插桩实证）：失败定义的 rootpub 臂 origin_id 自指（arm_org=0=arm 自身，两跳投影的 FIELD_REF 基座未物化成独立 op），致 arm_reads_root_cell（op_a=0≠value_slot=1 且 chain 走 op_a 作 op id 自环）与 projection_parent_valid（0<0 假）双零；bpfr==arm_pfr 排除行漂移理论；同 body 两次审计 arm_pfr 读出 3813/5485 两个值证明 body 被双 pass 编译、跨 pass 证书态残留（root_epoch=1）。修点=emit 侧把 FIELD_REF 基座物化为独立 op（或 reissue 对 self-origin 臂按基槽=根形参补认证）。诊断工具：CHENG_COLD_DUMP_BODYIR=<fn 子串>（BodyIR dump）、CHENG_COLD_DUMP_VAR_FORWARD=1（vomis/BASE/vostage 门级诊断）。

- **内存守卫 trip 禁抬帽，根因优先（2026-08-31 kernel 用户路径清墙战役，用户指正）**：cold_nested/call_fixture 编译峰 RSS 实测 1027-1094MiB 贴 1GiB 正式守卫，派发提示词曾允许「文档化 env 抬帽作诊断复验」。用户裁决：抬帽只是把问题推给未来——管线深度与审计层继续叠加，超限夹具只会越来越多。规则：① rc=125 RSS 守卫 trip 后，正式结论一律在默认帽下取数，抬帽最多作一次性定位辅助且必须伴随根因数据（相位计时/arena 高水位/BodyIR arena 事件流 CHENG_COLD_MEMORY_MANIFEST_OUT）；② 内存根因线（定位增长点并修复）是终验收前置项，未闭合前相关夹具不得宣布绿；③ 新增审计层/证明列须计入 RSS 预算，回归门逐夹具报 RSS，四夹具全绿后 RSS-BUDGET 升级为硬门。

- **桌面线双教训：churn 根因链 + 夹具按值传记录的假损坏（2026-09-02 LIVE_MIRROR 收尾战役）**：① WebLayoutTree 每换 RSS 漂移 363KB/换的真凶不是树本体（SoA 数组 setLen(0) 保容量即平），而是查找加速映射（按 nodeId 索引，nodeId 可达 10K+）每换截断后从 8 倍增重建 + RefreshRoute 全新 nextBoxes/paintOrder + paintOp CloneAt 字符串克隆——修法=持久单例树+ResetForReuse(setLen 保容量+box 映射 -1 哨兵失效)+就地压缩+直写，250 换漂移归零；② 追查「补丁路径 ORC registry_miss 假损坏」数小时，真凶是测试夹具 `fn Cmp(session: BrowserSession, ...)` 按值传整个托管记录——位拷贝不增引用、函数返回析构释放调用方仍持有的数组，症状为构建实例间非确定性中止（堆布局依赖），与产品代码无关。规则：① 排查内存问题先二分相位（建树/回写/补丁分开计时），漂移量对上分配量再定罪；② 任何含托管字段的记录（含 str/seq 字段）一律 var/@borrows 传参，严禁按值；③ 「同代码时而中止时而通过」优先怀疑未初始化局部或按值托管拷贝，不要先怀疑编译器。

- **增量图补丁的三级架构与语义地雷（2026-09-02 同战役）**：L1 盒区等值跳过（header capture-ms 每换必变，等值判定必须剥 header 只比盒区，零分配 O(bytes)）；L2 窗口补丁（前后向锚定 diff，新文本盒 k 对齐旧文本 k-delta，插入只移动窗口不移动全尾；窗口>半数回退全量；窗口重解析用合成 header 复用 SnapParseBoxes 单一事实源）；L3 全量回退。地雷：① slot→slot 记录拷贝在托管字段上会双重释放（store=release旧+位拷贝不增引），必须逐字段 ConcatStr 深克隆（CloneStateString 同理）；② 编译器拒绝可能重叠的 var 形参同调用——用 stage 局部中转；③ 模块级带初始化 var/let 不支持——字面量用 fn 返回；④ 借用权威沿调用链传播：@borrows 调用后实参降级为借用，同函数内不能再按值移交——跨模块桥接用一次性 owned 拷贝；⑤ 借用实参要求精确来源（参数/字段/静态字面量），call-result 局部不行；⑥ 编辑前 Read 文件再 Edit、patch 脚本必须验证锚点落地（本役 python open('wb') 先截断后抛错清零过测试文件）。

- **C 车头 emitter 确定性缺陷的绕行边界（2026-09-09 终）**：非确定性 body-missing 函数（同源码时绿时炸）用重试至绿绕行有效；确定性 body-missing 函数（同一函数 4/4 必炸）重试无效，且以任何方式重构/绕行该函数体都会让发射器在后续函数继续塌——此时唯一出路是修 emitter 本体或回退触发布局变化的编辑。判别法：同函数重试 3 次全败即确定性，立即回退并归档，勿再消耗烤机轮次。

- **「确定性 body-missing」机制定谳反转：不是发射器丢体，是 add() 所有权门禁被吞哑伪装（2026-09-10 RSI 战役 C 线判词 48，推翻上条 9/9 的机制归因）**：三级链——① `add(托管seq, 借用源)`（如 `add(cloned, layer.scopes[i])`，元素含 str 字段）触发 `parse_builtin_add_after_name` 所有权门禁 die（cold_parser.c:86309 起，die 点 :86392，"add(value) borrowed source requires explicit share"）；② import 体急切解析对失败函数静默 continue、体不落 store（cheng_cold.c:79410-79426）；③ 惰性直析重析再撞同一门禁，longjmp 被转成 `cold_die_missing_reachable_body`（cheng_cold.c:74122）输出 "reachable function body missing" 误导定性。T2 纯布局改写（零 add）全 CLI 编译绿（1194s 串行）证伪「布局敏感」。新判据：撞 body-missing 先看 stderr 有无「真实门禁行与缺体行共存」（铁证）；改写是否引入 add(托管seq,借用源) 形状才是开关，合法迁移形状=share() 显式共享（s14 实证绿）/字段级 owned 拷贝（s12 实证绿）。上条「重试 3 次判别法」操作面仍有效。欠账归编译器战役：cold_die_missing_reachable_body 转换点必须透传真实门禁文本，禁止把门禁拒绝伪装成缺体。
- **match 是语言关键字不可作变量名；TcpListenerWaitReadable 超时返回 Ok(false) 非 Err（2026-09-10 RSI 适配器线）**：① 命中类局部命名用 hit/matched；② std net 确认语义后按 `Ok(false)` 门控 accept/继续读，勿按 Err 分支写超时逻辑。

- **计划书修订必须标清事实同步范围（2026-09-10 用户指正）**：追加附录不代表正文中的专利状态已更新。取得公布与实审通知书后，按用户要求同步正式PDF、同内容镜像和Markdown，并分别列明申请人；不得将“进入实审”写成“已授权”，不得把关联公司申请自动写成融资主体自有权利。

- **融资计划书不主动写推算估值（2026-09-10 用户指正）**：保留拟融资金额和拟出让股权比例，删除投前、投后估值及其计算说明；由读者自行计算，后续版本不得自动补回。

- **计划书删除人员薪酬推算段（2026-09-10 用户指正）**：删除“世界视频人员138万元包括……”至“归入共同底座与经营”的整段岗位年薪拆分说明；保留预算表，不在后续版本自动补回该段。

- **AI直出二进制的CSG用例聚焦不可审查风险（2026-09-11 用户指正）**：用户关注的是AI交付的可执行文件可能含隐藏后门或潜在安全风险，人类难以完整审查。回答应聚焦用户批准的行为合同、实际二进制与合同的独立对应证明，以及不可绕过的执行约束；不要扩散成一般代码生成效率讨论。CSG/Merkle或模型自述不能自行证明无后门；保证仅限明确建模并验证的性质及可信执行假设。

- **共享热文件禁止「整文件安装」（2026-09-10 实测，与 `git checkout --` 同类事故的第二次发作）**：`src/core/backend/primary_object_plan.cheng` 在 21:5x 实测 `git diff --numstat` = 84 行脏，22:00 某线用 `cp` 装了自己「pristine + 自改」的整份文件后降到 27 行（现 32+/5−）。工作树改动不进 git 对象，被整文件覆盖顶掉的中间态**不可逆**。纪律：共享热文件只许「生成 patch → `git apply` 带上下文校验」，冲突就停下上报，绝不 `cp`/`checkout --`/`restore`/整文件 `stash`；撤回自己的改动只走逐行 Edit。整文件安装前后必须留 `git diff --numstat` 存档，否则事后既不能定责也不能还原。**本案已平**：`pristine`（sha `87ecef8d…`）与 `git show HEAD:文件` 逐字节相同，加上安装者留存的中间版序列（probe5=57+/4−、probe6=29+/9−、probe7=34+/1−、**probe8=76+/8−=84** 精确等于采样值）⇒ 是其**自己的探针版被自己的无探针终版替换**，无第三方内容被抹；两个被怀疑的审计代理均书面否认写入且无可还原副本。真实失误在流程（19:51 验过一次干净后连装约 10 版均未复验），故 patch 通道为硬规矩。

- **文档里的 `文件:行` 锚点会静默切错函数（2026-09-10 实测，一天内两次踩）**：S1a 入库（`f92f573f2`）使 `compiler_csg.cheng` 整体后移约 +28 行（`f92f573f2^ → 0b37f7ea7` 实测 +71/−53）、`typed_expr_type_arena.cheng` +323 行；全树普查 74 个锚点/20 份文档，**11 条已跨到别的函数**实现上（最隐蔽的只差 **4 行**：`primary_object_plan.cheng:65411` 已落到 `PrimaryPlanSymbolRowForTypedFunctionIndex`；最离谱的差 **+3835 行**，是一个月前写的文档）。规律：**last_touch 早于该 commit 的文档一律不可直接用；但 post-commit 的文档也可能带旧号**（从早期草稿抄前造成），只按时间筛会漏。两条纪律：①凡写锚点必须注明**锚定时刻的 HEAD**；②**引用任何 `文件:行` 前先 `grep` 点名符号的当前定义行**再落笔，肉眼对不出 4 行漂移。历史回执里的过时结论**只加就地更正标注、不删原文**（回执是证据，改结论等于伪造）。

- **等价判词会被"旧产物"伪造：不对拍 rc 就会拿陈年 sha 自证等价（2026-09-10 深夜实测，代理自首撤回）**：探针轮打印了 `BYTE-EQUALITY-OK`，但那一轮 `kd_probe` 根本不存在，三个夹具编译全是 **rc=127**，脚本去哈希的是 21:56 遗留的 `fixtures/*.exe` ⇒ 把旧 sha 又算了一遍、结论完全无效（已作废）。加固三件套（缺一不可）：①判等价前 `rm -f` 目标产物；②**每个夹具必须 rc=0，否则直接 abort 不判等价**；③被验证的驱动不存在就 `exit` 非零、绝不进入判词分支。通式：**任何"相等/通过"判词的分母必须是本轮新生成的产物，且生成侧的退出码要作为前置门**——否则测的是上一次的自己。同一轮里另有一条：patch 给被调函数加参数时漏写 `@borrows`，bake 立刻 `borrowed call argument rejected` → `reachable function body missing` 硬失败（`lease_hits=0` 说明不是租约、是自身所有权错误），这类失败**先查自己的 patch 再怀疑环境**。

- **埋点位置要用 before/after 对照证明可达，否则写的是死码（2026-09-10 实测）**：`compiler_csg.cheng:38922` 的 `type_arena/typed_ir/facts` 内存埋点被放在 `TypedExprIrBindExactTypeArena` **之后**（arena 已被 move 走），before 驱动实测 `tag=type_arena` 命中 **0** 次——此前「TypeArena 测不到」不是缺数据，是埋点在不可达处。位移到 arena 仍在本体上（38912-38920）数字才出来，三夹具 sha256 before==after、驱动 rc=0/196s→197s，零代价。规则：新埋点先证「旧址命中 0 / 新址命中 N」，再谈数据；同理，任何"未测到"的结论先排除埋点不可达。

- **并发互斥不能用协作旗标（check-then-act 必竞态），且原子树租约不覆盖顶层自烤（2026-09-10 实测）**：两个 lane 依 `.PAUSE.flag` + `ps` 判空后**同秒双起**自烤；同轮 `lease_hits=0` 说明 workspace 原子树租约管不到顶层 kd 自烤。正确原语是 `mkdir .rebuild/COMPILE_SLOT.lock`（mkdir 原子 test-and-set，成功即持有、失败即退让），锁目录写 owner pid + 起始时间，退出 trap 删锁，清陈旧锁前必须确认 owner pid 已死。另：清残留进程只许按 pid 杀自己的，`pkill -9 -f <通用名>` 会误杀他线（本轮实测杀掉 B5 的夹具运行）。

- **"对齐 canonical"必须先核对形参语义方向，抄字面值必反（2026-09-10/11 实测，本席自己批准的错误修复）**：池化镜像 `primary_object_plan.cheng:67711 primaryLowerPoolRangesCoverTail(..., requirePositive)` 里 `requirePositive=true` 表示**禁止**空行，语义等价于 canonical `core_types.cheng:3287 bodyIRCleanupRangeValid(..., allowEmpty)` 的 `allowEmpty=false`——**两者方向相反**。canonical `bodyIRCleanupScheduleUnitRangesValid`（`core_types.cheng:6631`）对 local/op/call/block/term 传的 `allowEmpty` 实为 **`true,true,true,false,false`**；修复时把这份字面值原样抄进 `requirePositive` 形参位，得到 `true,true,true,false,false` ⇒ **五个域全反**（canonical 允许 local/op/call 空行而镜像禁止，反之亦然），合法 body 被判坏帧、`pv_fail stage=68` 的 `schedulePresent` 恒假。三条规则：①镜像 canonical 前先写一张**形参语义对照表**（本侧 true/false 各表示什么、对方 true/false 各表示什么），再定传值，**绝不抄字面值**；②"某处实参传反了"这类转述**必须回源读 canonical 的定义体与全部调用点**才可采信——本席当时采信了转述（恰好反了）就批准落盘，属审批失误；③这类反转**不会被"已通过的夹具"抓住**：已绿的 ordinary/call 走 `scheduleEmpty` 空臂、从未进入该判据，present 臂在仓内**零测试覆盖** ⇒ 修完必须指出一个真正走 present 臂的夹具，否则等于未验证。

- **任何"控制/判据/门禁"都必须先自证"覆盖到了被测对象"，否则它是零信息（2026-09-10/11 一夜里同一坑踩了三次，三个不同机制）**：
  ① **旧产物冒充本轮结果**：探针轮打印 `BYTE-EQUALITY-OK`，但那轮驱动根本不存在、夹具编译全 `rc=127`，脚本哈希的是几小时前遗留的 `fixtures/*.exe` ⇒ 把旧 sha 又算了一遍；加固=判等价前 `rm -f` 产物 + 夹具必须 `rc=0` + 驱动不存在即非零退出。
  ② **路径 bug 使输入根本没被编译**：负例控制两侧 `rc=2/wall=0s`、`stderr_cmp=IDENTICAL`，看似"行为一致"，实则 stderr 只有一行 `entry module identity unavailable`，而路径是 `$ROOT` 拼到绝对路径上形成的**双根路径**（`/Users/x/repo/Users/x/repo/...`）⇒ 比较的是两条同样的路径报错；加固=最终 `--in:` 值先 `test -f` 断言存在再交给驱动，且负例必须在**未修复侧**真的打出目标判据（如 `authority_invalid>0`）才算数。
  ③ **门禁的覆盖盲区被当成判据**：为在 `codegen_contract.cheng` 内选 A/B 两个变体，用"`declared==actual` 与 token 计数自洽"作判据——但该文件在 `ARCH_TOKEN_CONTRACT_FILES` 内，`scan_strict_arch_tokens` 对其**直接 `continue`**（token 零覆盖），两变体门输出**逐字节相同** ⇒ 拿盲区选型=假绿。换的真判据=**调用方新增 import 面**（静态可判定、且不在盲区内）。
  通式：**判据本身也要被验证**——先问"这一步真的执行/覆盖到了我想测的东西吗"，再看它的结论；报告里凡写"通过/一致/已覆盖"，必须能指出**被测对象被真正触达的证据**（命中计数 >0、新生成产物的 sha、覆盖率或路径断言）。

- **超过理论内存/理论编译时间的状态一律按「病态」处理（2026-09-11 用户裁定，红线）**：理论量（内存门 `805,306,368 B`、编译理论并行下限 `compile_theory_parallel_limit_ms`）是**模型边界，不是难度旋钮**。运行时一旦超过，必须记为**缺陷并给出超出倍数**，不得写成"可用状态"、不得记作中性观测，更不得据此宣称达标。派生三条：①**抬门只许用于发现缺陷**（把门后面的因果链看清），全部轮次标 `diagnostic`，且其运行状态本身就是病态证据（抬门后 peak 2.0–2.3 GB ⇒ 超理论门 2.5–2.9×）；②凡"通过/可用"判词，若其运行状态曾越过理论边界，**判词无效**——先消解病态再谈达标；③当前已判定病态并须逐条消解：pass0 森林 Σ=1.53× 门线、pass0 活块 +171.9 MB（末态占门线 96.9%）、并林窗峰 2.62× 门线、编译实耗 13.641× 理论下限、append 同族站点冗余流量（第三处未修）。内存达标线只有一个：**默认 768MiB 门内全量 234 源跑完并林**。

- **校准测量必须落在被测对象的执行路径上，否则它只能证明"非回归"（2026-09-11 实测，本席自己提错的要求）**：我要求"用 ①+② 在位再跑一次默认门全量，把 13.1 MiB 的模型缺口校准成实测值"。结果**结构上不可能**——`work.typeArena` 是在**并林之后**（`compiler_csg.cheng:39010` `CompilerCsgTypeArenaFinalizeParserForestInto`）才建的，而默认门全量死在**并林 pass1 `src=24`**，TypeArena **一个字节都还没分配** ⇒ ② 消 doubling 垃圾的收益**在这条路径上不存在**。那一轮数字（`kd_r3` vs 同窗口 `kd_prev`：`max_live` 差 56 个分配=0.0014%、死点同源同阶段、`ta_limits` 埋点照常产出）**只能证明非回归**，不能校准缺口。规则：**要测的项若在死点之后才执行，就换口径（模型 + 精确总量，或把路径拆到能跑完的闭包），别指望"多跑一轮就有数"**；同理，看到"新改动没让数字变好"先问一句——**它的收益点在这一轮的执行路径上吗？** 不在，就不是"无效"，是"测不到"。

- **冷编译器 panic 不值靠猜：`<driver>.map` 能解全栈，lldb 反汇编能定位到指令级（2026-09-11 实测，一次把 5 个候选缩到 1 个）**：自烤驱动的 panic 栈只显示 `cheng_cold_<hash>_<N> + offset`，看着不可解；但同目录的 `<driver>.map`（头 `cheng_line_map`）逐行给出 `entry\tcheng_cold_<hash>_<N>\t<源码限定名>\t<file>\t<startline>`。用 `awk -F'\t' '$2 ~ /cheng_cold_<hash>_<N>$/ {print $3, $5":"$6}' <driver>.map` 一次性解出全部帧（本次解出 `system.panic ← parser.ParserValueExprTypeSyntaxColumnAt ← …KindAt ← typearena.typedExprTypeArenaInternSyntaxRec ← …AppendSourceFromTreeInto ← ccsg.CompilerCsgStreamTypeArenaFromDeclarationIndexInto`）。再加 `lldb --batch -o "target create <driver>" -o "disassemble -n <symbol>"`：**帧偏移 + 返回地址直接给出是哪一条 `bl`**（`#4 +540` ⇒ `+536: bl _3988`），而崩溃点前后的 `ldr/sub/cmp` 能把"Cheng 源里的哪个表达式"还原出来（本次还原出 `treeRow = [sp,#0x68] − [sp,#0x6c]` = 第 6/7 形参相减，即源里的 `typeSyntaxNodeIndex − viewTypeSyntaxBase`）。**顺带挣到的一条代码事实**：该函数的循环守卫只从**上方**设界（`index >= base + count` 才返回），因此 `treeRow < 0` 这一支**不在守卫覆盖内**——看"有守卫"不等于"边界全封"，逐条对析取项。规则：panic 调查第一步永远是 `map` 解符号，第二步是反汇编钉指令；在拿到这两个之前不要写"根因可能是…"。

- **★插入点劈开 `@` 注解 = 静默的所有权翻转（2026-09-12 实测，代价：11 炉驱动全废 + 约 1.5 小时归因）**：一个诊断探针补丁把插入点放在 `@borrows` 与它修饰的 `fn` 之间（补丁上下文行是 ` @borrows`，紧跟着 `+var ...TraceInitialized: bool`）。结果是**注解仍然合法、语法全对、`git apply --check` 通过、C 链烤机 rc=0**，但那个包装函数**静默失去了 `@borrows`** ⇒ 它从"借用 `manualTree`"变成"**拥有并释放** `manualTree`"，而调用者仍在同一圈里释放同一棵树 ⇒ **每次编译都双释放**（`cheng_orc_release_failure code=registry_miss operation=normal_release detail=wrong_object_or_owner`），连两行 `fn main(): int32 = return 0` 都编不过。**判据**：函数机器码尺寸 `244 B/1 BL → 268 B/2 BL`（多出的是 `cold-drop-object`）。**防法（已写成 `AGENTS.md` 工程规范第 10 条）**：① 补丁 apply 前跑 `python3 .rebuild/s1b_step3/r9/patch_preflight.py <patch>`（1 秒，专查"`@` 是否紧贴声明 + 空套件 + 括号平衡"——本事故它一跑就命中）；② 新驱动烤完立刻跑金丝雀（两行源 + `ordinary_zero_exit_fixture`，两个都必须 `run_rc=0`）；③ 探针插入点只许选"函数与函数之间"的块边界，插入块自带完整注解。

- **★撤销补丁禁用"按文本删除新增行"（2026-09-12 实测，同一次事故的第二段）**：为了摘掉上面那个探针，我写了"对每个新增行文本，删除文件里前 N 次出现"的脚本。因为新增行里含 `@borrows`、`        return`、`        os.WriteLine(os.Get_stderr(),`、`    if index == nil:` 这类**通用短行**，脚本删掉的是**别处的同名行**：一个 `if` 体的唯一语句 `return`（→ `PARSER_EMPTY_SUITE_FORBIDDEN`）、两处 `os.WriteLine` 续行、`typedExprManualConsumeAppendText` 的 `@borrows`、以及 `typedExprBuildIndexEntryCount` 的 `if index == nil:`（→ 该函数**恒返回 0** ⇒ `FindEntry` 的 `entryIndex >= entryCount` 退化成 `>= 0` ⇒ `corrupt structured entry chain`）。**防法**：撤销一律 `git apply -R <冻结件>`；若因补丁已被手工改过而 `-R` 失败，**正确做法是把补丁重建到与树一致**（`.scratch/` 副本上重新生成），**不是改树**。归因受损时一律用**二进制/结构指纹**（函数机器码尺寸、BL 计数、输入闭包行/字节数），**不要用 mtime**——并发 lane 的改动会被自己的编辑覆盖掉时间戳，我因此白查了一轮。

- **★符号链接农场会骗过 `O_NOFOLLOW|O_DIRECTORY`：副本根里"看起来是目录"的顶层项必须是真目录（2026-09-12 实测，代价：一轮金丝雀＋一轮矩阵的误判时间）**：为了在不碰并发 lane 的前提下验证自己的改动，我用 APFS 克隆 `src/` + 符号链接其余顶层项造了副本根。驱动随后在**每个**输入上死在 `os atomic tree: destination open failed`（rc=2），看起来像"新驱动坏了"。真相：`src/core/tooling/compiler_snapshot_lowering_bridge.cheng:45` 的 `.cheng-csg-envelope-<sha256>` 被驱动用 `openat(dirfd, name, O_RDONLY|O_CLOEXEC|O_DIRECTORY|O_NOFOLLOW)` 打开，**`O_NOFOLLOW` 只看最后一段**：真目录没问题，符号链接（哪怕指向目录）直接 `ENOTDIR`，而驱动把"非 ENOENT 的失败"一律报成上面那句无路径的模糊错误。**判据与利器**：`DYLD_INSERT_LIBRARIES` 的普通导出**拦不住**绑定到 libSystem 的 `openat`（两级命名空间），必须用 `DYLD_INTERPOSE` 段（`.rebuild/s1b_step3/r9/openat_trace.c` 里 `__attribute__((section("__DATA,__interpose")))`），它能打印真实 `dirfd/errno/path/flags` 与 `fstatat` 跟随后的 `st_mode`；配 `fstatat` 结果一比就看出"是符号链接"（`st_mode` 是目录而 open 报 ENOTDIR）。**规则**：造只读镜像根时，凡会被 `O_NOFOLLOW|O_DIRECTORY` 当**最后一段**打开的名字（本例 `.cheng-csg-*` 共 39 个）一律克隆成真目录，其余可符号链接；诊断"疑似新驱动回归"前，先用 interposer 拿到真实路径，别急着怀疑自己的改动。

- **★镜像根（只读克隆）在自举编译器上不可行，别拿它当"干净的验证环境"（2026-09-12 实测，约 1.5 小时）**：为了让"我的改动"与"别人未完成的探针"分开验证，我试了 5 种镜像根组合，全部死在**与我的改动无关**的地方：① 顶层项全符号链接 → `.cheng-csg-envelope-*` 被 `O_NOFOLLOW|O_DIRECTORY` 打开报 ENOTDIR（驱动只吐 `os atomic tree: destination open failed`，不带路径）；② 克隆 `.cheng-csg-*` + 其余符号链接 → 克隆件里带**真实根绝对路径**；③ 只留 `src` + manifest → `missing provider compiler/current stage3`（provider 编译器按 `artifactpaths.ArtifactStage3Path(rootDir)` 解析）；④ 再克隆 `artifacts` → 仍报 `cheng_cold: cold source snapshot source path leaves package root`，而且打出的 source 是**真实根**路径；⑤ 加上"驱动住进镜像 + 每轮重建"后依旧如此。**结论**：自举链的根是从**可执行文件 / provider 编译器自身位置**推出来的，不是从 `--root`；换根等于把整条工具链搬过去，"轻量镜像"省不了事。**替代方案（本次采用）**：在真树上**临时反向**对方那条未完成探针 —— 先逐字备份该文件，窗口内烤/门，收尾时**哈希守卫还原**；若期间对方改了文件，脚本**拒绝还原**并保留我的副本与差异补丁，绝不覆盖（`.rebuild/s1b_step3/r9/probe_window_r9.sh`）。

- **★`patch` 会自动反向，并把 stdin EOF 当"同意"（2026-09-12 实测，造成一轮假 LOST）**：对**已经应用过**的补丁再跑 `patch -p1`，它打印 `Reversed (or previously applied) patch detected! Assume -R? [y]`，无人值守时把 EOF 当 y ⇒ "正向应用"实际执行了**反向撤销**，rc 仍为 0。任何"应用补丁后再比对前后状态"的工具因此会静默拿反前后镜像（我的预检就报了假的 `LOST @borrows on declaration …`）。**规则**：工具里一律 `patch -N`，并显式实现"正向失败再试反向、两向都失败即 hard fail"，不要靠 rc 判方向。

- **★烤炉的 `--provider-objects` 只吃它自产的极简 Mach-O（2026-09-12 实测）**：想用外部 `cc -c` 编出的 `.o` 去补 `@importc` 符号，烤到 provider 符号扫描即死：`[cheng_cold] Darwin provider object symbol scan failed`。原因是 `cold_read_macho_relocatable_view` 只认编译器自产对象形状（参照件只有 `LC_SEGMENT + LC_SYMTAB`），而 `cc -O2 -c` 会多出 `LC_BUILD_VERSION` 与 `LC_DYSYMTAB`。**别假设"补个 .o 就行"**：先用 `otool -l` 与一个已知可用 provider 对象对比。

- **★`@` 注解位移会重演，旧预检抓不到（2026-09-12 第二次，代价 1 炉）**：我把新函数插在 `@borrows` 与它修饰的 `fn typedExprTypeArenaSyntaxKindAt` 之间，编译立刻报 `borrowed actual cannot bind non-var non-@borrows formal … caller=…DependencyIndirect callee=…SyntaxKindAt`。旧预检检查"注解后面是不是声明"时**跳过注释行**，因此看不见"注解被新块截胡"这种位移。**已硬化**：预检比对补丁前后"注解→声明名"的**多重集**（报 `LOST @x on declaration y`），并按 hunk 报 `WEDGED`（新增块正好夹在注解与声明之间），补丁连正反都打不上时仍会报 `WEDGED`；历史坏样本留在 `.rebuild/s1b_step3/r9/preflight_fixtures/bad_annotation_split.patch` 作回归。

- **★harness 超时只杀父 shell，长命子进程会活着占住本轮 lease（2026-09-13 实测，代价半轮误判）**：我用 60s 超时跑金丝雀，harness 报 `timed out … killed by SIGTERM` 并回收了 shell，但它拉起的驱动子进程（`kd_rXX`，外层还挂着 `timeout 1800`）**继续运行**，随后所有金丝雀/烤炉都报 `os atomic tree: parent lease unavailable` —— 看起来像"新驱动/新探针坏了"，其实是 lease 被自己的僵尸占住。**规则**：每轮开工前先 `ps aux | grep "[k]d_r"`；发现残留先 kill（连同其 `timeout` 父进程），再开烤；长任务一律用 harness 的后台作业（可 `job_output`/`job_kill`），不要用短超时的前台调用去跑驱动。

- **★"留存量"必须用 `d_live`（块数）而不是 `rss` 判定，且要与 arena 的字节增长分开量（2026-09-13 实测，代价数轮误判方向）**：本战役我先用 RSS 相位差推断"并林每源留存 ~2 MB"，随后证明其中一部分只是"已释放未归还的页"。正确做法是同时读两个量：`system.MemLiveAllocations()` 的**块数**差（找"谁留住了"）与 `ArenaUsed/ArenaCapacity` 的**字节**差（找 arena 拷贝/增长开销）。实测样例：同一段解析 `d_live=+6,072 块（≈1.1 MB）` 而 `d_arena_used=+3.4 MB` —— 两者相差 3 倍且来源完全不同（前者是 arena 外的小对象，后者是列未预留导致的几何增长），只看其中一个必然误判。**并且**：A/B 比较时若两臂 `d_live` 逐块相同，那么无论 RSS 差多少，都只能归因于分配器的页行为，不能声称"减少了留存"。

- **★★探针必须覆盖被测代码的形态；且任何 ≤2 块的差值必须先放大 1000× 再下结论（2026-09-13，同一条线索三次反转换来的）**：我追 `G(k)`（并林每解析漏 ~5,000 块）的机制时，用 `MemLiveAllocations()` 跨调用取差写微复现。第一版**只测最简形态**（直线路径的局部 `seq`）⇒ 全 0 ⇒ 我据此"定谳"整条线并写了修法，随后自己发现读数取在作用域内而撤回；接着测"循环内增长"⇒ 得 1 块 ⇒ 又立；再测同族另一形状 ⇒ 却为 0 ⇒ 又撤；最后**把每个形状各跑 1000 次**（桶值封顶打包进退出码）⇒ 循环形状 ≥15、直线形状 0，**信号远高于噪声地板**，结论第三次立住并随后在真链上被独立验证（改一处循环内 `add` → 父桶 −84.53 块/解析，其余桶逐块不变）。**规则**：① 微复现的单次差值若在 1–2 块量级，**先放大 1000×**（真泄漏给 ~1000，一次性分配仍是 1）；② 对照组必须在**同一 run 内互换位次**重复，否则"某位次漏"无法与"位次效应"区分；③ 探针要覆盖被测代码的**形态谱**（直线/循环/分支/逃逸/多次增长），每得出一个"干净"结论先问"还有哪种形态没测"。**先证明仪器信噪比，再谈被测对象**——这条与"`d_live`/`rss` 不可互换"同级。

- **★探针打印"编号槽"时，标签必须从源码插入顺序自动生成；枚举调用面时不得假设"大写=函数"（2026-09-13，两次同源误判）**：① 我在 `parser.cheng` 的循环里插了 5 个 note 点做四桶归因，分析脚本里却按 `0..8` 手写槽名，而 stage-2 的 note 在源码中的**真实出现顺序是 `0,1,2,5,6,3,4`**（后插的编号是 5、6 但位置在 2 与 3 之间）⇒ 我把读数贴错标签，误判"两阶段差 45 倍"并错误撤回了正确结论。**规则**：编号槽的"槽号→区域"映射必须由生成器随补丁一起打印/落档，分析脚本只读该映射，不得手写。② 同一轮里我枚举 `ParserValueExprProcessStatementRangeWithTypeOwner` 的调用面时只匹配大写首字母，**整族漏掉了本仓约定的小写内部 helper**（`parserValueExprProcess*`、`parserForwarding*`），差点把"唯一实际工作调用"漏掉。**规则**：先扫全部裸调用 `\b[a-zA-Z_][A-Za-z0-9_]*\(` 与模块调用，再用 `fn <name>(` 索引判定是否为本文件函数。
- **★★生命周期/作用域类读数必须跨宿主作用域取；在被测对象仍存活时取的第二读数只证明"存活"，不证明"泄漏"（2026-09-13 自伤，代价：一条错误根因写进证据总账并生成两份失效 repro）**：我用 `MemLiveAllocations()` 写"局部 seq 是否泄漏"的最小复现时，把第二次读数放在了**被测函数内部、局部变量出作用域之前**：
  ```cheng
  fn Worker(): int64 =
      let before = system.MemLiveAllocations()
      var a: int32[]
      add(a, 1); add(a, 2)
      let after = system.MemLiveAllocations()   # ← 错：此刻 a 还活着
      return after - before                     # 恒为 +1，与语言是否正确无关
  ```
  由此得出"每个局部 seq 声明漏 1 块"并据此"定谳"整个 `G(k)` 671 MB 主项的根因、写了修法落点、还建了两份 repro。**改正形式**（差值在 caller 里跨调用取）：
  ```cheng
  fn Worker(): int32 =
      var a: int32[]
      add(a, 1); add(a, 2)
      return a.len + a[0] + a[1]
  fn main(): int32 =
      let before = system.MemLiveAllocations()
      let observed = Worker()
      let after = system.MemLiveAllocations()   # ← 对：此刻 Worker 的作用域已结束
      return int32(after - before)              # 0 = 已释放
  ```
  实测改正后**全 0**（seq+add / seq+显式 `=[]` / 数组字面量 / 局部 `str` / 局部 `new` 对象），即语言侧本来就正确。**规则**：凡读"分配/释放/留存"类计数，先问一句"第二次读数时，被测对象是否已经离开作用域/已经不该活着"；差值的时间窗必须**完整包住**被测生命周期，包不住就只能证明"当时存在"。**配套**：任何"根因定谳"级结论落进证据总账前，必须先写出"这个读数在什么条件下会给出同样的值即使结论为假"（即证伪条件），写不出就别定谳。


## C2 线（2026-09-13）：cheng_cold 对借用/托管转发的四类硬拒绝与「树路径提取」模式
1. **nil 不能喂 @borrows 形参**：`FunctionContractAdmission: sentinel call_arg ... cannot satisfy managed formal effect`。想给「树版 walk」传 nil 走列读分支 = 死路；正确做法是**写一个独立的列读 walk 函数**（§8.63 的 `ReplayForwardRowsFromState` 原文本就该这么做，别在共享 walk 上加模式位）。
2. **值参 ref 不能流向 var 形参**：`managed var forwarding ... lacks exact unique parameter authority`。调 `f(var x)` 的包装函数自己必须声明 `value: var T`。
3. **托管的 `str` 累加参数（`detailOut = detailOut + Fmt...`）会撞 body-store-freeze**：改为逐条 `os.WriteLine(os.Get_stderr(), ...)` 直写。顺带：把 `A = A + Fmt"...\n"` 改写成 `WriteLine(..., Fmt"...")` 时**行尾的 `)` 极易丢**（原表达式语句无右括号），编译器会报一个不相干的 `unknown identifier` 于下一行——报错行号不可信，先查最近一次机械改写的行。
4. **大 if/else 分支缩进搬运会破坏树借用的 body-store 投影**（`managed borrow projection is broken`）：含 borrow 生命周期（borrow 后 release）的代码块不要缩进进分支；提取成独立函数（原缩进 dedent 一级），借用配对留在同一帧内。**提取时**：函数体内的 `err = buildErr` 写的是宿主的 err，新函数签名必须**同时收 buildErr 和 err**。
5. **复制 walk 函数必须机械对照**：手抄 460 行的 dispatch 漏了 pending 收据三行 + builtin ctor 臂，fact 级对拍（kind/name/fixedLength/paramCount/childNames 全等）抓不住——它们证明的是「输入事实相等」，证明不了「代码路径完备」。正确工具：把两函数体 strip 注释后做**归一化 diff**（列读表达式映射回树读表达式再 diff），一轮抓出全部漂移。
6. **在 `@borrows` 函数内，把「调用结果」直接当另一个 `@borrows` 形参的实参 —— 拿到的是空串，而且不报错（2026-09-13 实测；代价：观测缓存第一版恒 miss，白烧数轮窗口）**：`strutil.Split(os.ReadFile(Fmt"{path}"), '\n')` 写在 `@borrows fn obsCacheLookupInto(...)` 内，实测 `len(lines)==1`（`split` 对空串返回 1 段），于是 `len(lines) < 5` 提前返回、所有 var 出参保持初值 —— 外部看到的是「文件明明在、键明明对，却永远 miss」，**全程零报错**。把同一份数据先落局部（`let text = os.ReadFile(Fmt"{path}")` 再 `Split(Fmt"{text}")`）即恢复（同进程 store→lookup 实测 `hit=1`）。**规则**：`@borrows` 函数体内不得把调用结果直接作为另一个 `@borrows` 形参的实参，先落局部再传。**定位手法**：把嫌疑函数**逐字复制**进零依赖探针（`src/probe_cache_semantics/cache_probe.cheng`），同进程做 store→lookup 往返并打印全部中间量，比在原工具里加日志快一个数量级。
   附：`cheng_cold` 只接受 **`<root>/src/`** 下的 `.cheng` 源（`cheng_cold.c:2977-2991`，`source_prefix=<package_root>/src/`）——探针源放 `.rebuild/` 下会直接判 `cold source snapshot source path leaves package root`。

## 2026-09-16 商业计划书不披露月薪

2026年9月17日用户明确要求发明专利不写开发安排。专利正文和交底书不加入开发排期、人日估算、人员投入或项目进度；这些内容留在独立开发计划。同步清理Word及其Markdown源，保留技术实施方式和权利要求。

用户明确要求计划书不用写每月工资。对外计划书仅保留年度人员预算、团队配置及资金用途，删除每人每月成本假设、月薪测算公式及相关说明；不要在其他页面重新加入同类细项。同步更新正式PDF、同内容副本和Markdown。

同日用户要求删除引言中“给妈妈倒一杯水”的整个例子。后续计划书版本不得重新加入该例子。

## 2026-09-16 专利检索不能遗漏资产标准和非专利资料

2026年9月17日用户确认：目前仅提交《一种确定性事实图编码验证及根哈希生成方法及系统》和《一种智能体符号落地方法及系统》两件申请，交易相关申请尚未提交。旧《Cheng / Vexa第一批5个核心发明专利技术交底书》已获明确删除授权，不再引用为现有申请、优先权或保护范围依据。交底稿、提交版、受理、公布、实审与授权必须区分；不能从合集名称或技术重叠推定已经提交。状态变更按用户确认及正式回执更新，历史提交文件保持原样。

世界视频旧稿检索集中于跨帧依赖、仿真状态复用和增量重算，遗漏SimReady资产能力、验证和回执资料。以后按技术链补查厂商标准、开源实现、工具文档和论文，不能只查专利和当前独立权项关键词。发现漏检要说明检索范围不足，不推称资料当时不存在。区分公开技术重合、可专利性影响与有效权利要求侵权判断；“未检出”不是“没有”。

同日用户指出核心功能遗漏CSG视频千倍压缩、秒发秒开。产品影响分析须同时覆盖内容表达、存储带宽、发布、首帧、播放和交互，不让当前专利的资产准入主题替代全产品。千倍压缩须区分原生世界描述与存量视频转码、完整依赖体积与缓存增量、同质量基准与原始帧；秒发注册就绪与远端可获取、首段数据到达与首帧上屏分别验收。不能把局部组件比例或环回预算外推为完整产品实测。

用户进一步明确主线为“存量视频转化CSG世界视频”。后续功能与专利比较应以现有视频为输入，贯穿时空重建、紧凑表示、发布、终端恢复和交互；不能改成只讨论原生程序化内容，也不能把深度辅助的原视频重投影称为完整物理世界恢复。

## 2026-09-13/14 多线并行工作流四条（墙链十连破日之后复盘定谳）

1. **共享树可编译性守护（retaddr 事件复盘）**：任一 lane 往 bootstrap/ 加 `@importc` 声明而定义不在同批，全树 stage3 编程立即封锁（每个使用方各自烧数小时重发现窗口手术）。**规则**：①往 bootstrap/ 或 runtime 提交面加跨语言符号前，先跑全树链接冒烟（两行源 + ordinary，无窗口直编应 rc=0）；②树级阻塞物挂中央哨兵（路径/符号/属主/预计撤除时间），别让每条线考古。诊断探针属临时 WIP 也同责——带病 WIP 放进共享 bootstrap = 全树人质。

2. **烤制/门轮一律受控克隆根，活树只读**：活树上多线并行编辑时直烤 = 移动靶（B3 两炉烧在 C2 半成品探针上）。**配方已工具化**（tools/bake_clone_root.sh）：`git archive HEAD` 快照（或 APFS 克隆）+ 逐补丁 preflight 叠加 + 状态 sha 记录；单变量对照 = 同基座叠唯一补丁。用前核对同步时点（对照最新已验证驱动 sha）；多线滚动共享根（b2_root）已证可行但需每轮核对。

3. **当前源载具升格（复利最高单步）**：冻结 stage3（8/31）带 D1/D2 前缺陷（破坏性 TAKE、str 替换泄漏族），每条新代码形态各自撞一次旧缺陷（B16 v1 假绿、ORC 18.9GiB）。**规则**：C 链修复落地后立即重建「当前源载具」（cc 41s 可建，配方 tools/rebuild_current_vehicle.sh）跑金丝雀+四夹具+回归矩阵，过则升格为 `artifacts/vehicles/current` 并钉 sha——新工作一律用当前源载具，冻结 stage3 只留作历史对照。共享 stage3 本体不覆盖（载具私烤勿覆盖纪律不变）。

4. **跨线一致性债：改行为必扫断言依赖**——T2 开档 1 没同步 rsi_contract 断言（gate 红）、tier3 改常量没带测试、B15 交割定性行号错位被 B16 修正。**规则**：行为/常量/契约改动落地前 grep 全仓对变更符号/值的断言与判词引用，命中即同批更新或显式挂账；agent 领地不含依赖文件时，主席收割步骤必须含依赖扫描。
5. **C 链投入封顶规矩（2026-09-14 用户确认）**：纯 Cheng 目标下 C 链只收「正确性/安全」修（ORC 语义合同如 D1/D2/D3/T6/T7、墙链病根如 W7X），不再收性能与功能修——C 链是产道/种子，修它为的是自宿主编译器出生干净与 GEN2/GEN3 固定点可上，不是给 C 链加能力。性能/功能诉求一律落 self-host（backend2/typed_expr/parser 的 Cheng 源）。

6. **多 lane 共享工作树禁用 `git reset --hard`（2026-09-16 事故）**：收割 C 链道时提交误捎 M3 WIP，用 `reset --hard HEAD~1` 回退，把工作树全部未提交 tracked 改动一并清掉（docs 遗留几十文件+他 lane constraints3d 83/9 等，无备份不可恢复；M3 WIP 靠事先完整备份救回）。**规则**：①共享树回退只用 `git revert` 或 `git apply -R <冻结件>`；②提交前 `git diff --cached --stat` 核对 staged 区（本文件已有同条）；③发现误捎时，若误捎内容与目标内容分属不同文件，`reset --soft`+重新精确 add；同文件分 hunk 时先备份完整版（`git show HEAD:file > 备份`）再 `reset --hard`，且必须先 `git status` 清点工作树未提交面并逐项评估损失；④无备份的工作树增量一旦 `reset --hard` 即永久丢失——这是不可逆操作，等同删除他人未保存文档。

7. **clone_roots 目录 lane 独占约定（2026-09-16/17 两起连锅端）**：`.rebuild/clone_roots/` 是多线共享区，任一线的清理/清扫都会连锅端其他线的多轮根承载（ORCD5 根灭失、p0 线根被清、BD 线 t2fix7 夹具被摧毁各一起）。**规则**：① 清理 clone_roots 前必须 grep 在飞线 REPORT 确认无活跃根引用，在飞线的根列入白名单；② 长线（多轮烤制）的根命名带线名前缀（orcd5_/bd_/d2_），清理工具按前缀豁免活跃线；③ 线的关键夹具/仪器自包含进本线目录（bd 线先例：基础设施全量自包含后免疫清扫）；④ 冻结件双备份：线目录 + 独立备份点（orcd3 v3 冻结件因单点存储已灭失，四路查证无副本，重建成本一轮）。

8. **源码提交最低门槛 = stage3 直烤金丝雀（47d0412a3 事故）**：他 lane 的 perf 混合提交漏 `var compilerCsgRssGuardHf` 声明，stage3 自举 fail-closed，全部烤机 lane 在该 HEAD 区间 3 分钟即死。**规则**：动 src/** 的提交前必须过「stage3 直烤+金丝雀 2/2」最低验证（分钟级），未验证的 WIP 用 `.rebuild/` 隔离不进 HEAD；巨型混合提交（多域混杂）禁止——单域单提交，出问题 bisect 才有粒度。

## 2026-09-18 @borrows 函数 var 出参读侧静默误编译（RL 训练战役发现）
- 症状：PolicyRollout 的 `outUpright = outUpright + upz`（@borrows fn, var float64 出参）累加出 2.1e6（204 次 ≤1 加法）；`UPR raw` 探针实证：**紧跟写后读同一 var 出参也返回垃圾槽位值**，而写侧正确落到调用方（UP2 读回 191.228 干净值）。
- 规则：**@borrows 函数内 var 出参禁止出现在任何读位置**（RMW、let 物化、直接传参都不行——let 物化报 kind 18/20 mismatch，直接传普通 fn 报 unresolved）。只用本地累加器，函数末尾单次写 `outP = localAcc + 0.0`。
- 传播风险：全代码库其它 @borrows fn 的 var 出参 RMW 同病，需 kernel/编译器 lane 系统排查（grep `= [A-Za-z]*[Oo]ut.* + ` 模式）。
- 次生教训：NaN 穿透——quat 变 NaN 后所有 `x < bound` 比较为 false，停止条件必须写成对 PASS 侧取反 `if !(a > lo and a < hi): break`；DuckFmtMm 的 int32 铸造把 NaN/巨值饱和成 2147483.647，**看到这个数先怀疑 NaN/读垃圾，不要再怀疑物理**。

## 2026-09-19 测量与提交纪律（被动门考古+烧扫仪器日）
- **提交前必须过构建门**：9e461daae 提交原样编不过（把已提取的 DuckParseSignedEnv 又内联回去触发借用硬错），昨日 377/381 门数字来自未入库工作树、不可复现——"提交时不可编译的快照"=其上的测量全部作废。门禁数字必须绑定 commit hash + 构建产物。
- **仪器读数优先于合同叙事**：烧扫计数器(1-74)与"96 扫基座合同"矛盾时，先信仪器——揭露了基座门方向反转 bug（1e9 门配 <= 比较器=第一扫即退出，自 ee53b9202 起基座实跑 1 扫）。注释意图与数学方向相反时以实测为准。
- **混沌带内重掷不追单点**：被动站立 190-400 tick 是混沌本征带，任何调度/精度扰动都重掷落点（360→234→275 同带）；调参不追单次掷点，只认带与门。
- **绝对门在"平衡残差"边缘必双峰**：驻留残差=负载挠度（0.6-1.0mm 永不到 0），出口门卡在边缘=要么 4 扫要么烧满；相对停滞准则（改进<5%/扫）+回执合同上限才单峰化。

9. **子代理死亡无声，产物盘点必须按目录实测（2026-09-19 连环）**：ORCD5 重派线（e71a2baa）死亡无通知（用户「没有在飞子代理」才暴露）；N-A 线（973a081a）死亡断在途施工于活树（325/97 半成品）；orcd7_line 全目录被清扫灭失（REPORT/lldb/trace 全丢，第 4 起连锅端）。**规则**：① 长线派发后 coordinator 定期 TaskStop 试探存活（completed=收割，No task found=死亡重派）；② 线死亡时先盘点产物目录存活再重派（REPORT/冻结件/在途 M 分别处置）；③ 在途施工死亡的活树 M：全面 diff 留档 baseline 后由续作线处置，禁直接 revert（可能误删他线遗留）；④ 清扫连锅端第 4 起确认——`.rebuild/` 顶层线目录是清扫高发区，关键结论必须当日转正 docs/（ORCD7 判定面重钉结论因已并入 ORCD8 任务书与协调席记录而零损失，实属侥幸）。

## 2026-09-20 真机任务护栏（用户三次投诉换来的规则：死机/发烫/强制横屏）
- **设备任务必须带资源护栏**：并发判据轮（serve+fetch+视频解码+亮屏连转）无上限叠加=真机发烫/死机（com.cheng.acapk 判据循环期间用户抓到死机+烫手）。规则：判据轮间 sleep≥2s、串行不并发压测、每轮前 `dumpsys battery` 温度 >43°C 即熔断冷却、装机物必须登记包名与卸载命令。
- **APK 默认竖屏锁**：android:screenOrientation="landscape" 未经用户明示禁止写入（本次代理按"视频应用惯例"擅自横屏=用户第一投诉）。演示类 APK 一律 unspecified/ portrait，横屏需用户点头。
- **被取消代理的设备残留必须主动清场**：取消≠清理。收割后立刻 `pm list packages`/`ps -A` 核对本次装机与进程，用户抱怨前先自己发现。

## 2026-09-21 修复集完整性与崩点归因两条（192-Join 回滑 + ORCD10 归因证伪复盘）

1. **patchgen 修复集与 git 提交态分叉，clone 重建即回滑**：192-Join 源修修复集 f5d9db72a 声明 8 hunk 实落 5（codegen_a64_body_units/codegen_a64_link_units/codegen_contract+std/result、cas_fetch_subprocess+std/rawbytes 四件漏落库）——带补丁的活树窗口全绿，而任何 `git archive/clone` 重建的受控克隆根立即回滑出 `Result not visible`（m3fix 门轮 src=13）；两态证据面不同，测量结论不可互相迁移。**规则**：①修复集落库后必须以「从 git 重建的克隆根」复验一次红绿（受控克隆根纪律的补完），只在活树验证=假绿；②patchgen 产物入库时做 hunk 数/文件数对账（声明数 vs `git show --stat` 实数），缺额即回滚重派。收口先例=e2ff96144（枚举臂红 total=4→绿 0）。
2. **崩点归因必须地址级仪器逐字节命中，排除法归因链可全错**：ORCD10 对 decls 环 32B 双释放的四个假设（AppendMove/SR5 复位/view teardown/decls-name 悬挂）逐一排除后定谳「崩块=decls 环迭代尾临时块」——该归因被 ORCD11 推翻：O11ST 地址级仪器对真根块（ModuleConstStoreLocalEntryOwned 缺 `@borrows` 合同→续行 const 路径 pending/literal 32B 块双释放）entry#1 逐字节命中才钉死（载具 primary_object_csgc_cargo.cheng 消费序#60，60/47 之谜闭合）。**规则**：崩点归因的合格证据=地址级仪器对候选块的**正命中**（逐字节，配对键唯一同构如 src_index）；排除法穷尽候选≠正证真因，无正命中的「定谳」一律按未定谳处理，禁入冻结区、禁据其派生刀位。

## 2026-09-21 共享树提交铁律（用户定谳）：捎带就捎带，别回退
- **捎带 add 他线新文件（??）可接受**——历史惯例，扫进来比丢掉好。
- **对 M 状态共享文件，禁止用旧工作副本整体覆盖提交**=变相回退他线改动（事故：938af0ca6 以 plate/docs 标题提交，把 a85e5b5f9 的泵门修复整体退回 pre-v1 并抹掉在途 v2，本日第三次扫荡的第一起真回退）。
- **提交前机械动作**：凡提交 M 状态文件，先 `git log -1 -- <file>` 看 HEAD 是否有他线新提交；有则你的副本已 stale——先把 HEAD 版拉进工作树、把你的增量重放上去（或放弃本次提交交还属线），严禁直接 `git add` 整文件。
- 未提交窗=扫荡靶窗：改完即 commit（或冻结 diff 到带哈希的文件），别攒批。
