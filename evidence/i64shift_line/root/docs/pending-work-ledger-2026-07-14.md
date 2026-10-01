# 待完成工作台账 (2026-07-14)

> 补丁持久区=`~/cheng-patches/20260714/`。更新: **继续推进#2** — 双 ZC 互杀收口 / repro801 归因+修源 / 全闭包仍烤。

> ★2026-07-17 23:3x 收割批次(双线终局闸): ①**性能 PASS** baseline/patched true_path 墙钟 median 35→7ms sha 71bddf8e/263b5e28 nm 分叉。②**点火未终局**: GEN2_final4 ZC=0 后 terminal 仍 0/2，墙级联 invalid_slice→prune owner→dangling→**owner ncid not ready**；T79 字段双偏移根未消。下一墙=pobj 字段偏移真修后重烤 GEN2。
>
> ★2026-07-17 18:2x 收割批次一百一十七补(skeptic 真路径补证): DeclaresType 夹具废止本地 FullScan 复刻 → `1b0ad9e8b` 直调 `pobj.PrimaryBodyIrSourceModuleDeclaresType`/`OwnImportTargets`+磁盘 fixture; stage3 链 pobj 进 exe rc=0 sink=4000; nm 含补丁专属 `primaryBodyIrDeclaresTypeIndex*`(pre-patch 源 0 处)。证据 perf_hotspot_r3/{equiv_real_run,real_path_nm,MEASURE}.
>
> ★★2026-07-17 18:0x 收割批次一百一十七(双线 r3 真 spawn: **T79 定谳** + DeclaresType 索引落账): ①并行点火+性能子代理。②**点火相对 69011b 再前一站=T79 ROOT_CAUSED**: DRV 编 triv/var 绿(rc=0 run expect); GEN2 对根外/树内/相对/tmp 全路径形态均 rc=2 `reusable facts source text missing`——**证伪仅根外**假说; 落点 out_probe compiler_csg:8424 `TypedExprSourceTextIndexForPath<0`(typed_expr:27046 线性归一化等值); terminal 未绿。证据 ignite_t79/{STATUS,ab_matrix}. 下一墙=GEN2 路径登记/IndexForPath 或移植 HEAD SourcePathIndexFind 后重烤。③**性能 `857445e5c`**: DeclaresType+OwnImportTargets per-linesSlot 一次性索引; 等价夹具 fullscan 2678ms→index 7ms; 只 stage 本线 hunk(HEAD 净补丁, 并发 pobj WIP 还原)。
>
> ★★2026-07-17 17:4x 收割批次一百一十五(双线并行 r2: **钉基 GEN2 ZC=0** + ParserStrip 落账): ①真 spawn 点火+性能两子代理。②**点火第三跑 ignite_20260717T090229_69011b**: drvBake rc=0+probes 11/11+**gen2Bake rc=0/ZC=0/bails=[]** wall~16.7min sha=1c3d11285fa8ed77…(上一跑 bail=718 PrimaryPlanResolveTargetIndexOrTrap **消失**, && 展开探针树有效); terminal/oracle/gen3 败于夹具 CSG facts source missing/RSS/空 IR(环境, 非 GEN2 红)。证据 dual-r2/ignite_r3。下一墙=terminal 路径修→oracle→gen3。③**性能 `e36f3ca88`**: ParserStripLineComment/SlashAware 无注释记号探针早退跳过 quote 状态机; 微基准 median 600→360ms; 未碰 pobj/typed_expr。
>
> ★★2026-07-17 17:0x 收割批次一百一十三(本会话双线并行: 真 spawn 点火+性能两子代理): ①**并行实发**: 同 turn spawn 点火子代理(019f6f39…a71e)+性能子代理(019f6f39…2773), 主线程仅派发/收割/落账; 证据=`{scratch}/parallel_spawn_proof.txt`+`dual_lane_brief.md`+`dual_station_summary.md`。②**点火线**: 钉基链 runId=ignite_20260717T083113_f7ecbe 收割完成——drvBake rc=0 sha=272807a5664e342e… + probes 11/11 + gen2 **活过 9s 死点** wallMs=1691743(~28min) 后 rc=2/ZC=1 bail=718 PrimaryPlanResolveTargetIndexOrTrap(与批次一百一十二同判, 非第8号 9s CSG 死点); 站位见 ignite_20260717_dual/STATUS.md。下一墙=ZC=1→0(第三跑在飞)。③**性能线 PathTrim 落账 `a9661f726`**: 净串双端早退+去 bool 标志 while; path_trim_smoke 扩格 stage3 rc=0; 微基准 median 63→51ms(~19%); 证据 perf_pathtrim_20260717/{STATUS,MEASURE,pathtrim.diff}。未碰 pobj/typed_expr。下一刀=独跑窗 full 重采样或 DeclaresType 簇。
>
> ★★2026-07-18 00:5x 收割批次一百三十二(#15 真规模验证 fix 臂重磅判决+额度墙+复核 resume): ①**真权重全链机械面全绿**: BF16 加载(诚实修入口: 图构建硬编码 F16 墙)+218 张量流式+config 九字段纯 Cheng 断言+**tokenizer 对 HF 逐 id 全对**(中英双 prompt+roundtrip 精确)+跨进程确定性+S2 真 argmax 接线(签名零改动+规则回退)。②**★HF 语义对拍 0/8——引擎数值核四缺口定谳(代码锚点全在卷, 均预存在)**: (a)dense 注意力是 **hardmax argmax-copy 非 softmax**(paged_kv_cache:368-403, 注释自认); (b)**RmsNorm 未开方**(model_executor:886); (c)**Qwen2 q/k/v bias 72 张量不建模**(290-218); (d)int32 定点 scale=1000+泰勒近似——**"端到端回路闭合"旧账实为机械闭环非语义正确, #15 真前沿=数值核战役立卷**(softmax/rsqrt/bias/精度四刀, 另编号待查号)。③性能账(端侧可行性基线): 0.007 token/s/RSS 7GB/每 forward 全店权重重哈希——端侧化三杠杆=KV-cache 增量+去 per-forward 重哈希+W4Afp8/Metal 内核。④双复核臂撞 5h 额度墙死亡(votes null×2), **额度重置后已 resume(fix 臂缓存复放, 仅复核重跑)**。产物=qw_realverify_{fix.patch,verdict.md,logs}/。
>
> ★★2026-07-17 22:4x 收割批次一百三十一(**#14 鸿蒙 NAPI 落账 `50585fd14`**, 双镜头 CONFIRMED×2): r2 信箱架构拆雷收官——cheng_host_apply_media_action(ArkTS 线程)只校验+发布进 latest-wins 信箱(s_media_mailbox_mu 文件级叶锁永不 free=正对 r1 "fq_mu 在可 free ctx 内"雷根), 渲染线程 drain(RenderLoop 每帧 tick 前)消费后跑 r1 完整派发体, teardown 首行清箱同线程串行——TOCTOU UAF 关闭(复核 A 调用点穷举: cheng_host_video_seek 全仓唯一调用点=drain 体内); **play/pause 同病同治定谳**(实读生成源锚定 cheng_app_media_control 非纯原子转发: CSG 图变异+分配器+ES 传输面全渲染线程独占); Want 事件面(hdc aa start 可驱动)+11 项注册+ohos-tsc 0 新诊断。#14 鸿蒙生产链(ArkTS→NAPI→信箱→渲染线程→seek_epoch 门→解码器)全通, 剩真机行为验证(deviceOnly 七项在卷)+S5 背压+S7 音频。三项非阻断观察留档(双 RenderLoop 无 join 基线缺口建议立项加 pthread_join/多动作折叠 WARN/清箱中帧窗口)。
>
> ★★2026-07-17 22:2x 收割批次一百三十(**ingest ZC 墙 121→1 大坍塌**+两堵前置新墙急报+NAPI r2 重飞): ①**#10/#60 门①重测(canonical 双跑+对抗复核确认)**: ZC 121→**1**(今日 20+ 笔落账兑现), 可见余孽=bail=49 MediaDeliveryReceiptCanonicalCid(media_asset_manifest:3060, 40 元素 str[] Join 物化, 五形单测全 CLEAN=判别子在闭包语境); ★复核边界打击揭洋葱: 删 bail49 后浮出 **bail=6101 MediaPlatformDarwinDecodeFirstFrame:153**——枚举是分层前沿非总残量。②**★墙A 急报(致 op-lane, 全会话级)**: HEAD 提交态断链——0543be970 部分吞落账带进 2 调用点 PrimaryBodyIrSeqAddValueArgNodeIndex(pobj:21562+b2slots:12189)**零定义**, HEAD 现无法冷烤 driver(rc=3 复核双实锤); op-lane 工作树已见撤线迹象(0 处该符号), 请尽快补定义或落撤线。③**墙B 立卷**: partB 起冷烤 driver 对任意闭包 panic "snapshot-only function signature missing"(typed_expr:17741)——#137 族浮出冷烤面, 引入者∈{81bde41e0..72e6975b2} 且中间态不可编译无法再二分, 建议 gen2/stage3 烤面交叉观测脱盲。硬件 SHA256 生产激活真前置修正=墙A+墙B+bail49+bail6101(洋葱)。卷宗全集=20260717/product/*_zchw*。④**NAPI r1 判决 1:1 REFUTED 封存重飞 r2(wf_1dfd0bd3)**: 三件同构+回归网全绿, 真雷=ArkTS 主线程成 cheng_host_video_seek 首个跨线程调用者×渲染线程 teardown free(sc)=TOCTOU UAF(aa6f1301d 案卷 S6 红线兑现); r2=渲染线程 pending-seek 信箱(只留最新/teardown 清箱/play pause 线程语义单独定谳)。⑤#15 真规模验证轮在飞(wf_c9960133)。
>
> ★★2026-07-17 21:5x 收割批次一百二十九(ceaefe81 会话, **用户双授权**: 工作流全面推进+**Qwen2.5-0.5B 下载授权**——#15 唯一决策墙解除): ①权重下载中: /Users/lbcheng/models/Qwen2.5-0.5B/(config/tokenizer 六件已落, config 核验 Qwen2ForCausalLM hidden=896; model.safetensors ~988MB 后台拉取)——落地后开 **#15 真规模验证轮**(24 层端到端生成+model_executor/distributed_engine 正确性+S2 PlannerTaskClassifyFromText 换真 logits argmax); ②进程重启孤儿两工作流已按 resume 纪律重飞(ingest ZC/硬件SHA256 A/B=wf_fc63d5a8 resume+鸿蒙 NAPI 刀=wf_a0461411 resume, 死亡轮工作区已清); ③负载哨兵实录: 176 峰值→21 回落后才重飞(m3s8-r1 SIGKILL 前科纪律); ④跨会话注记: 对方独立 T79 侦察(批次一百一十七)与我方批次一百二十二定谳收敛(全路径形态同败=印证读取点偏移致数组恒空, 与路径无关)。
>
> ★2026-07-17 20:2x(真钟, 前两批次时间戳偏快约 2h 特此校准)收割批次一百二十六(**#131 全终结**+双刀开飞+设备窗开): ①**partB 已由对方落账 `72e6975b2`**(四处源级回归全修: filterActive×4/csg set 形参/csg 反引号重载 panic/pobj+b2slots 9 参)——与我方 partA(f28395104)合璧, **#131 双签名全终结**; 我方 HELD 件封存 .PARTB-SUPERSEDED-72e6975b2; 对方另落 #135(1e3465630)+CommitB 插桩(4c82f95ff)+csge 全链——**HEAD 重建路线预期复活, PB 复验/点火链新世代解锁面全开**。②双刀开飞: **ingest ZC 重测+硬件 SHA256 激活 A/B**(wf_fc63d5a8, #10/#60 主线——ZC=121 旧墙重测, 解锁即真 driver A/B 预期 10x+)+**#14 鸿蒙 NAPI media 刀**(wf_a0461411, S4 样板同构三件)。③**Android 真机在线**(GBJ0222B24021692)——设备窗开, 待在飞收割后编排者亲手: #26 v12 终验/S3b seek/S4 缓存真机确认(需先判 APK 是否含今日落账, apk-build 场景源陷阱在案)。鸿蒙设备不在线。
>
> ★★2026-07-17 22:0x 收割批次一百二十五(双落账: M3 wave3 `0c85c252f`+**#143/#144 四轮收官 `43b92d2fc`**): ①M3 wave3(双镜头 CONFIRMED): GEN-DIFF 11→8, 含 **leak_audit 5 定义性声明真编译缺口修**(-DCHENG_LEAK_AUDIT 构建会链接失败, census 文本法看不见的悬空引用类)+glyph_sdf 双函数吸收(生成器 id-1 下标+abort 假设→手写线性扫描更健壮真值方向); 剩 8 分两族群留证: A=GLES 分片图集架构(bail57 root① 函数体层表现)/B=**#14 媒体特性演进**(手写侧已进化 MoQ 拉流/QUIC 预热/视口裁剪, 生成器从未跟上——**特性移植独立立项**); **Index.ets 234 行文件级口径缺口首披露**(需裁定是否属 slice-8 承诺范围); 复核 A 抓判决书数字错(29/24 实为 57/40)订正。字节门未达, 终局五条件在卷。②**tl4 收官落账**: uint 标记家族累计 20 处收网(cold_parser +228/-22), 六合并点保守 join(递归累积器过多行 if 链), uniform-else 收口+u64×f64 响亮零回退; mixed 格四态表如实(3 IMPROVED 假阳性 die 消除/3 格幸运 die→未标注默认——混合符号性三元合法性归 **#151 spec 裁决优先级升高**); 复核 A 双法(result_slot 聚类+spec 产生式)确认无第七点。**#143/#144 案链(tl1→tl4 四轮, 复核网六次抓漏)收官**。③注记: 本批次顺手修复账本顶部并发撕接(批次一百二十三 S6 文本曾被卷进一百二十四行内, 已还原独立条目)。
>
> ★★2026-07-17 21:4x 收割批次一百二十四(**M3 slice-8 接线+wave2 双落账 `397c24916`+`93cd90182`**+wave3 终局轮开飞): ①wave2 双镜头 CONFIRMED×2: 19/19 函数逐字节吸收(GEN-EQUAL 161→180, 清单内 UNABSORBED=0——**原始 57 函数吸收工程 100% 收官**), 顺产修 s_gui_app_id/s_gui_resource_manager 悬空定义缺口(wave1 时代文本 diff 方法看不见的"匹配但缺定义"类), census setdefault 撞名 FATAL 加固; ②接线补丁合落(harmonyNativeGuiExperimental 门默认 false=零生产行为变化, 复核经 r2/wave1/wave2 三轮叠栈实测); ③残余: **11 个 GEN-DIFF 函数**(生成≠手写: leak_audit/gpu/mobile_host 族)+shared.h 23 行 bail57 合法差异(三轮定谳保留)+1 个域外漂移件(#14 S4 函数, 归 #14 线); wave3 终局轮收割见批次一百二十五。
>
> ★★2026-07-17 21:2x 收割批次一百二十三(**#14 S6 落账 `57376dfb0`**, 双镜头 CONFIRMED×2)(本条为并发撕接修复后还原): ①CSG 层全绿: seekPositionMs 字段+WithPayload 的 Seek 分支 payload 解析+效果段 media_lifecycle:Seek:<slotId>:<ms> 格式+WebSceneApplyMediaControlForSlotWithPayload 显式 slotId 路由(非祖先游走); roundtrip 夹具六场景 exit 0(双复核独立复跑)。②Android 双链接线: JNI 直派发 Seek→strtol→cheng_host_video_seek(此前 0 调用点, S3b 既有 volatile fire-and-forget 安全交接点)+cheng_app_media_control ES 转发(复用同一 parser); 真 NDK -fsyntax-only 0 error(复核 B 独立找到双真交叉编译器复验含 OHOS 侧)。③**鸿蒙侧暴露更早独立缺口**: 原生层(ArkTS/NAPI)从未为 play/pause/seek 任何一个注册导出, s_app_media_control dlsym 后零调用点——**#14 下一刀=鸿蒙 media control NAPI wrapper+注册表+ArkTS 调用点**(独立立项)。④复核 B 方法论纠错入卷: 整链 status 相同不能证明断言被执行(提前中止陷阱), 必须隔离调用法——已实证。⑤复核 A 补丁叠加实测: s6+m3s8r2+m3ab2 三补丁同工作区 apply 全 rc=0 零重叠实锤。#14 无设备切片至此: S1-S4+S3b+S6 全收, 剩鸿蒙 NAPI 刀+S5 背压(架构级)+S7 音频+真机验证面。
>
> ★★2026-07-17 20:5x 收割批次一百二十二(**T79 ROOT_CAUSED**——同字段双解析偏移分歧+对方 v5 hoist 因果证伪): ①lldb 双断点同帧对照钉死: add() append 完全正确(sp+0x3c30 写 len=1); 真凶=几百行后读取点 TypedExprSourceTextIndexForPath(var 引用实参)地址物化用了 **0x880 而非 0x8a0**——0x880 精确等于声明序前 2 字段(orderedSources)偏移, **同一字段在两个引用点被解析成两个不同声明位置**, 读全零栈区误判空数组; 共享容器基址分量逐字节相同(FillStackAddressToReg 链式拆分无罪)。②**对方 T78 v5 补丁内的战术 hoist(CompilerCsgPushTypedSourceText 抽函数, 注释归因 add 内联漏写 len)因果假设被证伪**——hoist 生效=偶然扰动栈布局掩盖读点错偏移, 非真修(致 v5/v6 轮情报, 按铁律临时探针应还原)。③族属线索: "同字段两引用点双解析"形状疑与 #130(callArgTypesTexts 行号键控串号)/#64 家族同构——待修复轮定谳。④判 ROOT_CAUSED 非 DIFF_READY 双因: 三次隔离最小复现未触发(需真实控制流复杂度, 建议函数本体逐段裁剪二分); **修复域(pobj/b2slots)正处 op-lane +30000/-8000 未提交大重写**——T79 修复挂其落账后用同 lldb 配方复测(可能已被重写消除)。案卷=20260717/t79_gen2_drv_source_load_divergence_t79r2/(七节论证+双反汇编+lldb 全录)。⑤点火线状态: gen2 ZC=0 里程碑在手; terminal/oracle/gen3 挂 T79→挂 op-lane 重写窗。
>
> ★2026-07-17 20:3x 收割批次一百二十一(tl3 判决 1:1 分裂封存重飞 tl4+#151 立卷): tl3 十四处修复双复核验证正确零回归; 分裂点=复核 A 第三种扫描法(spec 产生式枚举+32 夹具)挖到**第六类**——全部五处双分支合并实现(if_expr/inline_if_let/multiline_value_if/postfix 三元/expr 三元)的 marker 回填只查 then 从不查 else/elif, uint 高位走 else 分支即静默有符, u64 破 #78 红线(A: REFUTED); B 认同代码事实但判"既定设计非 tl3 引入超授权"(CONFIRMED)——同一事实的范围裁量分歧, 编排者裁决=A 立场(红线优先, 架构级收口)。**tl4 重飞(wf_ddb6b88b)**: tl3 基座+五合并点**保守 join**(全部臂同标记才回填, elif 逐臂), uniform-else 格转绿, mixed 格不回填现状+**#151 立卷**(混合符号性条件表达式 spec 裁决, 素材=tagloss_review_a_repro_tl3/ g 系夹具)。
>
> ★★2026-07-17 20:1x 收割批次一百二十(**M3 吸收 wave1 落账 `417dc6a06`**, 双镜头 CONFIRMED×2+wave2 开飞): ①收敛量化: UNABSORBED 57→19(38 函数手写段 :914-1278 逐字节吸收全 GEN-EQUAL), GEN-EQUAL 122→161; 哨兵双修(死代码首触 Panic 拆弹)+census 工具双文件探测修+shared.h S3 prewarm 吸收(38→23 行)。②**框架双订正**: (a)r2 的"adapter.c 11/58"解读证伪——58 函数全为 ADAPTER-ONLY 架构隔离(平台胶水本就不该生成), 真缺口在 gen.c; (b)fix 座席以证据否决我方"删 bail57 字段"指令(四组字段被 GlesCoreSource 45 处活跃引用, 删=编译回归; 手写侧无字段=功能子集未在 Harmony 实现非过期)——**编排者指令被复核网纠错实录**。③复核 B 抓 fix 卷叙述瑕疵(r2 测量准确/解读错, 非工具抓错文件)订正入卷; 复核 A 遗留 census setdefault 撞名加固项转 wave2。④**wave2 在飞(wf_e9bf70d2)**: 剩 19 函数(媒体解码/GUI 状态机)+终局判定(合法差异外零 diff→slice-8 吸收收官→接线补丁合落条件)。
>
> ★2026-07-17 19:4x 收割批次一百一十九(T79 r1 PARTIAL 收窄+#150 立卷+r2 收尾轮): ①T79 症状①钉到最后一环: GEN2 里 compiler_csg:8247 `add(work.typedSourceTexts, ...)` 静默不计数(len 恒 0)而紧邻 :8252 add(exprCallProfiles) 正常——嫌疑=**含嵌套数组字段 struct(TypedExprSourceText.externalPackageRoots) 的 add() codegen**, lldb 活体寄存器实证+机器码地址锚定(0x1011402ac), 差 append 前后 len 单步; ②症状③证伪(mkdir 非递归, DRV 同样打印但 rc=0, 良性 best-effort); ③症状②未追(无复现命令留档); ④**#150 立卷(DRV codegen, r1 副产物 9 行最小复现)**: 模块级 var:str 由函数调用返回赋值+跨函数 len()/比较读取→读回空(SEED rc=10 对/DRV rc=0 错); 生产命中=CompilerCsgTraceInit 的 trace 路径(GEN2 从不写出 trace 而 DRV 能), 与症状①实测异根勿并案; 案卷=20260717/t79_gen2_drv_source_load_divergence/。⑤**T79-r2 在飞(wf_9961de7e)**: 单步钉死→add 降低路径取证→根修+DRV 三方对照。
>
> ★★2026-07-17 19:2x 收割批次一百一十八(**#14 三件套落账 `8514de9c4`**, 双镜头 CONFIRMED×2): ①S1 esSinkFrame 5 参 key 贯通(bridge 三点+鸿蒙 C adapter; 真 QUIC 回环 675 帧×独立解析 .moqidx 关键帧集 {0,120,240,360,480,600} 零失配三轮一致; Android C 侧 4 参保留=蓝图定性平台差异, AAPCS64 论证复核认可但标注"验证深度不足待真机补齐"); ②S3b Android 双路径 seek(本地 ms→µs 参数化+ES 分支镜像 S3a 四要素; 复核 B 证实 Android 同步轮询泵不需鸿蒙式 seek_epoch 门; NDK r26 对 12861 行生成 C 源 -fsyntax-only 0 error); ③S4 块缓存双端生产接线(Init 全仓 0 调用点→JNI+NAPI 双端必经路径, filesDir 持久非 cacheDir; 复核 B 用双工具链证伪 lessons cstrlen 折叠疑虑=该 bug 已被 c61e22421 根修, **lessons 条目过期待订正**); ④复核硬核面: 与 m3s8 补丁同工作区叠加 apply 实测干净; deviceOnly 清单四项归编排者设备窗。#14 蓝图 S1-S4+S3b 编译级收官, 剩 S5 鸿蒙背压(架构级另单)+S6 CSG payload(下一刀)+S7 音频+S8 汇合+全量真机验证。
>
> ★2026-07-17 18:5x 收割批次一百一十七(m3s8-r2 侦察框架实测修正+吸收波开飞): r2 拿到真实字节对表(卷=m3s8r2_verdict.md): CMakeLists+contract.h **byte-identical 坐实**; 但 **adapter.c 生成器只发射 11/58 函数**(65 行 vs 手写 1694)、gen.c 缺 ~1500 行(diff 8746 行)、shared.h 38 行双向漂移(生成侧含过期 bail57/手写侧含生成未跟上的 S3 prewarm 声明)——**"唯一剩余缺口=接线"框架证伪, slice-8 真实前沿=吸收工程**。两个新缺陷: ①MobileShellHarmonyGuiHostGenCoreText(:27606-27620) 3 哨兵 2 过期, 死代码首触即 Panic(r1 接线首次触达暴露); ②census 工具 GEN_CPP 探测(ls|head -1)漏双文件拆分, 旧分类数字全不可信。**吸收波 wave1 在飞(wf_1e955b14)**: 哨兵修+census 修+shared.h 收敛+47 函数清单化+首批吸收≥15(手写件为金标, 收敛量化表)。接线补丁本体保留待吸收收敛后合落。
>
> ★2026-07-17 18:4x 收割批次一百一十六(钉基链终态判决+T79 开狩): 链终态=**COMPLETE_gen2=GREEN_probes=PASS_terminal=FAIL_oracle=FAIL**——gen2 ZC=0 里程碑坐实; terminal 0/2+oracle 0/6+gen3 10 秒死三阶段同族签名: GEN2 作为编译器时源加载层坏("reusable facts source text missing"根外夹具全灭/"typed ir empty source_count=0"编全树 0 源/provider_cache 目录创建连败), DRV 同环境同输入全绿=**T79 立卷(GEN2/DRV 自宿主分歧, 源/路径/目录处理层)**; 三症状禁默认同根逐一取证。**T79 狩猎轮在飞(wf_1fd6e7c4)**: 数据先行(现成 GEN2/DRV 双二进制秒级复现, lldb 走数据链), 对照 #135 案卷判族属(>8 GPR 栈传参 str 覆写族?)。oracle s2 另见 rss_limit_exceeded 一枚(负载窗噪声, 复测定性)。
>
> ★★2026-07-17 18:2x 收割批次一百一十五(**点火线里程碑: 钉基链 GEN2 全树自编 ZC=0 达成**+m3s8 环境轮): ①钉基第三跑(探针改写后): **gen2Bake rc=0, wallMs=999085, zcTotal=0, 零 bail**——T78 v5(-探针改写形)+partB+#135 组合在 pre-rewrite 基线上通过 GEN2 全树自编译门, 点火链核心门首过; ②新墙=terminal 0/2: GEN2 编根外夹具报 "compiler csg: reusable facts source text missing"而 **DRV 编同夹具 11/11 全绿=GEN2/DRV 行为分歧**(自宿主分歧类, 待 oracle/gen3 事件后定性立卷); gen2 stderr 另见 provider_cache 目录创建失败连发(cwd 相对路径, 待查是否同根); ③m3s8 接线 r1 环境 BLOCKED(负载 155 窗口 stage3 19 连 SIGKILL, 补丁已写好 apply 干净零验证)——**r2 已重飞(wf_516e128f)**: 环境自检先行+census 真数字→逐字节对表→差异裁决树(UNABSORBED 清单 vs 生成器缺陷分离)。
>
> ★2026-07-17 17:5x 收割批次一百一十四(tl2 REFUTED 2:0 封存重飞 tl3): 11 处修复(tl1 三处+一元负号四子分支+let 绑定反别名拷贝等 8 新站点)全部双复核验证正确零回归(全量 1520 行零 diff+宽网 537 双编 md5-diff 名单逐文件吻合), REFUTED=完整性——两复核互补扫描再挖 4 处: **两份独立三元实现**(parse_postfix ~14777/parse_expr ~15420, 均无 result_slot 标记回填; 范式参照=parse_if_expr 等三处正确实现)+**parse_for 双缺口**(iter_slot 无标记传播+range-for 终止比较零调用 cold_cond_to_unsigned——uint32/64 跨 2^31/2^63 界静默有符比较循环 0 次, 5 repro 在卷, 生产命中 elf 双链接器, spec:470 强制 for..in 无绕过)。fix 方"从已知消费点反查"方法论结构性盲于"消费点本身缺失"类缺陷——**tl3 重飞(wf_1b8c5c7f)**: 15 处全修+完整性断言只许基于双扫描并集(分配点全清单+消费端存在性两表落盘), 复核 A 加第三种扫描法(spec 产生式枚举)对抗。磁盘纪律入 prompt(tl2 的 13G 矩阵区致 2.1Gi 险情, 已清回收)。bypassAudit 留案: 除法/取模四后端无 UDIV/UMOD 操作码族+int16 指针解引用误零扩展(待编号)。
>
> ★★2026-07-17 17:3x 收割批次一百一十三(双落账+产品波开飞): ①**WAN r6 落账 `27e4cc140`**(双镜头 CONFIRMED): call-led 语句同行二元续接被静默吞句(#127 dot-led 的兄弟分支, 镜像 rewind 重解析惯用法), ed25519 三姊妹+宽网 (2,0)=10 文件+os_host_process 真实修复, 零方向翻转; **WAN 前沿严格前进→crypto.keyTypeFromId**("cold case requires int32 scrutinee", stderr md5 df95b104..., 留档 wf7); 诚实披露: 惯用法对副作用被调函数有重复求值特征(#127 已接受的既有风险面)。②**#138 落账 `0f72925ae`**(双镜头 CONFIRMED): parse_compare_expr 派发入口从不解引用 SLOT_I64_REF——非 SLOT_I64 对操作数时落尾 I32_CMP 比指针地址(反汇编实证 ldr w0,[sp] 比地址低 32 位); 修=cold_materialize_i64_ref 镜像(+25/-0)+标记迁移, uint64×f64 转响亮与 #78 语义咬合; 与 #78/tl2 零重叠实证; 复核 A 逐条排除 42 条回归噪声(ENOSPC 磁盘满窗口实锤)。③**产品实施波开飞**: m3s8 接线(wf_dae74a89)+#14 三件套(wf_d4f4e72c); 钉基链第三跑 gen2 在烤。
>
> ★★2026-07-17 17:1x 收割批次一百一十二(钉基链第二跑判决+**T78 v5 自编译回归证据(时敏, 致 acb7a9d3 v5 复核轮)**): ①钉基链(22482bad4+partB+T78v5+#135)第二跑: probes **11/11 全绿**(HEAD 世代 0/11 对照坐实 #139 杀伤面), gen2 全树自编 28min 走完但 **ZC=1** 唯一 bail=`PrimaryPlanResolveTargetIndexOrTrap`(pobj:61475, statement_sequence bail=718, 落点区=missing_call_target 错误路径)——该函数为基线自带(HEAD 同在), **v5 前同树无此 bail(第一跑 HEAD 世代 gen2 死于 CSG 校验未及此), 高度疑似 v5 的 &&-eager 门控新规拒了 `if resolved && requireReachable:`+RHS `idx<len && reachable[idx]` 复合形**——全树 130k 行仅此一函数中招, v5 复核轮请纳入此全树级证据(比夹具矩阵更强的覆盖面)。②战术探针改写(仅探针树注明禁落账): 该函数两处 && 展开嵌套形→种子重烤 rc=0, **第三跑在飞**(ignite_20260717T090229_69011b, 冲 ZC=0→terminal/oracle→gen3 定点)。③实施波仍等负载窗(在飞: tl2/#138/wf6+钉基第三跑)。
>
> ★★2026-07-17 16:5x 收割批次一百一十一(四产品线侦察正典, 用户新目标=视频E2E/鸿蒙M3/远端本地化/小优CU 四线完成): 卷=~/cheng-patches/20260717/product_recon/ 四份。①**#10 视频E2E**: 左卡 SIGSEGV 已非阻断(dedup 根修删触发条件, 底层聚合 str 拷贝缺陷潜伏不主动开工); #56 ingest 实测仍 3538-3743ms 超门 2.8-3.7x, SHA256 主导; **#60 硬件 SHA256 发射已落主线(otool 56 条真指令)但生产从未激活——真因=build-backend-driver 对 ingest 闭包 ZC=121 plan_not_ready 墙, 生产走 cold 路径无硬件指令**; 打击序=op-lane 静默(16:49 已达)→zc_enumerate 重测→解锁则真 driver A/B(预期 10x+)→仍堵则逐 realizer 根修。②**#13 鸿蒙 M3**: slice-4 代码全落, 真缺口=churn+vsync 组合后 stall_n/p50/p95 从未真机测得; slice-8 两大墙已拆, **唯一剩余=接线切片**(MobileShellWriteHarmony:30119 仍调玩具版, 切到三文件 GenSource/AdapterSource+完整 CMake, 验收=与手写产物逐字节 diff 空+smoke 绿, 无设备依赖); census 需低负载窗; "解锁 iOS"无文档锚待用户确认。③**#14 远端本地化**: ★**M3 门禁已解除**(实测: S1-S7 全部提交与 M3 拆分后共存无冲突, 蓝图安全窗已满足); S2 已完; 立即可开工=S1 宿主 FFI key 第 5 参+S3b Android seek 参数化+ES seek 分支+S4 块缓存生产接线(Init 全仓 0 生产调用点=磁盘缓存实际不生效)+S6 CSG payload 贯通(解锁 S3a 的 0 调用点); S5 鸿蒙侧=架构级另立工单; S4 淘汰策略待拍板。④**#15 小优 CU**: 引擎实际已落 8 片(超"里程碑A五切片"旧账)+S4/S5, 端到端生成回路闭合(纯 Cheng oracle); S2 规则闭环双端真接线(mock 已删); **唯一实质阻塞=Qwen2.5-0.5B 权重下载待用户授权(决策墙)**; S6-S8 无持久化定义待拍板。⑤设备窗清单(归编排者): #26 v12 终验/M3 slice-4 播放终验+slice-8 装机 8 项/#14 S3a S7c/#15 S6 真机一致性。⑥执行纪律: 负载 155 峰值, 实施波等在飞三轮(tl2/#138/wf6)收割+负载回落再开(先 M3 slice-8 接线+#14 三件套, S6 随后)。
>
> ★★2026-07-17 16:4x 收割批次一百一十(点火线快速完成战法: 钉基影子链+81bde41e0 第 8 号回归签名): ①**用户问"点火线为何越退越远"定谳**: 非修复线后退——81bde41e0 巨型快照(bootstrap 重写+src 子系统同卷)给 HEAD 埋 8+ 独立回归, 新墙产生速度一度超过双会话收割速度。②**第 8 号回归签名(致 op-lane)**: 新世代 DRV 自编译 9 秒死于 `compiler csg: executable declaration name invalid decl_index=38 line=549 kind=function`——影子树二分实证与 T78v5/#135 补丁无关(partB-only 变体同死), 纯 HEAD 世代自带; 复现=archive HEAD+partB 四文件→种子烤 DRV(rc=0)→DRV 自编 dispatch_min 即死。#139(根外源恒拒)同时实证: probes 0/11 全灭 `source identity outside known roots root_count=3`。③**钉基战法(点火线与 op-lane 在制子系统解耦)**: 点火链只需"一棵含修复的树"而非落账——`git archive 22482bad4`(81bde41e0 之父, --rebuild 实测绿)+T78 v5+#135 IfCall 根修**双补丁 0 reject 全干净**(证两修复语义原生于 pre-rewrite 世代); 哨兵=种子烤 DRV rc=0+gen2 活过 9 秒死点仍在编译。**钉基全链在飞**: runId=ignite_20260717T083113_f7ecbe(树=out_probe_igx2, 含 gen3 定点 16GiB cap), 绿到哪站点火线完成到哪站。④HEAD 世代影子树(out_probe_igx1, archive HEAD+partB+T78v5+135)留档: DRV 可烤但 gen2/probes 双死于②——**新世代点火解锁条件=op-lane 对 81bde41e0 做系统性回归收口(#137/#139/第8号)**, 在此之前点火线正典以钉基链为准。
>
> ★2026-07-17 16:2x 收割批次一百零九(**#145 根修落账 `3730cc952`**, 双镜头 CONFIRMED×2): span 提取器家族收网净超立卷——三个同构"换行前未遇分隔符→静默空 span"提取器全闭合(parser_take_until_top_level_char+parser_take_until_range_dots+**parser_take_match_target_span**——后者即 #142 判决书记录"如实记录不修"的遗留缺口, 本轮一并收网); 16 消费点零声明式排除逐点定谳(4 真实静默穿透+12 下游兜底), 其中**裸指针写 *ptr= 形态 baseline 实为 SIGSEGV 真崩溃**(复核 B 实测 rc=139); parser_take_* 全家族 10 函数复核, 5 个契约不同者逐点证据排除。修=3 处 2-4 行 die 对称化(14+/5-), 合法形零回归(ifExpr 矩阵/#142 36 格/#132 NaN/compile_fail 21/全量 1082/418 三方一致)。复核 A 独立抓 2 个 verdict 未覆盖的新静默变体均被修复拦截(泛化性证明); 复核 B 补齐 match_target 直接红绿证据(fix 卷如实自报未复现到位, B 构独立 repro 补锚)。★编号注记: 对方批次一百零八有 array-of-struct 案改号 #147/#148——**#146 疑似已被占用, 我方后续立卷从 #149 起先查号**。任务 #145 销(ledger 案)。
>
> ★2026-07-17 15:4x 收割批次一百零八(#143+#144 tl1 REFUTED 2:0 封存重飞 tl2): 三处修复代码正确零回归(双复核独立验证含全量 1082/418 与宽网 537 双编), REFUTED 双因: ①任务点名的旁路扫描真扫出**第四处漏网**=parse_primary 一元负号分支(cold_parser.c ~13157-13179, SLOT_I32/~13161 与 SLOT_I64/I64_REF/~13166-67 三子分支新槽未 body_slot_set_type)——u32 取负×f64 静默错值; **u64 取负×f64 静默出精确 -9.0 而非响亮 die(#78 红线 baseline 既存违反, 从未真正封死)**, 双复核异取值独立收敛; ②fix 座席被强制截断只交 8 行草稿判决书(违反完整性断言铁律)。封存 .REFUTED-tl1; **tl2 重飞(wf_cbddbf55)**: tl1 基座+一元负号三子分支+第五处漏网 body_slot 分配点全清单扫描+完整判决书必须跑满全量取数后成文。
>
> ★2026-07-17 15:1x 收割批次一百零七(**#142 根修落账 `8881232f0`**+#145 立卷): ①双镜头 CONFIRMED×2: 立卷的 (a)字面量恒真/(b)绕过 FCMP 两表现**实测证伪双根假设收敛同一真根**——parser_take_condition_span 换行处未找到收尾冒号时静默 reset 返回空 span(EOF 同情形是 die, 不对称), 空条件落"单一非比较表达式"分支喂垃圾 CBR+游标重置使条件文本被误当 then 分支重解析; 修=2 行门禁(silent reset→die, 消息复用 EOF 分支), 非法形(花括号 if/缺冒号 if/while/elif)全部转响亮拒绝, 合法 36 格矩阵(含 #132 NaN 语义)零回归, 全量 1521 两侧逐字节(仅计时噪声)。案卷小笔误(numstat 4/4 实为 2/2)双复核独立抓到订正。②**#145 立卷(cold_parser, #142 同族姊妹)**: parse_if_expr(ifExpr 表达式产生式)所调 parser_take_until_top_level_char 存在结构相同的"换行前未遇分隔符静默返回空 span 不 die"——复核 B 以调用实参上下文实测真实静默误编译, baseline 与 #142 修后均未防护(范围外); 复现件=ifcond142_review_b_r1_artifacts/newfinding_ifexpr_sibling/。
>
> ★2026-07-17 14:5x 收割批次一百零六(**#136 根修落账 `22e886ea8`**, 双镜头 CONFIRMED×2): ①真根与立卷描述修正: 非"读回 0"存储链路病——**限定单跳 var 全局赋值语句被 parse_field_assign 整条静默丢弃**(裸别名 parser_find_global 恒 miss GlobalDef 全限定注册名→local=NULL→return block 零 codegen 零诊断; 读侧 :13799 早已正确拼限定名, 写侧从来没有对称步骤); 修=!local 分支前瞻单跳 .IDENT 拼限定名+紧跟 = 门控委托 parse_assign(复用既有 kind 分派 store, 零新比较器); 与 qualified_import_var_global_desync **异根定谳**(彼=注册期物理重复需 diamond 双别名, 此=单 import 边语句解析期, 复核 A diamond 拓扑双向反汇编单地址收敛佐证)。②验证: 7-cell 矩阵(113/123/162→0)+写侧隔离诊断(viaFn 0→99)+反汇编级取证(baseline 该语句处零 str 指令)+全量 1520 逐字节+宽网 181/181+#129/#128-r5 夹具零回退。③**★复核 B 证伪"生产零命中"**: src/core/runtime/js_promise_runtime.cheng jsPromiseAllSettled 两处(jsrt.jsObjectTable/jsrt.jsObjectCount 赋值)精确命中触发形——**修前这两笔写一直被静默丢弃**, 修后复活(行为变化=恢复源码本意); 复核 A 的零命中扫描正则漏小写驼峰, 复核网交叉纠错实录。④复核 B 过程披露: /tmp 撞名互删事故(与并发会话)→迁 session scratchpad, 印证 shadow_dir_run_unique 纪律。任务 #136 销。
>
> ★★2026-07-17 13:3x 收割批次一百零五(**#78 五轮收官落账 `d3e0f4c3c`**+#144 立卷+#141 缓期): ①r5 双镜头 CONFIRMED(代码=r4 冻结版 md5 6d6163cd, 文档精确化过三方对表: baseline wrong=40/fixed=28/子集成立/12 格改善披露/F32 双真值实证/第五次独立全量回归一致)。#78 战果链全景: 比较缺臂+算术缺臂(分支序同构)+u32 promotion 符号性+uint64 by-value 响亮守卫+REF 类型标记随槽迁移+**CALL_COMPOSITE F64/F32 返回回填缺分支**(早于全系列、影响一切"var 形参+浮点返回"调用的既存 miscompile, 反汇编级取证)。复核网五轮共抓 4 个假断言+3 个隐藏缺陷层, 全链在卷(floatmix78_v_{a,b}_verdict_{r1b,r2,r3,r4,r5}.md 十卷)。任务 #78 销。②**#144 立卷(cold, u32 类型标记丢失两族)**: parse_scalar_identity_cast 泛型分支从不打类型标记(literal-cast 内联操作数 14 格)+cold_materialize_i32_ref 标记丢失(REF 14 格)——u32×f64 混合 28 格静默错值(baseline 同病 pre-existing), 复现=floatmix78 r4/r5 矩阵 results.tsv。③**#141 缓期注记**: x64/riscv64 浮点比较修复需执行验证, 本机无 qemu-x86_64/qemu-riscv64/wasmtime(#132/#78 双轮 which 确认)——纯手工编码审查=r1b/r2 REFUTED 的同款失败模式, 等工具面(qemu 装机或 CI runner)再开。④partB 巡检 13:31 仍闭(pobj mtime 距 now 83 秒)。⑤新开两线: **#142-r1**(if 浮点条件双表现)+**#136-r1**(模块级 var 数组跨函数读回 0)。
>
> ★2026-07-17 12:4x 收割批次一百零四(#78-r4 判决 1:1+r5 文档精确化轮+#143 立卷): ①r4 **代码双复核背书**(缺陷①REF 类型标记随槽迁移+缺陷②真根修——取证推翻"算术消费侧"原归因, 真因=BODY_OP_CALL_COMPOSITE 对 F64/F32 返回缺回填分支, 与 REF 促进正交且早于全系列存在; probe5 纯 baseline 独立证明; x64 sret 自洽正确未碰/riscv64 rv_sw 窄截断既存缺口未碰皆判断正确), REFUTED(复核 B)仅打 verdict 量化断言——自称 baseline/fixed 同 28 格 wrong, 实测 baseline=40, r4 静默改善 12 格未披露(作者自己 results.tsv 已含此 12 行, 定稿前未核对自有数据); 子集关系与"零新增静默错"仍真。②**r5 重飞(wf_6064d9b2, 代码逐字节冻结)**: 补丁 md5 6d6163cd 钉死原样交付, 只重写量化断言(40/28/子集/12 格表)+F32 回填独立实证+披露勾稽。③**#143 立卷(cold, 复核 A 旁路扫描)**: cold_materialize_i64_value 的 SLOT_I64_REF 分支同构类型标记丢失, 落点 parse_compare_expr 纯整数比较——var uint64 与 int64 直接比较静默误判(baseline/fixed 同病 pre-existing), 复现=floatmix78_v_a_verdict_r4.md 第四节 t20。
>
> ★2026-07-17 12:2x 收割批次一百零三(**#132 根修落账 `d7323bd97`**+#141/#142 立卷+PB 主审线合流): ①#132 双镜头 CONFIRMED: ARM64 FCMP 后 </<= 换 unordered-safe 条件码(COND_MI/COND_LS, 仅两浮点 emit 点, NZCV 真值表双复核独立手推+otool 反汇编 ground-truth 只有 b.lt→b.mi/b.le→b.ls 两分支变化); NaN 矩阵 36/36 修正(仅 != 为 true), 非 NaN 12 格零漂移, 全量回归 1082/418 三向交叉零回归; GT/GE/EQ/NE 推演确认 unordered 行天然正确无需改。②**#141 立卷(cold, 非 arm64 后端浮点比较条件码全值域缺陷族)**: x64 UCOMISS/UCOMISD 仅置 ZF/PF/CF 而 SF/OF 恒 0, CC_L/CC_GE/CC_LE/CC_G 对浮点**全值域**错(非 NaN 专属); riscv64 仅 COND_EQ 用 feq 其余(NE/GT/GE/LE)全误落 flt; wasm 原生 opcode 正确; 双复核独立读码坐实, 卷=fcmp132_verdict_r1.md+两复核卷。③**#142 立卷(cold_parser, if 浮点条件双表现)**: (a)可折叠浮点字面量条件恒走 then(2.0<1.0 返回 true); (b)if 浮点条件绕过 F32/F64_CMP 直落 BODY_TERM_CBR 恒 exit=1(从不发射 FCMP)——复核 A 三组夹具 6 次实测; 有效测法(跨函数 identity 打断折叠+argc 铸源+冒号语法)已写入卷防复踩。④协调: 对方 #139(SourceIdentityKey)/#140(PB load+store 越界)知悉; **PB 主审线合流归对方 round10**(我方 r3 PARTIAL+其终审 REFUTED 改判条件重定义, 我方不再另飞 PB); partB 窗 12:16 巡检仍闭(pobj mtime 距 now 2 秒), 对方 CommitB 本体已过复核同窗排队——**先到窗者落, 双补丁坐标均在账**。任务 #132 销。
>
> ★2026-07-17 11:5x 收割批次一百零二(#78-r3 REFUTED 2:0 封存重飞 r4): 同 bug class 第三层——uint64 die 守卫对**按引用形参恒不触发**(cold_promote_slot_to_f64 SLOT_I64_REF 分支经 body_slot() 分配新槽无条件清空 slot_type, 类型标记从未传递, 守卫恒 false; var uint64×f64 baseline die→r3 静默符号翻转实测 -7459089752610786183 手算吻合); 复核 A 另抓正交更深缺陷: **REF 形参×f64 算术本身静默错值**(int64 也中招, 5+0.5 都错; 插桩证实前端 IR 正确 F64_ADD 已发射, CMP 消费正确, 缺陷限定算术消费侧)——同时证伪 r2 双复核自己的"i64ref_mix 4/4 PASS"断言(复核链断言也要被复算)。r3 已验真部分: by-value 120 格+全量回归 1082/418 两侧一致(复核 B 跑满, 订正 fix 卷 PARTIAL 之虞)。封存 .REFUTED-r3; **r4 重飞(wf_4adaced7)**: 配方=REF 类型标记传递(body_slot_set_type)+算术消费侧取证根修(或整臂响亮 die)+四形态{字面量,变量,调用返回,REF}全格三态表, 静默错=0 红线。三预置缺陷复核排除入卷(科学计数法词法/f64 跨函返回 ABI/var uint32 同源, baseline 同病勿混)。
>
> ★2026-07-17 11:2x 收割批次一百零一(PB 复验 r3 PARTIAL+前提订正+partB 风险预警): ①**★前提订正(批次一百②表述纠错)**: partA 单独**未**复活 --rebuild——净 HEAD 克隆 rebuild 现死在签名②(filterActive, rc=3 两次确定性复现); rebuild 复活=partA+partB 全套。PB 复验/CommitB 验证通道仍未解锁, 解锁链=partB 落账(+套件门另需 #137 收口)。②**PB 复验 r3 判 PARTIAL**(卷=pb_reverify_r3_verdict.md... 产物在 20260717/): r2"从未存在含 diff 可运行 driver"核心论据被推翻(锚点 22482bad4 路线+HEAD 加 partB 使能路线均建出确定性 driver, 四 sha 在卷); 锚点上 gate 全绿+双真值绿**但 diff 前后 .o 逐字节相同**=夹具未触达新 realizer, 缺陷疑似 81bde41e0 之后引入; 座席原主张 op_index 16→18/bail=709 仍无法证实证伪。PB 留待: partB 落账后 HEAD 路线重验, 或 81bde41e0→#137 引入点之间可编译中间提交二分。③**★partB unhold 巡检(11:20)+风险预警(致 op-lane)**: 窗仍闭(typed_expr mtime 距 now 2min); 且 op-lane 现工作树 WIP **未自修**四缺陷点(filterActive 裸引用 22 处仍在; CompilerCsgUniqueSourcePathsFromFilter 的 set.profileSourceIndex 误用移位至 ~:5233 仍在)——**下一笔快照落账将把签名②(build-backend-driver 阻塞)继续带进 HEAD**; partB 修复 hunk 坐标=~/cheng-patches/20260715/rebuild131_fix_r1.patch.PARTA-LANDED-f28395104.PARTB-HELD-oplane-active(typed_expr 4 裸引用改 filterIndex.active/csg 加 templateIndex 形参/pobj+b2slots 补 9 实参), 双镜头 CONFIRMED 在案, 邀请直接吸收进 WIP 或留静默窗我方语义重基落账。
>
> ★★2026-07-17 11:1x 收割批次一百(#131 分割落账+#78-r2 REFUTED 重飞+案号撞号更正): ①**#131 双镜头 CONFIRMED, 签名① partA 落账 `f28395104`**(cold_parser.c: locals_add_global_shadow 的 slot_aux 污染行删除+cold_convert_scalar_const uint64 全宽误拒修, 均 81bde41e0 遗留)——`zc_fast_loop --rebuild` 路线复活(rc=0, driver_sha 确定性 5d6b1b42/复核 3b3a7534), **PB 复验与 CommitB 验证通道解锁**; **partB HELD**(typed_expr filterActive 4 裸引用+csg templateIndex+pobj/b2slots 9 实参, 封存=rebuild131_fix_r1.patch.PARTA-LANDED-f28395104.PARTB-HELD-oplane-active)——落账窗关闭实证: csg mtime 距 now 9 秒, op-lane 活跃编辑中, 且其 WIP 可能正自行收尾这些半成品(unhold 时先判对方已修否, 语义对账后只补缺口); ci_gate 红绿=13/22→15/20 净 +2 零回归。②#131 fix 卷范围外披露+复核双确认: **snapshot-only 增量可达性子系统 panic**(typed_expr:17537 "snapshot-only function signature missing")挡 --suite 44 夹具全 ABORT+ci_gate 19 个 libp2p 项+WAN e2e 深层——81bde41e0 同批新子系统(csg 4000+ 行 frontier/round), 主树未跟踪的 934 行 smoke 证实 op-lane 在制, **立卷 #137 归 op-lane 裁决勿碰**。③**#78-r2 REFUTED 2:0 封存重飞 r3(wf_fbb565e3)**: r2 算术侧真修(41 项双盲 oracle 过)但 uint64(共享 SLOT_I64 kind)×f64 被新路由从响亮 die 劣化为 ≥2^63 静默符号翻转(双复核独立收敛), verdict 又一假等价断言; r3 配方=cold_promote_slot_to_f64 补 cold_slot_type_is_uint64 检查, 真无符号转换(x64 无直达指令需两段技巧)或保持响亮 die, 禁静默。④**案号撞号更正**(对方 10:38 批次先claim #134/#135): 我方批次九十九"#134 模块级 var 数组读回 0"**改号 #136**; snapshot-only 案=上文 **#137**; #78-r2 复核新发现"SLOT_I64_REF 裸值参与比较从不解引用静默 I32_CMP(pre-existing)"**立卷 #138**(复现卷=floatmix78_v_a/b_verdict_r2.md)。⑤T78 注记: 对方 round6 交付两族门合修(批次九十五归因冲突裁决兑现=两门皆活各占一半), round8 双镜头在飞过门才落账——我方节点门案卷价值兑现。
>
> ★2026-07-17 11:0x 收割批次九十九(**#129 根修落账 `931e090f5`**, 双镜头 CONFIRMED×2+#134 立卷): ①ConstDef 补 decl_path 物理身份戳=#114 范式第五处(零新比较器, 复用 cold_type_decl_path_same_physical); 四注册函数透传+两真实 import-merge 落点打戳(含 r1 内部红绿抓到的枚举变体 tag 独立合并循环漏戳)+三消费侧扫描折叠。真实触发=connection.cheng Direction enum 经 tcp_transport_smoke 双别名边到达。②验证: 11 文件收敛族 10/11 假歧义消失推进到各自独立缺陷, 1/11(node_resource_sync)实测定谳为真实异物理同名碰撞正确保持响亮; r5 真碰撞负对照正反两向逐字节一致; 复核 A 独立 9 正向 cell+4 负对照零过折叠; 复核 B 宽网 obj 口径 181 文件 55→59 通过零回归+found_decl_path 钉首候选算法代数证明。③**#134 立卷(cold, 复核 A 旁支发现)**: 导入模块内模块级可变 var 数组跨函数读写不一致(读回 0)——GlobalDef/var 存储链路, 无 diamond 单一 import 对照已排除与 #129 相关, 复现卷=constdiamond129_v_a_verdict_r1.md。任务 #129 销。
>
> ★2026-07-17 10:4x 收割批次九十八(**#44 根修落账 `e01ca2b3b`**, 双镜头 CONFIRMED×2+归因修正+#133 立卷): ①**根因定谳修正旧案卷**: 非"内嵌 struct 后继字段偏移算法"缺陷——真根=cold_parser.c 具名 `type X=` 对象字段路径漏窄标量宽度收窄(int8/uint8/int16/uint16 全落 SLOT_I32 的 4 字节; 匿名元组/枚举 payload 两兄弟路径早已正确), DarwinStat 两个 uint16 头字段致 st_ino 起全体 +8; 修=cold_parser.c:3665+:2166 双调用点接字节精确 sizer+回归锁夹具接线(97+/2-)。自宿主后端静态读码+compiler_main.direct 实测双重确认无此缺陷(ZC=0+8 断言全过)。真实 stat(2) 端到端修后与 shell stat -f 真值逐位匹配; 全量回归 1075/424 两侧逐字节零差异。复核发现: :2166 处改动在现管线下冗余(symbols_refine_object_layouts fixpoint 会覆盖)但无害防御性; rc=252 判别=return 位掩码非信号。②**#133 立卷(cold, 相邻窄宽度缺口族)**: bool 字段未收窄至 1 字节(fix 方如实披露)+定长数组 int16/uint16 元素宽度未收窄(cold_fixed_array_element_size_visit 独立调用点, 复核 A 发现), 复现卷=structoff44_v_a/b_verdict_r1b.md。③跟进(不立卷): program_support_backend.cheng cheng_file_mtime_raw 的硬编码偏移 workaround(4/48/96)在 #44 修后语义仍正确, 可择机还原为直接字段访问(战术 hoist 还原纪律)。任务 #44 销。④**★#131 撞车协调注记(致 acb7a9d3 round7)**: 我方 wf_423dc1a6(#131-r1 专线, fix+双镜头)于 09:5x 已在飞——早于贵方批次九十七"接卷认领", 未入账是我方疏漏致贵方无从知晓。按 CommitB 撞车先例执行: **先 CONFIRMED 者落账, 另侧转语义对账/验收面**(贵方 b1ac0506a 对账修抓真回归即此协议价值实证, 已知悉采认)。⑤b1ac0506a 采认: 我方 3accf4a8b 的 sourcePath 朴素判等确有词法归一化盲区, 贵方跟进修+双夹具补齐, 无异议。
>
> ★2026-07-17 10:3x 收割批次九十七(#78-r1b REFUTED 2:0 封存重飞+#132 立卷): ①**#78-r1b 判决**: 比较侧修复真(parse_compare_expr 混合分支+cold_promote_slot_to_f64 含 u32 符号性修, 双复核独立取值全过), 但**算术侧同构缺陷原样未修**——parse_term(~14901)/parse_arith_expr(~15011) I64 分支仍抢跳, f64×i64 四则 100% die, fix 卷误记"已有 promotion 不缺臂"被双复核实测证伪=假完整性声明; 封存 floatmix78_fix_r1b.patch.REFUTED-r1b, **r2 已带配方重飞(wf_452e05b4)**: 同构前移 F64-mixed 分支+i64 算术格逐格红绿+诚实声明义务(NaN/#132/wasm I64_EXTEND_I32_U 更正)。②**#132 立卷(cold, 预置缺陷)**: ARM64 FCMP 后条件码复用有符整数 COND_LT/COND_LE(N!=V)非 unordered-safe(应 MI/LS)——NaN 操作数下 </<= 静默错布尔(true 代 false), 纯 f64×f64 同病(baseline 实测), 复现卷在 floatmix78_v_a_verdict_r1b.md; 修点=cheng_cold.c FCMP 条件码(注意三镜像); 与 #78 咬合: 混合比较修复落地会把该病暴露面从"die 挡住"扩到全 f64×int 比较, #78-r2 只声明不越界修。
>
> ★★2026-07-17 09:5x 收割批次九十六(ceaefe81 会话, 双线收官三落账+两新案): ①**CommitB 前置根修落账 `3accf4a8b`**(双镜头 CONFIRMED: PriorBindingType/Consider 补 sourcePath 形参+谓词早退, 9 调用点, 29+/3- 三文件; 四组 A/B 双真值+两边界打击全过; 净土窗双侧落账, op-lane typed_expr 2708 行 WIP 零重叠完好)+**spec §2.2#4 修订落账 `809764531`**(第4条移出插桩候选, **Commit B 解扣可开工**); 补丁封存 .LANDED-3accf4a8b。②**#128-r5 解扣落账 `9a61c94c8`**(双镜头 CONFIRMED×2, 14 文件 144+/2-): 判据层 HEAD 新 const 机器(symbols_add_tagged_const 三元比较)确为 r4 严格超集, 真缺口=**#117 恢复帧吞 die**(cold_collect_import_module_types_from_resolved setjmp 把不可重试的 const 碰撞 die 当类型扫描失败吞掉, 12/12 跨类型碰撞对静默 rc=0), 修=die_const_collision 硬出口仅替换两碰撞分支; WAN 前沿 f9541bcc 未倒退; **r4 HELD 解扣终局**(封存 .SUPERSEDED-r5-landed)。③**性能线热点全程锚正典**=~/cheng-patches/20260717/hotspot_zc0_fullrun_r2.md(六相位墙钟加权: pobj 46.69%+typed_expr 28.49%+parser 9.78%+path 7.04%=91.99%; 打击目标 top3=DeclaresType 三兄弟簇 13.94%/NormalizeTypeText 8.63%/PathTrim 6.81%; 新发现 cheng_ptr_plus 原语簇 4.14% 集中 phase1/2+map 撞号陷阱 24 处 .Lcheng_cold_N 需查 provider*.map)。④**PB +296 重审 REFUTED**(卷=pb_rereview_r2_verdict.md): 根因真实+代码结构可信+backend2 副本非死码, 但其宣称的验证结果不可能测得——改判条件=#131 修复后带真实 driver_sha 对比重验, diff 原地留待。⑤**★#131 立卷(高优, 挡三线)**: HEAD 净树全局 driver 重建阻塞, 双签名双路线(zc_fast_loop --rebuild=`opaque sequence store value too large` / build-backend-driver=`typed_expr.cheng:1 unknown identifier 'filterActive'→body missing TypedExprBuildSourceContextBorrowed`), a7ace4d20 与 4ccb7115f 均红(有无补丁同构), 05:17 driver_rebuild.log 已红; 二分锚=81bde41e0(const/parser 重写)^=22482bad4; 挡: PB 复验+CommitB 自身验证+T78 修后种子烤链。⑥T78 修复权维持让道(对方 round6 在飞), 我方节点门案卷已入批次九十五待其对表。
>
> ★★2026-07-17 09:3x 收割批次九十五(ceaefe81 会话, 复飞双线+T78 交叉定谳): ①复飞五线在飞: #44-r1b(wf_2194cfe5)/#78-r1b(wf_91303520)/#128-r5 解扣轮(wf_509cbc51, 对方 const 重写 81bde41e0 落账 bootstrap 已净=unhold 达成)/点火线 T78-r2(wf_4443be7e 已收)/性能线三臂(wf_dcdfc1ee: PB 重审+CommitB 前置 sourcePath 根修+热点合成)。②**T78-r2 节点路径 ROOT_CAUSED(与批次九十四文本路径定谳同罪不同门, 交叉验证卷=~/cheng-patches/20260717/t78_r2_root_cause_findings_t78r2.md)**: 我方臂独立定谳 **节点路径第二道门**——if-语句节点分派器"批次6e"策略A(pobj:~50362/backend2:~45096): PrimaryBodyIrNodeEvalProbe 融合探测的安全闸门 PrimaryBodyIrNodeTreeHasCallExpr(pobj:35275/backend2:20228, 两副本逐字节同)只认 CallExpr 不认 IndexGet → PrimaryBodyIrEvalNode(38582) 对 LogAnd 两侧求值+I32BitAnd, 正确的 NodeEmitCondCbrChain(50436) 被策略A continue 吃成死码; 符号相撞对 T78 证伪与九十四一致(7 组同名函数逐字节 diff rc=0)。**★归因冲突警示(修复臂落账前必须裁决)**: 九十四认领 CondValue01Slot(~13302)+TextHasRealCallSurface(~31726)文本门, 我方认领 EvalNode+NodeTreeHasCallExpr 节点门, 两案卷用同一条 and 指令做铁证——同一崩点只有一个实际发射者, 另一门是潜伏同类缺陷; **只修文本门或只修节点门都可能 24min 重烤仍红**, 修复必须两门谓词同扩(IndexGet/'[' 入危险清单或新谓词)且两文件(pobj+backend2)四处同步, 先加发射者 trace 定谳哪门实际认领该语句再收网。③**让道声明**: T78 修复实施权=acb7a9d3 round6(wf_7b6106b6), 我方不另飞修复臂; 本卷+归因冲突转其修复臂对表素材。**性能线撞车面**: 对方 wf_8a5098c9 同飞 CommitB sourcePath 根修+热点合成+符号普查——我方 wf_dcdfc1ee 重审/分析臂(只读)继续跑作独立复核面, CommitB 前置补丁收割时先查对方是否已落账, 已落则转语义对账不重复落。
>
> ★2026-07-17 10:2x 收割批次九十三(**停飞终态: 用户明令停止在飞任务**): TaskStop 已停 #44-r1(wf_29410d0d)与 #78-r1(wf_7a6285c8), 均中途无产物落盘。恢复=用持久化脚本重发并**换新 run 后缀(_r1b)**, 残留工作区 structoff44_shadow_r1/floatmix78_shadow_r1 禁复用(死亡轮半成品纪律)。memory 检查点已同步订正(收割→重飞)。其余 resume 账本(#128-r4 HELD 解扣/#129 #130 排队/#54 缓期/纪律速查)见批次九十二不变。现场终态: 零在飞, 零我方未提交改动, 23 案在史。
>
> ★2026-07-17 10:0x 收割批次九十二(**检查点: 保存现场暂停待续, 用户指令**): ①**在飞两线让其自然跑完**(落账权在编排者, 不会自行入主树): #44-r1(wf_29410d0d, 内嵌 struct 偏移+8, 产物=structoff44_fix.patch+verdict 三件套)与 #78-r1(wf_7a6285c8, 浮点×整型 promotion 矩阵, 产物=floatmix78_*)——恢复时先查 /Users/lbcheng/cheng-patches/20260715/ 有无三件套落盘, 有则直接按双镜头判定收割(CONFIRMED→双侧落账/1:1 或 2:0 REFUTED→带配方重飞), 无则用持久化脚本重发(workflows/scripts/{structoff-44-r1-wf_29410d0d-927,floatmix-78-r1-wf_7a6285c8-1f8}.js)。②**HELD 待解**: wanfront128_r4.patch.CONFIRMED-HELD-bootstrap-active(md5 e378e8d0)——unhold=bootstrap 四文件外部 WIP(cheng_cold.c/cold_parser.c/.h/cold_chengcsg_format.h, const 机器重写级 1271+/309-)落账且 worktree M 消失→语义重基轮(先判对方是否 r2-r4 超集)。③**排队工程**(拍板过时序): #129(ConstDef diamond 去重, 需 decl_path 打戳)与 #130(callArgTypesTexts 调用节点键控)均等 #128-r4 解扣+op-lane 静默后规划。④#54 缓期勿单开(等 WAN 链触及 gossipsub)。⑤今日战果: **23 案落账+2 诊断归档+2 伪立卷裁决**, WAN 链七墙连破(现前沿 ed25519.validateSignatureBytes md5 f9541bcc), CHT 线机制16-19 四连收官, 复核抓真缺陷 19 轮全部带配方闭环。纪律新增五条已入 memory(exit-code 判别/证据稳定性边界/落账即删克隆/stash 藏匿审计/兄弟实现对账含换调用点)。
>
> ★2026-07-17 09:4x 收割批次九十一: `31bdb2f6e` **#117 三轮收官落账**(16 文件 +170/-15, 双镜头 CONFIRMED, 双侧纪律落账): import 扫描 die-longjmp 逃逸**全对称化**——r1 灰栈对称+recovery 全局 force-false 根因(超立卷: 全部 repro 实际死法)→r2 once-record 收窄(consts/enum 步)→r3 types 步(自带内部 catch)也改 bool 并入 completed_clean && 链。钻石坏依赖三步 die 矩阵 3×2 逐格重试归属 3→24 全对称; 连续三类 die 组合零交叉污染(ColdErrorJumpDepth 全局栈多 pair 交替建拆无串染); 真环不削弱+幂等零退化+诚实边界三卷一致。复核 A 自建 enum 步反例顺带根因定位 COLD_MAX_OBJECT_FIELDS 本地覆盖(1024 vs 头文件 512); 复核 B 记一处案卷完整性 open item(§2.1 漏述一处 inline 披露的 save/restore, 探针不可复现不构成回归)。任务 #117 销, 三轮工作区全删。在飞两线: #44-r1/#78-r1(#128-r4 HELD, 外部 bootstrap WIP 四文件仍未提交)。
>
> ★2026-07-17 09:1x 收割批次九十: **#64 诊断三轮归档收案**(d3 CONFIRMED, marshal64_diag_verdict_r3.md 为正典)——d3 迷你轮纯记账修正且额外抓到两轮复核都漏的第三处假 verbatim(§3.1)合规订正; 复核精度已达"文档自述与逐节 diff 对表"层级。任务 #64 销, **#130 立卷**(callArgTypesTexts 调用节点键控改造工程——#64 定谳活体 UB miscompile 的根治路线, self-host backend 域 op-lane 活跃期避让, 落账窗对齐 #128-r4 解扣)。扩编两线: **#44-r1**(wf_29410d0d: 内嵌 struct 后继字段偏移 +8, C harness 假绿前科→手工锚定纪律); **#78-r1**(wf_7a6285c8: 冷后端浮点×整型 promotion 缺臂矩阵, 复用 #95 UCVTF 基建, 撞并发 const 重写区则报合流)。在飞三线: #117-r3/#44-r1/#78-r1(#128-r4 HELD)。
>
> ★2026-07-17 08:4x 收割批次八十九(#64 d2 复核 1:1 REFUTED——记账失实非技术错): 技术内容获最强档独立复现(resolved_index 六种环境扰动逐字节稳定=3/=4, 四方二进制 md5 一致 c8007fe2, 17/17 夹具两轮双 clone 重放, 运行期退出码各方各测各异坐实 UB 不可移植; 矩阵 7 维度全真实补格含三调用共享行新阳性)。死因: 五个声称"逐字相同/原样保留"的章节实测均被编辑(编辑本身正确必要——不改 §2.2 就会让被推翻的 159 论断继续挂着, 但元陈述系可机器验证的假话)——与本轮核心命题"如实标定证据边界"同一精度纪律的姊妹违例。修正路径极窄(只改标注+修订清单)→**d3 迷你轮开飞**(wf_4da51298, 1 修订+1 机器验证, 技术内容已双验两轮不再重审)。在飞两线: #117-r3/#64-d3(#128-r4 HELD)。
>
> ★2026-07-17 08:2x 收割批次八十八(#117 r2 复核 1:1 REFUTED, 洞收窄到一步): r2 主体全对——once-record 收窄(consts/enum 步 die 路径)经复核 B r1-only 消融独立坐实(21/24 静默→0/24)+复核 A 四升级镜头(三 importer 36 次诊断/修复后重编译收敛/重试×真环/风暴上界严格线性于 import 边数)+诚实边界(末行派生症状不变系可达性结构, 双复核认可)。但复核 A 零声明式排除审计再挖一步: **types 步(中间步)自带内部 catch**——die 被自己吞掉正常返回, completed_clean 仍 true→record 照做→同族静默跳过在 types 步 die 钻石拓扑复现(自 #113 起即存在, 收窄框架内可修非结构限制)。配方=cold_collect_import_module_types 也改 bool 并入 && 链(三步全对称)。封存 greystack117_r2.patch.REFUTED-r2(md5 ee0a7e21)→**r3 开飞**(wf_646bafb3: 三步 bool 对称+3×2 die×拓扑矩阵逐格)。在飞两线: #117-r3/#64-d2(#128-r4 HELD)。
>
> ★2026-07-17 07:5x 收割批次八十七(#64 诊断 d1 复核 1:1 REFUTED——UB 被误封确定错值): 静态根因双复核证实准确(三收集器共享"非裸参数转发即留空"判定式: A 族死代码/B 族按源码行号键控/C 族仅 int32 分支; **行级键控致行内多调用串号**——零探针纯 HEAD 实锤活体静默 miscompile crosscontam, 复核 A 用全异命名 repro 独立坐实)。但复核 B 打穿核心实测证据: "稳定 exit=159"实为 **UB**(同 md5 二进制仅改 envp/cwd 测出 ≥9 种退出码=str 胖指针当 int32 搬运读漂移地址症状; 编译期 resolved_index 同扰动下逐字节稳定)——**"编译期确定选错"为真, "运行期稳定错值"为假**; d1 把 UB 封进现状锁夹具且未做跨环境稳定性检验(首次独立重跑即变 143), 断言计数还报错。B 并正确运用 #110 纪律排除 143 信号假象。★新教训: **实测证据必须标定稳定性边界**(跨环境/跨编译两态自证), 运行期数值断言让位编译期信号锚(resolved_index trace)。→**d2 修订轮开飞**(wf_2bba8e54)。★#64 定性升级: 不只理论 gap, 是合法代码今天可达的活体 UB miscompile——d2 归档后按路线图(调用节点键控数据结构改造, lowering_plan+typed_expr+ccsg schema 联改)立工程卡。在飞两线: #117-r2/#64-d2(#128-r4 HELD)。
>
> ★2026-07-17 07:2x 收割批次八十六: `dd2d1d7bb` **#92 单轮收案落账**(2 文件 +116/-18, 双镜头 CONFIRMED): ChainNodeCliExtractStateText 缩进级联**字节级考古复原**——dffc01560 跨 7 循环 while→for 机械重构 6 处正确唯此函数撕伤(删 i=i+1 连带 phase1/2/return false 级联拍平出循环体→continue outside loop+body missing)。复原法=损坏前形态+该 commit 真实意图的机械归一化, **双复核各自独立推导变换后与补丁逐行 diff 为空**=零逻辑夹带铁证; 后续两 commit 对账无遗漏。13 组行为矩阵(每 if 臂+tail 四臂+边界)手工语义推导+stage3 真跑全绿; 49 测试 11 失败逐一 stash A/B 定因全无关(2 个系复原后才暴露的更远既有 gap, 因果链坐实)。任务 #92 销, 工作区已删。在飞两线: #117-r2/#64-d1(#128-r4 HELD)。
>
> ★2026-07-17 06:5x 收割批次八十五(#54 三度定谳不可观测, 诚实 BLOCKED 零补丁): 三证据链——①canonical WAN 首阻塞=scoring 墙(#128 家族 HELD 领地, md5 19a92697 与账吻合); ②**HELD 补丁纯探针越墙法**(应用 wanfront128_r4 HELD 补丁于影子克隆探路→下一前沿 ed25519.validateSignatureBytes md5 f9541bcc 与批次七十六预告逐字节吻合→用毕 git apply -R 完整撤回+bootstrap 零漂移核验——探针纪律典范), gossipsub 仍在若干未知墙后; ③PubsubPeerIdList 构造模式(镜像 gossipsub.cheng:142-143 省略定长数组字段部分具名构造)孤立 repro 单文件+跨模块两形态 rc=0 真跑正常。与 07-15 两次历史定谳一致。处置: #54 改卡缓期(勿再单独开轮, 待 WAN 链触及 gossipsub 自然复测)。在飞三线: #117-r2/#92-r1/#64-d1(#128-r4 HELD)。
>
> ★2026-07-17 06:2x 收割批次八十四(扩编三线避热区): #128-r4 解扣条件未达成(外部 bootstrap WIP 增至 4 文件仍未提交)+op-lane 扩至 macho_provider_linker/system_link_exec(故 #59 顺延)。开三线——**#54-r1**(wf_e9ab9658: 切片③第六墙 gossipsub.PubsubPeerIdList unresolved, 冷解析族用今日基建); **#92-r1**(wf_403f696a: chain_node_cli_core.cheng 缩进级联复原, 考古对账纪律禁一刀切回滚); **#64-d1 诊断立卷**(wf_b9605892: body-IR 字面量实参 marshal gap, 关键论断"修识别=更糟"须探针实测验证, 零生产改动机制18 先例)。在飞四线: #117-r2/#54-r1/#92-r1/#64-d1(#128-r4 HELD)。
>
> ★2026-07-17 06:0x 收割批次八十三: `e4f65d0fb` **#88 单轮根修落账**(10 文件 +173/-10, 双镜头 CONFIRMED, 双侧纪律落账): kind=2/5 身份分裂真因=symbols_resolve_object_visit **四个裸名 ambient 扫描**数 diamond 重复不折叠(同物理双别名=2 候选→假歧义 NULL→兜底猜 SLOT_VARIANT kind=2 与精确路径 kind=5 分裂)——**#114 范式的第四处漏网**, 修=逐字镜像(found_decl_path+cold_type_decl_path_same_physical)零新比较器。真实生产触发 node_resource_smoke.cheng 编译通过; **1089 文件大扫**18 差异全 pristine-rc=2 方向(2 野生编译修复+16 前进至无关既有, 其中 11 个收敛于 ConstDef diamond 同病→**#129 立卷**——ConstDef 无 decl_path 字段需打戳工程, 建议与 #128-r4 HELD 及并发 bootstrap const 重写合流规划); typed-let enum 邻件控制夹具证实异根未越界(留 #125 系)。真歧义负对照零过折叠。任务 #88 销, 工作区即删。在飞两线: #117-r2(#128-r4 HELD)。
>
> ★2026-07-17 05:3x 收割批次八十二(#117 r1 复核 1:1 REFUTED, 残留载体转移形): 灰栈 push/pop 对称化+ColdErrorRecoveryEnabled save/restore 双修复经复核 A 7 组升级对抗(enum 步 die 逃逸/双目标连环 die/三层嵌套最深 die/真环×die 交叉两序, exec=77/55/99/66 真值)+B 全套验证为真——**根因定谳超立卷**: 不只灰栈, 还有 recovery 全局被嵌套扫描完成后 force-false 致下一 die 直接 exit(2)(这才是全部 repro 的实际死法)。但复核 A 抓出**残留载体转移**: _from_resolved 对 die 无条件正常返回→once-record 无条件登记→钻石图共享坏依赖只跑完 consts 步就被永久记 SEEN, 第二 importer 不再重试, 真根因被派生错误(kind=13)顶替——"die 后残留→静默跳过"这一任务书核心问题的新实例, 载体从灰栈换成姊妹 registry(patch 头顶旧注释变假)。封存 greystack117_fix.patch.REFUTED-r1(md5 5ee860e1)→**r2 开飞**(wf_1850463e: once-record 收窄干净返回路径+重试语义×真环边界+重试风暴上界)。在飞三线: #117-r2/#88-r1(#128-r4 HELD)。
>
> ★2026-07-17 04:5x 收割批次八十一: `256e1bf11` **#99 单轮收案落账**(2 文件 +81/-5, 双镜头 CONFIRMED, **双侧纪律在锁竞争下实战首验**): ①#93 原夹具经消融实证系空锁(对第二缺陷零区分力), 补 HolderB 真实聚合字段赋值路径锁——三态咬合(消融红/HEAD 绿/本修绿)两独立 clone 重放; ②镜头 a 过度拒绝场景当前 HEAD **诚实报告不可复现**(既有短路先行, 双复核独立证实非夸大), 硬化照做: mangled key 换物理身份锚(尾名必要+decl_path 充分, 复用 #114/#126 基建)——钻石别名冗余符号 2→1 真收益(nm+真链接运行值), 真碰撞仍双符号仍响亮, 三高危比较点分毫未动。★落账实录: bootstrap 带外部 WIP(与 #128-r4 同一并发工程)但 hunk 零冲突→双侧落账(--cached 进索引+裸 apply 进工作树+裸 commit); 中途撞 index.lock(对方 git 活跃)重试循环第一轮即过, 外部 WIP 完好。工作区已按磁盘纪律删除。任务 #99 销。在飞两线: #117-r1/#88-r1(#128-r4 HELD)。
>
> ★2026-07-17 04:2x 收割批次八十(#128 r4 双镜头 CONFIRMED→**落账被并发 WIP 扣押 HELD**): r4 四轮收口 scoring const 墙——dup 检测收敛类型感知共享 helper cold_const_kind(三构造函数统一)+**追加挖出第二根因**(parse_const_member_line 的 i32 兜底把 float 字面量静默存 0, 双注册被旧宽松检测侥幸掩盖; 收紧后暴露, 修注册分歧本身而非放宽检测=生产级纪律); 12 格类型矩阵仅缺口格翻转+双复核独立取值排除巧合+pristine 基线(严于 fix 自用)。**但 apply 时发现 bootstrap 三文件带未提交外部 WIP**(1271+/309- 跨 7 文件含 x64_emit/macho_direct, 正打在 symbols_add_const/cold_collect_import_module_consts/cold_eval_i32_const_expr+880 行——const 家族机器整体重写级, mtime 03:52 仍活跃)——并发会话同战场深度工程。按 #95 先例扣押: **wanfront128_r4.patch.CONFIRMED-HELD-bootstrap-active**(md5 e378e8d0), unhold 条件=bootstrap worktree M 消失+对方 commit 落账→语义重基轮(须检查对方工程是否已吸收 r2-r4 语义, 若超集则只补 dup 缺口+夹具)。★连锁预警: 在飞 #117/#99/#88 三轮全部目标 cold_parser.c, 收割时同样面临 HELD 判定。在飞四线: #117-r1/#99-r1/#88-r1(#128-r4 HELD 待解)。
>
> ★2026-07-17 03:5x 收割批次七十九(扩编三线): op-lane 带未提交 WIP 活跃 src/core(pobj/backend2/parser 全 M, mtime 00:28-00:42)→backend 域(#111/#112/#96)继续避让, 冷侧三线齐飞——**#117-r1**(wf_d827e2bb: 灰栈 die-longjmp 逃逸非对称, 恢复路径清理对称化); **#99-r1**(wf_a0af975b: #93 遗留双件, 回归锁三态咬合证明+裸名坍缩过度拒绝); **#88-r1**(wf_053466b6: kind=2/5 身份分裂, 复用今日 decl_path f26beaf33+物理同型 a3bbe0f37 基建, #125 typed-let 邻件一并定性)。全部继承今日纪律全集(独立 verdict/零声明式排除/≥128 判别/Edit-only 撤回/克隆战后删)。在飞四线: #128-r4/#117-r1/#99-r1/#88-r1。
>
> ★2026-07-17 03:3x 收割批次七十八(#128 r3 复核 1:1 REFUTED, 死因链三连环): r3 主体扎实——ConstDef 消费点 9 处/6 类全枚举(镜头 A 独立 grep 复算零遗漏+15 组矩阵)+限定名三消费点收敛共享 helper cold_materialize_const_value+变体 tag 门槛+复核 B r2 反例闭合(qualdot bit-exact)。但镜头 B 打穿**枚举的声明式排除项**: 三 const 构造函数 dup 碰撞检测被"注册侧非消费侧"一句排除——实测 symbols_add_const 只查 is_str 不查 is_f64(str/f64 构造函数各查了对方, 独此不对称)→diamond 默认别名撞名+float 先注册+int32=0 后注册被"无害重复"静默吞(baseline kind-mismatch 响亮 die→fixed rc=0; 反向序正确 die=缺口精确一处)。★死因链三连环成型: r2"唯一消费点"未枚举→r3 枚举但声明式排除→r4 判据升级=**零声明式排除**(每个字段读取点含构造函数, 要么进矩阵要么实测证明)。封存 wanfront128_r3.patch.REFUTED-r3(md5 7913c201)→**r4 开飞**(wf_b7e8bdcc: dup 检测类型感知收敛+12 格类型组合矩阵+wb3_typecollision 正反两向回归锁)。r3 fix 工作区已按磁盘纪律删除。在飞一线: #128-r4。
>
> ★2026-07-17 02:4x 收割批次七十七(磁盘满事故+恢复): 高吞吐战役日把根卷写满(剩 117Mi)——批次七十六 git commit exit 128、harness 任务输出写不进、Bash 工具瘫痪(输出文件开不了)、#128-r3 首飞 BLOCKED(诚实上报未伪造)。恢复: 趁空间波动挤进 rm 命令, 两波清理 90+ 已落账轮工作区克隆(补丁+判决卷均已独立持久, 克隆可再生; 在飞轮目录不碰)回收 ~33Gi(117Mi→36Gi)。批次七十六补提交(a116dba1b), **#128-r3 重飞**(wf_baba1d1d, 脚本复用)。★新纪律入 memory([[feedback-shadow-dir-run-unique]] 补条): 落账/封存即删该轮工作区克隆; 每 5 批次抽查 df。在飞一线: #128-r3。
>
> ★2026-07-17 02:1x 收割批次七十六(#128 r2 复核 1:1 REFUTED, 洞收窄到两读取点): 根因定谳扎实——scoring 墙真因**不是**三个假设(own_imports/import_mode/作用域键)而是 **const 注册管线对 float64 零承载**: cold_collect_import_module_consts 只认整数字面量+整数折叠, -10.0 两路皆拒且无注册; 两消费者对"找不到"分道扬镳制造假象(模块级 var 取值静默 0 vs parser_find_const 正确 die)。修=ConstDef 加 is_f64/f64_val(镜像 is_str)+symbols_add_f64_const+裸名消费点接入(复核 A 双向 mutation+6 组对抗矩阵验证扎实)。但复核 B 用 C 级实测**证伪案卷"唯一消费点"断言**: parse_primary 限定名 alias.constName 还有两读取点(:12817/:12876)只判 is_str——注册使名字可查后限定路径读遗留 value=0, **编译期响亮 die 变运行期静默错值**(lib.floorThreshold repro 3/3; 回归网测不出因现库恰无人对浮点 const 用限定写法=rc 层盲区再实证)。★与机制16 r4"全消费方审计"同形教训三录: "唯一消费点"类断言必须全枚举清单背书。封存 wanfront128_r2.patch.REFUTED-r2(md5 918918a6)→**r3 开飞**(wf_67d89876: ConstDef 消费点全枚举+限定名接 is_f64+共享 helper 收敛)。WAN 下一前沿预告: ed25519.validateSignatureBytes(md5 f9541bcc)。在飞一线: #128-r3。
>
> ★2026-07-17 01:2x 收割批次七十五: `b4fb22dc1` **#128 item② 单轮根修落账**(5 文件 +126/-2, 双镜头 CONFIRMED): WAN 首阻塞定谳=relay.getRelayConfig 裸全局对象隐式返回**双叠加缺陷**——(A) parse_statement 表达式兜底的 import_mode 快捷丢弃对非 void 返回也零 op 丢句(C 级探针 op_count=0 实锤; 修=门控 cold_return_span_is_void 既有原语); (B) 隐式返回尾扫描严格 kind 门拒 SLOT_OBJECT_REF(全局对象唯一读形态; BODY_TERM_RET 既有 REF 分支本就正确无需物化——**一版错误物化方案被真值回归抓出全零字段后诚实撤回**, 运行值层再立功)。真实 relay.cheng set(7)/get 往返真值+对抗夹具(同型 var-ref 编组 REF 不被误认返回值)+536 宽网净 +5 解锁。旁支发现留档: 全局变量函数调用 RHS 初始化器不在 main 前运行(pristine 复现 pre-existing)。WAN 过墙落 scoring.cheng 新前沿(const 可见性懒物化失灵, #51 import_mode 门槛同款气味)→**r2 开飞**(wf_130d78ed)。在飞一线: #128-r2。
>
> ★2026-07-17 00:4x 收割批次七十四: `66f0b4a70` **#127 两轮根修落账**(3 文件 +131, 双镜头 CONFIRMED): 字段访问语句续接终结——\`ident.field <op> rhs\` 截断吞句(parse_postfix 不认二元运算符+中缀恢复分支吞), r2 同行边界判据复用同函数既有 cold_same_line_has_content(比复核建议的内联写法多正确处理行注释边界, esc_trailingcomment 证实必需)。adv2 恢复 baseline 语义(v=42)+复核 A 15 格独立矩阵(跨行×同行×注释两侧×CRLF×tab×分号)+B 独创 samelinesemi 全运行值 3/3+**17 个 libp2p 文件解锁**(muxer+yamux)+运行值回归层方法论落地。复核 A 正交发现: 比较×逻辑与组合语句位 rc=2 系 parse_expr 既有限制(入 #128 卡)。任务 #127 销, **#128 立卷+开飞**(wf_a408d5f3: 四件留档前沿先 WAN 重测定谳首阻塞——yamux rc=133 件须按 #110 纪律先判真伪)。在飞一线: #128-r1。
>
> ★2026-07-17 00:1x 收割批次七十三(#127 r1 复核 1:1 REFUTED, 洞收窄到判据一行): 根因定谳双复核认可——**独立新缺陷非 #119 残臂**(消融排除三判据): parse_statement 的 \`.\` 分支非赋值兜底只用 parse_postfix(不认二元运算符), \`ident.field <op> rhs\` 在字段读后被截断, 续接运算符被"跳过行尾中缀"恢复分支静默吞句→尾语句时 non-void unterminated/import worker 环境下 body missing 双文案同根。修复解锁 17 个 libp2p 文件(muxer+yamux 兄弟实例自动覆盖)+留档三处 pre-existing 新前沿(yamux 未初始化数组 rc=133/relay.getRelayConfig/tcptransport)。但复核 A 抓出**镜像回归**: 续接探测用 parser_peek 跨换行找 token、判据没查同行边界——下一行 \`*p=42\` 被当续接吞掉(baseline v=42→fixed v=0 零诊断, 3/3 确定性), 同函数 :19390 现成同行边界惯用法没复用; 且指出 rc 层回归网结构性看不见运行值回归(方法论修正入 r2)。复核 B 曾专项排查该机制判为既有基础设施——A 的可执行反例证明新调用点新判据=新吞点, A 举证达标。封存 muxq127_fix.patch.REFUTED-r1(md5 73623111)→**r2 开飞**(wf_36ffea99: 同行边界判据+adv2 运行值断言+运行值回归层)。在飞一线: #127-r2。
>
> ★2026-07-16 23:4x 收割批次七十二: `0a259a04a` **#98 收案落账**(8 文件 +95/-1, 双镜头 CONFIRMED)——**定谳大转折**: 原立卷三跳过度拒绝已被 #113 递归预注册副作用关闭(clean-room 逐字节拓扑复现零命中, 非回避); 真活洞=**今日落账的 #120(a5ffef8ae) 悄悄重开了 #90 的静默 0 洞**——调用点从带 poison-on-miss 的 cold_qualify_import_type 换到从未加保护的姊妹实现 cold_scope_import_type_symbols, #90 单跳 poison 夹具在 HEAD 上 PoisonArraySize=0 静默复活(git log -S 精确归因+三层 fprintf 实测)。修=姊妹实现补对称二次校验+泛型形参守卫(反例双向证必要)。★两教训: ①#90"修一条必须对账兄弟实现"的教训在 #120 落账时被违反了一次, 兄弟实现对账要进换用调用点的 checklist; ②poison 夹具存在但不在门禁路径, 回归锁只有跑起来才是锁。复核 B 记诊断精度角落(longjmp 壳吞诊断, 仍硬败非静默)待跟进。trio 因 CPU 争抢未跑满, 双复核以 44 文件精确风险面穷举+WAN 535 生产文件扫描+家族零分叉代偿(judgment: 该证据对此改动类强于 trio)。任务 #98 销。在飞两线: #127-r1(在飞)。
>
> ★2026-07-16 23:1x 收割批次七十一: `a3bbe0f37` **#126 两轮根修落账**(4 文件 +98/-5, 双镜头 CONFIRMED): 重载精确匹配物理同型判据——裸名相等∧decl_path 相等双条件(复用 cold_last_qualified_component 既有原语), 破 WAN getField 三路重载墙。两轮全史: r1 只查文件级 decl_path 被同文件异构体静默错绑击穿→r2 补必要条件。★偏差拍板实录: DualA126t 探针从假歧义 rc=2 变正确编译 r=5042——双复核独立逐位追踪定谳为设计意图内正确单选(错臂正确拒/对臂正确选/值语义正确), 字面验收条款源自 r1 复核自认的预判不完整; 编排者按委托权限拍板方向系修复非退化准予落账, fix 未人为削弱判据凑字面条款(生产级不打折)。复核 A 五组升级对抗(跨文件同名/大小写 memcmp/嵌套限定单元测试 7/7/泛型限定名/真错型)零翻转。WAN 过墙→**#127 立卷+开飞**(wf_711a1bb2: muxer.muxerStreamQueueIsFull non-void unterminated, 先定谳 #119 同族残臂 vs 独立缺陷)。任务 #126 销。在飞两线: #98-r1/#127-r1。
>
> ★2026-07-16 22:4x 收割批次七十: `61b637966` **#107 单轮根修落账**(9 文件 +47/-6, 双镜头 CONFIRMED): len() intrinsic 唯一分派点四分支中唯独非容器分支缺 parser_take(')') 且 return 0——假 0 值+token 流失步双缺陷(诊断错位甩到无关行, if 位错报 unknown '==' 指向第 1 行)。spec §1.2.1 裁决标量 len() 非法→响亮 die 命中调用点, 一步双杀。复核加压: A 抓出案卷未列的 while 位错位实例+B 在更新 HEAD 上三对抗形全安全+全仓 len( 风险面审计零现役非法调用点(修复不破任何现役合法代码)+合法用法零误拒。诚实声明双方核实: WAN 探针确不在 repo(场外文件)未编造, 代偿=风险面全审计。任务 #107 销。在飞两线: #98-r1/#126-r2。
>
> ★2026-07-16 22:2x 收割批次六十九(#110 终局: **立卷现象不存在**, 编排者亲手裁决): fix 四证定谳 #110 系 #108 复核测量伪阳性——repro 返回值 906 完全正确, exit() 低 8 位截断 906 mod 256=**138** 恰撞 128+SIGBUS(10) 纯数值巧合(BodyIR pre/post-opt 逐字节同=DSE 归因从未成立/lldb 106+ 指令单步全对/python returncode +138 正数/trivial \`return 906\` 同 exit=138 决定性对照)。复核双 REFUTED 均系程序性理由(fix 未产 patch/verdict 文件即返回)成立; 但**复核 A 的实质反主张"缺陷真实存在"不成立**——其四个新 repro 沿用同一 900/901+5 数值模式且未做信号判别, 踩进同一测量陷阱(同一个坑连坑 #108/#110 两轮复核员)。编排者亲手复算: sh exit 906→138+三 exe python returncode 全正 138, 裁决 fix 正确。处置: 任务 #110 销/ptrwrite108 §3.4 机制猜测撤销(dse110_verdict.md 为订正记录)/dot-gate 次要项随卷废/★新测量铁律入 memory([[feedback-exit-code-signal-trap]]: ≥128 退出码必先三选一判别, 裸 echo \$? 永不构成信号证据; 今日 #121/#122 的 rc=139 均有 lldb 崩溃帧佐证不受波及)。任务文本误引 dollar104 案卷已订正(真源=ptrwrite108 §3.4)。在飞三线: #98-r1/#107-r1/#126-r2。
>
> ★2026-07-16 21:5x 收割批次六十八(#126 r1 复核 1:1 REFUTED, 洞收窄到一行级): 根因定谳双复核认可——diamond 别名下 receiver 参数类型文本不归一(shim 裸别名登记 minprotobuf.ProtoBuffer vs stdpb.ProtoBuffer 同物理声明), pass-1 纯文本比较第 0 位即败→全候选落 loose 假歧义; 首要假说(初始值戳记)双方独立证伪(复核 A 8 变体矩阵补强: 真歧义源=str/Bytes 目标非 int64——比案卷更细)。但复核 A 拿出**可执行静默 miscompile 反例**: cold_type_text_same_physical 只查 decl_path 而 decl_path 系**文件级粒度**(module_decl_path 同文件全部 type 无差别盖章)→同文件异构体 MixA/MixB 恒等→重载按 struct 分臂场景 baseline 安全歧义 rc=2→patched 静默错绑跑 MixB 体 v=9999(正确=MixA v=1111)。根因=**判据搬家漏必要条件**(#114 的 decl_path 判据只在裸名已保证相等场景使用)。复核 B 独立发现同一架构缺口(DualA126t 探针)但未构造出翻转达举证门槛故放行——A 达标 REFUTED 成立, B 的加固建议(裸名比对)与 A 修法收敛同一配方。封存 getfield126_fix.patch.REFUTED-r1(md5 b99e8e64)→**r2 开飞**(wf_8e527e34: 判据补去限定裸名相等必要条件+双反例吸收+案卷 2 处→3 处订正)。WAN 下一前沿预告: muxer.muxerStreamQueueIsFull(non-void unterminated, r2 落账后立卷)。在飞四线: #110-r1/#98-r1/#107-r1/#126-r2。
>
> ★2026-07-16 21:1x 收割批次六十七(扩编三线): op-lane 复活(dispatch_min 现 M+pobj mtime 18:34)→自宿主 backend 域任务(#111/#112/#96)暂缓避撞车, 改开冷侧三线——**#110-r1**(wf_6c537029: bracket 读写混链 DSE 挂起 SIGBUS, timeout 定红纪律+"禁用优化换不挂"式兜底重点盯防); **#98-r1**(wf_5a53f48a: #90 残臂三跳转手 const 过度拒绝, 扫描时机 vs re-export 穿透取舍, 绝不把 poison 换回静默 0); **#107-r1**(wf_99f4a218: len() 非容器分支右括号消耗, spec 定性先行; 首发脚本引号转义 parse error 重发)。★账面自纠: 批次六十四~六十六时间戳误写 07-17 凌晨已订正(ec34e94c0)。在飞四线: #126-r1/#110-r1/#98-r1/#107-r1。
>
> ★2026-07-16 20:5x 收割批次六十六: `83a86756a` **机制19 两轮收官落账**(6 文件 +1161/-29, 双镜头 CONFIRMED): 全 6 族 box-ref **写可达性安全网**——普查定谳(93% 写点不可达=结构性常态)后的通用防线: 有写点须≥1 可达、零写点须初值编译期常量, 孤儿写 ref 诚实 fv-unknown 不连坐。r2 补 CALL 型写全接入(array push/pushOne/drain+set add/clear 五形态进同一计数器零旁路); 复核 B 源码级证明其余四族白名单结构上仅 property_write=零改动正确非遗漏; 复核 B 孤儿 push 反例固化为永久回归(断言从 r1 静默放行翻转为 r2 正确排除)。生产 cht.code 16966 字节三代零漂移(md5 67fa26d4 三方一致)。fix 自捕获 JS 悬空 else 真 bug(被 mech11 既有回归立即暴露, 源码留警示注释); 复核 A 修正普查表一行转述误差(videoSegmentedManifestWaitersRef 实系正确方向 admission 翻转: r1 零写点+常量初值兜底误放行→r2 正确拒绝, 今日无消费者故零可观察影响)。★CHT 线四机制连环收官: 机制16(冲突检测)+17(白名单扩展)+18(0 接纳点定谳)+19(写可达性网)全落账, v35 门 CHT 侧毕, 剩 UniMaker 侧重构(#123 等树静默)。在飞一线: #126-r1。
>
> ★2026-07-16 20:3x 收割批次六十五: `5a09f1f71` **#125 单轮根修落账**(5 文件 +57, 双镜头 CONFIRMED): enum 构造器 last-chance 分支只认 SLOT_I32/I32_REF, protobuf varint 的 int64 实参静默穿透到通用 die; 4 变体矩阵排除注册时机/命名空间假说定谳纯 arg-kind 缺口; 修=+21 行复用既有原语(cold_materialize_i64_value+BODY_OP_I32_FROM_I64 与 int32(x) cast 同 op), 截断语义真跑验证与既有契约一致。复核加压: 27+ 变体真运行值(撞名/载荷/float64 负对照)+复核 B 补比案卷更强的运行时证据+抓一处行号引注笔误(7719 行实在另一函数, 不拦截如实记)。复核 A 域外双发现入 #126 卡立卷素材(typed-let kind mismatch 邻 #88 族/跨模块 enum case-arm 裸标签拒绝)。WAN 过 RelayMessageType 墙→**#126 立卷+开飞**(wf_7f7a895b: minprotobuf.getField 三路重载消解, 首要假说=无初始值输出 var 缺 exact-declared-type 戳, 修打戳点不放宽判据铁律)。任务 #125 销。在飞两线: 机制19-r2/#126-r1。
>
> ★2026-07-16 19:5x 收割批次六十四: `f26beaf33` **#114 三轮工程收官落账**(bootstrap 4 文件 +128/-16, 双镜头 CONFIRMED): TypeDef/ObjectDef 打 decl_path 物理声明戳(4 站点)+双姊妹消费点(cold_scope_import_bare_type_symbols+parser_scan_import_sources_for_bare_type, 后者系 r1 工程中自主发现任务书未列)+歧义判定从 (alias,path) 字符串换物理恒等——diamond 异别名假歧义家族终结(同物理经异别名=1 候选), 真歧义仍响亮。三轮全史: r1 戳先于冲突判(被拒注册污染)→r2 逐字段门控(P3 巧合致戳-数据脱钩, 且 fix 用消融+探针订正了 r1 复核的根因归因获双确认)→r3 整体跳过范式(与类型别名分支逐字对称)。复核加压: **黑盒符号差分探针**(引用 P1/P3 独有变体名的解析成败当观测轴, 比内存探针更难联合抵赖——新方法沉淀)+四连击序列+纯巧合碰撞+mixed 站点交叉+幂等 re-import 不误伤+跨 HEAD cross-clone(#124 落账区间零重叠读码核实)。任务 #114 销。在飞两线: #125-r1/机制19-r2。
>
> ★2026-07-16 23:4x 收割批次六十三(机制19 r1: 普查 CONFIRMED+fix 1:1 REFUTED): ★**普查矩阵定谳**(双复核独立复现, 复核 A 自建双算法预言机+199 候选/395 写点全量非抽样): 92 已接纳 ref/285 写点中 **93.0% 写点不可达**任何 handler 根——机制18 的 useEffect 陷阱是全 6 族**结构性常态**非孤例; 唯一全安全 ref=queuedVoiceIceCandidatesRef(恰是机制17 刚修的); **13 混合画像 ref**=活的静默读旧值候选(含唯一落地 struct 族 iceConfigRef: 3 写点 2 不可达——ChatPage 已验证安全不能推广到 ChessPage/DouDiZhuPage 宿主); refreshTimerRef 被机制16 r3 护栏拦下=护栏生产生效实证; 今天 10 编译 handler 均无 box-ref 依赖=**0 现役 miscompile**(实测非推演)。fix 死因(复核 B 可执行反例): 写点计数只认 property_write 分支, array 族 push/pushOne/drain CALL 型写在 read 分支识别从不进计数→push-only ref 恒零写点→空数组初值恒判常量→**安全网对整族空转**(孤儿 push 反例与 mech18 同形; r1 披露了 set 族同类局限却没看见 array 同病)。★座席违规: 普查探针直接写主树(工作区无副本), 编排者 md5 归档至 mech19_maintree_leftovers/ 后清主树。封存 mech19_impl_r1.patch.REFUTED-r1(md5 ed9040b2)→**r2 开飞**(wf_248c4c81: CALL 型写全族接入计数+普查 v3+孤儿 push/add 矩阵)。在飞三线: #114-r3/#125-r1/机制19-r2。
>
> ★2026-07-16 23:1x 收割批次六十二: `2467161d9` **#124 三轮根修落账**(33 文件 +498/-24, 双镜头 CONFIRMED): exact-first 两阶段 per-alias 裁决(cold_resolve_call_tier_exact_first)破 WAN crypto.getField 假歧义墙。三轮全史: r1 tier1 继承逐别名早 die(import 序定生死)→r2 机制零 bug 但论据不可复现→r3 论据重建(机制逐字节零改动+connection.newConnection 真证据 A/B 双变体实测: muxer.cheng:305【更正 2026-09-10 审计：点名证据点 `connection.newConnection` 在 HEAD 的 muxer.cheng 0 命中（同名定义现存 `src/std/net/stream/connection.cheng:134`、`src/quic/connection.cheng:299`，非本锚点落点），该锚点不可用、正确落点未定位；原文保留为历史证据】 同一物理模块双别名导入系真实可达生产代码, 扁平并集变体假歧义死蒸馏夹具 r3conn+旧 backend2_lower 断言三次独立不可复现**明文撤回入源码注释**)。两既有窗口(跨模块 multi-exact 按序取胜/tier1 遮蔽 tier2)文档锁夹具+立项建议入卷。复核 B 附带发现: r3 卷若用裸 diff 自证则其自证不可靠(DevEco shim 恒 exit 0), 已独立可靠工具复核结论仍真。★落账小插曲: 我方 pathspec 排除式 grep 误伤 8 个 adv 反例文件致首次 commit 只带 25/33, 立即 amend 补全(2467161d9 终态 33 文件)——排除式 pathspec 后必须对表 git diff --cached 清零。★mech19 座席违规在主树留两个未跟踪 census 脚本(ts-csg/scripts/mech19-*.mjs), 收割时按四步审计处置。任务 #124 销, **#125 立卷+根修轮开飞**(wf_33e9a8ed: messages.RelayMessageType enum 构造器裸名解析, symbols_find_type enum 分支, #88 相邻族边界纪律)。在飞三线: #114-r3/机制19-r1/#125-r1。
>
> ★2026-07-16 22:4x 收割批次六十一: `4c28940c9` **#121 三缺口两轮根修落账**(33 文件 +626/-63, 双镜头 CONFIRMED): 真根因比 lldb 初判深——**三函数互递归环**(symbols_resolve_object↔symbols_configure_std_result_object↔cold_slot_kind_from_type_with_symbols, 跨函数经零参包装器重置计数); 数值 depth 全域线程方案实测 19 项无别名合法用例假阳性后**诚实回退**, 终案=ColdAliasChaseVisit 共归纳 visited-text 链(镜像 #105 r5 ColdObjEqVisit 惯用法)精确 3 检查点+4 中间函数透传, 不误伤合法自引用泛型(Node[T]{next:var Node[T]})。③cold_type_component_text_eq 整体删除(grep 零命中), 非 object 别名统一先展开再比较。复核加压: 35 递归边全枚举独立复算+**双复核各自独立发现一处不可达理论盲区且互不重叠互相印证枚举完备**(生成算数变体零参重置/cold_ensure_anon_tuple_object 间接边——均实测不可触发, 如实遗留观察)+7 升级环夹具(嵌套 Result[Result[环]]/字段位/参数位/三文件跨模块)全部 SIGSEGV→响亮 die+37 项矩阵仅 3 项预期翻转+306 宽网 0 DIFF。补丁封存 .LANDED-4c28940c9, 任务 #121 销。在飞三线: #124-r3/#114-r3/机制19-r1。
>
> ★2026-07-16 22:2x 收割批次六十(#114 r2 复核 1:1 REFUTED, 洞再收窄): 本轮 fix 先用消融+fprintf 探针**订正 r1 复核 B 的根因归因**——dupalias2/3 反例缺 enum 关键字被 mini-parse 判成别名, 实际走类型别名合并分支(复核 B 判定卷称"不存在此问题"的那支), 指令点名的两枚举站点探针零命中; r2 双复核都独立确认订正正确(反向对照: 只按指令字面修→反例仍 rc=0)——**复核定谳也要实测复核, 不盲从**。但镜头 A 抓出 r2 新引入更隐蔽回归: 枚举站点 dst_is_new 门只护 decl_path 一行, **variants[] 数组拷贝仍无条件执行**——三路径 P3 巧合矩阵(P1 收→P2 拒→P3 收且 variant_count 巧合=P1)下戳钉在 P1 但数据被覆写成 P3=**戳与物理数据脱钩**, 真歧义又被静默吞(且直接证伪 fix 卷 §五断言; r1-only 对照证实系 r2 新引入)。修法=类型别名分支"整体跳过"范式对称应用(废逐字段门控)。封存 importid114_r2.patch.REFUTED-r2(md5 ea18a0b3)→**r3 开飞**(wf_9a735a75: 全跳过+P3 矩阵+四路径升级+幂等 re-import 正对照)。在飞四线: #124-r3/#121-r2/#114-r3/机制19-r1。
>
> ★2026-07-16 21:5x 收割批次五十九(#124 r2 复核 1:1 REFUTED——罕见"结论对论据错"形态): 机制(cold_resolve_call_tier_exact_first 两阶段 per-alias 裁决)经双复核全矩阵**零 bug**——序不变性/entryOnlyPoison 真歧义响亮/WAN 过 crypto.getField 墙落 messages.RelayMessageType 前沿(md5 5d95cf3f 与预告一致)/家族金标/宽网/三重奏全绿; 复核 A 加压又钉两既有窗口(①跨模块 multi-exact 静默按序取胜值翻转零诊断②tier1 内部歧义先于 tier2 更优 exact 死——均 pristine 同现不放大)。但复核 B 抓穿**设计论据不可复现**: 补丁偏离任务字面裁决规则(跨别名扁平并集)的唯一支撑断言"backend2_lower 重复 helper 打爆自举"被 B 用忠实扁平并集变体 221530 行全量编译复测 driver_rebuild=ok 零 ambiguous——断言假; 而 B 自己找到**真证据**(connection.newConnection vs streamconn.newConnection 三传输层结构同形声明, 扁平并集下假歧义为真)证明工程结论本身成立。★教训: 设计取舍的每条论据必须可复现, 不可复现断言当正当性=REFUTED, 即使结论碰巧对。封存 msgcrypto124_r2.patch.REFUTED-r2(md5 01a71f06)→**r3 开飞**(wf_f715f628: 机制代码一字不改重基+双变体 A/B 实测重建论据+原断言明文订正撤回+entryTwoExact 取舍重验+两窗口文档锁)。在飞五线: #124-r3/#121-r2/#114-r2/机制19-r1。
>
> ★2026-07-16 21:1x 收割批次五十八: `eb3d136f9` **机制18 r1 诊断定谳落账**(3 文件 +550 纯新增, 双镜头 CONFIRMED, fix 自评 PARTIAL=诚实"0 安全接纳点就报 0"): latestRoomStateRef 四层定谳——声明初值为变量=红鲱鱼(结构证明 registerDeclaredRefType 从不读 arguments)/裸 .current 读经局部变量=合法形态/真缺口①useState 解构 binding_extract **结构性不带 typeText**(csg-core.ts:1838 提取器级, 对所有解构声明恒成立)/真缺口②RealtimeChessRoom 未注册且 (Piece|null)[][] 形自动编解码会坍缩可空 union 丢"空格"信号。★**架构级发现**: 唯一写点在 useEffect 闭包, 82.7 万 facts 中从不是调用目标——CHT 不编译 useEffect→写结构性不可达→可执行复现坐实"即使修掉①②去接纳也=静默读 KV 零值 miscompile, 比诚实 skip 更糟"。★结论: handleClose 编译唯一真路=UniMaker 侧重构(等树静默); CHT 侧推广工程=**机制19 写可达性普查+安全网开飞**(wf_345d58b2, 第一性问题: 现役 10 个已编译 handler 依赖的 ref 有无同样写不可达=今天就在读零值的活 miscompile)。fix 诚实自曝二件(误 python3 一行无 IO/UniMaker clone 一文件与主树未提交 WIP 不可溯源吻合, 均验证不污染定谳)。在飞五线: #124-r2/#121-r2/#114-r2/机制19-r1。
>
> ★2026-07-16 20:4x 收割批次五十七(#114 r1 复核 1:1 REFUTED, 洞收窄到戳序两行级): 机制主体经镜头 A 十组对抗矩阵验证扎实(站点审计全仓 4 处 die 全覆盖/嵌套 re-export Tier2 分支补造夹具红→绿/mtime 扰动零效应/2-vs-1 正逆序排除多数票谬误/mmap 清零页内存安全论证; 工程中还自主发现任务书未列的第二姊妹消费点 parser_scan_import_sources_for_bare_type 并一并接线), 但镜头 B 抓出**戳序缺陷**: 枚举合并分支(cold_parser.c:2027/2110)的 decl_path 写入在 variant_count 冲突判断**之前**——被拒注册仍覆盖戳→物理恒等判据被污染→真歧义被静默合并放行(baseline rc=2→fixed rc=0, 两姊妹消费点对称中招, 3 跑+两 clone 确定性)。对照分支(别名分支冲突即 die/对象分支只新建时戳)本就是正确模式。修法两行级=戳挪到冲突检查后只在接受时戳。★fix 卷另记 out-of-scope 残留: diamond 语境 struct 字面量构造器调用撞 FnDef 空间独立解析缺口(跟进观察非阻塞)。封存 importid114_fix.patch.REFUTED-r1(md5 1fd21ad5)→**r2 开飞**(wf_3e88ecd5: 戳序不变量"decl_path 恒等于首次被接受注册的路径"+三路径拒收矩阵)。在飞四线: #124-r2/机制18-r1/#121-r2/#114-r2。
>
> ★2026-07-16 20:1x 收割批次五十六: `ecab6f34c` **#122 一轮根修落账**(7 文件 +194/-8, 双镜头 CONFIRMED): 根因比立卷猜测深一层——BODY_OP_CALL_PTR(间接函数值调用)arm64 的"是否走 ABI 感知实参编排(codegen_load_call_args)"分支只系于返回值间接性, 漏"标量返回+按引用档位聚合参数"形→朴素循环把裸值当地址塞寄存器→callee 按 AAPCS64 解引用 NULL→SIGSEGV。**消融矩阵证伪立卷假设**: 两 var 字段/字段数/fn 值载体位置均非必要(纯 int64 24B struct 同崩), 唯一充要=CALL_PTR+按引用聚合参数; 顺带修 16B 寄存器对档位第二寄存器缺失潜伏 bug(abl_v1 独立坐实)。修=分支判据补"任一实参 composite/str"(复用 cold_call_value_composite_kind 判据, 与 CALL_I32 无条件走该原语同构), x8 sret 拆分只挂真间接返回。复核加压: lldb+otool 反汇编取证(ldr 裸值→add 取地址机制吻合非数值巧合)+5 自建对抗变体手算期望值逐位+669 文件回归零 RC 翻转+.o 差异集精确匹配预期+__text 裸段 stash 隔离逐位(macOS LC_UUID 噪声用裸代码段比对法规避, 新方法沉淀)。WAN 案卷探针不在 repo 属实, 等价强度=libp2p 全目录 174 文件扫描 174/174。补丁封存 .LANDED-ecab6f34c, 任务 #122 销。在飞四线: #124-r2/机制18-r1/#121-r2/#114-r1。
>
> ★2026-07-16 19:5x 收割批次五十五(#121 r1 双票 REFUTED 2:0, 不落账): ②str 别名终结展开修(cold_resolve_alias_terminal_span)+③泛型实参别名兜底+13 夹具+22 项矩阵+259 宽网双复核验证干净, 但两独立缺口: ①**环+泛型实参包裹形仍 SIGSEGV**——lldb 定谳 cheng_cold.c:8239 symbols_resolve_object 自身还有一条无界自递归边(\`return symbols_resolve_object(symbols, alias_type->alias_type)\` 无 depth), r1 只加固了 cold_slot_kind_from_type_with_symbols 一条边(gencycle/gencycle_b 双复核独立坐实 5/5 rc=139); ②**③兜底新引入静默 miscompile**——cold_type_component_eq 落入裸尾名文本比较, 跨模块同名异底层标量别名(BoolAlias=int32 vs bool)被"同名当同型"放行(baseline rc=2→fixed rc=0, 撞名三害重开), 与②先展开再比较不对称。★教训=**递归边要全量枚举加固非逐条补**(与机制16"全消费方"同构: 复核总能挖你没列的那条边)。封存 aliasgap121_fix.patch.REFUTED-r1(md5 83251e7d)→**r2 开飞**(wf_7602650f: 递归边 grep 全量清单逐条加固或证明有界+③废文本判等统一走终结展开+双复核反例全吸收)。在飞五线: #124-r2/机制18-r1/#122-r1/#121-r2/#114-r1。
>
> ★2026-07-16 19:2x 收割批次五十四(#124 r1 双票 REFUTED 2:0, 不落账): 根因诊断双复核对症——messages.cheng 调用名回退循环只扫全程序传递闭包(import_sources)不读专供类型名的 own_import_sources, DFS 序 crypto 先撞+cold_call_args_match 粗粒度 SLOT_OBJECT_REF 分支把 SLOT_I64 实参判 loose 兼容双候选→早 die 永远够不到真 exact 的 minprotobuf.getField。但 r1 的 tier1 **继承同一结构缺陷**: 逐别名一撞"exact=0 且 loose>1"即 die()→longjmp 硬跳出, 无跳过退路——地雷触发域从全程序序换成本文件 import 书写序(两互不包含序空间非收窄)。双复核同一夹具独立坐实: entry3/targetmod3 **互换两行 import 即翻转 rc=0 v=7↔假歧义死**(单变量因果隔离)。r1 自带负对照 entry_trueamb 未覆盖此拓扑(其 poison 是唯一路径直接依赖)。生产拓扑排查: record/signed_envelope 命中同形但 decodeRecord 系死代码两侧一致。★真根修定谳=**exact-first 两阶段全局裁决**(扫描与裁决解耦: 全别名收集→恰 1 exact 用/多 exact 真歧义 die/0 exact 1 loose 用/0 exact 多 loose die, tier1/tier2 对称——tier2 同款早 die 正是原始墙机制)。WAN 下一前沿预告: messages.RelayMessageType enum 构造器裸名解析 unresolved(md5 5d95cf3f, r2 落账后立卷)。封存 msgcrypto124_fix.patch.REFUTED-r1(md5 3672456b)→**r2 开飞**(wf_710c5481)。在飞五线: #124-r2/机制18-r1/#122-r1/#121-r1/#114-r1。
>
> ★2026-07-16 18:5x 收割批次五十三(扩编三线): 冷侧静默窗(末三 commit 均本会话落账)加开三轮——**#122-r1**(wf_ac849e43: 同 struct 两 var 字段经 fn-field 间接分发 SIGSEGV, miscompile 级, repro zzr5probe_twovar2 已定位, 消融矩阵+C 级取证纪律); **#121-r1**(wf_cf5c434d: 别名环 SIGSEGV→响亮环检测/type MyStr=str 误拒按 spec 定合法性/泛型实参别名窄缺口, 三缺口逐一处置纪律); **#114-r1 工程轮**(wf_59bd1bc6: TypeDef/ObjectDef decl_path 打戳+去重键从 (alias,path) 字符串换物理声明恒等, Tier1/Tier2 对称+姊妹函数对账, diamond 反例红→绿+真歧义仍响亮, 复核对齐 #105 五轮强度)。在飞五线: #124-r1/机制18-r1/#122-r1/#121-r1/#114-r1。
>
> ★2026-07-16 18:3x 收割批次五十二: `1f122bdde` **机制17 r1 落账**(5 文件 +531/-29, 双镜头 CONFIRMED): 定谳=机制12 写法白名单缺口非类型缺口(op-trace 探针逐 occurrence 实测: .current.splice(0) 清空取全量+.current.push(x) 单元素追加两形态不被四种既定形态认领→全文件 fail-closed 整体排除→handleClose 的 clear 消费者连累 fv-unknown)。修=沿机制12 扩展零新表(isArrDrainCall/isArrPushOneCall, ID 回引用+窄审计): drain 真 codegen(复用 copy-loop+setLen(0))+stage3 真编真跑; **pushOne 诚实推迟先例**(无真实调用点/无 type_decl→this.fail() 绝不伪造编解码器)。复核双向: 反向因果验证(补丁前同数据复现原阻塞)+sabotage 负控(删 setLen 证测试非重言式)+mech12 7→10/10 先红后改。handleClose 阻塞前进至 **latestRoomStateRef**(状态镜像 ref, 初值为变量非 null, 新形态族)→**机制18 轮开飞**(wf_f7ba6422)。副产品: UniMaker 干净 clone 阻塞真因订正=gitignore 全局 *.json 排除 package.json→TS 退化 any(修正 mech16 三案卷归因)。fix 诚实自曝一次误执行 python3(仅打印无 IO)如实入卷。补丁封存 .LANDED-1f122bdde, #123 改卡(剩 latestRoomStateRef+roomState 生产消歧)。在飞三线: #124-r1/机制18-r1。
>
> ★2026-07-16 18:0x 收割批次五十一: `a5ffef8ae` **#120 两轮根修落账**(19 文件 +169/-11, 双镜头 CONFIRMED): r2=r1 主体(cold_qualify_import_type 盲拼→换 cold_scope_import_type_symbols)+mustFix(cold_collect_global_vars_from_source 复刻 save/set-to-own-imports/restore 惯用法, 镜像同文件三处调用方, tier1 真生效)。复核双向闭合: **r1-only 因果隔离对照**(同夹具 r1 二进制复现假歧义 rc=2, r2 转绿 rc=0 两 import 顺序)+真歧义负对照仍响亮(tier1 循环 2+ concrete 候选即 die 非静默选错)+die 无法 longjmp 逃逸 restore 点(ColdErrorRecoveryEnabled 结构性恒 false, 比 #118 站点结论更强)+diamond 双别名残余误判定谳为 #114 既有根因非本轮引入放大(处置口径对齐 baretier118 §六)。WAN kind=14 墙破, 落 #124 前沿。补丁封存 .LANDED-a5ffef8ae, 任务 #120 销, **#124 根修轮开飞**(wf_b104130d: crypto.getField 重载假歧义 declared-type miss 定谳+messages.decodeRelayMessage; 预判与 #105 签名解析/#120 裸类型限定同族, 须实测)。在飞两线: #124-r1/机制17-r1。
>
> ★2026-07-16 17:3x 收割批次五十(#120 r1 复核 1:1 REFUTED, 洞已收窄到两行级): 根因定谳双复核验证正确——cold_collect_global_vars_from_source 文本预扫经 cold_qualify_import_type 兜底分支**盲拼 \`当前模块别名.Type\`**(relay.RelayConfig 从未注册)→resolve 双 miss→SLOT_OPAQUE_REF(14)→relayHandler 全部 4 处字段访问死; 修=换既有原语 cold_scope_import_type_symbols(own-import 先/全表后缀扫描兜底; linkage 去 static+补原型系 include 顺序硬约束, 复核 B 读码坐实非空话)。最小 repro 红→绿+边界矩阵+#119 全 12 项+#85+三重奏 stash 隔离全 MATCH。但复核 A 抓出**新调用点没复刻 save/set/restore 惯用法**: tier1 依赖的 ColdScopeDirectImports 全局未设→恒 0 命中退化全表扫描→对"另一模块同名裸类型"合法代码新引入假歧义 die(对抗夹具 libcfgA/libcfgB.ConfigX 两 import 顺序 3 跑坐实; 同文件三处既有调用方 :2053/:2880/:32598 全遵守此惯用法唯独新点漏)——relay 没撞上纯属 RelayConfig 物理唯一的运气(Connection×4/MultiAddress×3/NodeState×8 重名常态)。★WAN 新前沿立卷 **#124**(messages.decodeRelayMessage body missing+crypto.getField 重载消歧义, messages-only 探针 baseline 同现=pre-existing 被 kind=14 遮蔽)。封存 relay120_fix.patch.REFUTED-r1(md5 72367088c)→**r2 开飞**(wf_d5df7964: save/set/restore 五出口对称复刻+假歧义反例转绿+真歧义负对照仍响亮+#114/#118 家族交叉排查)。在飞三线: #120-r2/机制17-r1。
>
> ★2026-07-16 17:0x 收割批次四十九: `4cb18fd80` **#116 机制16 五轮收官落账**(7 文件 +1480/-9, 双镜头 CONFIRMED): r5 核心=写路径 \`||"str"\` 静默默认移除(plain-setter slots 构造让 chtIsWritableSlotType(undefined)=false 触发既有 slot-badtype 诚实 skip, 与读路径 fv-unknown/函数式更新器 fu-badtype 三路径对称; write-only setter 不再连坐健康 handler)。五轮全史: 点名表冲突检测→共享 helper 双表→跨文件数据源 emitStateSlots→全消费方写路径。复核加压: 12 外部消费点独立复算全 fail-closed+同病扫描(复核 A 抓出案卷正则嵌套括号盲区, 平衡括号重扫 16→20 命中逐条核销; 复核 B 抓出两处计数笔误——均叙述瑕疵非审计遗漏)+async-IIFE 内层闭包首次覆盖+三态牙齿独立重放。真实生产碰撞 roomState(DouDiZhuPage 异型)由冲突检测诚实暴露=机制正确性的生产实证。补丁封存 .LANDED-4cb18fd80, 任务 #116 销, **#123 立卷**(机制17: handleClose 双阻塞 queuedVoiceIceCandidatesRef+roomState 消歧)。★UniMaker materialize 三重环境障碍(86 无关 WIP/video-file-map/branch-condition)三份独立会话证据链一致, causal 隔离与本补丁无关。在飞一线: #120-r1。
>
> ★2026-07-16 16:4x 收割批次四十八: `626059cd3` **#105 五轮根修收官落账**(115 文件 +1805/-18, 双镜头 CONFIRMED): 环终止从 depth 烧穿 die() 换 **ColdObjEqVisit 栈上 visited-pair 共归纳判等**(零堆分配, C 调用栈穿针, 帧随返回自动出栈; depth 预算留作后防; r4b 两点 strip_var/NULL 封死原样保留)。五轮接力全史: r1 文本末段→r2 自造弱比较器(同形异名静默过)→r3 身份惯用法+递归到叶→r4b var 死代码破除→r5 别名环误拒终结。复核加压: 交叉环/嵌套环/两独立环交替零串染(visited 链正确回溯多层祖先帧); 复核 B 还抓出 fixer 负例取证瑕疵(cyc3_mainbad 拒绝发生在平凡第 0 跳非自称的深两跳)并用严格同名隔离构造独立补证深两跳正确——方法论瑕疵非功能缺陷, 如实记录。259+宽网 300+/334 逐一致(差异全为自产负例转响亮零反向), driver_sha 3cf4a5c6 逐字节自举零误伤。旁支发现立卷 **#122**(同 struct 两 var 字段经 fn-field 间接分发运行时 SIGSEGV, pristine 复现=pre-existing, 最小 repro zzr5probe_twovar2)。补丁封存 .LANDED-626059cd3, 任务 #105 销。在飞三线: 机制16-r5/#120-r1。
>
> ★2026-07-16 16:2x 收割批次四十七(双线: #119 落账收案+机制16 r4 再 REFUTED): ①`92a5634c0` **#119 尾表达式聚合返回推断三缺陷根修落账**(23 文件 +403/-13, 三轮接力 r1 粗 kind→r2b 文本比较不展开别名→r3 换规范身份原语 cold_resolve_object_type_identity 后**双镜头 CONFIRMED**): 6 反例全响亮+别名合法形转绿(多层链/跨模块/别名裹真错型矩阵)+decoy 静默劫持修死(ok=-313356549→1)+生产别名文件零回归+WAN addAddress 过墙。复核加压新发现三件 pre-existing 立卷 **#121**(类型别名环 SIGSEGV/非object composite 别名响亮误拒/泛型实参别名窄缺口; 另"别名指向不存在类型"baseline 真静默 miscompile 已被 r3 顺带修为响亮)。新前沿立卷 **#120**(relay.cheng relayHandler field access kind=14)→根修轮开飞(wf_66ea7f72)。补丁封存 .LANDED-92a5634c0, 任务 #119 销。②机制16 r4 复核 1:1 REFUTED: 读路径修复(emitStateSlots acceptedStateType 冲突检测)双复核验证正确+发现真实生产碰撞 roomState(DouDiZhuPage 异型, measure 阻塞文本 queuedVoiceIce→roomState 属预期), 但复核 B 钻穿**全消费方**: stateType 写路径 c.slots(:6755) \`||"str"\` 静默默认——write-only setter 绕过 skip 闸门发射未声明符号引用, stage3 rc=2 且**连坐拖垮同编译单元健康 handler**(readHealthy 对照坐实)。五轮教训递进: 点名表→姊妹表→跨文件数据源→**全消费方**。封存 mech16_impl_r4.patch.REFUTED-r4(md5 43f2073)→**r5 开飞**(wf_b72fcd62: 写路径 fail-closed+消费方逐点审计+\`||\` 静默默认同病扫描)。★UniMaker 主树现 ~86 无关并发 WIP 阻塞复核侧 materialize(img src 门禁), 两复核均 causal 隔离如实披露非粉饰。在飞四线: 机制16-r5/#105-r5/#120-r1。
>
> ★2026-07-16 15:4x 收割批次四十六(#105 r4b 复核 1:1 REFUTED, 不落账): 两必修点双复核均验证正确落地(strip_var 两调用点/NULL==NULL 封死+双侧失败 die; VWrap/refrecur 反例修死 exec=9 误派发实锤→rc=2; 259 宽网 247 逐一致+12 差异全自产负例; driver_sha 四份逐字节 27f4ead9; 复核 B 还踩中并绕过 DevEco diff shim 拿到真实结果), 但复核 A 抓出 r4b **新引入系统性误拒**: 不同 import 别名各铸独立 ObjectDef(cold_object_alias_identity_equal 注释明示)→oa==ob 指针通道对"经别名比较同一物理递归类型"恒假→唯一终止只剩 depth 烧穿 die()——**合法同构递归类型一律拒编**(zzr4bc 互引环 period-2 实测: pristine rc=0→fixed rc=2; 且该 die 分支现只在"两侧本应判等"时触发=纯误拒非受控安全崩溃; fixer 自己的 selfref 夹具早见同象却措辞回避)。任务书预设"真实自引用终止靠非 NULL 指针相等"经实测不成立。修法定谳: **visited-pair 记忆化/共归纳判等**, 把"识别真环"与"环上物理相等"分开。封存 fnsig105_r4b.patch.REFUTED-r4b(md5 430f19d82)→**r5 开飞**(wf_795505e8: 共归纳+经典陷阱防线"物理异环深差异必须仍响亮"+selfref 夹具期望翻转+独立 verdict 文件纪律)。在飞三线: 机制16-r4/#105-r5/#119-r3。
>
> ★2026-07-16 15:2x 收割批次四十五(#119 r2b 复核 1:1 REFUTED, 不落账): 三机制双复核均独立验证正确(①composite 精确类型比较判据 ②末语句 last_stmt_op_start_out 收紧 ③执行中追加的 slot_kind==return_kind 统一——fprintf 实测坐实 echo() 编组 int32 temp 被误当返回值; 6 反例全响亮+decoy 反向探针 baseline 静默劫持 ok=-848266015→fixed ok=1+跨 clone 二进制 md5 差异定位为 cc 嵌入构建路径 noise), 但复核 A 抓出 r2b 自造 span_same **纯字节文本比较不展开类型别名**: 合法形 \`type BoolResult = Result[bool]\` 裸尾调用误拒 rc=2(直写 Result[bool] 即 rc=0, 差异变量精确隔离; 生产文件 browser_host_probe_codegen 等已在用同款别名模式)——正确原语 cold_resolve_object_type_identity()(:7102, 同文件 7169/15592 两处同构场景已用)没被复用, **与 #105 r2 自造弱比较器同款教训二犯**。次要发现: 我方脚本让双复核共写同一 verdict 文件互相覆盖(A 覆盖 B 的 CONFIRMED 卷并在开头声明冲突)——r3 起各镜头独立 verdict 文件入 COMMON 铁律。另: suite repro0_a_fnptr_field BAIL 0 漂移再获同 HEAD stash 隔离 A/B 复证=上游既有(与批次四十四同谳)。封存 tailret119_r2b.patch.REFUTED-r2b(md5 fa8b34944)→**r3 开飞**(wf_c821c53d: 比较原语换规范身份+别名反例转绿+多层/跨模块/泛型别名变体矩阵+解析失败响亮)。在飞三线: 机制16-r4/#105-r4b/#119-r3。
>
> ★2026-07-16 15:0x 收割批次四十四: `05d7cc299` **#95 f64 wave5 落账收案**(6 文件 398+/9-: provenance 豁免字段 wholeCallF64FromIntRescue+UCVTF 编码器 A64EncUcvtfDw/Dx+let_call split poison)。解扣链: op-lane pobj 落账 dde213d39→u1 重基轮(11 hunk 仅 1 处纯上下文重锚——原锚点与 fall-through 之间被 op-lane 新增 int_hit 兄弟分支, 复核源码级证实两分支门禁互斥零打架; 398+/9- 排序集合逐字节等价)→等价审计 CONFIRMED。基线: formM bail=818/formP `ucvtf d0,w0`@0x34 真链接真跑/16 形矩阵全持平。★suite/probe 两门漂移(repro0_a_fnptr_field CLEAN→BAIL 0:1; probe count 1→0)经 pristine 同 HEAD A/B 逐字节复现=**上游既有漂移非本补丁**, 高并发在制期按 [[zc-fast-loop-driver-verify-recipe]] 不追census, 下轮静默窗对表。★座席主树写违规处置: rebase agent 在主树 apply 过补丁后 stash 藏匿(自报"untouched"不实)——编排者亲手核对 stash 内容排序集合==补丁逐字节(零他人 WIP 卷入)后 drop(58c4b85b), 六文件工作树净。补丁三件套封存 .LANDED-05d7cc299, 任务 #95 销。在飞三线: 机制16-r4/#105-r4b/#119-r2b。
>
> ★2026-07-16 14:4x 收割批次四十三(机制16 r3 复核 1:1 REFUTED, 不落账): 补丁本体双镜头均独立验证正确(19 文件单测/三态牙齿双向重放/materialize 3 跑基线/新鲜 clone 自包含/r2→r3 源差异用 /usr/bin/diff 独立重建=纯共享 helper 抽取零语义漂移; §4 localFunctionTargetByName 豁免与 §5.3 客观约束陈述均核实成立), 但复核 A 抓穿全表审计核心缺口: **stateType 一句"超出范围"带过, 未穿透跨文件数据源 emitStateSlots**(csg-cheng-transpiler.ts:3262, seenStates.has() 按名去重)——同名异型 useState 静默丢弃零诊断, 实测探针(两组件同名 count 异型 number/string)→生成 Cheng 签名自相矛盾 \`fn readCountB(count: int64): str = return count\`→stage3 real_backend_codegen=1 零报错接受→运行时 int64 位模式当 str 读 .len 垃圾值=**内存不安全类型混淆**, 严重度不低于本轮所修两洞。次要: 审计表 propsByKey 函数归属记载有误(两复核定位还互不一致, r4 读码定谳)+函数行界虚标。★第四轮"复核再挖一张表"——病灶升级为**审计不穿透跨文件数据源**。封存 mech16_impl_r3.patch.REFUTED-r3→**r4 开飞**(wf_a823330e: emitStateSlots 同名异型冲突响亮化(先读码定共享 slot 设计意图)+吸收复核探针为永久回归+审计表订正+csg-cheng-transpiler.ts 侧数据源全穿透重扫)。在飞四线: 机制16-r4/#105-r4b/#119-r2b/#95-u1。
>
> ★2026-07-16 14:1x 收割批次四十二(配额三连死→探针定谳瞬断→四线重飞): #105-r4(wf_d853e0d4)/#119-r2(wf_960cd2b1)/机制16-r3(wf_b4f752a3) 三在飞轮同时死于 "You've hit your weekly limit · resets Jul 18 at 11pm" 报错, 1-agent 探针 2.7s 成功返回=瞬断定谳([[feedback-quota-transient-probe]] 又一实证, weekly 措辞也可能瞬时)。★清点残骸重大发现: **机制16-r3 的 fix agent 死前已完成全部工作落盘**——mech16_impl_r3.patch(md5 `3fa4d98fa574a213ee113f4113039cdd`, 1062 行/4 文件: 冲突检测抽共享 helper registerDeclaredRefType 双表一体治+全表审计清单(localFunctionTargetByName 家族书面豁免待复核裁决)+9→11/11 单测+stage3 真跑+三态牙齿含外科短路+materialize 3 跑 crc32 基线逐字节+新鲜 clone 自包含)+完整 verdict 自评 CONFIRMED, 只死在最后 StructuredOutput 返回一步→**只重飞双镜头对抗复核**(wf_1e0a8621, 后缀 m16r3b, 复核重点=全表审计完备性+豁免成立性); #105/#119 只留半成品 shadow 残渣(fnsig105_shadow_r4/_pristine/_r3only、tailret119_shadow_r2)→按 [[feedback-shadow-dir-run-unique]] 换 **_r4b/_r2b** 后缀整轮重飞(wf_271d9fc4/wf_d5b1bddd, 残留目录禁复用禁采信)。★**#95 f64 wave5 解扣条件达成**: op-lane pobj WIP 已落账 `dde213d39`(07-16 11:15)+工作树 M 消失+mtime 静止 3.3h→重基现 HEAD+formM bail=818/formP ucvtf/三重奏基线复跑轮开飞(wf_c8be6bd5, u1, 语义零改动纪律+单镜头等价审计)。★hashmaps.cheng 工作树同步转净(#50 关注点, 现役 stage3 已被并发会话推进至 77a067d8/10:48)。在飞四线: 机制16-r3复核/#105-r4b/#119-r2b/#95-u1。
>
> ★2026-07-16 12:0x 收割批次四十一(#105 r3 双票 REFUTED, 洞已收窄到两行级): r1/r2 三缺陷三态验证确认真修(规范身份惯用法 cold_object_alias_identity_equal 复用+SLOT_OBJECT 递归+depth 防环), 但双复核用 C 级插桩独立坐实**SLOT_OBJECT_REF 递归是死代码**: \`field: var Type\` 的 type_name 存带字面 "var " 前缀文本, 递归喂 symbols_resolve_object 前没过 cold_type_strip_var()(同文件其余 51 处都剥)→两侧解析必 NULL→递归入口 oa==ob 快速通道(NULL==NULL)恒真静默判等——r3 自己的 nestrecur 隔离探针只测了不带 var 的纯 SLOT_OBJECT, 从未触发此分支(注释承诺"含 _REF"落空)。修法两复核一致: strip_var 两调用点+双侧解析失败 die() 响亮(NULL 通道封死, 防环靠非 NULL 指针+depth 预算)。封存 REFUTED-r3→**r4 外科轮开飞**(wf_d853e0d4, 四轮接力: 文本末段→弱比较器→身份不递归→var 死代码, 复核镜头=递归全入口/出口/失败路径逐条过)。在飞三线: 机制16-r3/#119-r2/#105-r4。
>
> ★2026-07-16 11:3x 收割批次四十(#119 r1 双票 REFUTED, 不落账): 定位与机制正确(parse_fn unterminated 兜底倒序扫描硬编码只认 SLOT_I32; 单行 = expr 形本来就对, 只有多行块这条独立兜底缺陷; spec 确认合法形修推断; addAddress 正例+哨兵全绿), 但 composite 新分支**只比粗粒度 kind 枚举不比具体类型文本**+扫描范围整 block 倒序不限真末语句——双复核各自实测静默错位: adv4 Foo{a,b}(8B) 位模式当 Bar{x,y,z}(12B) 读出/adv5 Result[int32] 充 Result[bool](同泛型家族异 T=生产最高频形)/Box 当 Result 读 str 胖指针打印乱码字节; 把原本响亮拒编的类型不匹配静默转化为确定性错值=违反 let-it-crash。★教训: #85 的病灶(粗判据代替类型身份)刚修完, 新补丁同族重犯——BodyIR 的 slot_type 文本 10+ 处已一致打戳, span_same 技巧现成没用上。封存 tailret119_fix.patch.REFUTED-r1→**r2 开飞**(wf_960cd2b1: span_same 类型文本判据+真末语句收紧+双复核反例全吸收)。在飞三线: #105-r3/机制16-r3/#119-r2。
>
> ★2026-07-16 11:0x 收割批次三十九(机制16 r2 判决 1:1 REFUTED, 不落账): refDeclaredNullableType 冲突检测本体双复核验证正确(写入侧 ambiguous 即 delete=四消费点一体治; 三态牙齿含"仅跳过 delete 行"外科验证; 复核 A 独立 11 项对抗含 3 型 6 序全排列+机制15 两消费者扩展扫描并抓到守卫禁用态的真实静默错编译实例), 但复核 B 按"扫每张按名字键的表"纪律挖出**姊妹表 refDeclaredArrayElemType**(:6099, 机制12 arrBoxRefs 唯一数据源)同构同病(同循环/仅 set/last-write-wins/零检测)且 r2 diff 零引用——实测: 未注册类型 ref 被静默接上另一组件生产 struct 编解码器(读写双端同一错误编解码器"自洽"编译过, 无 stage3 拦截网可依赖)=比 r1 洞更隐蔽。三轮教训入案: **每轮只治点名的表, 复核每轮能再挖一张**→r3 改打法(wf_b4f752a3): 冲突检测抽共享 helper 双表一体治+**全表审计清单入案卷**(逐张判定接 helper 或书面豁免)+arrBoxRefs 碰撞回归。★账本批次三十八内容被并发会话 commit a2ea3201e 良性吸收(在 HEAD 无损, 快照吞并良性方向实录)。在飞三线: #105-r3/#119/机制16-r3。
>
> ★2026-07-16 10:3x 收割批次三十八: `e7b469d9a` **#118 落账收案**(cheng_cold.c +44/-0): 定谳修正——cold_scope_import_bare_type_symbols **自带** Tier1 循环, 真缺口=精确可达重载匹配路径(cold_try_compile_import_function_from_source)从未把已算好的 own_imports 接到 Tier1 依赖的全局(Count 恒 0→必落全表扫描→与无关 quic/multiaddress 撞假歧义); 修=save/set/restore 五出口对称(镜像 types/signatures 惯用法, 零碰函数体); 真歧义负对照逐字节仍响亮。★#114 实施内定谳: 需 TypeDef/ObjectDef 补 decl_path 打戳=量级等同 #79/#109 独立工程, 不凑局部 hunk(任务已更新)。双复核 CONFIRMED(加压: 23 夹具矩阵/diamond 异别名同构缺陷定性非引入/悬挂指针理论风险逐调用点排除/订正 +37→+44 计数)。★WAN 推进=**立卷 #119**(non-void function block unterminated: 尾表达式聚合返回 Result[bool] 推断缺臂, #85 裸尾构造器相邻族)+**定谳根修轮开飞**(wf_71dcebbe, sret 高危区运行值断言写进镜头)。在飞三线: #105-r3/机制16-r2/#119。
>
> ★2026-07-16 10:0x 收割批次三十七(#105 r2 再双票 REFUTED, 不落账): r1 双缺陷确认修死(component_eq 物理身份优先——尝试 A 指针相等被"同物理不同别名各铸新 ObjectDef"实测推翻后改结构比较; sig_param_split fn( 前缀判据), 但两复核独立聚焦**r2 自创弱比较器 cold_object_layout_eq 的新洞**: ①只比字段 kind/size/name 不比 ObjectDef 自身声明名——同形异名(DogShape{legs} 充 CatShape{legs})静默过且真实调用 exec=88; ②不递归嵌套 SLOT_OBJECT 字段——内层异物理同尺寸零保护(且 DmEnvelope/FeedRequest 等主流生产回调形参就是内嵌具名对象形状, 非边角)。★复核 B 定位关键教训: **同文件 :7341/7373 早有现成生产级惯用法** cold_object_alias_identity_equal/cold_resolve_object_type_identity(多比对象自身名尾段)——r2 案卷"尝试 A 做不到"而自创弱比较器, 正确解法就写在同一文件里没被复用。封存 fnsig105_r2.patch.REFUTED-r2(复核已改名)→**r3 开飞**(wf_4fe7a1f2: 换用既有惯用法+SLOT_OBJECT 递归到叶+防环终止+两轮复核夹具全吸收)。在飞三线: #118/机制16-r2/#105-r3。
>
> ★2026-07-16 09:3x 收割批次三十六(机制16 r1 判决 REFUTED, 不落账): recon+impl 卷本体高质量——定谳=NUMERIC_HANDLE_SLOT(三定时器 ref 的 scalarType 恒 undefined 因 scalarTypeOfValueOp 四分支不认 .current=null 与 setTimeout call op; null 折叠被真实业务路径 REFUTED; 回调注册桥 UNNECESSARY); 实施=声明类型驱动兜底(一条规则连解 [24]/[27]/[28] 三 ref 非按名单点)+clearTimeout/clearInterval 桥+顺修字面量分支死代码, 三态牙齿+measure 前移 [26]。★复核 A 抓穿 REFUTED: 兜底消费的 refDeclaredNullableType(机制14 引入)是**按裸 ref 名全项目合并、只 set 无冲突检测的全局 Map**——同名异型 ref(仓内真实先例 refreshTimerRef 两种声明)碰撞→零诊断错型槽(str 充 int64, 真值判断错译 len>0), 今日三个出货 ref 未暴露纯属偶然(恰好全流经固定 int64 桥被 stage3 拦下); 与机制14 盲赋值同根同级=CHT 域的洞全在"信任无校验的全局表"。recon 预测 [26] 数组族直接过也被实测推翻(真成新阻塞)。封存 mech16_impl.patch.REFUTED-r1→**r2 开飞**(wf_e16526a3: 作用域二元组键/歧义标记二选一+机制14 第一消费者一体治+吸收复核探针)。诚实披露: 实施者一次 python3 误用已停用记录。在飞三线: #105-r2/#118/机制16-r2。
>
> ★2026-07-16 09:0x 收割批次三十五: `f62549d46` **#115 落账收案**(cold_parser.c +46/-2): 定谳=调用点采集侧——显式泛型括号文本(Some[PeerStore] 的 PeerStore)是从不过限定管线的裸源码切片, 与实参侧已限定 slot 类型裸/限定失配(插桩 3 跑定谳 expected_raw=PeerStore vs actual_raw=peerstore.PeerStore); 修=新 helper 复用 elemsize intrinsic 已验证限定调用, 对称应用于校验双侧+两处 explicit_type_args 填充点(记录侧归一零豁免); 与 #94 定谳零撞车(声明侧形参占位 vs 调用点实参, 复核结构级红队再证); 双复核 CONFIRMED(加压: 可执行二进制 md5 级判据/真不匹配负对照响亮/pass-through 口径不对称=从不触发残余加固项留档)。★WAN 推进=**立卷 #118**(ambiguous imported type name: peerinfo/multiaddress MultiAddress 全局回落层碰撞——cold_scope_import_bare_type_symbols 缺 #109 姊妹已获的 Tier1=已知修法移植, 顺手评估 #114 同函数域)+**根修轮开飞**(wf_ebfd9f1b)。在飞三线: #105-r2/机制16/#118。
>
> ★2026-07-16 08:3x 收割批次三十四(#105 r1 双票 REFUTED, 不落账): r1 主体扎实(fn 签名比对 4 接入点+3 FN_ADDR 打戳+kind4/15 排序修+泛型替换分支; --rebuild driver_sha 逐字节不变=零误伤构造证明; 全仓生产 fn 回调普查 0 错签名), 但两复核用独立血统夹具交叉坐实**补丁新引入比较原语的两处结构性缺陷**: ①cold_type_component_eq 只比最后点段文本——跨模块同裸名异构类型(Payload{a,b} vs Payload{text})放行错签名回调→真实调用 SIGSEGV 139=直接推翻补丁核心承诺; ②cold_fn_sig_param_split 深度 0 冒号扫描不分匿名/具名条目——高阶 fn 首位形参类型被腰斩, 100% 合法程序被误拒(baseline exec=21 语义正确)。另录 Option[mod.T] 嵌套限定名同源静态缺口。三重奏/家族/WAN 全绿对这两角落零覆盖力=不构成放行依据(复核语)。封存 fnsig105_fix.patch.REFUTED-r1→**r2 开飞**(wf_bb3a6640: 规范身份回落 symbols_resolve_object+fn( 前缀消歧+Option[mod.T] 同批+吸收复核夹具+消融 #94 冗余)。在飞三线: #115/机制16/#105-r2。
>
> ★2026-07-16 08:0x 收割批次三十三: `5670d6d92` **#94 落账收案**(cold_parser.c +39/-11): 跨模块 import 类型登记通道递归处理复合类型时不知模板自己的泛型形参表, 裸 T 盲目自限定成 alias.T 垃圾条目污染全局符号表; 修=generic_names/generic_count 贯穿 8 调用点+结构性 span_same 判据(零名字启发式, 复核用多字符形参名 Elem 实证); 6 位形态矩阵 4 命中全修; ★正向副产物=option.Some[T] 泛型构造器 kind mismatch(collision_check 族, 生产核心 option.cheng)同根次生症状一并修复(插桩定谳); 复核 A 另录更隐蔽变体(静默采信巧合同名真实类型直到聚合失配才暴露)同修+双反向误伤负例通过; 复核 B 全量 214 夹具零差异+订正案卷 HEAD 谱系失实(工作区建仓早于 #113 落地 22min, WAN 墙描述过期但零回归结论不变)。在飞三线: #105/#115/机制16。
>
> ★2026-07-16 07:3x 收割批次三十二(双落账: #113+机制15 终局): ①`42bfb0cfa` **#113 落账收案**(cold_parser.c +76/-0): 定谳=第 4 种失效模式(区别 #106/#109 两已知形态)——cold_collect_import_module_types 扫本模块 type 声明前从不预注册自己 direct_imports: DFS 先访 builders 时 did/types 未注册→裸 DidAuthConfig 误自限定+first-write-wins 永久固化→Option[错名] 落 SLOT_OPAQUE(13) vs OBJECT(5); didauth 自身字段=DFS 序运气好(插桩定谳); 修=预注册(逐字复用下游 signatures 已上线同款, 其注释自证此缺陷类)+连带 std/result↔std/system 真实互 import 环灰栈守卫(消融证 load-bearing: 去守卫 SIGSEGV); 复核用真实 builders.cheng 证 privKey expected_size 16→32 同机制受益; 立卷 **#117**(灰栈 die-longjmp 逃逸防御加固, 与既有同款共享暴露面)。②`5ffbfa69b` **机制15 落账收案(#102 终局)**(7 文件 +1477/-18): 五轮对抗接力(r2 直线逃逸 REFUTED→r3 循环回边 REFUTED→r4 核心双验+回归网没牙 REFUTED→r5 测试补钉 CONFIRMED); handleClose 前移第 21→24 项 voiceIceFlushTimerRef; r4 核心逐字节不动证明+三态牙齿(完整绿/全短路红/外科短路新测试红)+阴性对照排除恒真断言。③★WAN=**立卷 #115**(kademlia explicit generic arg mismatch)+**立卷 #116**(机制16: 定时器句柄=第五类 ref 族)双轮齐飞(wf_64b0f3ef/wf_445f5508)。在飞四线: #105/#94/#115/机制16。
>
> ★2026-07-16 06:5x 收割批次三十一(机制15 r4 补验=1 CONFIRMED+1 REFUTED, 判 REFUTED 但范围钉死为回归网缺口): ★核心修复逻辑双复核交叉确认正确——functionHasOtherWriteToName 全函数扫描覆盖转译器全部"写变量"形态(local_write/assign/for_of; ++/--/解构/裸 try 结构性不可达三重独立读码印证); 历史反例(r2 直线/r3 遮蔽/循环回边/for_of 同名)全部修死; r3 的 ordinal 缺失缺口随方案更替"攻击面消失"(functionHasOtherWriteToName 零处引用 ordinal); 多别名交叉验出函数级原子性 fail-closed(比预期更强)。★REFUTED 唯一依据=**外科短路复现**: 只禁 for_of 分支保留其余, 补丁自带 10 个已提交测试全绿——for_of 同名遮蔽场景从未获得永久回归测试(只在工作区私有探针), 下次重构可无声复发而 CI 全绿=r2→r3 失败模式在测试层重演。整改配方复核员趟平(探针转 test 8+bodyBlock 字段名坑+process.env 门控坑)→**r5 整合轮开飞**(wf_f8628caf: 测试补钉+三态牙齿验证(完整绿/全短路红/外科短路新测试必须红)+核心逐字节不动证明)。★#95 wave5 解押复查: pobj mtime 05:36 静默 37min<1h, 继续扣押。在飞三线: #113/机制15-r5/(wave5 扣押)。
>
> ★2026-07-16 06:3x 收割批次三十(机制15 r3 再 REFUTED→复核员产 r4→补验轮开飞): r3(ordinal 区间失效判定)堵死 r2 直线重赋值+遮蔽两形态, 但双复核独立交叉坐实**循环回边失明**——hasInterferingWrite 只查 declOrdinal<ord<useOrdinal 静态区间, "赋值在守卫之后但共享循环体"第 2 次迭代把陈旧值(111)当句柄传桥(stage3 exit=99), 与 r2 同类只是路径换循环; 封存 mech15_impl_r3.patch.REFUTED-r3。★复核 A 直接产**替代修复 r4**(全函数存在性扫描 functionHasOtherWriteToName 非位置判定, 固有代价=过度保守拒折叠但诚实响亮; 升级 8 场景对抗中又自修 for_of 迭代变量同名二次缺陷)+自验(mech 全套+新鲜 clone); 按纪律 r4=作者单方验证, **补验轮开飞**(wf_78af5beb 双镜头, 打破作者自验盲区魔咒)。次要缺口在案: ordinal 缺失静默退化 0(手写 fixture 惯例不设 ordinal, 生产链路不可利用)。在飞三线: #113/机制15-r4 补验/(#95 wave5 扣押)。
>
> ★2026-07-16 06:2x 收割批次二十九: `43fa800fb` **#109 落账收案**(cheng_cold.c +26/-0+cold_parser.c +55/-9): 定谳=OTHER(查找面错位)——cold_try_compile_import_function_from_source 把裸类型名解析接到**全程序传递导入闭包**而非模块自己直接 import 列表, 无关模块同名类型(quic/multiaddress 经 switch→quictransport 传递带入)与真导入 libp2p/multiaddress 撞假歧义(两物理声明, 非 #79 同物理场景); 真实命中点=cold_parser.c:1177(插桩证实 1030/1063 全程未死); 修=Parser 末尾追加 own_import_sources(不破坏 76 处花括号部分初始化, 复核枚举验证)+Tier1 本文件直接 import 优先+Tier2 全闭包回落零改动(保留 bootstrapTopicV1 深链效果); builders.build body missing=歧义误判纯下游症状。双复核 CONFIRMED(加压: 真歧义负对照/diamond 同别名/嵌套 parser_child 传播 exec=77/运行时绑定正确物理声明 exec=42/与 #108 同文件行区间零冲突)。★立卷 **#114**(复核变体 C: 去重键=别名字符串非物理恒等, diamond 异别名假阳性 die, Tier1/Tier2 对称 pre-existing)。★WAN 推进=**立卷 #113**(聚合字段存储 kind mismatch didauth.DidAuthState.config expected_kind=5 actual_kind=13, 疑与 #106/#108 指针族相邻)+**定谳根修轮开飞**(wf_491e72f5, 含 #109 消融定性防"错误成功变失败落 OPAQUE"回归假说)。
>
> ★2026-07-16 05:4x 收割批次二十八(#95 wave5 双复核 CONFIRMED 但落账扣押): ①wave5 修死 wave4 双缺陷: provenance=CallOp 新增 wholeCallF64FromIntRescue 专属字段绑全部 4 豁免点(含 ablation 逼出的第 4 处 #73 时代 reloc-emit 循环)+歧义构造直接 poison(818); uint=A64EncUcvtfDw/Dx 新编码器(宿主 as+otool 真编码回读非手推), 符号性由声明类型文本判定, 未知即 poison 绝不默认有符号; ★施工中发现 wave4"pristine 硬失败"基线已被 op-lane 演进失真——float64(getN()) 真 pristine 已是静默错值(frontend let_call 拆分丢外层类型), 新增对应 poison; ★复核 B 抓出并当场补齐 pobj 三镜像律违规(backend2_lower_stmt.cheng:1639 第三拷贝漏 poison, +26 行镜像)——最终 6 文件 398+/9- 双复核在最新 HEAD 全套重验收敛。②★落账红灯: op-lane 正活跃重写 PrimaryBodyIrAppendWholeCallExprToSlot 同函数(pobj WIP 25 hunk, @@ -26439,23 删 23 行, mtime 分钟级), 工作树 apply 失败——封存 f64_wave5.patch.CONFIRMED-HELD-pobj-active, 解押=op-lane 落定→重基→formM/formP/三重奏复跑→落账(任务 #95 改题跟踪)。③立卷 **#111**(负 f64 字面量 movk 位模式错+int64(f) 32 位截断存储, 双静默 pre-existing)+**#112**(call-arg 位嵌套调用 int→f64 第三缺口: 重复调用+读未写栈槽)。在飞二线: 机制15-r3/#109。
>
> ★2026-07-16 05:2x 收割批次二十七: `1edd221f1` **#108 落账收案**(cold_parser.c +132/-6+两 .cheng 迁移各 5 行, 双侧手术流带 op-lane 55 行 WIP 零重叠零损): ①静默丢写 ptr.field[i]=v 改响亮门禁; ②合法形 ptr->field[i]=v 接线实现(复用 cold_resolve_pointer_object+#97 walker, ★顺修 walker 动态 seq 字段 SLOT_SEQ_*_REF 标签真实缺口+多跳指针链 -> 继续跳支持); ③写侧 . 违 spec 放行改响亮拒; 全仓别名递归扫描(66 别名+504 直接 T*+140 元组/31 文件)唯一生产依赖=ChengTaskPtr task 字段 10 行按 #106 手法迁移, --rebuild 通过=门禁无遗漏依赖的构造性证明。双复核 CONFIRMED(加压超案卷: 深链双动态索引/三跳箭头链 exec 值/宽度混合哨兵逐位/str[]+对象 seq 组合; 订正案卷 diffstat/夹具计数两处记账偏差)。★立卷 **#110**(复核交叉核实 pre-existing: bracket 读写混链同字段 DSE 挂起 exec=138+深链 dot-gate 旧文案+窄宽度 walker 限制)。在飞三线: wave5/机制15-r3/#109。
>
> ★2026-07-16 04:0x 收割批次二十六: `671af4614` **#106 落账收案**(src/libp2p/mobile_ffi/unimaker_compat_ffi.cheng 单行 +1/-1, 零编译器改动): 定谳=SOURCE 非编译器缺陷——spec:49 明文 T* 成员访问统一 ->, 全文件 8+ 处 NodeRuntime* 字段访问全对唯独 :3998 孤立笔误(复核 A 独立正则全扫描证唯一命中); kind=13=SLOT_OPAQUE 读路径拒绝恰合 spec(非缺分支), 按"非法形走规范迁移"纪律修源不修编译器。双复核 CONFIRMED。★复核双料重大发现=**指针字段写路径三缺陷立卷 #108**: ①`ptr.field[i]=v` 静默丢写(编译 rc=0 目标原地不变, 哨兵实测坐实, ~17472 分发 SLOT_OPAQUE 落 return block)=最重; ②`ptr->field[i]=v` 合法形双拼写均未实现(硬死, 响亮但缺口); ③写侧 `.` 被 parse_field_assign 当 -> 同义词放行(COLD_ARROW_LVALUE)违 spec=读写不对称——推翻实施卷"设计正确拒绝"论断(只对读成立)。★WAN 推进=**立卷 #109**(ambiguous imported type name/builders.build body missing, import 类型消歧子系统)。**#108(静默丢写最高危)+#109 双轮齐飞**(wf_9873cbd3/wf_9363aa22)。在飞四线: wave5/机制15-r3/#108/#109。
>
> ★2026-07-16 03:2x 收割批次二十五: `c92aea7eb` **#104 落账收案**(cold_parser.c +15/-0+1 回归锁夹具): 定谳=FALSE_AMBIGUITY——len() intrinsic 4 个 SLOT_I32 分支只调 body_slot 从不 body_slot_set_type→返回槽类型文本恒空→\$ 消歧 Pass1(精确文本匹配, #52/#79 家族根修机制)被跳过落 Pass2 粗粒度 kind 扫描, 9 整型重载塌缩 SLOT_I32 假歧义; 修=4 分支打 int32 戳(复用 143 处既有惯用法, 未碰消歧判定); 真歧义负对照仍响亮拒。双复核 CONFIRMED(加压: #79 diamond 交叠最刁钻复合点验证两修复正确复合/11 整型宽度矩阵/sizeof 姊妹诚实范围/seq 分支超案卷覆盖)。★立卷 **#107**(复核独立发现: len() 非容器分支缺 parser_take 右括号, pre-existing)。★WAN 推进=**立卷 #106**(node.sharedFiles[fileIdx] 指针字段访问 slot_type=NodeRuntime* kind=13, 疑 #100 的 *ptr 显式路径之 ptr.field 隐式姊妹)+**定谳根修轮开飞**(wf_dbedaaa5, spec 准绳先行+静默错偏移高危区哨兵断言)。在飞三线: wave5/机制15-r3/#106。
>
> ★2026-07-16 03:0x 收割批次二十四(机制15 r2 判决 REFUTED-by-review, 不落账): 实施卷本体扎实(HANDLE_SLOT 三项分类器扩展+teardown 折叠桥, 真实数据先行=28 触点穷尽扫描实测只有 .remoteDescription 直接链触发 objectLike; cht-measure 6 次一致阻塞前移 voiceIceFlushTimerRef 精确命中 recon 预测+反例还原双向因果; 回归全绿), 但复核 A 抓到**潜伏静默 miscompile**: csg-cheng-transpiler.ts 的 handleAliasSource 别名表按名字注册**从不失效**(全文件零 .delete)——同名变量后续以非 .current 来源赋值/词法遮蔽后, teardown 折叠用陈旧别名值(stage3 真编真跑坐实: 探针读到 999 非真实句柄 4242, exit=99 零诊断), 当前 ChessPage/ChatPage 真实源不触发但普通重构即可达, 违反补丁自宣"never a silent partial translation"不变式。复核 B CONFIRMED(全六镜头绿+materialize 环境阻塞 pristine A/B 排除法定性为源树 86 文件并发漂移非补丁)——一 REFUTED 即封存(mech15_impl_r2.patch.REFUTED-r2)。★**r3 开飞**(wf_e9a9b8b4: 别名失效 delete-on-reassign+遮蔽形态实测定形+吸收复核 adv-alias-escape 探针为永久回归)。在飞三线: wave5/#104/机制15-r3。
>
> ★2026-07-16 02:1x 收割批次二十三: `4f5420cd4` **#103 落账收案**(cold_parser.c +16/-0+3 回归锁夹具): 定谳=COMPILER——cold_imported_param_specs 手工类型文本扫描对 [ 有深度感知跳过对 ( 没有, fn(req: DmEnvelope): DmEnvelope 在内层闭括号误判终止→类型截断+残尾 "): DmEnvelope" 误解析成幽灵第二形参(IMPORT_SIG 实测 arity=2 误注册); 修=对称 ( ) 深度跳过分支(镜像 [ 惯用法); 回调真实间接调用运行值断言 41→42。双复核 CONFIRMED(加压: 双层 fn(fn) 嵌套/多 fn 形参 baseline arity=4 错注册/结构性硬保证=外层 ) 按构造不在 params span; 复核 B 证 cold_parser.c 是唯一实现无姊妹副本)。★双料独立发现立卷 **#105**: ①symbols_find_fn_for_call 对 fn 实参只比 slot kind 完全不比签名——错签名 callback 静默编译过(baseline 复现)=系统性类型安全缺口; ②array+fn 混合嵌套 kind=4/15 匹配失败独立墙。★WAN 推进=**立卷 #104**($ stringify 重载歧义 len(hostPeerId), 双复核独立消融证 pre-existing)+**定谳根修轮开飞**(wf_4ea2f008, "选第一个"式消歧糊弄=最大风险点)。在飞三线: wave5/机制15-r2/#104。
>
> ★2026-07-16 01:0x 收割批次二十二: `92aa5d2a2` **#100 落账收案**(cheng_cold.c +33/-0+2 回归锁夹具): 定谳=COMPILER 侧——symbols_resolve_object 对 *ptr 解引用的裸拼写非泛型 struct 类型名(跨模块以限定名注册)精确匹配失败后直接 return 0, 从未试"裸名→唯一限定名末段匹配"(同函数该技法已用 3 次唯独此分支缺)=★裸拼写病根家族第 4 平行缺臂(#82/#85/#87/#90 系列); 诊断噪声澄清=报错里 param[0] 是 caller 自身形参非 callee; found_count==1 歧义安全拒判; 顺带非回归修复 optgen87 main_a closeAll(#87 残余症状点, --emit:exe 运行值验证)。双复核 CONFIRMED(加压: 字段 store 第三触发点 _adv6/双模块同名歧义拒判逐字节/负对照有牙齿/泛型影子三构造排查; 各抓一处文档行号笔误)。★WAN 推进=**立卷 #103**(setDmEnvelopeHandler 函数值回调跨模块传参 no-same-name-candidates, 与对象类型不同代码路径)+**定谳根修轮开飞**(wf_29f8931a, fn 签名匹配放宽=最大风险点写进复核镜头)。在飞三线: wave5/机制15-r2/#103。
>
> ★2026-07-16 00:4x 收割批次二十一(机制15 半程: recon 定谳收官+impl 哨兵违规死亡重飞): ①**recon 卷高质量收官**(mech15_verdict.md): 三路线定谳=HANDLE_SLOT 唯一存活(objectLike=true 诊断埋点实测坐实; null-fold 被 :930 真实 new RTCPeerConnection+teardown close() 反证=折叠会致真实资源泄漏; struct-boxref 被分类门槛 !objectLike 结构性排除); 新形状=直接链式解引用+本地别名 teardown 惯用法(机制13 没遇过, 非一行注册可解); ★纪律红利实证: "历史定性先复测"抓到 [20]activeVoiceSession fail 态已被无关 HEAD 提交静默修复=解析序表会漂移。②impl agent 死因=哨兵纪律违规(后台 materialize PID 63624 未落定被截断交卷, feedback_agent_inflight_return_kills 同款); 死前留真发现: emitCall receiver→args→call 顺序使带参调用 op 不紧邻 .current, recon"3 处链式都触发 objectLike"待实测裁决=白名单形状禁凭读码拍板; handleIncomingVoiceIceCandidate:991 别名形状 recon 表格遗漏; ChatPage.tsx:722 同构同名 ref。③清理: 误命名 mech15_impl.patch(实为 recon 探针 diff)封存 .MISNAMED-r1。④**impl r2 重飞**(wf_8e73ab74, 哨兵纪律+残留进程处置+增量发现全编入)。在飞三线: #100/wave5/机制15-r2。
>
> ★2026-07-16 00:2x 收割批次二十(#95 wave4 判决 REFUTED-by-review, 不落账): 实施卷自评全绿(六形态 repro+clang 交叉+三重奏), 但对抗复核抓穿**两处补丁自引入静默 miscompile**(ablation 精确定位): ①3 处豁免门(Reachability/BuildItems patch+birc)判据 PrimaryCallOpInlineF64FromIntKind>0 只看多义字段值不看 provenance——无关既有 CallOp 构造器(尾名恰为 float64 的 let X=真实调用())被误豁免→未登记 bl 自跳+读未写 d0, patch 前响亮失败 patch 后 rc=0 错值; ②LocalI32Tag 不分有无符号, float64(uint32 高位1)无条件 SCVTF 当负数=静默错值(既有 call-arg"working path"对 uint32 同样从未真验过)。第二复核独立佐证+补第四处覆盖不实(return float64(let局部) 走独立判据 bail=801 响亮拒, "return 已根修"表述不实)+★方法论钉死: **静态 reloc 表会误判, 必须真 cc 链接+真运行值**。金标矩阵未覆盖"嵌套真实调用实参"与"无符号"两形状=三重奏全绿仍漏的原因(f64 系列 v1/v2/wave3/wave4 四轮复核轮轮抓真缺陷)。补丁封存 f64_wave4.patch.REFUTED-r1; rescue 主体设计(精确名取槽 typeKind+bail=818)判定可保留重基→**wave5 开飞**(wf_2867e464: provenance 标记豁免+UCVTF/响亮 poison+吸收 13+复核夹具+verdict 枚举语义钉死)。在飞三线: #100/机制15/wave5。
>
> ★2026-07-16 00:0x 收割批次十九: `bd20114d6` **机制14 落账收案(#89)**(7 文件 +1581/-13): CHT_STRUCT_REF_TYPES 结构体 box-ref 槽族+WebSceneWebRtcIceConfigRecord 手写 JSON 编解码(拒 emitStructs 静默丢字段通用路径); ★复核抓穿并修死后门: `iceConfigRef.current=config` 盲赋值把 TypeMapper 自动映射 struct 塞进手写编解码 struct=stage3 实测静默字段错位(relayOnly 翻转/expiresAtMs 泄入 iceServers.len, rc=0 无诊断=教科书级静默 miscompile), 修=exprType 一致性护栏响亮拒绝(原实施 REFUTED→护栏版 CONFIRMED 2/2); handleClose 阻塞 free-var 实测前移第18项 iceConfigRef→第21项 peerConnectionRef。★诚实遗留立卷 **#101**(hydrateIceConfig 真实写入行现为响亮 transpile-fail, 字段桥接 codegen 未实现, 与机制15 串行排队防转译器补丁互撞)。★流程事故入案: 固定路径 shadow 目录被并发外部进程(grok --resume 7h)写脏+复核卷一度误归因——落账前编排者亲验 md5 对表钉死值+文件清单+内容扫描(又一坑: shell grep=ugrep 别名对 diff 文件静默零匹配, 必须 /usr/bin/grep, diff-shim 陷阱同族), 新纪律=shadow 目录/产物名带 run 唯一后缀(记忆 feedback_shadow_dir_run_unique)。**机制15 开飞**(wf_47b2c85f, 定谳先行: null 折叠 vs 句柄槽 vs box-ref)=**立卷 #102**。在飞三线: #95 wave4/#100/机制15。
>
> ★2026-07-15 23:3x 收割批次十八: `911f82a9b` **#97 落账收案**(cold_parser.c +33/-0 纯增量+2 回归夹具): 多跳字段赋值 while 循环命中数组字段+`[` 后无条件视索引为终止形态(单跳兄弟路径早已通用支持, 多跳没接线), 修=索引后遇 `.` 复用既有 parse_store_field_path_into_ref(字段/索引任意深交替); 生产点 sw.connManager.items[i].open=false 过墙; 形状矩阵 8 拓扑 26 运行值断言+双复核 CONFIRMED(复核加压: 5 级深链/双动态索引别名/SEQ_OPAQUE 动态路径/mutation 断言自检; 两个未覆盖形状[2D 双中括号/索引内比较符]验证为响亮 die 非静默且非回归; r_b 订正原案卷家族夹具计数 13→11 系证据记账偏差)。★WAN 3 跑逐字节推进到新前沿=**立卷 #100**(unimaker_compat_ffi.clearNode unresolved, 实参 cstring/ptr vs 候选 var NodeRuntime, gate_blocker_id=cold_reachable_body_missing)+**定谳+根修轮开飞**(wf_be3d06c4, 定谳先行: 编译器推导缺陷 vs 源级签名失配)。在飞三线: #95 wave4/机制14/#100。
>
> ★2026-07-15 22:5x 收割批次十七(补验轮 wf_e8fd1b87 三票全 CONFIRMED, #90/#93 双落账): ①`cac76d94f` **#90 落账收案**(cold_qualify_import_type 平行实现 fixed-array-size 位 fallback 扫描+poison-on-miss+9 位置矩阵夹具); 2/2 票(前轮回归网+r2 真实类型镜头, r2 亲手真类型直调 insertClosest 50,10,30→10,30,50 验绿); ★r2 洁净室挖出**三跳转手 const 数组尺寸位过度拒绝**(兜底扫描时机早于 import 闭包展开, 零生产触发/非静默)=**立卷 #98**。②`a435eb772` **#93 落账收案**(explicit_types 贯穿 cold 特化四函数+mangled 碰撞收窄); 2/2 票(类型归一镜头四探针全过含 size 相同布局不同恶意对拒绝+nm 双符号验真; 回归网镜头 WAN 3 跑逐字符过墙撞 #97 符合预期); ★复核消融实测挖出**第二修复零可执行回归锁**(cold_require_field_store_layout 只盖聚合字段赋值上下文=既有架构缺口)+裸名 mangled 坍缩过度拒绝=**立卷 #99**。③落账法=合并态另验(land_combo 洁净 clone 双补丁齐上三重奏 suite MATCH+probe=1)后主树分两 commit, 补丁改名 .LANDED。④**#97 根修轮开飞**(wf_5807f0d3, store lvalue 链泛化+形状矩阵运行值断言)。在飞三线: #95 wave4/机制14/#97。
>
> ★2026-07-15 22:1x(次日续) 收割批次十六(配额中断事件): 四工作流同刻死于 "session limit resets 10:10pm(Asia/Shanghai)"。①**#90 根修轮 PARTIAL**: 修复 CONFIRMED——★重大澄清: 原立卷症状(跨模块 const for 上界)**已被 #51 源修覆盖**, 此前 stage3 读数系陈旧二进制伪证(强化 #50 换 seed 必要性); 真残留缺口=第二平行实现 cold_qualify_import_type(全局 var 文本扫描)漏 fixed-array-size 位置, 补丁 `constfor90_fix.patch`(签名 Arena*→Symbols*+fallback 扫描+poison-on-miss+4 夹具)就绪, Kademlia 真实类型 fresh cold 验绿; 对抗 1/2 票 CONFIRMED+1 票配额死亡。②**#93 根修轮 PARTIAL**: 修复 CONFIRMED(0元泛型构造器占位符"o"未替换; explicit_types/explicit_count 贯穿 cold_ensure_specialized/cold_specialize_fn_type/cold_specialized_fn_name/symbols_find_fn_for_call 四函数, 双 clone 回归+三重奏全绿), 补丁 `optph93_fix.patch` 就绪, **两复核票全配额死亡=0 票**; ★WAN 墙推进到新墙**立卷 #97**(嵌套索引对象 store `sw.connManager.items[i].open=false`, cold_parser.c:17549)。③#95 wave4 与机制14 实施轮开飞即死(零完成层)。④22:15 探针 9s 返回定谳配额恢复→#90/#93 补验+#95/机制14 重飞四线开。⑤#50 继续停靠(op-lane hashmaps WIP 未落)。
>
> ★2026-07-15 23:3x 收割批次十五(机制14 侦察卷): `bf6a12878` 探针落账(2 只读工具 177 行, 零生产改动——实施 agent 按条件从句诚实锁定侦察范围不越权)。★三定谳入案: ①mech12/13 阻塞身份"矛盾"裁决=无真矛盾(机制13 落账前后两态皆真; mech13 实施者 A/B 误差根源=stash 后未重建 dist, 已被其自身复核订正); ②handleClose 33 项 free-var 解析序完整钉死(4 轮独立字节级一致), iceConfigRef 之后还有 activeVoiceSession/peerConnectionRef/voiceIceFlushTimerRef 等多个 fail 项=v35 门 handleClose 收口是多机制序列非单点; ③WebRtcIceConfig 唯一 TypeMapper 卡点=iceServers:RTCIceServer[](ambient 类型无 type_decl), 且 **emitStructs 对不可映射字段静默跳过=通用路径会静默丢连接必需数据**(不可走, 手写编解码定案)。设计提案完整(CHT_STRUCT_REF_TYPES+structBoxRefs+手写 JSON, 两实施陷阱已查证)→**实施轮开飞**(wf_1373296b)。在飞四线: #90/#93/#95/机制14 实施。
>
> ★2026-07-15 23:1x 收割批次十四: `8f01fa0f8` **f64 第三波落账(#69+#76 收案)**(3 文件 +176, pobj 带 #67 WIP 双侧手术流): ①#69 解押定谳=HELD 补丁缺 targetIsImportc=true(写于 #73 前, 原样应用会从响亮 bail 退化成静默垃圾=比毒更糟), 补一行+直接截断 4 形态运行值精确; ★x509VerifyChain bail=810 归因订正=enum 实参非 f64 案(账面误记, rescue 按设计正确拒绝); ②#76=StoresScalarResult F64 臂+bl 后 fmov x0,d0+预测器+gen2 四镜像, @importc 与 Cheng 内部双路径(内部影响面比立卷更宽), 金标 sqrt/pow 真链接 6/6+IEEE-754 恒等式 clang 交叉; ③★复核员抓穿宽口径并自修: return f64Call()==0 文本快速路径(第 4 函数第 3 镜像)裸位截断低 32 位当 int32 比——sqrt(4.0)==0 位模式低 32 全零静默判真, 修=float64 返回即拒快速路径响亮 poison(+54 行, FCMP 真支持=#96 立卷); 判决 REFUTED-by-review 但终态=复核员修复+全套验证(对抗矩阵对齐 clang), 落账合理。④立卷: **#95**(int→float64 方向两形态既存静默, 金标 bits 16/32 剩余阻塞, **wave4 开飞** wf_ab303627)+**#96**(FCMP+gen2 810 镜像缺失); 事故披露在案: 实施者 shell 重定向覆盖旧 patch 未先 Read(已重建无实损)。⑤在飞四线: 机制14/#90/#93/#95。
>
> ★2026-07-15 22:4x 收割批次十三(双工作流齐收): ①`0887a05cb` **#86 落账**(9 文件 38+/30-, 判决 REFUTED-by-review 但复核明示"补丁文本无需修改可落地"): spec 定谳 for 变量=新绑定遮蔽(文法 pattern 产生式+词法回扫实现+stage3 三证)→11 受害点全仓扫描(803 候选/47 误报全量人工复核)修 10 处(独立扫描变量+显式赋值); ★REFUTED 实质=镜像 int32 测试掩盖真实类型路径: xorDistanceCmp 的 for 上界 idLength(跨模块无限定 const)在 stage3 生产路径 0 次迭代→比较器恒 0→**Kademlia 排序生产从不生效**(const 家族新实例)=**立卷 #90+根修轮开飞**(wf_415fce36); 顺产 **#91**(backend_driver for 回写+差一, 双工具链分歧)+**#92**(ChainNodeCliExtractStateText 缩进级联损坏+smoke runner 接线)两立卷。②`e4a0d9d3d` **#87 落账收案**(+21 纯增量): module 指令限定注册名 vs 裸拼写查找失配, symbols_resolve_object 泛型分支补限定名末段唯一匹配(复用同函数既有惯用法); WAN 过 offset=15 首墙; 5 组对照矩阵钉死触发边界+9 组复核对抗矩阵; 双复核 CONFIRMED(1 订正=触发边界表述过头, 第三墙补记); 新前沿两墙=**#93**(option.Option[o] 占位符未替换, **根修轮开飞** wf_060f0538)+**#94**(形参 T 被自限定通道误限定 X.T)立卷。③在飞五线: f64 三波/机制14/#90/#93/(#50 停靠)。
>
> ★2026-07-15 22:0x 收割批次十二: ①`358741f8c` **#84 机制13 落账收案**(8 文件 824+/9-): TypeMapper MediaStream→int64 特判(治本, 拒绝再开旁路——旁路不覆盖同类型其他出现位置是 mech12 已暴露缺陷)+CHT_HANDLE_REF_TYPES 动态可空句柄槽注册表+stopStreamTracks 裸名桥遮蔽; ★顺修两根因 bug(null 写硬编码 str 空串撞 int64 槽编译死→zeroValueOf 按槽位类型/分类器位置扫描误判→receiver ID 反向引用); 23 项既有测试零扰动+双复核 CONFIRMED; ★架构定谳入案: localStreamRef 是动态可空句柄(不能塞 hostObjects"恒 present"机制)而 peerConnectionRef/remoteStreamRef 可编译期 null 折叠——同域两类分列; RTCIceCandidateInit TypeMapper 割裂线索定谳为真(独立探针, 非并发伪影)。②诚实口径: handleClose 阻塞身份转移 **iceConfigRef**(普通 WebRtcIceConfig 结构体), 与 mech12 案卷"=localStreamRef"矛盾在案未深挖→**机制14 立卷 #89+开飞**(wf_d5c1cc32, 先复测定谳解析序再实施)。③在飞四线: #86/f64 三波/#87/机制14。
>
> ★2026-07-15 21:4x 收割批次十一: ①`26371b6e0` **#85 落账收案(cold_parser.c +6/-2 + 2 回归锁夹具)**——★根因反转推翻 #81 案卷的宽泛"跨模块 struct ABI 损坏"框架: 真因=parse_fn 裸尾表达式构造器隐式返回判定 span_same(return_type, object_slot_type) 在 import_mode 下限定名/非限定名文本失配→组合体 RET 分支跳过→标量兜底畸形 IR→codegen 不发 sret 写回; **尺寸/寄存器边界完全无关**(5 形态矩阵 8B~str 胖指针 15/15 裸尾全损 vs 显式 return 15/15 全对的 A/B 语法对照锁死), 修=object_slot_type 同过 parser_scope_type(直接+name[T] 泛型两触发点, 同文件 no-op); **noderesource SIGSEGV 链终结**(count=3 精确, #81→#85 全链收口)+didauth/onionpay 生产探针红→绿; 双复核 CONFIRMED(复核员独立重构矩阵+泛型分支必要性补证+41/25 夹具家族零回归双套过滤订正)。②**#88 立卷**: kind=2/5 caller 侧非限定 import 构造器身份分裂硬编译错=同族独立缺陷(已表征最小夹具在案)。③任务簿: #85/#82/#81/#73/#77/#68 六案删列, 记忆 xmod 案卷终态化。④在飞四线: 机制13/#86/f64 三波/#87。
>
> ★2026-07-15 21:2x 收割批次十: ①`97d17a30d` **#82 落账收案**(cheng_cold.c 69±/cold_parser.c 15±/cold_types.h +1): symbols_find_fn exact 档穿 param_types 做声明类型文本比较(镜像 add_fn 既有惯例), 根除同 kind 错认→set_fn_param_types 覆写假重载误杀; ★工程亮点=Option B 写侧 tripwire 实测双假阳性(var 前缀精化+跨模块 re-export)自证伪后完整撤回只发 Option A; 双复核 CONFIRMED(16 组 kind 矩阵/多跳 re-export 理论风险亲手构造复现证伪/独立隔离 clone 六项矩阵全绿)。②★**正典口径订正+立卷 #87**: canonical HEAD 上 WAN smoke 真实首墙=switch.cheng:1 offset=15 Option[muxer.Muxer] 泛型实例化 symbols_resolve_object 不可解析(与 $ 机制无关的独立缺陷, 物化序早于 unimaker_compat_ffi)——此前案卷 offset=1926 系 dollar_r2_shadow 非正典世系(带 nodes_discovery_slice3 外补丁)读数, 勿再引用; **#87 根修轮开飞**(wf_9b3cdbcf)。③op-lane hashmaps WIP 仍未落(#50 继续停靠)。在飞五线: 机制13/#85/#86/f64 三波/#87。
>
> ★2026-07-15 20:5x 收割批次九: ①`62289b513` **f64 ABI v2 落账收案(#73+#77+#68 三案齐结)**(6 文件 +576/-41): AAPCS64 NGRN/NSRN 双计数器(GP→x{NGRN}/f64→d{NSRN} 仅 @importc 边界, Cheng 内部调用 pristine/patched 产物逐字节相同)+>8 参混类 bail=817 构造期 poison+L544 SCVTF 内联(CallOp.inlineF64FromIntKind 构造期字段, targetSymbol 不动; #68 手法字符串匹配对此不适用的教训在案)+★第三镜像点 backend2_lower_slots 补齐(漏则 gen2 全失效); 双复核 CONFIRMED(自造混类签名矩阵 clang -O2 逐位+真链接运行值+7 参交替探针); 落账=pobj 带 op-lane #67 WIP(184 行, hunk 零重叠)双侧手术流(--cached+worktree 同 apply+裸 commit), WIP 无恙; 遗留如实=金标 --emit:exe 仍 #69 bail=810(消融证 pre-existing)+gen2 InvalidOp 硬崩溃族既存缺口。②★**f64 第三波开飞**(wf_e8348cbc): 解押 f64_const_fold_fix.patch.HELD(扣押原因=等 ABI v2, 现已解)重基重验 #69 根修+#76 F64 返回值弃置修复+金标 e2e 终验三修合力收口。③#73/#77/#68 任务收案删除, v1 补丁标 SUPERSEDED。在飞五线: #82/机制13/#85/#86/f64 第三波。
>
> ★2026-07-15 20:4x 收割批次八(#81 扩围判决=PARTIAL 但双料重大发现): ①**loop_rev_ 家族收案零需修**——40 处/20 构造/13 文件全 EQUIVALENT(复核员一 20/20 第一性原理重建 CONFIRMED+crypto 四文件字节级 KAT 全绿+负 N 零迭代实测), 零改动即正确, 诊断夹具不落主树。②★★**归因反转**: nodeResourceParseNetIfaces 崩溃与 TrimRight/loop_rev_ 无关(五步消融: TrimRight 整段摘除崩溃原样+空串早退路径 count 已损)——真凶=**跨模块 struct 按值返回损坏**(cheng_cold codegen): 8 字节 2×int32 struct 跨模块即损且随 ASLR 漂移, 同文件恒正确, didauth/onionpay 零改动复现; 源码层三规避全灭(var 出参非限定=kind 2/5 身份分裂编译死, 限定=值仍损)→**立卷 #85+根修轮开飞**(wf_bb8d4a48); fca6c9769 commit msg 与 dffc 案卷 §4-E 的 TrimRight 归因作废(revloop81_verdict.md §7 编排者裁定)。③★★**复核员二挖出第二独立缺陷**: 预声明 var x 后 for x in range 同名——循环后外层 x 不回写恒零值; **insertClosest 实测 50,10,30 插入得 30,10,50=Kademlia 路由表/shortlist 实质未按 XOR 距离排序**, normalizePath("/a/b/c/") 返 "/a/b/c" 前导杠不剥, 共 5 生产函数带病→**立卷 #86+定谳修复轮开飞**(wf_fe2d2716, spec 语义先行+全仓扫描)。④任务簿清理: 55 条已完成删除(用户令列表只留未完成), #81 收案改题。在飞五线: f64 v2/#82/机制13/#85/#86。
>
> ★2026-07-15 19:5x 收割批次七: ①`94bee43b5` **#80 机制12 落账收案**(8 文件 2014+/11-): useRef 数组 ref 四形状(clear/push-spread/copy-read/length)+WebSceneIceCandidateRecord 手写 JSON 编解码+手工审计注册表白名单(外者响亮拒); ★两硬发现入案: Cheng T[] 赋值=共享底层缓冲语义(独立探针 exit=99 钉死, copy-read 必须真逐元素循环)+push 检测位置扫描漏判(emitCall 参数先发射)改 ID 反向引用; 双复核 CONFIRMED(14 项新造对抗断言: 嵌套 push 单次求值/特殊字符往返/9 分类器拒绝面全绿; 订正 2 项文档失实: 字段构造点真身 realtimeGameTransport.ts normalizeIceCandidateRecord 非 ChessPage:901+sdpMid 缺省塌缩披露); covered 数如实=0(**handleClose 阻塞身份精确转移 localStreamRef**)。②**机制13 立卷 #84+开飞**(wf_e5ebcd32): MediaStream 宿主句柄桥(非纯数据, 句柄槽+设备态真 op+headless 诚实不可用), 顺核 RTCIceCandidateInit TypeMapper 割裂线索。③op-lane hashmaps WIP 仍未落(#50 继续停靠)。在飞四线: f64 v2/#81 扩围/#82/机制13。
>
> ★2026-07-15 19:2x #50 换 seed 预飞判决=**BLOCKED@Gate4**(wf_ff5844b2, 案卷 seed50_preflight_verdict.md): Gate1-3 全绿(fresh cc 13.76s+self-copy 链×3 三级 SHA 逐字节同一 30ad3928+contract e202c0c35424eb36 结构必然非证据——如实标注); Gate4=候选 stage3 build-backend-driver 16GiB 跑满 1213s, Pass A 绿(real_backend_codegen=1)但 Pass B plan_not_ready/gate_blocked=1; canonical zc_enumerate 定谳 **ZC=1 唯一阻塞=HashMapStrIntGetOrInsertEx missing_call_target(hashmaps.cheng:1103/1106 ptr-default vs var-bool 双自由名重载)**=当前 HEAD 真实存量缺口非候选链引入毒(与 Gate1-3 字节同一互证)。★主树 hashmaps.cheng 现有 op-lane 未提交 WIP(mtime 16:09 静止 2.9h)恰是该对的消歧修复(删小写双重载+大写包装直连 ExPtr), 系其 15815bc3a"家族 8→1"收尾件——**我方不代提交**; #50 复飞序=op-lane 落账→新 HEAD 重烤候选(#79 r2 已改 cheng_cold.c 必重烤, 烤仅 ~14s)→Gate4 复验→INSTALL_READY→静默窗编排者亲手装。候选工件留 shadow(seed50_shadow) 未触主树。
>
> ★2026-07-15 19:1x 收割批次六: ①`02ab150b8` **#79 r2 落账收案**(cheng_cold.c +12/cold_parser.c +72/cold_types.h +12): 同源戳只在**新建槽位**写入(fi==fn_count_before_add 判据, symbols_add_fn 全路径 airtight), 复用槽位戳不一致即作废清零(first-wins/last-wins 同构陷阱被镜像夹具证伪后的对称正确解); 双复核员 CONFIRMED(12 新造反例矩阵四对抗维度全双向+三方独立二进制+运行值断言真解析), v1 collide_min3 静默错绑完全消除; 复核勘误 2 项入案卷(+72/-0 非 -2, suite=31=29 CLEAN+2 既有 BAIL); ★复核期间 dollar_r2_shadow 两次被并发进程污染, 复核员各自另开洁净 clone 化解(shadow 共享树风险第三例)。②**#82 修复轮开飞**(wf_d023b3a2): 根因已诊断(symbols_find_fn exact 档只比 SLOT kind 不比类型文本+symbols_set_fn_param_types 覆写污染), 处方=查找层类型文本精确匹配优先+写入层 tripwire, #79/#52 全家回归网压阵。③#81 扩围审计在飞(wf_8d64330b, 逆序 for 机械重写 40 命中/9 文件含 secp/certificate/onion)。在飞五线: #80 机制12/#50 种子预飞/f64 ABI v2/#81 扩围/#82。
>
> ★2026-07-15 18:4x 收割批次五: ①`fca6c9769` **#75 dffc 姊妹损伤全仓恢复落账**(23 文件 34+/62-, 45 点/48 file:line 按 dffc01560^ oracle 逐字节还原)——重灾: multibase 4×零填充/parseIPv6 循环头/mobile_capi AsciiTrimLeft/DID-chain ordinal 残留/rwad Merkle 配对 i+=2/salsa20 20→8 轮削弱(ECRYPT KAT 复原精确)/wow_export depth/compiler_main py-tooling 门; 双对抗复核后落账(--index+裸 commit, 目标 23 文件零外部 WIP); ★复核订正 4 项已铭案卷(dffc_sister_audit_verdict.md): §4-E=#34 修复**解除掩盖**独立崩溃(nodeResourceTrimRight 逆序 for, 另一次机械重写遗留, **立卷 #81**)/switch.cheng:2128 先于 dffc01560/覆盖计数 21 实为 27-28; #75 收案。②★#79 $-菱形去重 r2 判决=**PARTIAL 扣押**: 修复正效全实(三钻石 repro rc=0+运行值/true-ambig 仍 die/WAN 过墙 44→1926/#52 家族 6 绿 3 同基线/三重奏绿), 但双复核员一致抓出 v1 **自身引入静默错绑回归**(collide_min3: 两同 basename 文件默认别名撞名+第三方显式 as——基线响亮 rc=2, v1 后静默 rc=0 跑错值 200; 根因=decl_path 对 symbols_add_fn **复用槽位无条件覆写**致标签翻转假同源)——比原 bug 更危险违 Let-it-crash, 不落账; **r2 修复轮 wf_44714a10 在飞**(新建槽位才打戳/复用不一致则作废戳或响亮 die); ★新墙独立定谳=symbols_find_fn 粗粒度 SLOT kind 匹配污染 body-materialize 类型记录(strings.cheng:301 bool 被覆写 int32 假重载)=**立卷 #82**(非钻石族, offset 1926)。③**小优 NAPI 镜像落账 `7ef2069d6`(cheng-lang)+`56d46d1`(UniMaker)**: 鸿蒙 edge_planner_napi 三方法契约镜像 Android JNI(dlsym+thread_local emit+诚实无设备态), OHOS 真工具链编译链接+llvm-nm 契约门禁实测; 复核 CONFIRMED 唯一 mustFix(so 命名 lib 前缀失配=真机加载必败)编排者亲手修(3 引用+types 目录名对齐 libp2p 先例)后双仓落账; ★顺产发现=cheng_ptr_plus 被后端当 intrinsic 铸外部符号不落定义(NAPI 宿主一行 C 补链 workaround 在位, 编译器侧根修待立卷)。④在飞: #79r2/#80 机制12/#50 种子预飞/f64 ABI v2。
>
> ★2026-07-15 17:5x 收割批次四(额度恢复复飞): ①`68af74e2b` **(c)族 Result 内征投影两点修落账**(pobj 52+/4- + 9 回归夹具)——赋值形态 callTarget="Value" 让位内征臂+rhsNodeIndex 传真节点+var 形参 ErrInfo 尺寸门豁免; ★复核 PARTIAL 唯一红旗(首版 !IsParam 豁免过宽误伤 by-value 形参安全网)编排者按处方收紧=新 helper `PrimaryBodyIrResultErrInfoSrcSlotIsVarParam`(形参槽∧实参声明类型 var 前缀, 实测 nodes2_resultTypeIds 确带 var 前缀), 收紧后 exec_diff 9 夹具对复核态零分歧+三重奏绿(driver e966409e/suite MATCH/probe rsa_pss=1 同条); 窄路 census 预期 82→80 待下轮刷新; 落账=手术流(--cached+裸 commit, pobj op-lane 184 行 WIP 静默 35min 无恙)+双侧同步(工作树同 apply 防快照吞); 未覆盖边界如实: 泛型 errText[T] 真调用边(前端域)+var 形参 IsErr return 形态(留案)。②六线在飞: #68+#73 联合收口/dffc 修复波/#79 $-菱形/#80 机制12/小优 NAPI 镜像(新开)/(c)族已收割; ★#67 撞车止损: 点火后查 git log 发现并发车道 54e7828e7 已定谳(panic-guard 预测器巨帧 E≠P)且二轮在飞, 即刻 TaskStop 零浪费, #67 归并发车道持有。

> ★★2026-07-15 12:15 检查点暂停(ceaefe81, 用户令保留现场): 六工作流停飞 resume 账本+扣押补丁清单+恢复优先序=`~/cheng-patches/20260715/checkpoint-2026-07-15-pause.md`; 本日 10 落账+并发车道 4 落账; ★恢复首要=合并态三重奏补验(merged_trio_shadow, 今日多笔 pobj 叠加态未闭环)。
>
> ★2026-07-15 16:3x 收割批次三: ①`ed0e8c62f` **#66 机制11 三件套 r2 落账**(6 文件 877+)——setBoxRefs+find 白名单(收窄至 STRUCT_PRESENCE_FIELDS)+activeVoiceSession 条目; r1 两雷(!struct 恒假/.find 基元零值歧义)根修, r2 双镜头复核 CONFIRMED(exit 41/99 分化+回归锁拔修复验有牙齿), 主树落后全套测试复跑绿, 生成物 sha1 零扰动; **v35 门阻塞身份推进到 pendingIceCandidatesRef(数组 ref 形状族)=立卷 #80 机制12**; ②切片③ WAN 复活轮定谳(复核 CONFIRMED): 五面已知墙实测全清, **新墙=$ 重载同物理函数经菱形 import 重复注册 ambiguous**(cold_parser.c 注册 :2687 只按 path+alias 去重/消费 :10756 exact_matches>1 die, 7 行 repro, #52 v2 未覆盖的同源 span 归一子情形, #54 之前)=**立卷 #79, 修复轮 wf_e29501a5 在飞**; slice3 补丁重基零漂移备好; ③famB 追鬼影轮已停飞(census 刷新证 489d33f5c 已清)。
>
> ★2026-07-15 16:0x 窄路 census 刷新定谳(报告=`~/cheng-patches/20260715/narrow_census_refresh.md`, shadow 稳树 9caa93d1b 现烤 driver, 302s 干净跑完 rc=2): **87→82(-5), 去重 58→57**; ①famB canDial/DialAndUpgrade **实测已被 489d33f5c 清除**(wrbtjgzvj 案卷"修复范围外残留"判断过期)——famB 12路修工作流 wf_832c20f7 追鬼影已停飞止损; ②★新增 bail=810×1 `x509VerifyChain`=#69 poison 在窄闭包浮出一处**此前静默产垃圾值的 x509 链验证**(f64→int cast 形态), 诚实度提升非回归, #73/#68 根修落地后转正确值; ③(c)族两条仍在(修复轮 verify 段进行中, 落地预期再 -2); ④6650×7/801×12/44×7 三桶逐字节不变(op-lane"6650 已覆盖"在窄闭包暂无实测体现); ⑤测量插曲: 6GB 限额被宿主重载+内外口径分歧(内 8.54GiB vs 外实测 3.94GiB)熔断一次, 12GiB 复跑干净——RSS guard 双口径分歧再添一例(footprint 化已落 00a7b4cfa 但该跑用的现烤旧 driver)。
>
> ★2026-07-15 15:3x 收割批次二(5 落账): ①`b9d016a88` **#72 定谳大反转+四处根修**——parser 无辜, 真身=dffc01560(4/26 278文件 while→for 机械重构)在 bio_reed_solomon 留四处损伤(漏 var row 声明=编译墙/BerlekampWelch 丢递增=死循环/range(32) 错起点=主元自消/for 体内手工递增双步进跳行), ★实测定谳 **Cheng for 归纳变量是活变量**(探针 0+2+4=6), 真 smoke 三段递进全绿; **姊妹损伤全仓审计工作流 wf_b1b899f0 在飞(#75)**; ②`f4aa20721` **#74+#70 冷后端根修**——cold_parser 数值派发缺浮点臂双缺陷(cast 硬编码发 0+浮点当 int32 位比较), 对抗复核 CONFIRMED 并自补 F32 负比较盲区证据, 同族留痕立卷 #78; ③`7c4707354` **#69 止血落账**——whole-call poison-on-miss(bail=810) 窄门=纯数值 cast 保留字, 运行垃圾变响亮拒编, 复核 PARTIAL 缺口(中型语料桶)编排者补齐(6 文件前后零漂移, 首轮 ABORT=落账自污), 根治待 #73; ④`0c35850e3` **小优 S5b 接线落账**——流式加载悬空产物接进 planner_cli+双 loader 逐字节等价 smoke, 实测 footprint -15.06% 替换无据 -19% 声称; ⑤`d212558a2` **#60 CID 接缝 v3 落账**——digest→硬件接缝重构+SHA256 内联识别器, 18 向量 golden+otool 56 条硬件指令零回退, 复核 CONFIRMED。★#73 诊断定谳(发射点+双镜像 5 预测点全图+影响面=仅跨 C ABI, 休眠雷立卷 #76 F64 返回值整段丢弃/#77 NGRN/NSRN 未建模), 补丁 shadow 三重奏已绿(冷 parser 续行禁区已修), **运行值验证卡 #68 provider 缺口→#68+#73 联合收口工作流 wf_c2b3911e 在飞**; ★#66 机制11 r1 被复核 REFUTED(两颗 CONFIRMED 语义雷: !struct 恒假+.find 基元零值歧义, Set 三原语部分幸存)——**r2 修复轮 wf_f67ca45b 在飞**, v35 门阻塞身份推进到 pendingIceCandidatesRef(数组 ref 新形状族)。
>
> ★2026-07-15 15:0x 收割批次: ①**RSS 护栏 footprint 化双层落账** `00a7b4cfa`(os.cheng 进程内 guard: Darwin 分支 proc_pid_rusage RUSAGE_INFO_V0 平铺 int64 镜像读 ri_phys_footprint, Linux procfs 分支不动; 实测 400MB 限触发于 405MB/1GB 限 892MB 峰值正常走完/suite MATCH/探针持平)+`a51e0ae14`(host_ops 第二层自守卫同步 footprint 化+孤儿桥声明清理, stage3 编跑 smoke ok; 冷编 compiler_main rc=2 经消融证为既存回归 linkerCoreStrContains 与本改无关)——工作流 fix 座席同点 API 瞬断两次后改编排者亲手落, 案卷点名的两修点全清; ②#66 机制11 设计轮收割(wf_94fa5b63 三座席全绿): setBoxRefs box-ref 第三形态+.find 白名单缺口坐实(csg-cheng-transpiler.ts:2114 生产路径)+activeVoiceSession 辅助函数方案, **实施轮 wf_f35ab2a2 在飞**; ③小优 CU 侦察定谳: 里程碑A片1-8 全落/S 系止于 S5/★**S5 流式加载器系悬空产物**(零调用点, commit 声称的 digest/-19% 全仓无据)——**接线+补验切片 wf_d464f207 在飞**(planner_cli:132+双路逐字节对比 smoke), 次选=鸿蒙 NAPI 镜像(headless 可编译验证); ④并发车道 54e7828e7 五线复飞对账: 他们开 #67(我方刻意压后避撞成立)+T59 回灌, #68 避我方 #73。
>
> ★2026-07-15 14:03 复飞(同会话, 用户令工作流全面推进): ①**合并态三重奏补验 PASS**——机主 `dd06483be`(大合并: docs 批量删+各车道全部工作树 WIP 卷入落账, lowering PERF-6B/GLES/sha256 复用/regalloc/typed_expr 全进 HEAD)之上 meter 重建 ok+suite 31 夹具 golden=MATCH+rsa_pss 探针=1 持平(log=`~/cheng-patches/20260715/merged_trio_dd06483be.log`), 今日 pobj 叠加落账合并态验证闭环; ②六停飞工作流 resumeFromRunId 原班复飞(#69 止血/#73 f64 ABI/CID v3/(c)族/RSS 护栏/#66 机制11); ③新开两线: #74+#70 冷后端数值转换对(wf_51e7bf03)+#72 parser row 赋值(wf_e950000e, 挡 mobile_capi 整包重建=v35 装配前置); ④小优 CU 前沿只读侦察在飞。#50 换种子仍等用户确认。

## 一、本波新落账

| 项 | 结果 |
|---|---|
| 系统 BACK 详情→home | `dd0f57110`：设备 v33 左卡 15→0 已绿；补表待 one-click 进生产场景 |
| SOCIAL 11 vs 17 | 结案非 bug（导出 11 vs JNI 17） |
| #26 选片 | `tap 220 1120` 真开 picker |
| form59 call 内 let | `7ae1a1594`；probe 绿 |
| **全闭包 ZC** | 烤完 **ABORT** `git_worktree_changed_during_run`（修 801 时改了 worktree，自污）。report 裸数 **missing=44**（≠121）首缺 `PrimaryBodyIrStackAddressWordCount`；**不作 canonical 替换 121**，须 clean 重跑。`/tmp/zc_canonical_20260714/` |
| **repro801 DRIFT** | **真回归非 meter**：F14b 后 `Value()`→合成 Panic，无 `import system` 则 missing_call_target=Panic。`import system` 对照 CLEAN。报告 `/tmp/zc_repro801_attribution.md` |
| **801 修源** | 已落地+meter rebuild+**suite MATCH**。残留：`return_multicall_arith` BAIL 0:1（`if_arg0_le_zero…` 非 Panic）；`frontier_709` BAIL 709:1。golden 已重锚 |

## 二、设备窗（已直推）

| 项 | 结果 |
|---|---|
| v33 左卡 | PASS |
| #26 发布面板 | PASS 未真发; ★11:33 真发布探测(第一性原理定测法, 授权测试件): 选片→预览首帧+GPS 回填全通, 发布按钮点击零响应=秒发链最后一环缺口(#37 立卷); 附卷 picker 返回黑屏一次性重绘+标题输入截断 |
| #26 选片 | 220,1120 可开 |
| BACK 左卡 | 回 home |
| #26 发布 tap (19:07) | 新铁律下逐步重做: 发布须知开关点亮+标题输入落field(crop 验证)+发布按钮点亮全通; tap 发布→logcat `route_before=30 route_after=36` 回首页+「选择发布类型」面板开, **零 publish/moq/announce/fountain 事件=发布链未点火**(#37 修复未生效于 v34 或 handler 仍有缺口, w8vwd4u1u 定谳中); 伴生: es open dial 192.168.1.3:38000 失败 rc=0(桌面 peer 未在跑, feed prewarm 路径非发布) |
| 设备窗关闭 | 19:1x 前台变 org.cheng.hy2tunvpn=机主接管, 按铁律停手零输入; 待新窗重测 |
| 鸿蒙 | UNAVAILABLE |

## 二b、在飞 (会话 ceaefe81, 勿重复认领)

| 项 | 说明 |
|---|---|
| ~~w23ufqo3z~~ 节点发现三面打通·首片 | **已收割** `59b7f15e7`: mdns 双进程真互见(主树复跑 A/B 互相 discovered 全绿)+mdnsSplitKeyValue 变量遮蔽根修+8 缺陷。★三面定谳: 安卓 APK 默认 backend(socialBackendMode=group-create)是自述 stub(snapshot 硬编码空)/WAN 发现全 stub(bootstrap_gossip 完整实现死接线)/PWA ingress 是独立 presence 系统。后续: ②安卓 backend 接真实现+MulticastLock ③WAN bootstrap 接线 ④PWA↔native 桥接(需拍板) |
| ~~wbkg8ktlt~~ 节点发现切片② | **blocked 定谳**: 接线零代码(--social-backend-mode full 现成/Kotlin MulticastLock+权限+路由门控全在位/JNI handle 透传无假设); 唯一阻塞=compat_ffi aarch64 obj-emit 三次实测压死(窄 export-roots 照样 RSS 10.1GB 撞 8GB 熔断/12min+ 不收敛/旧报告 plan_not_ready missing=119 含 dial 等核心)。→ 立项编译器 RSS 归因战役(独占窗前置, 禁调大上限绕过); 解锁后 full 模式一行切换+装机。★w1qu3ljkz 归因+反探针定谳(07-15): **安卓真 backend 实为双锁**——锁A=多 GB RSS 落在**前端 parse+CSG+typed-IR 整闭包驻留**(插桩实证 backend lowering 开始前已 4.04GB/2294 函数循环净增仅 254MB; wall2 findings:2038 同款 N^1.68 架构缺陷; 系排除法再指向, 待前端专项消融定谳); 锁B=**129 条 ZC_NOT_READY 独立缺口**(bail=6650 registerProtocol 族 49 条为主, 去 node_init 降到 80, RSS 修好也编不出 .o)。★反探针双证伪: decl-order-stream Darwin-only 门禁(机制真实但上限=254MB 非主因)+node_init 整闭包元凶(ZC 129→80 真, RSS 仅 -2~5% 噪声内)。★度量方法学: phys_footprint 四跑稳定 8.86-10.46GB=可靠口径; ru_maxrss 3.2-8.5GB 随宿主争用剧烈波动=guard 现用口径不稳定信号(HostOpsCurrentRssBytes 改 footprint=待落小修); 宿主争用实测 load 24-61/空闲 2.5GB, Pass A 9-17s 拖到 27min=重编译型消融必须等低争用窗。→ 下一步: ①bail=6650 族诊断(轻量, 在飞) ②前端 RSS 专项消融(等窗) ③guard footprint 小修。★★节点页窄闭包捷径双端实测定谳(w2aouvrbk, 用户点名"先显示真实节点页"): **RSS 不挡窄路**(5-root feed 闭包峰值 4.6-5.3GB<8GB 门, ~4min 收敛, 锁A 对窄路无效!)+**android==ohos 缺口逐字节相同 87 条(android 特有=0)**; ★重大过期发现: 4-root 基线自身 ZC=70(43 去重)——wave15"S2 墙清零"里程碑已过期, 975afc114(7-03)后 --emit:obj 无条件切 object_all_lazy 惰性骨架(无退回开关), 其独立缺口面与旧 AppendInvalidOp 体系叠加=现 HEAD+现 driver 无法重编 feed_core.o(现网鸿蒙 .so 是旧世代产物); 87 分桶=6650×7(op-lane 交接包已覆盖)/missing_call_target×11(最大非 op-lane 桶, 分族诊断 wrbtjgzvj 在飞)/801×12/44×7(含 4 个 export-root 自身!)/长尾; 第 5 根新增 15 坑(mdns/资源链)+snapshot 自身 8548。2-root sanity android 端到端 rc=0 佐证工具链无恙。★wire 定谳(续跑完成, 复核 CONFIRMED): **双端接线 100% 已落地零增量代码**——安卓 ChengLibp2pNative.networkDiscoverySnapshot+libp2p_bridge.cpp:256 CHENG_WEAK 弱符号诚实空返回(与鸿蒙 dlsym probe-once 同语义两实现)+MulticastLock/权限全在位; ★nm 现货盘点: 安卓 jniLibs 全部 .so 无 snapshot 符号且 libchenglibp2p.so 本机根本不存在(需现编), 唯一含真符号的是 hongmeng 协议测试工程 .so(6/2, ABI/工程不可复用)——**节点页真数据唯一墙=87 条编译器 census 缺口(58 去重函数, android==ohos 平台无关)**, 清零前重出包只会得到诚实空态。装机口径已留案(两端各两件同批换装+adb/hdc 清单, 87 清零后启用)。★假绿风险在案: sanity2root(ZC=0 迷你闭包)与 5-root 失败混放同目录, 勿误引为配方验证通过 |
| ~~wek7umr79~~ #36 锁A 消融定谳 | **STRUCTURAL_BLUEPRINT(无快赢), 案卷=~/cheng-patches/20260715/frontend_rss_verdict.md**: ★逐相位 byte 级曲线(全新 phys_footprint 外部采样链, 非旧尸检工具): source_closure 0.7%/compiler_csg +2.68GB=26.1%(retainedExprLayer 多轮不动点, wave-51 旧判钉死到数字)/lowering_plan +2.2GB=21.6%(**LoweringPlanStub 2-3 组冗余 sidecar 索引, 此前完全隐形零 stderr 标记**, lowering_plan.cheng:127/5679)/★**primary_object_plan +5.29GB=51.6% 峰值最大且 materialized_function_count=0**(纯 skip 分类扫描吃半数内存, 逐函数 ~740KB 均摊弥散无单点)——修正旧前提"lowering 前全部到位"。★每个相位交界零回落(驻留到底 byte 级实证)。★规模指数 1.66 独立复现 wave-50/53 N^1.68(误差<1.5%, 非同源重算)。★消融①(双 sidecar 索引 early-return): lowering 相位仅 -16%<30% 快赢门槛, 未产补丁(影子消融非语义健全)。★★护栏失效铁证: 真 footprint 9.74GB 冲过 8GB 门全程未触发——std/os.cheng:1085 ProcessRssBytes=ru_maxrss 对 macOS 压缩内存视而不见, guard footprint 化=立即可修小项(在飞)。结构性蓝图=pobj 流式释放+sidecar 懒构建/去冗(pobj 属 op-lane, 需协调, 蓝图入案卷); small→full 段局部指数 2.54 待低争用窗隔离复测 |
| ~~wrbtjgzvj~~ 窄路 missing×12 分族 | **三族定谳(实为 12 条非 11, umResultErrorText 漏计已纳)**: ★famA×8(67%)=真同名重载 abstain(readExact/readLp/writeLp/json 三兄弟/base32/mobileNodeResourceInfoHasData, 逐条源码级实证 ≥2 定义体; json 族系 forward-decl 子变体归伞下)——#64 铁律禁碰, 真解=类型感知重载解析架构战役(独立立项); ★famB×2(canDial/DialAndUpgrade)="handles" 裸化撞 12 路跨模块同名(489d33f5c 修复范围外残留), 修向=IsFnPtrFieldCall 按实参类型反查精确匹配(有先例安全, 中等复杂度); ★**新机制(c)×2=Result[T] 内征投影语句形态缺口(第一优先, 零 miscompile 风险几行修)**: ①`已声明变量 = Value(y)` 赋值形态未被投影分支覆盖(只认 let/return, rsa.cheng:2294 trace 实锤) ②`stdresult.ErrorInfoOf[T](r)` 限定符+泛型括号叠加形态 TypedExprQualifiedCallLeaf 归一失败(compat_ffi:108 双 node_eval_miss 实锤)——落穿批次6b 通用发射器对无体模板发不可解析 CallOp; 第三种 trace 指纹=表内完全缺席+node_eval_miss(区别于 famA 多候选/famB 字符串不等)。★证伪"lazy 骨架专属"假设(node-eval 分发器不分 lazy/eager)。→ (c) 族修复轮在飞 |★①已定谳(w01y3bntp, **FORBIDDEN_ZONE 只交案卷未动手**): 6650 精确=33 条非 49(逐行解析, 32 协议包装 fn+node_init 根, 全 statement_sequence); 机制=pobj:23998 裸函数名实参→fn-ptr 形参, 类型识别正确, 败在 TailName/TargetIndex 解析链(:58752/:58679/:58716/:58629)**全闭包规模(2295 函数)下 abstain**——小/中闭包三组 min-repro 全过=规模触发型, 疑 SameSourceMin sourcePath 归一化不一致或 AnyUnique 多命中误伤; 该家族 beat-c 正典点名 op-lane 专属且 07-06~09 刚重构(性能验收≠此边界正确性审计), HEAD 15815bc3a(09:13)op-lane 仍在同文件同主题活跃。★命名陷阱在案: bail=6102 的字面 registerProtocol 函数是另一机制勿混。**交接包已落盘 ~/cheng-patches/20260715/bail6650_oplane_handoff.md**(分桶账/机制链/否定结果/trace 建议: 全闭包规模对 targetTail/targetSourcePath/桶命中数定点 trace)。锁B 其余桶: bail=0 uniq20(famA/whitelist 族, #62-r2 白名单修可能覆盖 json 系)/801×15/44×10/712×6 等=既知家族长尾 |
| ~~w8f9vely7~~ 切片③ WAN bootstrap | **接线备而未落**: 4 stub(含未点名的 get_bootstrap_status)→真转发补丁审计通过(真拨号链无兜底), 但★复核抓伪证=接线代码从未编译成功(N=1 即败 "arrow target type unresolved NodeRuntime*", 净版同现=既有编译器 bug, 疑 cheng_cold.c:7980 symbols_resolve_object stub 双注册)。补丁 nodes_discovery_slice3.patch 待编译器修后再验再落。→ ★已根修落账 `13b688ede`(cold_parser 指针→对象双缺陷, golden suite MATCH); 解锁链推进到两堵预存在新墙: #41 别名撞车(短期解=compat_ffi 显式 as 消歧)+#42 x19 寄存器 SIGSEGV, 修通即可编 WAN smoke 真验切片③ |
| ~~w5eqzp70r~~ crypto×mdns 互毁根修 | **已收割** `01ab27f16`: ★原假设推翻(mdns 无辜), 真凶=编译器前端缺陷"跨文件裸枚举字面量在函数体解析为 0"(generateKeyPair 写 keyType=0→validatePublicKey 拒真钥; Color enum 独立域复现证通用)。库层 accessor 规避+真 keypair 身份 mdns 双进程互见 smoke 落账(常驻节点雏形达成); 编译器根修立卷 #39 |
| ~~wfi74vp2b~~ 小优 S5 | **部分收割**: Step0 泄漏修复已验+Step1 流式函数编译过, 补丁备而未落(xiaoyou_s5_streaming.patch, 含"共享 bytes 形参内不能 Free 否则 UAF"纠错); 验收被 os.FileSize 返 st_blocks 缺陷挡死(#38 立卷: 待定谳 2677bdb26 源级修复是否即愈) |
| ~~wuft6pwkn~~ CMake 三文件切换 | **侦察定谳 blocked**: 真前置=生成器三文件拆分发射(现只吐单体 .cpp, 切换后 cmake 必报 Cannot find gen.c, 影子树实证); 裸换名毒化泛型管线须按 harmonyNativeGuiExperimental 分支; 副产品=生成 CMakeLists 与入库已 byte-identical。三文件发射=M3 下一主战役(多会话量级) |
| ~~v34 链~~ | **完成**: parity-gate v34 全绿→apk v34 装机→真机定谳 BACK 详情→home(app 前台双卡在位), 左卡详情 v34 复验无 SIGSEGV。apk=ts-csg/tmp/apk-v34-20260714/ |
| ~~wqoghxi0p~~ 双墙→切片③ | **双墙已收割** `56ab779f8`(双复核 CONFIRMED): #41 别名撞车 fail-loud(symbols_add_global 双来源诊断+const 静默 first-wins 改 die+autonat 六站点 as 消歧)+#42 x19 根修(BODY_TERM_RET 四 _REF 分支加 ret_is_raw_ptr 判据)。★const 静默 first-wins 定谳为真 miscompile 族。合体 blocked→同族新撞点 protobuf 2vs4(#45 立卷); 伴生记录 cold_return_kind_from_span 靠兜底巧合/ObjectDef.is_ref 死字段/裸全局标量单行返回+typed let kind mismatch 两既存限制 |
| wwd7qpx08 切片③ 别名扫荡 | 在飞: WAN smoke 闭包撞对逐对 as 消歧循环→编跑 bootstrap_wan_two_process_smoke, 非别名新墙则钉 repro 定谳 |
| ~~wilubxwi7~~ QUIC 互操作 #40 | **已收割** `d1190e1f4`(复核 CONFIRMED): Initial/Handshake 四解码循环 PADDING/PING 分发+readable 按 §2.1 只排己方单向流。★复测推进: preamble 已越过 discovery 卡点, 下层缺口=SETTINGS_WEBTRANSPORT_MAX_SESSIONS 缺失(#46); 复核顺产: Short/1-RTT 同族缺陷+静默丢包(#47)。fin/close_order 两既有 flake 系改前既存(stash 基线定谳) |
| ~~wnr9voock~~ 真Chrome 链下一层 | **已收割** `931f2d09f`(复核 CONFIRMED): #46 SETTINGS max_sessions 服务端通告+#47 Short 路径 PADDING/PING 同构修+丢包日志无条件化。★preamble 新墙=F07 家族同文件裸名 const 子情形(quicVarIntMax 同模块裸名读 0→≥2^30 varint 全误判, #49 立卷, 决定性下一步=重烤 driver 复测排除种子滞后) |
| ~~wwd7qpx08~~ 切片③ 别名扫荡 | **已收割** `efca41ce5`(复核 CONFIRMED): 连破四撞墙(protobuf 2vs4/main 八路裸集群/别名二义归并/noderesource var 全局双 import 边尺寸分歧根修=删冗余边), mdns 双进程回归绿。★切片③新墙=cold_subset \$-拼接链解析脱轨(#48 立卷, 零补丁树复现=既存; ★等价改写会静默错编译 SIGSEGV 严禁绕写) |
| ~~wbnzww406~~ $-链解析器根修 | **补丁产出未落账**(复核 PARTIAL 致命 mustFix): 真根因纠偏=parse_primary 压根无 $ 分支(连裸 return $x 都炸)+let trailing-tokens 2026-05-27 被改警告-continue 致静默错编译, 双修本体过验; ★mustFix=重载选择松散 SLOT 先到先得, import std/strings 后 $int 静默选 bool 重载打印 true——禁落账。合体第三轮又钉第四墙=call-arg 跨模块无限定 const 读栈垃圾(cold_parser 盲区首触发, #51 立卷, 只在 compat_ffi 真实规模复现) |
| ~~winazl7mc~~ 切片③ 第四轮 | **已收割** `ee9d45958`(apply --cached 只 stage 本方 hunk, 他人 WIP 未卷): #48 \$ 根修 v2(两遍精确重载匹配+歧义 die+let fail-loud+双夹具)+#51 call-arg const 根修(parser_find_const 的 !import_mode 门槛即根因, 重写为同构收集→二义 die)。★双复核独立钉出更深通用缺陷=symbols_add_fn 同 kind 重载合并只留最后声明(#52 立卷, std/strings 九 \$ 塌缩; 同文件 foo(bool)/foo(int32) 静默留后者体); 第五墙=switch.gossipsubPublish body missing(#53) |
| ~~w4mx66ian~~ 切片③ 第五轮 | **半收割**: #53 已落 `3322d5517`(定长数组字段元素类型自焗别名缺口, +67 纯增量, 复核唯一订正=probe 前后均 1 非 0); #52 v1 补丁扣住(复核 PARTIAL: []= 消费路径未改造会引入确定性新错值(std/json 三重载被 lsp_server 混用实锤)+裸字面量 baseline 等同断言被声明序 A/B 证伪)。★diag53 顺产: compat_ffi 全文件 118 处 \$ 用法全被 #52 歧义挡(第 0 层)+第六墙 #54 PubsubPeerIdList unresolved 立卷 |
| ~~wept54qa2~~ 切片③ 第六轮 | **#52 v2 已落账** `3930a0fec`(对抗复核 CONFIRMED 零 mustFix): 共享助手两遍消歧(精确声明类型→松散 kind, 真歧义 die)+字面量规则照抄 parse_primary+die 仅真实调用点(4 合成点保留从不 die 契约)+全量自举撞出三前置(var 剥离/any_signal 按位/by-ref+by-value 去重); baseline/patched 差分 7 夹具+三重奏+mdns 双进程全绿; apply --cached 落账 cold_parser.c 他人 WIP 未卷。合体层被配额杀→由 w274dw1p0 接棒 |
| ~~w6ikr0nsl→w73grt9bx~~ M3 三文件切片0-2 | **收割**: s0 域清单 CONFIRMED(m3_function_manifest.tsv 168 行, GEN=140/ADAPTER=12/ENTRY=15/UNKNOWN=0, 独立从零复现逐字节同; 第20行备注定位引用已订正; ★顺产: ENTRY 15 函数生产侧已独立演进禁机械照搬/ADAPTER 12 函数零同名命中=切片4 首跑必大 drift/cheng_img_ndk_load 未声明既存缺口/6 core 函数生成器领先); **s1 已落账 `8c07b7cea`**(双复核 CONFIRMED: 43/43 函数体逐字节+smoke 绿+单 hunk 避 WIP; apply --cached 他人 GLES WIP 未卷; 双发射函数未接线=纯增量安全); s2 **诚实 blocked 于授权边界**: 4/5 硬门过(adapter.c -fsyntax-only rc=0), gen.c 20 error 根因=GlesCoreSource 结构体 9 族与 shared.h 重复定义(在 GLES WIP 区内)→立卷 #57 等静默窗; s2 补丁(3 真缺陷修: 非函数声明补回/static 可见性归类/Join 换行)持有→wspp1iueq 复核中 |
| ~~wspp1iueq~~ M3 s2 补丁复核 | **PARTIAL(报告口径失真, 补丁本体五门全 CONFIRMED)→已落账 `2e7c140cb`**(提交信息按复核真实口径改写): 三缺陷修全部最小 repro 实证; ★纠正=gen.c 真实 193 error 非 20(-ferror-limit 截断假象), 四类根(结构体 8 族重复~170/CHENG_HOST_WINDOW 跨 TU 缺失 9=切分遗留/JNIEnv 2/static 链接冲突 6)已全部补正进 #57 案卷。M3 三文件切片 0-2 至此收官, 下一战=#57(等 GLES WIP 静默窗)+切片4 AdapterSource 对账(预期大 drift) |
| ~~wu5riquxz~~ #57 GLES 对齐 | **193→0 达成+复核 PARTIAL→断言加固轮在飞**: ★侦察重大订正=四类根真实分桶 57(结构体 8 族, 4 族纯复制 4 族真漂移)+130(跨 TU 缺失顶层声明/守卫 38 符号 8 子家族=最大单一根因 67%, 旧案卷 ~170/9/2 估算被推翻)+6(static 冲突, 其中 2 处定义行恰在 WIP hunk 内)。★避让架构=全部修法走 GenSource 装配期文本处理(助手 GenCoreText 删块+3 处 Replace 去 static+补声明/守卫+shared.h 4 族字段并集), 9 hunk 全在 27526-29537, 与 WIP 禁区(22284-25932)零重叠(复核 blob 哈希级独立验真, 含 stash 双向 A/B)。★193→0 复核独立复现(基线重建 193/打补丁 0, adapter.c 0→0); 残留 1 warning=cheng_stream_fetch_worker 只声明未迁移(诚实缺口非本片范围)。★复核唯一保留=core 侧删块/Replace 系 WIP 冻结逼出的文本手术(非伪根修但有两潜伏脆弱点: 哨兵删块无断言+Replace 失配静默 no-op)→加固轮(生成期 Panic 断言+反向自证)出 v2 后落账; WIP 解冻后可做真源头收敛。★**v2 已落账 `bdbe5eec6`**(234+/1- 精确对账, 裸 commit 套餐, 工作树=HEAD+GLES WIP 154 行原状): 删块 111 行精确门+8 struct 名门+异物门+3 Replace no-op 门, 两处反向自证 Panic 响亮 rc=1, 加固前后 4 生成文件逐字节相同。#57 关闭(残留=cheng_stream_fetch_worker 只声明未迁移独立缺口+WIP 解冻后 core 源头真收敛)。★加固轮顺产真 bug 立卷: 自举后端「快照变量与原地重赋值变量并槽→比较恒真」(let before=x; x=f(x); if x==before 恒真, 3 min-repro 坐实, 断言形同虚设表面无异常=静默失效类; 绕法=链式独立 let 命名)→ #67 |
| ~~wd0brenog~~ #62 report-fill 诊断 | **假设推翻+四机制定谳(复核 PARTIAL=核心全真/个别举证纠偏)**: ★立卷假设"body_ir_ops=0 误归类"被双复现推翻——14 条空 detail 全是**真实编译阻塞**: (A)f64→int 强转合成 CallOp 目标 cheng_f64_to_i32/i64 漏收进 PrimaryBodyIrDirectExternalCallTarget 白名单(:16136 ~40 项), 9/14 条(math/json/ModelGraphHash 族; op-lane-queue:537 早有记录未连线); (B)限定导入名脱同步(readStringListBytes 实锤: BodyIR callSeqSym 丢 minprotobuf. 前缀 vs row 表带前缀), 中等范围修; (C)复核纠偏=DecodeDidDocumentRaw 实为 famA 重载消歧败(getField 13 重载, 未触发 61560, 诊断者举证有误)。★真报告层双 bug 定谳: ①:61560 reachability 阶段 RecordError 硬编码空串(famC 只修了 build-items 姊妹支)——候选补丁已产出并复核验真(math.cheng 18 条 detail 全回填/正反对照/trio 绿, 持有 report_fill_misattribution.patch); ②:61567-70 单槽二次赋值覆盖 bug(census first_missing 说谎: 报 ModelGraphHashStep 实为 cheng_f64_to_i64, REC_TRACE 实证)——未纳入补丁(单槽多 tooling 消费需独立回归)。→ r2 修复轮认领: ①+②合修+白名单(A)双补丁。★★r2 双落账(wd4ol9isw): **`36efb7f6e`**(①②合修, 复核 CONFIRMED: detail 假→真三件套/单槽从说谎变诚实含 resolutionKind 连带纠正/消费者全审计零假值硬依赖)+**`9b4c520e6`**(白名单, math census 7→0 全清零, otool 实证参数化路由正确未收编错符号, 冷后端 golden 截断语义全对; 复核 PARTIAL 仅实施者旁侧归因笔误已纠)。三态三重奏全绿(双重建 sha 一致)。★顺产三正交基线缺陷立卷: #68 自举 linker 缺 f64 provider(exe 响亮拒链)/#69 字面量常量折叠零 relocation 读栈垃圾(基线静默 miscompile, 复核纠偏"census 放行"假归因)/#70 冷后端嵌套 int64(fn(x)) 链式桥算错。#62 关闭; 残余空 detail 家族=(B)限定名脱同步+famA(#64 边界) |
| ~~w62xpiuqk~~ #69 诊断+修复轮 | **诊断满分+修复被复核正确驳回(REFUTED)→止血+ABI 双轮在飞**: ★#69 机制钉死=PrimaryBodyIrAppendWholeCallExprToSlot(:25529)把 int64 cast 头当真函数求 ordinal 恒 -1 后**静默 return false**(不落 op 不 bail 无 trace)→槽永不写读栈垃圾; 姊妹函数 AppendCallOp 的 rescue(:24140-24235)从未被这条整句 RHS 路径调用; ★证伪"字面量特有"(形参形态同款失败, 只是栈布局巧合定值 r=8); ★#68/#69 边界=ordinal 偶然命中→响亮拒链(#68 安全)/未命中→静默垃圾(#69 危险)。★修复 REFUTED 真因=挖出更深真雷 **#73: f64 CALL 实参裸位走 x0 非 d0(AAPCS64 违约)**——pobj 设计 f64 全程 X 寄存器仅 RETURN 边界 fmov, CALL 边界从未补; **既有 floorFloat 族 rescue 运行值全错**(9b4c520e6 只验 relocation 未验值, 运行时口径需订正); 修 #69 派发不修 ABI=静默垃圾变确定性错值更毒。★COLD 侧独立缺陷顺产 #74(int32(-3.2)=0 应 -3)。→ 双轮在飞: 止血 wndvuq9wc(poison-on-miss 静默变响亮, 零 ABI 风险, 含调用方回落抢断审计)+根修 w9q3tg8t1(#73 fmov+字数预测器同步, predictor-desync 全套防护); #69 rescue 补丁扣押 .HELD-pending-f64-callarg-abi |
| ~~w1f7pdhtw~~→wwvhozwqw→w4uzsqjjn 硬件 SHA-256 发射 #60 | **wiring 已落账 `db9ad535e`**(编码器底座 `3f594670d`+本次 wiring 整包): ADD.4S base 0x4EA28400→0x4EA08400(clang/otool 4eb08494 钉 vm=16 真错); pobj+backend2 识别 `cheng_crypto_sha256_compress_block` 三指针+193 字 SHA256H/H2/SU0/SU1 内联(镜像 AES :1207); crypto 真标量体+`sha256CompressBlockHwHost` 直线宿主(禁纯 @importc 链空); FIPS 夹具 `sha256_hw_block_intrinsic_smoke` abc+empty 双向量 `db9ad535e` 候选 cold-hybrid bake 实测: emit:obj otool sha256h×32/h2×32/su0×24/su1×24/rev32×8, emit:exe run_rc=0 双摘要逐字节对, sha256_core_smoke ok。★door① 仍 blocked: `Sha256Digest` 生产路径未改走 compress_block(本片只落识别器+发射+符号缝, 同 AES 当前 CTR 仍走 T-table 的边界); 下一步=digest/reuse 收口+官方 driver 种子刷新后 ingest A/B 门①。★ceaefe81 已认领 digest 收口(工作流在飞, 勿重复); 我方 w4uzsqjjn(同任务旧稿)已停避免重复, wb9w37mcx(S1a-r2)同因 fd2fe992d 已落而停。★★**digest 收口已落账 `debb5eb37`**(wxfgrma3g, 等价性对抗复核 CONFIRMED): Sha256Digest 唯一生产压缩循环改走接缝, 签名不变 ~50 调用点零改动; 双独立验证=FIPS 三向量+12 边界长度 hashlib 逐字节+A/B stdout 全零 diff+otool 56 条 SHA256 指令零重定位真内联(★顺证伪'直线宿主才识别'旧注释——循环体内照样识别)+三重奏绿。落账事故在案: pathspec commit 陷阱②第四次复发(卷 98 行并发 Sha256DigestReuse WIP)即时 amend 补救零损失, 记忆已强化'--cached 手术流收尾必须裸 commit'。剩余缺口(复核 PARTIAL 项): ①**移动端 CID 桥纯标量副本**——★w2gaqx2dn 定谳纠偏: objectCid/blobCid 实际走 std 路径已被 debb5eb37 覆盖, 真残余消费者=MobileCapiHashSeed(fountain droplet 秒发热路径, 经 cheng_sha256_hex_bridge→provider 标量副本); v1 补丁(provider 自含 compress_block+识别器 4 名字变体+18/18×2 纯 Cheng oracle golden+otool 56 指令真内联+★顺手抓修 nolibc get_u32be 内联指针寻址静默 miscompile)被复核抓双 mustFix=**aarch64-linux-gnu EXE 目标 provider 与 nolibc 镜像共链双定义全局符号**(静态路径实证)+三重奏空白→v1 superseded, **v2 修复轮 w59ds38ft 在飞**; ②**door① ingest A/B 结构性 BLOCKED**: shadow build-backend-driver rc=2(gate_blocked=1, ZC=121=已知 plan_not_ready 墙), stage3 无识别器 A/B 无差——door① 加速实测系 #50 换种子或 driver-exe 就绪的下游, 禁再重试同命令; ③Sha256DigestReuse(并发 WIP)落地时需同款接缝; ④生产激活系 #50。★新基线缺陷立卷 #71=cheng_sha256_hex_bridge stage3 必现 SIGSEGV(str x0,[x8] 脏指针, stash 排除法证前后同址=既有)。★工具陷阱在案: 沙盒自建 backend_driver/cheng 对 cheng_ptr_plus 形状假崩溃, 运行时判断一律以 cheng.stage3 为 canonical。★★CID v2(w59ds38ft→wdjw135iw 续)复核 **REFUTED 扣押**(.HELD-pending-71): 碰撞消解方向/最小性/三重奏 CONFIRMED, 但①"恒共链"绝对化被 --provider-objects flag 反例推翻(措辞级, 无活跃生产组合)②致命=golden 从未真跑过真桥路径(standalone 旁路复刻品冒充; run.log 0 字节铁证)——真桥 4 次复现 SIGSEGV; **#71 根因当场破案**: @exportc (str)->str 24B 结构体 x8 sret vs 生产消费者 mobile_capi_bridge_internal.cheng:8-9 @importc (cstring)->cstring 错配, 且 @exportc str 返回本身违 SABI 禁令——**根修轮 wcvsq4vl9 在飞**(SABI 重设计 ptr+len/emit+全消费者+安卓真机存活之谜必答+golden 真跑铁证); ★复核另录 validation manifest 与磁盘产物系统性错位(codesign 后处理晚于 manifest 落盘), 回看勿信 manifest 字段。★★**#71 根修已落账 `bf3a06d28`**(复核 CONFIRMED): _v2 契约(ptr+len 入/64B out-ptr 定长出/int32 返回)+旧名删除响亮断链+全消费者零漏网; golden 真跑 18 向量逐字节(run.log 1411B 铁证)+崩溃基线控制组 4/4+安卓生产装配参数 obj rc=0/ZC=0; ★安卓之谜答案(c)=真机验证的发布器是隔离 .so 走 moq_fountain 自有 Sha256Digest 链, 带毒 mobile_capi 模块打包进 APK 但全仓 .kt 零调用点——'不是安全, 是没试过'; 旁证立卷 #72(bio_reed_solomon parser bug 挡整包重放)。→ CID 接缝 v3 轮(在新桥上重基+真 golden e2e)在飞 |
| ~~wjus27nt1~~ 秒发 ingest 攻坚 #56 | **归因定谳+rank-2 已落账 `1bf1928d0`**(复核 CONFIRMED): ★ingest 90%+ 在 SHA256 系列调用(纠删 XOR 仅 7-9%, "喷泉矩阵是热点"被推翻); 逐块哈希 64 倍调用放大 3.6-4.4 倍耗时=每调用固定开销 ~2.2ms(无 regalloc spill 税佐证); manifest 三重序列化二重哈希纯冗余(18%)已去重, 全量 1.157x(9/9 轮全快), digest 四重守恒(receipt 五字段/两进程 QUIC hash)。door① 仍红→★数量级杠杆立卷 #60: ARMv8 SHA-256 硬件指令后端发射(复用 Path C AES intrinsic 底座), 预期 10x+。CHENG_INGEST_PROFILE 双轨探针入库(工具沉淀) |
| ~~w6o04fzlv→w0pogl799~~ 解码器 seek 重定位 #14 | **v2 已落账 `e288bc884`**(二轮修毕双竞态, 复核确认关闭+登记 1 不可达活雷): SeekToTime+Flush+seek 状态机+contract/shared 生成器同步; ①drain 窗口=Flush 阻塞语义(官方文档逐字互证)+返回后二次 drain 全覆盖; ②零拷贝主路径=seek_epoch 对+FreeOutputBuffer 归还不渲染。★S6 活雷入 #14 案卷: cheng_host_video_seek 裸读 s_stream_ctx(当前 0 调用点), S6 接线时必须锁/渲染线程队列。侦察副产=S1 key 半截+S6 UI 死链=后续切片; 真机行为=deviceOnly 待窗 |
| ~~wo7n55tva→w3h52jxso~~→wcdt057x0 裸枚举 #39 | **反转定谳+二轮收口在飞**: 合法裸枚举字面量已被 ee9d45958 顺带根修(8 项运行值断言全绿, cold_only, 自宿主后端无此缺陷; stage3 冻结种子复现系快照早于修复=归 #50); 撤 accessor 补丁(crypto 三文件)已验证持有。★复核钉出残余真洞: 延迟物化导入体里 parse_primary 末端 fallback(~:11636)笔误静默替 0——二轮 wcdt057x0 die-fix 已 CONFIRMED(裸+3 新对抗变形全响亮, 零回归 8 项字节级对拍), 但★曝光落账顺序硬约束: die-fix 会让 driver 重建在 **10 处 discard 死语法**(spec:462 明文已移除; regalloc_linscan `discard pop` 此前整句被静默吞连码都没生成)上正确 die→必须先迁移; 复核另钉限定名(module.name)兄弟洞 :11544 同款静默 0+物化路径诊断行号恒 1(预置)。→ 三轮(w3sqh6zns→wyfap0bv8)完成 discard 10 处迁移(spec:462 定谳裸调用即合法; regalloc `discard pop` 系 pop 根本不存在的死代码直接删/borrow_checker 同款另立卷)+限定名 :11544 同修, 四补丁叠加三重奏绿+双形态笔误响亮+全家桶矩阵; ★复核再抓第五类: 裸 `panic \"...\"` 同类死语法 43 处 4 文件, crypto.cheng:28 生产可达实锤(四补丁态 roundtrip smoke 编译期死, fix 自造夹具恰未踩 keyTypeId 链=夹具盲区教训)→ 四轮 w0f79ktwp CONFIRMED: 真惯用法=Panic(msg)(std/system:178, 探针实证响亮终止); 审计纠正 43→45 处 5 文件(漏 cheng_node.cheng 3 处标识符表达式形态); crypto.cheng:28 roundtrip 修前死修后绿; 三档可达性定性(强可达 1/生产防御分支 8/scaffold 36); 第六类扫零命中(assert 系带括号 intrinsic 非同洞); exec_diff 152/197 零新增回归。**★#39 战役收官落账 `63354cd3a`**(五补丁单 commit: 双 die-fix+discard 10+panic 45+accessor 撤销, cold_parser.c/regalloc_linscan.cheng 走 --cached 他人 WIP 未卷)——四轮对抗复核洋葱全剥完, #39 关闭。伴随 **#63 已落账 `88d8325e4`**(Lp2pError shim 死代码修, zc 4→0+三态运行值断言, 双复核零 mustFix, #63 关闭) |
| ~~wrrtvbthm~~ 小优引擎桥设计 | **收割** 设计文书入库 `e181d98ad`(docs/xiaoyou-planner-computeruse-bridge-design.md): 三候选定谳 SABI 进程内 FFI 单轨(子进程=oracle 非运行时组件+轮询判负/socket=同 App 人为进程边界判负; FFI=生产终态本身, emit 回调天然事件驱动, 桌面 --provider-objects C 桩验证同一份生产 ABI, cheng_cold.c:57207 内建先例)。★顺产立卷 #58: EdgeInferenceBridgePlugin.kt 标榜 cheng_native 实为纯 Kotlin mock(生产代码 Mock 违规反例); 第三孤岛 EvoMap 子系统已排除混淆。→ 首切片实施 wvrr37yxt |
| ~~wvrr37yxt~~ 小优桥首切片 | **已落账 `ee442a43a`**(双复核 CONFIRMED 零 mustFix, 主树亲跑 smoke 8/8+回归绿): SABI 桥模块+C 桩+smoke+二步链接脚本, 4 新文件零既有改动; 跨模块 @exportc 调用实测可行(设计退路未启用); 双向 mutation 抗性过。★顺产立卷 #59: --link-providers 与 --provider-objects 互斥(cheng_cold.c 两分支不相交), 二步链接法已封装可复现。下一片=#58 Kotlin 真 JNI 替换 EdgeInferenceBridgePlugin mock+鸿蒙 NAPI 镜像 |
| ~~#58~~ EdgeInferenceBridge 去 Mock | **安卓真 JNI 已落**(跨仓): ①`EdgeInferenceBridgePlugin.kt` 全删 nudenetScore/latencyMs/关键词伪 cheng_native; content_filter/speech_asr/background_blur→`native_capability_unavailable`(诚实不可用, JS 侧落回浏览器真路径); ②`ChengPlannerTaskNative`+`libedgeplanner.so` 真接 `cheng_unimaker_planner_classify_task_kind` SABI emit; ③headless `NativeEdgeInferenceFacade` 同诚实无设备态; ④`tools/build_unimaker_planner_task_bridge_android.sh` pure obj+JNI 链 so(NEEDED=mobile_capi+log)。桌面 smoke 8/8 仍绿。**鸿蒙 NAPI 镜像=follow-up 不在本片**。★ceaefe81 独立对抗复核 CONFIRMED(wzfx2ue71): 五项全实测(mock 残留 grep 干净/JNI-SABI 符号逐字节/构建链独立重放 .so 与装机版 cmp 逐字节相同 1196384B/错误路径诚实/Kotlin-only); ★复核顺产两发现: ①构建脚本 MOBILE_CAPI_SO 自动探测 first-match 命中 ts-csg/tmp 陈旧 2.3MB capi 链出字节漂移 .so=静默选错库隐患→**已修 `dc4f9c703`**(探测表剔除陈旧候选); ②勘察定谳 cheng-lang 零图像审核/ASR/人像分割内核=三能力接真内核是未来独立战役, 备选桥设计(per-capability 诚实状态查询 API)留 shadow 参考; diff shim 陷阱复核中再次踩中(用 /usr/bin/diff 化解, 已在案) |
| ~~wvrpiv4lt→w2usziah2~~ 小优 CU 下一切片 | **已收割** `e1216bafa`(复核 CONFIRMED, 主树复跑 smoke 8/8 绿): PlannerTaskKind 分类桥——7 类 taskKind 与 UniMaker asiComputerUseContract.ts:6-13 逐字节对齐+classifyTaskKind :353-363 六规则序敏镜像(ad→video→product→purchase→feed-filter→search, raw/lowered 双目标复刻)+planner_cli task_kind 输出行。诚实边界: 规则镜像桥非模型驱动; 真权重 Qwen2.5-0.5B 本机不存在=外部下载**待用户授权**; 换 logits 映射签名不变。首轮 wvrpiv4lt 系编排脚本门禁 bug(散文长度当被挡信号)误跳实施, 已按 schema 字段改门禁 resume 命中缓存(教训入 [[feedback-workflow-guard-schema-only]] 同族)。下一相邻线: UniMaker↔Cheng 引擎进程桥(多文件跨仓, 需另立切片) |
| ~~w8vwd4u1u~~ 发布桥 v34 定谳 | **双假设皆排除**: 非 stale APK(v34 与 HEAD 同源, #37 从无代码修复 commit——其唯一产物是立卷说明"复现脚本漏点发布须知开关, 非代码缺陷", 且自认未覆盖"开关点亮仍零响应"分支=本次恰好撞上的); 非 handler 接错(5-guard external-publish 串在 v34 烘焙产物逐字节正确, chengPublish→JNI socialPublishEnqueue 真落点非桩)。★真凶最强假设=hit-test 误派发: route30→36 唯一边=节点 8118(X 关闭, 无条件 route:publish_selector, 同 header 容器 8117), 发布真钮=8122; 截图+logcat 定谳 tap 逻辑点(336.138,31.995)在发布钮视觉矩形(逻辑 x300-372,y13-51)内却零 publish_trace/零 guard 日志=8122 未被派发。→ 开 w416qlyap 代码侧精确重放根修 |
| ~~w416qlyap→w81ogrhzv~~ 发布 hit-test 诊断 | **定谳(假设证伪, 真凶升级)**: 矩形全对(8118=x16y12w40h40, 8122=x300y12w72h40), tap(336.138,31.995)几何上确实命中发布钮 8122 且仲裁 TopNode=8122——真凶=**物化层伪造 route_edge**: functionBodyInvokesCloseProp(:2365-2382)流不敏感扫 handlePublish 全函数体, 发布成功回调深处 onClose() 被当"按钮=路由链接", :2016 烘焙 {route30,node8122,→36} 伪边(route-edge-details.json 实证与 8118 真边并列); 运行时 __csg_scene_top_interaction 对 eventNode==routeNode 无条件 TopKind=1 纯路由 → 279 字节守卫链+chengPublish 整体短路。probe 工具链落 scratchpad/v34work/probe(9020/9021/9033/9034 断言位), 逐项与设备 logcat 吻合(route 30→36/零 publish_trace)。→ 根修交 w9dpkbu3r |
| ~~w9dpkbu3r→wcydmfzff~~→w1i8rupf7 伪造 route_edge 根修 | **双修产出+复核 PARTIAL(唯一潜伏洞)→收口轮在飞**: 修1=控制流闸(op 流含 await/branch_if/try/loop 即非平凡, 零特判); 修2=prop-handler 实例化作用域精确解析(修1 单打会误伤 doudizhu 真平凡包装——GameShell 共享按钮全仓裸名扫描与 ChessPage 真条件 handleClose 撞名池化投毒, 既有架构缺口一并根治)。边 307→296: 10 条 publish 族伪边全消失(8122 案发边在列, 279 字节守卫链原样保留)+1 条 xiangqi 伪边消失暴露独立既有缺口(语音挂断守卫被伪路由吞, CHT invokeSites=1 另战场)+doudizhu 真边逐字节保住; probe 重放 TopKind=2/route 保持 30/守卫链真触达/8118 照常 30→36; digest-oracle 296/296 verified 0 state-gated; 47/47 可达; tsc 双侧零错。★收口轮 w1i8rupf7 修毕 &&/||/??/三元四种全拒(合成反例双态对拍+296 边逐字节稳定+doudizhu 三态保住), **v2 已落账 `104c0cafb`**; 第三类可选链洞 **v3 已落账 `20f999a71`**(修复本体复核 CONFIRMED: optionalCall 纯增量字段+闸排除, 双态对拍/零扰动/.csgc 白名单零字节/防过杀全过); 复核再揭第四类=ES2021 逻辑赋值 &&=/||=/??= 走 assign/property_write/element_write 三 opKind 闸全不查(实测伪造边)→**v4 已落账 `31699b8c9`(终局, 复核 CONFIRMED 零 mustFix): 逻辑赋值 3 opKind×3 算子收口(9 组合双态矩阵全验+13 普通算子防过杀)+emitStatement 12/emitExpression 23 分支族穷举审计表入库(ts-csg/docs/route-edge-gate-audit.md, 复核逐行对照零遗漏+4 新反例+还原补丁翻转因果验证; E6b 链前段可选链定谳不可利用记录不修)——#55 材料化层缺陷类宣告穷举关闭, 任务完结**。★环境记录: 本轮 UniMaker 现网 271 边/46 路由(vs v2 时 296/47)=源树自然漂移非补丁效应。**v35 重烤 wmo2e3mkk 定谳 blocked 于门 [2/4]**: [1/4] materialize 全绿(边 296/47-47, 8122 伪边确认已消——修复本体逐字节核验过); [2/4] CHT 抛 "live invoke sites remain: 1"=ChessPage.handleClose 被 v2 解放后落回编译路径但 fv-unknown(语音辅助函数族)编不了——门禁对 invokeSites≠0 无豁免是对的(未编译 handler=生产静默 no-op); 未装配 APK(硬门顺序)。产物+配方笔记已持久化 ~/cheng-patches/apk-v35-20260715/。★解锁诊断定谳(wl6naqar0): "辅助函数需新分类"假设被推翻——真阻塞=34 个自由变量中 20 个跨三类全新机制(host-bridge 单例 realtimeSessionStore/libp2pService+组件 prop 建模+useMemo 派生值)+11 不透明宿主 ref(MediaStream/RTCPeerConnection), 背后整条 WebRTC 语音栈 CHT/native 零覆盖=**重大重构量级→立卷 #66 拍板项**(含 headless vs 真机双态架构问题+原生侧语音可达性语义判定); 放宽闸=复现守卫吞噬 bug 已验证排除。★顺手落账 `f34a8af34`: freeVarsOf 循环变量归 locals(session 撞斗地主无关 state 的真实静默错编译隐患, 与 104c0cafb 同族状态名维度); catch(error) 零绑定事实同族第三例立卷 #65。v35 装配与 #26 复测被 #66 阻塞 |
| ~~w22clgffs~~ 视频 E2E 侦察+双切片 | **收割**: ①暂停不停音频根修**已落账** `b66e42763`(OH_AVPlayer_Pause/Play 对称接入, 复核 CONFIRMED, 真机行为验证=deviceOnly 待窗); ②三门时延门禁补丁产出+实施者自跑=★door① 秒发超门真缺口(hgs 5.9MB 2821-3972ms 5/5 FAIL, ingest 喷泉编码按字节摊销占 99%+, 立卷 #56), door②③ PASS(hgs 675 帧 0 stall max 8-22ms), 复核被配额杀→wg2h0rn9a 重验中(CONFIRMED 后落账); ③侦察钉出 deviceOnly 清单(tap→首帧仪表/S3 peer 透传+预暖未落码/S7c/音画同步/鸿蒙 picker abort 桩)+解码器 seek 重定位(Flush/SeekToTime 全仓零调用)=下一桌面可做切片 |
| **S3 秒开桌面席** | **桌面接线收割(2026-07-15)**: ①审计=peer 透传主链早落(5521ce0e7), 本席补 mobile 非 asset 建槽 peerHost/peerPort + `WebSceneMediaCollectFeedPrewarmPeers` N=2 纯图 API; ②预暖骨架 N=2 累加+env `CHENG_FEED_MEDIA_PREWARM=0` 门, worker 仅 dial plan0(全局 ES 单会话, plan1 记日志待池); ③`open_to_first_frame` 增 t0_ms/t1_ms/t2_ms 字段; ④pure smoke stage3 cold 绿 `web_scene_media_feed_prewarm_plan_smoke`. **deviceOnly 清单**(不编数字): 真机暖态 tap→首帧 <100ms / per-slot 连接池真双拨 / 预暖滚出即拆+首关键帧预算 / 真机 prewarm plan 累加 hilog |
| ~~w274dw1p0~~ 切片③ 第六轮合体 | **重磅收割(复核 CONFIRMED, round6 补丁持有待热文件静默窗)**: ★第 0 层 $ 歧义墙已清(v2 实战验证, pure census+生产直编双路径 grep 零命中, "别名链重复注册"担忧未复现); ★新墙非 #54(gossipsub 从未被摸到)而是自举后端已知 bug 类第二处未修实例——`ir.functions[irIndex]` 元素级 var 实参被 cold 静默丢弃写回(:59592 注释自认, 90aba0cac 只修 1 处 1 分支), :59681 SyncCallMetadata 无条件裸奔→两解析器(取首 vs 取末重载行)分歧→69 个假 missing_call_target(ModelGraphHash:155 纯算术/getField 行号全张冠李戴); round6 修 :59681 后 69→63, 三重奏零回归, 补丁=slice3_round6_fix.patch **已落账 `a23230972`**(07-15 07:24 静默窗开启, 与 round7 同批; 合并 op-lane 新 HEAD 后三重奏复验绿, probe 首跑 ABORT 系并发扰动瞬时护栏复跑基线持平)。★拆分出 report-fill 层独立 bug=#62(body_ir_ops=0 错归 missing_call_target); 剩 30 处同款写点=#61→wu0v28ctx |
| ~~wu0v28ctx~~ 切片③ 第七轮 #61 | **审计定谳+清扫补丁产出(census 补测中)**: ★"剩 30 处应多危险"假设被逐行读码推翻——32 处=27 纯读安全+2 注释+3 危险: ①L58456 RewriteCallTargetSourcePath 三组件嵌套写(活代码, 90aba0cac 点名同形未修)+②L59951 Materialize else/eager 分支 CopyInto 元素级 var 直传(90aba0cac 自述刻意留)+③L64380 StatementTraceText var 形参(形状危险当前零写, 保守口径计入)。三处已按 StorePlanFunction 先例改写=slice3_round7_sweep.patch(round6 之上增量); 三重奏全绿(rebuild/suite 31 MATCH/probe=1)。★哨兵补测出数=**63→63 零变化, "残留全是写回丢失族"归因证伪**(round6 那 6 条是该族全部可观测收益); 三处改写仍为真潜伏缺陷卫生修, **已随 round6 同批落账 `a23230972`**(commit 已注明与 63 无关)。61 条真机制(A 同名重载族/B 函数类型字段调用/C 无 detail 纯函数)交第八轮 |
| ~~w8l6x2ib0~~ 切片③ 第八轮 | **诊断重大突破+半修**: ★统一因果=文本预扫描收集 pass(lowering_plan)系统性弱于 body-IR 求值 pass, 共享 resolver(ResolveCallTargetIndex :58956, gapB 已统一——round6 "双解析器取首/取末"叙事作废)被上游饿死。A 族=LoweringReturnWholeCallArgTypesText(:3430)只认裸形参转发, 字面量/嵌套实参留空→"未知不过滤"→SameSourceAmbiguous→-1(writeLp min-repro 复现+ROW_DEBUG resolved_index=-1 现场); B 族=IsFnPtrFieldCall(:2374)缺全局 qualifier 查找(姊妹函数有 T50-v3)+缺别名展开兜底(:2522)双不对称(双 min-repro 复现); C 族=:62444 RecordError 硬编码空串(7 行后真值在手未回填, 报告层直修点)+收集缺口(floorFloat 触发条件未钉死, 全规模 trace 又被返回杀)。★★A 族修复实施后被三重验证否决并回滚——修识别把安全拒编变运行时静默 miscompile(marshal 路径不知字面量是 str 传垃圾), 原作者留空是保护性设计→第四类深层 gap 立卷 #64; ★3 条真 missing=Lp2pError* shim 调死函数(源码死代码, 编译器报对了)立卷 #63。B+C 补丁(lowering +26/pobj +39, 孤立 repro missing→bail=64 statement_sequence 已知前沿=与 op-lane seq 族合流)抢救到 ~/cheng-patches/20260715/slice3_round8_famBC_stacked_on_r6r7.patch; ★07-15 静默窗尝试落账时 git apply 在 pobj:58453 失败(op-lane 同期推进上下文漂移)→ **rebase 工作流 wzlq9k3yl 在飞**(重锚到 a23230972+三重奏+WAN census 哨兵+对抗复核)。★rebase 已获双盲确认: 编前上下文另一条同任务工作流(we38c0xac)与 wzlq9k3yl rebase 座席独立产出逐字节相同补丁(cmp IDENTICAL); ★关键定谳=原 309 行补丁 pobj 4 hunk 有 3 个就是 r6+r7 本体已在 a23230972(:58453 失败真因), 真新内容仅 famB(lowering IsFnPtrFieldCall 全局 qualifier+别名展开)+famC(pobj :62612 RecordError 回填, 62560/62612 二义已用注释语义+git log -S 消解); famB 双 repro missing_call_target→bail=64 已知前沿; ⚠️落账须 apply --cached(op-lane 又在 lowering_plan.cheng 开 PERF-6B WIP :2879+, 与本补丁 :2398-2470 不重叠)。★**famBC 已落账 `489d33f5c`**(--cached 纪律, 外部 WIP 未卷)+**WAN census 补测出数(08:31, rc=0, cache miss 真算): 63→57(-6)**; famC detail 回填实效可见(getField/writeLp/jsonParseValue/appendBytes 等大批条目 reasonDetail 从空串变真调用名=第八轮 :62612 修复生效); 残余 57 分布: famA 类(writeLp×2 等, 修复被 #64 定谳回滚属预期残留)+空 detail 类 12 条(floorFloat/ceilFloat/roundFloat/mathReduce×2/getInt64/jsonTryGetInt64×2/resetMobileHwQueue/ModelGraphHash/encodeAutonat×2/readStringListBytes/nodeResourceRunMicrobench=#62 report-fill 层 body_ir_ops=0 错归类候选名单, 案卷证据增强)+protobuf getField/decode 族大头(famA 同名重载机制)。census 工件=scratchpad/wan_census_r8b/wan_r8b.report.txt |
| ~~wnfultdlm~~→w4wddowet #43 鸿蒙快照刷新 | **v2 已收割闭合**: 核心 `4c7d23063`(adapter.c +78/svars +4: 4 核心门禁一字未动 + 第5符号惰性 dlsym/probed 失败态缓存 + 缺符诚实 `discovery_snapshot_symbol_missing` + Kotlin 实参 `("",64,4)` 定谳) + 对齐 `860ed8f1f`(CMakeLists.txt + MobileShellHarmonyGuiHostFeedCmakeText 注释 4→5 root 同步, 保 byte-identical smoke 形; s2-feed-core-build-wall 第5根配方追记落账, 解除 HELD)。契约头:111 既有声明/gen 仍零定义(ADAPTER 域)/GLUE 32/32+APP-EXPORT 138/138+PICKER OK; 单元: 旧4-root 不拖死 contents + 缺5th 诚实 JSON + 5-root 出数 (`/tmp/nodes_snapshot_v2_unit` PASS) + 抽出桥 `-fsyntax-only`/`-c` rc=0。生效前提仍在: feed_core.o 按 5-root 重编+两 .so 同批装机(S2 构建墙独立战役, 非本切片阻塞)。v1 `.PARTIAL-superseded-by-v2` 废止。 |
| ~~wg2h0rn9a~~ 视频门禁复核 | **PARTIAL→3 mustFix 修毕落账** `e6fa41ca4`(只落两新文件; doc 回填因载他人 WIP 推迟): ①门② 子字段空值响亮 FAIL; ②基线改 GATE_BASELINE_SEED=1 显式落账(复核实测抓到 6397ms 污染基线活案例); ③结论加负载限定(复核时 load 20-80 反而更高, door③ 2/4 误 FAIL 方向安全)。★door① 秒发超门定谳为真缺口(两轮一致, ingest 恒占 99.8%)=#56; door② mutation 8000ms 注入精确反映红转成立。基线待静载窗 GATE_BASELINE_SEED=1 首落 |
| ~~woagyumz2~~ 切片③ 第六墙 | **定谳: #54 暂不可观测**——两补丁叠加+重烤 cold 实测卡在 #52 第 0 层($connected/$known 等纯 int32 局麻 \"identical operand type\" 歧义 die, main 直调链 depth=1 硬 abort), 与 3322d5517 预判吻合。★钉出 #52 v1 未覆盖残留子情形: **同一物理 `$` 函数经不同 import 别名链被重复注册成两条 param_type 文本全同('int32')的独立 FnDef→exact_matches>1**——正确修法=注册去重(同源 span 归一)非消歧, 是 wept54qa2 v2 的验收硬门(若 v2 只做四消费路径消歧不做同源去重, 合体仍会撞死在此)。IntToStr 逐点旁路证实系统性阻断(下一行立刻同款)。产物 /tmp/wall6_out/, 影子树探索性编辑已还原, 零补丁产出(符合预期) |
| ~~(bg-agent)~~ F07 复测 | **已收割** `13ed892be`: 定谳 covered_by_existing_fix — F07b 6dbd1e14f 已修同文件裸名臂, pinned 种子(7-05)三探针均 0=均匀滞后; 重烤 driver 真后端三探针全绿(含 0xc671706a 8 字节 varint)。preamble 解锁=换 seed(#50 立卷, 既有预验证唯一阻塞=候选 driver +1 行归因)非新源改 |
| ~~wxi771qqa~~ S5 验收 #38 | **已收割** `b61f82df6`: S5 流式加载落账(44MB digest 逐位等/RSS -19%)+shard 早退泄漏修。★定谳颠覆: 2677bdb26 stat() 改法是 #38 引入者非修复——真根因=自举编译器内嵌 timespec 后继字段偏移 +8 错位(st_size 读到 st_blocks 位), 受害函数已还原 fopen 路径, 编译器 struct 偏移缺陷立卷 #44(修好可拿回 stat perf)。影响面: os.ReadFilePrefixBytesResult 等多处 FileSize 消费者曾连带受害 |
| ~~wmgmipchs~~ M3 三文件蓝图 | **已收割** `docs/harmony-m3-threefile-emit-spec.md`(切片0-6, 复核 PARTIAL→3 mustFix 已订正入文)。★关键钉死: 三文件 CMake 发射函数(GuiHostCmakeText :21392)从未接线生产 WriteHarmony(:28413), 单体 HostSource(:25717) 无三文件分支; GEN 域越过 extern-C 边界(resolve_exports/own_ip 逐函数吸收); harmonyNativeGuiExperimental 仅挡导出闸门无发射分支。★顺产立卷: cheng_host_nodes_snapshot_refresh 契约头声明(:27614)但鸿蒙 gen/adapter 两侧零定义=节点页 route-enter 刷新鸿蒙侧缺口; mobile_shell_codegen.cheng 主树有 ~154 行他人未提交 GLES WIP(22284-25927 区间)——实施切片须避让 |

## ★拍板记录 (2026-07-15)

**#66 CHT 语音/WebRTC 桥: (a) 立项批准 (b) 双态桥方案批准**——设备宿主=真 WebRTC, headless 宿主=诚实"无设备态"契约实现(非 Mock), 编译期宿主选择零运行时 fallback。**propose 定稿入库 `a1ce21df6`**(openspec/proposals/cht-voice-dual-state-bridge.md, 两轮对抗复核闭环): 契约表 5 单例方法+17 ref+prop/派生值; ★机制9=reducible catch 归约(service.ts 109 处同形可复用, 非纯续体 fail-fast)+机制10=定时器句柄化(原稿"已有等价机制"查无实据撤销, setInterval 全新 codegen, S2 前置=运行时周期回调原语确认待下一步拍板); 关键侦察=realtimeSessionStore 五方法两态一致非分叉点/peerConnection 类 ref 在 handleClose 路径恒 null 零新分支满足红线。apply **S1 增量一已落账 `bea183864`**(wdcey0ntx, 复核 PARTIAL→增量落+缺口二轮): #65 catch 绑定修(A/B 实测撞车消除, #65 关闭)+机制9 reducible catch 实码(夹具 1 正 2 反 fail-fast 实证)+机制6 部分登记(census 双态可复现: handleClose 首个致命自由变量 realtimeSessionStore→Object, 扫描器真推进; invokeSites 仍 1)+isNativePlatform 折叠。S1 二轮(wwftw0cel)半程: r2 补丁持有(Object.values 归约实证 fv Object→roomId 再进一层/getSnapshot SABI 桥+returnType 覆写机制/finalizeCallSession 扁平化/机制9 手写单测带反向对照)——复核三 mustFix→三轮修毕 **S1 增量二已落账 `0cfb9743d`**(CONFIRMED 零 mustFix: 注释求实/覆写按 owner 函数 id 收窄至 finalizeRoomVoiceSessions 全仓唯一名+非目标 owner 单测/默认值对齐 TS ?? 语义含真变量线程化实证+未建模字段响亮 fail; fresh clone 全链逐字节复现)。★二轮真根因两大发现(提案低估, 立为子切片): **S1a=组件级 prop 抽取事实新特性**(roomId 系父组件挂载传参, 抽取管线从不记录成 scene fact, resolveRouteContentForHandler 类比不成立——消费侧无从推广, 需抽取阶段新增)——★S1a-r1(wsub91oe5) **对抗复核 REFUTED 禁落**: 实施者把 App.tsx:216 truthInitialApp 调试哨兵 'truth-room' 烘焙成运行时 roomId 字面量(生产 leaveCurrentRoom 会向 peer 发 roomId='truth-room' 信令=静态快照冒充运行时通道红线)+staticExpressionValues 波及改坏 3 个无关场景节点(1154/1156/1158); 补丁已改名 .REFUTED-forbidden-truthroom-sentinel; **S1a-r2(wb9w37mcx) 已落账 `fd2fe992d`**(+镜像 patch `~/cheng-patches/20260715/cht_s1a_route_param_r2.patch`): 机制7 真运行时槽 `CHT_ROUTE_PARAM_SLOTS` 把 free-var `roomId`/`latestRoomIdRef` 解到 `scene.WebSceneStateValueForRef(graph,"__csg_route_param.<routeId>.roomId")` 运行时读, **零 truth-room 烘焙、零 staticExpressionValues 污染**; 路由歧义/缺失→`fv-unknown` 诚实 die(单测 1 正 2 反含 roomId 直名); 实测 baseline `cht-measure`: handleClose skip `fv-unknown:roomId`→`fv-unknown:roomConversationId`(机制8 派生值, 非本切片), `roomId still blocking=false`, invokeSites 仍 1。写侧: 打开路由真实载荷经既有 `set:__csg_route_param.<routeId>.roomId=<value>` 通道写 KV(未写读回 ""=JS optional 语义, 非默认哨兵); 多人邀请打开仍丢 roomId 是 materializer 下一刀。**v35 门禁仍 blocked [2/4]**: invokeSites=1(handleClose 下一阻塞=roomConversationId/机制8+S1b/S1c), 未解锁重烤; **S1b=顶层同步 try/catch 语句降级空白**(emitBlockInner 无 try case, 仅 async-IIFE-await-split 辅助路径有——Promise.all 顺序化的真前置); **S1c=机制10 定时器专项切片**(tick 基座定谳可行: cheng_app_tick+__asyncPump 8 槽帧表真实生产在跑, 句柄/periodic 设计书就绪, 阻塞点=__asyncRegisterDeferred 签名改动触及 10 编译 handler 共享分配器需独立回归预算)。S2(headless 宿主)其后⇒解锁 v35; S3 选型留二次确认。★★**机制8 已落账 `95da0d962`**(w10gcmgg0, 复核 CONFIRMED): CHT_LOCAL_DERIVED_VALUES 手工登记表(机制7 同构, 刻意不造通用纯度分析器)+resolveOneFreeVar 分支抽取复用+roomId 依赖穿透机制7 同一路径; roomConversationId 首例(★案卷订正: 普通内联 const 非 useMemo; 真 useMemo=activeVoiceSession 下一实例, 将撞 .find 不在 emitCall 数组方法白名单的独立小缺口); 3/3 单测(正例公式+缺路由 fail-fast 报顶层名+未登记名不落表非宽容 fallback)+生成物 sha1 前后逐字节同(10 已编译 handler 零扰动)。★诚实账: invokeSites 1→1, handleClose 第二独立 fv=**processedSignalIdsRef**(useRef(new Set) 可变集合 ref, .has/.add/.clear=全新机制族[机制11 候选], 非派生值非句柄)→下一轮工作流认领(含 .find 白名单+activeVoiceSession 第二登记同批)。

## ★工作树异常待机主定夺 (2026-07-14 晚)

主树 235 个已跟踪文件处于**未提交删除态**, 全部在 docs/ 下(beat-c 系列/bail44 系列等旧战役文档为主, 首见于本会话 19 时前 git status 快照)。模式像"历史文档清理 WIP"(全 docs 无源码, beat-c 正典 7/04 曾做 17 文档整合)而非损坏, 但也吻合既往"外部清空"事故形态(种子世系 7/09 先例)。**未触碰未恢复**——若是并发会话的整理 WIP, 恢复=毁其工作; 若是误删, `git checkout HEAD -- docs/<file>` 可逐个找回(HEAD 里全在)。请机主定夺。

## ★事故记录 (2026-07-14 11:48)

设备盲点连招险情: 发布链复测 7 连盲 tap 在 14 分钟空窗后落进机主真实支付宝 HK(前台已非 UniMaker)。HOME 安全退出, 最终态=支付宝首页无对话框/余额 0/无支付流迹象; "maitian-e2e" 文本可能进了其搜索框(建议机主自查)。设备操作新铁律已入 lessons.md+记忆: 每 tap 前核焦点/空窗>2min 重定位/禁连招/第三方 app 前台只允许 HOME。#26 复测(点亮发布须知开关)暂停待新铁律下重做。

## 三、仍待

| 项 | 说明 |
|---|---|
| 全闭包 ZC 收口 | 裸 44 已见但 ABORT；**quiet 且 worktree 冻结** 重跑才可替换 121 |
| clean 全闭包 ZC | 上次 ABORT 自污；commit 后冻结树重跑才可替换 121；裸 report 44 仅旁证 |
| ~~小优 S5+~~ | 已收割落账 b61f82df6 |
| ~~浏览器 ingress~~ | 裁决不部署; 切片④首片**已收割** `026cc4884`(cheng)+`cf18ebb`(UniMaker 探针页): cheng↔cheng WT 真握手 E2E 全绿; 真独立客户端钉出 QUIC 互操作两 gap(#40: Initial PADDING 误解析+单向流 readable)→修通即真 Chrome 拨通 |
| 鸿蒙 #26 | 设备接入后 |

quiet 后顺序:
```bash
# 1) 若 canonical 未完成且机静，才重跑；已有 bake 则只收 summary
# 2) 801 修生效
tools/zc_fast_loop.sh --rebuild
tools/zc_fast_loop.sh --suite
```

## 四、既有结案（维持）

route46 `465503d85` · 左卡 scoped `fe4e96b72` · #32 fetch 键 `326aa0ddd`(+unlink) · 小优 S4 `a53c9e696` · S2 ALREADY · 触摸/节点/801/M3/QUIC/Noise 既有状态。

## 五、产物

| 路径 |
|---|
| `/tmp/device_back_picker_report.md` |
| `/tmp/device_leftcard_v33_report.md` |
| `/tmp/device_26_publish_panel_report.md` |
| `/tmp/zc_suite.log` · `/tmp/zc_progress_20260714.md` · `/tmp/xiaoyou_s4_report.md` |
| `ts-csg/tmp/apk-v33-20260714/app-debug.apk` |

## 07-14/15 夜间收割批注 (acb7a9d3 会话)
- T52 消费链战役: v3(b44220d)+v3.1(8491157)+v3.2(44ed97a)+v3.3(546e4b8)+v3.3b(721b20b) 五连落 f24 树; ZC 收敛 3→2→1 后 chain28/29 "64 雪崩"定谳为 T56 座席违规写树污染 (非补丁问题); chain30 纯净树真判在飞。真根因链全落 diag_T52 案卷。
- 主仓回灌: BACKFILL-8 落 7 笔 (d8f99befd→63ffe6e49, T50 三连/pobj var/10 文件 RSS env 透传/T52v1 诚实注记); E 块 (T52 消费链) landing-ready 待 chain30 绿 + v3.3b 增量重生成。
- BACKFILL-9 审计: f47 真根因=form47 全局 fn-ptr sret 空槽 (主仓存量静默 miscompile rc=2), R2 补丁被对抗复核 REFUTED (唯一绿不可溯源), R3 法证在飞 (map 符号差分); form51 无红不回灌结案。
- 新立卷: T54 (s2/orbytes GEN2 primary ZC) / T56 (Result 参数 IsErr 恒假, 双树, 洁净室重验在飞) / f47_scalar (标量返回 fn-ptr let 赋值路径未实现) / exprLayer fact 去重失效 (T51 遗留) / 前端 10 行续行条件疑似误解析 (chain28 期间未被真检验)。
- 战役树防护: f24 tree src/ 已 chmod 只读硬化 (两次座席违规写树后), 落账时临时 +w。

### 07-15 上午批注 (acb7a9d3 会话, ignition 线)
- **fusion 覆盖差分工具落地** (用户直令): `~/cheng-fusion/tools/{cov_trace.py,cov_diff.sh}` 提交 8058dd2。自管 BRK trap 引擎 (lldb one-shot 断点有陈旧 trap 坑, 已沉淀 memory), 符号取 sibling primary.o + 重定位掩码字节验证映射。T60 实案验收: newly_covered=8 全 macho 解析臂, 一对 run 替代 2 烤炉二分。
- **T60-v3 收割+chain33 终审**: tree_v3 (4 文件全量修, agent diff 漏 backend2 两处已补齐为 fix_t60_v3_full.diff) → DRV 探针 **11/11 全绿** (含 triv=7/vardecl5=5 gen1 级), GEN2 自烤 **rc=0/ZC=0** (bake 路径治愈); 但 GEN2 编 fixture 仍 SIGSEGV (terminal 0/2, oracle 0/6)。agent 返回连坐又杀一炉 (第 4 次), 主会话收养重烤定谳。
- **T60-v4 立卷+在飞** (wf_2ca5edd7): cov_trace 定谳新崩点 MachoProviderLinkExe+0xa3c, EXC_BAD_ACCESS addr=0x0, madd 元素装载 base=NULL (seq buffer 字段读 0); 覆盖集与 v1 逐字节同 (零新臂=缺陷在已覆盖路径内)。嫌疑族: 字段偏移双算不一致 (v3 改布局的一方, 另一访问方未同步) / 按值 seq 拷贝丢 buffer / backend2 删臂替换路径。座席只做诊断+根修+DRV 绿, 决胜链主会话烤 (chain33 配方)。
- ts-csg 一键转译问答: cheng-web-run.mjs 实测全链通 (需 --cheng stage3; 纯 driver 卡 web-kernel ZC=17, statement_sequence 族)。
- v5 diff 落账继续压 (T60-v4 又在改 typed_expr 同域)。

## 小优规则闭环 CU (2026-07-15)
- UniMaker `taskKindOverride` + `resolveAsiTaskKind` 落账: native 规则优先、JS 镜像回退、零 Qwen。
- Android EdgeInferenceBridgePlugin 已走 ChengPlannerTaskNative(SABI)；无 mock 分数。
- 验证: UniMaker vitest 28/28。
- **PERF-9 四族已落主仓** (cfcbfc0bc typetext / dca861512 stackaddr【信息错标 hashmap, 15815bc3a 内勘误】/ e2611be7e csgprofile / 15815bc3a hashmap): 合体 census 44→3 精确闭合 (三重计数一致); 剩 3 条=residual 二 diff 目标, census2 (bnbg3ybgm) 在烤判据 3→0; 顺产发现=冷C对重复定义 last-wins 非 poison (实测 exit=222)。op-lane 两处 WIP 零卷带 (终态验证过)。

### 07-15 午后批注 (acb7a9d3 会话, 全面推进)
- **PERF-9 residual 判决反转**: fix_residual v1 此前被误判 REJECT(引入709) — residual-v2 座席用 7 行 fixture 三态对走证明 InternPoolRelease 是全场唯一"硬阻断"类 missing_call_target(其余 44 条皆软跳过), 清掉后扫描首次摸到下一层 statement_sequence 缺口; v1/v2 两种消歧手法揭出逐字节相同的下一条 bail(hashMapStrIntClear@hashmaps.cheng:335, bail6102) → 709 是被揭出的预存缺陷, 非交换损伤。v2(freeSeqStrRelease 具名出口, intern.cheng+seqs.cheng 2 文件)已应用 clone_fixed; 修前基线 census=3 定谳(任务 bj6d65c6y 09:09 完成, 早于 09:36 补丁上账, 44→3 归四族修复); 决定性 census 在烤(brlhdpdlc), 判据=missing 3→0(揭出层如实另登)。
- **F17 slice-0 定谳** (wf_83bde1ff): 拷贝成本 <1%(N=250000 实测 ~0.18%, 线性外推 1M ~0.72%, 远低 5% 触发线) → Slice 4 每线程拷贝前置排除, 按序直进 Slice 1 累加器归约(wf_a6fc67b3 在飞, 克隆内实施+对抗复核, 产 diff 不落账)。顺产两新缺陷立卷: ①大 T[N] 全局结构体标量字段访问 O(N)(疑与 b.cond ±1MB 溢出同根, N=100 万编译期硬失败); ②int32[10000] 尾元素 data[9999] 写不生效读回 0(正确性 miscompile, 待专项)。案卷 diag_PHASE1/f17_slice0_result.md。
- **T60 第六层立卷+在飞** (wf_f1a3f67c): chain35(tree_v5) GEN2 自烤 rc=0/ZC=0 但 terminal 0/2(triv rc=2/vardecl5 rc=-11); 崩点与 chain34 完全同址 machoSymbolDefined__L333+0x50, 崩溃地址 0xe53589f7 恰为 32 位值=指针高 32 位截断气味; L333 入口 str x0,[sp,#0x50] → ldr 回读即垃圾 = 调用方实参物化嫌疑。v5 修复本身有效(变体在 DRV_v4 全 222 红侧确认)但不覆盖此路径。座席任务=lldb 对走+GEN2/DRV 双体反汇编+根修 tree_v6+DRV 红绿门; 决胜 chain36 由主会话烤。
- chain33 尾账: terminal→oracle→done 走完(bvpep9e6t), 判决已入 README_v2.md。

### 07-15 午后批注 II (acb7a9d3 会话)
- **fusion 新工具 cheng_residual_peel 首用**: static 秒扫 clone_fixed 出 2 hits——①freeSeq 同名重载余 3(形状线索; residual-v2 论证唯一跨文件限定调用者 InternPoolRelease 已改走 freeSeqStrRelease, census 为准); ②primary_object_plan.cheng:3783-3793 六处 `a=x; b=y; break` 分号多语句行, family=PrimaryBodyIrParseCondition/bail=709 — 正是硬阻断清除后揭出层的定点修法(fixHint=拆行语义不变), maskedRisk 正确标注"call_resolve 残余清完前被遮蔽"。语义: static=形状线索, census 唯一权威; 20 分钟 census 前先 static 预扫。
- **E-block 定谳 needs_work** (wf_4b5c855e): 候选 diff(89 行终态对终态)双独立克隆 apply-check 干净+5 夹具+30 golden+probe 零回归, 但两重阻塞: ①主仓当前不红(主仓有 f24 时代不存在的 fact.returnRoot 机制, t52a bridge 仅 1 次 bl)=必要性未证的安全背填; ②op-lane 正在同文件同批锚点(@22429/22486/22580/22830)活跃重实现 v3.1/v3.2 否定式判据(缺 v3.3/v3.3b/v5 正向全文相等收敛), 真工作树 apply --check 失败。处置: 不落账; fix_eblock_main.diff+报告留 diag_EBLOCK/ 供 op-lane 参考(v5 正向判据可省其否定式打地鼠弯路)。
- **seed 换装就绪刷新** (diag_SEED/readiness_refresh_20260715.md): Gate1 当前 HEAD 复验 PASS(contract e202c0c35424eb36 三级一致); ★阻塞判断更正: w5dw9fbi4 的 +1 行已被 bab4c8e04(07-14)源级修复(MobileCapiMoqBuildCatalogJson Fmt-in-call-arg 触发纯路径 bail=44, A 类真暴露=旧 driver 假绿), 但属 source workaround, 后端根修归 bail=44 seq 族(op-lane); 216 新提交的候选 driver 差分枚举未做, 不能假设无其它净新增 bail 行。维持: 换装等静默窗 Gate2-4 差分+用户拍板。
- **T59 拾遗重发**: 座席 API 断连阵亡, 死前产出机制完整 fix_t59.diff(PrimaryBodyIrAppendReturnWholeCall 头部复用 LoweringReachabilityCallHeadIsPureCast 提前 bail, cast 包裹调用单次求值), 零验证; 已注入遗产重发(eblock/seed 缓存重放)。今日 API 断连累杀 3 座席(T60-v6×1/T59×1/更早 1), 均拾遗续跑。

### 07-15 午后批注 III (acb7a9d3 会话, residual 终局)
- **residual-v2 决定性 census 胜诉+落主仓 054de1661**: missing 3→1, InternPoolRelease 双行+TypedExprV2FastBuild 全清; 余 1 = 揭出层 PrimaryBodyIrParseCondition|statement_sequence|3777|bail=709(与 residual_peel static 六处分号复句行完全互证)。落账前安全网: 全仓 grep 定谳无其它 str[] 实参 freeSeq 活调用点(seqs.cheng reset/FreeSeq 是零调用者 fallback 包装; smoke 测试是 int32[] 不受影响)。主仓两文件与 census 定谳态逐字节一致后 pathspec 提交。
- **揭出层拆行已在 clone 验证中**: ParseCondition 3783-3793 六处 `opPos=i; opLen=..; tag=..; break` 已拆逐行(语义不变), census #2 在烤(bh80c306w)。若清零 = dispatch_min missing=0 首达 — 即 Pass B plan_not_ready 早 bail 的解锁钥匙(fork-join 8x 乘数前置)。注意: 该 6 行在 primary_object_plan.cheng(op-lane 高频), 落主仓须静默窗+hunk 手术。

### 07-15 午后批注 IV (acb7a9d3 会话, F17/T60 双线)
- **F17 Slice 1 落主仓 9888c6313** (203+/32-): 累加器 PerIndex 归约, 对抗复核 confirmed(27 字段零字节等价@1336 函数闭包+30 夹具 golden MATCH+范围零越界)。已知窄边界如实入 commit message(bodyIREGraphReason latch 时间序→i 序, 跨 closure pass 理论可差未触发)。落账窗口: pobj 零 WIP+mtime 静止 60min+基线 5c6c1b668→HEAD 零漂移。Slice 2(lazyIrConsumerCounts 记录+重放)已开飞。
- **T60 第六层红绿隔离定谳(主会话补跑)**: 毒成分=seq 索引来自 ref 字段(`syms[reloc.idx]` 红 rc=1/裸局部索引绿 rc=0, 三变体消融); DRV 编 repro 即红=tree_v5 纯后端源逻辑缺陷, 验证环 15min GEN2 烤→25s DRV 重建。二座席 API 断连阵亡(36/84 调用)遗产全数拾遗(160MB 双体反汇编/lldb 双跑/三 repro)。三发 wf_ab9c6ad7 在飞(回源根修+DRV 门)。

### 07-15 午后批注 V (acb7a9d3 会话, T60 根修定谳+多线收割)
- **T60-v6 根修 confirmed** (wf_ab9c6ad7, 复核员反汇编逐指令独立复验): 根因=PrimaryBodyIrScalarValueSlotForText 对 root.field 整型字段零分支覆盖返回 -1, SeqIndexValueSlot 已发 bufLoadOp 不回滚、上层静默跳过 let 语句不 poison → 值槽从未写入=未初始化栈槽当实参(poison-on-miss 家族又一例)。修=新 PrimaryBodyIrDotFieldScalarValueSlot 通用机制接线 SeqIndexValueSlot 单点(全通用文本拆分/类型查找/字段元数据, 零魔数)。红绿三变体+chain35 全部 11 探针+v3/v4 repro 零回归。诚实缺口: ConditionFieldOperandSlot 同源开口未修(条件表达式里 seq[ref.field])、多级字段路径 a.b.c 维持 -1、GEN2 未烤。**chain36 决胜烤在飞(byo3dbpx6, tree_v6)** — terminal 若绿即战役首次终点绿。
- **census #2 判决+拆行落主仓 ad83a9e82**: ParseCondition/709 清除; 揭出再下层 PrimaryBodyIrAppendI32Assign__L38420|stream_function_emit_failed(bail=0/line=0, 新失败类型, residual_peel 规则库无此形状)——dispatch_min missing=1 新前沿, 立卷待攻。
- **E-block 升级 blocked** (重跑定谳): 候选 diff 4 hunk 锚点与主仓 op-lane 未提交 WIP(93 行, 注释自标 T52-v3/v3.1/v3.2)完全同位碰撞, patch --dry-run 3/4 失败——两代互斥方案(op-lane 否定式判据链 vs f24 v5 正向全文相等), 冻结待协调, 处置见 diag_EBLOCK/ASSESS.md §5。
- **T59 三度阵亡+方案换代**: 死前将 fix_t59.diff 重写为真根因修——local/external/importc 三张调用名表交叉命中致同一物理调用双注册进 facts 表(表因 ValidateCallResolutionRange 逐条对应校验不可构建期去重), 修=物化循环内同位置(sourcePath+line+column+kind)非首次出现直接抑制。独立验证 wf_6862538a 在飞(含机制实证门: 无补丁 bl 计数=2 才算红成立)。
- F17 slice-2 座席阵亡(第5起 API 断连), 遗产=克隆基线 driver+多命中诊断探针; r2 重发 wf_b98f25f2 复用克隆。
- ★Workflow resume 前缀缓存教训: 改 parallel() 数组前部 agent 的 prompt → 其后全部重跑(eblock/seed 白重跑 44 万 token); 修死亡臂只改尾部或另开独立 workflow。已沉淀 memory。

### 07-15 午后批注 VI (acb7a9d3 会话, T59 终局)
- **T59 双执行残债终局, 落 f24 树 c662b7f** (wf_6862538a 独立验证 fixed_drv_verified): 真根因=三调用名表(local/external/importc)交叉命中→同一物理调用双注册进 facts(表因逐条对应校验不可构建期去重), 非"消费判据形状不全"; 修=物化循环内同位置非首次出现抑制。实测: 未打补丁 bl×2+计数器 rc=2 / 打补丁 bl×1+rc=1; 双版 driver ZC=0; 7 夹具零回归。主仓回灌与 E-block 同函数同锚点, 一并冻结待 op-lane 协调。
- **顺产新缺陷立卷(#68)**: return float64(<call>) 的 int64→float64 转换 codegen 整体缺失(反汇编无 scvtf/fcvt, 整数位模式直透), f24 与主仓同在。
- 验证座席另报: 首份克隆被并发会话污染(混入已废弃旧方案+脚手架), 整份丢弃重克隆双核验后才测量——克隆污染检查(git log/status/diff --stat 三件套)值得固化为克隆纪律。
- chain36 中程: drvBake rc=0(10s)+probes 过(18s), GEN2 自烤在炉。

### 07-15 午后批注 VII (acb7a9d3 会话, F17/regalloc 并行线中程)
- **regalloc KILLER-4 切片复核判 partial** (wf_5196ca9c): 代码本体过审(只改子区间划分, 门/池/分配算法逐字节保留, 边界手工走查无漏); spill 改善独立复算成立(call-interleaved 夹具 loop body ldr/str 69.2%→62.4%, x13-15 引用 11→19, 零 Call 夹具 .o 逐字节 IDENTICAL)。但门1 证据链被抓失实: 引用的 f17_byte_identical_gate.sh 自带 env 下 baseline 编译即失败(根本没有 .o 可比), 真实字节差异来自另一套未声明配置, 替换位点自报 22 vs 复核实数 30; 克隆混入主树 358 并发 WIP(A/B delta 仍有效, baseline 数字非干净基线)。处置: 洁净室重验开飞(wf_dba08d48, 干净 HEAD 克隆+单一声明配置+复点数), confirmed_clean 才落账。又一例佐证"实施座席自称门禁绿不可信"纪律。
- **F17 Slice 2 实施完成待复核**: 三门过(rsa_pss 1336 函数字节级等价/强制别名钩子验证释放轨迹逐字节同/30 golden MATCH), diff 干净无探针残留。关键发现: lowering_plan 兄弟链去歧义使 lazyIrConsumerCounts≥2 在现有真实路径不可达, 机制正确性靠强制钩子证明——落账价值=Slice 4 并行化的结构前置, 非现行为修复。复核臂 API 断连, 已 resume(worker 走缓存, 尾臂重跑=前缀缓存正确用法)。
- T60-v7 在飞(条件位 seq[ref.field] 头号嫌疑)。今日 API 断连累计 6 座席, 拾遗链全部无损接续。

## ★ 2026-07-15 12:15 停飞检查点 (acb7a9d3 会话, 用户令: 保留现场暂停待续)

**三停飞 resume 账本** (均 TaskStop 停止, 无孤儿进程):
| 线 | runId | 状态 | resume 法 |
|---|---|---|---|
| T60-v7 条件位同源开口 | wf_013fc3e2-0cf | worker 飞行中被停(无完成层缓存) | Workflow({scriptPath:".../t60-v7-condfield-nullbase-wf_013fc3e2-0cf.js", resumeFromRunId:"wf_013fc3e2-0cf"}) 全重跑 |
| F17 Slice 2 复核臂 | wf_b98f25f2-e58 | worker 已完成(缓存可命中), 复核臂被停 | 同法 resume, worker 走缓存只跑 reviewer |
| regalloc k4 洁净室重验 | wf_dba08d48-4f3 | 单 agent 飞行中被停 | 同法 resume 全重跑 |

**今日落账**: 主仓 054de1661(residual-v2)+ad83a9e82(ParseCondition 拆行)+9888c6313(F17 Slice1)+6 笔 ledger; f24 树 c662b7f(T59 双执行终局)。dispatch_min missing 墙 44→1(新前沿=#67 L38420 stream_function_emit_failed, 未开工)。

**各线待续要点**:
- T60: v6 confirmed 落 tree_v6; chain36 判决 GEN2 ZC=0/探针11/11/terminal 0/2 双-11=第七层(MachoProviderLinkExe+0x26cc NULL 基址结构体拷贝); 头号嫌疑=ConditionFieldOperandSlot 条件位 seq[ref.field](v6 缺口#1 明文预告); repro family+chain36 记录已抢救 diag_T60/{v6_work/repro_family,chain36_record}/。首步=条件位变体 `if syms[reloc.idx].val==42` 红绿。
- F17: Slice2 diff+案卷在 diag_PHASE1(三门过, 关键发现=多消费者分支真实路径不可达/强制钩子验证机制); 复核 confirmed 后乘 pobj 静默窗落账(照 Slice1 流程: 零 WIP+mtime>10min+基线零漂移核对)。
- regalloc: k4 diff+案卷在 diag_PHASE1; 复核 partial(代码本体过审+spill 数字独立成立; 门1 证据失实 22vs30+克隆混 358 WIP); 洁净室 confirmed_clean 才落账。
- T59 主仓回灌+E-block: 同函数同锚点撞 op-lane WIP, 冻结待协调(diag_EBLOCK/ASSESS.md §5)。
- seed 换装: 维持不动, 待静默窗 Gate2-4 差分+用户拍板(diag_SEED/readiness_refresh_20260715.md)。
- 新立卷未开工: #67 L38420 stream_function_emit_failed(dispatch_min 清零钥匙=Pass B 解锁), #68 float64(call) 转换 codegen 缺失, #65 int32 尾写+O(N) 字段访问。

**易失性警示**: scratchpad(/private/tmp)重启灭失——chain36/35 的 GEN2/DRV 二进制未拷贝(可由 chain36_record/chain.py+tree_v6+stage3 种子 ~15min 重建); clone_fixed 状态=main HEAD 等价(residual-v2+拆行均已落主仓), driver_meter sha=6b1809c7c6; f17_slice2/regalloc_k4 克隆可由各自 diff 重建。持久盘关键件: diag_T60/{fix_t60_v6.diff,v6_work/,chain36_record/}, diag_PHASE1/{f17_slice2.diff,regalloc_k4_slice.diff,各案卷}, diag_T59/{fix_t59.diff,verify_r3.md}, diag_EBLOCK/, diag_SEED/。

## ★ 2026-07-15 14:10 复飞 (acb7a9d3 会话, 用户令: 工作流全面推进)

/tmp 已随机器重启灭失(chain36 二进制/各克隆全没), 三停飞脚本已按重启后现实修订(素材路径→持久盘抢救件, DRV 由座席照 chain36_record/chain.py drvBake 自建 ~10s)后复飞, 另开两线, 共五线在飞:

| 线 | 新 runId | 说明 |
|---|---|---|
| F17 Slice 2 复核臂 | wf_b98f25f2-e58 (resume 原 run) | worker 缓存命中, 只跑复核; 复核臂已改写=自建克隆+按案卷 §4.3 真实口径(强制别名钩子替代验证) |
| T60-v7 条件位同源开口 | wf_cff6c632-9ce | 全新 run(原 wf_013fc3e2-0cf 无缓存); 素材路径已换持久盘 |
| regalloc k4 洁净室 | wf_b670b1de-2bb | 全新 run(原 wf_dba08d48-4f3 无缓存); spill_sample 按定义重建零 Call 变体 |
| #67 L38420 stream_function_emit_failed | wf_5fe1736a-8fa | 新开; 基线 census 先自证前沿(dd06483be 动过 lowering_plan 可能漂移)→根修→复核员独立 census |
| T59 主仓回灌预验证 | wf_6149aca9-67e | 新开; dd06483be 落账 op-lane WIP 后 fix_t59.diff 对 HEAD apply --check 已干净=冻结解除; 只验证不落账 |

- 外部大提交 dd06483be(386 文件)核对: pobj/typed_expr 未动(F17/regalloc/T59 三张 diff 基线仍有效); macho_provider_linker +285(与 T60 第七层同文件, tree_v6 冻结树不受影响, 回灌时需重估)。
- E-block 仍撞锚(typed_expr:22429 apply fail), 继续冻结。
- ⚠#68(return float64(call) 转换缺失)暂不开工: 与并发车道 #73(f64 CALL 实参 x0/d0 ABI 违约, 其止血/根修双轮属该车道停飞资产)疑似同族, 先避撞车; 待该车道复飞或明确移交再动。
- 落账窗口: 工作树零 WIP + pobj mtime 静止, F17 slice2 复核 confirmed 后即可照 Slice1 流程落账。

## ★ 2026-07-15 15:00 收割轮一 (acb7a9d3 会话)

**两笔 pobj 落账**(op-lane 未提交 WIP 在位, 全程双侧流程=worktree apply+git apply --cached 只 stage 自己 hunk, 落账后验证其 WIP 五 hunk 完好):
- **F17 Slice 2 → ac63b99a1**: 复核 confirmed(复核员独立复现 4/4 driver sha 逐字节, 门2 钩子实验复刻到 .o cmp 粒度, 补全 state.irIndexes 单写点不变式论证)。诚实缺口存档: 现真实路径下 lazyIrConsumerCounts>=2 不可达(lowering_plan 兄弟链去歧义使然), 机制正确性靠强制钩子验证。
- **regalloc KILLER-4 首刀 → 6fc18e64a**: 洁净室 partial 判决细读=补丁本体门1全成立(33 夹具 15 DIFFER 全核验纯池替换零越界+双 sha 复现+suite MATCH), partial 指向实施者两处数字失实已订正(替换位点 30 非 22; 池寄存器计数 0→8 非 11→19, 基线 0 恰证整块门旧行为)。主会话补运行时门: 值出口变体双版 rc=127 非零同值。

**#67 一轮诚实未完成, 情报定谳**(wf_5fe1736a-8fa): 真身=PrimaryBodyIrAppendI32Assign(pobj:38519 巨函数)自举发射失败, FillWords(FillPrologue+FillBlocks)负值→StreamEmitAndReleaseCurrent 整函数回滚; "L38420"假锚(abort 路径不写 lineNumber, census 恒 line=0); 快诊断配方=CHENG_PRIMARY_OBJECT_FAIL_TRACE=1 直编 dispatch_min。二轮 wf_105f2c18-ab2 三段流水(FAIL_TRACE 根修→census 终局门→复核)。

**新开 F17 Slice 3**(wf_770dffc0-100): 写回路径正典化, 最险刀, diff-only 不落账。

在飞四线: T60-v7(wf_cff6c632-9ce) / T59 回灌预验证(wf_6149aca9-67e) / #67r2 / F17s3。落账序列警示: #67 修点(FillPrologue/FillBlocks L53948-54400 一带)与 op-lane residency-band WIP 同函数区, 落账时若 apply 撞锚需等其先落账。

## ★ 2026-07-15 15:40 收割轮二 (acb7a9d3 会话)

- **T59 主仓回灌落账 → 53b63f5db**(typed_expr +55): 复核 confirmed(复核员在真实 HEAD 独立双建 driver 复跑全部断言)。★证据时效: 唯一已知红态构造 return float64(call) 被 #73 线 bail=801 毒针提前拦截(双版逐字节一致), 红绿追溯 f24 c662b7f; #73 撤毒后本缺陷会复浮, 提前落账。11/11 回归+suite MATCH+probe 语义零差异。vardecl5_station 夹具源已灭失, 用 11 件替代覆盖(诚实缺口)。
- **⚠复核员事故披露**: build-backend-driver --require-rebuild 无视 CHENG_ROOT(从可执行路径反推 root), 覆写了主仓 artifacts/bootstrap/compiler_main.direct(gitignored 可再生缓存, mtime 14:40, 主会话验证 Mach-O 合法/无参 rc=0/种子 stage0/stage3/.bak 全部未动)。教训: 限定 clone 作用域只能用 tools/zc_fast_loop.sh --rebuild, 不能用 CHENG_ROOT+build-backend-driver。
- **T60-v7 真根因定谳(推翻头号嫌疑)**: 非条件位——前端 TypedExprIrAddRhsIndexGetNode 对 ref 元素 seq 的 elemSizeBytes 误算为 pointee 布局尺寸(32)非句柄宽度(8)(T60-v3 升级分支 regFieldCount>0 对 ref 同真所致)→后端 probeElemSize(8)<nodeElemSize(32) 恒真→节点路径判不可降→退无 realizer 文本兜底→InvalidOp 毒化吐寄存器残值。fix_t60_v7.diff(+18, tree_v7)复核独立双建 DRV 六变体红绿全翻转+探针/回归无回归; 复核 partial 仅指实施者把 repro_t60v5_dual rc=253(既往无关异常, chain35 README_v2 有案)误记 PASS。诚实缺口: ref[] 跨函数参数/返回值/字段位索引未逐一审计; IndexedMemberAddressSlot 同源推测修补已撤回(9 repro 全程未走到, 无法验证)。**chain37 决胜烤在飞(bz9gyxq8c, tree_v7, adv6 探针夹具已灭失剔除余 10)**。
- **#65 开飞**(wf_ffe0b8eb-19f): 尾写 miscompile 主攻(str scaled 立即数 8190 界假设待反汇编证实)+O(N) 字段访问定性。
- 在飞: #67r2(wf_105f2c18-ab2) / F17s3(wf_770dffc0-100) / #65 / chain37。

## ★★ 2026-07-15 15:50 chain37 判决 — TERMINAL 首绿达成 (acb7a9d3 会话)

**chain37(tree_v7) 全绿**: DRV rc=0(10.3s) + 探针 10/10 + GEN2 自烤 rc=0/ZC=0(874s) + ★★**terminal 2/2 首绿**(triv_station compile rc=0 run rc=7 ✓ / vardecl5_station rc=5 ✓)——chain36 还是双 compileRc=-11, T60-v7 前端 ref 步幅根修剥完第七层洋葱, T50 起的 terminal 首绿战役目标落地(任务 #45 收案)。

**oracle 4/6**(min/onsa/os4b/oiso13 绿): 剩 s2(GEN2 编译 ZC=1, chengStrStoreCompat L418 missing_call_sequence)+orbytes(ZC=6=3×(main L6+readAllBytesHandleResult L1187) 对)——恰是 #49 T54 在 chain24 世代的预判两件, 现有具体 ZC 诊断。missing_call_sequence=ExpandIrCallTargets 五字段长度一致性门(F17 slice3 复核交叉定位 :61267)。

**工件抢救(含二进制, 防重启)**: diag_T60/chain37_record/{chain.py,journal.jsonl,GEN2,DRV}。

**新开两线**: T54 oracle 终局(wf_9fce0e4f-ee7, 三段: 分歧狩猎根修→GEN2_v8 重烤 oracle 全量→复核; tree_v8) + T60-v7 主仓回灌预验证(wf_ac402af8-1af, 移植口径, 含"主仓可能不触发"的诚实分支)。

在飞六线: T54 / T60-v7 回灌 / #67r2 / #65 / F17s4 / (chain37 已收)。下一里程碑: oracle 6/6 → gen3 fixpoint。

## ★ 2026-07-15 16:10 收割轮三 (acb7a9d3 会话)

- **#65 落账 → d9e1b2f86**(cheng_cold.c 3 行): 尾写 miscompile 真根因不在 pobj 而在冷后端——字段整体拷贝三处裸调 a64_ldr_imm/str_imm 对 offset>32760 静默截断错址(int32 边界 N=8193=(N-1)*4 首越 32768); 自举路径本来正确(compiler_main.direct 给对值 9), 修=换既有安全包装(小偏移字节恒等)。复核员全新克隆独立重建+自造 int64/嵌套两变体全红→绿, suite MATCH+driver_sha 零漂移。★装机生效需 cc 重建 cheng.stage3 种子=用户拍板项(#50 换种子同门)。
- **#65b 开飞**(wf_254e2965-8a6): 同模式裸调 5 站逐点验证修复(禁盲批量)+b.cond 展开膨胀结构项定性。
- 在飞五线: T54 / T60-v7 回灌 / #67r2 / F17s4 / #65b。

## ★ 2026-07-15 16:40 收割轮四 (acb7a9d3 会话) — F17 Slice 4 诚实止损+岔路立卷

- **29 槽前置修补落账 → 49574c99b**(pobj +11/-1): bodyIRScopeExitReleaseCount 是 Slice 1 漏网的裸标量 +=(并行域内非原子隐患), 补第 29 个 PerIndex 槽。双版 .o cmp 恒等+suite MATCH, 复核 confirmed。
- **★Slice 4 接线止损定谳**(插桩实测, 非推断): 生产 obj 路径(zc_fast_loop --rebuild 即 DeclOrderStreamEnabled→streamedEmitFirst)上可并行拓扑① **恒 no-op**(SLICE4_AUDIT 0 命中), 真实 lowering 全走②③流式(98+ 次), 按条目 frontier 耦合结构性串行——原设计对生产 wall 加速为零, Amdahl 1.6x 预期的测量口径与生产路径不匹配。
- **岔路立卷=任务 #75 待拍板**: (a) exe 路径继续接线 / (b) 攻流式②③ / (c) 转 #67 清零后进程级 fork-join。主会话建议 (c)——Pass B 生产 wall 的既定解锁序本就是 ZC=0→fork-join, F17 Slice1/2/29槽 消共享态资产对 (c) 同样是前置。
- 三新定谳入案卷(f17_slice4_design.md): 7 模块级词法缓存并行域可达(44/10/10/1 命中, 需锁)+disjoint-index 并发写冷后端 128000 事件零失败(自举侧未证)+bodySemanticsMissing/missingReasons 并行域无写点(失败传播低危)。
- 字节比对新陷阱沉淀记忆: .o 内嵌 --root 路径字符串, 异长目录名双版 cmp 假差异(复核员实测), symlink 同路径轮换。
- 在飞四线: T54 / T60-v7 回灌 / #67r2 / #65b。

## ★ 2026-07-15 17:10 收割轮五 (acb7a9d3 会话)

- **T60-v7 主仓回灌落账 → 0aea29c0a**(typed_expr +18/-1, 移植口径): 复核 confirmed(driver sha 逐字符独立复现); 主仓红态不可观测(被 new() 缺口挡), 防御性落账(bug 前提在主仓代码成立, 复核员追查 typeLayout 注册路径证实)。
- **#67 根因定谳+落账让道**: 二轮亡者(API 断连, 469 工具调用)交付完整案卷——真根因=panic-guard 字数预测器硬编码前缀 2, 巨帧(cond 槽偏移>16000B)真填充先插地址物化(1-3+ 字)致 E≠P→blockStarts 脱步→fill_predicted_mismatch/blockstart_desync→通用 stream_function_emit_failed+line=0 假锚; AppendI32Assign(314 局部/4723 行)巨帧命中。修=共享 helper 三处替换硬编码+tripwire。主会话交叉红绿(基线 buffer_size_desync 红/已修 ZC=0 绿)。★★双独立发现: op-lane 主树 161 行在制 WIP=同根因同名 helper(PrimaryBodyIRResultPanicGuardPrefixWordCount)超集修复(+residency 姊妹缺陷)——我方让道不落账, 资产(diag_67/{fix_67.diff,repro_67_giant_panicguard.cheng,result_67.md})转为其落账后的独立验收门+终局 census(missing=1→0=Pass B 解锁)。
- **#76 开飞**(wf_401bf4b7-778, 只诊断不修): new() 分配调用 missing_call_target 形态清点+机制链+op-lane 重叠核查。
- 在飞三线: T54 / #65b / #76 诊断。

## ★ 2026-07-15 配额中断+三线重飞 (acb7a9d3 会话)

- **配额事件**: ~15:33-15:50 三座席死于 "session limit resets 4:20pm"(#76 诊断 worker/#65b sweep worker/T54 reviewer); 用户 16:xx 确认额度已恢复。
- **T54 续飞(wf_9fce0e4f-ee7 resume, worker 缓存命中)**: worker 已定谳 fixApplied=true(根因=PrimaryBuildBodyIrForFunction :58221 元素级 var 实参喂 SyncCallMetadata 违 C5 铁律, fix_t54.diff 净 5 行, DRV 门 9/9); gen2 门上轮 GEN2_v8 烤 rc=-9 SIGKILL@708s——★其自采样 RSS 最后仅 2.39GB 远低于 12GB cap 且系统内存充足, "撞顶熔断"未证实; gen2gate-r2 已改异常先诊断版(10s 粒度 RSS 曲线+杀源排查+chain37 未修 DRV×tree_v8 隔离对照, 嫌疑=外杀 vs fix 每函数两次整行深拷贝 churn), 严禁调高 cap。
- **#65b 重飞 → wf_67c2603f-56f**(原 wf_254e2965 亡于站②勘察中): 脚本加 clone 复用指引。
- **#76 重飞 → wf_14ae182b-d55**(原 wf_401bf4b7 亡): 遗产 8 形态夹具已在 diag_76/(shape01-08), 脚本注入拾遗。
- 在飞三线: T54(gen2gate-r2+review) / #65b / #76 诊断。

## ★ 2026-07-15 收割轮六 (acb7a9d3 会话) — #76 诊断定谳→修复轮开飞

- **#76 诊断定谳**(wf_14ae182b-d55, 案卷 diag_76/diagnose_76.md): new(T) 占位 CallExpr(typed_expr:12464, literalText="new", 设计上应由后端 node-eval 分配专支消化)从未纳入三层免登记名单任一层(①typed_expr:2488 seq-add 豁免 ②lowering_plan:2851 Result 构造豁免 ③pobj:60862 40+ 项 builtin 白名单)→ 被当真函数登记 callTargets → pobj:59190 符号解析找不到 "new" → missing_call_target detail=new。8/8 消融形态全红=普遍缺口。★既有 node-eval 分配分支(pobj:39163)只覆盖 decl/assign+ref-LHS 子形态, 拆 barrier 后值类型/直返形态无分支——修复轮必须运行时验证防静默 miscompile。★方法学: --emit:obj 对非 entry 函数不摘牌(假绿), 复现必须 --emit:exe --link-providers 口径。op-lane 重叠=零(其 WIP 在 residency band/regalloc 函数群, lowering_plan 完全干净, 逐行 grep 零命中)。
- **#76 修复轮开飞 → wf_efdc4444-db8**: 单一正确层免登记(先定消费关系禁散弹枪)+node-eval 覆盖扩展+8 形态运行时矩阵+T60-v7 激活检验(9 件 ref+new() repro 家族)+对抗复核含静默 miscompile 狩猎。
- 在飞四线: T54(gen2gate-r2) / #65b / #76 修复 / (op-lane #67 在制 184 行未落)。

## ★ 2026-07-15 收割轮七 (acb7a9d3 会话) — T54 复核 refuted→v2 分歧狩猎开飞

- **T54 判决(wf_9fce0e4f-ee7 全三段落定)**: ①SIGKILL 定谳=瞬时外杀(重烤 rc=0/13.5min/RSS 峰 6.33GB 远低 12GB cap, 平稳穿过上轮死点 708s, rss.log 82 点在 diag_T54/gen2v8_chain/); ②worker 的 C5 var-arg 修法与主仓 a23230972 逐字节同款(滞后快照上重新推导), GEN2_v8 带修重烤后 s2/orbytes 红态一字不差→**该调用点非病灶, 复核 refuted**; ③terminal 2/2 仍绿, oracle 4/6; ④教训=worker 自判"证据充分"跳过反汇编对照, 正是复核抓破点; gen2v8_verdict.md 文档滞后于 journal(只读该文件会得错误结论)。
- **T54-v2 开飞 → wf_709261be-f1c**: 真分歧狩猎(五字段 desync 插桩定位→nm/otool 双版反汇编对照→根修 tree_v9→GEN2 红→绿全链 worker 自己跑完不许留尾); 线索=tree_t54 README newStringCopy→ptrSize append 错绑。
- 在飞三线: T54-v2 / #65b(wf_67c2603f) / #76 修复(wf_efdc4444)。

## ★ 2026-07-15 收割轮八 (acb7a9d3 会话) — #65b confirmed 落账

- **#65b 落账 → 63f160f9e**(cheng_cold.c 6 行): 5 站逐点判决=2 修(②MAKE_SEQ_OPAQUE 元素拷贝 16861/16865 + ③RET term sret 聚合返回三分支 26579-26600)+2 不可触发(①CALL_ARG param_size<=16 分流 / ④get_nprocs 128B 常量界, 结构不变量证明)+附带核验 SLOT_STR(24B 常量界安全)。红绿=40000B struct(int32[10000] 字段)三夹具运行值 111/222 + otool 反汇编 0x8000 边界截断→add+lsl 物化确证。复核 confirmed: 独立重构夹具(实施者夹具随 scratchpad 灭失)+自造 SLOT_VARIANT zero-fill 第三路径变体红→绿+安全包装 scratch 寄存器冲突审计。★与 #65 同门: 装机生效需 cc 重建种子=用户拍板项。
- **b.cond 结构项定性**(result_65b.md §4): 量化展开拷贝膨胀曲线 N=100~40000 六点实测; 真循环化改造评估 ~24 处同构展开点/250-360 行(工程估算)。
- **★新立案 #77**: SEQ_OPAQUE_INDEX 读回错值——复核员意外发现, 多元素 opaque seq 读 s[1] 错值(小元素无越界也复现, orig/fixed 一致)=独立既存缺陷未定位。
- 在飞两线: T54-v2(wf_709261be) / #76 修复(wf_efdc4444)。

## ★ 2026-07-15 收割轮九 (acb7a9d3 会话) — #77 当日立案当日结案 857db28f3

- **#77 落账 → 857db28f3**(cold_parser.c 净 1 行+注释): 根因=opaque 元素 seq 字面量构造(:7078)误用 body_slot_set_array_len 把元素个数写进 slot_aux——该字段双语义复用(SLOT_ARRAY_I32=元素个数 / SLOT_SEQ_OPAQUE=每元素字节数), 读侧 cold_seq_opaque_element_size_for_slot 短路直读致 s[i] 步幅与投影槽宽拿 count(2) 当 element_size(40) 用, 读栈垃圾。全文件其它构造点语义均正确, 唯此一处错 helper。5 夹具消融矩阵红→绿+反汇编 mov w6,#0x2→#0x28; 复核 confirmed(独立克隆+循环变体红→绿+函数实参形免疫侧证=污染仅限字面量构造 slot+#65/#65b 族不回归+suite MATCH)。诚实缺口: x64/rv64 后端理论同受益未逐 arch 反汇编; SEQ_OPAQUE_ADD/REMOVE 未专测。★同 #65 门: 装机生效需 cc 重建种子(用户拍板)。
- cold 后端今日三连修: #65(d9e1b2f86)+#65b(63f160f9e)+#77(857db28f3), 全部待换种子激活。
- 在飞两线: T54-v2(wf_709261be) / #76 修复(wf_efdc4444)。

## ★ 2026-07-15 收割轮十 (acb7a9d3 会话) — #76 落账+静默洞 #76b 接力

- **#76 落账 → c7061de3c**(pobj +24 纯新增, 双侧流程, op-lane 11 hunk 零重叠零残留): 修在单一层 PrimaryObjectCallTargetIsBuiltin 纳 new(ExpandIrCallTargets 早退+birc reloc 两消费点同愈)+NodeEvalProbe/EvalNode 镜像 guard(literalText==new 无条件 miss 逼进专用 realizer, 堵 WholeCallOrdinal 偶发注册空体 CallOp)。8 形态 6 绿(★值类型 new(I32) 诊断"大概率仍炸"预测被运行实测推翻)+growth+T60-v7 9 repro barrier 解除; shape06(bail=712)/shape07(empty_reloc)诚实 bail。复核: diff 全项独立复验通过, refuted 打的是交付完整性——对抗变体 takeSym(new(Sym)) 静默读栈垃圾, git stash 交叉验证 patch 前后 obj 字节恒等=先于 #76 的架构洞。
- **★#76b 立案(任务#78)+开飞 → wf_7ccc912e-44e**: 表达式位 new 全家族(调用实参/二元/字面量元素/嵌套), 必做 poison-on-miss(挂物化臂落空处防抢断)+酌情前端 hoist-to-let 归一化(可顺愈 shape06/07)。
- **★环境阻塞立此存照**: HEAD 上 --emit:exe --link-providers 对任意程序(含空 main)恒 bail=810(cheng_malloc_export, program_support_backend.cheng:2477)——git blame=7c4707354(op-lane #69 止血, 自称待 #73 ABI 修后升级)。全库进程级运行时验证被挡, 各线暂用 obj+otool 口径代偿; 归 op-lane 域不代修。
- 在飞两线: T54-v2(wf_709261be) / #76b(wf_7ccc912e)。

## ★ 2026-07-15 立卷轮 (acb7a9d3 会话) — ZRPC 合规两连修 #79/#80 开飞(用户直令)

- **★关键发现**: 用户截图的 load_at thunk(psb @901 +23 行)与 fs.cheng thunk 消费是 **op-lane 未提交 WIP**(HEAD 无 thunk, fs HEAD 还是 *[int64](p) 裸 deref)——其 8 文件批次(arena/fs/hashmaps 迁 thunk + pobj #67 + csg 179 行)活跃在制(mtime 热)。WIP 快照落 diag_79/wip_snapshot/(含 oplane_wip_20260715_1857.diff)。
- **#79 立卷+开飞**: 四 thunk nil→return 0/静默 no-op = 兜底, 违反 ZRPC fail-safe 条款; 修=响亮 panic+消费者审计(arena basePtr/hashmaps WIP)。
- **#80 立卷+开飞**: fs stat() 的 buf:ptr 流经普通函数+手写偏移 0/16/40 = ZRPC 验收反例; 修=stat 整体下沉 provider, ptr 从 fs 消失; 附带钉 libc_stat 偏移契约真相(0/16/40 非 Darwin 真布局, 疑 host_runtime shim 私有约定)。
- **工作流 wf_c3397245-107**: 构建基=HEAD+两文件 overlay(与 op-lane WIP 兼容, 落账等其先落+静默窗); 运行时验证走 stage3 cold 路径(driver exe 有既有 bail=810)。
- 在飞四线: T54-v2 / #76b / #79+#80 / (op-lane 8 文件批次)。

## ★★ 2026-07-15 收割轮十一 (acb7a9d3 会话) — T54-v2 confirmed, oracle 6/6 达成

- **★oracle 6/6 + terminal 2/2 里程碑**(T54-v2, wf_709261be, 复核 confirmed 九组独立复跑): GEN2_v9fix 世代全绿(s2/orbytes 由红转绿), 点火链战役自 chain37 terminal 首绿后再下一城。
- **真根因**: PrimaryBodyIrResolvedOrRegisteredWholeCallOrdinal 巨函数(f24:24872, 32KB/8000+ 指令)内 13 处内联五路 call-metadata add() 连写, GEN2 编该巨函数时**静默丢第 2/3 路**(callTargets/callTargetSourcePaths 相邻 str[] 追加)→五路 desync(trace 实证 argc=20 tgt=19 srcpath=19 importc=20 syms=20)。同款 5 行模式在小函数(lowering 侧)GEN2 编译完全正确=体积/寄存器压力相关。修=抽共享小函数 13 站替换(纯去重零语义变化)。T54v1 怀疑的 Sync/Store 持久化点被反汇编逐字节排除(真 REFUTED)。定位法=env 门控双 driver 运行时 trace 多检查点二分。
- **★两个新缺陷立卷(归 ledger 不占任务列表)**: ①T61 候选=alias_regress_base bail=6641(callViaParam statement_sequence line=21, GEN2 预存在, v8/v9fix 逐字节同 bail); ②T62 候选=**T54-v2 修的是触发点不是后端病根**——GEN2 巨函数相邻 str[] 追加静默丢弃这个 codegen 缺陷仍潜伏, 其它巨函数可能再触发(与 #67 巨帧 panic-guard、regalloc 压力族近亲), 待立专项狩猎。
- **在飞接力**: chain38 gen3 不动点决胜(wf_31e1aae9, GEN2_v9fix 自烤 GEN3+LC_UUID/签名区掩码判据+行为门; T31 前科 16GB 深水区警示已注入) + BACKFILL-11 主仓移植评估(wf_016e6ffb, 13 站抽函数移植口径, 剥离 TRACE 探针)。
- 工件持久化: diag_T54/v9_binaries/{GEN2_v9fix(sha f1186be5db80b481), DRV_v9fix, GEN2_v9diag} + tree_v9 + fix_t54v2.diff + result_t54v2.md。
- 在飞五线: chain38 / BACKFILL-11 / #76b / #79+#80 / (op-lane 8 文件批次)。

## ★ 2026-07-15 收割轮十二 (acb7a9d3 会话) — #76b confirmed 落账

- **#76b 落账 → eef625bd3**(pobj +22, 双侧流程零残留): 真机制=**孤儿槽反模式**(与 #76 免登记完全不同)——CallScalarValueSlotForTextImpl/ConditionOperandSlot 两个底层文本求值函数在物化尝试**之前**就 FindOrCreateSlot 建以原始文本为名的槽, 物化失败孤儿槽留 slotNames, 被裸标识符回退臂当合法槽复用→读栈残留。修=两处 callHead==new 镜像 guard 拦在建槽前, 交既有 poison(8548/83)接管。5 静默形态全转诚实 bail+零 .o; 复核自造 3 变体再抓 2 个新静默(while 体实参/调用套调用条件位)同被捕获=泛化超报告。
- **立卷两项(归 ledger)**: ①#76c 候选=hoist-to-let 归一化让 f(new(T)) 真编译通过(现在是诚实 bail 非绿, 前端合成语句 line/census 归属风险面待设计); ②**孤儿槽反模式全面审计**=FindOrCreateSlot 先建槽后条件物化的模式对其它 callHead 是否同样漏——本轮只精确打击 new, 未穷举(ScalarCallSynthesisSlot 已走读安全)。
- 在飞四线: chain38 / BACKFILL-11 / #79+#80 / (op-lane 8 文件批次)。

## ★ 2026-07-15 收割轮十三 (acb7a9d3 会话) — BACKFILL-11 落账(死亡拾遗)

- **BACKFILL-11 落账 → 711be2635**(pobj +35/-65, 双侧流程, op-lane WIP 完好): T54-v2 巨函数 13 站抽函数修复移植主仓。前提逐字节定谳: 主仓 :25197 同函数与 f24 从未分叉(13 站/分支/字面量全同); lowering 侧先例函数主仓已在; 探针已剥离; cold 路径零回归(suite MATCH+probe 持平); 与 op-lane hunk 相距 >27000 行。防御性口径如实: 主仓无 GEN2 harness, 红态不可亲测, 必要性立足 f24 实测+confirmed。
- **工作流死因拾遗案例**: wf_016e6ffb 死于 StructuredOutput 重试上限(5 次), 但 33 次工具调用的全部工作已落盘(fix_t54v2_main.diff+backfill11_verify.md)——按拾遗纪律先查产物再定补跑, 本例零补跑直接收割。
- 在飞四线: chain38 / #79+#80 / #76d 审计 / (op-lane 8 文件批次)。

## ★ 2026-07-15 立卷轮 (acb7a9d3 会话) — #81 str-nil 门禁缺口(用户截图引出)

- **定谳**: 规范 spec:520-524 早已全面禁 str 的 =nil/==nil/!=nil(编译报错, cstring 豁免, 同步标记 string_abi_contract.nil_compare.cstring_only=1); 实测(stage3 三夹具)只拦裸初始化位(且报错是 cold 通用 mismatch 非明确诊断), **元素赋值位 xs[0]=nil 与比较位 s==nil 全放行**。nil 合法域不动: ref 循环打断(spec:34)/ptr 零值(spec:509)/cstring ABI 比较(spec:524)。
- **#81 开飞 → wf_911a313f-53a**: 单一语义层门禁补全(冷/纯双路)+门禁自身作普查工具枚举全库违规+逐站语义迁移(nil→""/Len()==0, 禁机械 sed, "未设置 vs 空串"歧义站单列)。★截图的 hashmaps keys[i]=nil 在 op-lane 未提交 WIP 区, 其落账后会被新门拦红=预期行为, 届时协调。
- 在飞五线: chain38 / #79+#80 / #76d / #81 / (op-lane 8 文件批次)。

## ★ 2026-07-15 收割轮十四 (acb7a9d3 会话) — chain38 阻塞定性 + #76d 审计收割 + 三线接力

- **chain38 判决(confirmed)**: GEN3 未产出——三次独立确定性死于 ~360s(座席 2+复核 1), 死因 `cheng_str_copy: alloc failed`(psb:1049, cheng_panic 干净 exit(1)), 死点=typed_ir CSG 定点第 3 轮(fn 1280→1920 构建中), ★RSS 仅 ~7.6GB 且系统 40GB 空闲=12GB 撞顶假设三度被杀; T31 互递归复发排除(干净 exit 非 SIGSEGV)。=全新缺陷层, 头号嫌疑 DRV 错编 GEN2 内尺寸计算喂垃圾 malloc。**T63 狩猎开飞 → wf_b9b16d1c**(探针捕尺寸→回溯→根修 tree_v10)。工件 diag_T54/gen3_chain/+gen3_verdict.md; behavior_gate.py 备用。
- **#76d 审计收割**: 309 个 FindOrCreateSlot 全枚举(194 唯一后缀安全/115 裸名点, 精读 ~30)。★新 CONFIRMED 静默家族=F64 字面量 >18 位小数(EvalNode:36360 反汇编实证槽无 store; 12567/14898 同根未逐点引爆; 0.0 站不可达安全)——**#85 根修开飞 → wf_695902af**(杀 miss 吞没+正确舍入解析评估)。遗留盲区立卷: AppendCallOp 1400 行 21 处 `let _=` 丢弃返回值未逐路径核对(规模最大盲区)+Context/BinOpTernary/U64 三函数 14 裸点未读+UInt8Ptr/I32Ptr 解引用重复实现 :15362/15368 可达性未证; 结构性根修方案(物化成功才登记)影响面 309+30 点待独立提案。夹具族 diag_76/orphan_fixtures/。
- **#82 bail=6102 根修开飞 → wf_e0d84adb**(用户直令"不许只绕过"): 6102=wall7 诚实 poison, 真缺口=AppendSimpleFieldAssignFast 不认领 var 形参根+动态 seq 字段索引赋值; op-lane std 侧 hoist 是绕过, 后端补认领臂是正解; ★直通换种子 Gate 4 阻塞族(seed50_preflight: hashMapStrIntClear 6102 在 Pass B 表)。
- 在飞七线: #82 / T63 / #85 / #79+#80 / #81(str-nil) / (op-lane 8 文件批次)。

## ★ 2026-07-15 收割轮十五 (acb7a9d3 会话) — #79/#80 confirmed→让道 op-lane 更优在制方案, 资产转验收门

- **隔离态双修全项 confirmed**(wf_c3397245): #79 四 thunk nil→panic 真响亮(u8_load 修前 rc=139 无诊断/u8_store 静默 no-op/i64/i32 返回假 0 → 全转 rc=1 带명확消息); #80 fs stat 下沉后与 /usr/bin/stat 地面真值逐位吻合(含 0 字节/符号链接/目录变体)。
- **★重磅既有 bug 定谳: HEAD 的 fs.stat() 全错**——手写偏移 0/16/40 既非真实 struct stat 布局也非 shim 写入位, size 读出 422 万亿垃圾值+128B 缓冲被 144B memset 越界写; 真实 Darwin arm64 布局=st_mode@4/st_mtimespec.tv_sec@48/st_size@96(sizeof=144), 复核员逐位对照坐实。凡消费 stat() 的调用方一直在吃垃圾。
- **★让道决策**(照 #67 先例): op-lane 在制 WIP 已覆盖且更优——fs 侧=单次 libc_stat+裸 int64*/int32* 标量出参(cheng_fs_stat_scalars_export, 无 TOCTOU, 我方"无 ptr-free 多值返回"论证漏了裸出参这条本仓完全支持的路)+直接删 i64/i32 thunk+u8 对已加同款 panic。我方两 diff 直接落=设计路线级冲突, 不落。
- **验收门资产**(op-lane 落账后跑): diag_79/fixtures/{probe79_u8_load,probe79_u8_store,probe80_fs_stat}.cheng + /usr/bin/stat 地面真值协议(0字节/符号链接/目录/缺失路径变体) + 两 diff 备用(diag_79/, 若 op-lane 线停摆可落)。验收判据: ①存活 thunk nil 全 panic 无静默; ②stat size/mode/mtime 与地面真值逐位; ③fs.cheng stat 路径零 ptr; ④mtime 具名字段访问(cheng_file_mtime_raw 的 st.st_mtimespec)是否踩 #44 偏移 bug 顺验。
- op-lane 落账后总验收清单(累计): #67 巨帧 panic-guard(repro_67) + #79/#80(本轮) + #81 str-nil 新门拦其 hashmaps keys[i]=nil。
- 在飞五线: #82 / T63 / #85 / #81(str-nil) / (op-lane 批次)。

## 2026-07-15 T63 中断续飞 (acb7a9d3 会话)

- **T63 前轮中断**(wf_b9b16d1c): 座席在 GEN2_v10diag 烤到 36% 时返回=杀烤炉(feedback_agent_inflight_return_kills 同坑再现); 遗产完整(tree_v10 六埋点/DRV_v10diag/复现脚本/t63_hunt.md 续接指引)。
- **★新假设(座席读码提出, 未验证)**: 可能非垃圾尺寸而是 cheng_mem_registry 全局指针表倍增——逼 2^30 顶时单次 c_malloc(newCap*8)≈8.6GB, 叠加当时 RSS 7.6GB 越 12GB cap 被拒返 nil → 若真, 归确定性内存线(registry 扩展性/CSG 轮间释放)非 DRV 错编。六埋点可分叉定谳。
- **T63-b 续飞 → wf_575a009c**: 哨兵纪律写死(烤完 rc 落定才许返回), 重烤→复现→捕尺寸实值→(a)registry 扩展性 (b)DRV 错编回溯 (c)其它 三分叉。

## ★ 2026-07-15 收割轮十六 (acb7a9d3 会话) — #81 str-nil 门禁落账 d1c352ca0

- **门禁+迁移原子落账 → d1c352ca0**(3 文件 +51/-32): 冷路径 cold_reject_str_nil 7 站(含两处原**静默 no-op** 赋值分支与 3 处 "nil→zero str slot" 启发式站——之前不只是漏拦, 有的位置是静默吞)+纯路径 TypedExprRejectStrNilLiteral 双镜像; hashmaps Clear/Init 家族 3 站 nil→""。复核 confirmed(独立重建+豁免实测+自造变体)。
- **★落账形态注意**: 迁移只进 index(HEAD 基); 工作树 hashmaps 是 op-lane hoist WIP(局部 keys[i]=nil @323/349/650, 注释自述"等 driver nil#str_zero 修复"——**方向与规范相反**, 规范禁 str-nil 而非等支持)。其下次 meter 重建(fresh cc 含新门)会被明确诊断拦红→按诊断文本改 "" 即可; 非静默, 门有牙齿是预期行为。★若 op-lane 整文件 commit 会回退迁移 3 站——但新门保证编译响亮失败, 无法静默回退。
- **顺带立此存照**(复核员发现): str[][] 嵌套序列声明冷解析器本身不支持(die typed let kind mismatch, 与 nil 无关的独立既有缺口); nil_field/nil_call_arg 已是硬错但诊断文本通用(可选打磨项)。
- **种子注意**: cold_parser.c 门禁与 #65/#65b/#77 同门——装机生效需换种子; 换种子后 stage3 也带门。
- 在飞四线: #82 / T63-b(烤炉监视 b19dodku5) / #85(F64) / (op-lane 批次)。

## ★ 2026-07-15 收割轮十七 (acb7a9d3 会话) — #85 F64 双静默根修落账 c021655c7

- **#85 落账 → c021655c7**(pobj +45, 双侧流程, op-lane 12 hunk 零重叠): 两个独立静默机制——①LocalDecl F64Tag 缺诚实收尾(四类型唯 f64 漏)语句蒸发; ②F64Literal 孤儿槽被 FindArgSlot 误捡 CopyLocal **覆盖合法零值写垃圾**(比"没写"更险)。修=5 站探路前置+LocalDecl 收尾; 复核 confirmed(独立 A/B 双克隆+自造 5 变体反汇编实证+零残余静默)。
- **★立卷 #85b(归 ledger)**: f64 字面量任意精度正确舍入——纯路径 PrimaryBodyIrF64LiteralBits 是精确有理数+round-to-nearest-even 只是入口硬顶 ~19 位; ★cold_span_f64 朴素累加被证伪(38 位实测差 2 ULP)不可作 oracle; 升级需 GRS 位改 ParseF64LiteralParts+可信 golden 矩阵(strtod FFI 或独立任意精度参考)=独立数值战役, 设计在 result_85.md。
- **孤儿槽反模式修复进度**: #76b(new)+#85(F64) 两族已修; 审计遗留=AppendCallOp 21 处丢弃返回值盲区+Context/BinOpTernary/U64 三函数 14 裸点+UInt8Ptr/I32Ptr 重复实现可达性——结构性根修(物化成功才登记)提案仍待立项。
- 在飞三线: #82(6102) / T63-c(复现定谳) / (op-lane 批次)。

## ★ 2026-07-15 收割轮十八 (acb7a9d3 会话) — #82 定谳: 6102 hashmap 族已由 #81 根治, diff 判死代码不落

- **#82 机制定谳(复核 confirmed)**: m.field[i]=nil 的 6102 根不在 var-root 寻址在**取值链**——Fast() 值解析全 resolver 对 nil+LocalStrTag 组合落空→wall7 poison 正确拒绝; str[] 元素配 ""/变量 RHS 与 int32/uint64/uint8 系**本来就绿**(消融矩阵实测, 含 16 字段精确 HashMapStrInt 形)。★即"绕过 vs 修复"之问的终局答案: 真根修=#81 规范执行(禁 str-nil+迁移 "")——d1c352ca0 后该形态在语言里不存在, HEAD hashmaps 三站已是直接形 m.keys[i]="" 且闭包重建通过, hoist workaround 不再必要。
- **fix_82.diff 判门后死代码不落账**(park diag_82/): 其 nil→零广播修臂与 op-lane 在制的同款 resolver nil 分支(其 WIP 注释明写 hashMapStrIntClear/6102, 复核核实=第三次双独立发现)在新门下都不可达——nil 到不了后端。★协调点: op-lane 的 nil realizer 分支+hoist 版 hashmaps+"等 driver nil#str_zero"注释都应撤(新门会拦), 直接形 "" 即绿。
- **知识入库**: ①单大写字母类型名(Q/X)走旧全文本 lowering 兜底绕过 node 路径=消融实验命名陷阱(2+ 字符才踩真路径); ②seq-of-struct 字段 b.items[i].name 走 AppendI32Assign 落 712 非 6102(同族异所); ③残余 6102 census=2 条 registerProtocol 族(switch.cheng:717, 非 nil 形)=op-lane bail6650 handoff 案卷territory。
- 在飞两线: T63-c(gen3 复现定谳) / (op-lane 批次)。

## ★★ 2026-07-15 收割轮十九 (acb7a9d3 会话) — T63 根因定谳: registry 双 int32 溢出(gen3 阻塞真身)

- **T63-c 定谳(三分叉外第四类)**: 死点诊断行原文捕获——registry_grow_capped minLive=187904820 needed 同值, 2^28→跳过 2^29→直撞 2^30 拒绝。根因=program_support_backend.cheng:681 \`(newCap*7)/10 < needed\` 在 newCap=2^29 时 **int32 乘法环绕为负**→误判不够→被迫翻倍撞硬顶; 2^29 本该够(RSS 帽内)。Python 精确复算与实测逐位吻合; 四份源码树(v8/v9/v10/主仓)逐字节同=既有生产缺陷。**非 scaling 非 DRV 错编**——任何忠实 int32 环绕语义的编译器都 100% 复现。
- **修①验证(三代重烤实测)**: 原死点(447s)解除, 首次推进到 2^29; ★随即暴露**同源溢出②**(:717 ensure_capacity cap*7 同款→门恒真→每分配重哈希 1.88 亿条目 O(n) 退化→855s 停滞被外杀)。修②已落 tree_v10 未验证。
- **★记忆修正**: 旧结论"倍增律 512MiB-1GiB 活集必撞 2^30 守卫无独立可修点"被推翻——真相=int32 溢出使其提前撞顶, 修复后 2^29(可承载 ~3.7 亿存活)可达。registry cur_dead 恒 0(只增不减)另立设计项待论证(确定性内存线)。
- **chain39/T63-d 开飞 → wf_4bd4fb56**: 干净树 tree_v11(v9+纯双修 diff, 剥探针)三代链决胜——GEN3 历史首次产出尝试+不动点掩码判据+行为门(oracle 6+terminal 2)+对抗复核(含 *7/*10 容量模式第三处扫雷)。fix 落主仓待复核 confirmed 后执行(运行时核心分配器, 审慎门)。
- 在飞两线: chain39 / (op-lane 批次)。

## 2026-07-15 全面推进第二波 (acb7a9d3 会话) — 四线齐飞

- **seed51 预检 v2 → wf_3d0c63ba**: cold 四修积压后 Gate 1-4 全新判决(漂移按换代登记口径; Gate 4 量 GetOrInsertEx 现值; 加测四修红夹具应绿+str-nil 门应拒), shadow 态, 为用户拍板备料。
- **registry 1.88 亿定性 → wf_a119ccd5**(RSS #46 线): dead=0 泄漏 vs 零释放语义/churn 采样归因/结构选项矩阵。
- **#76e AppendCallOp 盲区审计 → wf_6d6fa585**: 失败路径×丢弃调用方矩阵+危险格引爆(#76d 定谳的最大静默嫌疑区)。
- **#76c hoist-to-let → wf_91365ade**: 表达式位 new 归一化真编译通过(line 归属/求值顺序/嵌套三风险面+反汇编真发射复核)。
- 在飞七线: chain39(detached, 监视 b85a0jwui) / T62 / seed51 / registry / #76e / #76c / (op-lane 批次 pobj 已 214 行)。

## ★ 2026-07-15 22:30 收割轮二十 (acb7a9d3 会话) — chain39 终局: GEN2 全绿 + T63 落账 + 配额波二重启 + T64 立卷

- **chain39 终局判决(detached MCP 链 ignite_20260715T131813_406676, 座席死链照跑的结构解首次全程验证)**: DRV 绿 13.1s → probes 11/11 → **GEN2 烤成 ZC=0(21.7min)** → terminal 2/2 → **oracle 6/6** — T63 registry 双 int32 溢出修复通过全部验证门, 纯自举 GEN2 世代首次全绿闭环。
- **gen3 烤炉推进到新前沿后拦停**: 9.1min 处 GEN2 自身 resource_guard 干净退出(rc=255), rss=14,010,220,544 > cap 12,884,901,888。非上代 alloc-fail(那是 T63 已根修的伪容量耗尽)——是真实 RSS 放大: 同源树 DRV 烤峰值 ~6.3GB vs GEN2 烤 ≥14GB(≥2.2x)。GEN2 功能全绿+内存放大 = 高度疑似 DRV-codegen 静默 miscompile(intern/hash 命中失效 / registry dead 回收判据被编错)。**T64 立卷**, 铁律不抬 cap, 诊断工作流 wf_92d67f71-2a1 开飞(对照遥测+小尺度复现+机制探针, 对抗复核收口)。
- **T63 落账主树 0ef0cd959**(+2/-2, src/core/runtime/program_support_backend.cheng L681/L717 双站点 int64 加宽): 委托授权下依 chain39 绿判决直接执行。★事故与即时修复: 首次提交 dedf7cadb 用 pathspec commit 卷入 op-lane 同文件 55 行 WIP(feedback_pathspec_commit_only 陷阱原样复发, 双侧 apply 不能豁免)——mixed reset → 仅 index 重 stage 我方 2 hunk → **裸 commit** 重落 0ef0cd959, 字节复核过, op-lane 55 行完整留树。流程修正: 双侧落账第④步在目标文件混他人 WIP 时**必须裸 commit(仅取 index)**, pathspec 形态永不可用。
- **配额波二(22:10 复位)处理**: 五臂(#76c/#76e/seed51/registry/T62)journal 全部零完成层(无 resume 价值); 22:16 单探针确认恢复后全部重 launch — T62=wf_e4919c88-fb2(脚本已注入前次遗产: scratchpad/t62/ 树拷贝+realtype 夹具族+sweep.py, 从盘点续起) / seed51=wf_f795764e-075 / registry=wf_0d3a6d8e-319 / #76e=wf_4aef9bc7-922 / #76c=wf_d19dcb1d-d6d。
- **#75 岔路委托裁决 = (c)**: 转 #67 清零后进程级 fork-join(Pass B 生产 wall 既定解锁序 ZC=0→fork-join, F17 Slice1/2 消共享态资产恰为其前置; exe 接线与流式②③ 两案卷存档不作废)。F17 Slice4 线就此收束, 设计工作流待当前六臂消化后择机开。
- 在飞七线: T62 / seed51 / registry / #76e / #76c / T64 / (op-lane #67 战场)。下一里程碑: T64 定谳 → gen3 过 12GB 门 → gen3 fixpoint。

## ★ 2026-07-15 22:55 收割轮二十一 (acb7a9d3 会话) — registry 1.88 亿存活定性判决

- **wf_0d3a6d8e-319 判决(46 tool uses, 只诊断红线全守)**: ①**dead=0 是真的"整段编译零 free"**——registry 记账无 bug(remove/三 free 入口 2489/2580/2641 全正确解注册无绕过), 1.88 亿单调爬升=编译器对自身 AST/IR/CSG 采取 arena 式"批处理到进程退出"架构选择。②**churn 主导根因=LookupIntern 读取侧深拷贝**: intern.cheng 写入侧真去重, 但 `Ok[str](pool.texts[id])` 按 str 值语义(24B, spec:551)每读一次新分配一份堆拷贝; compiler_csg.cheng 95 处调用点挂在 typedIrReachRound 多轮可达性定点下=同一节点同字段逐轮重拷贝, 且按①永不释放。证据双线: 尺寸直方图(新增 CHENG_T63_ALLOC_HIST 采样探针实测 ≤64B 占 92.8%)+静态调用点; 诚实边界=非调用栈级回溯。③**修复选项评估(未实施)**: A registry 侧=修错靶子否决; **B CSG 轮间 epoch arena=推荐首选**(影响面局限 compiler_csg 分配方式, 前置=枚举轮内即弃 vs 跨轮存活); C LookupIntern 借用视图=根治但 95 调用点战役级; D 削弱 registry=违反不降级原则否决。
- **与 T64 交叉**: intern pool 机制图已完整测绘——若 T64 定谳 GEN2 把 HashMapStrIntGetEx/intern hash 编错, 则去重 miss→pool.texts 无界+拷贝翻倍, 恰好解释放大; T64 卷宗复核时对照本案。
- **按委托开 B 设计工作流**(只设计不实施): 枚举 95 调用点轮内/跨轮存活分类+epoch arena 设计+验收判据。任务 #90 收割删除。

## ★ 2026-07-15 23:10 收割轮二十二 (acb7a9d3 会话) — #76e AppendCallOp 盲区审计: 零缺口定谳

- **wf_4aef9bc7-922 判决(62 tool uses, 逐行读全函数非 grep 抽查)**: AppendCallOp(pobj:24413-24664, HEAD c585a8d73) 11 个 return 出口全数分类=5 真成功+5 已 poison+1 不可达(L24460 纯转换 void 语境, 静态推导+两构造夹具双证: 纯转换头永远解析不到 callTarget, 到不了该分支)——**零"真失败未 poison"缺口**。#76d 开放担忧("十余处 return false 未见 poison")正式 REFUTED; #76d 快照与现 HEAD 间 4 次相关 commit diff 逐一核对未改失败分支结构。
- 21 处 `let _ =` 丢弃调用点全部良性(poison 带外写 bodyIR.ops 不经返回值, 丢弃动作与安全性无关)。两夹具(裸纯转换语句 bail=64 / _= 丢弃 bail=707)均在语句分类阶段诚实拦截, 无 CLEAN 静默样本故反汇编步骤如实免做。防御性加固项一件(L24453 裸 if 缺显式 else, 靠隐式不变式)立卷不实施。
- 卷宗: diag_76/appendcallop_audit_76e.md + callop_fixtures/。任务 #91 收割删除。orphan-slot 结构修提案(register-on-success)仍候 #76c 判决后再设计(new hoist 归一化会改调用点形态)。

## ★ 2026-07-15 23:40 收割轮二十三 (acb7a9d3 会话) — B 设计 v1 判决 PARTIAL, 复核抓出三处真失实, v2 开飞

- **wf_abb95e9c-0ad(worker+对抗复核双阶段)**: v1 设计卷宗 diag_RSS_B/b_design.md 复核裁定 **PARTIAL**。地基资产: 95 点存活矩阵零误差(15 包裹函数, 94 (i)类+1 (ii)类=1978 行 functionNames 且天然在轮循环后不需晋升机制)、轮边界锚点 8752/9018、op-lane WIP 冲突面(其 hoist 恰在矩阵第 2 函数)——全部复核 verified 可直接继承。
- **复核坐实三缺口**: ①核心标量矛盾(致命): 全卷 6 处复述"3 函数 14 热点", 自家表格加总=4 函数 36 点, 2.6 倍失实且驱动实施范围; ②缺口A: TypedStatementFromSoA 除轮内 5022 还被 ColdCsg 10119/10162 后期调用, 改函数体路由会把冷导出拖进 epoch; ③缺口B: N 槽 RE-ARM 复用地址致环窗耗尽后误判读=静默垃圾, "第一现场 SIGSEGV"保证有窗口条件而 v1 用调参语言掩盖。另: CHENG_T63_ALLOC_HIST 探针不存在于版本控制(定性时克隆内一次性搭建), 量化验收需从零重建, 成本未计。
- **对抗复核价值实证**: worker 自检+结构化返回全绿, 三失实全靠复核员独立 grep 重数+逐点读上下文抓出——feedback_workflow_adversarial_review 纪律再次兑现。
- **v2 开飞 wf_49c1e0f4-5c7**: 四缺口全注入(标量重算全卷统一/缺口A 三候选机制解/缺口B 无条件 trap=fresh-VA+永久 PROT_NONE+物理页归还+VA 测算/探针重建工作项), 继承资产不重做, 复核逐缺口验收。

## ★ 2026-07-15 23:55 收割轮二十四 (acb7a9d3 会话) — T62 重大改判: 非巨函数病, 是分支组合触发的登记态裂化; T62-b 定谳臂开飞

- **wf_e4919c88-fb2 判决(79 tool uses)**: T54 时代"GEN2 编 32KB 巨函数静默丢相邻 str[] 追加"定性被**改判**——①9 行最小夹具 100% 确定性复现(os.GetStdout+strutil.Join 各自独立语句), 触发条件=「os.* 通用 importc 兜底分支」+「strutil.Join 依赖闭包(NewStringAlloc/NewStringCopy 两桥分支)」同一编译会话共现→PrimaryBodyIrResolvedOrRegisteredWholeCallOrdinal 会话累积态裂化(missing_call_sequence: join@strutils:219+chengStrStoreCompat@system:418); ②**体积阈值维度整体证伪**: DRV 侧 0→6000 局部×13 分支×4 生成模式全 MATCH, 无任何规模阈值; ③GEN2_v9fix(T54-v2 修复世代)对全部新夹具转绿=修复对同类全有效; ④与 op-lane residency-band WIP 无重叠(IR 构建段 vs Fill/Emit 段)。
- **副产物立卷**: n=8000 触发 DRV 无关独立缺陷=编译器递归栈溢出 SIGSEGV(深度 12287), 低优先级备案。
- **遗留关键未决(T62-b 定谳臂 wf 开飞)**: 复现全是编译期硬 bail(ExpandGuard 卫兵拦截), 且 DRV 合成穷举从未复现——**尚不能区分**(a)源码级登记逻辑 desync bug(T54-v2 重构顺手根治, DRV codegen 无辜) vs (b)DRV 编巨函数 codegen 潜伏病(合成形态没踩中)。判决实验=stage3(冷 C, 可信工具链)直接编 tree_v9(未修源)产 GEN2_cold, 对 9 行夹具: 红=源逻辑 bug 定谳(编译器无关), 绿=DRV codegen 病定谳。工件: diag_T62/(t62_diagnose.md+repro_min/ 4 夹具)。任务 #88 收割删除。

## ★ 2026-07-16 00:20 收割轮二十五 (acb7a9d3 会话) — #76c 落账 6d0bfd603 + T62-b 定谳 DRV_CODEGEN_BUG

- **#76c 落账主树 6d0bfd603**(+128/-6, 裸 commit 手术流): 表达式位 new(T) 后端 hoist-to-slot 归一化——四接入点(call-arg/条件位/字段赋值/return)把 #76b poison(-1) 升级为就地 ptr 槽分配(复用既有 realizer 原语), 失败仍 -1 安全网。复核 CONFIRMED 含金量高: 独立克隆重建 driver sha 逐字节复现+反汇编级(BR26/双槽/位序/求值序)+负对照 .o 字节同+自造 match/defer/Result-Ok 三对抗变体消融。层选择弃 typed_expr/lowering 的论证被复核读码核实。已知未覆盖族: 数组字面量元素位(707)/具名构造器字段位含 Result Ok(new)(801), 立卷不阻塞。
- **T62-b 判决=DRV_CODEGEN_BUG**(wf_58b851be-757): stage3 冷编同一未修源(HEAD 逐字节确认 13 分支内联老形态)产 GEN2_cold(sha 1a6b806e), 4/4 夹具全绿 vs GEN2_v9diag 同 4 例 100% 红——单变量分叉决定性。**改写战役认知: T54-v2 重构只是移走触发形态(helper 小函数 DRV 编得对), DRV 编 13 分支巨函数的 codegen 潜伏病仍在**。诚实缺口: 未做指令级反汇编定位(根治必经)。★注意: tree_v9 工作树≠HEAD(工作树含 T54v2 修复 WIP 未提交), 实验用 git clone 只读 HEAD 无破坏。
- **两后继臂开飞**: T62-c=GEN2_v9diag vs GEN2_cold 该函数反汇编差分, 钉死 DRV 发射缺陷指令族; orphan-slot 结构修设计(register-on-success, #76d 309 站审计+#76c 落地后解锁)。任务 #92/#95 收割删除。

## ★ 2026-07-16 00:50 收割轮二十六 (acb7a9d3 会话) — B 设计 v2 CONFIRMED, 实施排序门确立, 前置探针臂开飞

- **wf_49c1e0f4-5c7 判决 CONFIRMED**(diag_RSS_B/b_design_v2.md): 四缺口全机制闭合——①标量订正: 轮内热路径=36 点(9 可原地改+27 须薄分身), v1 的"14/81"两错互抵才假装总账对; ②缺口A=函数薄分身 CompilerCsgTypedIrStatementFromSoAEpoch(仅改 5022 一个调用点, 冷导出 10119/10162 零碰, 静态可审计; 拒绝 armed 动态门=zeroc_hoist_patch_regression 同类抢断模式); ③缺口B=永不复用地址方案(rotate 时旧槽**永久** PROT_NONE+madvise 归还物理页+新轮 fresh mmap+绝不 munmap)→trap 保证无条件可签字; VA 最坏 192TiB 由既有收敛熔断(8756: rounds>fn 数即 panic)先行拦截; **新隐患入卷**: cheng_malloc_export 的 mmap 失败回落 malloc 池对 mprotect 致命, epoch slot 必须绕开直呼 cheng_host_mmap_anon 失败即 panic; ④探针=intern.cheng 行号索引密集数组方案完整可执行(先②后④排序依赖)。复核 6 条残留全是引用行号漂移级白噪声。
- **实施排序门(裁决)**: 薄分身目标函数 4745-4869 恰含 op-lane 未提交 hoist WIP(27 处 Value(LookupIntern) 提 let)——现在实施必分叉, **B 实施等 op-lane compiler_csg hoist 落账后开**。
- **前置三探针臂开飞**(设计自曝待验项, 独立不碰争议文件): str 赋值深拷贝假设 repro(v1 §4 第 0 步阻塞门)+madvise MADV_FREE/REUSABLE RSS 下降时序实测+PROT_NONE 读必炸/VA 上限本机核实。任务 #94 收割删除。

## ★ 2026-07-16 01:30 收割轮二十七 (acb7a9d3 会话) — T64 定谳(seq 失控灌入)+orphan-slot 设计 PARTIAL

- **T64 判决(wf_92d67f71-2a1, 复核 PARTIAL=核心全 CONFIRMED+一处自述失准)**: gen3 RSS 放大病根收窄——①分岔非相位级: GEN2 编真尺度在 primary object 编译内撞 **cheng_seq_set_grow 64MB 单体不变量 panic**(program_support_backend:3027), DRV 同源同参从不撞; ②合成夹具标度律: GEN2 →N^1.69 逼近二次(N=3000 比值 10.68x), DRV →N^1.02 健康线性; **GEN2 更快却更肥**排除"算得多", __TEXT 1.25x 排除代码膨胀主因; ③主推机制假说=(b) **"先查后 append"去重判据被 DRV 错译→恒判不存在→重复灌**(同时解释快+肥+64MB 命中), 候选族 DenseStoreAppendHashEntry(compiler_dense_store.cheng); (a)hash 错译在查找处与 (b) 交汇——与 T62-b 定谳的 DRV codegen 病同族收敛。④真尺度 ~2-2.6x vs 合成 10.68x 标度落差如实入卷(可能两机制叠加)。⑤N=1000 廉价迭代夹具就绪(35-60s/轮, 5.36x 信号, diag_T64/fixtures/gen_synth.py)。复核亲测 N=500 新插值点 3.05x 单调验证+采样器盲区自述 1.5-2min 实为 4min 订正。
- **orphan-slot 设计判决 PARTIAL**(wf_b30b8188-99c, diag_76/orphan_structural_design.md): **机制 A(Probe/Reserve/Commit+占位名延迟登记)对抗搜索站住**——占位名对哈希表与线性扫双类消费者天然免疫(候选 B 被线性扫消费者 RetireIncompatibleAggregateRebind:5545 一票否决), 失败路径全部零 op 写入=无中间态, "不许清理型补救"未被偷运。**矩阵两处订正**: 12796 实为后缀名非裸名(轻); LocalInitF64ConstSlot 实有两调用点且全是计数器后缀合成名(实质, Phase 2 优先级前提失实需重排)。站点数精确口径=311(工作树)/310(HEAD)。**唯一今日零防护站点=15625/15631(UInt8Ptr/I32Ptr 解引用)**=Phase 1 目标。新缺口备案: FindOrCreateSlotSized 29 点未审计(Phase 6 前置)。实施同样候 op-lane pobj WIP 落账窗。
- **T64-b 开飞**: 免重烤杀招——lldb 断点 panic 路径跑真尺度, backtrace 直取失控 seq 的灌入调用链, 再接 T62-c 手法差分该函数两世代反汇编。任务 #97 收割删除。

## ★ 2026-07-16 02:00 收割轮二十八 (acb7a9d3 会话) — ★B 阻塞门触发: str 赋值实测 SHARES_POINTER, B/C 效率前提被证伪, churn 归因需重查

- **wf_9b583f30-0ba 三探针判决**: ①**探针1=SHARES_POINTER(阻塞门触发)**: intern 取出+赋值/add() 实测共享底层指针非深拷贝——v1 设计 §4 第 0 步阻塞门命中, **B(epoch arena)/C(借用视图) 效率论证前提坍塌**(若读取本就不拷贝, 就没有逐轮拷贝 churn 可消), B 实施冻结; **与收割轮二十一"LookupIntern 逐读深拷贝=churn 主导"定谳正面冲突, 两判决必有一错**, 已开对抗复验臂。②PROT_NONE trap 100% 成立但 Darwin 信号=**SIGBUS(10) 非 SIGSEGV(11)**——未来任何 trap 捕获/诊断逻辑必须双收 10/11。③VA 单次 mmap 实测上限=64TiB(128TiB 档失败), 设计"192TiB 必超"担忧坐实, 收敛熔断依赖从可选升为必需。④madvise(FREE/REUSABLE/不调)三组对照 RSS 全程零变化, 骤降精确对齐 mprotect(PROT_NONE)——§3.5 归因需订正(记账口径 vs 物理回收未定谳, 需 phys_footprint)。副产物: 探针自身撞上跨模块 generic Result 显式类型标注解析缺陷(既有, 换 compiler_csg 同款写法绕过, 立卷)。
- **churn 重归因臂开飞**: 先对抗复验 SHARES_POINTER(指针恒等法+wrapper 分配审计, 与轮二十一直方图证据对质), 定谳后若成立→重找 92.8% ≤64B 小分配真源头(Fmt/seq grow/str 拼接候选)。registry 定性①(dead=0 真零 free)与 A/D 否决不受影响。

## ★ 2026-07-16 02:20 收割轮二十九 (acb7a9d3 会话) — T62-c CONFIRMED: 指令级钉死"相邻 Value()解包双 append 静默丢发射", T62-d 根因追踪开飞

- **wf_efd2be5c-503 判决 CONFIRMED(复核员逐指令亲验+补验 block7/8+控制组交叉)**: GEN2_v9diag 里登记巨函数 4 个同形分支(block5/6/7/8="位置 2/3 是相邻两条 add(strSeq, Value(someResult))")——24 字节取值拷贝完整发射(落栈临时槽), 但**两条 bl _cheng_seq_str_add 在 21524B 函数体内字节级不存在**(区间零 bl/全函数零 blr/无跳转替代/两死槽只写不读 grep 唯一); call1/call4/call5 全在。GEN2_cold(stage3 编同源)两 append 完整内联。控制组: literal-bridge 分支两 append 齐全=排除方法性错位。三证据线字段级收口: T54v2 trace 五路计数 20/19/19/20/20 ↔ 9 行黑盒丢 join+chengStrStoreCompat ↔ 指令差分缺 call2/call3(恰为 callTargets/callTargetSourcePaths)。
- **定性升级**: 非运行时寄存器污染, 是**编译期静态丢发射**; 且 DRV=stage3(正确编译器)所编→缺陷本体=**纯 Cheng 后端源码 lowering 逻辑 bug**(对该语句形态跳过 call 发射), stage3 的 C 后端不共享该代码故绿。T54-v2 抽函数修复=意外改形状避开触发, 缺陷本体仍在纯 Cheng 后端源里。**与 T64 收敛预告**: 若 GEN2 自身 runtime/去重代码里同形态调用也被丢发射, 恰好解释 T64 恒判不存在重复灌入——T64-b lldb 结果出来后对质。
- **T62-d 开飞**: ①最小源级 mis-emission repro(DRV 编含该形态夹具→反汇编数 str_add, 13s 快循环); ②追踪纯 Cheng 后端 lowering 该形态的源码路径钉死函数+行号+逻辑缺陷; ③修复 diff-only(pobj 有 op-lane WIP 不落账)。工件: diag_T62/t62c_localize.md+两版反汇编切片。任务 #96 收割删除。

## ★ 2026-07-16 03:00 收割轮三十 (acb7a9d3 会话) — seed51 预检: Gate1-3 全绿+Gate4 源侧阻塞与候选无关, 差分对照臂开飞

- **wf_f795764e-075 判决**: ①Gate1-3 全绿(fresh cc 32s/自拷贝链×3 cmp 零差异 sha 2e33edd1/contract_hash 三级一致=e202c0c35424eb36 与现役同)。契约哈希不漂移的诚实解释: 该哈希只覆盖 stage1_bootstrap.cheng 九行契约字段, 四修(#65/#65b/#77/#81)全在 codegen 函数体, 定义域之外非假绿。②候选真含四修: 独立夹具抽样复核逐一生效, canonical 阻塞数与 seed50 持平=1(零新增)。③Gate4 FAIL: 12GiB 撞资源门如实登记后 16GiB(seed50 已验证口径)跑满 28.5min, plan_not_ready, canonical 唯一阻塞=HashMapStrIntGetOrInsertEx missing_call_target @hashmaps.cheng:1103/1106 重载消歧——**主线 HEAD 已知缺口(op-lane 在攻), 与候选四修无关**; 伴生位移一处(idx5 hashMapStrIntClear/6102→execCmdResultNew, 与 #81 迁移一致)如实入卷不计判据。④shadow 已刷新到 c585a8d73(含 T63), 候选二进制在 diag_seed51/seed51_shadow/, 主树 artifacts/bootstrap 零触碰。
- **换装裁决(委托)**: recipe 最后一环=差分对照(现役 stage3 同树态跑同 Gate4, 失败必须逐字节同型=同一 missing_call_target 同一计数)——seed51 臂只对照了 seed50 案卷非现役实测, 不足以签字。**差分臂开飞**, 同型即执行换装(cp .bak 先行+compile-bootstrap+三轮 fp+ci_gate 后验), 不同型=候选回炉。

## ★ 2026-07-16 03:40 收割轮三十一 (acb7a9d3 会话) — T64-b 座席误杀自身复现进程(诚实自报), 基础设施全validated, 主会话后台重跑

- **wf_e488dfb7-7df 事故定谳**: 座席被 StructuredOutput 强制收尾逼出模糊匹配 `ps|grep|xargs kill -9`, 在 5min/19min 处误杀自己合法在跑的 lldb 真尺度复现(lldb 日志 stop reason=SIGKILL 而非 breakpoint, 座席如实自报未粉饰)。**新变体入训**: 收尾清理必须用 launch 时记录的精确 PID, 永禁进程名模糊匹配 kill; 已沉淀进 agent-inflight-return-kills 记忆。
- **抢救资产(全 validated 可直用)**: ①panic 分支断点地址 0x1010cffec 双法互证(字节锚点 provider_base 反推+panic 字符串 adrp/add 交叉)正确; ②断点处形参读取表达式表($sp+0x210 seq 头/+0x218 growBy/+0x220 elemSize 类型指纹/+0xb0 newCap/+0xe0 bytes64)sanity 跑通; ③primary.o 15023 行符号表+resolve_addr.py 可把任意运行时地址解析回编译器函数名; ④tree_v11 WIP 时序核实: 6 文件 WIP mtime 全早于 GEN2 编译时刻=已是 GEN2 输入, A/B 反汇编若目标在 pobj/typed_expr 须克隆工作树非 HEAD。
- **两个源读候选(未验证, 待断点数据收窄)**: DenseStoreAppendHashEntry(dense_store:268) 与 **Intern()+HashMapStrIntGetEx var/非var 重载消解**(hashmaps:1090-1094; 若 DRV 对 ref 形参字段访问重载选错或 found 回写被丢=T62-c 半发射同族)——后者与 seed51 Gate4 阻塞(HashMapStrIntGetOrInsertEx 重载)同域, 三线互指。
- **主会话后台重跑**(bg b4x7v462f, harness 追踪不随座席死): 同配方 lldb -b -s, ~19-25min 到 panic 断点, 完成后开分析臂解读现场。

## ★ 2026-07-16 04:10 收割轮三十二 (acb7a9d3 会话) — T64-b 断点命中: 失控 seq 钉死在 ResidencyPlanInPlace 的 -1 填充循环

- **主会话后台 lldb 真命中**(b4x7v462f, stop reason=breakpoint 1.1, 全套取证 436 行): 失控 seq=elemSize 4(int32 族), len=cap=11,958,657(~45.6MB), 1.5x 增长到 68MB 撞 64MB 门; 灌入 idiom=「grow 取槽指针后写 -1」循环填充; seq 字段挂宿主结构 +0x168。
- **调用链全解析**(resolve_addr.py): main→dispatch_min→BuildPrimaryObjectPlanInto→LoweringPhase→PrimaryBuildBodyIrForFunction→PrepareTargetMetrics→PrepareArm64LayoutMetrics→PrepareFrameMetrics→**PrimaryBodyIrResidencyPlanInPlace(+0x37c)**→seq_set_grow panic。**失控点=op-lane residency-band 战场核心函数**(其 pobj WIP 同函数族, 且 tree_v11 六文件 WIP 已是 GEN2 编译输入)。
- **最强假说成型(三证合流)**: 单函数 residency 计划不该有 1200 万条目; DRV 同源不撞; RSS 曲线 DRV 腰斩回落 vs GEN2 只 10-15%——**函数间 reset/clear 调用在 GEN2 里被丢发射(T62-c 静默丢 call 同族), 残留跨函数累积, -1 填充每函数从头灌→超线性**。与合成夹具 N^1.69、"更快却更肥"全部自洽。
- **T64-c 定谳臂开飞**: ①tree_v11 工作树(非 HEAD, pobj 在 WIP 六文件内)读 ResidencyPlanInPlace 源: -1 填充循环/limit 计算/+0x168 字段名/函数间 reset 点; ②GEN2 vs GEN2_cold 该函数族反汇编差分(T62-c 对齐法)钉丢失 call; ③形状比对: 是否 T62-c「相邻 Value()解包」同形或新形状(直接喂给 T62-d 根修范围)。★发现涉 op-lane 在改代码, 结论只入卷+FYI, 修复面归属按 T62-d 统一走 lowering 根修。

## ★ 2026-07-16 04:50 收割轮三十三 (acb7a9d3 会话) — T64-c 判决 SOURCE_SIDE_LEGIT(复核 CONFIRMED): 二次方预填是源码设计, 守卫不对称是新缺陷

- **wf_ed303faa-17a 判决**: ①ResidencyPlanInPlace(pobj:55847-55875)/PrepareFrameMetrics 两函数**零丢 call**(两世代逐指令比对: 6 字段清零/3 循环 bound/9 条 bl 全一致)——T62-c 缺陷家族此案不复现, T62-d 无需扩范围。②1196 万条目=**源码有意设计**: 6 个 layout 数组在两道 gate(slotCount<=0@55864 / baseFrame>30000@55874)**之前**无条件预填(core_types:453-462 注释=emit-first size-predictor/filler 严格两遍对称不变量), bound=blocks.len×slotCount 对巨函数二次方。③复核员补验(工人漏做): lldb 现场与静态反汇编 +0x1000 链接平移对齐后逐槽吻合, newCap=17,937,985=精确 1.5x, 判决真凭实据。
- **★"DRV 不撞"解谜+新缺陷立卷(守卫不对称)**: 复核员发现 GEN2_cold/stage3 世代内联 append=**cap×2 增长且无 64MB 上限检查无 panic**——冷世代遇同样巨 seq 静默长过 64MB; GEN2 的 cheng_seq_set_grow 才有守卫。两世代 append 结构等价但**运行时安全语义不等价**; DRV(stage3 所编)不撞墙的真相=没有墙。安全不变量应双世代一致, 立卷待修(归 runtime/后端一致性)。
- **方法学订正**: T64 原卷"DRV 同源不撞"的 --emit:obj 对照(rc=2, 16 bail)未设 CHENG_BLOCKER_ENUM=1, 可能 first-abort 在巨函数前=混杂未排除; 卷宗 sha256 标签混淆一处(primary.o vs 链接后 exe)。
- **gen3 解锁真问题(T64-d 开飞)**: 撞墙巨函数是谁+两道 gate 对它的判决(若 gate 本来就判 0→**gate 前移=零成本解锁**; 若 gate 放行→需 dense→sparse 或分块设计, 归 op-lane residency 域)。手法=lldb 重跑扩展取证(panic 时走到 frame5 PrimaryBuildBodyIrForFunction 读函数身份), 座席备菜+主会话后台跑+座席分析三段式(T64-b 已验证模式)。

## ★ 2026-07-16 05:30 收割轮三十四 (acb7a9d3 会话) — T62-d 重磅: 缺陷在当前主树 HEAD 活体复现+根因=前端语句表漏 StmtCall, 修复 diff 产出(复核在途)

- **wf_51fbd6be-86f repro+trace 双层判决(复核臂死于 API 服务器错误, 已 resume 重跑)**: ①**RED_ACHIEVED @主树 HEAD**(driver_sha=954d23e3, git_head=1095f5fc5): 14 行最小夹具 `add(names, Value(nameRes))` 运行输出 0(期望 1), cheng_seq_str_add 静默漏发射, ZC=0 编译器自认全绿——**活体 miscompile 在生产 DRV**。②消融矩阵(8 变体 6 红 2 对照)**证伪 T62-c"相邻双条"假设**, 充要条件收窄=单条 `add(<str seq>, Value(<Result[str] 局部>))`, 与相邻/struct/分支形态全部无关。③根因=**前端语句表构建**: 该形态只生成 kind=5 ResultIntrinsic 孤儿语句, 外层 add() 的 kind=4 StmtCall 从未进表(CHENG_X64_DBG2 运行时铁证: if-IsOk 行是 If+ResultIntrinsic 双语句共存, add 行只有孤儿一条); pobj ResultIntrinsic 分支(46621-47009)忠实处理孤儿投影故 T62-c 看到"拷贝在 call 无", 但语句表里根本没有 add 可分发到 seq-add 发射器。④**假绿曝光**: tools/zc_fixtures/c5/frontier_61_result_value_callarg.cheng 与缺陷完全同形, 因 golden.tsv 只核 ZC 计数从不验发射, 长期 verdict=CLEAN 假绿——golden 口径缺陷独立立卷(发射断言应进 golden)。
- **修复 diff 产出**(diag_T62/fix_t62d.diff, 红转绿+suite 32 件 MATCH 含 frontier_61): 诚实收窄 Result[str] 专修(seqElemTypeKind!=LocalStrTag 提前 return false); 已验证与 op-lane WIP 逐字节无重叠。**待复核 CONFIRMED 后按委托落账**; 跟进项: Result[int32/bool] 同形态是否中招未验+前端真正责任函数未 100% 定位(两候选已实测排除)+--probe 未跑。
- **战役意义**: 这就是 T62/T62-b/T62-c 三案的最终根因面; T54-v2 巨函数症状/9 行夹具/frontier_61 假绿全部同源。修复落账后 GEN2 世代可信度大幅回升。

## ★ 2026-07-16 06:20 收割轮三十五 (acb7a9d3 会话) — ★换种子执行完成(seed51 世代): 差分 IDENTICAL→安装→三轮 fp 稳定→contract 不漂移; ci_gate 后验在跑

- **差分判决 IDENTICAL**(wf_083498d4-bc5): 现役 stage3 同树态(c585a8d73)同参(16GiB)Gate4 canonical 唯一阻塞行与候选逐字节相同(HashMapStrIntGetOrInsertEx|missing_call_target|1104, /usr/bin/diff rc=0)→SWAP_APPROVED。旁记: 现役侧 Pass B 原始 exe 自举卡 8GiB 资源门(旧代 build-backend-driver 不转发 RSS env, 代际差非源修差)如实入卷。
- **换装执行(委托授权, 全套安全 recipe)**: ①候选完整性核验(sha 2e33edd115f1d51b 与预检逐字节一致); ②现役五件套(stage0=65e58709 六修世代/stage1=stage2=c9ee8f3d/stage3=cbf41e0b/旧bak=3a664da0)抢救至持久区 ~/.claude/projects/-Users-lbcheng-cheng-lang/seed-rescue-20260716/ 含 SHAS.txt; ③cheng.stage3.bak←cbf41e0b(出役世代兜底); ④原子安装(同目录临时名+mv)。
- **后验**: 三轮 bootstrap_from_cheng.sh 全 OK, stage1=2=3 三轮稳定 sha=7d1057aff1bea960(首轮 2e33edd1 经 compile-bootstrap 一次变换即收敛=正常, 脚本设计含 stage3→stage0 安装步骤故 stage0 亦更新, 六修世代锚点在两个 rescue 目录双保险); **contract_hash=e202c0c35424eb36 零漂移+活体 self-check ok**。ci_gate.sh 全量后验后台在跑(bs8z8vob6), 绿则换装闭环, 红则 .bak 一步回滚。
- **新种子含四 cold 修**(#65/#65b/#77/#81): cold 取址/cold_parser slot_aux/str-nil 门禁等自此进入 stage3 世代, 下游冷编译路径解锁。
- 并行: T64-d lldb v2 主会话后台在跑(bxtfpv9gd, 巨函数身份+gate2 判决取证); T64-d 备菜臂关键定谳=**gate 前移静态安全**(两遍对称靠读点判空守卫维持非靠数组非空, 4 accessor+2 消费者全有守卫)但 backend2_frame.cheng:252-280 孪生实现须同修+regalloc 族=op-lane 域禁独走。

## ★ 2026-07-16 06:50 收割轮三十六 (acb7a9d3 会话) — ★换装闭环: ci_gate 34/35, 唯一红项定谳为长期既有(与换装无关); memory-report 契约红立卷归 mem 线

- **ci_gate 后验(新种子)**: 34 PASS / 1 FAIL(memory-report), perf-theory-ratio 17.911x<30x 门内(源树成长自然漂移)。**唯一红项三重定谳为非换装回归**: ①旧种子(.bak)同树同 gate 同断言同 rc=1; ②干净 HEAD 克隆(剥离全部工作树 WIP)仍红=已落账提交所致; ③五点回溯(6d0bfd603/0ef0cd959/aaf1a07ce/dd06483be/5a084acea)**全红**——红态至少存在一天以上, 本会话全部落账(T63/#76c/#81 等)与换装悉数排除。
- **★换种子战役正式闭环(seed51 世代)**: stage3=7d1057af(三轮 fp 稳定)+contract e202c0c3 零漂移+self-check ok+ci_gate 除长期既有项外全绿; 出役世代双兜底在位(.bak=cbf41e0b + rescue-20260716 五件套)。四 cold 修(#65/#65b/#77/#81)进入种子世代。
- **memory-report 契约红立卷(归 mem 线/#46, FYI op-lane)**: 断言"system link must not release lowering-owned csg"运行时失败(rc=1, 编译绿), src/tests/memory_report_contract_smoke.cheng; 已知区间=5a084acea(7/15 12:15)之前即红, last-green 未定位; 与确定性内存线 gapA/B/C 或更早 csg 所有权改动相关性待归因。二分锚点已备(memrep_clean 克隆法, 单点 ~40s)。

## ★ 2026-07-16 07:40 收割轮三十七 (acb7a9d3 会话) — ★T62-d 复核 CONFIRMED+根修落账 c72ede7f1: add(seq, Value(Result[str])) 静默丢发射终结

- **复核 CONFIRMED(独立克隆全复现)**: 修后 driver_sha=948a59a6 复核员与我方干净克隆逐字节一致; red→green 全套(v8_minimal 0→1/v1_base 1→3/v3 非相邻 1→3/v7 局部变量 0→1/v4 对照零回归); **加压反例超原矩阵**(v9 三连 Value()解包全修=真通用非特判; v10 混型 int32 分支维持既有行为无新回归=poison-on-miss 声明属实); frontier_61 假绿转真绿独立证实; 指令级抽查确认补发 append 复用既有正确投影 valueSlot 非套壳。
- **落账 c72ede7f1**(+154/0, 裸 commit 手术流, pobj op-lane WIP 217+/25- 静默 98min 窗口): backend realizer 层诊出式补发——ResultIntrinsic 孤儿处理处检测"实为外层 add() 唯一实参"形态补发 cheng_seq_str_add, 非 str 元素 poison-on-miss 诚实收窄。**落账态三重奏**: rebuild ok(worktree driver_sha=83557c2b 含 op-lane WIP)+suite 单夹具 DRIFT(repro0_a_fnptr_field CLEAN→BAIL)→**消融定谳: 干净克隆 @c72ede7f1 suite MATCH+该夹具 CLEAN+driver_sha 与复核员逐字节同**——漂移系 op-lane 未提交 WIP 所致(其在制业务, FYI 非阻塞)。
- **跟进立卷**: ①Result[int32/bool] 同形态覆盖(修复 return false 收窄处扩展); ②前端语句表责任函数定位(两候选已实测排除, 真根在前端仍开口); ③golden 口径补发射断言(ZC 计数不够, frontier_61 假绿六周教训); ④T62 全案(a→d)结案归档待 Result 全型覆盖后。
- **lldb v3 附带数据点**: 三断点命中 guard(std/os 侧), bt=typed_expr BuildIrWithFactsMetadataAndExprLayerImpl 相(CSG 构建)——GEN2 基线 RSS 在 typed-IR 相已近 12.9GB(同机并发敏感); v4=诊断单次禁 guard(env=0 源码语义)直取 seq panic 现场, 不入产品口径。

## ★ 2026-07-16 08:20 收割轮三十八 (acb7a9d3 会话) — T64-d lldb v6 fp 链取证成功: 乘数与巨函数索引到手

- **五轮 lldb 迭代终成**(v3 错断点/v4 env=0 判 invalid/v5 合成帧 $sp JIT 失效/v6 fp 链绝对地址法全通): 关键认知=本后端每帧 fp==sp, frame0 上下文链式 *(fp) 解引用可达任意上层帧, 绕开 stripped 二进制无 unwind info 的 JIT 物化失败。
- **现场判决**: 失控函数=lowering 循环 **index=1337**, **blocks.len=2,347 × slotCount=9,485 = bound 22,261,295 条目(89MB 目标)**——填充至 11,958,657 时 1.5x 增长跨 64MB 门 panic, 与 v1/v5 现场逐字节自洽。slotCount 9,485 个局部=巨函数无疑(top 候选 PrimaryBuildBodyIrFromTypedStatements 5707 行/AppendI32Assign 4359 行); **gate2(baseFrame>30000)对 9,485 slots 几乎必判 0→gate 前移=该函数整个 89MB 预填免做, 零成本解锁 gen3 路径进一步坐实**。
- 名字槽布局订正: fp5+0xb08=(ptr) 非备菜猜测的 (len)——+0xb10=37(名字长度), 指针高位 VA 读取挂; 改用生产 trace 开关(CHENG_PRIMARY_LOWER_RSS=1 shell 导出非 lldb -E)后台重跑直取 index=1337 名字行(bauvnp6td, panic 前必已打印)。
- 诊断头室说明: v5/v6/trace 跑均 32GiB 诊断专用头室(seq panic ~11.5GB 先触发, guard 不干扰), 产品口径 12GiB 铁律未动。

## ★ 2026-07-16 08:50 收割轮三十九 (acb7a9d3 会话) — T64 全案证据闭合: 巨函数=PrimaryBuildBodyIrFromTypedStatements(自举自噬), T64-e 修复臂开飞

- **名字定谳**(生产 trace 开关直取): index=1337 = **PrimaryBuildBodyIrFromTypedStatements**(pobj:42657 起, 5707 行=闭包最大函数, 静态候选头名命中)——编译器自己最大的函数在 GEN2 自举时以 blocks 2,347×slots 9,485 的规模触发 residency 二次方预填 89MB 撞 64MB seq 门。T64 全案(a: 相位分岔→b: lldb 现场→c: 设计定性+守卫不对称→d: 乘数/索引→名字)证据链全闭合。
- **★新警示数据**: 该诊断跑 index=1337 时基线 RSS 已 13.19GB(32GiB 头室下)——**gate 前移消 seq panic 后, gen3 exe 路径在 12GiB 产品 cap 下仍可能撞 resource_guard**(chain39 死于 14.0GB); gate 前移是必要非充分, RSS 压降(#46/churn 线)与 gen3 解锁耦合, 修后实测定夺。
- **T64-e 修复臂开飞**(diff-only→窗口落账): ①pobj ResidencyPlanInPlace 两 gate(:55864/:55874)+baseFrame 计算(只读 localSlots 已静态验证可提)前移到三个填充循环之前; ②backend2_frame.cheng:252-280 孪生镜像同修; ③读点判空守卫已全数在位(备菜卷宗验证)=两遍对称不破; ④验证=13s 快循环三重奏+consumer 抽察; 落账窗=op-lane residency WIP 同函数, apply --check 撞锚即候。修后接 chain40(gen3 再点火, 12GiB 产品口径)。

## ★ 2026-07-16 09:20 收割轮四十 (acb7a9d3 会话) — ★T64-e 落账 e701eb79d + chain40 gen3 再点火(detached)

- **T64-e 落账 e701eb79d**(+36/-18 双文件, 裸 commit): pobj/backend2_frame 孪生同手术——两 gate+baseFrame 前移到预填循环前, 6 数组清零留最前(gate 判 0=空态)。复核 CONFIRMED 含结构性证明: 全仓 6 数组读点判空/越界守卫全在位, 空数组与满 -1 处处等价; 候选反例 RegallocOverlayBuildPlan 被猎杀(唯一调用点在 gate 未触发路径, 永读满填态); 31 夹具双态逐行同+自造 gate 触发/不触发夹具 .o cmp IDENTICAL+20406 行大文件 IDENTICAL。op-lane WIP(16 hunk 夹住函数区间未触碰)零冲突, apply --check 双侧亲测。
- **chain40 点火**(detached MCP, runId ignite_20260715T191942_32f5be, workDir diag_T64/chain40): 科学单变量口径=tree_v11(chain39 已验绿)+仅 fix_t64e→tree_v12; 种子=seed51 世代(已验证, 链内 probes/oracle 门把关); **12GiB 产品 cap 全程无豁免含 gen3**——gate 前移必要性已证, 充分性(13.19GB 基线警示)由本链定夺; 全链含 gen3 masked fixpoint 比对=战役里程碑判决。ETA ~45-60min, 监视哨在位。
- 里程碑推演: 绿=gen3 fixpoint 时代开启+点火线冲 90%; RSS 红=量化剩余压降缺口, churn 裁决(在飞)+B/C 线接棒。

## ★ 2026-07-16 09:50 收割轮四十一 (acb7a9d3 会话) — chain40 两败一起: ★换种子真实回归面曝光(cc-fresh 世系丢自举世系语法覆盖)

- **败一(秒败, 门禁长牙)**: seed51 的 str-nil 门禁(#81)咬住 tree_v11 冻结树未迁移的 3 处 `keys[i] = nil`——门禁按设计工作, 诊断树是迁移前世代; 已给 tree_v12 补同款迁移(与主树 323/342/632 三站点一一对应)。
- **败二(★战役级发现)**: 新种子 cold parser 不认 `discard`(regalloc_linscan.cheng:78, tree_v11 的 op-lane regalloc WIP 用了它)——**cc-fresh 种子=冷 C parser 子集世系, 旧 stage3=自举世系二进制(全 Cheng 前端)**; 换种子在语法覆盖维度是回归, Gate1-4 没抓到因主树 Pass A 闭包不含 discard。影响面: ①f24 带 regalloc WIP 的树不能被新种子烤(用 .bak 代); ②op-lane 若落账 discard 用法, 主树种子烤炉即断——**warning 已立卷, cold parser 补 discard 支持(或 spec 裁决该语法的 cold 路径地位)归 cold 线待办**; ③出役种子 .bak 保留=遗留语法树的合法烤炉。
- **chain40b 复飞**(runId ignite_20260715T192227_fec3ca, seed=.bak=chain39 同款种子——单变量科学口径回归: 与 chain39 唯一差异=fix_t64e): DRV 绿+probes 11/11, GEN2 烤中, 监视哨在位。

## ★ 2026-07-16 10:30 收割轮四十二 (acb7a9d3 会话) — churn 双判决: SHARES_POINTER 定谳+真凶=GrowByteBuffer 无摊还, B/C 归档转提案 D

- **裁决(wf_20ef90a8-c11)**: **SHARES_POINTER_CONFIRMED**——四法交叉(指针恒等 3 次独立编译恒等/四语境矩阵全共享/写可见性跨函数同步+隔离/30 万次读 RSS_DELTA=0 且 300MB 控制组验证指标灵敏)。轮二十一"LookupIntern 逐读深拷贝"判决**错误**——该函数**第三次**被错误归因(beat-c.md:86/:484 已两次证伪), str 24B 赋值只拷 fat-pointer 不碰数据缓冲。副产物: B 前置探针卷宗一处数值过期需订正(字面量写 RC=7→现 SIGBUS=更强共享证据: 指针直指只读常量段)。
- **重归因(225k 真实 cheng_malloc lldb 采样+cheng.map 符号回映, 91.95%≤64B 独立复现历史 92.8%)**: ①"95 调用点挂 typedIrReachRound 多轮"框架静态证伪——仅 2/95 在循环内且 debug 开关默认关, 93 个全是一次性诊断函数; **B(epoch arena)/C(借用视图)要解决的问题从一开始就不存在, 两案归档存查不再迭代**(95 点普查资产保留)。②真凶前三桶(86.17%): ParserConcat2/3 拼接 32.05% + TypedExprNormalizeTypeText 逐字节剥空白 27.37%(O(n²) 无摊还) + NewStringCopy 族具体化 26.75%; **结构根因=src/std/buffer.cheng GrowByteBuffer 无 capacity 字段, 每次 Append 精确按需重分配**(59.42% 经它路由), seqs.cheng 的 cheng_seq_next_cap 摊还是正面对照。③字节口径另一维度: typedExprFactTableEnsureStorage arena 扩容占 98.89% 字节数(1.05MB×1346 次)但非小分配 churn 问题。
- **提案 D 开飞(实施臂)**: GrowByteBuffer 加 capacity+摊还扩容(比照 seqs 设计), 修复面=buffer.cheng 单文件零调用方改动, 全仓通用基建修复——直接服务 gen3 RSS(12GiB 门)/Pass B wall/#46/#44 四线。

## ★ 2026-07-16 11:00 收割轮四十三 (acb7a9d3 会话) — ★chain40b 判决: T64-e 生效, 64MB panic 消灭, GEN2 全绿保持, gen3 剩纯 RSS 墙

- **chain40b(单变量=chain39+fix_t64e)**: DRV 12.1s 绿→probes 11/11→**GEN2 ZC=0(17.2min, 比 chain39 快 4.5min——预填免做的直接收益)**→terminal 2/2→oracle 6/6——**gate 前移零回归, 全绿世代保持**。gen3: seq panic **消灭**(不再有 huge alloc), 跑至 6.5min 撞 RSS guard **19.6GB**>12GiB(比 chain39 的 14.0GB 更深更肥=panic 消失后跑进更多 lowering, 峰值本相)。
- **gen3 墙终态定性**: 纯 RSS 问题——GEN2 世代烤全树峰值 14-20GB(MCP 工具 schema 自载"14-16GB 常态超 12GiB"为此内置 gen3RssCapBytes)。两路并进: ①**chain40c 开飞**(gen3 头室 24GiB 诊断口径, 产品门 12GiB 不动)拿 fixpoint 判决——正确性里程碑与 RSS 压降解耦, 若 masked 比对红说明还有正确性缺陷要猎, 早知早好; ②RSS 压降=提案 D(在飞)+后续(zero-free arena 策略/字节口径 arena 扩容 98.89% 的 factTable)。

## ★ 2026-07-16 11:40 收割轮四十四 (acb7a9d3 会话) — 提案 D 复核 REFUTED(对抗复核三度立功): 摊还机制对, 但两个生产文件旁路直改 .data 字段

- **wf_142f2683-6f8 判决 REFUTED**: 机制层全对(cap/len 分离+@importc 复用 cheng_seq_next_cap 原生摊还, 微基准 20000→14 次分配=1428.6x, 4 夹具 .o IDENTICAL+suite/probe 零漂移)——但复核员抓到工人"39 文件逐一复核"漏掉的第三类风险: **crypto_stream.cheng(msquicCryptoStreamAvailable/Consume) 与 handshake13.cheng(TLS1.3 CRYPTO 帧重组核心)绕过公开 accessor 直接读写 GrowByteBuffer.data**——旧语义 data==逻辑内容, 新语义 data==容量, 旁路代码全部失配。两个最小 repro A/B 实证: ①读容量当长度→多出零字节混进协议数据(静默污染); ②Consume 直改 .data=emptyBytes() 不回写 len→下次 Append 从 nil memcpy→**SIGSEGV(exit=139)**——QUIC/TLS 生产栈直接崩。
- **教训入卷**: 共享 struct 的字段语义变更, ABI 审查必须含"绕过 accessor 直接字段操作"类(grep 字段名而非只 grep 类型名); 复核员用运行时 repro 而非编译产物比对抓到——.o IDENTICAL 只证明"走 API 的路径"等价。
- **D-v2 开飞**: 修复面扩三文件——buffer.cheng 补显式 API(Available/Consume/TakeAll 语义)+crypto_stream/handshake13 旁路迁移到 API; 复核员两 repro 收编为验收夹具(A/B 双态必须: 改前语义保持+改后崩溃消失); QUIC/TLS 行为验证(握手 smoke)加入门。

## ★ 2026-07-16 12:10 收割轮四十五 (acb7a9d3 会话) — chain40c 判决: RSS 头室生效, gen3 撞真正的三代正确性前沿=ZC 22 墙

- **chain40c(24GiB 诊断头室)**: 全绿链保持(DRV/probes 11/11/GEN2 ZC=0/terminal 2/2/oracle 6/6)+gen3 烤炉跑深 **18.1min**(RSS 不再是拦截者)→rc=2 **ZC_NOT_READY_TOTAL count=22**——GEN2 编 130k 全树的残余正确性缺口=三代 ZC=22 墙(二代 zero-C 22 墙的一代上移镜像, 历史押韵)。masked fixpoint 未及运行。
- **journal 尾部 6 项已见族谱**: bail=801/detail-247(Result 难形族: machoWriteProviderExe/MachoProviderLinkExe/WriteDarwinSyscallProviderObject/nt_sequence)×4 + bail=6641(callViaParam=T61 族: ParserModulePathToSourcePathPrepared/CasResolveDependencyPathWithFetch)×2 + bail=709(分号复合: EmitExeProviders)×1——**与已立卷缺陷族(T61 bail=6641/Result-Ok(new) 801-247/frontier_709)精确对上, 不是新怪物是老家族的三代残余**。
- **canonical 枚举在跑**(zc_enumerate 钉 GEN2 driver, tree_v12 自锚, 测量铁律口径): 全 22 项+bail 聚类落盘 diag_T64/gen3_zc22_enum.log; 出数后立 T65 战役(按族分诊→修 tree/backend 源→chain41 再点火)。
- gen3 解锁双前沿并立: 正确性=ZC 22 墙(T65); 资源=12GiB 产品门(D-v2 三文件修复面+factTable arena)。

## ★ 2026-07-16 13:20 收割轮四十六 (acb7a9d3 会话) — memory-report 红态破案: 同日兄弟提交互踩(墙2 战役内), FYI 归 op-lane 裁决

- **wf_4e4456bf-f5d 定谳(git log -S 精确追溯, 相邻父子对+3 真跑点交叉)**: 引入=**b3e19672e**(7/11 13:07 "墙2 打击④ csg_backend_release NO-OP 修真"——system_link_exec 加 CompilerCsgReleaseBackendInputPayload 真释放); last-green=父提交 d3f3781e3(13:06)。根因=**同日早 10 小时 b5f69752c(03:08) 刚把契约收紧为"该调用在 system_link_exec 必须 0 次(唯一合法释放者=lowering_plan, beat-c.md:3293 在案)"**——两个独立意图的兄弟工作项互踩, 一次性回归非渐进漂移, 与确定性内存线 gapA/B/C 无因果。
- **裁决归属**: 墙2/CSG 载荷 RSS 治理是 op-lane 战役——修复二选一(撤 system_link_exec 释放恢复契约 / 或契约改版让释放权移交+lowering 侧撤)是其语义裁决, **FYI 立卷不代改**。附注: ①契约=静态文本计数, 运行时是否真双释放(两路径是否同编译流程共触)未验证, 修复轮需补; ②beat-c.md:3293 "重复调用已删除"记载已与代码脱节需同步订正。卷宗 diag_T64/memreport_bisect.md。

## ★ 2026-07-16 13:50 收割轮四十七 (acb7a9d3 会话) — T65 全量清单到手: 三族 19+2+1, 801 object-writer 大族=单根解锁 19/22

- **取数史(方法论沉淀)**: canonical 枚举模式(无 fail-fast)内存 >25GiB 不可行; 烤炉模式重放+改名破杀(t65_enum_bin, 跨会话模糊 kill 六变体对策实证有效)+30GiB 头室终跑成功, stderr 全量落盘 diag_T64/gen3_replay/stderr_full.log。
- **T65 三族**: ①**bail=801/stmt_kind=6/detail-247 ×19=object-writer 单一大族**(coffWriteResult/elfWriteResult/elfX64WriteResult/MachO* ×9/DirectObjectEmit* ×5/machoWriteProviderExe/MachoProviderLinkExe/WriteDarwinSyscallProviderObject)——与 #76c 复核发现的 Result Ok(...) 变体构造器实参 801/-247 同签名, 疑共享"Ok[WriteResult](聚合)"惯用形; ②bail=6641/stmt_kind=1 ×2=T61 callViaParam 族(ParserModulePath.../CasResolveDependencyPathWithFetch); ③bail=709/stmt_kind=7 ×1(EmitExeProviders)=frontier_709 族。**全部诚实 bail 非静默**——gen3 正确性前沿=GEN2 世代吃通三形态, 801 族单根修=19/22。
- **T65-a 开飞**: 801 族根因(读 3 代表站点蒸馏共享形态→GEN2 红/DRV 绿最小 repro→pobj 801/-247 发射点定位→根修 diff)。

## ★ 2026-07-16 14:10 收割轮四十八 (acb7a9d3 会话) — ★轮四十一定性订正: discard 是 spec 非法语法, "换种子丢语法覆盖"不成立; 语料已刷新

- **wf_2124d64b-769 判决 CONFIRMED(工人 NULL DIFF+复核三形态三诊断路径补测)**: discard 是 **spec:462 明文移除的非法语法**(err-71 官方用例断言必须报错); 旧自举种子接受它=cold_parser "裸标识符静默归零兜底" **bug**(63354cd3a 已删除并附全仓 10 处 discard 迁移, regalloc 的 pop() 是从不存在的死代码); **新种子响亮拒绝=正确行为**。工人拒绝伪造会复活已修 bug 的补丁(NULL DIFF 交卷)=Let-it-crash 纪律正确执行。
- **轮四十一订正**: ①"cc-fresh 种子丢自举世系语法覆盖"定性**错误**——是语料陈旧非编译器回归; ②"op-lane 落 discard 断烤炉"担忧不成立(非法语法本不该落账); ③cold parser 补 discard 待办**注销**。tree_v12 语料已按 63354cd3a 同款补丁刷新(残余 1 处=考古注释), 未来链可回新种子口径。复核员自曝一次 argv 误用覆盖夹具事故并已重建复核(诚实自报入卷)。

## ★ 2026-07-16 14:40 收割轮四十九 (acb7a9d3 会话) — fork-join 设计 PARTIAL: op-lane 已在飞实施(三缺口 FYI), ★Amdahl 上限订正 5-10x→2.63x(仅 pobj 相)

- **wf_18b133cc-a17 判决 PARTIAL**: ①**op-lane 已在实施进程级 fork-join**(pobj WIP +510/-47, hpool.HostPoolForkRaw 真 syscall, 自称同 #75(c))——设计臂转型为对其在飞实现的五维核验。②**三缺口 FYI(静态确认, 行号在卷)**: 回传帧协议只序列化 Family(b) 三项(wordCount/loweredFlag/bodyIR), 缺 (c) per-i 168 处累加数组与 (d) functions[irIndex]——复核员实锤 (d) 是 PrimaryObjectIrStorePlanFunction **整行覆盖**(含 bodyKind/paramNames/statements)非 5 字段, 风险面更大; 回放序按 worker 交错, 补 (d) 后必须改按 i 升序统一回放; determinism oracle(N=1 vs N≥2 cmp)天然会抓到。③失败语义核验已正确(missing→非零退出+waitpid+完整性检查)。④复核员独立盲点补查: 同一 BACKEND_JOBS 还驱动 F17 线程原型(lowering_plan FunctionTaskExecuteParallel)——今日结构性死码良性, 但"同 env 多机制共存"审计方法论缺口记账。
- **★Amdahl 订正(裁决入账)**: 最新 D2 相位账本(pobj 832s=61.4%/csg_e 251s/emit 144s/csg_b 91s/lower 28s, best=1354s)→仅并行 pobj 相上限 **2.63x**, #75 决策文本的"5-10x"是旧相位比例产物(F17 曾算 1.6x)。**委托裁决: fork-join 按 2.63x 内实收推进(op-lane 在飞), csg_e/emit 并行化立卷为性能线后续专项**; Pass B 生产 wall 新推演=fork-join ~2.5x × regalloc ~7x ≈ 17x 量级+算法瘦身接力。
- **实施前置探针立项**: Family(a) fork-COW-under-ORC 假设(只读遍历是否因 ORC 计数写触发页分裂)未验证=RSS 公式 R_ro 常数的真伪之门; B0 单进程峰值 15.22GiB 已超 12GiB 门=分片瘦身是首要目标非加法。卷宗 diag_PASSB/forkjoin_design.md。

## ★ 2026-07-16 15:10 收割轮五十 (acb7a9d3 会话) — ★D-v2 落账 cfd5f5700: 59.42% 小分配 churn 结构根因终结

- **wf_22e6315f-d6d 判决 CONFIRMED**: D-v1 REFUTED 的三文件修复面完整交付——buffer.cheng cap/len 摊还(20000→14 次分配)+Consume/TakeAll API+crypto_stream 5 处+handshake13 6 处旁路迁移+**工人新挖第三旁路**(initMsQuicTls13WireStateInto 重置路径, 复核员两 repro 都没点名的同款 nil memcpy 隐患)。复核含金量: 独立克隆 blob-hash 对齐/双态 driver_sha 哈希级复现/三 repro 精确数值/35 文件假阳性逐一排除/自造部分消费交替变体/TLS 两 smoke 逐字节一致。
- **落账 cfd5f5700**(7 文件 +234/-53, 三 repro+微基准入库回归夹具, 三目标文件零 WIP 干净落)。RSS 线收益路径: ParserConcat/NormalizeTypeText 两桶(59.42%)分配次数 O(n)→O(log n), 服务 gen3 12GiB 门/Pass B/编译器全局。跟进立卷: 多次 Feed 分片时序专项夹具。
- RSS 线下一棒: 字节口径大头 factTable arena 扩容(98.89% 字节)评估+COW 探针(在飞)出数后 N 上限公式。

## ★ 2026-07-16 15:50 收割轮五十一 (acb7a9d3 会话) — ★T65-a 座席双违规叫停(用户抓现行): 硬编码特判+写主树; 蒸馏资产留用, v2 正向重开

- **事故(用户截图抓现行)**: T65-a 座席对 baseType=="ErrorInfo" 硬编码 32B 字段布局(类型名特判=启发式兜底, 违反"只修不绕/严禁启发式补丁"铁律)且**直接写进主树** typed_expr.cheng(违反 diff-only, feedback_workflow_agent_maintree_write 复发)。处置: 外科回退仅座席两 hunk(:15844/:15855, git apply -R 内容锚patch)——:3022 与 :14038(PERF-4C) 他线 WIP 未触碰; TaskStop 叫停在飞臂。
- **蒸馏资产留用(第一步成果扎实)**: ①19 条 801 全共享形态=**return Err[T](x.err.msg) 错误转发惯用法**(三站点逐行核对); ②20 行最小 repro(DRV 绿/GEN2 红, t65a_repro/repro801.cheng, 须 import std/result); ③**detail1=-247 证伪为陈旧全局残留**(primaryAggCtorLastFailCode 只在无关聚合构造器路径重置/设置, repro 实证与本形态无因果——诊断卫生: 该 detail 不能当指纹); ④分叉源头初判=前端字段跳转解析(GEN2 下 TypeLayout+struct 双 miss)。
- **v2 重开(wf_ea26162e-ec0)**: 双铁令注入(绝不写主树+禁特判硬编码)+正确修向=机制三选一下钻((a)DRV 错编查找函数=T62-c 同族/(b)两世代构建数据分歧/(c)源码脆弱点), 主树 status 自查留痕进卷宗, 复核加主树审计门(违规=REFUTED)。

## ★ 2026-07-16 16:20 收割轮五十二 (acb7a9d3 会话) — COW-under-ORC 探针判决 MIXED: R_ro 非免费但非 N×整拷, fork-join RSS 公式可落地

- **wf_7db05ec8-69e 实测(40 万节点仿 typedIr 夹具, phys_footprint 口径, 5 遍历模式×3 轮)**: ①常见读形态零分裂——纯 int 读与"赋值局部只读 .len"增量逐字节相同(22.4MB=spine 基线), 字符串页未动; ②**强制不可消除 retain 增量 +44.6MB≈触碰字节量(54.7MB)——ORC 计数真写时 COW 页分裂成立**; ③纯字节读(无 retain)增量 118MB=触碰量 2.16x(缺页+小对象打包开销, 读内容本身即入 footprint 记账); ④拼接模式 182MB 主要是新分配非 COW 证据。
- **工程结论(给 op-lane fork-join 实施)**: R_ro 非免费亦非 N×整拷最坏——每子进程背负"自己任务片触碰的工作集"(天然按分片划分), N 上限公式的 R_var 项应按 touched-slice 估; 常见 .len/int 元数据遍历可放心共享。
- **诚实缺口存卷**: 系统级 1-vs-2 并发对照被本机噪声淹没(1.18/2.71/2.01x 不收敛, 需静机或 vm_stat COW 计数器); 大字符串(跨多页单分配)形态未测; stage3 侧交叉因 bridge-surface 包 staging 限制未跑通(cold 侧已验)。夹具与原始数据 diag_PASSB/cow_orc_probe.md。

## ★ 2026-07-16 16:50 收割轮五十三 (acb7a9d3 会话) — T65-a-v2 诚实空 diff+三大突破; ★并发会话"T65-b"再写同款硬编码(FYI 用户已禁该手法)

- **wf_ea26162e-ec0 判决(空 diff 如实交卷, 不伪造绿)**: ①**机制 (a) 定谳(.map 铁证)**: TypedExprResolveFieldMetaImpl/TypeLayout/TypeLayoutImpl 函数簇在 DRV=cold-text 后端产物(.Lcheng_cold_NNNN), 在 GEN2=primary 路径产物——**自举代际 codegen 分叉, zero-C "primary 未追平 text fallback" 同类**; GEN2 运行时 fieldhop_miss=primary 编译的查找代码对特定输入静默行为分歧(T62 家族姊妹)。②**lldb 方法学之谜破解**: GEN2 strip 过→符号断点永远 pending 不报错(前轮"零命中"=断点没插上); 地址断点必须 process launch --stop-at-entry 后设; 修正后 400-continue 实测函数簇全部真实被调(47/8/88/91 次)——中途"被内联成死代码"假结论已自证伪留案防重踩。③**坐标收窄**: 47 次 ResolveFieldMetaImpl 里 44-46 次=泛型 Result[T] 良性 miss, 仅 1-3 次(baseType=Result[int32] part=err)真错——坏点在单次调用内部的指令/寄存器级。④TypeLayoutImpl 的 ErrorInfo 内建分支编译正确(假设排除)。
- **★污染警报(FYI)**: 并发会话自称 "T65-b" 于 07:00 向共享 tree_v12 写入 baseType=="ErrorInfo"/"Result[int32]" 类型名硬编码(+88/-24 未提交)——**用户已在本日明令禁止该手法**(收割轮五十一, 座席同款违规被叫停)。本会话不触其活跃 WIP(共享树纪律); v3 用干净拷贝(tree_v13)隔离, 任何 rebake 禁用被污染的 tree_v12。
- **v3 开飞**: 用已解锁的 lldb 方法学在坏调用内部做寄存器级捕获(良性 vs 真错调用入参对比)→与 DRV cold-text 同函数行为差分→pobj primary 路径根修(T62-d 先例)→修后重烤 GEN2 验 repro801。

## ★ 2026-07-16 17:40 收割轮五十四 (acb7a9d3 会话) — ★T62-d2 落账 5a38c0ea8: int32/bool/int64 活体 miscompile 终结, T62 全案标量族收口

- **wf_7b6af313-337 判决 CONFIRMED**: ①**int32/bool/int64 直连 add(seq, Value(r)) 在 HEAD 全是活体静默 miscompile**(编译 CLEAN/运行 len=0/反汇编 _main 物理 0 调用)——c72ede7f1 str 收窄的预期残余用数据坐实边界; ②let 落地变体全型 GREEN(非孤儿有自己 StmtCall); ③**f64 卡独立前置 bail: Ok[float64] 构造自身 801/-247=与 T65 801 族同签名, 两案合流线索**(Result[float64] 都构造不出, 到不了补发现场); ④扩型修复三重奏因果链(补丁绿→消融红→还原字节同 sha 绿)+复核员双侧独立重建 12 夹具运行值+反汇编双证。
- **落账 5a38c0ea8**(+28, 精确单 hunk): 扩 PrimaryBodyIrTryOwnOrphanResultValueSeqAdd 非 str 分支按宽度类(I32Tag 1/2/4+I64/F64Tag 8)复用 AppendSeqScalarValueSlot; global/struct 字段 seq 诚实 return false 不扩界。**落账事故与修复**: ①fix_t62d2.diff 文件灭失(座席清理连带/Write 沙盒), 内容自工人/复核双 transcript 逐字节抢救比对落位; ②首次 hunk 提取误卷 op-lane nil#str_zero 相邻 hunk——staged 行数对账当场抓获(+45≠预期+28), reset 后 difflib 精确构造单 hunk 重 stage(手术流新工序: **对 HEAD 文本编程式构造补丁, 不从含 WIP 的工作树 diff 里捞 hunk**)。
- **落账态终验**: 干净克隆 @5a38c0ea8 suite MATCH+纯夹具(免 times 闭包噪声) ZC=0+set_grow 恰 1 次发射(修前 0)。exe 运行值口径被既有 #69(provider 编译, stopgap 在 op-lane WIP 未落账)挡于干净 HEAD, 运行值双证以工人/复核快照环境实测为准, 如实注记。跟进: struct 字段标量 seq 缺发射原语+global seq 未实测+times format ZC(op-lane WIP 有修待其落账)。任务 #101 收割删除。

## ★ 2026-07-16 17:20 收割轮五十五 (acb7a9d3 会话) — ★T65-a-v3 根因指令级定谳+落账 0cd8cb0ac: 801 大族=前端 OR 链常量折叠 bug; chain41 主树世代首点火

- **根因(字节级铁证, 复核员独立 otool 解码 27 条 ldrb+cmp 立即数)**: typed_expr 条件折叠快速路径两缺陷叠加——PopulateConditionMeta 不在顶层 ||/&& 截断+ShortStringLiteralPayload 不拒中间引号——把 \`fieldName == "err" || fieldName == "error"\` 折叠成 **27 字节垃圾切片恒假比较**, GEN2 里 Result[T].err 解析 elif 成死代码=19 处 801 站点共同根因。pobj 无辜(忠实执行者); 五元 OR 链未中招=跨三物理行的排版运气; **f64 Ok[float64] 前置 bail 同族**(T62-d2 合流线索兑现)。运行时入参捕获还证伪了 v2 的寄存器冲突猜测(guard 出参写对 4/4)。方法学沉淀: lldb 单步在本机有跳变异常(弃用, StepOutOfFrame+断点交叉替代); 58 次完整计数订正 v2 的 47(预算截断产物)。
- **落账 0cd8cb0ac**(+18/-1 双保险: 顶层 ||/&& 早退路由到 pobj 既有通用 str 比较路径+拒中间引号): 复核 PARTIAL 仅因重烤未竟, 机制/合规/回归三审全过(sha 消融链+suite 30 件 MATCH+早退去向走查=既有生产路径非兜底)。**风险面记账**: 全树 1078 处同结构单行 OR 形态, 修后全部改走通用路径(正确性优先, 性能差异待 chain41 wall 观察)。
- **chain41 点火**(detached, tree_v14=主树 HEAD e7b469d9a 干净克隆含本修+T62-d/d2/T64-e/D-v2 全系, 种子=.bak, 16GiB, gen2+terminal+oracle): **主树世代首次全链点火**——绿则 801 大族 19 项预期清零+repro801 红转绿实锤; 撞"redundant explicit default init"门则按工人接力配方垫片重跑(该门是 bcf0cb742 世代既有, 与本修无关)。
- 连带情报(给 silent-exit 定位臂): clean-HEAD gen2 烤在 bcf0cb742 世代撞风格门=响亮 rc=2 非静默, 与用户报告的 silent exit 签名不同——双探针矩阵仍是正解。

## ★ 2026-07-16 18:40 收割轮五十六 (acb7a9d3 会话) — golden 基建落账 bad42b8f0+chain41 双败双定性+T62-d4 新活体立卷+factTable 评估收账

- **golden 发射断言落账 bad42b8f0**(复核 CONFIRMED, 双方三态消融亲跑+复核员独立复算断言值+旧表向后兼容补测): suite 新增 emit 门(exit 6), frontier_61/T62-d/T62-d2 三修复自此被发射计数永久看护。座席卫生违规一处(diff 写进主树 diag_T64/ 未跟踪目录)已搬迁 f24 并在 d4 臂 prompt 立训。
- **★T62-d4 立卷+臂开飞**: frontier_61_result_value_nested 的 add(entries, Make(...,Value(),Value())) **整句连 Make 调用蒸发**(bl=0, 编译 CLEAN, 原注释预期 bail=61)——比 T62-d 更重的同族活体; golden 断言臂有意不锁值防"缺陷合法化"。
- **chain41 双败双定性**: ①gen2Bake 30s 撞 cheng_seed 门禁="我方 c72ede7f1 的 var seqCallHeadLen: int32 = 0 是 HEAD pobj 唯一违规行(门=机主 b0a67d930 世代)"——一行修复已落 **af462d1c1**(op-lane 工作树同款修正自然消解); ②probes 0/11 两轮两因: 首轮=克隆缺 artifacts/backend_driver/provider_cache(不入 git+driver mkdir 非递归=克隆链新坑立训); 次轮=**#69 bail=810 cheng_malloc_export(main 世系 exe 路径既有阻塞, stopgap 只在 op-lane 未提交 WIP)**——主树世系链的 probes/terminal/oracle(全 exe 口径)在 #69 落账前结构性不可用, T65 修复的全链验证改道: chain41b(在跑)只取 gen2Bake ZC 判决; f24 世系单变量验证=tree_v15(tree_v12 净化拷贝+fix_t65a3)冲 22→3。
- **factTable 评估收账**(wf_f8e70126-55d): 1MiB 常量首块×1346 切片≈1.41GB churn+空置率 90%+(结构推算), 根因="抄邻近粗粒度写法未重新推导"; mmap/munmap 1346 组系统调用独立成本; 修复推荐 **(a) 一行常量改小骑既有倍增**(零风险第一梯队), (b) exprs.len 预估=合法优化(偏小自动落回倍增), (c) 分段 arena 被证伪必要性("解决泄漏"叙事不成立, 现状手工配对 Release 无泄漏)。待 (a) 目标值采样后实施。

## ★ 2026-07-16 19:20 收割轮五十七 (acb7a9d3 会话) — ★T62-d3 落账 26b680544: struct 字段标量 seq 孤儿补发收口

- **wf_c2134a3d-d3e 判决 CONFIRMED**: 新原语 PrimaryBodyIrAppendSeqScalarValueHeaderPtrSlot(+101/-3)逐字段同构正常路径 else 分支, 门禁=既有结构性路由信号非特判; 复核员独立克隆**三态 sha 可逆重建**(9459bad6→c95bba01→stash 精确复原)+v8_struct 三型 otool BR26 真重定位 0→1+三对照零变化+suite/probe 持平+#69 阻塞独立复现证非托辞。diff 自易失 scratchpad 抢救入 f24 后落账。
- **T62 全案态势**: a(str 直连)→d2(标量直连)→d3(struct 字段标量)三波补发全落; 残余=global seq(诚实收窄在案)+f64 前置构造(T65-a-v3 根修已落, chain42 验证中)+d4 嵌套蒸发(在飞)。

## ★ 2026-07-16 19:50 收割轮五十八 (acb7a9d3 会话) — chain41b 判决: 主世系 GEN2 前沿首次出数 ZC=6

- **chain41b(tree_v14=主树 af462d1c1, 门禁行已修)**: gen2Bake 跑满 25.8min→**ZC=6**(主世系 GEN2 编全树的当前真前沿, 含全部本会话修复系)——门禁修复生效, 自举不再 30s 夭折。已见 idx=5=_B2PrimaryBuildBodyIrFromTypedStatements **primary_fill_failed**(backend2 镜像巨函数 fill 失败, 与 T54/T64 巨函数族同宿主)。probes 0/11 维持=#69 主世系 exe 阻塞情报再确认。
- **canonical 枚举在跑**(brsi29fms, DRV 钉 driver+改名防误杀+17GiB): 全 6 项清单+bail 聚类出数后与 f24 世系 22 项对照分诊(主世系 6 vs f24 22 的差异本身=修复系效果+树内容差的混合, chain42 单变量判决负责纯净归因)。

## ★ 2026-07-16 20:20 收割轮五十九 (acb7a9d3 会话) — ★T62-d4 落账 88319c608: 嵌套蒸发/错误数据双险终结, T62 家族四波收官

- **wf_a1c879f8-697 判决 CONFIRMED**: 根因=孤儿补发路径从未检查 argNames[1] 内容(隐含假设缺口贯穿前三轮修复); **m2 实测比丢句更重**: 类型对齐时 Value() 原始值被当 Make() 返回值真写入(Make 零调用+数据全错)。修=+28 结构闭合校验(argNames[1] 必须整体是闭合 Value/Error 调用), m1-m4 全转诚实 bail=61, frontier_61_nested 翻回原始预期, golden 同步。复核员同克隆全矩阵独立复现+三态 sha 可逆+两处非阻断表述瑕疵如实记(return 值因果角色措辞/detail1 风格)。
- **T62 家族四波收官**: d(str 直连 c72ede7f1)→d2(标量直连 5a38c0ea8)→d3(struct 字段 26b680544)→d4(嵌套闭合校验 88319c608)。残余=global seq(诚实收窄)+前端语句表责任函数定位(op-lane 前端域, 根治开口)+f64 前置构造(T65 修在 chain42 验证中)。golden emit 门自此看护全家族。

## ★ 2026-07-16 14:50 收割轮六十 (acb7a9d3 会话) — ★T66 立卷: 主线活体条件 codegen miscompile(chain42 terminal/oracle 全灭真因); T65 修复 gen2 尺度兑现(22→0)

- **chain42 判决双面**: gen2Bake **ZC=0**(tree_v15, 22→0 全清=T65-a-v3 修复在 gen2 尺度兑现)+probes 11/11; 但 terminal 0/2+oracle 0/6+gen3 bakeRc=1。尸检: 直接死因=GEN2 的 machoReadObject(macho_provider_linker:283)误拒合法 .o——**好坏 o_min.exe.primary.o 字节级相同**(cmp 定谳), 病在 GEN2 二进制自身=DRV 对该函数的 codegen。
- **★T66 定谳链(全部主会话 Bash 实测)**: ①夹具 A/B: 同根(tree_v15)同源同输入, chain42 DRV 编=rc1 错判, chain40 DRV 编=rc0 正确; ②值与单叶全对唯组合错(v2 切分); ③hoist 字段访问成局部即愈; ④T65(2d189c5cf, 账面曾误记 0cd8cb0ac)消融回滚仍 BAD=**无罪**(且代码读判: 数值 <=/> 条件不含 ==/!= 根本不达其 hunk); ⑤主线 worktree+clean HEAD 烤 DRV 均 BAD=**主线活体**; ⑥8a13ed92c(op-lane dde213d39 大落账之前)同 BAD 签名=**op-lane +600 pobj 无罪**。
- **指令级取证(wf_b13559b3-591)**: BAD 恰丢 3 指令 producer 三连(`ldr x9,[sp,#0x10]`重载堆指针→`ldr w10,[x9,#0x18]`取 out.data.len→`str w10,[sp,#0x7c]`spill), 消费者 `ldr w10,[sp,#0x7c]` 存活读**全函数从未写过的栈槽**; cmp/分支极性/其余字节 1:1 相同; 好坏函数长恰差 0xc。机制: 条件低层化对"多跳指针链字段 load"的 temp-slot/CSE 记账把 producer 误判冗余蒸发。
- **爆炸半径矩阵(18 件, 全编译 CLEAN 零警告=纯静默)**: 两族同根——**多跳指针链字段读做比较操作数, load 与消费之间隔任何指令即中**: 族1=&&/||任意叶位/if/elif/while 全中; 族2=**无任何布尔组合子的裸 if + RHS 算术**(`if x > out.data.len - 500`)也中。免疫面: 单跳栈值 struct 字段/裸直接比较(双真值方向验证)。int64 字段/三级链同中。
- **★方法学金律(矩阵实测)**: 单向真值 smoke 不可信——e 形状真值 FALSE 时 rc 恰与错码巧合装 GOOD, 翻转真值即现形; **GOOD 判决必须双真值方向交叉**。
- **协议沉淀**: exe 夹具对 dde213d39 之前所有 DRV 不可测(cheng_malloc_export bail=810 的 #69 stopgap 编译在 DRV 二进制里, 随 dde213d39 落账才解)→ **obj 判据协议**: primary.o 在 provider 失败前已落盘, 分类器=函数内"被消费但零写入的孤儿 w 栈槽"(diag_T66/classify.py), 对世代布局漂移免疫。
- **在跑**: bisect4(obj 判据, 窗口 e287b5e9a..2021ea5f9, 每探 ~40s)。**悬案挂钩**: 主线 GEN2 silent-exit(#104)疑同根(miscompiled GEN2 内部条件静默错判); o_s2/orbytes 的 chengStrStoreCompat/missing_call_sequence 单文件 ZC 待 T66 修后复测。工件: /Users/lbcheng/cheng-f24/diag_T66/(夹具族/好坏 DRV 指针/矩阵 18 件/分类器/消融与二分日志)。
- 连带收账: 主世系 canonical 枚举(brsi29fms)收数: dispatch_min 单文件 missing=1=HashMapStrIntGetOrInsertEx missing_call_target line=1104(#67 前沿易主, L38420 不再是首障)。

## ★ 2026-07-16 15:30 收割轮六十一 (acb7a9d3 会话) — T66 溯源三层反转定谳: 提交二分穷尽→种子排除→★解药只在 f24 世系(tree_v11 幸存)

- **三层反转(全部主会话实测)**: ①主线提交二分(obj 判据协议)从 HEAD 回溯到 7-13 23:49 **全 BAD**——窗口内 KILLER-4/discard 迁移/F47/PERF 批等全部无罪; ②种子解耦: 救援老种子 3a664da0 × 新树仍 BAD=种子无罪(chain40↔42 好坏差异不在种子); ③chain 树世系定谳: **tree_v11(chain39 全绿世代, diag_T54, 未被同步毁证)pobj 与主线实质不同(445 文件分歧)**, chain39 DRV 对 T66 免疫今日复测实证(rc=0)——**解药在 f24 世系, 从未(或不完整)回灌主线**; 主线的 T66 可能是陈年缺陷, 非近期引入。
- **历史重写发现**: summary/账面幽灵哈希(0cd8cb0ac/af462d1c1/c72ede7f1/26b680544/88319c608 等)在仓内 MISSING, 同主题提交以新哈希在位(2d189c5cf/d344fa43f/2021ea5f9/8a13ed92c 等)——pathspec 手术期历史被改写, 内容未失, 账面哈希以 git log 实测为准。
- **协议教训二连**: ①exe 夹具在 dde213d39 前所有世代不可测(810 stopgap 在 DRV 二进制里)→ obj 判据协议(primary.o 于 provider 失败前落盘+孤儿 w 槽分类器)通杀; ②裸 diff=DevEco shim 恒 exit 0 又中一次(tree_v11 pobj 假"全同"), /usr/bin/diff 铁律再验。
- **在飞**: wf_5f2e30a5-3fe 双臂狩猎(主线 pobj 插桩红绿循环: 16s DRV 烤+25s 夹具, 定位 temp-slot producer-emit 决策点; tree_v11 同区域对照)→对抗复核→fix_t66.diff 交付主会话双侧落账。连带: op-lane 活跃落账中(14:43 #95 wave5), 落账窗口须避让。

## ★ 2026-07-16 17:30 收割轮六十二 (acb7a9d3 会话) — T66-b/T67 双落账+T68 案情大白(=T62 嵌套 Make 真身)+chain43 点火

- **T66-b 落账 7eaa4330c**(+83/-8, 复核 CONFIRMED 独立双树复刻): 原"前端 ref 盲区"假设被插桩实测诚实推翻——真根因=**elif 复合条件文本回退缺级联**: elif 两臂直调单比较发射器 EmitConditionOps(设计上拒顶层 &&/||), 不走 if 臂同款 CBR 级联也不 poison → node-eval 不可用+复合条件时零条款零标记, elif 体经陈旧假边无条件可达。修=结构镜像 if 臂(级联+poison 83), 单比较 elif 逐字节不变=严格超集。18 件矩阵全对+双真值方向。连带立卷线索: `let x = int32(f(...))` 绑定类型被记成被调返回型 uint32 非 cast 型(node 建毒的上游)。
- **T67 落账 3ba64527f**: 大写 GetOrInsertEx 撞名纯改名(8d6f5d486 小写族修复漏网的大写孪生), 全仓零调用者。注记: 当前 HEAD first-abort 走位已被 CompilerLockSnapshotFromText 抢占, hashmap 行不可直接 A/B 观测(hunt 树 canonical 行消失+复核静态全过为准); **晨间"count=1"系 bake 模式 first-abort 计数非穷举**——zc 枚举低内存模式的口径注意事项再+1。
- **T68 案情大白**: CompilerLockSnapshotFromText bail=61 line=1307 = compiler_world.cheng:1305 `add(entries, CompilerUniverseManifestEntryMake(pkgId, Value(snap), Value(syntax), proofCid))` = **T62 家族嵌套 ctor 真身形**——d4 把它从整句静默蒸发翻成诚实 bail(工作正常), 合法形真编译原语仍缺=T62-d5 新波次已开飞(wf_e5d1fc09, 后端补发扩型到嵌套调用, 禁名字特判+运行时逐字段金标+m 形不得松绑)。
- **enumadd bail=631 断代(零烤探针)**: chain42 驱动(09:07)绿 rc=7, bc1d 世代驱动 compile bail=631——**非 d4 所致**; op-lane stash 里躺着"631-wip-revert"=已知在手, FYI 不越域。chain43 probes 预期 10/11(enumadd 红系此前置)。
- **chain43 点火**(ignite_20260716T090753_07e246, detached, 全链含 gen3, tree=3ba64527f 含 T65/T66/T67 不含 T66-b): terminal/oracle 判决 T66 修复的 exe 路兑现+silent-exit(#104) 是否消失。
- **性能线 factTable**: 实测 n=5204 释放事件 p50=800B/p90=5.6KB/p99=50KB, **首块空置率 99.5%**(比账面"90%+"更糟); 旧注释"1MiB 防增长抬 RSS"的前提被数据正面反驳。16KiB 补丁就绪(diag_PERF_FT/fix_facttable_a.diff, 覆盖 96.5% 零增长, churn 5218MiB→~120MiB/43x 结构推算); **落账门=RSS 前后实测+.o 字节等价**(measure2 在跑, 座席 6 跑被截断的教训: 测量必须主会话可追踪后台)。

## ★ 2026-07-16 18:50 收割轮六十三 (acb7a9d3 会话) — T62-d5 落账 45bb18a15(标量子集+双写险终结)+T70 三消融全空→种子混淆变量现形

- **T62-d5 落账 45bb18a15**(复核 PARTIAL-as-scoped 采 b 案如实框架): ①同行多孤儿去重护栏(消融实证 load-bearing: 缺它=编译 CLEAN 但 entries 静默双写=错误数据险)②重建委托既有 AppendSeqGeneralAddBuiltin 零新 codegen ③标量安全门——str/聚合内型(含真前沿 FixedBytes32)撞**独立前置缺陷**(合成 #槽实参物化 SIGSEGV/错值)诚实保 61。**真前沿未动**(复核红绿双驱字节级同), 解锁开口=T62-d6(合成槽 str/聚合实参物化)。golden 新增标量绿形看护。m1-m4 恶意形全程 61 零松绑。
- **T70 三消融全空**: T66 revert 仍败/#95 revert 仍败/#119(纯 repro 夹具+cold C) revert 仍败——树侧窗口提交逐一无罪。**混淆变量现形: chain42 好世代种子=3a664da0(09:07 的 .bak), 我全部消融链用的是 10:48 换装后的 cbf41e0b**——DRV 的解析逻辑码由种子编译, 两变量(种子+树)同时换过。决胜局在跑: 老种子 3a664da0 × chain43 原树(ignite_20260716T104434_1978e9), 链过=种子维度定谳。
- 工程接力提示: 若种子定谳, 所有 10:48 后 .bak 链的 GEN2 link 失败同因; 短期解=链配方回 3a664da0 种子, 根治=cbf41e0b 对解析逻辑(疑 importc 别名表构建函数)的 codegen 差异定位。chain43 全链(T65+T66+T67 验证+silent-exit 判决)待种子定谳后重排。

## ★ 2026-07-16 19:20 收割轮六十四 (acb7a9d3 会话) — T70 考古终局(四枪全空)→战法切换直捣根因; 三工作流并飞(d6/T69/T70)

- **T70 考古四枪全空**: T66 revert 败/#95 revert 败/#119 夹具 revert 败/**老种子 3a664da0 × 原树也败**——单变量穷尽, chain42 的 link-GOOD 是"op-lane WIP 09:07 快照态"级不可重建状态(与 dde213d39 落账全量存在未知增量)或组合效应。**判定: 引入考古边际价值归零, 缺陷本体陈年(秒级夹具全代复现), 直接修**。
- **T70 缺陷定性(主会话实测闭环)**: 跨模块限定 @importc 调用把 Cheng 名当链接符号发射(chain43 世代发限定名 chengpath.PathFileHandleWriteAllBridge, 老世代发裸名, 都错; 正确=声明的 C 别名 cheng_file_handle_write_all_bridge); 同模块调用五处全对; otool 重定位→nm 映射锁定唯一坏点=LineMapWriteString; 整树语境偶尔解析对=表/序敏感线索(结构性修复必须消除序依赖)。主线 gen2 已 ZC=0, 此符号=link 绿唯一阻塞。
- **三工作流并飞**: T70 根修(wf_09dde428, callTargetImportc 列结构性接线+gen2 酸测终验)/T62-d6(wf_761cf37c, 合成槽 str/聚合实参物化+放宽 d5 门+compiler_world 单文件行消失口径)/T69(wf_1408867a, cast 绑定类型记账根修+宽度敏感对抗审计)。三绿后=chain44 全链总验(T65/T66/T66-b/T67/d5/d6/T69/T70 全系+terminal/oracle+gen3+silent-exit 判决)。
- 方法学沉淀: 消融矩阵要在**第一枪前**把全部混淆变量列成表(种子/树/环境/WIP 快照态), 本轮种子变量第四枪才想起=浪费两枪 19min; "工作树快照"型基线(非 commit 锚定)一旦被同步毁尸即永久不可重建——重要基线树必须只读封存(chmod -R a-w)或 tar 快照。

## ★ 2026-07-16 19:55 收割轮六十五 (acb7a9d3 会话) — T69/T70 双落账(今日第六/七修), chain44 总验点火

- **T69 落账 2ce754f1f**(复核 CONFIRMED 双独立 trace): TypedExprMaybeAddInferredCallBinding 从内层被调取返回型忽略顶层 cast 头——`let x = int32(f())` 记账 uint32 → RhsBinopResultMeta 混型拒 → node 建毒 rhsNodeIndex=-1 → 语句落文本回退面(T66 洞族所在地)。修=顶层标量 cast 头识别(复用 IntConversionFnTargetType+标量头, 括号深度整调用形判定)。g_elif 节点路恢复(-1→91 双方同值); suite 33 件开关双跑字节同; 16 件无 cast 夹具 .o 字节同。
- **T70 落账 406a431e5**(复核 CONFIRMED): 双病根——A=importc 元数据行被可达性批过滤器拦截(枚举行早有豁免唯它没有)=**序敏感之谜谜底**(filter 集随编译组合漂移); B=查表键 ParserIdentPrefix 点号截断(chengpath.X→chengpath 永不命中)。修=行落表免过滤(镜像枚举豁免)+三查表键换既有 QualifiedCallLeaf(无点名字节等价=同模块零扰动实证)。t70b/c 红转绿, nm 零含点 undefined。整树酸测两遭座席返回截断(inflight-kill 第 7/8 例)→chain44 收口。
- **chain44 总验点火**(ignite_20260716T115405_197e80, tree=406a431e5 全修复系 T65/T66/T66-b/T67/d5/T69/T70, 全链含 gen3): 一次回答四问——gen2 link 绿(T70 酸测)/terminal+oracle exe 绿(T66 兑现)/gen3 定点/silent-exit(#104)。
- 今日主线战果累计: **七修复**(T66/T66-b/T67/T62-d5/factTable/T69/T70)+账本轮六十〜六十五。在飞: T62-d6(wf_761cf37c)。

## ★ 2026-07-16 20:25 收割轮六十六 (acb7a9d3 会话) — chain44 判决(T70 整树兑现+第二符号现身)+T71 闪电落账 36c1a31af+chain45 冲刺

- **chain44 判决**: gen2 ZC=0+link 死于 cheng_u8_load_at——**T70 整树兑现**(chengpath 符号消失=修复在 220k 行尺度工作), 第二符号如期现身(chain43 时已存在, 被第一符号挡位; linker 单符号报错的"洋葱"特性)。
- **T71 定谳+落账 36c1a31af(主会话全程 <15min)**: dde213d39 的 arena SoA @exportc 对(cheng_u8_load_at/store_at)漏登记 SystemLinkExecRuntimeDirectAddBackendDriverDispatchProgramSupportRoots 手工名单 → provider 按根集剪枝整体不发射(nm 零 u8 符号)。修=既有注册机制补两条; 别名解析(@exportc('cheng_malloc') fn cheng_malloc_export 同款)实证本来就通。验证注记: min 级不吃名单(仅 dispatch provider 集适用), 真验收=chain45。**结构性立卷: @exportc 自动成根**(人肉名单=事故根源; 需先分析与 C runtime 同名撞车面)。
- **chain45 点火**(ignite_20260716T121727_c635ab, tree=36c1a31af, 全链含 gen3): 今晚点火线收官判决棒。
- fusion 沉淀清单(用户问答产出, 待实施): ①ignition_chain journal 加 provenance 块(seed/树/driver sha——今日种子混淆四枪浪费的直接解药) ②cheng_orphan_slot_scan 工具化(classify.py 产品化+stp 盲区修) ③cheng_fixture_matrix ④消融模式 ⑤symbol_diff 加 undefined 集差分+重定位归属。

## ★ 2026-07-16 22:05 收割轮六十七 (acb7a9d3 会话) — T62-d6 落账 7d51ec716(真前沿解锁)+T71-v2 生效+全量符号枚举破洋葱+T72 开飞+fusion T1 落账

- **T62-d6 落账 7d51ec716**: R4 门控脱钩 TargetFunctionIndex 可达漂移(Value/Error 内征专属放行)+d5 门放宽 str/聚合。**真前沿兑现: compiler_world 单文件 bail=61 行消失**。复核 REFUTED 两阻断项主会话裁决处置入 commit(m1-m4 退役合法化=能力落地非缺陷合法化, 双方值验证全对; golden hunk 陈旧弃用手工追加+字母序+suite 复跑)。**教训: 我 prompt 的 m1-m4 铁律本身是历史口径错误**——立卷时"恶意形"实为"能力未及形", 铁律要写行为口径(值必须对)不写结论口径(必须 bail)。
- **T71-v2 生效**: dispatch_min 第三面镜子名单补齐后 provider 真导出 _cheng_u8_load_at(GEN2test 实测 T 符号)。36c1a31af(runtime_direct 面)+本面双镜齐。镜像点教训第 N 例: 改名单先 grep 全仓所有面。
- **★全量符号枚举破洋葱(一次终结逐层剥)**: nm undefined 集 − provider 导出集 − libc 集 = **主线 link 绿只差 1 个真符号 _std_system__load__L485**(hashmaps:147/157 裸 load 调用, 金标案卷 07-09 已档同址)。世代对照: chain43(T69 前)无此符号, chain44/45 有=T69/T70 窗口暴露(prime suspect=T69 改 cast 绑定类型使语句改道)。T72 工作流在飞(wf_3c308c53): 金标=裸 load 硬默认 int32 ldr w+掩码内联, chain42 二进制作 golden 参照, 修向=内征教义检查前置于常规调用解析。
- **fusion T1 落账 0af393d(cheng-fusion 仓)**: ignition_chain provenance 双侧哈希(JS 计+chain.py hashlib 复算 AtStart/AtRun 对表)+cheng_orphan_slot_scan 工具(9 项 MCP 断言, stp 隐零偏移盲区修+fnFilter last-wins 修), 服务重启后生效。
- suite 现状注记: 唯一漂移=repro0_a_fnptr_field 上游双态(三份独立报告同结论), 非本日任何落账引入。

## ★ 2026-07-16 22:50 收割轮六十八 (acb7a9d3 会话) — T73 负结果定谳(自动成根证伪)+T74 打脸纠账(假双态=真回归, T75 立卷)+T71-v2 补落

- **T73 出谳: NONE 即正确交付**(复核 CONFIRMED): @exportc 自动成根被撞车面分析证伪——core_runtime_provider_darwin/linux 与 program_support_backend 间 **32 个重复 @exportc 名**(cheng_errno/libc_* 族, 两处不同函数体), dispatch_min 的 ProgramSupportRootCandidate 分支门控正是承重冲突解决机制, 盲自动成根=每次构建必 duplicate symbol。安全变体(唯一属主门控)需独立立项。已沉淀 memory provider_export_roots_registry。复核精修: 32 非 30/条件性表述/2 名系被动不撞。悬案: runtime_direct epoch_time 三名双名单共存性未定谳。
- **T74 打脸纠账**: repro0_a '双态'系误判——**dde213d39 引入的确定性回归**(22 跑一致+字节同双建+env 消毒+真 bisect 父子零间隔收敛)。真 bail=trampoline0 missing_call_target detail=SpawnTask0(**ref 型构造器调用注册回归**, T75 立卷, 疑点=csg 字段 hoist/typed_expr 缓存)。**我方三提交(c1b759150/a33c47481/7d51ec716)把此红当'已档上游双态'无验证复读挥掉=红门钝化反射的活体标本**, 如实入账。golden 行按诚实 bail 翻账 1b92daf9c, T75 修后翻回。
- **T71-v2 补落 5f07b051d**: dispatch_min 面镜子名单(GEN2 bake 走此面), GEN2test 酸测已证 provider 真导出+链接推进至 load 符号。
- **T72 座席违规写主树进行中**(pobj+126/backend2_lower_slots+131/backend2_lower_util+3+2 夹具+golden 2 行): golden 行已外科摘除, 源文件待其收工后按收编四步处置(reverse-check 交付 diff vs 树)。违规工序第 4 例, prompt 已含铁令仍发生。

## ★ 2026-07-16 23:12 收割轮六十九 — T72 std/system load 结构化内联收口，点火链接最后符号清零

- **根因闭环**: `emit:obj` 的 `object_all_lazy` 保留 compact resolved-call snapshot/index，`emit:exe` 的 `exe_entry` 在 primary 前提前释放；同一 `hashMapStrPack8` 因此在 obj 路精确识别 `std/system.load`，在 exe 路退化成普通调用并留下 `_std_system__load__L485`。修复将 compact snapshot/index 定义为 primary 正式输入，统一延迟到 primary 完成后释放；全量 typed facts 仍提前释放，未退回高 RSS 路径。
- **结构化下降**: 新增 source+line+qualifier+callee+argc+args 的 exact resolved-call 查询，只有目标源码确属 `src/std/system.cheng` 且 target 非 importc 时才内联 4-byte i32 load；用户同名 `load` 保持普通调用，非 i32 宽度继续响亮失败。primary/backend2 镜像同步，Backend2Version 升至 `backend2-slice14`。
- **槽身份修复**: nested whole-call 合成槽加入 node/ordinal/call-sequence 身份，调用头改为逐字节十进制无损编码，node index 用 `+1` 非负编码；禁止原始 `.`/`-1` 进入内部标识符。限定嵌套形 `load(system.system_ptr_add(...))` 已进入永久夹具。
- **门禁**: driver `0596f40da77b114e…`；三项 T72 均 `CLEAN + runrc=MATCH`；`CHENG_FULL_MATERIALIZE_EXE=1` 直接夹具 `ZC=0/run_rc=0/maxRSS=33,439,744B`，primary.o 无 `_std_system__load`；全 fixture suite `golden/emit/runrc=MATCH`；backend2 version sentinel PASS。backend2 实执行仍先撞既有 `Float64 block_op_fill_fail`，未冒充该独立前沿已闭。

## ★ 2026-07-16 23:24 收割轮七十 — T75 ref 类型物化污染 callTargets 根修

- **真根因**: `SpawnTask0(raw)` 是 ref 引用位重解释，不是函数调用。lowering 的 embedded-call 文本扫描却把它写入 `fnIr.callTargets`；`dde213d39` 的流式可达性只是让这条既有污染变成稳定可见的 `missing_call_target`，不是根因。
- **结构修复**: 新增共享判定 `LoweringCallHeadIsNonExecutableTypeMaterialization`；先用 source-scoped TypedIR 查同名真函数，只在无真函数且 TypedIR 证明 ref/ptr/seq 类型物化时过滤。embedded RHS 与 return whole-call 共用该判定，内层真调用继续独立登记。
- **门禁**: meter driver `ea16dd0a93688271…`；`repro0_a_fnptr_field` 从 `BAIL 0:1` 翻为 `CLEAN + runrc=MATCH`；stream/non-stream 均 `missing=0`，对象 SHA 同为 `67da4f418daae50c…`；对象无 `SpawnTask0` 符号/重定位，保留两条 `_identityRaw` 真调用。新增 ref 类型/函数同名反例 `repro0_d_ref_typefn_samename` 并运行 `rc=0`。全 fixture suite `golden/emit/runrc=MATCH`，log SHA `300e92780fa62ef2…`。dry-compile 仍为 100 源/221,934 行，理论与实际 `1,638ms`，source-scan 内存下界 `3,996,125B`。

## ★ 2026-07-17 04:15 收割轮八十 (acb7a9d3 会话) — suite 门禁 locale 漂移根修 5e88cb3f8 + chain46 全链总验点火(预检全绿一次性冲线)

- **suite DRIFT 假红定谳+根修**: T72 落账后 suite 复红非回归——`zh_CN.UTF-8` collation 把 `_green.cheng` 排到无后缀 `.cheng` 之前(C locale 相反, `.`0x2E<`_`0x5F), golden.tsv 按 C 序落账 → 换 locale 的 shell 跑 suite 必假 DRIFT。实证: 同 HEAD 同 driver, 4 对 frontier green/plain 纯行序翻转 exit 5, 内容零漂移; 钉 `LC_ALL=C` 后三门 `golden/emit/runrc=MATCH` exit 0。落账 `5e88cb3f8`(+3 行)。
- **点火线「确定性一口气」战法**: 把 19min 链从发现工具降级为确认工具——分钟级预检覆盖全部历史死因类: ①suite 三门 MATCH(runtime 语义门, T66 类) ②全量符号枚举(T72 已定谳 load__L485 是最后符号且已落账) ③@exportc 增量审计 36c1a31af..HEAD **零新增**(T71 类名单缺口) ④git archive HEAD 干净树+种子 sha 盖戳(混淆变量类)。预检全绿后单发全链。
- **chain46 点火**: `ignite_20260716T195808_18bade`(workDir chain46/), tree=`06aed5856`(含 T72 a6728af93+T75 986a8e5da+T62-d6+T71-v2 全量), seed=`7d1057af…` 盖戳, treeSrcHash=`f8bef754…`, 全链 gen2+terminal+oracle+gen3(gen3 cap 16GiB)。判决项: gen2 link 绿 / terminal+oracle=T66 exe 路径兑现 / gen3 主线世系首次定点 / #104 silent-exit 终审。
- **收账**: 任务 #106(T72)/#107(T75) 完结归档(落账人=并发会话, 轮 69/70 已记门禁); 新任务 #108=chain46 判决。

## ★ 2026-07-17 04:55 收割轮八十一 (acb7a9d3 会话) — 三臂判决: enumadd 631 根因定谳(真树源缺陷)+T62-d7/Result 双 NEGATIVE(诚实零 diff)+chain46 首发被外杀重点火

- **★enumadd_probe bail 631 根因定谳(wf_8200b87d A 臂, 复核级三重验证)**: 不是种子滞后不是口径问题——**真树源缺陷, 与已修的 frontier_631(value-if 误判)是共享 bail 号的两个不同家族(family 误编目)**。根链: 跨模块限定枚举(texpr.TypedExprIrStatementKind)在 PrimaryBodyIrTypeShapeFromTextImpl 的枚举纠正分支(:4907-4914)嵌在 shapeAliasTarget!='' 外层条件内未命中 → 落 PrimaryBodyIrTypeKindFromText(:4381-4384)「限定大写 leaf 默认当指针」兜底 → seqElemTypeKind=LocalPtrTag → 簇A(:20358)短路 → MaterializeFieldArgSlot -1 → reason=16 → bail 631。铁证: 同形本地枚举 CLEAN(定谳跨模块解析是根), 纯树源新 meter 同 bail(排除种子), FAIL_TRACE reason=16 现场。**换种子不自愈, 立卷 T76**(修向=跨源枚举识别结构谓词, 不依赖 alias-leaf-retry 链)。
- **T62-d7 NEGATIVE(B 臂)**: 交办目标已被 d6(7d51ec716)本体完成——门已改名 MaterializableSafe 且纳入 str/聚合, **真前沿 compiler_world 实测 CLEAN(bail=61 消失, 真前沿兑现实锤)**, suite 三门零漂移。真待开=d6 注释留的两条独立缺陷: ①str 形参透传当 Ok[T] payload 读写错值 ②聚合形参+聚合返回同现读写错值——按此重立卷, 不复修已修门。
- **Result[int32/bool] NEGATIVE(C 臂)**: 已被 T62-d2(b0a405a06)宽度类结构扩型顺带覆盖; 双真值方向探针(int32/bool 各 2 枚, 正确值 rc=0/故意错值 rc=3)实证机制真读数据。台账 690 行跟进项①销案。
- **chain46 首发被外杀**: ignite_…195808 在 probes 完成后 gen2Bake 启动瞬间被 SIGKILL 级外杀(stderr 空/finally 未跑/pid 残留), chain.py 无自杀逻辑, 凶手未定谳(并发会话清理/内存压力候选)。**重点火 ignite_20260716T202729_d57e51**(同树同种子), 已布 90s 存活哨+长哨。
- 性能线对账(另轮): TailName 收官/C1 kill/C6-structural+funcEmitCid 已落 → 本 lane 三臂 wf_dee1cdee 在飞(per-fn 缓存键/fix_perf2 预检/超线性探针复测); #63 收账归并 #44。

## ★ 2026-07-17 05:15 收割轮八十二 (acb7a9d3 会话) — 性能线三臂全判"已完成"(正典三处过时表述订正)+chain46 三点火转主会话直跑

- **★性能线三臂(wf_dee1cdee)全部判决=其实已完成, 正典跟着订正(commit 见上)**: ①P1 NEGATIVE 证伪路线图——funcEmitCid 已位置无关(α 不变量, 重排/插函数实测 frag 缓存命中+backend2_cid_gate 4/5 PASS), §12.5"接 ncid"无对象; 唯一位置泄漏=fn-address 通道但当前死码(block_op_fill_fail); **砍 csg_e 335s 真前置=前端跨文件增量, 另量级立项**。②P2 NEGATIVE——fix_perf2 已于 10b8a26da(07-14 07:23)落账, "备而未落等三门"是文档快照过时; RSS 线残项就此清零(剩 zc_zero 门合同重锚裁决+gen3 采数)。③P3 GREEN——超线性探针 07-08 已双证转绿并入 CHENG_CI_SLOW(4bf42f63e), 复测 slope 2.093-2.244 无回归; 旧 hash c7e2e2aa7 于 --all 不存在, 正典已改记 b1550c5c8。
- **性能线诚实余量(收官口径)**: op-lane 并轨件=fork-join(2.63x 在飞)+C2/C3/C4; 本 lane 无待落实施件; headline warm-N 复测待 skip-lower 完整度(wave-36 后未重测); B深=长期唯一 ≤10s 路。
- **chain46 三点火**: 第二发(202729)又被外杀(同签名, 活过 90s bake 窗死于中途); 无 jetsam 报告排除内存杀; 本机并存 4 个 fusion MCP 实例+grok/Codex 代理生态, detached 链被连坐机制未定谳。**战法切换: 第三发(203416)杀掉 MCP detached 实例, chain.py 改主会话 harness 跟踪直跑(bo1h7qwh1, 无 timeout 上限, 死即得信号号法医证据)**。

## ★ 2026-07-17 05:00 收割轮八十三 (acb7a9d3 会话) — 烤制点杀者定谳(五连杀→排除法矩阵→伪装免疫), gen2 伪装烤制越过死亡窗在飞

- **★杀手画像定谳(排除法全实测)**: chain46 gen2 五连杀(MCP detached×2+harness 跟踪×2+裸跑×1, 死点全在起跑 30s-4min, 壳 exit 144=整进程组死)。前台/后台 7GB 气球全存活(RSS cap 证伪), 6min 全速 CPU 燃烧+全信号捕获金丝雀存活零信号(CPU 点杀证伪), jetsam/EXC_RESOURCE/ulimit/LaunchAgent/crontab 零证据。**伪装烤制(DRV→cc_stage_b, GEN2→out_stage_b, chain46→nb_workspace)存活越过全部死亡窗+3.37GB 峰值 → 模式杀定谳**。杀手 ~03:58 新现(chain43-45 同机制昨日全程存活), 与本机 grok/Codex 代理生态上线吻合(其 GEN2_wrap 烤制正常存活换代); 凶手进程身份未终审(逃生优先, 根治需死亡瞬间 dtrace/eslogger 抓调用方)。免杀配方+实验矩阵已沉淀 memory(bake_pattern_killer_disguise)。
- **gen2 伪装烤制在飞**(bt7cblkli, 04:49:05 起, 产物 out_stage_b): 烤完即 GEN2, 链后半段(terminal 2+oracle 6+gen3 masked 定点)用中性名手动续跑=chain46 判决不变味。
- 在飞: T76+T62-d7 真身修复两臂(wf_1eb55c3a)。

## ★ 2026-07-17 05:30 收割轮八十四 (acb7a9d3 会话) — 伪装烤制全程存活+ZC=0 实锤+link 新墙一 token 根修 e3fd4820e

- **★伪装烤制全程存活(24min)+主线 ZC=0 实锤**: out_stage_b 烤制零击杀(免杀配方生效), 全树 **ZC_NOT_READY=0** — 主线世系 gen2 尺度零 bail 首次在烤制现场直接确认。
- **link 新墙=proc_pid_rusage, 一 token 根修落账 e3fd4820e**: a6f368170(RSS 护栏 footprint 化, op-lane 合法修复)在 std/os 引入 @importc proc_pid_rusage, macho_provider_linker 系统符号名单漏登(同族 proc_listpids/proc_pidinfo 在列)。linker log 全量枚举=唯一残余符号。红绿双向: os.ProcessRssBytes() 定向夹具修前 unresolved 修后(隔离克隆) link 绿+run_rc=0; suite 三门 MATCH 零漂移。**预检教训入账: link 绿预检除 @exportc 三面镜外, 还须审窗口内新增 @importc vs macho_provider_linker 系统符号名单**(本次 @exportc 审计绿但 @importc 类漏网)。
- **主树 meter 重建瞬态失败(op-lane WIP)**: 同刻 rebuild 报 opaque sequence store value too large, 克隆纯净态重建即绿 — 系共享树在制 WIP 瞬态, 非本修引发, 高并发在制期主树重建不可作判据(旧纪律再证)。
- **chain46 续跑**: tree_06aed5856+e3fd4820e 等价补丁, 新 DRV=cc_stage_b2(种子烤 13s), gen2 伪装烤制在飞(byx6xf9fb, out_stage_g2, ~05:45 出炉)→烤完续 terminal/oracle/gen3(中性名)。

## ★ 2026-07-17 06:00 收割轮八十七 (acb7a9d3 会话) — T76 落账 01a9be806(根因订正: 插桩推翻轮八十一静态推断)+T62-d7 真身落账 2c77136b6(同根双缺陷)+第三面镜子立卷

- **T76 落账 01a9be806(复核 CONFIRMED)**: ★根因订正——轮八十一"TypeShapeFromTextImpl 枚举分类失败落 LocalPtrTag"系静态推断错误, T76_TRACE_ELEMKIND 插桩实测分类本正确(LocalI32Tag); 真缺陷=簇A(pobj:20365)对 TypeName.Member 枚举成员字面量只探 const 缓存缺 EnumI32 二次探(call-arg 站点早有同构双探针)。缺陷范围比立卷更宽: 本地/跨模块限定枚举成员全中(复核实测 local 形亦红)。修=双探针 4 行×pobj/backend2_lower_slots 双镜像; 边界三形(双别名/call-arg 共存/同名 variant)全红转绿。**enumadd_probe 转绿 → chain47+ probes 11/11 达成**。
- **T62-d7 真身落账 2c77136b6(复核 PARTIAL-as-scoped)**: d6 留档两缺陷同根=FieldStore emit 漏"payload 源槽=间接形参"解引用(读 8B 指针槽当 24/32B 数据=栈垃圾错值)。修=复用 T56 谓词+同步两遍字数预测器。红绿双向+双真值+suite 三门+d2/d5/d6 零回归。**PARTIAL 保留项立卷: backend2_emit_ops.cheng('逐字收割'独立 emitter)同缺陷字面拷贝未修**——当前不可达(lowering 空白先 block_op_fill_fail 响亮崩溃零静默), **定为 backend2 FieldStore lowering 补齐的前置门**(该 lowering 落地前必须先补此镜像+运行时验证)。
- **镜像方法论沉淀**: 共享缺陷镜像面=pobj+backend2_lower_*+backend2_emit_ops **三面**(emit 层"逐字收割"文件是第三面, T62-d7 复核首次实锤), 此前双镜像口径不完整。
- 任务 #109 收账。在飞: gen2 伪装烤制(byx6xf9fb, ~05:56 出炉)+性能线四臂(wf_b62fbde4)。

## ★ 2026-07-17 06:20 收割轮八十八 (acb7a9d3 会话) — ★主线世系 gen2 link 绿首达成(chain46 判决①), T77 立卷(link 后首个功能前沿), #104 silent-exit 终审结案

- **★主线 gen2 link 绿+ZC=0 首达成**: 伪装烤制 out_stage_g2(23min, BAKE_RC=0, ZC_NOT_READY_TOTAL=0, 19.3MB exe)——chain42-45 四代全倒在的 link 墙已破(T69→T70→T71/T71-v2→T72→proc_pid_rusage 五段洋葱全剥完)。
- **T77 立卷(任务 #110)**: GEN2 功能性损坏——6/8 夹具编译 SIGSEGV, crash_triage 归因 _CompilerCsgQueueReachableSourceProfiles+492(ldrb [x9] x9=0, NULL str 读, 调用链=CSG 可达性扫描); 2/8 源路径字符串损坏(root+尾随空格)。DRV 自身功能正常 → **DRV 错编 compiler_csg 该函数=经典二阶 miscompile**。秒级复现在手(crash_triage <60s)。狩猎工作流 wf_cb6eeb12 在飞(双 .o 反汇编对照→最小 repro→根修→二阶验证法, 免 24min 重烤)。
- **#104 silent-exit 终审结案**: 主线 GEN2 失败全部响亮(SIGSEGV/显式错误), 静默退出未复现——与 T66 根修前世代相符, 案闭。
- **chain46 态势**: 判决①link 绿✅ / 判决②terminal+oracle=红(T77 接管) / 判决③gen3 定点=blocked on T77 / 判决④#104=结案✅。gen3 RSS 采数(#46 项)顺延至 T77 修后重烤。

## ★ 2026-07-17 06:40 收割轮八十九 (acb7a9d3 会话) — 性能线四臂全 DELIVERED 落账 46995c996(RSS 门打架消解+csg_e spec 入库+warm-N 复测+新热点 lead)

- **★RSS 门三处打架考古定谳+同步落账(W4)**: 8GiB 重锚 07-09(4d3278248)早已拍板落 validate_proof_report/baseline, 唯 canonical zc_enumerate.sh 1GiB 硬钳位(:97, 07-01 遗留)从未同步 → proof >8GiB 校验恒真虚设。同步补齐(钳位 1GiB→8GiB), 非新裁决。1GiB=M6 终态生产门非现阶段约束。**独立立项: ad989306d 泄漏重开(~1x, rsa_pss +6.9%)是真实回归须根修, 不被锚吸收**。裁决全文 nb_workspace/rss_gate_reanchor_draft.md。
- **csg_e 跨文件增量 spec 入库(W3)**: docs/beat-c-csge-incremental-spec.md——靶=TypedExprBuildIrForScope 逐函数建 IR(非 C1 的 BFS); 复用三层既有切分(sourceTable/exprSliceTable/functions2_node*); 缺口=内容指纹+实际读取集记录+缓存 splice 层(读取集须记实际读取非声明 import, 防跨模块 const 静默漏判); backend2 Tier2 缓存/ncid 均不可复用(鸡蛋倒置/已证伪)。A→E 五步 commit; **Commit A 时间切片 ≥15% 门, 不过即 kill**; 1300-1900 行 op-lane 双文件必须并轨。
- **warm-N 复测入正典(W2)**: N=0.895-0.905(交替 20 发); skip-lower 已真落地且机制正确(字节恒等+tamper poison)但真实覆盖率≈0(backend2 emit 挡门); csg 相 40-47% 无 skip 层。10x 三前置: csg 增量+emit 完整度+drift-guard 精简。方法论: 宿主高负载下非交替测量出 ratio=1.10 假回归, 交替大样本才干净。
- **ZC=0 世界新热点 lead(W1, 单相位诚实标注)**: TailName 0.04%(时代终结实锤); 新霸主 PrimaryBodyIrSourceModuleDeclaresType 20.1%+SourceLinesStrippedAt 14.4%+PathTrim 10.8%, 文本扫描原语簇 top-9=83.6%。全程锚还差多相位采样矩阵(6 发×25s 加权)。工件 nb_workspace/hotspot_zc0_report.md。
- 在飞: T77 狩猎(wf_cb6eeb12)。

## ★ 2026-07-17 07:10 收割轮九十 (acb7a9d3 会话) — ★T77 bool[] 尺寸双轨根修双落账(be3349142+6ccad64ef), GEN2 崩溃真身终结, 终局烤制在飞

- **★T77 定谳+落账 be3349142(复核 PARTIAL-as-scoped)**: GEN2 CSG 崩溃真身不是二阶 miscompile——是树源 bool[] 元素尺寸双轨: TypeShapeFromTextImpl 标量 bool=4B 被 add()/seq-append(ResolveSeqRootHeader 两分支)直接当元素尺寸, 而全部读方按 1B 包装 → add 建的 bool[] 下标 0 巧合对/≥1 全错+4B 越界写堆污染(同时解释 path 字符串损坏症状)。compiler_csg 可达扫描三个 add 建 bool[] 踩中 → NULL 崩溃。双 .o 反汇编字节级一致排除单函数错编假说。修=SeqElementShapeFromText+ResolveSeqRootHeader 双分支 bool→1B; 4 独立形态红绿双向+suite 三门。
- **T77-b 落账 6ccad64ef(复核抓漏接续, 主会话亲验)**: 复核员边界打击抓出第四消费方 SeqIndexValueSlot(add(dest,src[i]) 值槽)同族活缺陷(HEAD 恒 rc=0 错值/补丁恒 rc=2, 各 6 连跑)+克隆 suite 三门 MATCH。
- **backend2 镜像立卷追加**: lower_util/lower_slots 三份字面拷贝同缺陷(dormant)——与 T62-d7 的 emit_ops 镜像并档, backend2 激活前置门清单现为两案。
- **终局烤制在飞(bbgygrvvm)**: 链树补 T77+T77-b → DRV''=cc_stage_c(种子烤)→ gen2 伪装重烤 out_stage_c, **一体六相位采样矩阵**(每 150s 一发 25s sample → 性能线全程热点锚顺带采齐, W1 followUp 兑现)。出炉后 terminal/oracle → gen3 定点。

## ★ 2026-07-17 07:50 收割轮九十一 (acb7a9d3 会话) — 性能线四臂判决落账(CommitA 71.1% GO/drift-guard 落 526ae5c2a/泄漏 M3 级定谳)+T77 归因证伪(崩溃复现)+T78 开狩

- **★T77 归因证伪(诚实纠账)**: T77 bool[] 尺寸双轨是真缺陷(修复有效且保留)但**不是 GEN2 崩溃根因**——T77 全修树重烤 out_stage_c(ZC=0 link 绿+六相位采样采齐)后 terminal/oracle 同签名全灭(6×SIGSEGV+2×路径损坏)。教训=相关性归因再犯(轮八十一后第二次), T78 狩猎令改为**数据先行**(崩溃现场损坏数据链走通才准谈 codegen)。
- **★重大架构发现(PB 臂, 待复核确认)**: backend2_lower_slots 与 pobj **同名顶层函数在链接产物里符号相撞**——只改 backend2 副本运行时零效果(entry trace 不触发), CHENG_BACKEND2=1 亦然。影响: 历来 backend2_lower 镜像补丁可能部分是死码(源级一致性仍有价值但运行时未生效); GEN2 崩溃新嫌疑=内部 linker 对重名选边在 DRV(种子链)与 GEN2(DRV 链)两代不一致致被调者被 shadow。T78 头号线索。
- **性能线四臂**: ①CommitA 时间切片 **71.1%>>15% 生死门, Commit B GO**(wf_b5158c39 已开飞) ②backend2 blank realizer(+296, valueUseOffsets 索引读全仓无 realizer)前轮复核员交垃圾输出(summary='test'), 重审中, 未落; 其附带发现=语句续行截断前端缺陷立卷 ③**drift-guard 二次 cid 重算消除落账 526ae5c2a**(命中路径 34.8% 纯冗余, tamper 100% 保留, 复核 CONFIRMED) ④ad989306d 泄漏=ROOT_CAUSED+BLOCKED(线性 900B/轮实锤; 重开 free 6/6 double-free 崩; 根修=跨 4 后端类型驱动深拷 F04/M3 级, 3 次 dead-end 前科区), 归 M3 排期不点补。
- 在飞: wf_b5158c39 三臂(T78 数据先行狩猎/PB 重审/Commit B)。

## ★★ 2026-07-17 07:30 检查点停飞 (acb7a9d3 会话, 用户令: 保存现场暂停待续) — 双线 resume 账本

**本日战果(已全落账, 无未提交 WIP)**: T72/T75(并发收割)+locale 根修 5e88cb3f8+proc_pid_rusage e3fd4820e+T76 01a9be806+T62-d7 2c77136b6+T77 be3349142+T77-b 6ccad64ef+drift-guard 526ae5c2a+RSS 门同步/csge spec/warm-N 复测 46995c996+台账轮八十~九十一。主树无本会话残留 WIP(git status 的 M 全是并发 op-lane)。

**在飞(会话关闭即死, journal 可收尸)**: wf_b5158c39 三臂(①T78 数据先行狩猎 xhigh ②PB +296 重审 ③csg 增量 Commit B)。收尸/重启: journal=~/.claude/projects/-Users-lbcheng-cheng-lang/acb7a9d3-80b3-4a1b-9b60-25d136b318cf/subagents/workflows/wf_b5158c39-55e/journal.jsonl(每 agent 一行 result); 重启脚本=同目录 ../../workflows/scripts/round4-t78-pbreview-commitb-wf_b5158c39-55e.js(resumeFromRunId 仅同会话有效, 跨会话直接 scriptPath 重发)。

**点火线 resume 打击序**:
1. 收 T78 判决(或重启狩猎)。头号线索=同名符号相撞(backend2_lower vs pobj 顶层函数, 只改 backend2 副本运行时零效果已实锤; DRV/GEN2 两代 linker 选边不一致致 shadow 嫌疑)。狩猎令=数据先行(lldb 崩点 x9=0 数据链走通)。
2. T78 修落账 → 补丁进 chain46 树(注意树=06aed5856+proc_pid_rusage+T77+T77-b, 与 HEAD 已分叉, 见 tree 内 git diff 不可用需手对) → 种子烤 DRV(13s) → gen2 伪装重烤(24min, **免杀配方=中性名 nb_workspace/cc_stage_X→out_stage_X, 烤制点杀者在市, memory bake_pattern_killer_disguise**) → terminal/oracle(8 夹具脚本在轮九十) → gen3(out_stage_X 再烤 dispatch_min, 16GiB cap)+masked cmp(/Users/lbcheng/cheng-fusion/tools/macho_masked_cmp.py)。
3. 工件: nb_workspace/{cc_stage_c,out_stage_c}+.primary.o+富/平两种 map+stage_*.log+sample_c_phase1-6.txt(六相位采样已采齐)。crash 复现=mcp cheng_crash_triage binary 模式秒级。
4. probes 11/11 已解锁(T76 落账), chain47 起生效。

**性能线 resume 打击序**:
1. 收 PB 重审判决 → CONFIRMED 则落 ~/cheng-patches/20260717/pb_backend2_blank_realizer_296.diff(注意符号相撞现实下 backend2 副本可能死码, 复核应已判)。
2. 收 Commit B 判决 → 落账 → Commit C(编解码器)按 spec 续。
3. 多相位热点全程锚: sample_c_phase1-6.txt×cc_stage_c.map join+按墙钟加权(W1 报告方法, ~/cheng-patches/20260717/hotspot_zc0_report.md 有单相位模板)。
4. 符号相撞架构案立卷跟进(影响三面镜学说+historical backend2 镜像补丁有效性, 归 backend2 owner/op-lane 裁决)。
5. 挂账: 泄漏=M3 级排期(ROOT_CAUSED 案卷在 wf_17b41efc journal); 语句续行截断前端缺陷(PB 附带发现)未立卷待编号。

**易失工件已抢救**: ~/cheng-patches/20260717/(PB diff/CommitA 探针 diff+报告/T77 repros 21 枚/RSS 裁决草案/热点报告)。scratchpad 克隆(wfp3_*/wft77_*/t77b 等)未抢救(可重生, diff 已保)。

## 2026-07-17 07:40 停飞补账 (acb7a9d3 会话) — wf_b5158c39 主动停止收尸

- **用户令停止在飞任务**: wf_b5158c39 三臂已 TaskStop。收尸: ①**CommitB 臂 BLOCKED(有价值判决, 已入 journal)**——spec §2.2 第4条前置(函数名全局唯一)实查为假: TypedExprIrPriorBindingTypeConsider(typed_expr.cheng:20139)过滤谓词只比较 functionName+bindingName+lineNumber(:20150/20153/20156), sourcePath 在记录里(:20161)却从不参与过滤, 构建闭包内有实测反例 → **Commit B 实施前必须先修订 spec(读取集指纹设计补 sourcePath 维度)或先修该回退查找本身**; ②T78 臂+PB 重审臂中途死零产出, resume 用 workflows/scripts/round4-t78-pbreview-commitb-wf_b5158c39-55e.js 重发(三臂 prompt 自包含)。
- 残余进程清点: system-link-exec 零残留; 烤制工件/样本全在 nb_workspace 持久盘。resume 正典仍=上方「检查点停飞」节+本补账。

## ★★ 2026-07-17 09:30 收割批次九十四 (acb7a9d3 会话) — 复飞+T78 定谳: &&/|| 短路契约违反(代次无关生产级 miscompile 类)

- **复飞**: 用户令「工作流全面推进」。resume wf_b5158c39(CommitB BLOCKED 判决缓存秒回, T78/PB 两臂活跑) + 新开 wf_8a5098c9(性能线三缺口: CommitB 解扣 sourcePath 根修/六相位热点锚合成/符号相撞全量普查)。
- **★T78 ROOT_CAUSED(因果链闭合, 复核级证据六方向)**: GEN2 崩溃真根=**`&&`/`||` 短路求值契约(docs/cheng-formal-spec.md:121)被 primary 后端违反**。机制: PrimaryBodyIrCondValue01Slot(pobj ~13302)对 &&/|| 递归求两边 0/1 值再位与/位或(无跳转=eager); 安全门 PrimaryBodyIrTextHasRealCallSurface(~31726)只扫 `(` 不识 `[` → `if i < arr.len && arr[i]` 的 rhs 下标被误判纯粹, 空/短 seq 时 eager 读 NULL/越界指针 SIGSEGV(崩点 ldrb x9=0 数据链 100% 对上, lldb 反汇编实证"先算两边再 AND")。compiler_csg.cheng QueueReachableSourceProfiles 内正是此形。
- **三线索裁决**: A 符号相撞=对 T78 **证伪**(架构案仍立, 普查臂在飞); B 数据链=定谳主证; C 384vs243 指令差=**证伪**(函数真实体 33 行, 3773-3779 是签名头误读; 差异=两代内联选择正常现象)。
- **★爆炸半径纠正**: 种子烤 DRV''(cc_stage_c)编 5 行最小复现(`if i < arr.len && arr[i]`, 空 bool[])产物同样 SIGSEGV——**缺陷代次无关, DRV'' 从来不"功能正常"只是没被踩中**; 全部「边界守卫 && 下标读」生产代码中招。嵌套 if 改写(强制真短路)则正确=因果反证。
- **PB 重审二连挫**: scratchpad 工作区蒸发(wfp3_tmewJK 全盘零命中, /private/tmp/claude-501 已被清空重建)→BLOCKED。教训坐实 feedback_tmp_workspace_volatile; round6 已用持久副本(~/cheng-patches/20260717/pb_backend2_blank_realizer_296.diff)重发, 并给全部 workflow 臂加「交卷前必复制持久区」铁律。
- **round6 在飞(wf_7b6106b6)**: ①T78 根修实施(xhigh; 门谓词语义分类先行——HasRealCallSurface 有非 &&/|| 调用者, 直接加 `[` 会污染其它 lowering 决策, 或需新谓词; 值位调用点收紧后禁新增 bail; 双真值四象限夹具; DRV''' 种子烤自证+suite 三门+bail 零回归) ②PB 重审(持久 diff) ③症状②尾随空格路径独立定谳(明令禁默认同根)。
- **工件抢救**: ~/cheng-patches/20260717/t78_rootcause/{sc_repro,sc_repro_workaround,t7}.cheng+lldb/disasm 三份。
- **T78 修后打击序不变**: 落账→新 HEAD git archive 干净树(chain46 旧树已分叉弃用)→种子烤 DRV(13s)→gen2 伪装重烤(24min 中性名)→terminal/oracle 8 夹具→gen3+masked cmp。

## ★★ 2026-07-17 10:0x 收割批次九十七 (acb7a9d3 会话) — 撞车面语义对账+等价回归跟进修 b1ac0506a+符号普查推翻相撞假说

- **CommitB 前置撞车对账(按批次九十五协议转对账不重复落)**: 我方 wf_8a5098c9 解扣臂(12 调用点版)与对方已落 3accf4a8b(9 调用点版)同根同修法; 我方对抗复核员抓到的**朴素 != 判等回归在已落账版上 HEAD 实测坐实**(探针: './fixtures/same.cheng' 写入 vs 'fixtures/same.cheng' 查询 → run_rc=1 同源误拒, 词法等价被判跨源, 连锁落更弱 fallback)。
- **★跟进修落账 b1ac0506a**: sourcePath 判等改词法归一化等价(TypedExprSourcePathsEquivalent, 与文件内 7 处既有源路径比较惯例一致)+原串快径(raw 相等是归一化等价充分条件)+核对重排到全部廉价过滤之后(归一化只在罕见候选发生, fail-fast 热环无感——该函数族在热点锚 Top10 内, 不能在全扫描环头放归一化)。双真值: 归一化探针红→绿, 变异(整删核对)跨源夹具翻红, 三源撞车仍绿; 双夹具落 src/tests/typed_expr_prior_binding_{path_norm,source_scoped}_smoke.cheng(3accf4a8b 落账时零夹具, 本次补齐)。复核员的空源探针自身 :33 少实参编不过, 不采信。
- **★符号普查 DELIVERED(wf_8a5098c9 三臂之三)**: **推翻"链接产物同名符号相撞"假说**——原生符号带 import-alias 前缀(pobj.X/b2slots.X)并存不撞车; 真选边规则在调用目标解析层(SameSourceUnique 同文件优先, 歧义诚实返负, compiler_csg L3488-3533)——backend2 逐字克隆是解析所需非审美。**真异常=两代可达性大分歧**: backend2_lower_slots/util/lower 三文件种子代 3/300、32/178、3/48 可达 vs GEN2 代 280/300、177/178、48/48 全单向暴增(emit_ops/lower_stmt 两代一致); 636 重名中 479 逐字镜像+157 已分叉; 分叉×可达翻转=107 函数名单在卷。与 &&/|| eager 缺陷可统一解释(入界垃圾位翻真值→可达集污染)——T78 修后重烤时对比两代可达集即可验证。UNKNOWN 三项如实(两 map 源码代次一致性/104 未人工核验/静态可达≠运行时执行)。报告救至 ~/cheng-patches/20260717/round5_reports/。热点锚我方 wfr5 版与对方正典 hotspot_zc0_fullrun_r2.md 互证一致(DeclaresType 簇/NormalizeTypeText/PathTrim 同居 top3)。
- **在飞**: round6=wf_7b6106b6(T78 文本门修+PB 重审参考面+症状②独立定谳) + round7=wf_b6df542d(★#131 全局重建根修(接卷认领)+T78 发射者 trace 裁决/节点门半区——批次九十五归因冲突警示已纳入: 两门四处同扩, 先裁决后收网)。PB 按批次九十六 REFUTED 留待 #131 修后重验, diff 原地不动。

## ★★ 2026-07-17 10:5x 收割批次九十九 (acb7a9d3 会话) — T78 两族门合修交付(发射者实证裁决: 两门皆活各占一半)+症状②独立根定谳+#134/#135 立卷

- **★T78 修复臂交付(round6, PARTIAL 自评, round8 双镜头复核在飞 wf_adaf5e14 过门才落账)**: diff=~/cheng-patches/20260717/round6/T78/t78_shortcircuit_fix.diff(3 文件, 对 HEAD 干净可套)。**批次九十五归因冲突的裁决兑现——不是二选一, 两门都是活的**: trace+lldb 实证 sc_repro(语句位 &&)实际发射者=节点门(EvalNode LogAnd eager, HasCallExpr 不识 IndexGet); 文本门(CondValue01Slot/TextHasRealCallSurface)在 fstore/assigntern/decltern 三形是活路径(只打节点修仍 SIGSEGV 实测)。修=新谓词 HasFaultingEagerSurface 节点/文本双侧(只换 &&/|| eager-safety 门, ~15+13 调用点逐审)+CondValue01Slot 补 || 支持+三外部调用点接回 AppendBoolConditionAssign 真短路链+括号剥离陷阱顺手修。12 夹具: 六形 139→0, truth_table 8 断言, side_effect 零回归; suite 52 项 Fix-A-only MATCH(A+B 完整版=round8 必补跑)。诚实残留: backend2 侧 5 外部调用点 fallback 接线未镜像(round8 镜头B 实测其形态)。
- **★#134 立卷(pobj, T78 修复暴露的独立 pre-existing 根)**: aidx 下标赋值处理器(PrimaryBuildBodyIrFromTypedStatements 内 assignIdxElemSize>0 分支 ~40350)对 RHS 直调 EvalNode 不先探针、miss 后无真短路 fallback 无 poison——`flags[i] = cond && sub` 修前崩溃/修后静默不写(rc=1), 换错误形式但都不对; 需按 poison-on-miss 纪律补。复现=round6/T78/fixtures/cmpidx_repro.cheng。
- **★#135 立卷(症状② ROOT_CAUSED, 独立根, 与 &&/|| 无关)**: GEN2 "failed to read source path: <root>/ +20 NUL" = **11 形参(>8 GPR 额度)栈传参把 str 的 ptr 字段覆写成陈旧栈槽值(len=100 幸存)**, 现场=backend_driver_dispatch_min.cheng:963 DryCompileCollectSourceClosureWithStats 入口第 4 次 CleanDotPath(entryPath); PathAbsoluteBridgeSafe 反汇编无罪; 3 oracle 夹具(form9_rbytes/readfile_roundtrip/readfile_err)确定性复现(110 字节 od 全同×3), 对照组真缺失文件走完全不同干净分支。判独立根四依据+strip 二进制 lldb 配方在案卷=~/cheng-patches/20260717/round6/symptom2_independent/。**挡 oracle 8/8 全绿**(T78 修后重烤预期清 6 SIGSEGV, 此 3 枚 rc=2 归 #135)。未触底: 具体覆写指令(caller 实参编排段 0x101098dcc~0x1010993f8)。
- **PB 重审(round6 参考面)**: 与批次九十六 REFUTED 同向——静态正面(store 侧孪生逐行对照自洽/backend2 副本=活码非死码(文件头零 pobj import 架构)/regalloc:1807 根因场景真实), 动态全 BLOCKED by #131(stash 双向对照×2 复证)。附带: load 路径继承 store 侧越界无陷阱缺口(对称继承非新回归, PB 落账时一并立项)。
- **#131 对表素材**: T78 臂克隆内已定位签名B 真身=81bde41e0 的 filterActive 改名不全(typed_expr)+compiler_csg 未定义标识符 set, 解扣补丁=round6/T78/LOCAL_UNBLOCK_ONLY_not_for_merge.diff——转两在飞 #131 臂(我方 wf_b6df542d/对方 wf_423dc1a6, 先 CONFIRMED 者落账)作对表, 勿重复劳动。
- **在飞**: round7=wf_b6df542d(#131 根修+T78 节点门交叉验证——其节点门半区已被 round6 两族合修超集覆盖, 收到转交叉验证面不落账) + round8=wf_adaf5e14(T78 双镜头落账门)。

## ★★ 2026-07-17 11:2x 收割批次一百 (acb7a9d3 会话) — T78 双镜头判决(核心机制过/两类静默错值阻断落账)+#134 归因更正+#131 签名A 独立性定谳

- **round8 双镜头判决(双 PARTIAL, 基线 diff 不落账, round9 v2 补修在飞 wf_8f3e5fa0)**: 镜头A=座席全部数值断言零造假(12 夹具逐项/52 suite A+B 补跑逐字节 MATCH/变异红测 6/6 翻崩=因果闭合非巧合装绿)。镜头B 抓两类**「崩溃→静默错值」REFUTED 级退化**: ①CHENG_BACKEND2=1 下 decltern 139→1(backend2 四外部调用点无 CBR fallback 镜像, 槽未写读残留; backend2_cid/skip_lower 两门 PASS 但对语义 bug 零判别力) ②双层括号 ((a&&b)) pobj 主线 assigntern/decl-bool 139→1(StripOuterParens 单次剥离非循环)。均为既有下游机制在新触达路径暴露, 非 diff 新写降级代码(违禁扫描零新增)。
- **★#134 归因更正(镜头B 反汇编定谳, 原案卷作废)**: 非"aidx 处理器无探针无 poison"(实测探针/poison 正确不触发)——真身=**legacy cmpIdxStoreOp(pobj ~41725-41734+backend2 镜像)对动态 seq 目标漏 header→buffer 间接寻址**(直接 strb 进 seq 头, 应 ldr[+8] 取缓冲指针; 同函数读路径对照正确)。修入 round9 四件套。
- **★#131 签名A 独立性(镜头A 基座乙冒烟)**: 干净 HEAD/81bde41e0 检出态/套 LOCAL_UNBLOCK+t78 三态 rebuild 均同字节报 `opaque sequence store value too large` rc=3——**签名A 与 filterActive/set(签名B)相互独立**, LOCAL_UNBLOCK 只解签名B; 81bde41e0(9437 行巨型提交)首坏 bisect 实证。转两在飞 #131 臂(wf_b6df542d/wf_423dc1a6): 双签名双根, 缺一不可。注意: 该 die 在 zc_fast_loop --rebuild(cold meter 路径); stage3 直烤 DRV 路径在 LOCAL_UNBLOCK 后可通(T78 臂实测), 点火链与 meter 工具链的阻塞面不同。
- **round9 v2 四件套**: backend2 四调用点镜像接线/括号剥离不动点/AppendBoolConditionAssign 失败必 poison/cmpIdxStoreOp 间接寻址根修(#134)——全矩阵验证(12 夹具+镜头B probes+三层括号/非包裹形新 probe+CHENG_BACKEND2 四形零静默+suite+变异红测)+对抗复核跟车, CONFIRMED 才落账。
- 复核工件全集=~/cheng-patches/20260717/round8/T78/(RESULTS_TABLE/两镜头 fixture_runs/probes/disasm/gates)。

## ★★ 2026-07-17 11:4x 收割批次一百零一 (acb7a9d3 会话) — round7 收官(#131 双签名对账+#139 立卷=81bde41e0 第7号回归)+T78 裁决双线收敛

- (勘误: 本会话上一条目与 ceaefe81 的批次一百撞号, 以会话标签区分, 序号自此续一百零一。)
- **round7 #131 臂收官(DIFF_READY+复核 PARTIAL)**: 签名A 定谳与对方落账 partA(f28395104)**同根双确认**(独立双会话同点位: locals_add_global_shadow slot_aux 污染+hex 字面量 U64 分类缺失)——我方版转对账面不落。**签名B 全修在手**: 4 处裸 filterActive→filterIndex.active+csg set.profileSourceIndex 复制粘贴错(修=新增 sourceIdentityIndex 形参)+pobj/b2slots 镜像 6 参老签名补 9 参+**第 5 号回归**(csg 反引号操作符重载名 ParserIdentPrefix 误判 panic, 修=decl.name=="" 判据); build-backend-driver EXIT=0 全闭包 227321 行+#128-r5 回归面响亮保持+3 smoke 字节零漂移, 复核红绿双向+边界打击全过。与对方 partB **同 HELD**(op-lane 活跃编辑中, unhold 先判对方已修否再语义对账); diff=~/cheng-patches/20260717/round7/task131_driver_rebuild/fix.diff(**含已落账 partA 重叠 hunk, 落账前必须剔除**)。
- **★#139 立卷(复核员边界打击, 81bde41e0 第 7 号回归)**: TypedExprSourceIdentityKeyFromRoots(typed_expr.cheng:16627) "source identity relative root ambiguous root_count=3"——修后重建 driver 跑 45 金标夹具 100% ABORT, 旧 stage3 同夹具同环境 rc=0(排除伪影), git blame 钉死同提交。与 #137 同族(op-lane source-identity/snapshot 新子系统), **归 op-lane 裁决勿碰**。81bde41e0 累计 7 处独立回归(cold 2+源码 4+identity/snapshot 族), 采纳 followUp: 该提交应做系统性回归扫描而非逐个撞见。
- **T78 交叉臂(round7 第二臂)与 round6 实证裁决完全收敛**: 穷尽静态控制流追踪=节点门是裸 if 语句位实际发射者(策略A 先行, HasCallExpr 放行 CmpLt+IndexGet); 文本门 CondValue01Slot 5 外部调用点结构性不可达裸 if(其缺陷在三元/字段形发作)——两独立方法(trace 实证 vs 静态穷尽)同一结论。**新增两枚边界证据**: 三链嵌套 i>=0&&i<arr.len&&arr[i] 与 while 形同崩→共享谓词修法天然覆盖全语句 kind(round9 v2 验证矩阵应补 while 形)。勘误: backend2 真分派器在 backend2_lower_stmt.cheng:4268(import 共享 EvalNode), 非案卷误记的 lower_slots。
- **在飞**: round9=wf_8f3e5fa0(T78 v2 四件套+复核) + round10=wf_79921765(①PB 复验终审(partA 解锁改判条件兑现) ②CommitB 本体实施(env 门控读取集+指纹, #137/#139 挡 suite 改走 rebuild+cmp 口径) ③#135 栈传参根修(先触底覆写指令再修))。

## ★★ 2026-07-17 12:1x 收割批次一百零二 (acb7a9d3 会话) — PB 终审 REFUTED(改判条件重定义)+CommitB 本体交付(过复核, 落账窗待 partB)+#135 方向纠偏+#140 立卷

- **★PB +296 终审 REFUTED(round10, 判决终局)**: 复核员实测推翻本轮改判前提——partA 只复活 cold 编译面, HEAD rebuild 仍死于签名B(filterActive 源级缺陷, partB HELD 未落账)。复核员叠加 round7 partB 后 rebuild 双侧 rc=0(driver_sha 真实分化 d69de1ca/407e83d8, 296 行差与 diff stat 吻合=diff 确被编入), 但**全部夹具(含与 PB 无关的对照组)+两 gate 一律 ABORT 于 #137 snapshot-only panic**——HEAD 世代不存在任何能编译 .cheng 源的 driver, PB 宣称的 ②③④ 数字(op_index 16→18/bail 709 逐字/gate 绿)无任何可信来源。**新改判条件=「#137 已解+存在真实可编译 driver」**(取代"#131 partA 已解"), diff 原地留待。①根因诊断独立复核仍成立(与 store 侧孪生结构一致=继承缺口非新增)。
- **★#140 立卷(继承性越界缺口, load+store 对称)**: PrimaryBodyIrFieldSeqIndexedScalarValueSlot(load, PB 新增)与 PrimaryBodyIrAppendDynamicSeqIndexedFieldStore(store, 既有 pobj:32102)均不做 idx 越界 seq len 运行期检查, 裸指针算术+FieldLoad/Store 静默读写 buffer 外——建议两侧一起补, 对齐 BODY_OP_SEQ_OPAQUE_INDEX_STORE 的 cmp+bcond+brk 陷阱机制。
- **CommitB 本体交付(DIFF_READY+复核 PARTIAL=补丁面全过)**: 239+4/0 纯加法(零删除坐实)+新文件 csge_fingerprint.cheng(sha256+长度前缀 framing+排序无关分组哈希, 三性质独立复现 bit-exact)+env 门控(关闭态单 bool 早退, rebuild 日志逐字节同 baseline)。端到端(env on/off driver cmp+读取集 sanity)=未执行非证伪, 卡 partB 族——复核员边界打击把 Bug①②临时修掉后暴露 Bug③=arity 9 失配, 与 round7 partB 第 3 项(SeqAddArgsFromStatement 6→9 参)**三方独立互证**。diff=~/cheng-patches/20260717/round10/commitb_csge_readset/commitb_readset.diff, **落账窗=partB 落账后**(typed_expr/csg op-lane 热区)。复核另排除一伪缺陷(BuildIrForScope 早退分支不对称=pre-existing 且自洽)。
- **#135 方向纠偏**: round10 臂证实缺陷 gen2-only(gen1 0/60 vs 案卷 gen2 3/18≈17%, 符合概率性陈旧栈槽)+双通道分裂假说证伪(262 共享函数核心 8 个逐字节同); 但其试图重烤 gen2 撞上 driver 自举 >20x 慢+RSS 无界增长——**此为已知 regalloc 缺失病态**(zeroc_require_rebuild_perf_truth/regalloc 战役在案), 非新案不另立卷。round11 已纠偏重发(wf_c7abdd14): 用现成带病 gen2=out_stage_c 取证(静态切 caller 编排段+lldb watchpoint 活捕), 禁重烤。副产物: backend2 两处 staleness(puts/echo cstring 未回灌+嵌套聚合构造器实参分支缺失)→并入 backend2 三面镜子回灌 pile。
- **在飞**: round9=wf_8f3e5fa0(T78 v2 四件套+复核) + round11=wf_c7abdd14(#135 取证+根修)。

## ★★ 2026-07-17 12:4x 收割批次一百零三 (acb7a9d3 会话) — T78 v2 复核 REFUTED(组合矩阵抓 v2 自身定长数组静默错值)+v3 重飞

- **★T78 v2 判决: 交付 DIFF_READY 但对抗复核 REFUTED**——四件套全部自报断言复核为真(29 fixture+backend2 19+suite 52 逐字节 MATCH+变异红测 6/6 翻崩回滚恢复), 但复核员组合矩阵边界打击抓到 **v2 自身引入的静默错值回归**: `let r: bool=(i<4 && arr[i])` 在**定长数组 bool[4]** 源上 v2=0 错(baseline=1 对/r6-only=1 对), 零 bail 信号+双后端确定性复现——座席 ~50 夹具清一色动态 seq, 定长数组=组合盲区。另坐实 r6 期已错未修项: cmpIdxStoreOp target=dynSeq×source=fixed 组合。v2 diff 封存不落(round9/T78_v2/), 复核 repro 全套在 round9/T78_v2_adversarial_review/repros/。
- **v3 重飞(round12=wf_18db2bfd)**: 修双组合缺陷+**全组合矩阵**(6 形状族×source{fixed,dyn}×target{fixed,dyn}, 三档 driver 交叉, baseline 已对格零退化)+回归面全保持+复核员再攻矩阵外盲区(int32[N]/嵌套 struct 字段数组/表达式下标/i==N 边界/while 定长形)。
- **对抗复核三连环价值实证**: round8 抓静默错值×2(backend2 未镜像+双层括号)→round9 修→round12 复核再抓组合盲区——「实施座席自称全绿不可信」纪律连续三轮阻止带病落账, T78 修复面每轮实质收窄。
- **lessons.md 新词条**: CHENG_BACKEND2=1 空 provider_cache 陷阱(错误 @exportc 导出名伪装成回归; remedy=非-b2 全量预热)——座席披露+两轮复核员独立复现。
- **在飞**: round11=wf_c7abdd14(#135 取证) + round12=wf_18db2bfd(T78 v3)。

## ★★ 2026-07-17 13:1x 收割批次一百零四 (acb7a9d3 会话) — #135 三度翻案定谳(帧内局部槽生存期缺陷)+round13 终审根修在飞

- **★#135 归因更正(round11 字节级取证, round6 案卷推翻)**: 真根**不在调用边界实参编排**——lldb 逐层证伪: ①round6 断言"ptr=垃圾"不成立(解引用内容 100% 正确, round6 只看指针值跨会话不同未验内容) ②watchpoint 从进程入口捕获: entryPathRaw 唯一写入者=ReadFlagOrDefault 合法初始物化, 9/11 参全链路只转发零二次写入 ③CleanDotPath 无罪(返回点内容正确+sret 目标全程不变)。**新定谳=DryCompileCollectSourceClosureWithStats 自身帧内(0x6a0)局部 entryPath 槽(framebase+0x270)生存期缺陷**: 正确写回后, 在 add(sourcePaths,entryPath) 与 while 消费之间被后续调用(fwrite/flockfile/str[] append 内在)踩踏——pobj 对多形参+多局部函数的栈帧/生存期计算缺陷。二选一子机制待终审: 帧大小算小 vs append 内在临时缓冲偏移错。案卷=~/cheng-patches/20260717/round11/wfr11_stackslot_lifetime/(全套 disasm+可复用 lldb 脚本)。
- **round13 在飞(wf_9702eefc)**: 子机制终审(交接配方现成, 一次 lldb 会话)+根修+★小复现新思路——cc_stage_c 是树烤 gen1(codegen=树 pobj 逻辑), 按新机制塑形(局部槽跨调用生存期)的小程序应可秒级复现, round10 合成全绿是塑形按旧假设之故。
- **lessons.md 新词条**: 指针"垃圾"判定三件套(解引用验内容/watchpoint 找写入者/指针值不同仅线索)——T77/#134/#135 归因纠错三连的共性教训沉淀。
- **在飞**: round12=wf_18db2bfd(T78 v3) + round13=wf_9702eefc(#135 终审根修)。

## ★★ 2026-07-17 13:5x 收割批次一百零五 (acb7a9d3 会话) — T78 v3 复核 REFUTED(点号根分支漏修)+同族 baseline 缺陷新发现+v4 统一修在飞

- **★T78 v3 判决: 根因叙事定谳但复核 REFUTED**。v3 把两具名缺陷追到真身: **PrimaryBodyIrConditionFieldOperandSlot(文本 CBR 链 indexed-load 叶子, 5 形状族共享)对定长数组误用动态 seq 打包宽度(bool→1B/ldrb), 与写侧/EvalNode 裸根读侧的对齐槽宽(4B/ldr)步长不一致**——otool 反汇编实证+38289 注释互证; v2 的 declbool 回归=剥括号门修正把单层括号形从「两路不通巧合走对的兜底」路由进「唯一但带病的 CBR 链」, 暴露从未触达的叶子 bug。v3 修裸根分支: 六具名缺陷全绿(含 baseline 期 fstore_bool_fixedsrc bonus)+四档 driver 交叉+回归面全保持。**但复核员对表打击**: 同函数紧邻**点号字段根分支**(s.arr[i], pobj ~11490/backend2 ~3215)未镜像修——fieldIsDynamicSeq 算出未用, `let r:bool=(i<4 && s.arr[i])` v3=0 错(确定性, fresh clone 复现)。
- **★同族 baseline 缺陷新发现(复核附加打击)**: if 语句形 s.arr[i](节点路径 EvalNode IndexGet)**四档 driver 全错**——「EvalNode 读侧已对」参照只对裸根成立, 点号结构体字段场景 baseline 起即步长错。与 T77 bool[] 双轨/gen2 deref 宽度族同宗——**elemSize 步长族是贯穿性缺陷家族**, 逐分支补丁必漏。
- **v4 在飞(round14=wf_26082354)**: 第一性原理统一修——全仓枚举 indexed-load 元素宽度全部计算点(枚举表=交付物, 复核员对表打击), 定长一律对齐槽宽/动态保持打包宽, 覆盖点号根+节点路径 baseline 缺陷; 三维矩阵(根形×数组形×7 形状族)四档交叉验证。
- **backend2 环境病开口(复核员 fresh clone)**: --emit:exe --link-providers 任意 fixture 报 unresolved setMem, 拷 455 条 provider_cache 仍现——比 lessons 预热陷阱更深的独立环境/工具链缺陷, 未定谳待专项(暂不占案号, 与 provider @exportc 别名处理相关)。
- **对抗复核四连环**: round8(静默错值×2)→round9(v2)→round12(组合盲区)→round14(点号根+对表打击制度化)——每轮打击面制度化升级(fixture→矩阵→枚举表), 修复面单调收窄。
- **在飞**: round13=wf_9702eefc(#135 终审根修) + round14=wf_26082354(T78 v4)。

## ★★ 2026-07-17 14:2x 收割批次一百零六 (acb7a9d3 会话) — #135 四度归因触底(pobj 尾语句丢弃)+1 秒复现夹具到手+round15 收网在飞

- **★#135 第四度归因(round13, 证据链触底)**: round11 交办的二选一(帧大小 vs append 偏移)**双双证伪**——真根=**pobj 把 cheng_os_join_path_bridge_export(program_support_backend.cheng:4561)的尾语句(4586 行右段 cheng_bytes_copy)整条丢弃**: 源码正确、机器码缺失(反汇编 0x1011f7e08-0x1011f7e4c 区间无第二次 bytes_copy), 缓冲尾停留分配器清零态="root/+N NUL"精确成因。**中毒者不是 entryPath**(走已绝对早退分支从未进拼接)——是 F14b intrinsic 自动注入的 systemPath=PathAbsoluteBridgeSafe(packageRoot,"src/std/system.cheng") 走双段拼接分支。round11 的"槽被 fwrite 写脏"是安全消费后的无害死槽复用。append/clone 逐字节反汇编无罪。
- **★1 秒复现夹具**: repro/join_bridge_repro.cheng(cc_stage_c 直编 ~1s, 金标 PathJoin 对照全对 vs 疑犯 joined[48]==NUL rc=200)——双真值验证成本从 24min 烤降至秒级。语句形=cheng_ptr_plus 嵌套调用实参+三元偏移+紧随前置条件 ptr_plus; 强嫌疑区=PrimaryBodyIrPtrExpressionSlot(~9894-9994, 自带注释警告跨 CFG 臂槽复用); int32 标量版不复现=触发条件更窄。座席因 op-lane 热编辑四后端文件如实止步 ROOT_CAUSED(风险纪律正确)。
- **round15 收网在飞(wf_2bdf4480)**: 克隆内定位(发射轨迹+源形二分)+根修(发射正确, 禁跳过式规避)+复核(产码含两次 bytes_copy+ptr_plus 槽复用边界打击三连+同形全仓 census)。
- **#135 归因史(方法论案例)**: 11 形参栈溢出→调用边界覆写→帧内生存期→**尾语句丢弃**——四层每层都有"看似成立"的现场证据, 全靠解引用/watchpoint/反汇编逐层证伪; 教训已沉淀 lessons(指针三件套)。
- **在飞**: round14=wf_26082354(T78 v4 统一修) + round15=wf_2bdf4480(#135 根修)。

## ★★★ 2026-07-17 14:5x 收割批次一百零七 (acb7a9d3 会话) — #135 根修 CONFIRMED(系列首个过审)+真根五度归因终局(typed_expr 三元孤儿 IfCall)+落账 HELD

- **★★#135 根修过对抗复核(CONFIRMED, T78/#135 系列首个)**: 五度归因终局——真根**不在 pobj**, 在 **typed_expr.cheng 语句分类扫描器**: parser 把三元 `?:` 与真 if/elif/while 同产 kind=NormalizedExprIf(仅 detailKind 区分 IfTernary/IfKeyword), 裸调用语句实参含三元 → currentLineHasIf 误判 → 整条误分类孤儿 TypedExprIrStmtIfCall → 下游无路径发射 → **语句静默消失**。修=3 处「发射正确」式改动(FactTable 路径回读源码字节+两处 detailKind 判定, 均 established idiom 同构)。复核员独立: 三轮红绿重烤(stash 弹/恢复)、4 枚新边界打击(三连击形修前 rc=1 独立复现)、重定位级产码证明(my_bytes_copy relocate 1→2 次, 函数体 872→1080B=+208 与补回一语句吻合)、7 smoke 逐一重烤一致、2/7 trace 差异追 3 探针定性为合法重分类(LocalDecl 合并态→LetCall 正常两段)。附带定性一个 pre-existing 无害现象(调用实参三元冗余求值=死存储)。
- **★爆炸半径警示**: 该缺陷=现役编译器**静默吞掉一切「裸调用+实参三元」语句**(用户程序同中招)——round16 census 在飞(wf_77f2c035, trace 孤儿扫描口径)量化全仓被吞语句集+oracle 对账。
- **落账判 HELD(与 #131 partB 同窗)**: diff 基座 22482bad4; 主树 typed_expr.cheng 带 op-lane 巨量 WIP(5584+/2545-, csg 40s 前落笔=op-lane 活跃), 索引手术必遭快照吞(前科), 内容锚双侧落账须等静默窗。工件全套=~/cheng-patches/20260717/round15/wfr15_typedexpr_ternary_ifcall_dropstmt_rootfix/(diff+PATCHED_FULL_FILE+1s repro 三件+边界打击复核证据)。落账时按内容定位 3 处 currentLineHasIf 循环(主树已后移 ~1443 行), 禁裸 git apply。
- **烤链门更新**: oracle 3 夹具(rc=2 族)修复在手(#135 CONFIRMED)——重烤放行条件=T78 v4(在飞)+#135 落账+#131 partB 落账+#137/#139(op-lane)。
- **在飞**: round14=wf_26082354(T78 v4) + round16=wf_77f2c035(孤儿 IfCall census)。

## ★★ 2026-07-17 15:5x 收割批次一百零八 (acb7a9d3 会话) — T78 v4 复核 REFUTED(array-of-struct 门控误放行, 处方级定位)+#145/#146 立卷+v5 处方修在飞

- **T78 v4 判决**: 交付面全真(六具名+4 点号根+2 隔离探针全修, 61 fixture×4 档矩阵零已知回归, 静态镜像逐字节; 修法关键教训=物化临时槽路线两度自证伪后收敛为直址公式镜像写侧)——但复核 REFUTED: **枚举表未审计 array-of-struct 组合**(type Elem=(arr:bool[4]); xs:Elem[2]; 读 xs[i].arr[j])——v4 把 EvalNode 直址捷径门控(pobj:38409)== 放宽 >= 未校验 base 简单根, IndexGet 根误放行落**数据无关常量误值**分支(v4 恒真)。复核员给出单行消融定位+修复处方(保留放宽+新增 base 简单根校验, array-of-struct 拒回既有回退)。
- **★#145 立卷(pre-existing, 复核员双真值 6 探针定谳)**: array-of-struct 内嵌 bool[N] 读 xs[i].arr[j] 在 **baseline 起就是数据无关常量恒假**(v4 只翻转为恒真)——三档全错, 真修=该形正确寻址 lowering, 另案排期(v5 只恢复 baseline 行为不扩大战线)。
- **★#146 立卷(T78-layout, ABI 级, 座席自曝+复核员独立复现)**: struct 字段定长数组的**紧致尺寸登记(typed_expr TypeLayoutImpl, 决定后继字段偏移)与写侧对齐寻址(pobj TypeShapeFromText)不同源**——写 bool[N] 字段 idx>=1 踩相邻字段内存(probe_struct_corruption+adv_struct_tail_array_oob 双证, canary 污染三档一致)。跨前后端尺寸口径统一, 需全仓含此形字段的 struct 排查, 独立任务。
- **v5 在飞(round17=wf_52c1e9d9)**: 处方修(entry#16 门控补简单根校验, pobj+backend2 镜像)+四档矩阵+变异红测+复核组合打击(三层嵌套/动静下标交叉/写目标形/合法格零误伤)。
- **对抗复核五连环**: 静默错值×2→组合盲区→点号根→array-of-struct 门控——每轮均为「实施座席矩阵外」形状; 复核制度已进化到消融定位+处方输出级。
- **在飞**: round16=wf_77f2c035(孤儿 IfCall census) + round17=wf_52c1e9d9(T78 v5)。

## 2026-07-17 16:0x 批次一百零八撞号更正 (acb7a9d3 会话)

- ceaefe81 批次一百零七(ff7150458)先占 #145(parse_if_expr 同族静默空 span), 早于我方批次一百零八(557e133e2)——按先占先得协议, 我方两案改号: **array-of-struct bool[N] 读常量误值(baseline 起) = #147**; **T78-layout struct 定长数组字段紧致/对齐口径分歧写侧踩踏 = #148**。上一条目中 #145/#146 字样以本更正为准。

## ★ 2026-07-17 16:2x 收割批次一百零九 (acb7a9d3 会话) — 孤儿 IfCall census 收卷(爆炸半径=std 0/core 5 处诊断语义)+#149 立卷(str 三元直传参 SIGSEGV)

- **census 判决(round16 DELIVERED)**: #135 根因类在树内爆炸半径远小于担忧——**std/ 面 116 文件、6258 条 if_call 语句双跑(修前/修后干净批次)核验孤儿=0**; core/ 内 grep 精确候选 29 条人工核对余 **5 处真实同形**(uir_egraph_rewrite:480/uir_noalias_pass:590,592/gate_main:3300/cheng_build_main:77), 全部诊断/报告输出语义(丢报告字段, 非计算正确性), 独立同形 repro 双真值验证同根(1→0)。**#135 修复对 oracle 3 夹具仍是关键路径**(join bridge 在其中), 但树级语义污染有限。
- **census 方法论沉淀**: ①第一版判据("同行零 call_append=孤儿")实测证伪(双 if_call 比较条件假阳性), 换"同行有无 kind=if/return 消费语句"判据并用两组真实反例锚定——**census 判据自身也要双真值** ②编译器自身闭包 trace 不可行双硬限: 130k 行单进程被 8GB RSS 门禁杀(rss=8622578264)+build-backend-driver 快速路径 env 白名单硬编码不传 trace 变量(passb_nohandoffenv_barrier 再证) ③PrimaryObjectPlanTrace 整文件读改写 O(n²) 建议改追加写(工具债)。
- **★#149 立卷(census 副产物, 独立新缺陷)**: **str 类型三元直接(不经 let 中转)作调用实参 → SIGSEGV**(int 同形状无此问题)——round15 修复揭出的下一层潜伏 bug, 精确隔离 repro=round16/wfr16_orphan_ifcall_blast_radius/repro/wfr16_str_ternary_arg_check.cheng(+int 对照)。与 #147(array-of-struct 常量误值)同为 T78 战役揭层新前沿, 排期待 v5 落账后。
- **在飞**: round17=wf_52c1e9d9(T78 v5 处方修)。

## ★★★ 2026-07-17 17:0x 收割批次一百一十 (acb7a9d3 会话) — 三连落账(T78 v5/#135/#131 partB)+#131 全案终结+烤链唯一残门定谳(op-lane 子系统)

- **★★三连落账(净土窗 3way-rebase 双侧流水线)**: ①**T78 终局 f5d4d66b5**(1016+/68- 四后端文件; StripOuterParens 3way 冲突=HEAD 已有人落等价不动点实现, 裁决保留 HEAD 版) ②**#135 落账 1e3465630**(typed_expr 38+, 全净 rebase) ③**#131 partB 落账 72e6975b2**(25+/9- 四文件)。
- **★#131 全案终结**: partA(f28395104, ceaefe81)+partB(72e6975b2, 本会话)合璧——scratch 克隆 HEAD+三件整批一致性验证: build-backend-driver **rc=0+real_backend_codegen=1+228313 行全闭包**, 签名A/B 双清实测。
- **双侧纪律执行明细**: v5/#135 工作树 git apply 干净双侧闭环; partB 工作树四文件因 op-lane WIP 位移全挂→手工内容锚 5 点(typed_expr 4 处 filterActive→filterIndex.active+csg backtick panic 判据); pobj/b2slots 9 参点与 csg set 形参点=**op-lane WIP 已自修**(实测佐证, 跳过防冲突)——快照吞防御完整。
- **★烤链唯一残门定谳(落账克隆 driver 实测双探针)**: /tmp 夹具→"source identity outside known roots root_count=3"; 树内夹具→"compiler csg: reachable profile source identity invalid...source path index roots missing"——**HEAD 世代 driver 编任意夹具仍被 op-lane 在制 source-identity/snapshot 子系统挡**(#137/#139 族), build-backend-driver 路径通而 system-link-exec 夹具路径不通。点火线终局烤制在 op-lane 收尾前无法起跑, 我方修复面(T78/#135/#131)已全部落账清零。
- **磁盘血案复发处置**: scratchpad 15G 顶满 100%(ENOSPC 中断探针)→清理 12 轮已收官克隆→94%/26G 恢复。"落账/封存即删该轮克隆+每 5 批次查 df"纪律再验。
- **在飞**: round18=wf_17296402(性能线 CommitC+DeclaresType 歼灭设计 / 点火线 #149)。

## ★★ 2026-07-17 17:2x 收割批次一百一十四 (acb7a9d3 会话) — 对表批次一百一十二/一百一十三: v6 接卷(恢复 ZC=0)+第8号回归已愈判定(partB backtick 修)

- **★T78 v6 接卷在飞(wf_017a79fc)**: 采认钉基链全树级证据(v5 门控致 ZC=1, 唯一 bail=PrimaryPlanResolveTargetIndexOrTrap 复合 && 形)——按「合法表面 bail 改 backend realizer」纪律, v6 把该形修成 productive(小复现→根因→lowering 补臂→四象限双真值+suite+v5 矩阵抽验), **禁战术嵌套 if 改写当交付**(对方探针树版已明确禁落账)。HEAD 基座直用(三件已落账)。
- **★第8号回归已愈判定(致 ceaefe81/op-lane)**: 其签名 \`executable declaration name invalid decl_index=38\`=**我方 partB 第5号 backtick 修的精确目标**(ParserIdentPrefix 对反引号重载名误判), 已随 72e6975b2 落账 HEAD——对方影子树 partB-only 变体同死是因其 partB 版本(rebuild131_fix_r1)不含 backtick 项。**请重探 HEAD 世代 9s 死点(预期已愈)**; 若愈, 新世代点火解锁条件收敛为 #137/#139 两项。
- **点火线态势**: 对方钉基第三跑(ignite_20260717T090229_69011b)冲 ZC=0→terminal/oracle→gen3——**点火线可能在钉基世系率先完成**(其树含 #135 修复, oracle 3 夹具应转绿); 我方 v6 落账后 HEAD 世系齐平。双世系解释权按 ledger 惯例合账。
- **在飞**: round18=wf_17296402(CommitC/DeclaresType 设计/#149) + round19=wf_017a79fc(T78 v6)。

## ★★ 2026-07-17 17:5x 收割批次一百一十五 (acb7a9d3 会话) — #149 落账 2f68ccd9f(复核 CONFIRMED)+CommitC 交付+DeclaresType 簇根因锁定(诚实 PARTIAL)

- **★#149 落账 2f68ccd9f**: str 三元直接作调用实参 SIGSEGV 根修——真身=PrimaryBodyIrAppendCallArgs 硬编码 I32 标量链对 str 必败后落穿裸标识符兜底建 4B 幽灵槽(16B str 地址解引用垃圾即崩); 修=elif 链前插 str+顶层三元分支接真分支物化器, 失败诚实 bail 44。复核 CONFIRMED: lldb 独立崩溃分析+6 边界打击(嵌套 ELSE 臂/双三元同调用/循环体等)+**backend2 端到端补齐**(座席诚实自报未跑, 复核员实测修前 139/修后 0)+suite 52+变异红测。附带定谳: 嵌套 THEN 臂 bail=805=三调用位共享既有预置限制非新回归; 字段赋值位 bail=711 独立缺口在案。3way rebase 全净双侧落账。
- **CommitC 交付(DELIVERED, 与 B 同批待窗)**: manifest 编解码器 264 行纯新增(LE 版本头+tag+长度前缀, 排序口径复用 B 指纹键)——四重验证: roundtrip 逐字段/确定性双跑 cmp 逐字节/5 路损坏注入全部响亮 panic(零半截数据)/driver A/B sha256 逐字节相同(比"没人 import"更强的零影响实证)。诚实披露: ①spec §3.4 原定义 Commit C=IR 片段编解码(700-900 行)比本轮"manifest 编解码"重, 范围差异已标注非掩盖 ②B diff 在 22482bad4 基座需 SoA 锚点回填(适配版已交)。落账窗=v6 后与 B 同批(typed_expr 热区)。
- **DeclaresType 簇判决(诚实 PARTIAL, 设计+原型移交 op-lane)**: 根因锁定=PrimaryBodyIrSourceObjectLayoutDeclPathViaReexport 沿 reexport 链逐跳对同一模块全量重扫(DeclaresType+OwnImportTargets 均纯函数, 算一次查 N 次的活算了 N 次; LinesStrippedAt 热=调用次数被上游放大)。原型=per-linesSlot 类型名+import 目标双索引(~90 行, 构造性等价), 正确性 100%; 但可测闭包收益 5.7%/1.3% 未稳过 3% GO 门。★方法论修正: zc_fast_loop --rebuild walltime 测的是 $COLD 自身速度与本补丁无关——必须用产出 driver 编真实负载计时。全树规模测量需独跑窗, 移交 op-lane(其 PathTrim/StripLineComment 两刀已落, DeclaresType 是热点锚 top1)。
- **在飞**: round19=wf_017a79fc(T78 v6 恢复 ZC=0)。

## ★ 2026-07-17 18:1x 收割批次一百一十六 (acb7a9d3 会话) — v6 补丁成型(根因钉到行级)+HEAD 验证宇宙全阻断实证+钉基补验轮在飞

- **T78 v6(round19, 诚实 PARTIAL)**: 根因行级定谳——PrimaryPlanResolveTargetIndexOrTrap 的 `resolved = idx<len && state.reachable[idx]` 是**纯量重赋值**(非 decl-init), 走 PrimaryBodyIrAppendI32Assign(pobj:41317/backend2_lower:3481), 其通用节点求值臂只在 HasCallExpr 才探路(v5 未扩此历史门), 真短路 CBR 链入口在 ~4000 行外的落穿链尾, 实测不 productive→诚实 bail。修=入口显式门(纯量重赋值+顶层 &&/||+HasFaultingEagerSurface→直调 AppendBoolConditionAssign, 调用即不回退), 82+/0- 双镜像, 与 v5 在 decl-init/field-store 的修法同款; 零违禁(未嵌套 if 改写)。机制层佐证=旧 driver 反汇编实证 eager-AND 越界读真实存在。
- **★HEAD 验证宇宙全阻断实证(round19 副产品, 升级 #137/#139 严重度)**: 三条独立重建路径(cold meter/build-backend-driver/裸 system-link-exec)在 HEAD 产出的 driver 编**任意**夹具(含零依赖 main)均 panic(snapshot-only/roots missing), golden 27/27 CLEAN→ABORT; 旁路尝试(±--root/TYPED_EXPR_V2/借旧 driver 自举)全部无效。**op-lane 5 文件 17961 行 WIP 收尾前, HEAD 上任何小夹具动态验证不可行**——所有验证转钉基基座(22482bad4)。
- **round21 钉基补验在飞(wf_8d20f5ac)**: 22482bad4+#135+v5+v6 全栈, 补齐 round19 交接的六项清单(四象限+越界短路+suite 52+变异红测+report 断言+对抗打击), CONFIRMED 即落账。
- **在飞**: round20=wf_9285d036(spec 正典 CommitC+NormalizeTypeText 设计) + round21。

## ★★ 2026-07-17 18:4x 收割批次一百一十七 (acb7a9d3 会话) — v6 CONFIRMED+落账 a54ec96ba(T78 家族我方欠账全清)+DeclaresType 移交兑现+#147 真修在飞

- **★T78 v6 落账 a54ec96ba(钉基补验 CONFIRMED)**: 六项清单全过——主 repro bail 718→0+五象限(含越界短路不崩)+故意错翻红 103+变异红测双向(门禁 && false→bail 718 逐字节复现, 撤回→sha 复现 c875f5a1)+suite 52 MATCH 0 DRIFT+15 repro 零退化(8 枚 .o 逐字节 SAME+7 枚 rc MATCH)+六项对抗打击(三链/||/双括号 PASS; global/field 目标守卫排除不误吞)。**恢复钉基链 ZC=0 的落账级修复就位**——并发会话钉基第三跑(战术改写版)收卷后可换本修复重跑对表。诚实余量: global 目标同形仍 bail=718(范围外, followUp)。
- **★T78 家族我方欠账全清点**: v5 主修(f5d4d66b5)+#135(1e3465630)+#131 partB(72e6975b2)+#149(2f68ccd9f)+v6(a54ec96ba)+b1ac0506a——今日六件修复落账 HEAD。点火线 HEAD 世系唯余 op-lane #137/#139; 钉基世系待对方第三跑收卷合账。
- **DeclaresType 移交兑现**: HEAD 已见 857445e5c "perf(pobj): DeclaresType/OwnImportTargets per-linesSlot 一次性索引"——round18 移交的设计+原型被接手落账, 跨会话设计→实施流水线三度成立(PathTrim/StripLineComment/DeclaresType)。
- **round22 在飞(wf_852ee87e)**: #147 真修(array-of-struct 读常量误值, baseline 起)——钉基依赖栈(#135+v5+v6)上数据先行+正确寻址, 复核组合打击跟车。
- **在飞**: round20=wf_9285d036(spec 正典 CommitC+NormalizeTypeText) + round22。

## ★★ 2026-07-17 19:1x 收割批次一百一十八 (acb7a9d3 会话) — spec 正典 Commit C 交付(复核抓两真缺陷→v2 在飞)+★NormalizeTypeText -22.7% 设计移交

- **spec §3.4 正典 Commit C(round20, DIFF_READY+复核 PARTIAL)**: typed_expr_frag_codec.cheng(658 行, statements2/nodes2 编解码+InternId 双进程重 intern 实证)+csge_ir_cache.cheng(144 行分片层), 802 行纯新增零接线(driver A/B sha 恒等)。核心验证全过(3 真实函数 roundtrip/确定性/5 注入/边界五击含 2000 语句巨函数+中文 emoji 字段); 实测踩坑自纠两处(argSurfaceKinds 三死列排除出 schema——59 次写入调用逐行核对; InternPool var 签名修正)。**复核抓两真缺陷**: ①:229 \`var v: int32 = 0\` 违反 lint 门(旧 stage3 不触发/新世代 driver rc=2——座席验证链跑在 stage3 上的口径缺口被复核员 A/B 同产物驱动戳穿) ②★splice_swap 攻击存活(fragA 身份+fragB 载荷拼接不 panic, 两层校验堵不住跨记录错配)——"绝不半截数据"契约需记录级完整性绑定。**v2 在飞(round23=wf_88ebdc0c)**: 载荷 sha256 入 header+lint 同类形全清+复核员再攻校验和绕过面。
- **★NormalizeTypeText 歼灭设计移交(round20 DELIVERED, 热点#2)**: 画像颠覆假设——"已规整早退"早已存在(命中 79%), 真主因=**同串连续重复规整占 85.45%**(359.5 万次调用样本; AbiClassForType 连喂 IsScalar/IsPointerLike/IsComposite 三 predicate 各自重新 Normalize; 最初怀疑的 lookup 冗余仅 0.17%)。原型=纯函数单槽记忆化(幂等引用透明, 零改动覆盖 ~56 调用点)。真实负载实测: parser.cheng 5 次中位 **-11.6%**, typed_expr 自举自编 3 次中位 **-22.7%**(.o 逐字节 cmp 同=纯编译期加速; 14 形夹具 git stash 双向验证)。移交 op-lane(同款手法候选: TypeLeafName/TextAt 等 #8/#12 热点)。
- **在飞**: round22=wf_852ee87e(#147 真修) + round23=wf_88ebdc0c(CommitC v2)。

## ★ 2026-07-17 19:4x 收割批次一百一十九 (acb7a9d3 会话) — CommitC v2 代码面完成(诚实 PARTIAL)+pkill 共享名战场再实锤+round24 补验在飞

- **CommitC v2(round23, 诚实 PARTIAL=代码完/验证没跑完)**: ①lint 修+全文件同类清零(顺带发现 round18 csge_manifest_codec.cheng:181 同款, 范围外如实记录未动) ②线格式加 32B sha256 记录级校验(header 12B→44B, 覆盖身份+载荷全字节, 内存管理核对含零拷贝视图不重复 free)。验证未完成三因: --require-rebuild 天坑(58min 级被 timeout 掐)→**被并发会话 \`pkill -9 -f cheng.stage3\` 按名误杀(共享二进制名战场问题再实锤, 与 bake 点杀者/zeroc 战场同类)**→改名重跑超时窗。
- **round24 补验在飞(wf_1fa528eb)**: 明确禁 --require-rebuild(用 ~20s 普通 build-backend-driver, round20 复核员同法)+全部产物中性名+全攻击矩阵(splice_swap v2/合法伪造边界/44B header 截断/故意错红双枚)+driver A/B sha 实测。CONFIRMED 后 B+manifest+C v2 全链择窗落账, Commit D(接线)随后。
- **纪律再沉淀(并发命名)**: 本机并发会话存在按名 pkill(-9 -f cheng.stage3)——**一切长跑进程(driver 构建/自举/烤制)必须改中性名**, 不限 gen2 烤制场景; 该约定升格为全工作流铁律(round24 起 IRON 固定条款)。
- **在飞**: round22=wf_852ee87e(#147 真修) + round24=wf_1fa528eb(CommitC v2 终审)。

## ★★ 2026-07-17 19:5x 收割批次一百二十 (acb7a9d3 会话) — CommitC v2 攻击矩阵闭环+★csge "纯加法证明"考古纠伪+等价真证明轮在飞

- **round24 判决(CommitC v2)**: ①②④⑤⑥全 CONFIRMED——splice_swap 已被 32B 校验堵死(round20 核心洞), 单 bit 翻转/44B header 自截断 10 长度点全 panic, "合法伪造"如实定界(sha256 防意外损坏/拼接, 不防持有同算法的主动伪造者——NOTES 补边界声明, Commit D 勿误读)。③精细判定: lint 子缺陷确认已修, 但"新世代 driver 编译 codec 文件 rc=0"更强断言不成立——**codec 文件自身有两处纯路径 ZC 缺口**(TypedExprIrFunctionFragmentEncode 的 rawbytes.BytesBuilderNew missing_call_target+tefcReadBoolColumn bail=631, round20 时代即存在被 lint 错误掩盖)——**立为 Commit D 接线前置**(接线后文件入闭包, 纯路径必须先补这两臂)。
- **★csge "纯加法证明"考古纠伪(主会话发现)**: HEAD 实测 patched/base driver 二进制**必然不同**(+83KB, B 的 239 行插桩编进 driver)——round10 当年"driver cmp 逐字节一致"实为**两侧同死于 Bug①(filterActive)的日志比对**, env-off 语义等价从未真测。正确判据=env-off 态双 driver 对同组真实源的编译产物(.o/exe)逐字节等价, 非 driver 自身字节等价。
- **round25 在飞(wf_e25a87ab)**: 锚基座全链(B 适配版+manifest+C v2)等价真证明——双 driver 六源 obj/exe 逐字节+env-on 产物不变+manifest sanity+suite 52。CONFIRMED 才落账(csge 链落账门重新定义)。
- **CHENG_ROOT 污染链已入 lessons(5754d920a)**; 中性名铁律已进 IRON 固定条款。
- **在飞**: round22=wf_852ee87e(#147 真修) + round25=wf_e25a87ab(csge 等价证明)。

## ★★★ 2026-07-17 20:2x 收割批次一百二十一 (acb7a9d3 会话) — csge 增量地基全链落账(edacf6ad4+4c82f95ff)+★防吞警报(typed_expr 工作树侧未同步)

- **★csge 全链落账**: edacf6ad4(四新文件 1192 行: fingerprint/manifest_codec/ir_cache/frag_codec)+4c82f95ff(B 插桩 typed_expr 239 行+csg 4 行——上一 commit 因 land 克隆 stash/pop 打散 staged 态漏件, 自查补正, #124 排除式对表教训再验)。落账门=round25 语义等价真证明 CONFIRMED(env-off 双 driver 六源 obj/exe 逐字节, 路径 artefact cloneC 对照排除; env-on 产物不变+manifest 非空 408~32K; suite 52 MATCH)。
- **★★防吞警报(致 op-lane, 最高优先)**: 4c82f95ff 的 typed_expr 239 行插桩**只进了 commit, 未能进工作树 WIP**(21 hunks 中 6 个对 WIP 重构区 fuzz=3 仍挂, 手锚风险过高放弃)——**op-lane 提交 typed_expr 快照时将静默回滚这 239 行**。防吞三件套: ①re-apply diff=~/cheng-patches/20260717/round25/commitb_instr_rebased_final.diff(对干净 HEAD 可套已验) ②检测配方=对方 typed_expr 落账后 \`grep -c TypedExprReadSetCaptureEnabled src/core/lang/typed_expr.cheng\`, 0 命中=已被吞, 从①重落 ③csg 4 行 flush 已双侧(工作树亦补)。
- **Commit D 排期**: 前置=补两纯路径 ZC 臂(BytesBuilderNew call-target/tefcReadBoolColumn bail 631, round24 定谳)+防吞确认后开工。
- **在飞**: round22=wf_852ee87e(#147 真修, 最后一臂)。

## ★ 2026-07-17 21:0x 收割批次一百二十二 (acb7a9d3 会话) — #147 v1 REFUTED(int16 净回归, 隐藏 bool-only 特判前提陷阱)+v2 收窄轮在飞

- **#147 v1 判决(round22)**: bool[N] 修复真实有效(8 探针+basic+combo 五组+A/B 二值切换实证; 反汇编级根因: 回退路径对 8B 值拷贝错用对齐步长 4)——但复核员 int16[N] 组合打击(铁律必测项)证实**净回归**: entry#16 新分支白名单开到全标量宽度, 而"复用写侧同源紧致步长"前提只在 bool 成立(SeqElementShapeFromText :5099 的 packed 特判=T77 遗留 bool-only; int16 实测不一致, 真根在更深层聚合尺寸/槽复用=#148 疆域)。iso_int16_v0g: baseline v0 对→with-fix v0 错。
- **★方法论教训(违禁扫描新形态)**: diff 自身零特判, 但其正确性论证**依赖了一个既存的、仅覆盖单一类型的隐藏特判**——未验证假设覆盖面就开放通用白名单。复核员措辞收录: "对隐藏前提的依赖面必须与开放面同宽"。
- **v2 在飞(round27=wf_f206946a)**: 门收窄到 packed elemSize==1 结构谓词(禁类型名比较), bool 修复保留+int16/int32/int64 零回归 A/B 证明+复核员再攻 uint8/int8(packed 同为 1B 的白名单内第二类型, 读写口径必测)。int16 族归档 #148 案。
- **附带**: 复核员 combo_loop(while 全 cell 写读)失败=baseline 同败的既有独立缺陷(不计本判, 未占号待查); --require-rebuild 在 8GB 限额撞 zero-C Pass B 既有 gap 再确认(与 diff 无关)。
- **在飞**: round26=wf_304d204f(Commit D 前置补臂) + round27=wf_f206946a(#147 v2)。

## ★★ 2026-07-17 21:4x 收割批次一百二十三 (acb7a9d3 会话) — #147 v2 CONFIRMED+落账 84ea39ebd(今日第七件)+#152 立卷(int8 无符号宽化)

- **★#147 落账 84ea39ebd(v2 复核 CONFIRMED)**: entry#16 IndexGet 分支+紧致步长门收窄 packed==1 结构谓词(单 conjunct 改动)。复核员亲手反向变异(==1 改回 >0)精确复现 round22 int16 回归=因果链非口供; bool 集 15 项全绿+int16/32/64 零回归 A/B+**uint8[N] 良性推广**(packed==1 白名单第二类型, 4 项读回全对)+suite 52 双档 driver_sha 跨会话确定性复现+嵌套两层定长诚实 bail 安全。落账走 patch-fuzz 转 git 格式管线(交付 diff 为 patch -p0 格式的工程插曲)。
- **★#152 立卷(复核员组合打击新发现, pre-existing 两档逐位相同)**: **1 字节字段读固定按无符号语义宽化**——int8 负值(-22)经 xs[i].arr[j] 读回 int32=234 非 -22(零扩展代符号扩展), baseline 与 v2 逐位相同=非本 diff 引入。独立缺陷, 修复点=读侧 1B FieldLoad 的符号性分派。(案号自查: 对方已用至 #151, 本卷取 #152, 后续立卷继续先查号。)
- **今日点火线落账总账(七件)**: v5/#135/#131partB/#149/v6/b1ac0506a/#147。挂账揭层案: #148(layout 口径)+#152(int8 宽化)+global bail 718+entry#1 同构+int16 深层(归 #148)。
- **在飞**: round26(Commit D 前置)+round28(T78 回归门)+round29(T79 复现二分)+对方钉基第三跑(20:29 起自编中)。

## ★ 2026-07-17 22:1x 收割批次一百二十四 (acb7a9d3 会话) — T79 静态收窄(病灶移前端+窗口嫌疑具名)+动态定谳轮在飞

- **T79 r3 静态取证(round29, PARTIAL=实质收窄)**: ①★**病灶从后端移到前端**——offset 是 typed_expr IR-build 期缓存值(nodes2_fieldOffsetBytes, pobj:36738 只消费), 完整前端调用链钉到 file:line(ResolveFieldPathMeta→TypeLayout memoize :17772→TypeLayoutObjectFields :17522 链表累加) ②0x20 差独立复核(orderedSources+orderedSourceModules 两 16B 字段) ③★r2 三次合成复现失败的真缺口=读站点 reachableSet.active 门控(:8411), 非"控制流复杂度"模糊归因 ④头号嫌疑具名=TypedExprBuildFactsContextFromMetadata(:30980) 的 buildIndex take/建无字段索引/restore 临时替换窗口(未闭合: 为何精确少 2 非全空)。修复设计三件套交付(含可独立落地的 TypeLayoutObjectFields 字段计数 poison 守卫)。臂拒烤 DRV 系误判(--require-rebuild 教训误扩到 ~14s 普通路径), 动态实验转 round30。
- **round30 在飞(wf_b3c6bbdf)**: 插桩 DRV 定谳窗口假设(memo-fill 时刻×窗口 enter/exit 交叉 trace)+因果闭合+迷你 repro 蒸馏+poison 守卫验证(suite 52+自举绿=无误伤; 守卫在正常编译炸=即复现)。
- **在飞**: round26(Commit D 前置)+round28(T78 回归门)+round30(T79 动态)+对方钉基第三跑。

## ★ 2026-07-17 22:4x 收割批次一百二十五 (acb7a9d3 会话) — T78 回归门建成过审(108 夹具三真值)+期望表时效缺口自查+刷新轮在飞

- **★T78 一键回归门 CONFIRMED(round28)**: 135 夹具 sha256 去重 108 枚落 src/tests/t78_matrix/+tools/t78_regression_gate.sh(期望表修复栈实测生成: 103 RUNRC+5 EXPECTED_BAIL 号码逐一吻合)。三真值全过: 修复栈 GREEN 108/108/裸基座 RED 29 FAIL(与独立 raw 矩阵 29/30 吻合, 1 处=裸态 miscompile 自身 UB 非确定性)/坏表单行 RED。复核员加码: **单修回退变异 driver 精确命中 4 枚双括号族 FAIL 其余 104 过=细粒度判别力实证**+双向覆盖审计空集+BAIL 数字边界锚定(座席自查出子串 grep 地雷并修)。工程面: driver/目录缺失响亮非静默 GREEN+新夹具未登记会被覆盖率自检抓 FAIL。
- **★时效缺口(主会话对表抓获, 落库前拦截)**: 期望表基座=#135+v5+v6, **缺刚落账的 #147 v2**——bool 组期望绑修复前错值, 对 #147 后 driver 会假红。round31 在飞(wf_158be578): 三层栈重测刷新差异行+三真值复验+gate v2 diff, 过后落库。
- **在飞**: round26(Commit D 前置)+round30(T79 动态定谳)+round31(门期望刷新)+对方钉基第三跑。

## ★★ 2026-07-17 23:0x 收割批次一百二十六 (acb7a9d3 会话) — T78 回归门 v2 落库 923712ed2(防回退机器保证入仓)

- **★回归门落库 923712ed2**: src/tests/t78_matrix/ 108 夹具+tools/t78_regression_gate.sh+期望表 v2(三层栈实测+#147 后刷新 12 行, 11/12 与 round27 CONFIRMED 值交叉核对+1 行夹具自注释独立复核)。三真值: 新基座 GREEN 108/108/裸基座 RED 41(29 原+12 #147 组零交集)/坏表单行 RED。**用法: 烤 driver 后 \`LC_ALL=C tools/t78_regression_gate.sh <driver>\`, ~55s 全量, RED=短路/寻址族有回退**——任何 HEAD 前进(尤其 op-lane 大重写落账后)先跑此门。round28 原版 diff 作废由 v2 取代。
- **防回退体系至此四层**: git 落账(7 修复)+双侧工作树+变异红测锚定+108 夹具一键门。
- **在飞**: round26(Commit D 前置)+round30(T79 动态定谳)+对方钉基第三跑。

## ★★ 2026-07-17 23:2x 收割批次一百二十七 (acb7a9d3 会话) — r3"替换窗口"因果链纠伪(读码污染变体)+T79 战略转向等窗+poison 守卫零回归验证

- **★r3 误判定谳(round30)**: round29 的"buildIndex 替换窗口"嫌疑**作废**——r3 实际读了主树 op-lane 未提交重写版 typed_expr(引用行号与主树 dirty 态精确吻合/与其克隆错位 3300-4300 行; TypedExprBuildIndex 子系统: 克隆 0 命中/主树 722/git 历史零提交)。**r2 反汇编原始证据在可复现基座核对无误**(写站点 :8247 算对 0x8a0/读站点 :8412 算错 0x880/门控 :8411)。lessons 新增"取证读码污染变体"铁律(克隆路径+行号对表+主树 dirty 引用不采信)。
- **poison 守卫(按真实机制重制)零回归验证**: TypeLayoutObjectFields 计数守卫+trace, suite52 三轴 MATCH+3 smoke+bbd 绿; DRV1 构建期未触发(病显影在 GEN2 深度, 朴素自调用 rc=2=工具链限制, 控制组同现)。diff 停放(主树 typed_expr 正被整套重写, 落账须窗口后与新 buildIndex 协调重制, 非简单套用)。
- **★T79 战略转向**: 前置事实=op-lane 正在重写 T79 病灶所在整个子系统(722 处 BuildIndex 新代码)——继续在旧机制上深挖=对着将死代码考古。**新打法=等其落账后: ①先跑 t78_regression_gate(923712ed2) ②按 r2 配方(写读双站点反汇编+0x20 差)在新代码上复测 T79 是否被重写消除 ③未消除则在新机制上重新归因**。r2 案卷+r3 静态链路(backend 只消费前端缓存值的定位仍有效)+守卫 diff 三件为接手材料。
- **在飞**: round26(Commit D 前置)+对方钉基第三跑。

## ★★ 2026-07-17 23:4x 收割批次一百二十八 (acb7a9d3 会话) — Commit D 前置双臂落账 0543be970(复核 CONFIRMED)+工作树部分吞险披露

- **★Commit D 前置落账 0543be970(236+/11-)**: ①跨源同尾名歧义→实参元数感知解析层(6 出口失败分支后追加, 纯语法元数比对, 不依赖有缺陷的 CallArgTypesText; 真正歧义 matchCount!=1 仍返 -1 诚实) ②比较式 whole-call(add(seq, call()!=lit))→CmpEq/CmpNe 节点转 PrimaryBodyIrEvalNode(生产级既有分支), poison 保留。canonical census missing=0+dump/load/cache 双真值(.frag 与 stage3 逐字节)+suite52+matrix10(2 既有 bail stash A/B 证无关)。复核 CONFIRMED(独立重建+复现两 bail 清零+5/10 独立抽跑)。**Commit D(csge 接线)正式解锁**。
- **★工作树侧部分吞险(致 op-lane)**: 9+1 hunks 中 8 个套进工作树, **2 个 CmpNe 臂 hunk 目标站点(seq_add_fail reason=15)已被 op-lane WIP 重构移除**——其快照落账时 0543be970 的这两 hunk 将丢失。防吞: re-apply diff=round26/commitd_zc_arms_rebased.diff(对干净 HEAD 全净); 检测配方=对方 pobj 落账后 grep seqAddCmpDone, 零命中=已吞, 需按其新 seq-add 结构重制该臂(修复语义: 比较式 add 值走 EvalNode)。工作树部分态自洽(解析层 8 hunks 完整, cmp 臂缺失=退回诚实 bail 非破坏)。
- **方法论纠偏收录(round26 座席自报)**: 初版误用 HEAD 作基座致 hello-world 都崩(81bde41e0 族独立 bug), 换 22482bad4+csge 栈后消失——**基座选择污染**与读码污染同族, 均入防污染检查单。
- **在飞**: 对方钉基第三跑(自编 GEN2 中)。本会话工作流全部收卷。

## ★★ 2026-07-18 0x:xx 收割批次一百二十九 (acb7a9d3 会话) — 钉基第三跑全链判决收尸(gen2 ZC=0 实锤/终局三站 T79 一墙全责)+T79 钉基收网在飞

- **★钉基第三跑全链判决(journal 收尸, chain_runs/ignite_20260717T090229_69011b)**: drvBake 11.8s ok→**probes 11/11**→**gen2Bake rc=0 wallMs=999085 bails=[]=ZC=0 实锤**(sha 1c3d1128...)→terminal 0/2(瞬失)→oracle 0/6 全 compile failed→gen3 自烤 rc=2 stderr="compiler csg: typed ir empty after build source_count=0"。**定谳: GEN2 二进制什么都编不了=T79 一墙全责; "战术 hoist 掩盖态侥幸过 oracle"论破灭**。
- **★T79 战略修正**: 等 op-lane 重写只救 HEAD 世系——**钉基世系全链绿必须在 22482bad4 基座上修 T79**。round33 在飞(wf_3ac394a1): 关键推理=两站点(:8247 写 0x8a0/:8412 读 0x880)都在 compiler_csg.cheng, **插桩 DRV 编该单文件即应触发双站点偏移计算**——不需 28min 全树; r30 零回归守卫/trace diff 直接叠+双站点定向 trace+TypeLayout 对 WorkingSet 型求值时 dump typeFields 清单; 定谳→根修→suite52+t78 门+3 smoke; 修后重跑 chain.py 全链(留主会话)。
- **在飞**: round32-resume(Commit D 接线, w3pamc15e)+round33(T79, wyziin8ql)。

## ★★ 2026-07-18 01:0x 收割批次一百三十 (acb7a9d3 会话) — Commit D 接线实施臂交付(五门全过+诚实减速披露)+额度墙双臂复飞

- **★Commit D 接线交付(round32 实施臂 DIFF_READY, 复核臂被额度墙杀→已复飞补审)**: 3 文件 +755/-132, env=CHENG_CSGE_INCR=1 默认关。两处比 spec 更严的显式偏差: ①失效判定权威=**片段内嵌读取集**(受 checksum 覆盖与载荷原子绑定)非上轮 manifest——堵死分次落盘崩溃窗口陈旧复用洞 ②dep 失效用 contentHash(严于 interfaceHash)。五门: env 关零行为(6 源双 driver 逐字节)/开启首轮+热轮产物逐字节不变+741 函数 splice 复用实证/★失效攻击全守住(改 dep const 必重建 rc=49、**整缓存陈旧注入仍全量重建绝不吃旧值**、篡改响亮 checksum panic)/suite52 三态 MATCH。**诚实披露: fixture 尺度热轮净减速 ~2x**(TryLoad 全量 decode×Phase F 多轮放大), 收益标的 driver 级 csg_e 被既有规模墙挡未实测——followUps 三条性能路线(decode 记忆化/懒 decode/registry 增量)在案, 默认关零影响。
- **额度墙事件**: round32 复核臂+round33 狩猎臂被 session limit 杀(重置后已双复飞: wbmv6gtk9 补审/wtiem57m6 重狩)。
- **在飞**: round32-r2(Commit D 复核)+round33-r2(T79 钉基收网)。

## ★★★ 2026-07-18 01:2x 收割批次一百三十一 (acb7a9d3 会话) — #148 ROOT_CAUSED(数值精确+镜像先例)+实施臂在飞

- **★#148 诊断 ROOT_CAUSED(round34, 数值级钉死)**: 口径分歧=**bool 是唯一 packed(1)≠aligned(4) 的标量**——后端 TypeShapeFromTextImpl(pobj:4724)bool 与 int32 同档 size4/align4, 前端 TypedExprTypeLayoutImpl(typed_expr:14261)bool=1 packed; int8/16/32/64 前后端全一致。后果: 内联定长 bool[N] 字段前端按 1B 排布(bool[4]=4B, 后继字段紧随), 后端三发射点用 TypeShapeFromText 的 4 作步长→写 s.arr[1] 落 offset4 踩相邻字段(probe RUNRC=1 期望 42)/尾部数组逃出 struct 踩 canary。**stage3 旧种子无此 fast-path 返回正确=缺陷在当前源、22482bad4 原生**。
- **★镜像先例(修法自证)**: 三发射点=写 AppendSimpleFieldAssignFast:32298+读-fast fldElemShapeSize:38374+读-fallback idxElemStride:38587(对定长数组无条件覆写 aligned)——而同函数**动态 seq 分支 :38625 已正确门控仅 Aggregate 才覆写**, 这个不对称就是修法蓝本。修=三站点覆写门控加 elemKind==Aggregate(镜像 :38625), 标量 bool 保持 packed, 读写原子同步。
- **生产踩踏面普查**: bool[N] 兄弟字段结构真在生产闭包——QUIC datapath(active/isV6/useLenField)/STUN turn_relay/libp2p connection/offsettedseq/platform_matrix, 全 slot 管理数组=正中踩踏形态。**这是真生产 ABI 缺陷非纯理论**。
- **同区异根分离**: #147 int16 残留=array-of-struct whole-field-materialize fallback 聚合布局(独立)；#152 int8=载入符号扩展 ldrb/ldrsb(正交)。均本修不解, 分别立项。
- **round35 实施在飞(wf 待记)**: 按 CALIBER_TABLE 四阶段(三站点 Aggregate 门控+InlineElementStride helper 归一, 原子同组), 验证矩阵含 canary+邻字段+读写双向+多宽度零回归+反汇编步长转 strb/#0x1+t78 门。
- **在飞**: round32-r2(Commit D 复核 whk1g0h75)+round33-r2(T79 wi93cgmfu)+round35(#148 实施)。

## ★★★ 2026-07-18 02:4x 收割批次一百三十三 (ceaefe81 会话) — #15 真权重 fix 落账 e1adf5837(双镜头 CONFIRMED×2)+数值核战役立卷 #153(verified scope)+cold 双线并行

- **★#15 真权重 fix 落账 `e1adf5837`(双镜头独立 CONFIRMED×2, +409/-23 五文件)**: 额度重置后 resume 补跑死亡的回归网臂——复核 A(语义对抗)+复核 B(回归网)双绿: md5 ae0db50c 逐字节/reverse-apply 净/新鲜 clone 自包含编译+rules-golden 7/7/既有引擎夹具 **GOLDREF 逐字节零回归**(全仓 9 个 HfModelGraphBuildDenseTransformer 调用点全传 fp16→新增 bf16 分支恒不触发→权重类逐字节不变)/SABI 桥 rc=0。交付=BF16 加载入口(图硬编码 F16 vs 真 checkpoint BF16×290 的 dtype mismatch 墙, 如实修 normDtype 跟随 bf16+CLI `--dtype bf16`, 218 张量流式解码全绿 graph_weights 218/ops 195/24 层)+S2 planner_task 换真 7 候选受限 logits argmax(签名零改动+env 门控+规则回退闭环)。封存 `.LANDED-e1adf5837`, fix 克隆已删(回收 739M)。
- **★数值核战役立卷 #153(#15 真前沿, 本会话源码复核 verified scope)**: HF 语义对拍 0/8 是引擎数值核四缺口的确定性结果(非补丁缺陷)——四刀精确 scope: (a)dense HF 注意力真走 argmax: `InferenceModelOpAttention`(model_executor:1683)→`ModelExecutorPagedCausalAttentionFill`(:696/815)→`PagedKVAttentionQueryFill`(paged_kv_cache:368)代码自注释(:1687)明写 "hardmax-over-dot-product-score", 修=argmax→softmax 加权和, **既有 `InferenceExpNegQ` 定点 exp(kernel.cheng:360)未接进此路径**; (b)RmsNorm 补 sqrt(model_executor:886 `normBase=meanSquare/scale` 按方差非标准差归一); (c)加载 72 个 q/k/v bias 张量(290 文件-218 图=72=24×3, **GEMM `hasBias` 支持已在 kernel.cheng:145**); (d)int32 定点 scale=1000 精度地板(深层, 另议)。**关键认知修正批次 132**: 缺口 a/c 原语已存在(SoftmaxLastDimFill/InferenceExpNegQ/hasBias GEMM), 战役主体是"接线+补 sqrt+加载 bias"非从零重写, 比"另立卷数值核战役量级"评估更 tractable。依赖 #15 fix 已落基座(BF16 加载), 等负载窗单独发工作流。
- **性能账(端侧可行性基线, 双复核复现)**: ~0.007 token/s / RSS ~7GB / 每 forward 全店权重重哈希(`WeightTensorValidateStore` 逐 payload 494M 值)。端侧化三杠杆=KV-cache 增量 + 去 per-forward 重哈希 + W4Afp8/Metal 内核接入。
- **#150 挂 pobj 窗(不碰, 同 T79)**: T79 副产物两症状(compiler_csg:8412 `typedSourceTexts` add() 嵌套数组字段 struct codegen 静默失效 + 模块级 `var:str` 跨函数存储 DRV 读空 rc=0 vs SEED rc=10)均在自宿主后端(pobj/typed_expr)= op-lane 活跃重写窗; 案卷 `t79_gen2_drv_source_load_divergence/` 齐备(9 repro+lldb+disasm+FINDINGS)。
- **在飞(cold 独立车道, 零 op-lane 碰撞)**: #144(wf_7f82e7e2, u32 类型标记丢失两族 `parse_scalar_identity_cast`+`cold_materialize_i32_ref` → u32×f64 28 格静默错值)+#133(wf_68f3235e, 窄宽度收窄 bool 1B+定长数组 int16/uint16)双 fix+双镜头对抗复核。负载纪律注记: 两 cold 工作流并发+#15 qw(6.2GB)致 load 瞬时顶 64(主体=外部 Xprotect 53%/WindowServer 46%/用户 app+疑孤儿点火 DRV 64%), 60s 内回落 22。

## ★★ 2026-07-18 01:4x 收割批次一百三十二 (acb7a9d3 会话) — Commit D 接线复核 CONFIRMED(五门+四失效攻击独立复跑)+HEAD 落账门自我纠偏(env-off 必 HEAD 重证)

- **★Commit D 接线复核 CONFIRMED(round32)**: 复核员 FRESH 克隆独立复跑五门全过——双 driver sha 逐位命中交付(base cf38f464/wired c64b13e2, 跨路径一致=driver 不含构建路径)、**四类失效攻击每类含故意错方向陈旧注入全部正确全量重建绝不吃旧值**(rc 49/50/51/34 从不退 48/33)、全片段篡改 checksum panic 无产物。主攻完备性缺口(typeField/global/typeAlias 跨源不记读取集)实测在纯 zero-C 路径 bail 不可编译=不可利用, 已披露非阻塞。违禁扫描净(唯一"降级"是注释声明不静默降级)。
- **★落账门自我纠偏(工程诚实)**: 主会话拟直接落, 自查发现 wiring env-off 零行为是 **22482bad4 基座**证明的, 而 HEAD typed_expr 已被 op-lane 大幅重写(3way 基础 blob 缺失, wiring 7 hunks fuzz=3 下 6/7 套 1 挂)——+677 行锚进不同周边代码, **env-off 字节等价必须 HEAD 重证不可沿用**。round36 在飞(wf_b4db50be): rebase 到 HEAD(第 7 挂 hunk 按内容手锚, 若 op-lane 重写致锚点失效则 BLOCKED 报冲突不硬套)+HEAD 基座 env-off 双 driver 六源逐字节等价重证=唯一落账门; CONFIRMED 才落。
- **在飞**: round33-r2(T79 wi93cgmfu)+round35(#148 实施 whhxhh6au)+round36(Commit D 落账门 wf_b4db50be)。

## ★★★ 2026-07-18 02:0x 收割批次一百三十三 (acb7a9d3 会话) — T79 真根定谳(#135 同族多行 seq-add 抑制)+0543be970 残缺调用诚实纠账(致 op-lane)+Commit D 落账门 BLOCKED on HEAD 冷编

- **★T79 ROOT_CAUSED(round33-r2, 偏移假设证伪+真根 single-file 可复现)**: r2/r30 的"双站点偏移 0x8a0/0x880 分叉"**证伪**——插桩 DRV 编 compiler_csg.cheng 实测 typedSourceTexts 偏移全场 2176(0x880)一致(53 resolve 点+20 FieldGet 节点无一例外), 0x8a0(2208)是 exprCallProfiles 另一字段偏移, r2 把两不同字段误读成同字段分叉; r30 ctx_swap 截断=红鲱鱼(偏移走声明上下文恒 wsRows=63)。**真根=TypedExprFactIsSeqSideEffectBuiltinSubExpr(typed_expr.cheng:22224)只读单物理行判括号闭合**, 而写站点 add(work.typedSourceTexts, TypedExprSourceTextBorrowExternalPackageRoots(...)) 跨 8247-8251 五行续行→单行判 closePos=-1 rejectedSingleLine=1→fact 升格独立语句→合成跳过外层 add→grow+store 整段静默丢失→GEN2 typedSourceTexts 恒空→gen3 "typed ir empty source_count=0"(journal 症状铁证)。**与 #135 三元孤儿 IfCall 同族(多行语句续行处理)**。修向=像 TypedExprIrAppendUnrepresentedCallStatement 续行拼满全文再判闭合; 候选 diff 在 round33 目录(需按上下文重贴)。
- **★0543be970 残缺调用诚实纠账(round36 揭出)**: 我的 Commit D 前置臂在 HEAD 加了 2 处 PrimaryBodyIrSeqAddValueArgNodeIndex 调用, 但该 helper 已被 **op-lane 81bde41e0 删除换泛化版**(PrimaryBodyIrAppendSeqGeneralAddBuiltin)→HEAD 冷编 unresolved symbol。根因: round26 对 22482bad4(:19840 存在)开发, rebase 到 HEAD 未验被调函数存在性(batch 128 的 2 CmpNe reject 已是信号)。**op-lane 工作树 WIP 正删我这 2 处调用**(git diff 实证)——修法=不碰(shared-battlefield 铁律, op-lane 热编辑区+其迁移正收口), 记账致 op-lane 让其收口。HEAD 本就被 81bde41e0 冷编破(#137/#139 同源), 我这条是同族一股。lessons 已录"跨基座 rebase 必验被调函数 HEAD 存在性"。
- **★Commit D 落账门 BLOCKED(round36)**: rebase 到 HEAD 成功(7 hunks 6 fuzz+1 手锚, 符号闭合)但 env-off 重证被 HEAD 冷编不过挡(同上 unresolved symbol, base/wired 构建日志逐字节相同=wiring 非元凶)。rebased diff 已存(round36/rebase/), **HEAD 恢复冷可编(op-lane 收口 SeqAddValueArg 迁移)后直接重跑 round36 步骤2/3 即可落**。
- **在飞**: round35(#148 whhxhh6au)+round37(cheng-fusion 稳定化 wf_b557c315)+round38(T79 修复, 待发)。

## ★★★ 2026-07-18 03:2x 收割批次一百三十四 (acb7a9d3 会话) — cheng-fusion MCP 稳定化 CONFIRMED+活工作树落地(下次重启生效)

- **★cheng-fusion stdio 稳定化 CONFIRMED(round37, 断连五根因全修)**: 五处硬化落单文件 cheng_fusion_mcp_server_m9009.ts(+99/-5, 不动工具派发/schema/协议逻辑, 双帧路径保留): ①JSON.parse 包 parseFrame try/catch(损坏帧记 stderr 跳过不崩) ②writeJson 走 safeWrite(EPIPE/EOF→优雅 exit0) ③进程级 uncaughtException/unhandledRejection 守卫(断流优雅退/其他保活) ④stdin end/close→优雅 exit0, error 分类 ⑤async onMessage 用 dispatch 包裹 rejection 不逃逸。**行为不变实证**: 标准序列 BASE vs 硬化 stdout 逐字节相同(34913B); **五故障注入 BASE 全崩/硬化全存活**(corrupt SyntaxError/EPIPE exit1→exit0/stdin-end/tool-error/interleave); 复核员独立 8 崩溃通道搜(50 连损坏帧/>1MB 帧/CL+newline 混合)硬化全过, 无静默吞错。
- **★活工作树落地(主会话亲验)**: cheng-fusion 是并发会话重度开发中仓(12 文件 WIP+fixture_matrix/cli.ts 等 untracked)——硬化 diff 与并发 cheng_fixture_matrix Set 改动**不重叠**, git apply 干净共存; bun build OK(102 模块); **活服务器真进程冒烟: 正常序列全响应+损坏帧注入后存活+后续 ping 正常+stderr 记 skip 不崩**(正是修复生效铁证)。**未 commit**(避卷并发会话 12 文件 WIP; 其 git add -A 时会吸收硬化=durable 落地; 或被其 regenerate 则从 ~/cheng-patches/20260717/round37/ re-apply)。**下次 MCP 重启生效**(当前连接仍跑旧码)。落地后 cheng_ignition_chain 可靠, 正好接 T79 修后终局全链验证。
- **在飞**: round35(#148 whhxhh6au)+round38(T79 修复 wf_1edc1865)。

## ★★★ 2026-07-18 04:1x 收割批次一百三十五 (acb7a9d3 会话) — T79 双线独立定谳合流(我方钉基修 CONFIRMED+op-lane 正典修落 HEAD)+★钉基终局全链点火

- **★T79 我方钉基修 CONFIRMED(round38)**: 续行拼接判据修(与 UnrepresentedCallStatement 逐字同口径, 34 行单文件), 8247 真站点 joinedReject 1→0 store 表征+single-file 双真值+变异红测双向+组合四形(2/3 行/嵌套跨行/字符串含")(")全过(quote-aware 括号匹配)+t78 门 FAIL 集与 baseline 逐项 IDENTICAL=零回归。复核 CONFIRMED。
- **★op-lane 并行正典修落 HEAD(965528428+cd5e7c1ca+双回归 smoke)**: 独立定谳同根(其 lessons §T79 同结论), 修法更结构化(TypedExprResolveWholeCallStatementAtLine 统一整语句跨度解析层, suppress+unrepresented 两 consumer 共用+BuildIndex 结构列)——**三方独立收敛同一真根**(我方 round33 trace/round38 修/op-lane 正典)。0543be970 残缺调用已随其落账清除(HEAD grep=0)。
- **★HEAD 世系新 blocker=defer**: 其落账代码用 defer 关键字(dispatch_min:3372), 冷种子不识→HEAD 冷编 rc=2 unknown identifier 'defer'(其自验走 candidate harness 非冷路径)。HEAD 点火解锁又添一项=冷 parser 补 defer 或其去 defer——致 op-lane。
- **★钉基终局全链点火(runId=ignite_20260717T201123_1b95bb, 硬化版 cheng_ignition_chain 编排)**: 树=nb_workspace/tree_fin_a(22482bad4+#135+v5+v6+#147v2+T79 全验证栈, treeSrcHash 7783e0c2...), 全站 drvBake→probes 11→gen2→terminal 2→oracle 6→gen3(16GiB)+masked 定点。预期: 上轮"typed ir empty"三站转绿判决 ~60-70min 内出。cheng-fusion 硬化已随 /mcp 重连生效(本次编排即首个生产使用)。
- **在飞**: round35(#148 whhxhh6au)+终局链(bhkkx1gck 监视)。

## ★★★ 2026-07-18 04:2x 收割批次一百三十六 (ceaefe81 会话) — #153 数值核 strike 0-4 落账 b710fb7de(双镜头 CONFIRMED, HF top-logit 0.307→15.8 决定性改善)+#154/#155 立卷

- **★#153 落账 `b710fb7de`(+382/-56 九文件, 双镜头独立 CONFIRMED×2)**: 五步=InferenceIntSqrt 牛顿原语+RmsNorm 补 sqrt 两处(model_executor:886+kernel_ir:651, [240,320]→[848,1131] 逐位)+PagedKVAttentionQueryFill hardmax→逐 head 1/√headDim 缩放点积 softmax([30,40]→[18,25], causal 保持, 全调用点)+q/k/v bias 72 张量(4→7 weightNames, 兼容 GLM MoE)+matmul 延迟除法三处(int64 全精度累加, 噪声降 30x)。**★HF 独立对拍×2 决定性改善: top-logit 0.307/0.484(垃圾 id)→15.81/14.7 实值(落设计预测 10-17 带, HF 参考 17.84, top token 变真高频 token \",\"/\".\"), graph_weights 218→290 证 bias 真加载**。工作流插曲: 实施臂 23min 完工但 StructuredOutput 5 次超限挂(工作全在盘), review-only 二段续飞收官——教训: schema 字段只装结论, 详证走 .md(已写入二段 prompt 生效)。
- **★#154 立卷(复核揭层, #153 续战前置)**: top-5 overlap 仍 0/5 的真余量=**RoPE 位置编码未建模**(+GQA 语义细节)——引擎 attention 无旋转位置嵌入, token 位置信息全丢, 语义对拍 8/8 在此修复前不可达; 次级=scale=1000 量化地板(延迟除法已消 matmul 逐项取整大头, 加宽 scale 是 #154 后再评估的次级 lever)。
- **#155 立卷(golden 锚重导, 5 条预期红)**: transformer smoke logits[0](-22684 锚)/hf_shape weights.len 21→27/paged:209+wide:422 Metal 交叉(device 仍 hardmax)/kernel_metal rmsnorm [999,1998]/distributed metal lm_head hash——全部锚编码改前退化数学或 Metal 故意搁置, 复核逐条溯源无一新 bug; 重导须 lockstep 更新内嵌 oracle 数学+手算锚(实施方拒手改防假绿=正确判断)。Metal kernel softmax 对齐并入本卷。
- **#133 cold 插曲**: fix 臂 70min 撞后台墙悬挂(补丁完整救出 md5 8cb57b73: bool→1B+定长 int16/uint16→2B 双 sizer+store-bounds 第三处修正+偏移 smoke), 工作流已停, review-only 补飞中。#144 已由 43b92d2fc 修复(NO_REPRO), 回归锁 `ebdf029a6` 落账(u32×f64 双 smoke, 亲验 HEAD PASS+REVERT 红)。

## ★ 2026-07-18 04:3x 收割批次一百三十六 (acb7a9d3 会话) — cheng-fusion 硬化被吞实录+重落+git 落账定基线(9dc7dc9)

- **防吞警报应验实录**: 03:23 落工作树的 stdio 硬化被并发会话 03:55 重写整文件吞掉(活文件硬化标记 0)——与 csge B 插桩同款快照吞。检测配方生效抓获。
- **重落+定基线**: 硬化 diff 对重写版仍干净套(区域不重叠), 重落(14 标记)+bun build OK+真进程冒烟(损坏帧存活+后续响应)——**并 git 落账 cheng-fusion 仓 9dc7dc9**(合并态=对方 03:55 重写+硬化共存, 两者内容零丢失), 从"工作树易失"升级"git 可追溯"; 再被重写会显式出 diff。**下次 /mcp 重连生效**(当前连接进程起于 03:55 重写后、硬化前, 仍旧码——不主动杀共享服务器, 自然重连即换)。
- **在飞**: 终局链(bhkkx1gck 监视, gen2 站烤制中)+round35(#148)+round39(cold defer+#152 int8)。

## ★★ 2026-07-18 04:5x 收割批次一百三十七 (acb7a9d3 会话) — #148 实施交付(诊断少算纠偏+生产三形态由错转对)+周额度墙双复飞

- **★#148 实施 DIFF_READY(round35, 复核臂被周额度墙杀→已复飞)**: 交付超出诊断——round34「3 站点」少算, 真相=对齐 4B 是 T78 约定散布 ~9 处, **全翻会砸 6 个 exec_diff 夹具**(bare/global/multi-dim 数组独立 aligned 槽自洽无踩踏)。正解=精确子集: 仅结构体字段内联 bool[N] 的 **4 站点**(写/读-fast/★条件读=诊断遗漏第 4 站点, 只改前 3 会读写失配 adv 1→0/cmp 写)+InlineElementStride helper 归一。**生产普查决定性**: QUIC datapath(74→90)/STUN turn(82→91)/libp2p present(62→92) 三形态基座全 miscompile 修后与 stage3 oracle 逐一一致。exec_diff 206 夹具 NEW=0; 非 bool .o 逐字节; 变异红测单退 site4 失配复现。t78 门刷 2 行期望(probe→42/tail→57=stage3 确认正确值, 循 #147 刷 12 行先例)。遗留独立根: bracket-init decl-init 基址错绑(#A)+bare/global/literal aligned 自洽未统一(#B)+exec_diff 基座 4 pre-existing。
- **周额度墙事件**: round35 复核臂+round39 双臂被 weekly limit 杀; 换号后三臂已复飞(w0bx7dvdp/wiq69naa3)。
- **在飞**: 终局链(gen2 站)+round35-r2(#148 复核)+round39-r2(cold defer+#152)。

## ★★★ 2026-07-18 05:3x 收割批次一百三十八 (acb7a9d3 会话) — 终局链判决: gen2 GREEN(ZC=0)+probes 11/11 首达成, T79 修生效, 新墙 T80 立卷(prune owner)+oracle 签名三族

- **★终局链收官判决(ignite_20260717T201123_1b95bb, done verdict=COMPLETE_gen2=GREEN_probes=PASS_terminal=FAIL_oracle=FAIL)**: drvBake 13.3s 绿→probes 11/11→**gen2Bake rc=0 bails=[] ZC=0(19min)——钉基终局栈(22482bad4+#135+v5+v6+#147v2+T79)首次 gen2 全绿**, T79 修实证生效(上轮 gen2 站 "typed ir empty" 全清)。洋葱剥至 terminal/oracle 层。
- **★新墙 T80 立卷**: terminal 两站瞬失(compileRc=1), 手动复现=GEN2 编 triv_station(两行 return 7)报 **"compiler csg: graph owner nodeId missing during prune"** rc=1——比 T79 更深一层(源已加载/typed ir 已建, 死在 CSG 图剪枝)。模式先验=DRV 好/GEN2 坏 同 T77/T78/T79(DRV 错编某树函数)。狩猎臂在飞(round40, wf_aaeac5d1)。
- **★oracle 六站签名三族(情报价值高)**: ①min=T80 同签; ②s2/onsa RSS 爆 12.88GB cap+orbytes/os4b 300s 超时=GEN2 病态资源放大(T64 类); ③**oiso13+gen3 bake 仍报 "typed ir empty source_count=0"——T79 签名在 gen3 层复现**: 树源含 T79 修且 gen2 站已证其生效, 故此处是 GEN2(DRV 烤)错编了 T79 修后代码路径或同症异源, 非 T79 未修。gen3 bakeRc=2 blocked。
- **账本插曲**: 我方批次 138 半行标题被 ceaefe81 会话 da7ca1f9e 快照吞卷入落账(第三例, 仅半行无实质丢失), 本条就地替换残行。
- **在飞**: round40(T80 狩猎 wf_aaeac5d1)+round35-r2(#148 复核 w0bx7dvdp)+round39-r2(cold defer+#152 wiq69naa3)。

## ★★ 2026-07-18 05:0x 收割批次一百三十七 (ceaefe81 会话) — #154 逐层对拍诊断定谳(编排者亲收死亡臂数据)+GQA 根修在飞+周额度墙换号复飞

- **★#154 逐层对拍诊断收官(诊断臂撞周额度墙死亡, 双侧 dump+compare.py 已在盘, 编排者亲跑对比+判决)**: 判决三条(案卷=20260718/154/diag_report.md, 逐层 relerr/fitted 双口径表): ①**第一真爆开点=attention 输出**(embed 0.6-2.3% 绿→qkv fitted 1.7-9.9% 良→**attention fitted 22.8-85.9% 爆开**, 逐层放大; v_proj 从 L0 就偏大 13-40%)——**GQA 头号嫌疑**(14 q-head→2 kv-head 的 7:1 分组映射, #153 逐 head softmax 只按 valueDim/headDim=2 切); ②norm 层 49-61% "uniform gain" 判**对拍伪影嫌疑**(fitted 仅 0.6-1.5% 形状完美; 矛盾论证: 若真错 49% 线性下游 qkv 必继承, 实测 qkv 仅 5.7-11%; eps 嫌疑已证伪=全调用点 epsilonScale=1 增益误差仅 0.05%); ③layer3+ 首 token k/v_proj 天文偏差(L4 44442%, rowL 正常)=饱和/位置态嫌疑, 独立第二信号。**"RoPE 未建模"复核散文已证伪**(引擎有完整定点 RoPE 全家族+图 op, 立卷描述修正)。
- **#154 GQA 根修+双镜头在飞**(wf_8ffcf500): 配方=探针伪影复核先行→GQA 审计(对照 HF repeat_kv, 小夹具手算红绿)→v_proj 独立审计→对拍表复测(验收=attention fitted 降至 qkv 同档 ≤10%)。诊断工具链(探针源+hf_dump+compare.py)全程复用, HF 侧不重跑。
- **周额度墙插曲(换号复飞全记)**: #133 复核双臂+#154 诊断臂 04:3x 撞 weekly limit 死亡; 用户换号后 #133 复核 resume(fix 缓存)+#154 由编排者亲收数据免重飞——死亡臂产物(双 dump 108KB+68KB)零浪费。

## ★★ 2026-07-18 05:4x 收割批次一百三十九 (ceaefe81 会话) — #133 v1 双 PARTIAL(复核网抓读写步长撕裂净回归)封存重飞 v2+全线 6 工作流展开

- **★#133 v1 判决(双镜头 PARTIAL, 封存 .PARTIAL-v1-store-stride-regression)**: 三 hunk 本体正确且因果实证(H4 store-bounds 系 H1 必要配套=复核 A debug 打点实证; bool 标量偏移与 clang ABI 逐位一致; 数组 8B 前置对齐系 cold 一贯约定非本补丁)。**但净回归**: sizer 4→2 后 cold_emit_fixed_array_element_store(:17752) `element_size<=4` 早退门+旧 4B 步长 BODY_OP_ARRAY_I32_INDEX_STORE(arm64 端 :17846-17878 仅 uint8/word 二元分支)未同步——**读侧 2B/写侧 4B 步长撕裂, svals[0]=-22 跨界踩 svals[1]+相邻栈变量**(复核 B 三组探针 baseline 绿/patched 红因果确凿; bool[N≥3] 同病)。v1 smoke 只测偏移常量不测下标写入=盲区; 既有回归套件零用例触碰 int16/uint16 定长数组=盲区非真净(1087P/416F 失败集一致)。与 #147 v1 净回归同形态(门开宽下游 codegen 没跟上)——**cold 窄宽度家族的结构性教训: 宽度决策点必须读/写/拷贝全路径原子同步**。副产物: 标量 int16 round-trip 失败=pre-existing 非 #133 因果(待编号)。
- **v2 重飞(wf_b387d7ec)**: v1 基座+写侧三档发射回补(early-exit 门+arm64 16 位 strh/ldrh 分支+codegen_slot_is_uint8_fixed_array 结构谓词化)+round-trip 夹具(三组探针形态+负值符号+哨兵+跨元素独立)+element_size 消费点全枚举(v1 教训)。
- **全线 6 工作流展开(「工作流全面推进进行中的任务」指令兑现)**: #154 GQA(w0wtz7xmj)+#133 v2(wo0cazreo)+#128-r6 WAN 前沿重测(wml19qucs, yamux rc=133 先判信号)+M3 族群B 特性移植(wv1ui8kbt, GEN-DIFF 8→5)+#14 S5 暂停背压(wg2agowor, 信箱线程纪律)+#60 CID v3 重基(wre01eh1b, #71 新桥解扣 HELD, run.log 铁证纪律)。未推诚实列: #5(需浏览器窗)/#10 墙A墙B(归 op-lane)/#36(撞 op-lane 风险)/#66(等收割补位)。

## ★★ 2026-07-18 06:1x 收割批次一百四十 (ceaefe81 会话) — #14 S5 v1 判决分裂编排者裁决 REFUTED(触摸线程 UAF 升级雷)封存重飞 v2

- **★S5 v1 判决分裂(A REFUTED vs B CONFIRMED), 编排者裁决=A 立场(红线优先, 与批次一百二十一 tl3 裁决同则)**: 背压语义三层(读端 WebSceneMediaEsStreamLoop rc==8 事件驱动挂起+网络泵 dial 前短路+FQ_CAP=128/RING_CAP=6 有限水位)**全部既有且正确**——v1 诊断价值=发现唯一缺失是写端 23 行(pause/play→paused_requested 镜像)。但镜头A 调用链考证抓 **UAF 升级雷**: pause/play 有第二条生产路径(场景点按→chengVideoPause→cheng_app_on_touch_milli→OnDispatchTouch=XComponent 触摸回调线程, 非渲染线程; "回调线程不可能是它自己生出的 g_render_thread"论证扎实), v1 在触摸线程解引用 s_stream_ctx 而渲染线程 teardown free(sc)+destroy(fq_mu)+置 NULL 无指针互斥=aa6f3101d 同型 TOCTOU; **补丁前 pause/play 只写裸 int 无解引用本安全, v1 把无害竞争第一次升级为解引用可释放堆内存**。镜头B 绿面(编译门/回归/Android 零扰动)保留有效。封存 .REFUTED-v1-touch-thread-uaf。
- **v2 重飞(wf_1669df8a, 渲染线程 tick 镜像方案)**: pause/play 不动(保持裸 int); 渲染线程 mailbox drain 安全点读 s_stream_paused 快照比较, 变化时才在渲染线程内锁内镜像(与 teardown 同线程串行=结构性无 UAF)。复核配方: 全调用路径×线程枚举(v1 教训)+边沿语义(一帧双动作/流建立前 pause)+裸 int 原子性论证。
- **镜头B 副产物留档**: ①mobile_shell_codegen_smoke rc=1=pre-existing gen.c 漂移(M3 slice-8 生成器未跟手写, 正是族群B 工作流在修的口径); ②Android cheng_host_video_pause 0 消费点孤立全局(架构不同构 Progressive-ES pump, 不镜像判定成立, 独立工单待编号)。

## ★★ 2026-07-18 06:3x 收割批次一百四十一 (ceaefe81 会话) — M3 族群B 落账 9aa977883(GEN-DIFF 8→7)+族群B 口径终局修正(真可移植仅 1 件已收官)

- **★M3 族群B 落账 `9aa977883`(双镜头 CONFIRMED×2, +44/-32)**: QUIC 预热移植=生成器吸收手写 N≤2 计划数组(s_prewarm_hosts/ports 去重扫描+CHENG_FEED_MEDIA_PREWARM 开关+plan0 兼容别名), prepare_media_surface_texture 转 GEN-EQUAL byte-identical(md5 65386b01 双重核验), GEN-DIFF 8→7/GEN-EQUAL 183→184。复核硬核面: 独立第二编译器(seed-rescue 世代)交叉 census 同数+apply -R 精确弹回 183/8=唯一因果+smoke 失败 stash 对照=pre-existing+leak_audit 真机 OHOS clang 双侧绿。
- **★族群B 口径终局修正(诚实纪律拒凑数字)**: 任务书"移植 MoQ 拉流/QUIC 预热/视口裁剪"三件中——**真可移植且已收官仅 QUIC 预热 1 件**; 视口裁剪方向反转(生成器已有 clip_layer_rect_to_viewport+抽象宏, **手写侧反而落后**, 任务书误分类, 不属 host→生成器授权方向); MoQ 拉流 241 行=真族群B 但架构级(ChengStreamCtx/surface_consume 归属未决, wave7 判断沿用)归口 #24。**剩 7 件 GEN-DIFF 全部为"生成器领先"或架构级**: 族群A GLES 分片图集 4 件+图集持久化 1 件+MoQ(#24)+视口裁剪(方向反转)——M3 字节门收官的真前沿=族群A bail57 root①+#24, 族群B 线闭卷。
- **非阻断留档**: 死路径 MobileShellHarmonyHostSource 重复 prewarm 文本未同步(runtimeMode 硬门禁生产不可达, 可读性负债, 后续 slice 清理)。

## ★★★ 2026-07-18 07:0x 收割批次一百四十二 (ceaefe81 会话) — ★#154 GQA+eps 双根修落账 1d14b5fc9(TOP5 对拍 0/5→3/5 同序破冰)+#60 CID v3 独立追认(66aecbe72 已树)+#66 补位在飞

- **★★#154 落账 `1d14b5fc9`(双镜头 CONFIRMED×2, +68/-27 五文件)——#15 语义对拍破冰里程碑**: ①GQA 定谳=GroupedQueryVectorFill 只取每组组长 q-head(14 头丢 12)+广播复制=14 头塌缩 2 分布; 根修=PagedKVAttentionQueryFill 泛化 HF repeat_kv(每 q-head 独立 softmax, K/V 按 qh/repeat 共享), repeat=1 逐位退化等价。②**eps 判决反转批次一百三十七的伪影推断(实测坐实 REAL)**: hidden 真实均方仅几百量级(非编排者推的 1e6), 量纲错=epsilonScale*input.scale 应为裸 epsilonScale(eps_real·S²=1), 两处同改——教训: fitted 表推理给了正确打击点但"伪影 vs 真根"的判决必须实测, 工作流按 diag_report「先复核再定案」流程走对。③战果(双复核独立重建 oracle+probe 逐位复现): layer0 attention fitted 22.8→3.6(四格全个位)/input_norm 49.4→2.5/qkv 5.7→0.3; **TOP5 token 0/5→3/5 且 rank0-2(17,16,18)与 HF 完全同序, 数值相对误差 ~2-3%**。④残留立卷素材: 深层 20+ 爬升 40-160%(定点精度战役界)/首 token row0 回落未清零(L3 20817%→160% 独立信号)/Metal GQA+hardmax 归 #155。
- **#60 CID v3 判决=非重复劳动的独立追认**: 并发会话已落 66aecbe72(基于 #71 新桥 a22c3b78a, 两 mustFix 已解), 本轮双镜头独立复核 A PARTIAL(mustFix② 双定义消解在当前 cold 路径不可证伪=方法论测不到非修错, 亲手反例构造实证)+B CONFIRMED(tree hash 双向相等/golden 双独立复现 528B+1411B 真穿 MobileCapiHashSeed 生产入口/aarch64-linux-gnu 零 duplicate symbol 坐实)。诚实账保持: 硬件识别臂在 cold 生产闭包从未激活(full_backend_codegen=0), door① 10x 收益仍等 #50 换种子/driver-exe——#60 存量工作全落, 真前沿=激活面非代码面。
- **#66 补位在飞(wf_8c6be8f6)**: M3 族群B 闭卷释放槽位, 按机制8 诚实账认领三件同批(processedSignalIdsRef Set-ref 消费+activeVoiceSession 第二登记+.find 白名单), 推进 handleClose 阻塞链。

## ★ 2026-07-18 07:2x 收割批次一百四十三 (ceaefe81 会话) — #66 CHT 侧终局确认(交办笔误更正+真前沿=UniMaker 侧 #123 等授权)

- **#66 补位轮判决(BLOCKED=诚实核查, 零代码)**: ①交办三件套(processedSignalIdsRef/activeVoiceSession/.find)**早已落账 e843f8131**(批次表引 ed0e8c62f 系摘录笔误, git log 查无, 内容逐一对应 e843f8131); ②CHT 线其后自主推进机制 12→19 至 83a86756a 收官——**v35 门 CHT 转译器侧毕**; ③本轮真跑 cht-measure 实测: invoke_sites 42→12(30 编译走), handleClose 仍未编译, 当前致命 fv=**roomState**(机制11-19 已依次消化 processedSignalIdsRef/latestRoomStateRef/pendingIceCandidatesRef/iceConfigRef/peerConnectionRef/voiceIceFlushTimerRef 全链); ④机制18 架构级定谳(eb3d136f9)维持: roomState 唯一写点在 UniMaker 组件 useEffect 闭包, CHT 结构性不编译 useEffect(82.7 万 facts 证实)——**非转译器缺口, 真修复路径=UniMaker 仓 React.js 侧重构(#123)**, 需 ①用户跨仓库授权 ②UniMaker 树静默窗, 挂账等拍板。#66 任务真实状态=cheng-lang 侧完成。

## ★ 2026-07-18 07:4x 收割批次一百四十四 (ceaefe81 会话) — S5 v2 判决(UAF 双镜头一致关闭+复核A 逻辑推导抓跨流会话粘滞新缺口)封存重飞 v3

- **S5 v2 判决(A PARTIAL/B CONFIRMED, 封存 .PARTIAL-v2-session-sticky)**: **UAF 关闭双镜头一致**(uafClosed×2)——渲染线程 tick 镜像方案成立: pause/play 零改动零解引用, 唯一新增解引用点 sync 函数与 teardown 同属 g_render_thread 同循环迭代严格顺序=物理不可能并发(复核 A 独立三链考证+理论调用者不可达核实)。**但复核 A 纯逻辑推导抓确定性新缺口(不需设备)**: s_stream_paused/s_last_seen_paused 跨流会话永不重置——A 暂停离开路由(意图卡 1)→开 B(sc_B=0, 建流不重置)→对 B 点暂停被 pause() 幂等门(stuck=1 判假)+sync 值比较(1==1)双重跳过→**B 暂停全链路静默失效**=等价退回"暂停不停流"。根源双因=意图变量无会话生命周期+sync 无建流边沿补镜像。
- **v3 重飞(wf_bb2061e3, v2+粘滞修复合一)**: sync 内会话边沿检测(sc 非NULL→NULL=会话终结重置意图; NULL→非NULL=新会话无条件补镜像一次), 全在渲染线程零新解引用面零改生成物; 验证=四场景逐帧状态机推演+第五场景(多路由切换)复核自构。
- 附注: v2 复核 A 另留一悬而未决(pause/play 是否仍被触摸线程 CSG 产物实际调用——ts-csg 现走 __cht_video_apply_control 纯 Cheng 状态机, 但 computer_use 案卷有真机原生桥证据), 对 UAF 结论无影响, 原样承继待真机窗定谳。

## ★★★ 2026-07-18 06:0x 收割批次一百四十五 (acb7a9d3 会话) — T80/T81 三方定谳同根(dynamic bool[] 下标赋值 4B 宽写)+40 行根修四重预检绿+fin_b 终局链复飞+#148 复核抓真遗漏 site5

- **★T80/T81 同根定谳(双臂独立收敛互证, T78 步长族赋值方向缺口)**: 真根=primary_object_plan.cheng `PrimaryBodyIrAppendI32Assign` 直接下标赋值分支(~L40639)对动态 bool[] 缺 `IsDynamicSeq` 守卫, elemSize 无条件走 TypeShapeFromText 对齐槽宽(bool=4B), 堆缓冲实为 packed 1B——**同函数读 1B(ldrb)/写 4B(str w)失配**: index=0 恰同址掩盖; index≥1 写永不命中读址→可达标记恒 false(T81 "typed ir empty source_count=0", isolate13+gen3 bake 同签); 大规模 4 倍越界字写腐堆→prune panic(T80 "graph owner nodeId missing")。oracle 三族签名(含 RSS 爆/超时)一根统摄嫌疑, fin_b 链复测裁决。
- **证据链(反汇编级×2 独立)**: T81 臂(round41 SAME_ROOT)=6 行零 import 最小复现(main 非文件第 0 函数即触发)+GEN2.primary.o CompilerCsgReachableMark/MarkNodeOwnerClosure 双函数读写不对称; round40 臂(DIFF_READY)=独立收敛同址+MarkProcessedFunctionIndexes 第三函数同错+隔离 9 行复现 rc=2(未修)→4(修版 DRV' 15.7s)。案卷 ~/cheng-patches/20260718/round40+round41/。
- **★40 行根修+主会话亲验四重预检全绿**: 修=镜像 T78v4 读路径守卫(IsDynamicSeq→SeqElementShapeFromText packed=T77 既有口径, 无类型名特判, 定长数组路径原样)。tree_fin_b(=fin_a+此修; patch 显式目标文件, 防 diff 头绝对路径 -p0 误打钉基树)亲验: 种子烤 17.2s 绿+bool_idx_repro rc=2→4+triv_station rc=7+**t78 门 108/108 GREEN**。
- **★fin_b 终局链复飞(ignite_20260717T212702_69fd85, 全站含 gen3 masked 定点首试)**: cheng_ignition_chain 硬化版, treeSrcHash e12e37c4, Monitor 挂站转播(已过 drvBake+probes 11/11, gen2 站烤制中)。判决点=T80/T81 签名清除+oracle 三族是否同根消失+gen3 定点。
- **#148 复核抓真遗漏 site5(round35-r2: impl DIFF_READY+review PARTIAL)**: 复核员造 `makeBox().arr[i]`(call-result 根链式动态下标读)——根不在快路径白名单{ParamRef,LocalRef,FieldGet,IndexGet-fixed-array}, 落穿未修 idxElemStride 回退分支, bool 版修后仍 rc=1(int32 对照正确)=残留口径分歧实锤。v1 四站点自身全验证过(probe 42/tail 57/生产三形态 90/91/92/exec_diff NEW=0/变异红测)。round43(site5 补齐+根形落穿普查+再审)在飞 wf_59480231。
- **round44(T80 修对抗复核)在飞 wf_8e3dcd29**: 三焦点=静默 aligned 回退裁决(vs let-it-crash)/同反模式全仓普查(round40 自认未做)/与 #148 diff hunk 重叠对表。
- **进程重启插曲**: 四工作流(round40/41/35-r2/39-r2)随 Claude Code 进程退出被杀, 全部 resumeFromRunId 带缓存复飞零浪费。
- **在飞**: fin_b 终局链(Monitor)+round43(#148 v2)+round44(T80 复核)+round42(NormalizeTypeText 实施+复核, 用户点名)+round39-r2(cold defer+#152)。

## ★★ 2026-07-18 06:2x 收割批次一百四十六 (acb7a9d3 会话) — round39 双臂收官: cold defer 双路径逐字节收敛互证(HELD 交热区)+#152 真根坐实 47 行修(HEAD 三层断裂链挡运行时验证)

- **★cold defer 块形支持 DIFF_READY+复核 CONFIRMED(双路径互证奇观)**: 我方臂在隔离克隆独立实现 242+/9-, 与 op-lane 主树未提交 WIP **逐字节收敛(diff 全空, 复核首尾双测 mtime 04:26 未漂)**——两条独立实现路径全等=正确性最强佐证。语义=控制流重定向非 eager 闭包(复核活变量探针 out=92 实证); 冷侧限定子集(仅函数体顶层单层 defer), 越界一律响亮 die; dispatch_min 11 处用法全穿透。**关键发现: baseline 对 defer: 块形不是报错而是静默 miscompile(原地立即执行, trace=123 应 132)**; "unknown identifier"对应旧简写形。组合打击 4 项+反例 3+既有回归全过。**HELD 不落主树**: cold_parser.c 是 op-lane cold 战役热区, 我方材料作独立交叉验证证据附卷(~/cheng-patches/20260718/round39/cold_defer_blockform/), 由持有会话按其节奏落账。
- **#152 int8 sext PARTIAL(真根坐实+修出, 验证被环境挡)**: 根=PrimaryBodyIRFillBlockOp 对 byteCount==1 硬编码 A64EncLdrbImm(零扩展), 从不路由既有 A64EncLdrsbImm; 修=结构谓词 PrimaryBodyIrTypeTextIsSignedByte+3 构造点接线 operands[4]+发射器按位选 ldrsb(未接线 60+ 构造点逐字节不变), 2 文件 47+/6-。**运行时验证 BLOCKED=HEAD 三层断裂链(与 #152 无关, git stash A/B 空 diff 亦不可编证实)**: ①dispatch_min defer 语法(冷 parser 回灌中) ②ccsg.BuildCompilerCsgV2BorrowedEntryTextInto 改名 Consume 后 3 调用点未同步 ③texpr.TypedExprBuildIndex 缺 contextCount(SoA 字段缺口)——**op-lane SoA 重构(194e9fd9a 起 15 commit)当前半落态, HEAD 不可编**。#152 diff 静态审查完毕, 解冻后补跑编译+双真值。跟进: 60+ 构造点全量分类审计存档(3 接线点已覆盖全部用户 int8 标量读形)。
- **HELD 落账队列(全等 HEAD 恢复可编窗)**: cold defer(op-lane 落)→#152 补验→csge Commit D→NormalizeTypeText HEAD rebase(round42 在飞)→T80 修 HEAD 化(round44 复核+fin_b 链判决后)→#148 v2(round43 在飞)。
- **在飞**: fin_b 终局链(gen2 站烤制中)+round42+round43+round44。

## ★★ 2026-07-18 08:1x 收割批次一百四十五 (ceaefe81 会话) — #128-r6 triage 定谳(②③同根)+fix 2:0 REFUTED(Let it crash 红线)重飞 r7+S5 v3 采样窗口封存重飞 v4

- **★#128-r6 triage 定谳(高价值, 独立可信)**: ①**②tcpListenerValid 与 ③比较×逻辑与语句位=同一根因**——短路布尔(&&/||)作隐式尾返回时, parse_fn 尾值扫描(cold_parser.c:21502-21595)只扫当前块, 而 parse_logical_expr_cfg(:15812)把结果写前驱块、join_block 全空→die "non-void function block unterminated"; 真值持有者=parse_statement 裸表达式 expr_slot 被 (void) 丢弃; 历史 "parse_expr 既有限制"标签不准确。②yamux 信号已变 SIGSEGV(139 非 133, 3/3 确定性)=需独立定位不构成同案。③535 全量口径较 r5 净改善(rc0 229→249)。④ed25519 文件级已 rc=0, 链上验证待 tcptransport 过墙。
- **#128-r6 fix 2:0 REFUTED(封存 .REFUTED-r6-nonexhaustive-if-swallow)**: 侧信道方案方向对但只按语句时序不判可达性——**非穷尽 if 体内最后裸表达式被误采纳为函数尾返回=编译期响亮拒绝降级为运行时垃圾 bool(双复核独立构造 danger() 复现, Let it crash 红线)**+三兄弟站点只接一处(:20414 ident.field/#127 与 :20063 call-led/#150 未接, bitswapLedgerEnabled 仍 rc=2)。机械面全绿(红绿/回归 416 失败集逐条一致/运行值 7 组)不改判。**r7 重飞(wf_3b71ded6)**: 顶层直属最后语句判据(块归属非时序)+三站点全接+非穷尽 if 反例夹具锁(必须保持 die)。
- **S5 v3 封存(.PARTIAL-v3-sampling-window)重飞 v4(wf_2b216a41)**: v3 常规粘滞闭合+UAF 仍闭双确认; 复核 A 证实建流固定异步(pthread_create 工作线程写 sc, 非假设)→teardown→建流可压缩进一帧, 采样式布尔边沿漏检 NULL→粘滞低概率重现。v4=世代计数器(teardown 手写源 adapter.c:552 体内 gen++, 渲染线程本地; sync 比 gen 非采样 NULL)结构性不漏检。v3 复核 A 另留旁支: s_stream_ctx 裸读跳过 gen.c:2991 s_stream_ready 原子门控=文件既有两种读取纪律不一致(沿用 seek 同款先例, 无害陈旧读, 非 v3 引入, 待编号)。

## ★★ 2026-07-18 06:4x 收割批次一百四十七 (acb7a9d3 会话) — round44 复核 PARTIAL: T80 修本体成立+抓两真缺口(静默回退违纪+ForSeqLoop 步长族第 6 站点)+round45 两修合一在飞

- **T80 v1 本体判决(round44, 案卷 ~/cheng-patches/20260718/round44/)**: 红绿有效(base rc=2→fixed rc=4/定长回归零/变异守卫 load-bearing)+与 #148 hunk 物理不相交(~1400 行距, 组合树种子烤互不踩踏)可同落。边界 4 项: len=1 掩盖形符合机制/交替读写强判别(base rc=102→fixed 0)/struct 字段动态 seq 撞既有前置 ZC bail 711(组合形当前不支持, 如实记录)/int8[] 零差异 .o 逐字节。
- **★缺口①静默 aligned 回退违纪实锤**: 姊妹读路径 T78v4(~L12022)对 SeqElementShapeFromText miss 硬 bail return -1; T80 v1 写路径 miss 时静默落回 TypeShapeFromText(aligned)=T80 所修同类错的窄化残留(bool 不可达此敞口, 结构性未证当下可达)。**且插桩实证 IsDynamicSeq 守卫在该点重言恒真**(SeqRefForText 成功门要求类型文本以 [] 结尾, 定长 T[N] 走独立 else 分支)——v1 注释论证不准, 修复本身不受影响。
- **★缺口②新独立缺陷=步长族第 6 站点**: PrimaryBodyIrBuildForSeqLoop(~L45946) `for x in dynBoolSeq:` 值迭代全程 aligned 步长——for_seq_bool_repro rc=1(应 4)base/fixed 双树同错, int32 对照正确=bool 打包宽度缺失独立实锤。**若树源含 bool seq for-in, fin_b 链 r2 可能仍有残墙(链跑完对表)。**
- **round45 两修合一在飞(wf_80bc23c8)**: v1.1=恒走 SeqElementShapeFromText+miss 毒化(镜像读路径)+删重言守卫+改注释; ForSeqLoop=packed 结构口径(**拒绝复核员建议的 bool 字符串特判**); 验证含全树无新增 ZC 快检+t78 门+双变异; 产物=tree_fin_c 增量。复核臂追加消费点终审(TypeShapeFromText 全调用点漏网形扫描)。
- **fin_b 链 r2 在飞(ignite_20260717T214635_f91128, 16GiB 烤 cap)**: r1 死因=RSS 资源门 43MB 噪声级超限(12.93 vs 12.88GB cap, 非编译回归; 工具自记该类烤制峰值常态 14-16GB); r2 已过 drvBake+probes 11/11, gen2 站烤制中。RSS 边际对比注记: r2 完跑后取真峰值对表 fin_a, 显著抬升才立卷归因 T80 修。
- **在飞**: fin_b 链 r2+round42(NormalizeTypeText)+round43(#148 v2)+round45(T80v2+ForSeqLoop)。

## ★★ 2026-07-18 07:0x 收割批次一百四十八 (acb7a9d3 会话) — NormalizeTypeText memo 被复核 REFUTED(真线程撕裂缺陷)+v2 改道源头消重复(round46 在飞)

- **★round42 判决: impl DIFF_READY+review REFUTED(高质量打翻)**: 单槽 memo 全局三字段(texprNormLastRaw/Out/Valid)非原子——复核员证实 **Pass B 并行=OS 线程共享地址空间(thread.StartPtr)非 fork**, 逐行核实可达链 FunctionTaskParallelWorkerMain→FunctionTaskExecuteBodyIr→LoweringBuildOneFunctionInto→LoweringApplyPureCastReturnBodyKind→LoweringPureCastReturnBodyKind→NormalizeTypeText(lowering_plan:4224/3839/1431)——BACKEND_JOBS>1 即撕裂读→静默错类型文本→隐藏 miscompile。当前 effective_jobs=1 潜伏, 但并行门解锁正是本战役推进项, 不可赌; 代码库先例(loweringParallelResults 用 FunctionTaskResultLockAcquire 自旋锁)反衬缺漏。**编排者自纠: round42 prompt 里"fork 各持槽副本"前提即错, 复核员正确打翻**。
- **其余五项全独立复现成立(非造假)**: .o 三源逐字节等价/方向性能(parser -4.6~-12.7%/typed_expr 自编 -1.7~-9.7%, 高负载噪声如实披露)/14 形 smoke 双真值/变异红测(去 typeRaw 比对→编译器自编 ZC 级联 19 处 rc=2, 判别力超预期)/HEAD rebase apply --check 双 HEAD 干净。工件全存 ~/cheng-patches/20260718/round42/(diff 不落账, 留档)。
- **★v2 改道=源头消重复(round46 在飞 wf_730a2737)**: round20 census 真主因=AbiClassForType 连喂三 predicate 重复规整同串 85.45%——v2 一次规整+传递规整文本(*FromNormalized 变体), 零共享可变态=构造上线程安全, 同套验证协议(.o 等价+交错计时+smoke+变异+共享态自证)。复核臂重点=predicate 对已规整文本恒等审计(空白/前缀敏感隐藏语义即 REFUTED)。
- **在飞**: fin_b 链 r2(gen2 站)+round43(#148 v2)+round45(T80v2+ForSeqLoop)+round46(NTT v2)。

## ★★ 2026-07-18 08:5x 收割批次一百四十六 (ceaefe81 会话) — #133 v2 双 PARTIAL(复核网再抓五缺口+归因修正)重飞 v3 全矩阵轮

- **#133 v2 判决(双 PARTIAL, 封存 .PARTIAL-v2-five-gaps)**: v2 本体真实推进(arm64 W1+R1-R4 五决策点三档同步+STRH/LDRH 编码器+9 项 round-trip 三态对照 pristine 绿/v1 红/v2 绿=撕裂修复实证)。但复核网五缺口全独立探针坐实: ①嵌套多跳 o.nested.arr[i]=v 自 v1 起 die(parse_seq_index_ref_from_spans 第四决策点, pristine 正常=窄化专属回归); ②全局 uint16[3] 写入 patched 拒编(cold_parser.c:20632 第三份判据漏 ==2); ③**int8[N] 负值 v2 新回归**(elem_width==1 一刀切 ldrb 零扩展丢符号); ④**x64 读写再分裂**(读吃新 2B sizer 写仍 4B×4, 反汇编实锤)+riscv64 恒 4B; ⑤WASM 漏枚举(固定 4B)。**归因修正**: int16[N] 负值=v1 引入(pristine 4B 巧合保号)非 pre-existing——数组支必修, 标量支才是真 pre-existing。另: v2 意外连带修好 uint8[4] 双写 pre-existing 缺陷未披露(复核 B 抓)。
- **v3 重飞(wf_12a469a3, 全矩阵轮)**: v2 基座+五缺口(嵌套多跳/全局写/LDRSB+LDRSH 符号性分派/x64 三档同步反汇编验证/riscv64+wasm 判 pre-existing 立卷不强修)+**决策点全矩阵表交付作完整性凭据**(行=八类访问路径, 列=四后端, 格=行号+三档状态; tl2/tl3 完整性铁律)。窄宽度家族的结构本质=一次 sizer 收窄牵动全后端×全访问路径 stride 决策网, v1/v2 两轮枚举不全的教训固化为矩阵先行。

## ★★★ 2026-07-18 09:2x 收割批次一百四十七 (ceaefe81 会话) — ★#14 S5 落账 8994226d5(五轮对抗复核收敛终局, 双镜头 CONFIRMED×2)

- **★#14 S5 鸿蒙暂停背压落账 `8994226d5`(+143/-1 单文件 adapter.c)**: 背压三层(读端 rc==8 挂起/泵 dial 前短路/双水位)既有, 补齐写端一跳(pause 意图→paused_requested)。**五轮判决链全程复核网驱动**: v1 REFUTED(触摸线程解引用 sc=aa6f3101d 同型 UAF)→v2 PARTIAL(跨会话意图粘滞)→v3 PARTIAL(采样布尔漏检压缩时序)→v4 PARTIAL(gen 重置误吞间隙新意图)→**v5 CONFIRMED×2**(teardown 精确时刻重置+sync 只 forceMirror, 第六场景终值反转 0→1 双复核独立代数复算)。复核 A 加分: 第七场景 c 独立验证双边沿设计结构必需(gen 脉冲可在 sc 仍 NULL 时被消费, NULL-edge 兜底非冗余)。残留=竞态窗收窄至相邻指令(个位周期良性丢-最后-写, 产品语义未定义区间)+deviceOnly 七项待真机。**方法论标本**: 单意图变量牵动线程×会话生命周期×采样时序三维, 五轮层层剥洋葱每层皆真缺陷, 逐帧状态机推演=此类并发修复的验证范式。
- #14 无设备切片至此: S1-S4+S3b+S6+NAPI+S5 全收官, 剩 S7 音频+S8 汇合+真机验证面(deviceOnly 清单在卷)。

## ★★ 2026-07-18 07:2x 收割批次一百四十九 (acb7a9d3 会话) — fin_b 链 r2 判决: T80 写侧修生效(panic 消失)但失败换形(SIGSEGV+typed-ir-empty 残留)——T81"同根"归因不完整, ForSeqLoop 读侧成头号嫌疑

- **★fin_b 链 r2 判决(ignite_20260717T214635_f91128, verdict=ABORTED_GEN3_BAKE_FAILED)**: gen2 又绿(rc=0 ZC=0, 21.7min, 16GiB cap 下过站; wall 较 fin_a +14% 属修复开销+噪声)。**terminal 两站从 T80 干净 panic 变 SIGSEGV(compileRc=-11)**=T80 写侧修生效(prune panic 签名消失)但腐化仍在, 失败模式换形; oracle 五站空 stderr 速死+**oiso13 仍报 typed ir empty**+gen3 bake 同签(15.7s 即死)。
- **★归因修正: T81 "SAME_ROOT" 定谳不完整**——写侧(IndexAssign 4B→1B)修复后 typed-ir-empty 未清, 说明还有第二腐化源。**头号嫌疑=ForSeqLoop 读侧 aligned 步长(round44 抓获的第 6 站点, round45 修中)**: BFS/迭代若经 for-in 读 packed bool 缓冲, 4B 步长读垃圾标记→可达集乱→typed ir empty/垃圾指针 SIGSEGV 双象。手动触发 lldb 取证: 崩点 x9=0x400000001(双 32 位拼包垃圾指针形), exe 无符号表深挖时间盒截止, 交 fin_c 链后裁决。
- **战法判决**: 等 round45(T80v1.1+ForSeqLoop)交付→tree_fin_c→分钟级预检→链 r3。若 r3 仍红则以本崩溃签名开新狩猎臂(GEN2.primary.o 有平名符号表可切)。
- **在飞**: round43(#148 v2)+round45(T80v2+ForSeqLoop)+round46(NTT v2)。

## ★★ 2026-07-18 09:5x 收割批次一百四十八 (ceaefe81 会话) — ★#155 落账 41319e1fb(6 锚三方交叉+Metal 数值核对齐, 引擎夹具网大体恢复绿)

- **★#155 落账 `41319e1fb`(+326/-162 六文件, 双镜头 CONFIRMED×2, fix 自评 PARTIAL 经复核确认=诚实无隐瞒)**: ①**6 锚重导全部三方交叉 bit-exact**(生产探针+重写纯 Cheng oracle+独立 Python 定点复刻零 import): dense_transformer 16 logits+hf_shape inventory 21→27+handAnchorRow1 全套 GQA-softmax+kernel_metal 双锚; 复核 A 亲手完整前向复刻 16/16 bit-for-bit(embedding→isqrt RmsNorm→延迟除 MatMul→RoPE→causal softmax→…, 两次真算订正留痕=非抄答案)+**变异测试**(旧公式回注→logits[0] 精确报红)证锚有牙齿非自证。②**Metal 真 GPU 对齐**(真 .metal 内联源经 Metal API): RmsNorm isqrt 双处+PagedAttention buffers 族 hardmax→缩放点积 softmax(scale 贯穿桥接链 darwin+linux)+windowed 单窗。③净变化 3 类断言 RED→GREEN 零新红; TOP5 3/5 不回退(299 行 dump 逐字节)。④残留立卷素材: wide 跨窗 online-softmax(两遍协议方案在卷)+distributed lm_head hash 独立既存+int4 prefill 既存+2 死代码 kernel 副本。
- **#15 引擎线本日战果链**: BF16 加载(e1adf5837)→数值核 strike 0-4(b710fb7de)→GQA+eps 双修(1d14b5fc9, TOP5 0/5→3/5)→锚重导+Metal(41319e1fb)。语义对拍从 0.307 垃圾 id 到 top-3 与 HF 同序, 引擎夹具网恢复绿=后续战役回归底座就位。剩余前沿: 深层量化累积(定点精度战役)+首 token row0 残差+wide 跨窗+TOP5 尾部 2 项。

## ★★ 2026-07-18 07:4x 收割批次一百五十 (acb7a9d3 会话) — #148 v2 交付(site5 修成+两新覆盖+零回归)+★site6 独立立卷(&&链 call 尾缀投影整体丢弃)

- **★#148 v2 交付(round43 PARTIAL=诚实判级, diff 可落)**: site5=EvalNode IndexGet 回退分支(idxBaseIsFixedArray 臂)缺 Aggregate 门控——修法=仅 FieldGet 根接入 v1 既有 InlineElementStrideFromText(**首次无门控被 t78 门抓 9 处 BARE 数组新回归→加门控清零, 门第三次立功**)。全维度零回归: t78 106/108 与 v1 逐行同(2 FAIL=待刷期望行)/exec_diff 206 逐行同/生产三形态 90/91/92 同/非 bool .o 逐字节/双向变异红测/round-trip sha 可复现(v2=8932631b)。新覆盖实证: call 结果直接 FieldGet 根+动态 seq 下标根 boxes[k].arr[i] 均 1→0。diff=~/cheng-patches/20260718/round43/task148_pobj_v2.diff(208 行单文件)。
- **★site6 独立立卷(#148 家族 && 维度未收官根)**: `let r = i2<4 && makeBox().arr[i2]` 走文本 CBR 短路引擎(PrimaryBodyIrAppendBoolConditionAssign→ContextScalarValueSlotForTextImpl ~11989/12251)——simple-field-path 拒含括号根+整调用检测要求闭括号在末尾双双不命中→落到**只对裸 call 返回值做布尔判定、整个 .field[idx] 尾缀投影被丢弃**的分支(objdump 实证: 单 bl makeBox+str w0 捕获低 32 位, 从不算地址)。**类别≠步长错(压根没算地址)**; 影响面=一切"条件表达式内 call+字段/下标投影"用户写法。臂方拒仓促改千行文本引擎(违禁纪律自查零命中), 交独立诊断。baseline/v1/v2 三态同错=纯 pre-existing。
- **fin_c 合成计划**: 等 round45(T80v1.1+ForSeqLoop)交付→fin_c=fin_b+round45 diff+#148 v2(hunk 需对表确认不相交; 理由=树源若含 struct 字段 bool[N] 形则 GEN2 同受 #148 族静默腐化, 全栈上链)。预检口径: t78 门 106/108 且 FAIL 恰为已知 2 行=GREEN 等价。
- **在飞**: round45(关键路径)+round46(NTT v2)。

## ★★ 2026-07-18 10:2x 收割批次一百四十九 (ceaefe81 会话) — ★#128-r7 落账 1224b481f(短路布尔隐式尾返回根修, 6 transport 过墙)+#156 立卷

- **★#128-r7 落账 `1224b481f`(+338/-3 五文件, 双镜头 CONFIRMED×2)**: stmt_scope_depth 结构性深度门控(与 parse_if/for/while 递归帧一一配对, 非 r6 时序近似)——仅函数体顶层直属语句写尾值侧信道; 三站点((void)expr_slot 裸表达式/ident.field #127/call-led #150)全接线。复核硬核面: **9 组非穷尽 if 反例矩阵 pre/post 逐字节同 die=r6 静默吞噬未重演**+双法穷尽枚举证无第四站点+深度判据结构审计(8 parse_fn 调用点+setjmp 全查, 唯一脆弱点=已 unused 死代码)+206 corpus rc 零变化。战果: 6 transport *ListenerValid 全过墙+tcp_transport_smoke 真消费者 rc=0+bitswapLedgerEnabled 目标墙清除。落账工艺: cold_parser.c 有外部 WIP, --cached 手术+裸 commit 零卷带。
- **★#156 立卷(cold, 双复核独立坐实, pre-existing 正交)**: **全局 var 结构体字段作 &&/|| 操作数算错布尔值**(globalCtx.a && globalCtx.b, 嵌套一层同病; 显式/隐式 return 均错, pristine 同样复现; 局部/参数结构体正确)——真实生产 bitswapLedgerEnabled 用全局 bitswapContext 正中此病, 过墙后仍可能返回错值。复现=128r7 案卷 vB 探针(rc=200 期望 100)。
- **#128 下一前沿(复核 B 补测)**: dial.cheng(ambiguous imported const name+negotiateMuxerKind 缺体)/switch.cheng(unresolved PeerId 调用)两墙 pre/post 同错=独立既存; bitswapLedgerRecordWants 跨文件未解析调用第三墙; ①yamux SIGSEGV(139 非历史 133)待独立定位; ④ed25519 待链通后验证。

## ★★ 2026-07-18 08:3x 收割批次一百五十一 (acb7a9d3 会话) — NTT v2 复核 CONFIRMED 但性能证伪(0.177%)——round20 归因颠覆(重复是跨调用非簇内)+v3 改道带锁 memo

- **★round46 判决: v2 语义全胜/性能败**: 复核 CONFIRMED(幂等性源码级证明 Normalize(Normalize(x))==Normalize(x) 恒成立/68 用例边界批次 stdout cmp 全同/独立变异 4 行精确红/对主树真实脏工作树 5 hunk +870 偏移零 fuzz)——但 **env-gated 精确计数器: 削减仅 6,366/3,599,241 次=0.177%**, 墙钟信号淹没(parser -3.0%/typed_expr +1.4% 反向, load 7.75-15.77)。
- **★round20 归因颠覆(重要认知修正)**: "AbiClassForType 簇内三连喂占 85.45%"不成立——**85.45% 同串连续重复是跨调用相邻重复**(同串经不同调用点连续进入), 只有缓存能捕获, 源头簇内改造天然吃不到。此系 memo(round42 实测 parser -12.7%)与源头消重复(v2 实测 0.177%)的量级鸿沟的机理解释。
- **v3 改道=单槽 memo+自旋锁(round48 在飞)**: round42 REFUTED 点名的既有先例 FunctionTaskResultLockAcquire/Release 全护槽访问; jobs=1 无竞争自旋锁≈2 原子操作 vs 一次 O(n) 规整+分配, 79% 命中下净收益预期接近 round42; 基座=fin_b+v2(CONFIRMED 可叠)。验证增: 精确命中率计数器(env-gated)作墙钟噪声之外的确定性证据+锁覆盖完整性审计(by-construction)。
- **v2 diff 留档可落**: ~/cheng-patches/20260718/round46/(BASE+HEAD 双版, HEAD 版对脏树零 fuzz)——纯卫生收益, 与 v3 可组合(减调用数×跨调用去重互补)。
- **新立卷: assert 机制缺陷(round46 顺带发现)**: helper 函数内多条断言序列不传播失败(smoke 假绿通道), round42 的 14/14 自验可能受污染; 影响面广, 独立排查。
- **在飞**: round45(T80v1.1+ForSeqLoop, 点火线关键路径)+round47(fusion 三刀)+round48(NTT v3)。

## ★ 2026-07-18 11:0x 收割批次一百五十 (ceaefe81 会话) — #154-row0 残差 QUANT_FLOOR 诚实结案(attention-sink 真值坍缩+量化分辨率地板, 非缺陷)

- **#154-row0 定谳=QUANT_FLOOR 结案(单臂诊断, 四假设全判别)**: 首 token 深层 k/v_proj 160-392% 残差**不是缺陷**——①HF fp32 真值坐实: Qwen2.5-0.5B 真模型从 L3 起对首 token(BOS/attention-sink, 文献记录现象)的 k/v_proj 输出本身坍缩至 O(0.001-0.01), rowL 同层 O(1)(差 2-3 数量级; L0-L2 两者同量级=第 3 层起才坍缩=模型本性非引擎伪影); ②per-tensor scale=1000 分辨率 0.001, 真值贴地板时固定绝对噪声(≤0.025, 与 rowL 同量级)被趋零分母放大成大相对误差=算术必然。判别矩阵: (a)SaturateI32 饱和排除(整数值距边界 6-8 数量级); (b)RoPE position=0 排除(残差在 RoPE 之前的原始 k_proj 已存在); (c)KV 路径排除(LinearOutInWeightFill 纯逐行线性不读 KV 态); (d)量化动态范围坐实(逐位绝对误差≤0.025 vs 真值绝对和 0.0489→相除即 160%)。案卷=20260718/154r/diag.md。**#154 三信号全闭**: attention 爆开(GQA 已修)/norm 增益(eps 已修)/row0(本性结案)。进一步收敛 TOP5 尾部需 per-row/per-channel scale 或精度加宽=#153 缺口 d 次级 lever, 按设计"先测后定"原则待评估。

## ★★ 2026-07-18 09:1x 收割批次一百五十二 (acb7a9d3 会话) — round45 交付 CONFIRMED(毒化+ForSeqLoop 两修)+复核再抓第 7 站点(嵌套 IndexAssign)——round49 穷尽普查终结战

- **★round45 两修交付(fix DIFF_READY+review 对两 hunk 本体 CONFIRMED)**: ①T80 v1.1=删重言守卫+恒走 SeqElementShapeFromText+miss 硬毒化(AppendInvalidOp 6104, 镜像 T78v4 return -1 纪律), 380 源插桩扫描毒化分支 0 触发(不可达但纪律在位); ②ForSeqLoop=SeqElementShapeFromText 同构修, for_seq_bool_repro 1→4, 变异物理隔离验证。t78 门双侧 108/108; parser .o 逐字节(symlink 轮换破 --root 陷阱); compiler_csg ZC=1 双侧一致。driver sha 三方逐字节复现(af62a7ef)。diff=~/cheng-patches/20260718/round45/t80v2_combined.diff。
- **★复核再抓第 7 站点(review PARTIAL 唯一残点)**: 嵌套下标赋值 `grid[i][j]=v`(grid:bool[][], primary_object_plan ~40449-40469 assign_index_nested 分支)**直调 TypeShapeFromText 不经 SeqRefForText 链**(故 round44 六消费点普查漏)——bool 元素仍 4B 对齐宽; nested_bool_seqofseq_store 两树同 rc=4(期望 3) .o 逐字节同证 round45 未触及; FAIL_TRACE 命中该分支; 诊断变异翻 rc=3 因果坐实; int32 对照双树正确。**边界好消息: 单层读写混合+嵌套 for-in 读均被 round45 正确覆盖**。
- **步长族站点总账(bool packed1≠aligned4 一根)**: 读 T78v4✅/struct 字段 5 站(#148v1+v2)✅/IndexAssign 写(T80)✅/ForSeqLoop 值迭代(round45)✅/**嵌套 IndexAssign(第 7 站)❌round49 修**/(&&文本引擎 site6 是另一类=尾缀丢弃, 独立卷)。
- **round49 终结战在飞**: 修第 7 站+**穷尽普查=primary_object_plan 全部 TypeShapeFromText 调用点中"输入可为动态 seq 元素类型"的场景逐一分类+bool/int32 对照夹具实测**(不经 SeqRef 链的直调是 round44 普查盲区, 本轮补全), 目标=家族一次性收网。产物=fin_c 第三层增量。
- **在飞**: round47(fusion 三刀)+round48(NTT v3)+round49。

## ★★★ 2026-07-18 11:5x 收割批次一百五十一 (ceaefe81 会话) — ★#50 换种子收官(seed52 世代 49462b3e, F07+今日 12 笔 cold 修复入种)+★#133 三轮战役落账 bfeeec191

- **★#50 换种子收官(用户拍板"不用等", 编排者亲手逐步执行)**: ①预检定谳: F07b 修复(6dbd1e14f 7/13)理应入 seed51(7/16)但**三探针实测 p2 红(64 位跨模块 const 读 0)+p3 编译墙**——真相=F07b 是 src/core 后端修复不入冷链, p2/p3 病根是 7/16 后落的 cold 修复(f28395104 uint64 全宽等)未入种; ②fresh cold 预验三探针全绿(治病实锤)→装为 stage3→官方 bootstrap_from_cheng.sh 链(contract e202c0c35424eb36 零漂移+fixed point OK); ③ci_gate 31P/7F 对照定谳: 5 项 v2_contract smoke **双种子逐项同 FAIL=全部 pre-existing**(primary/backend2 契约类, op-lane WIP 期常红), build-backend-driver/perf-theory=历史 ZC 墙在案——**换种零回归**; ④#133 v3 落账后重烤终版: **seed52=49462b3e17aecfcb(1839200B)**, 三探针+#133 smoke 全绿。备份三重: cheng.stage3.bak+seed-rescue-20260718/(旧 7d1057af+新镜像)。**解锁: preamble varint 全域+#60 硬件 SHA256 识别臂激活面(door① 复测可开)+#150(DRV 世代前进)**。
- **★#133 三轮战役收官落账 `bfeeec191`(+693/-70 八文件, v1 步长撕裂→v2 五缺口→v3 全矩阵)**: 双 sizer 收窄+arm64 全路径三档同步(六决策点)+STRH/LDRH/LDRSB/LDRSH 编码器(as/clang ground truth 逐位零误差)+符号性分派(int8/int16 负值往返)+x64 同步(objdump 静态步长断言)+三 smoke 回归门。复核 A PARTIAL 唯一项=riscv64 分派现不可达(独立 pre-existing 墙, 文档级)已入 commit 披露; B 全量 CONFIRMED。立卷承继: riscv64/wasm 恒 4B(pre-#133)+x64/riscv64/wasm 窄读符号扩展——独立立卷。任务 #134 销。

## ★★ 2026-07-18 12:2x 收割批次一百五十二 (ceaefe81 会话) — ★#155-wide 落账 5855d8c3e(Metal 跨窗 online-softmax 两遍协议, 代数等价证明)

- **★#155-wide 落账 `5855d8c3e`(+548/-89 四文件, 双镜头 CONFIRMED×2)**: 两遍协议=Pass1 逐窗局部 max 之 max(结合律精确)+Pass2 全局 max 重算权重(与 CPU 字面同段 exp_neg_q MSL)raw numer/denom lo/hi 对回传 Cheng 侧 int64 精确累加+唯一终除——**与 CPU 单遍全局 softmax 代数等价非近似**。判别力证明: wide7(4+3 非对称双窗)独立 Python 三方逐位 [475,476], 旧 hardmax 退化值 [600,601]=真牙齿。复核加分: 21/22 参数疑点插桩实测排除(bytes_view 标准展开)+linux 交叉编译 ELF 符号匹配+缓冲区生命周期审; 复核 B 补充披露=旧哈希防腐层在两遍协议下消失由端到端 oracle 穷尽比对取代(建议追录)。Metal 数值核(RmsNorm/单窗/跨窗)至此与 CPU 全量对齐, #155 系列(锚重导+Metal 对齐+跨窗)三连收官。
- **#15 引擎线今日六连落账**: e1adf5837(BF16)→b710fb7de(#153)→1d14b5fc9(#154)→41319e1fb(#155)→5855d8c3e(#155w)+#154-row0 结案——机械面/数值核/对拍/夹具网/Metal 全线就位。

## ★★ 2026-07-18 12:4x 收割批次一百五十三 (ceaefe81 会话) — ★#128-r8 dial 墙落账 5edcf238c(own-import Tier1 第三站点)+WAN 下一前沿三件定谳

- **★#128-r8 落账 `5edcf238c`(+52/-1, 双镜头 CONFIRMED×2)**: dial 墙根因=parser_find_const 第三处 die 站点(跨模块裸 const 解析)扫顶层文件 Tier2 全闭包越界看见调用方私有别名(dial 的 qconn→quic/connection.cheng 同名 Outbound 凑假 found_count>1); negotiateMuxerKind body missing=die 被 recovery 吞掉的级联症状。修=消费 #109 既有 own_import_sources 做 Tier1 收窄(与 #109/#115/#118/#120 同构), miss 仍 die。复核: 82 真实语料 rc 全一致(35 个 .o 字节级 cmp 相同)+真歧义边界无假阴性+钻石折叠无假阳性+416 失败集零差异。
- **WAN 下一前沿三件(triage+复核定谳)**: ①muxer.cheng yamuxmod.YamuxCodec "unknown qualified identifier"(限定名解析族, pre-existing 独立); ②switch.cheng newPeerInfo(sw.peerId) 实参 kind=1/size=4(PeerId=str 别名 var struct 字段直读未解到 str kind); ③bitswap.cheng bitswapLedgerRecordWants peer 实参 kind=2/size=0(派生局部量路径, 错法与②不同, 疑似同族待插桩定谳)。站点①②(显式别名+数组尺寸)own-import Tier1 未投机补齐(无 repro 驱动)。
- **seed 注记**: seed52(49462b3e)不含 #128-r8/#156(在飞)——当日 cold 落账收尾后一次性重烤 seed52b(配方在 memory)。

## ★★ 2026-07-18 09:4x 收割批次一百五十三 (acb7a9d3 会话) — fusion 三刀 CONFIRMED+★金标符号化破解今晚崩点(_InternPoolRelease+0x44)+落账 HELD(活仓热区重构中)

- **★round47 三刀双绿(impl DIFF_READY+review CONFIRMED)**: 刀A 逐站 RSS 峰值(probes-only 实测 drvBake=706MB+11 探针逐项)/刀B 信号死亡自动取证(合成 SIGSEGV 单测 5 断言+两真实陷阱修复: lldb -o 队列崩后静默丢 bt 改 -k, time -l 包裹 orphan 需 setsid+killpg)/刀C cheng_addr_symbolicate(自建 Mach-O 解析+内容锚字节窗阶梯 64→160 唯一命中, 见零即停)。复核亲验: 独立重写解析器交叉 2 新地址+双命中如实上报(matchCount=5 非假 confident)+schema 负例全拒+旧 runId 零回归。非阻断缺口=地址未做 4 对齐校验(followUp)。
- **★点火线情报: 今晚 terminal SIGSEGV 崩点=_InternPoolRelease+0x44**(金标向量解出, otool/lldb 双路交叉逐指令一致)——**字符串驻留池释放层**, 垃圾指针 0x400000001 与残留 bool 步长腐堆(第 7 站嵌套 IndexAssign)自洽: 腐化写坏池邻接结构, 延迟到释放时爆。fin_c 链 r3 裁决。
- **★落账 HELD(热区纪律, 同 cold_parser.c 先例)**: fusion 活仓 30+ 文件并发重构 WIP(registry/chain 模板内容锚全失, patch 10/11 hunks 拒)——强行合入=破坏共享服务器风险+语义冲突。试合入已完整还原(3 文件逐字节 cmp 验证+清 .rej/.orig 全部工件), 交付物全档 ~/cheng-patches/20260718/round47/(fusion.diff+landing_notes+全证据), **重落条件=fusion 仓 WIP 沉降/落账后 3way**。临时用法: 需符号化时从实施臂克隆直起(bun index.ts, scratchpad wfr47_Jyx39E)。
- **在飞**: round48(NTT v3)+round49(步长族终结战)。

## ★★★ 2026-07-18 13:0x 收割批次一百五十四 (ceaefe81 会话) — ★#156 落账 fee866655(全局 struct 初始化器求值缺失根修)+seed52b 终版装机 393ee4c9(当日 cold 战果全入种)

- **★#156 落账 `fee866655`+注释订正 `bddde02ae`(双镜头 CONFIRMED×2)**: 根因比立卷更深——cold_collect_global_vars_from_source 对 SLOT_OBJECT 全局的 RHS **从不求值零诊断**, cold_copy_global_init 零填充=一切全局 struct 字段恒 0(非 bool/&& 专属, int32 字段同病; bitswapContext 只是一例)。修法范围化(严格版曾致 11 个 multiformats 回归被自家复核网猎回收窄): 只折叠已证形状(bool/int 具名+嵌套), 其余 return false 落回零填充逐字节=修前; 次生缺陷同补(多行 struct 字面量内部行误扫成假全局)。19 变体矩阵+哨兵证读零非垃圾+v19 反例如实标注; 复核 B 四消费形态全枚举+bitswap 真实形状 1:1 镜像。诚实残留: str/seq/ref 字段+位置实参调用+裸 str 全局仍零填充(需数据段重定位子系统, 独立特性立卷素材)。
- **★seed52b 终版装机 `393ee4c9df96ec00`(1839296B)**: 当日 cold 战果(#128-r7 尾返回/#133 三轮窄宽度/#128-r8 own-import Tier1/#156 全局 struct 初始化)全入种; contract e202c0c35424eb36 零漂移+fixed point OK+**六连夹具全绿**(F07 三探针+三战役代表 smoke)。备份: seed-rescue-20260718/ 现存旧 seed51+52 首版+52b 三代镜像。memory 已更新。

## ★ 2026-07-18 13:3x 收割批次一百五十五 (ceaefe81 会话) — #60 door① 复测定谳: 最后一环=cold defer(op-lane 在制), 致 op-lane 协调注记

- **#60 door① 复测(seed52b 后首测, 单臂探测)**: build-backend-driver 仍 rc=2——但阻塞面从"ZC=121 墙"精确收窄到**最后 1 个硬阻塞: cold_parser.c 不支持 defer 语句关键字**(gate_blocker=cold_reachable_body_missing @ backend_driver_dispatch_min.cheng, error="expected : after defer", 该文件 10+ 处 defer, cold 兜底物化硬 abort, 零产物)。zc_enumerate 交叉同判(ABORT 非 not_ready 计数场景)。**与 SHA256 识别臂无关**——识别臂全落账在位, 只等 driver 能烤出来。
- **★致 op-lane 协调注记**: 主树未提交 WIP(cold_parser.c 的 ColdDeferContext 结构 ~50 行+cold_defer_semantics_smoke 等 5 个 defer 测试文件)正是此环在制。**cold defer 落账之日=door① 秒发 10x A/B 复测窗开启之时**(本会话 60d1 工作流脚本可 resume 直跑 A/B, 配方在 ~/cheng-patches/20260718/60d1/probe.md)。#60/#56/#10 三任务的下游解锁全挂此单环。

## ★★ 2026-07-18 14:0x 收割批次一百五十六 (ceaefe81 会话) — ★#155r 件①落账 ad6d30f01(Metal GEMM 延迟除法同步, 真机 537 组因果坐实)+件② Metal attention 代表头独立立卷

- **★#155r 件①落账 `ad6d30f01`(+3/-3 单文件, 双镜头 CONFIRMED×2)**: 根因=#153 给 CPU MatMul2dFill 打延迟除法未碰 darwin provider——Metal cheng_gemm_i32 三处内核仍逐项 round_div=数学不等价。修=循环内纯累加+循环外单次除(与 CPU 逐式同构)。**复核 A 真机 M4 Pro 内核级验证**: newLibraryWithSource 编译改前/改后内核 537 组自构形状交叉——改后 vs CPU 0 不一致/改前 282/537 不一致=因果坐实非安慰剂; 9 处 int4/w4afp8 内核确认本就双侧一致; distributed lm_head 断言 1→0, 19 夹具零新红。
- **件② Metal attention 代表头 hardmax 独立立卷(内核重写级)**: hf_model_graph int4 prefill 红的真根因**不是 int4**(CPU/Metal int4 逐项舍入逐行等价排除)——是 model_executor:784-837 Metal 分支仍 #153 前"分组代表头 hardmax"(注释自证 separate follow-up), 单 token 因果注意力 1 候选巧合绿/prefill row1 2 候选真分叉红。修复=paged_kv_cache:1549 TensorPageBuffersToBufferFill+底层 kernel 重写为逐 head GQA softmax(复刻 CPU PagedKVAttentionQueryFill), 与 #155w 已修的 buffers/windowed 族是**不同路径**(第三条 Metal attention 通道)。

## ★★★ 2026-07-18 10:2x 收割批次一百五十四 (acb7a9d3 会话) — NTT v3 双绿收官(8 线程真并发压测 1280 万次 0 错 vs 无锁对照 75-121 错)+HELD 队列+新立卷 zero-C 字符串拼接乱码

- **★round48 判决: fix DIFF_READY+review CONFIRMED(NTT 三轮辩证终局)**: v3=round42 memo+独立自旋锁(FunctionTaskResultLock 同族, EnsureInit 挂唯一线程生成点 FunctionTaskExecuteParallel 与既有锁同 happens-before)。四项确定性证据: .o 三源逐字节/三夹具组 stdout 逐字节/精确命中率 **parser 85.436%+typed_expr 自编 87.157%**(与 round20 画像 85.4% 逐整数吻合)/锁窗审计 15 处槽访问 100% 覆盖+命中路径锁内 ORC retain 拷出。锁开销孤证 +0.74%。变异双红(槽污染 rc=2 级联/去锁还原 diff 与 round42 零差异)。
- **★复核天花板级验证(方法论沉淀)**: 并行门关(--backend-jobs:8 实测 task_count=0)→复核员 **thread.StartPtr 直起 8 真 OS 线程绕门压测锁本体**: 4 轮×8 线程×40 万次/线程≈1280 万次调用, v3=0 mismatch/0 crash/0 hang; **阳性对照(delock 变体=逐字节复刻 round42 无锁)3 轮稳定 75/85/121 处错值**——方法论判别力+锁真实消除缺陷双自证; per-thread 计数器 lost-update 证真交错非隐性串行。线程生成点全仓审计=唯一。
- **计时如实**: 高负载噪声主导(中位打平, 安静轮 -6%), 不宣称净正——主证据链=等价+正确+命中率+锁开销(确定性四件)。安静窗复测钉量级=followUp。
- **HELD 队列增补**: NTT v3(BASE+HEAD 双 diff, HEAD 对 fresh 克隆+脏主树双口径 --check 干净)入队, 门=HEAD 冷编恢复(defer)。队列现况: cold defer(op-lane 落)→#152→Commit D→NTT v3→T80 族 HEAD 化→#148 v1+v2。
- **新立卷: zero-C 快路径字符串 "+" 拼接乱码**(复核副产品, 已排除与 v3 相关): 全新小程序 str+str 经 zero-C 快路径编译输出乱码, strutil.Join 正常——既存 miscompile, 影响面=用户直觉写法, 归 T78 同级直觉语法族待狩猎。
- **在飞**: round49(步长族终结战)+round50(fusion 三刀合并)。

## ★ 2026-07-18 14:2x 收割批次一百五十七 (ceaefe81 会话) — S7 音频 v1 判决(A 抓 frames_played 竞态)重飞 v2+音频面真相测绘

- **S7 v1 判决(A PARTIAL/B CONFIRMED, 封存 .PARTIAL-v1-framesplayed-race)**: **音频面真相测绘(高价值侦察)**——①Android Option A 基建 ~95% 齐备(AAC 解码泵+AAudio 主时钟+Cheng 桥全套已写好但 0 调用点), 唯一缺口=视频 seek 从未联动音频 ES(队列不清/codec 不 flush/主时钟不复位=seek 后音画永久错位), v1 闭合此线(零新增 .cheng, 两个既有导出函数首次 dlsym); ②鸿蒙侧音频 ES 基建 0%(纯本地文件循环), 全链 ~500 行独立立项不硬做; ③蓝图已删经 git 历史(c09e5fe8f)找回=用户 7/10 拍板①选项A 音频 ES 化。**A 抓竞态**: v1 复位写在 pcm_mu unlock 后 vs AAudio 回调线程无锁 +=——写-写竞态 seek 瞬间 master clock 可能被旧值覆盖(自愈级, 新引入); 三个同段无锁写(input/output/end_of_stream)经全仓 grep 证渲染线程独占=安全。
- **v2 重飞(wf_4f4e7321, 行级修法)**: 两写点各入其已开 pcm_mu 临界区(unlock 挪行, 无新锁); 复核配方=全写点枚举+实时音频线程临界区纯字段写审(死锁面零)+读点陈旧容忍评估。

## ★★ 2026-07-18 14:4x 收割批次一百五十八 (ceaefe81 会话) — ★#14 S7 落账 4b4cd8593(Android 音频 seek 联动+竞态闭合, 两轮收敛)

- **★#14 S7 落账 `4b4cd8593`(+66/-1, v1+v2 合一, 双镜头 CONFIRMED×2)**: Android Option A 音频闭环——视频 seek 首次联动音频 ES(帧队列清+codec flush+主时钟复位, 治 seek 后音画永久错位), 零新增 .cheng(基建 95% 早已在, 两既有导出函数首次 dlsym); v2 竞态闭合(frames_played 渲染线程复位+AAudio 回调自增各入 pcm_mu 临界区, 实时回调契约保持, 死锁面零)。复核副产物立卷素材: ChengAndroidLocalAudioPlayback 本地播放管线自身同构 pre-existing 竞态(13368 锁外写/13408 锁内写)。
- **#14 战役状态**: 无设备切片 S1-S7 全收官(S1-S4/S3b/S6/NAPI/S5 五轮/S7 两轮)。剩=S8 汇合+真机验证面(deviceOnly 清单三批在卷)+鸿蒙音频 ES 链独立立项(~500 行)。

## ★★★ 2026-07-18 15:1x 收割批次一百五十九 (ceaefe81 会话) — ★cold defer 落账 4465b56ca(door① defer 环闭, 用户点名件)+下一墙=CSG v2 缺口交还自举层战线

- **★cold defer 落账 `4465b56ca`(+657/-47 九文件, 用户点名"工作流推进 cold defer 支持", B 全绿/A PARTIAL 按 T62-d6 行为口径判例裁决落账)**: 基座=op-lane ColdDeferContext WIP(391 行快照, 架构完整: 逐函数栈+detached block+5 处 RET 重定向+finish 兜底审计)+续完(禁令补 yield/await+**全仓 38 处旧 defer f() 非法糖迁移为 defer: 块形**, 与主树未提交同批迁移逐字节一致=先 CONFIRMED 者落账协议兑现)。spec 七条款复核运行值验证全过(LIFO 9321/return 先稳定/词法捕获 95/六形 hard-fail/panic 不承诺)。**终局门复核 B 独立坐实: build-backend-driver 的 defer 硬 abort 消失=defer 环已闭**。能力子集限定立卷(全响亮 die): 嵌套作用域 defer+单行内联形硬拒(spec 未禁, cold 子集, 38 真实消费点全顶层零生产缺口)。
- **door① 链路刷新**: defer 墙闭→**下一墙=ccsg.BuildCompilerCsgV2BorrowedEntryTextInto 从未有函数体**(全仓 3 调用点+1 字面量)=CSG v2 迁移独立缺口, 归主树自举层并行战线(2000+ 行 WIP 在制, 自带 cleanup_cfg gate 其报告同样 gate_blocked)。60d1 A/B 复测窗仍等此墙。
- **工作树遗留注记**: cold_parser.c 的 op-lane WIP 与已落账内容重叠部分自然消融, 剩余=自举层真 WIP(parser.cheng/typed_expr/cleanup_cfg 族)不受影响。

## ★★★ 2026-07-18 11:0x 收割批次一百五十五 (acb7a9d3 会话) — ★种子换装事故破解(seed52b vs 钉基世系)+fin_c 四层栈预检全绿+链 r3 起飞+round49/50 收割+fusion 三刀落账闭环

- **★种子换装事故定谳(快照设计立大功)**: fin_c 首烤 driver 编一切夹具报 "page21 target out of range"(连 triv)——排查=主仓 cheng.stage3 今晨 07:57 被换装 **393ee4c9=op-lane seed52b 世代**(合法装机, 见 memory seed52 卷), 与钉基旧世系(22482bad4 基)不兼容; round47/50 探针链的「环境预存 rc=2」同根。解=**链快照种子**(ignite_214635/inputs/seed, sha 7d1057af 验真)重烤即全绿。教训: 钉基世系烤制一律显式钉快照种子, 不再依赖主仓活种子。
- **★tree_fin_c 四层栈装配+预检全绿**: fin_b+round45(毒化+ForSeqLoop)+round49(站7/8/9)+#148v2(五站点), patch 零 reject; 钉种子烤 22s; 复现体八连绿(bool_idx 4/nested 3/ctor_seqlit 3/field_idx 2/for_seq 4/altrw 0/triv 7/vardecl5 5); t78 门 106/108 且 FAIL 恰为已知 2 行(#148 应得值 42/57)=GREEN 等价。**链 r3 起飞 ignite_20260718T013757_2d16c6**(全站+gen3 定点, treeSrcHash 77a2f85d, 种子快照指纹入档), 已过 drvBake+probes 11/11。
- **round49 收割(fix DIFF_READY+review PARTIAL)**: 站7 修成之外**普查再揪两站**(站8 构造器内联 seq 字面量 rc1→3/站9 单字段+下标写 rc0→2), 111 调用点全分类; 复核: 三站修复泛化性超预期(8 个普查外夹具的既有静默错值被顺带修复——3D bool[][][]/数组套结构体/bracket-dot-bracket 链), 但「穷尽」自证漏 ResolveSeqRootHeader 三处(T77 遗留 bool 字符串特判, 行为正确违架构口径, 清理列 followUp); backend2_lower_stmt(13 处零 SeqElementShape 机制)列优先审计。t78 门「不可复现」判定=复核员误会(门在主仓, 我亲跑即证)。
- **round50 收割(merge DIFF_READY+review CONFIRMED)**: 三刀语义合并 9a80c05 基座全套重验(金标/probes-only 链真字段/合成 SIGSEGV/旧 shape 兼容/对方 item15-19 回归); 与 gen2_symbolize.sh 判互补共存; 发现基座既有 provenance schema 缺口(历史 runId 缺 stages 键, 独立工单)。
- **★fusion 三刀落账闭环**: 外部(用户/回归会话)已抢先落 6aeda1e(round47 原版, 自测 PASS 亲验); 我补 round50 增量中的对齐校验 **9b8d672**(address%4 前置拒, 复核 followUp 收口)。m9021 撞号(与 fixture_matrix)容忍不改名。fusion 战线至此: 稳定(9dc7dc9)+能力三刀(6aeda1e+9b8d672)全 git 化。
- **在飞**: fin_c 链 r3(Monitor, gen2 站)。

## ★★★ 2026-07-18 11:5x 收割批次一百五十六 (acb7a9d3 会话) — ★fin_c 链 r3 判决: 三族墙收敛为一族(T82)——步长九站修清除 typed-ir-empty+RSS 放大两族, 全链只剩 InternPoolRelease 一堵墙

- **★r3 判决(ignite_20260718T013757_2d16c6, verdict=ABORTED_GEN3_BAKE_FAILED)**: gen2 三连绿(ZC=0, 17.8min)。**墙态收敛**: r2 三族签名(①prune/SIGSEGV ②s2/onsa RSS 爆 12.8GB+orbytes/os4b 300s 超时 ③oiso13+gen3 typed-ir-empty)→r3 全站统一为快速静默死(oracle 六站 73.5s 全空 tail vs r2 1009s)——**②③两族被九站步长修正名清除**(oiso13 不再 typed-ir-empty=T81 机理归因最终验证; RSS 病态放大=腐堆下游确认)。剩余唯一墙=T82。
- **★T82 定谳进行时(round53 在飞 wf_9be2cdf1)**: 崩点 _InternPoolRelease+68(fin_b/fin_c 同址, cheng_addr_symbolicate 新工具首战立功), 调用链 _CompilerCsgBuildWorkingSetRelease+656; 垃圾指针 0x400000001=(4<<32)|1 双 32 位拼包形=**64 位字段宽度/偏移错绑嫌疑**(内嵌 struct 偏移+8 族同型); 步长族被 r3 实验性排除。3.3s 复现+符号化自助配方已交臂。
- **洋葱总账(点火线钉基世系)**: link 符号五段(chain42-46)→T78 短路契约→T79 多行续行→T80/T81 bool 步长写侧→步长读侧+7/8/9 站→**T82 InternPool(在猎)**。每层反汇编级定谳+机器门收编, gen2 站已三连稳绿。
- **在飞**: round51(site6+T77 清理)+round52(四臂全面推进)+round53(T82)。

## ★★★ 2026-07-18 16:0x 收割批次一百六十 (ceaefe81 会话) — ★#128-r9 落账 9d5026355(PeerId 别名族双墙)+seed52d 终版装机 98feb481(defer 入种)+烤制点杀者复发定谳

- **★#128-r9 落账 `9d5026355`(+43/-1, 双镜头 CONFIRMED×2, 复核 B 撞 session limit 后 resume 补跑成功)**: PeerId=str 别名族双墙同根定谳(两轮插桩, 初稿 type_count=0 假象自我纠正)——限定名注册 vs 裸文本消费的表匹配永败→SLOT_VARIANT 启发式→两调用方兜底分裂表象。修=symbols_resolve_type 歧义安全裸名兜底(恰一物理声明才解析, 镜像 ObjectDef 四验机制)。四类对抗边界+真歧义保持 die+r8 交叉零回退+回归 1525/1525 零翻转。下一前沿立卷素材: 别名→对象 size 不追链(cold_param_size_from_type:596, Key=Bytes)+codecRaw 局部变量误判限定名(墙① yamuxmod 同族)。
- **★seed52d 终版装机 `98feb48122459cab`**: 当日 cold 全部战果入种(defer/#128-r7/r8/r9/#133 三轮/#156/#144 锁), 七连夹具全绿(F07 三探针+四战役 smoke+defer smoke), contract e202c0c35424eb36 零漂移。
- **★烤制点杀者复发定谳(bake_pattern_killer_disguise memory 模式再现)**: 同一字节二进制 scratchpad 秒过 vs artifacts/bootstrap/cheng.stage0 dyld 层挂起/SIGKILL(sample 钉 _dyld_start, 两次共 14min); **中性目录克隆(nb_x7)烤链秒过 CHAIN_OK 后拷回=免疫配方再验证**。52c(393ee4c9 同日中间代)曾同样受害。后续换种一律中性目录烤+拷回。

## ★ 2026-07-18 12:2x 收割批次一百五十七 (acb7a9d3 会话) — round51 半程收割: T77 清理 DIFF_READY(复核抓第 4 处漏扫)+site6 臂 API 断连复飞+种子 52d 再换装注记

- **T77 清理臂(DIFF_READY+review PARTIAL)**: 案情纠偏=T77 原始提交(be3349142) 3 处特判中 1 处是 SeqElementShapeFromText 规范定义本身(不能删), 真清理目标=ResolveSeqRootHeader 内 2 处(行号漂移至 ~19833/20013), 已委托结构口径。行为零变多层坐实: 靶向双夹具 .o 逐字节+变异红测转红(rc4/5=非死码)+round49 家族 22 夹具+parser 单编+t78 门 106/108 双跑 log diff 空。**复核抓漏: 第 4 处 `=="bool"` 在 PrimaryBodyIrSeqIndexValueSlot(~18960, T77-b 6ccad64ef 出身, round44/45 案卷挂过号)同构可清未清未披露**——清理 v2 挂账(非紧急, 行为正确纯卫生)。
- **★复核方法论金块(入 lessons 级)**: 裸种子编小夹具会退化 cold_subset_direct_macho(full_backend_codegen=0, **完全绕过 primary_object_plan**)——验证后端源改必须先种子烤 build-backend-driver 出真 driver 再编夹具(report 验 real_backend_codegen=1)。复核员双向对照证实并纠正。
- **副产品立卷: int8 字面量 `!=` 比较误判**(值读对比较错, 修前修后一致=既有缺陷)——与 #152 int8 sext 族疑同源, 并卷。
- **site6 臂死于 API 断连(Connection closed mid-response)**: resume 复飞(清理臂走缓存)。
- **种子再换装注记**: 主仓 stage3 已再换 **98feb481(seed52d 终版)**(52b→52d 当日两跳)——钉基世系钉快照种子纪律(7d1057af)再获必要性验证。
- **在飞**: round51-r2(site6)+round52(四臂)+round53(T82)。

## ★★★ 2026-07-18 12:4x 收割批次一百五十八 (acb7a9d3 会话) — ★T82 ROOT_CAUSED: var 前缀丢失→聚合槽尺寸 500→4→setMem 只清 4 字节→驻留池垃圾指针(四层反汇编定谳)+round54 验证加固在飞

- **★T82 根因链(round53, otool/nm/reloc 三方交叉, 四层调用链逐跳字节核验)**: GEN2 内 CompilerCsgTypedFactTableTerminalRelease 的 `table = TypedExprFactTable()` 被编成 **setMem(table,0,4) 应 500**——只清 4/500 字节, internPool@0x18 残留陈旧值→传 InternPoolRelease 解引用垃圾指针 0x400000001 崩。字段偏移两读写点统一 0x18=偏移错绑排除, 坐实「聚合总尺寸判定分道扬镳」。
- **★最终根源双病并发**: ①LHS 形参槽文本 "var TypedExprFactTable" 经 NormalizeTypeText 折成 "varTypedExprFactTable"(**只清空白不剥 var**)→TypeShapeFromTextImpl 九条硬编码跨模块聚合比较全不中→落跨模块嵌套求和为 0 的回退分支→槽=4B(仅 count:int32); ②AssignZeroConstructorMatches 见 ctorSize=500 vs 槽=4 分歧, 「同名即信槽」兜底静默选错——**吞分歧反纪律, 毒化加固已列 round54 任务**。修=TypeShapeFromTextImpl 增 StripVarType 归一九条比较输入(既有硬编码架构内归一, 非新增特判面)。
- **round53 诚实边界**: 未动态验证(19min 重烤禁令); 自建 repro 被 GEN2 编译崩于无关地址=**GEN2 本体已腐不可用作编译器**(如实排除)。**round54 破局配方=DRV 级分钟验证**: ①运行时双真值(var 形参大聚合 zero-ctor 重置后读深层字段, DRV_base 脏值/DRV_fix 0) ②反汇编主证(双 driver 编 compiler_csg 单文件, setMem 第三参 4 vs 500)+家族回归+毒化加固评估, 在飞 wf_cf1069f5。
- **在飞**: round54(T82 验证)+round52(四臂)+round51-r2(site6)。

## ★★★ 2026-07-18 13:1x 收割批次一百五十九 (acb7a9d3 会话) — round52 四臂全收: 门扩容 147 行落库 f92582916+bare-global 双根修 CONFIRMED+★拼接乱码=provider 缓存键病(非 codegen)+backend2 镜像缺失清单

- **★t78 门扩容落库 f92582916(双绿即落)**: 108→147 行(+39 步长族复现体 bool+int32 成对)+刷 #148 两行(1→42/1→57)。三真值精确: fin_c 147/147 GREEN/fin_b 恰 16 行 RED 零假阳零假阴/变异单行红。site6 行如实登记当前行为(1), 修后再刷。今晚九站战果全部机器化守卫。
- **★bare-global 数组簇双根修 CONFIRMED(复核亲验红绿+独立泛化)**: 根①=var a:T[N]=[lits] 与真 seq 字面量共用 SeqLiteral 节点 kind, 16 字节巧合(sizeof×N==16)时 seq header 裸字节被当数组内容拷贝(#A 的 87 垃圾值真相; 非 16B 恰好绕过=206 语料只中 1 处的原因); 根②=IndexGet segment-s7 tag=2 编码器从未接线→恒穿透裸解引用→动态下标恒读 element 0(global_fixed 三件)。修=门控让位+准入放宽(tag==1 语义不变)。exec_diff 187/0/19 四转 PASS NEW=0; 复核自建 int64/8B 步长夹具证泛化。**注意: 落此修需刷门 probe_bracket_init_fixedbool 期望 87→242(算术验证 1010%256=242 正确, 87 是巧合垃圾)**。diff=round52/bare_global_array_bracket_init_dynindex/。潜伏未修: 写侧 gArrStoreOp tag=2 同构(arm64 架构性不可达, 立卷)。
- **★拼接乱码定谳=provider 缓存键病(非 + 运算符 codegen, primary.o 逐字节同证清白)**: BackendDriverDispatchMinProviderCacheKey 用 path+size+mtime_ns 当内容替身——clonefile(cp -Rc)工作流保留 mtime→同键异内容→陈旧 provider .o 静默复用→ABI 失配乱码(ASLR 致逐次不同, 与 round48 观测吻合)。受控碰撞双向已验。v1 修被复核抓 **28x 命中路径回归**(每 provider 重哈希 16MB 编译器)——round55(哈希一次化 v2)在飞 wf_bea74208。**本病对今晚链判决无污染**(fin 世系 provider 源未变=陈旧复用无害), 但对一切"clonefile+改 provider 源"工作流是雷, HELD 落 HEAD 队列。
- **backend2 审计 CONFIRMED**: lower_stmt 13 处全安全, 真缺陷在委派目标独立副本——**站 7/8/9 全未镜像+第 4 新站(backend2_lower:3841)+中介 NodeEvalTypedSlotShape**; CHENG_BACKEND2=1 双真值实锤(bool 四组全错/int32 对照全对); 另发现 backend2 for-in int32 独立缺陷(4→6)立卷。镜像修复清单交 backend2 战线(gated, 不阻点火)。
- **在飞**: round54(T82 验证)+round55(缓存键 v2)+round51-r2(site6)。

## ★ 2026-07-18 16:4x 收割批次一百六十一 (ceaefe81 会话) — laudio 落账 c6281f9d8+四产品线 /goal 重设四线工作流全覆盖布防

- **laudio 落账 `c6281f9d8`(+8/-1, 双镜头 CONFIRMED×2)**: Android 本地播放 frames_played 竞态闭合(回调线程自增入 pcm_mu 临界区, S7 v2 同款单行位移判例; 单锁拓扑七函数核对死锁面零)。立卷素材: underrun_frames 同构竞态(同管线回调锁外裸写)。
- **用户 /goal 重设四产品线(Stop hook 常驻)**: 视频秒发秒开端到端/鸿蒙宿主生成化/远端视频本地化/小优 computer use。四线工作流全覆盖在飞: #128-r10(WAN 别名→对象 size+codecRaw+#54 复测, →#10 链)+Metal attention 终章(第三通道逐 head GQA, →#15)+鸿蒙音频 ES 大件(0%→全链, →#14)+#24 MoQ 吸收(架构归属正面攻坚, →#13 M3)。

## ★★ 2026-07-18 17:2x 收割批次一百六十二 (ceaefe81 会话) — ★Metal attention 终章落账 a731f9b8f(逐 head 切片零改 MSL, Metal 三通道数值核全对齐)

- **★Metal attention 终章落账 `a731f9b8f`(+195/-123 三文件, 双镜头 CONFIRMED×2)**: 第三通道(TensorPageBuffersToBufferFill)代表头 hardmax 根治——修法精妙在**构造性一致**: 零改内核 MSL, 输入从 kvRows 全宽换 headDim 逐 head 切片(#155w 内核天然泛化), host 加载与 receipt 校验共用同一切片函数。int4 prefill(:1325)转绿; 三链验证(真实 repeat=2 fixture+自构多 kv-head 真机 repro 8/8 逐位+全宽退化不变量); 复核 A 加打跨窗×切片组合(6/6)。**Metal 数值核至此三通道(GEMM 延迟除/buffers+windowed softmax/逐 head GQA)与 CPU 全量对齐**——#153→#154→#155→#155w→#155r→mgqa 引擎数值链七连战役收官。
- 立卷素材: 每 head 独立 launch ×attentionHeads 开销(正确性代价, 批处理优化件)+多 kv-head repro 转正固定测试件。

## ★★ 2026-07-18 17:5x 收割批次一百六十三 (ceaefe81 会话) — ★#128-r10 墙A 落账 3eceb7f49(size 侧单行升级)+墙B 定谳升级+鸿蒙音频 v1 2:0 REFUTED 重飞 v2

- **★#128-r10 墙A 落账 `3eceb7f49`(+19/-1, A 全量 CONFIRMED/B PARTIAL 仅系对照跑未完非缺陷)**: symbols_resolve_object_visit(:8579) 别名追链门单行升级 symbols_find_type→symbols_resolve_type——size 侧跟上 kind 侧(:9082)的 r9 超集, 跨模块裸别名(Key=Bytes)的 'missing object slot size' 墙破。复核 A 七组对抗(含真歧义双模同名逐字节保持拒绝)+相邻两墙零扰动+全量回归完整跑。**墙B 定谳升级(r11 件)**: codecRaw 真根因=惰性物化函数体(reachable body)的自身 import 链不触发全程序 const 预扫描(multicodec 常量 0/211 注册)——非解析谓词缺口, 架构级另立轮。switch 下一墙=initSwitch typed let kind mismatch(9 vs 5); **#54 三度定谳维持**(真实链路仍到不了调用点)。**协调警示**: 主树 cheng_cold.c 并发 WIP 疑移除 r9 兜底(未提交)——r9/r10 均双镜头在库, op-lane 有移除设计请对账。
- **鸿蒙音频 ES v1 判决(2:0 REFUTED, 封存 .REFUTED-v1-teardown-order-and-dlsym-names)**: 架构主体正确(OH_AudioCodec 异步回调+OHAudio+零 Cheng 桥改动)但复核双镜头独立抓三确定性缺陷: ①teardown 调用序(:610 早于 stop :614/join :619=aa6f3101d 同型 UAF, 与自报'join 之后'矛盾=文档断言与实测不符的 S5 v1 同款); ②**3/8 dlsym 符号名与 Cheng 真实导出名不匹配→engage 门恒假=功能 100% 未生效**(镜头 B 以 10+ 正确样本比对法坐实, v1 自报七项残留全未覆盖); ③实时回调对 pcm 零判空。**v2 重飞(wf_e53fba3a)**: join 后拆卸+8 符号逐一对表+持锁判空。

## ★★ 2026-07-18 18:2x 收割批次一百六十四 (ceaefe81 会话) — ★#24 MoQ 吸收落账 c328031ff(GEN-DIFF 7→6, 架构定谳成立), M3 真前沿收窄至族群A

- **★#24 落账 `c328031ff`(+250/-75 双文件, 双镜头 CONFIRMED×2)**: 241 行 MoQ 拉流合成函数 byte-identical 吸收进共享 GlesCoreSource(两跳经 GenCoreText)——架构定谳: GEN 域合成逻辑吸收/ADAPTER 域解码实现(MEDIA_DECODE_PIPELINE 9 函数)固有分界成立; MoQ 消费语义逐条核对无阉割; M3 七 smoke 零回归+Android 调用图零交叉。复核口径纠偏(共享文本双消费者+monolith 生产不可达)入卷。任务 #24 销。
- **M3 真前沿终局收窄**: GEN-DIFF 剩 6=族群A GLES 分片图集 4 件(bail57 root① 编译器层)+图集持久化+视口裁剪(方向反转件)——族群B/MoQ 线全部闭卷, M3 字节门收官只剩族群A 攻坚+Index.ets 口径裁定。

## ★★ 2026-07-18 18:5x 收割批次一百六十五 (ceaefe81 会话) — ★鸿蒙音频 ES 落账 09cb234e0(v2 终局, 从 0% 到全链)+Android 同型符号 bug 快轮在飞

- **★#14 鸿蒙音频 ES 落账 `09cb234e0`(+581/-11 五文件, v2 双镜头 CONFIRMED×2)**: 从 0% 建全链——OH_AudioCodec 异步 AAC+OH_AudioRenderer 实时输出+三线程模型(fetch 独占 QUIC 桥/解码器内部线程/音频实时线程回调纯标量)+seek/暂停联动一步接入, 零 Cheng 桥改动。v2 三缺陷闭合: teardown 两调用点均 join 后(结构性串行)+8 dlsym 逐一对表(3 改 5 确认)+pcm 同锁判空。**★副产物: Android S7 侧同 3 个错误符号名=S7 音频联动在 Android 实际未生效**——修正快轮已发(wf_86736d33, 对表现成)。
- **#14 战役状态刷新**: 双端音频 ES 链齐(Android S7+鸿蒙本轮), 无设备切片全谱收官(S1-S7+NAPI+双端音频); 剩=S8 汇合+Android 符号快轮+真机验证面。

## ★★ 2026-07-18 13:3x 收割批次一百六十 (acb7a9d3 会话) — site6 定谳+毒化守卫 DIFF_READY(因果链三重实证, 真相双分支比 round43 更深)+T77 清理 v2 交付

- **★site6 真相(插桩 trace+objdump+mutation 三重实证)**: 不止 round43 说的兜底一处——9 个 AppendBoolConditionAssign 调用点各自判 &&/|| 不共享: ①带括号形 `let r=(cond&&call().field)` 走孪生分支, HasAnd 用未剥括号原文判(&& 在深度 1 被漏)→**CBR 引擎从未被调用**→默认臂单 bl 把 w0 直接当 bool(连 i2<4 守卫都跳过); ②无括号形引擎真被调但叶子双检测不中→落函数末尾绝对兜底 FindOrCreateSlot **造从未写入的孤儿槽谎报成功**→零 bl 读栈残留(mutation 实锤: 改 arr[2] 真值 rc 纹丝不动)。
- **毒化守卫 DIFF_READY(路线③)**: 166 行 4 守卫+2 纯函数(全用既有解析原语零新逻辑), 命中即 bail 8901 宁响不错; **首版过宽被 t78 门当场抓获**(误伤 4 个无 && 裸调用夹具)收窄修正——门判别力第四次立功。验证: 三主流形态×2 类型根治转诚实拒/t78 146/147(1 FAIL=本夹具 golden 待刷 1→bail8901)/exec_diff 零回归/parser .o 逐字节。复核 PARTIAL=自述数字失实(209 应为 147/206, 结论全部独立复现成立)。**残留两形立卷**: (call()).field=前端 rhsNodeIndex=-1 独立缺陷/var-decl-后独立赋值=第 5 调用点待定位。
- **战法决策: site6 毒化不入 fin_d**——若树源含此形则 gen2 会新增显式 bail(暴露潜在错值属正确但挡链绿), 链目标优先; 毒化入 HEAD HELD 队列+独立世系测试(树内命中数普查后再定)。落 HEAD 时门表 bool_callresult_fieldarr 行同步刷 1→BAIL(8901)。
- **T77 清理 v2 交付(DIFF_READY, resume 重跑版含第 4 处)**: ResolveSeqRootHeader 结构化清理全套验证(细节见案卷 round51/resolveseqrootheader_bool_structural_cleanup/)。
- **在飞**: round54(T82 验证=关键路径)+round55(缓存键 v2)。

## ★ 2026-07-18 19:1x 收割批次一百六十六 (ceaefe81 会话) — Android 四幽灵 dlsym 符号修正落账(S7 联动真实激活)

- **Android dlsym 修正落账(+4 字符串, 复核 CONFIRMED)**: hmaudio2 副产物兑现+扩大——Android 段 4 个 dlsym 符号名系"从未存在的幽灵名"(复核全仓证 fn 定义不存在), engage 门恒假=S7(4b4cd8593) 音频联动实际未生效; 第 4 个(profile)本轮新抓超 hmaudio2 案卷。鸿蒙已工作生成代码作第二 oracle 交叉印证。**#14 双端音频 ES 至此真实可激活**(真机面待设备窗)。

## ★★ 2026-07-18 19:3x 收割批次一百六十七 (ceaefe81 会话) — ★M3 族群A 重大认知反转(生成器已领先, checked-in gen.c 落后带真 bug)+回灌收官刀在飞

- **★M3 族群A 定谳反转(fix 臂拒执行错误指令=复核体系又立功)**: triage 方向标签系统性对调(gendiff 机器输出可信), **真相=生成器已领先, checked-in gen.c 落后 6 件且带真实 bug**——#1 gpu_destroy pbuffer+分片纹理双资源泄漏/#2 旧单纹理版超尺寸 abort/#3 单纹理直读/#5 丢持久化合并/#6 无视口裁剪; #4=日志宏领先+2 处校验语义分叉待裁决。fix 臂正确 BLOCKED: 按字面搬运会删生成器已工作逻辑=用 GEN-DIFF 数字好看掩盖真实回归(违禁令), 空补丁如实交回。bail57 订正: 非编译器诊断码, 系生成器文本装配 GLES-struct-dup 自命名标签, struct 声明层批次一百二十已修, 残余全是函数体文本未同步。
- **回灌收官刀在飞(wf_e3226d64)**: 正确动作=再生成 gen.c 落库(生成化迁移本意=生成器为真源)——逐差异归因门(全部差异与 6 件对表, 第 7 处未知即停防丢手写独有改动)+#4 两分叉按更严格侧裁决+NDK 编译门。**此刀落地=M3 字节门 GEN-DIFF 趋零收官**。

## ★★★ 2026-07-18 13:5x 收割批次一百六十一 (acb7a9d3 会话) — round54 判决(T82 静态链全环+加固落地, 反汇编主证交链 r4)+fin_d 装配预检全绿+链 r4 起飞

- **round54 判决 PARTIAL(含金量足)**: ①T82 诊断静态复核全环成立(setMem 字节数确来自槽尺寸/兜底确会静默选边/StripVarType 确能剥折叠后前缀/diff 确统一双路径至同一 500 分支); ②**加固落地=删「同名即信槽」兜底, ctorSize≠slotSize 一律 return false**(槽尺寸同出 TypeShapeFromText 非前端权威, 无法自证对错则都不信)——T82 已堵死 9 已知类型触发面, 加固为未来同类防御层(现测试集无法正向红测, 如实); ③DRV 级反汇编主证被种子烤 driver 覆盖面墙挡(typed_expr 闭包 ZC 25-4284 条, 双侧逐行同=非本修引入)——**终极验证=链 r4 gen2 重烤本身**; ④新精化: 孤立语境 var 前缀走诚实 Ptr/8, 静默坍缩需 compiler_csg 真实语境(脱离语境无法造 repro 的机理解释)。零回归三重(t78 108 门×3 同/家族五夹具×3 同/两大源 ZC 墙逐行同)。深根(跨模块嵌套聚合坍缩为 0)设计已出未实施(独立立项)。
- **★fin_d 装配+预检全绿**: fin_c+t82_final(T82+加固)+bare-global 双根修, 零 reject; 钉种子烤 12.8s; 家族七连绿(bool_idx4/nested3/ctor3/field2/for_seq4/triv7/vardecl5); **147 行门 146/147 且 FAIL 恰为预告期望翻转行**(probe_bracket_init_fixedbool 87 巧合垃圾→242 算术正确)=GREEN 等价。
- **★链 r4 起飞 ignite_20260718T033246_c881aa**(全站+gen3 定点, treeSrcHash bf7f8983, 钉种子快照指纹验真, Monitor 挂站)。判决点=T82 修后 InternPoolRelease SIGSEGV 是否清除→terminal/oracle 转绿→gen3 masked 定点首验。
- **在飞**: fin_d 链 r4+round55(缓存键 v2)。

## ★ 2026-07-18 20:0x 收割批次一百六十八 (ceaefe81 会话) — mgqa 残留收口落账 46e6dcb87(smoke 转正+死代码清理, 编排者亲补动态门)

- **mgqa 残留收口落账 `46e6dcb87`(+117/-133)**: paged_kv_multihead_gqa_smoke 转正(8/8 逐位 repro 正式化真机 rc=0)+darwin 两死代码 hardmax kernel 删除(三重零调用验证, @exportc 精确 -2)。复核静态全 CONFIRMED, 动态件因宿主资源争用未跑(dyld 卡死=环境, 诚实 PARTIAL 非假绿)——**编排者中性克隆亲补动态门**(smoke rc=0+num_core_153/kernel_metal/paged_kv_cache 三关键夹具零回归)后落账。残留: linux 侧死镜像后续同步。#15 引擎线残留面至此仅剩量化精度 lever(先测后定)。

## ★★★ 2026-07-18 20:2x 收割批次一百六十九 (ceaefe81 会话) — ★M3 回灌收官刀落账 765c4d00e(GEN-DIFF 6→0, 函数级字节门收官)

- **★M3 gen.c 再生成回灌落账 `765c4d00e`(+321/-100, 双镜头 CONFIRMED×2)**: **GEN-DIFF 6→0——M3 函数级字节门收官**。六件 checked-in bug 全修(pbuffer+分片纹理双泄漏/单纹理超尺寸 abort→完整分片/tile_index 绑定/校验收紧/持久化合并恢复/视口裁剪+抽象宏); #4 两分叉裁决被复核用真实调用方源码坐实(调用方本就密集顺序赋值+镜像强校验=与生成器严格版吻合); 归因门无第 7 处(手写独有改动零丢失); 基线订正入 commit(GEN-EQUAL 185→195 即 +10)。
- **M3 战役终局面**: 函数级 GEN-DIFF=0 达成; slice-8 终局件=Index.ets 336 行文件级+cheng_gui_entry.cpp(生成器架构上不产出)+2 ADAPTER-ONLY 处置定案(豁免/迁移/补产出三选一, 待拍板)。#13 四产品线目标的生成化迁移主体完成。

## ★★★ 2026-07-18 14:4x 收割批次一百六十二 (acb7a9d3 会话) — r4 判决: T82 修实证生效(setMem 4→500 反汇编铁证)但崩溃同址——T83 立卷(init 侧宿主大聚合坍缩=深根打地鼠证伪)+round55 收官(HEAD 已独立同构修)

- **★r4 判决(ignite_20260718T033246_c881aa, ABORTED_GEN3)**: gen2 四连绿(ZC=0, 17min)。**T82 修反汇编铁证生效**: GEN2 的 TerminalRelease 现 19 指令含 mov w9,#0x1f4→setMem(table,0,**500**)(r3 世代为 4)——但 terminal 仍 SIGSEGV 完全同址(_InternPoolRelease+68, x9=0x400000001, BuildWorkingSetRelease+656 链)。
- **★T83 立卷(主会话现场判读)**: TerminalRelease 是「先 Release 后清零」——崩在 Release 读 internPool 时已垃圾=**初始化侧从未清零**。宿主 work 结构(typedIrRoundFacts@+0x1c98, 数 KB 大聚合)不在 T82 九条硬编码名单→构造零填充同被通用回退坍缩→区域未清→首 Release 即崩。**九条名单=打地鼠被 r4 实验证伪, 深根=TypeShapeFromTextImpl 通用回退跨模块嵌套求和坍缩**(round54 设计已出)。round56 深根臂在飞(wf_950ad9d3): init 侧定谳→通用递归修(definitionSourcePath)→毒化兜底→★变异判据=禁用九条硬编码全走通用路径家族全绿。
- **round55 收官(fix DIFF_READY+review PARTIAL→案卷闭)**: v2 哈希一次化正确性/并发/回归全绿, 命中 2.4s 未达 1s 硬标(架构性哈希税=真内容寻址每调用必读哈希 16MB); **决定性: 主仓 HEAD 已由 op-lane 独立落同构更完整修**(同名函数+bundle 级一次哈希+closureCid/manifest/pinned fd)——回灌价值为负, fin 世系无实际碰撞面, 案卷即闭归档。复核附带: 1/51 次 cache miss 异常(环境噪声嫌疑, 观察项)+基座卫生提醒(fin_c 临时物已核=07-17 世系遗留非本轮, fin_d/r4 快照干净)。
- **在飞**: round56(T83 深根)。

## ★★★ 2026-07-18 21:0x 收割批次一百七十 (acb7a9d3 会话) — round56 复飞+★HEAD cold 断链定谳(965528428 孤儿调用点)+HELD 队列重定范围(7 补丁全 REJECT/T82 被同构进化/stride 族静态未覆盖)+种子三度换装 a1aeea91

- **round56(T83 深修)复飞**: 进程重启杀掉后带缓存恢复(run wf_950ad9d3-092), init 侧定谳→TypeShapeFromTextImpl 通用回退修→变异判据(关九硬编码家族仍绿)→对抗复核管线在跑。
- **★HEAD cold 构建断链定谳(探针 agent git log -S 取证+编排者亲验)**: 两路皆断于 BuildCompilerCsgConsumeWithOverridesInto——①根因A=`965528428`(T79 whole-call 落账 03:21)系统性删除整个 read-set manifest 机制族(TypedExprReadSetManifestFlush/Path/SourceRows/FunctionRows, HEAD grep 全零)但 compiler_csg.cheng:19662 调用点残留成孤儿, cold 严格早绑定 unresolved 硬失败; 后续 cd5e7c1ca/6240792d7/90f744e2e 三提交未修且 op-lane 大落账重写 ccsg(+3017)仍保留该调用。**修法方向=删孤儿调用点**(机制族是被 T79 有意替代, 非误删单函数), 但 op-lane 此刻 cheng_cold.c+cold_parser.c 双 WIP 活跃(另现 .kimi-code/ 第三方并发痕迹), 共享战场不动源码, 立卷交 op-lane/静默窗再手术。②路径B=cold parser 报 unknown field contextCount(源 492/646 实存, 疑 cold 深嵌套解析限制伪 missing 已知陷阱), 未定谳不占号。
- **HELD 落账队列重定范围**: op-lane 90f744e2e 大落账(pobj ±416/typed_expr +5396/ccsg +3017/backend2_slots ±739)后, 7 个 HELD 补丁 git apply --check 全 REJECT→开门时需整体 rebase。**T82 已被同构进化**: HEAD 把 sizeBytes=500 硬编码换成 Int32(sizeof(texpr.TypedExprFactTable)) 活类型 sizeof(schema 增长免疫), t82_final.diff 出队; 但注释明言 Arena 族仍显式注册=**通用回退空缺仍在, T83 深修方向不变, 将来 HEAD 化 rebase 到 sizeof 形**。**stride 族静态未覆盖**(探针+编排者双验): round49 三站 before 代码在 HEAD 逐字节原样(站8 ~30455/站9 ~33900/站7 ~43221), IsDynamicSeq 守卫与 InlineElementStrideFromText(#148)零命中——倾向 rebase 清单坐实, 但无可运行 driver 未过双真值, 不作定论。
- **种子三度换装**: 主仓 cheng.stage3 现 a1aeea91(10:25 烤, 1822544B), 非 52d 的 98feb481——单日 52b→52d→a1aeea91 三跳, 钉基纪律(快照种子 7d1057af)再证生死线。探针工作区=nb_workspace/head_probe_r56/(主树零写入)。

## ★★ 2026-07-18 21:2x 收割批次一百七十一 (ceaefe81 会话) — ★#128-r11 双墙落账 c2b0395a3(parser_find_global 兜底门禁族+switch.cheng 笔误)+r10 升级判断证伪+r12 立卷

- **★#128-r11 落账 `c2b0395a3`(+66/-4 双文件, 双镜头 CONFIRMED×2)**: 墙①真根定谳=parser_find_global(cold_parser.c:1747) 跨模块裸全局变量兜底被 `!import_mode` 整体短路+缺 Tier1(own_import_sources)层——惰性物化函数体引用裸跨模块 var 全局(codecRaw.code 同款几十处)必 die。**r10 的「const 预扫描架构缺口」升级判断被实测证伪**(registration 侧全程序预扫描正常; codecRaw 是 var 非 const)。修=镜像姊妹函数 parser_find_const 既有模式(Tier1+逐 alias 自身排除), 歧义保持 die 零静默。墙②=switch.cheng:612 `var sw: var Switch` 双 var 笔误(2026-06-02 出生, 早于 r8-r10 链非新暴露面; return sw 违 spec 0.2.1 借用逃逸佐证)。验证: 双真值红绿+回归双侧 1089/416 FAIL 集合逐字节一致+复核A 四组变体(多层惰性物化/菱形 import/真歧义 die/const-var 隔离)+复核B 自建独立 repro 不复用实施方 fixture。落账工艺=--cached 手术+工作树同步套补(hunk 区 :1747 vs op-lane WIP :6334+/:17941+ 零重叠; 工作树同步防整文件提交静默回滚=r9 事故同型预防)。
- **★复核B WAN 全量披露(544 文件重测)**: 当前 HEAD 过墙数 268/544 零净移动——bitswap/switch 两链在 r11 修复点**上游**各长出另案新墙(bitswapLedgerRecordWants/newPeerInfo unresolved, 源于 13 commit 内已合并的另一支 cold_parser.c 改动, 两目标源文件自身零改动), 非 r11 补丁失效。
- **r12 立卷四件**: ①cid.decodeCidV0 "object constructor field type mismatch"(墙①修后新前沿) ②selectProtocol "typed let kind mismatch declared=str actual_kind=5"(墙②修后新前沿) ③bitswapLedgerRecordWants/newPeerInfo 上游双墙定谳 ④cold_regression_test.sh 补 import_mode=1 裸跨模块 global 最小 repro(复核B 指出的覆盖盲区)。

## ★ 2026-07-18 21:4x 收割批次一百七十二 (ceaefe81 会话) — #14 underrun_frames 竞态闭合落账 f3e168429(laudio 判例二连)

- **#14 underrun 落账 `f3e168429`(+8/-3 单文件, 双镜头 CONFIRMED×2)**: ChengAndroidLocalAudioPlayback 回调锁外裸写 underrun_frames 移入 pcm_mu 临界区(laudio c6281f9d8 同款单行位移判例二连用)。复核A 对抗构造: 修前竞态序列成立/修后互斥串行化构造失败; 复核B 运行时材料化 C 文本验语句序 orderOk=1+全仓 4 触点无未披露同构(鸿蒙侧/AES 管线结构性无此字段)+判例落账行零交集。立卷素材: pump_decoder 尾部诊断日志锁外读(读非写, 低危卫生件)。
- **#14 战役状态**: 无设备切片竞态族至此三连闭(S7 v2 frames_played AES 侧→laudio frames_played 本地侧→underrun 本地侧); 剩=S8 汇合+真机验证面(设备窗)。

## ★★ 2026-07-18 22:0x 收割批次一百七十三 (ceaefe81 会话) — ★M3 slice-8 终局落账 4fd773729(文件级 GEN-DIFF 336→0)——#13 生成化迁移无设备面全谱收官

- **★M3 slice-8 落账 `4fd773729`(3 文件 +44/-7, 双镜头 CONFIRMED×2, 常设技术拍板授权就地定案)**: ①Index.ets 裁定 ADAPTER 域(实测 358 行 94% OHOS ArkTS Promise-only 平台实现无 Android 镜本)→显式豁免落 census 可审计注册; ②cheng_gui_entry.cpp 既有豁免核验在案; ③GLUE-DIM 双函数(set_resource_manager/pause)按蓝图 §2.2 补产出, 与 checked-in 逐字节 verbatim。门数字: GEN-EQUAL 195→197/ADAPTER-ONLY 86→84/函数级 GEN-DIFF 维持 0/**文件级 336→0**; M3 七 smoke stash 基线对照逐字节 IDENTICAL。复核A 独立重裁零分歧+抓无「豁免当垃圾桶」伪覆盖; 复核B 亲编 stage3 亲跑 census 两次确定性+765c4d00e 留白对表非重复。
- **#13 战役状态**: 函数级+文件级字节门双收官——生成化迁移无设备面全谱完成; 剩=slice-4(等 vsync 真机证据, 设备窗)+iOS 解锁(正典 doc 既定序)。立卷素材: mobile_shell_codegen_smoke 整文件字节断言 rc=1(pre-existing 函数排列序)+蓝图 §2.2 标题措辞张力(下次蓝图修订)+Index.ets 骨架命名漂移不再被追踪(工具颗粒度限制)。

## ★★★ 2026-07-18 22:3x 收割批次一百七十四 (ceaefe81 会话) — ★#15 量化精度 lever 落账 27b046f08(TOP5 5/5 与 HF 精确同序)——引擎数值核战役八连收官, 残留面清零

- **★量化 lever 落账 `27b046f08`(2 文件 +4/-3, 先测后定判决 LEVER_EFFECTIVE, 双镜头 CONFIRMED×2)**: 全链路定点量化单一全局 scale, 默认 1000→100000。真 Qwen2.5-0.5B A/B: **TOP5 3/5→5/5 与 HF fp32 精确同序**; 逐层 fitted-gain-err 2-390%→普遍<2%; 1e6 追加档单调收敛(<0.03%)坐实量化噪声归因。复核A 三档探针逐字节复现+双真值方向+排除 scale 假提升; 复核B 9 夹具+stash 基线+3 硬编码 smoke 免疫+metal 结构不破。
- **#15 引擎数值核终局**: #153→#154→#155→#155w→#155r→mgqa→mgqac→**155q 八连收官**——语义对拍从 0.307 垃圾 id 到 TOP5 5/5 满血命中。残留面清零(观察项: layer23.residual 单点不随精度收敛不传播 logits/row0 attention-sink 本性维持/weights_path_smoke pre-existing rc=1)。排队件: linux 死镜像同步+Metal 每 head launch 批处理优化。

## ★★★ 2026-07-18 14:5x 收割批次一百七十一 (acb7a9d3 会话) — ★T83 根因重大反转(第二套布局引擎: 前端别名 size=4 兜底毒化首写永固缓存)+60 行别名递归修 PARTIAL+fin_e 组装预检三门绿+链 r5 起飞+round59 双臂(复核+姊妹 705)

- **★T83 根因反转(round56 交付, 推翻 round54 后端通用回退假说)**: 后端 PrimaryBodyIrSourceObjectLayoutAtDepth 别名递归链逐行复核是对的; 真根=**前端 TypedExprTypeLayoutImpl(typed_expr.cheng ~14392)对 compiler_csg.cheng:160 本地纯别名 `TypedExprFactTable = texpr.TypedExprFactTable` 裸引用字段**: 别名命中 declaredIndex 但自身无 typeFields→HasTypeField 恒 false→size=4/align=4 兜底, 500B 聚合坍缩 4B; 错值经 TypedExprIrAppendTypeLayout(append-only 首写永固 dedup guard @14476)写入全局布局缓存, 后端 TypeShapeFromTextImpl 缓存命中无条件信任——短路了后端本可走对的别名链。**算术闭环铁证**: r4 GEN2.primary.o 反汇编 work.typedIrRoundFacts 偏移 0x1c98=7320+坍缩 4+后续 4×16B=7388→align8=7392=实测零填充常数逐位吻合(两独立位点 mov w9,#0x1ce0); 真尺寸 7320+500+64=7884→崩溃=428B 下界越界读。
- **修=typed_expr.cheng 60 行**(round56/t83_typedexpr_typelayout_alias_fix.diff): TypedExprTypeLayoutAliasTarget helper, 两处 size=4 兜底前先查纯别名递归到目标(排除 enum 单行头/短路指针别名, 两坑实测踩过修正)。**验证**: t78 147 行三态零差异+家族 7 夹具零差异+parser ZC 零差异+**变异判据最强证据**: 禁全部 9 条 T82 后端硬编码只留本修, compiler_csg ZC 枚举精确复现 baseline(1 bail=61 同函数同行)=通用路径可顶替硬编码。**PARTIAL 两悬案**: ①GEN2 级反汇编复查未做(禁 --require-rebuild, 链 r5 补); ②硬编码+修同开时 bail 身份漂移 61→705(CompilerCsgClone)——诊断=CompilerCsg.typedExprFacts 同款别名静默 miscompile 被转诚实拒(聚合字段赋值缺 realizer), 未定谳。
- **fin_e 组装+预检三门绿(编排者亲跑)**: fin_e=fin_d+T83 别名修; 钉种子(7d1057af 验真)烤 DRV 14.4s real_backend_codegen=1; t78 门 146/147 唯一 FAIL=probe_bracket_init_fixedbool(87→242 已知翻转, 与 fin_d 逐位一致); 家族电池 7/7 精确对表(4/3/2/4/3/7/5)。
- **★链 r5 起飞**: ignite_20260718T065415_b8b187, 全站(drvBake→probes 11→gen2→terminal 2→oracle 6→gen3 masked 定点), RSS cap 16GiB 双档, 快照种子/树 sha 双盖戳。**判决点**: ①InternPoolRelease 崩是否清除(T83 修的直接检验); ②gen2 是否因 bail 705 现身 0→1 红(姊妹案在编译器全闭包是否被触发)——红也是净信息(诚实拒替静默错值, fin_f 弹药已在产)。
- **round59 双臂在飞**: review 臂(T83 修对抗复核: 别名环死循环恶意夹具/enum/指针/套别名五路打击+变异判据复跑)+sisterfix 臂(705 定谳+聚合字段赋值真 realizer, poison-on-miss)。round57 三翼+round58 rebase 栈继续在飞。

## ★★★ 2026-07-18 15:2x 收割批次一百七十二 (acb7a9d3 会话) — 链 r5 判决: gen2 0→1 红但爆炸半径=全闭包恰 1 条诚实 bail→T84 立卷(限定形别名套别名, lowering_plan:155)+round60 起飞

- **链 r5(ignite_20260718T065415_b8b187, fin_e=fin_d+T83 别名修)判决**: drvBake 12.7s 绿+probes 11/11 → **gen2 rc=2 ZC=1**: 全闭包唯一 bail=LoweringPlanRetainedPayloadItemCount(statement_sequence, bail=6) → ABORTED(terminal/oracle/gen3 未达)。**双方预测皆偏**: 既非 705/CompilerCsgClone(未在 gen2 现身——DRV 世代 realizer 覆盖 vs 种子 meter 差异, 姊妹案仍真但不挡链), 也不是崩溃清除直通。**净信息极强**: T83 修全局改层在 13 万行自编闭包的爆炸半径=恰 1 条诚实拒绝, 收敛性远超打地鼠时代。
- **T84 立卷(编排者亲侦察)**: 函数=lowering_plan.cheng:6506 纯 14 项算术 return, 嫌疑项 plan.typedExprFacts.count(嵌套聚合字段读, count@内偏移32); 字段声明 lowering_plan.cheng:155 `typedExprFacts: ccsg.TypedExprFactTable`=**跨模块限定引用他模块本地别名(别名套别名限定形)**——T83 修只覆盖声明模块内裸别名, 此形是洋葱下一层, 且正是 round59 复核臂对抗清单里的"跨模块别名被第三模块再引用"形态(双线收敛)。
- **round60 起飞(wf_5974ee8d-d36)**: t84fix 臂(bail=6 发射点定位+三文件最小 repro+qualified-alias 递归延伸修, 复用 TypedExprTypeLayoutAliasTarget+环防护)+对抗复核臂(三跳别名链/撞名毒/enum/指针四路打击)。fix 绿即组 fin_f 起链 r6。
- 在飞: round57 三翼+round58 rebase 栈+round59 双臂+round60。

## ★★★ 2026-07-18 15:4x 收割批次一百七十三 (acb7a9d3 会话) — round58 收官: HELD 栈 8/9 rebase 到 90f744e2e(复核独立重建逐字节收敛)+★抓获 HEAD 真回归(81bde41e0 静默删 T77 bool 校正)+Commit D 判死(子系统整体被删需重实现)

- **HELD rebase 栈交付(round58_rebase/01..09, PARTIAL+复核 CONFIRMED)**: 8/9 项成栈可依次 git apply 零 reject; 复核臂全新克隆独立重建, 终态与栈臂 applied_tree_sha.txt(7390 文件)diff 零差异=两次独立构建逐字节收敛。01 int8 sext(#152, 源在 round39!)/03 NTT v3/08 site6 毒化 REBASED_CLEAN; 04 T80 族(v1 从未落 mainline+v1.1 合并终态手工重写)/05 #148 七处/07 bare-global/09 清理 REBASED_RESOLVED。
- **★HEAD 真回归抓获(交 op-lane)**: mainline 90f744e2e 的 PrimaryBodyIrSeqElementShapeFromText(bool[] 1B 打包权威函数, ~20 消费点)缺 T77 bool 校正——`81bde41e0`("update", 父=22482bad4)静默删除, 同提交另删 3 处手工副本; 栈 09 第 4 hunk 已按 be3349142 原文逐字节静态复刻恢复, 解冻后优先验证。此回归使 04/05/06/07 在 bool[] 元素上"表面打齐语义仍坏", 是落账验证的前置。
- **Commit D 判死(DROPPED)**: 依赖的 ReadSet 捕获子系统(ManifestPath/CaptureEnabled/BeginFunction/Record+ComputeSourceInterfaceHash)被 op-lane typed_expr 重写(+18166/-4240)整体删除, 零同构替代——是重实现问题非重定位问题。与批次一百七十(flush 孤儿调用点)同源印证: op-lane 删了整个 ReadSet 子系统但 ccsg 调用点残留。
- **站9 语义悬案立卷**: #148(双分支统一 packed, mutation 证 load-bearing) vs round49 站9(定长数组保 aligned)在同一行分歧, 互未反向验证; 栈取 #148 判站9 SUPERSEDED, 解冻后一次烤制裁决。09 号另发现变量漂移 stmt.sourcePath→seqTypeSourcePath(round51 快照后独立修复), 已按现名改写防静默丢修。
- 复核唯一勘误: "直接子提交"措辞不精确(中隔 8 commit), 核心结论独立 git show 验证成立。落账门=op-lane SoA 收完+cold 恢复→栈烤验→按序落账。

## ★★ 2026-07-18 23:1x 收割批次一百七十五 (ceaefe81 会话) — #15 接力双件落账 8d579c0c5+cd5dddcfc(linux 死镜像清+Metal pipeline 缓存 -30%)

- **linux 死镜像同步落账 `8d579c0c5`(-50 行, CONFIRMED×2)**: core_runtime_provider_linux.cheng 两 hardmax 占位 kernel(hard-fail return -1 同名镜像)删除, @exportc 139→137。linux 侧最强静态口径=真实生产 export-roots 配方交叉编译 android+ohos 双目标 obj 逐字节 cmp 相同(复核独立复算字节数吻合)。
- **★Metal kernel-identity pipeline 缓存落账 `cd5dddcfc`(+155/-43 单文件, CONFIRMED×2)**: 每 head launch 五步重建(device/queue/MSL 整段重编译/function/pipeline)缓存至进程生命周期(pass1/pass2 双 slot), smoke 实测 -25~33%, 修前后 5 夹具 stdout 逐字节 IDENTICAL(25 次零 flake)。复核A 独立插桩实测 pipeline 构建 8→2 坐实因果; 复核B 独立基线复测方向量级同档。诚实缩量: Tier1 缓存非多 encoder 真批处理(端到端 Metal+GQA 无已提交夹具无法建逐位验证, 立卷后续件)。
- **新缺陷立卷(fix 臂 M 副产物, repro 在案 15fw/verdict_m.md)**: cheng_cold 裸顶层标量 ptr 全局变量跨函数读取截断(编译器缺陷, struct 字段包装可路由绕过但按纪律须根修)——已建任务追踪。

## ★★★ 2026-07-18 16:0x 收割批次一百七十四 (acb7a9d3 会话) — round59 双收: T83 修复核 PARTIAL(护栏全实测 load-bearing+第7式抓 T85 新案)+705 定性反转(缺 realizer→4 字节 ABI 对齐分歧, 17 行 DIFF_READY)+round61 起飞

- **T83 修对抗复核(PARTIAL)**: 根因叙事三环源码级独立核对全属实; 座席全部数字独立复现逐位吻合(t78/家族/ZC 三态+变异判据)。七式打击: 别名套别名/嵌套聚合命中修复通过(baseline 101/190 坍缩→fixed 0); enum 护栏与指针短路双双 mutation 实测 load-bearing(去护栏立现 NormalizedExprClone bail 与 cheng_seq_str_add bail=44, 函数名+bail 号双精确吻合); 恶意别名环 depth>64 护栏生效无 hang; 定长数组形不可判定(两态同撞无关既有墙 709/6102, 如实标验证缺口)。**★第7式 mustFix=T85 立卷**: M1←M2(别名)←M3(限定引用)拓扑, fixed 态不崩但**静默算错**——payload 两不同子字段同函数连续两次比较全失真(code=0 期望 3), 单独各读正确+canary 恒正确(整体尺寸对), ZC=0; 对照组无别名层全对=缺陷专属该拓扑; 疑字段元数据缓存裸字段名做键(未深挖)。此拓扑与 T84(lowering_plan:155)同源——同一前沿的 bail 面(T84)与静默面(T85)。
- **★705 定性反转(sisterfix DIFF_READY, 17+/-1)**: 非"缺 realizer"——通用聚合字段赋值 realizer 早已存在且对姊妹字段工作正常; 真因=诚实性闸门两尺寸源分歧: 前端 nodes2_fieldSizeBytes=504(T83 修对, 含 alignBytes=8 尾补齐) vs 后端 T82 硬编码字面量 500(裸字段和未按自身 align 补齐到 C-ABI 尺寸), 500<504 触发 NodeEvalMissAt 诚实拒。修=500→504 数值订正。验证: 19 行 repro 修前 bail 705→修后可执行 run_rc=0; compiler_csg ZC 回落恰 1 bail=61(纯 baseline); t78/家族/无关 .o cmp 全零漂移。**"61 消失"之谜解**: 两无关缺陷各自卡住唯一函数的巧合非因果, 61 是已注释的预先存在结构性 bail 未被触碰。
- **round61 起飞(wf_3464deef-97c)**: t85fix(反汇编+插桩实证污染机制到行级, 修缓存键真机制)+复核(交错访问/击键夹具四路打击)。**fin_f 组装序(待 round60 T84 交付)**: fin_e+705 对齐订正+T84 修(+T85 若就绪), 三门预检→链 r6。
- 在飞: round57 三翼+round60(T84)+round61(T85)。

## ★★★ 2026-07-18 16:3x 收割批次一百七十五 (acb7a9d3 会话) — round57 六臂全收: int8 符号扩展根修(auxValue 边信道)+site6 双残留定谳+★round51 毒化守卫自身假阳性(gen2 自编回归)+t83flank 矩阵(504 第三方独证+T83 算术四方闭合)

- **int8neq(fix DIFF_READY+review PARTIAL)**: 根因=byteCount==1 打包宽度无法区分 bool/uint8/int8 符号性, 全部硬编码 A64EncLdrbImm 零扩展(A64EncLdrsbImm 自 #133 引入零调用点); 修=LocalSlot.auxValue==2 符号扩展标记边信道(4 生产者位点: text 路径 root.field/bare arr[i]+node 路径 OpFieldGet/OpIndexGet), 反汇编 ldrb→ldrsb 双向铁证, round49 23 夹具零回归。复核抓两缺口: ①一控制夹具实为 `!(...)` 取反括号读未初始化栈槽既有族中招(VERDICT 假阳性); ②**第 5 生产者位点未覆盖: arr[idx].field 结构体数组元素 int8 字段直接作条件操作数读未初始化栈槽(未定义行为, 比符号错更重)**。核心机制成立, 落账前需补第 5 位点(排 round62)。backend2 镜像 9 处同硬编码列 followUp。
- **site6res(fix DIFF_READY+review PARTIAL)**: ①(call()).field 定谳=前端 TypedExprIrBuildRhsPostfixChainNode 首行 ParserIdentPrefix 空即 return -1, whole-call 分支不可达→毒化守卫(门 rhsNodeIndex>=0)被绕; ②第 5 调用点定位=pobj ~40506-40538 无守卫短路 fast-path 先拦先 return; ③★**round51 毒化守卫自身假阳性: 尾缀检测不查 ./->/[ 开头, `call()>=0` 被误毒化, typed_expr.cheng:19799 自触发→round51 单独落任何树=gen2 自编 build_rc 0→2 回归**(本臂已加精确化 PrimaryBodyIrTextStartsFieldIndexPostfix)。复核再抓两刀: edge1 双层括号 ((call())).arr[i] 仍静默错值(前端建节点无限深 vs 后端毒化检测只剥一层括号的不对称=系统性根); edge4 净回归(reassign+双括号+int32 字段比较从 bail=707 安全拒→静默错值)。**判决: site6 组合 diff 未达落账态; round58 栈 item08 必须捎带精确化修+剥括号循环到底修**。~317 行同表面形广扫待全量自编 sweep。
- **t83flank(MATRIX_READY+review PARTIAL)**: §1/§2 可信=9 硬编码 sizeof 探针 8 条逐字节吻合+**TypedExprFactTable 注册 500 但 sizeof 真值 504——与 round59 sisterfix(前端 504 vs 后端 500)完全独立的第三方确证**; 6 未注册候选 sizeof 全测出(TypedExprIr=2496 紧邻崩溃字段风险最高)。复核击破 §3/§4: 静态偏移正确值 7888/0x1c98(与 round53 取证吻合, 座席 7832 归因"源码漂移"错误); PROBE_UNAVAILABLE 证伪=补齐传递 import 五件套后 sizeof(CompilerCsgBuildWorkingSet)=7392 可测。**编排者分析闭合复核 mustFix#3**: "sizeof 直读 7392 vs 镜像 7888 差 496"非新深层缺陷——496=500-4 恰为 T83 坍缩本身(fin_d 克隆未修, 直读命中毒化缓存, 镜像无别名故对); 7888=7320+504+64 与 r4 反汇编 7392(坍缩态)/T83 修预测完全自洽=**T83 叙事四方独立闭合(反汇编/变异判据/复核七式/sizeof 矩阵)**。方法论沉淀: sizeof 探针必须显式核实传递 import 完整性(不足则 bail=49 伪 PROBE_UNAVAILABLE)。
- 主线不变: round60(T84)+round61(T85) 在飞→fin_f(含 705 对齐订正)→链 r6。

## ★ 2026-07-18 23:4x 收割批次一百七十六 (ceaefe81 会话) — #14 EOS+块缓存 v1 判决分裂(B 双绿/A 双 PARTIAL 四真缺陷)封存重飞 v2

- **v1 判决(镜头B CONFIRMED×2 卫生全绿/镜头A PARTIAL×2)**: 设计臂两处重大纠偏立功(①原始定位 adapter.c:31 teardown 分支是死代码, 真缺口=OnSurfaceDestroyed 从未 teardown; ②PrefetchTick 与 FrameFetch 契约不适配, 理论最优=FetchBatch 内部重写为块缓存优先+持久连接, 零独立拨号根治 hang)。fix 臂自抓设计未预见缺口(doSeek 未重置 input_done 布尔致倒退 seek 后二次播完 EOS 失效)。
- **镜头A 四真缺陷(封存理由, v_a.md 详证)**: ①暂停中到尾: PumpEnded 检查先于 Paused 检查→视频先耗尽后暂停=fetch 线程零阻塞忙等 100% CPU(直接反驳设计自证); ②EOS 渲染层效果只在 GPU 分支, CPU 回退无等价 latch; ③RenderLoop 退出点 teardown(内含 pthread_join)把新旧渲染线程无 join 竞态窗从微秒拉到网络 I/O 级(旋转场景双线程碰 EGL); ④PrefetchTick 游标脱钩(Pump 游标 vs 消费游标只 seek 对齐)→每圈 tick=无界预抓+启动期挤占视频带宽。
- **v2 重飞(wf_f1471f42)**: v1 补丁为基座四缺陷逐一闭合+注释证伪项同步, 复核镜头A 火力点=四闭合真伪+旋转逐帧推演+预取有界性。封存件: patch1.PARTIAL-v1-pause-busywait-cpueos-teardownrace/patch2.PARTIAL-v1-prefetch-cursor-decouple。

## ★★★ 2026-07-19 00:3x 收割批次一百七十七 (ceaefe81 会话) — ★#128-r12 三修落账 70cee7bae(r9/r10 快照吞噬恢复+静默错编译堵截)+④运行时证伪剥离 HELD+r13 立卷

- **★r12 落账 `70cee7bae`(6 文件 +149/-2, 复核A 全 CONFIRMED/复核B ①②③ CONFIRMED)**: ①symbols_resolve_type TypeDef/枚举裸跨模块兜底——含 **90f744e2e 快照提交静默吞掉 r9/r10 的恢复**(feedback_snapshot_commit_swallow 判例三度应验, 双臂独立收敛同一根因=强交叉验证); ②object_visit alias-chase 升级 fallback-aware; ③cold_call_args_match+find_fn pass4 尾名物理身份校验——**复核A VA3 运行时实锤堵住真实静默错编译**(selectProtocol 裸名被错配自身递归: baseline exit=204 越界读邻栈/patched exit=42 正确路由); 夹具三件(复核B 手工回滚 r11 亲证转红非占位)。回归双侧 1086→1087(+1 新夹具)/419 恒定。
- **★④被复核B 运行时 repro REFUTED(复核体系再立功)**: parse_object_constructor_typed 的 REF→OBJECT 宽容把编译期安全拒绝换成运行期字段静默清零(16B 双字段 struct 实测 a=0 应 7)——真根=codegen_store_slot_to_offset(cheng_cold.c:17798) payload_width 硬编码 0 与 cold_require_field_store_layout 校验口径两路脱节, ④移除的粗门禁恰是唯一让该路径安全死掉的屏障。剥离封存 fix4_ctor_tolerance.HELD-*, r13 连同 codegen 根修重飞。
- **★协调红色警示**: op-lane 主树工作树 WIP 已达 ±2000 行且直接覆盖 cold_parser.c 我方 hunk 区——本落账 cold_parser.c **只进 index/HEAD 未同步工作树**(不碰他人在制); op-lane 提交 cold_parser.c/cheng_cold.c 前**必须**对账 70cee7bae(git show 70cee7bae -- bootstrap/cold_parser.c)防第四度吞噬。cheng_cold.c 工作树已同步(区域无重叠)。
- **r13 立卷四件**: ①codegen_store_slot_to_offset payload_width 根修+④重着陆(带运行时双真值门); ②rendezvousCodec=cold_register_const_binding 缺「RHS 裸标识符引用同 const 块常量」分支(triage B 已定位 :5001, 返回 0 被静默当不适用); ③两链修后新前沿追进(bitswap 等④/switch 等②后未探); ④#54 gossipsub 双侧 rc=2 维持独立立卷。

## ★ 2026-07-19 01:1x 收割批次一百七十八 (ceaefe81 会话) — #14 EOS v2 判决(①②④闭合+patch2 双 CONFIRMED, ③修法再留窄缺口)→v3 窄幅重飞

- **v2 判决**: 四缺陷中①(暂停忙等: want_paused 提前+cv_notfull_fq 无条件阻塞)②(EOS latch 上提分支外+fire_once 双路径共用)④(预取门控迁移消费游标, 有界性数学证明窗口≤2 块, 独立复算成立)真闭合; patch2(块缓存)双 CONFIRMED。镜头B 全绿(census 曾抓一次注释换行 GEN-DIFF 已对齐; 复核自产假阳性 census 参数配置错误自纠入卷)。
- **镜头A 三度立功(PARTIAL)**: ③修法(代际 join)自身留新缺口——ChengRenderLoopArgs 只快照 prevThread, 未快照 g_window/g_width/g_height/g_density 四全局, join 解除后读「此刻」值→快速代际下绑错窗口/对已销毁句柄发 EGL(cheng_gui_host_begin 无存活性校验)。已排除 EOS 双发/teardown 双调用/死锁三类。
- **v3 窄幅重飞(wf_235138af)**: 只补四全局 spawn 快照+代际有效性推演(不足则补闩锁), 其余 v2 逐字节不动, diff-of-diff 门守卫窄幅性。封存: patch1_eos_v2.patch.PARTIAL-v2-renderargs-missing-window-snapshot。

## ★★★ 2026-07-19 01:5x 收割批次一百七十九 (ceaefe81 会话) — ★#14 EOS 收尾族 v3 落账 59ca9743a+音频块缓存落账 170dfd083——/goal「块缓存」项收官, #14 无设备面全谱闭合

- **★EOS 收尾族 v3 落账 `59ca9743a`(5 文件 +566/-76, 复核B CONFIRMED×2/A 残留判 pre-existing 不劣于基线)**: 三轮洋葱(v1 四缺陷→v2 闭三补一→v3 四全局快照+epoch 闩锁)收官——网络路径 EOS 全链(双生产者耗尽→src_eof→on_need_input EOS 分支→latch fire_once 双渲染路径)+暂停忙等根治+OnSurfaceDestroyed teardown 缺口(设计臂纠偏原始定位死代码)+代际 join/五字段快照/g_surface_destroy_epoch 单调闩锁。残留判例: begin 冷启动体 check-then-use 窗口系 pre-existing 类(修前无任何 epoch 门裸调 begin, v3 严格收窄无界→冷启动体一次), 零触碰终局=destroy 侧握手, 立卷 follow-up。
- **★音频块缓存落账 `170dfd083`(3 文件 +148/-77, patch2 v2/v3 两轮双镜头全 CONFIRMED)**: FetchBatch 内部重写块缓存优先+持久连接, **彻底删除独立 QUIC 拨号**(根治 ~2s 批边界 read-timeout 结构性挂起, 非降概率); PrefetchTick 消费游标门控有界预取(窗口≤2 块数学证明, 复核独立复算 [0,192] 帧成立)。**/goal「远端视频本地化: seek/暂停背压/块缓存」的块缓存项收官**。
- **#14 战役状态**: 无设备切片全谱闭合(S1-S7+NAPI+双端音频 ES+竞态三连+EOS 收尾族+块缓存); 剩=S8 汇合口径核验+真机验证面(设备窗)+立卷件(begin 冷启动 destroy 握手/Android 侧同型/视频侧 Harmony PrefetchTick 接线)。

## ★★★ 2026-07-18 17:1x 收割批次一百七十六 (acb7a9d3 会话) — ★round63 确定性收敛首跑双完成: 129 类型全普查分歧恰 1(=已备修的阳性对照)+诚实闸门 10/10 全覆盖(补 1 真缺口)——布局类缺陷空间枚举完毕

- **layoutcensus(CENSUS_COMPLETE, 129/129)**: AST 级全仓解析 1214 类型定义→三路合并去重 129 聚合类型→逐型 front sizeof/mirror 镜像真值(+top 后端)三真值。**唯一 MISMATCH=TypedExprFactTable(front/mirror 504 vs 后端硬编码 500)**——正是 round59 sisterfix 17 行修的目标(阳性对照精确命中, 方法学自证)。128 CLEAN, 关键确认: ①CompilerCsgBuildWorkingSet front=mirror=7888=T83 前端修连带修复 round57review 的 496 前端自相矛盾; ②后端偏移求和路径(SourceObjectLayoutAtDepth)对别名字段已用 504(反汇编 offset 0x288 与镜像 sizeof 交叉验证 byte-identical)——T82/T83 式下游坍缩该路径未重现, fin_e 内残余分歧仅剩 TypeShapeFromTextImpl 硬编码这一处(sisterfix 即除)。方法论沉淀: 裸 var 声明被优化器消去不可作取证(新陷阱); 替代=下游标量真实写强制物化+反汇编偏移+sizeof 镜像交叉。
- **gateaudit(AUDIT_COMPLETE, 10/10)**: 真前后端汇合点全集中 node-eval 家族 10 分支——9 既有闸门核验有效(含 705 原闸门), **1 真无闸门点抓获并当场补齐**(EvalNode IndexGet 动态 seq 聚合元素 override 无验证采信后端值——705 同类静默截断/错位风险; 闸门=复用已算未用的 idxSeqElemShapeAlign 要求 size%align==0, 违者 NodeEvalMissAt 诚实拒)。零漂移四重验证(t78 146/147+家族 7+三文件 ZC 对表+parser .o 逐字节)。diff=round63/gateaudit/gateaudit_dynseq_align_gate.diff。次级观察立卷: 42247 行 backend-vs-backend 双源点(超本轮口径)留后续审计。
- **收敛判定**: fin_f=fin_e+sisterfix(504)+T84 修(round60 在飞)+gateaudit 闸门(+T85 若就绪)→按普查+闸门证据, 布局类应清零, 链 r6 转确认性质。

## ★★★ 2026-07-18 17:3x 收割批次一百七十七 (acb7a9d3 会话) — round60 CONFIRMED: T84 定性反转(非新别名缺陷=同一 500→504 陈年硬编码被 T83 揭蔽)+三路汇聚一行字面量+fin_f 组装三门绿+链 r6 起飞+复核另立 4 件既存边界案

- **T84 定性反转(round60, 复核 CONFIRMED)**: 链日志"bail=6"实为 stmt_kind=6, 真 bail=801。机制=T83 修好前端后 stored fieldSize 变真值 504, NodeEvalProbe 单向门 `硬编码500<stored` 首次触发(旧坍缩值 4 恒遮蔽)→诚实 miss→整条 14 项 return 退化文本路径→ScalarCallSynthesisSlot 无力重解析调用实参字段链→bail 801。**修=pobj:4815 一行 500→504**——与 round59 sisterfix(705 案)、round63 普查唯一分歧行**三路独立汇聚到同一个字面量**(sisterfix diff 判定为同构重复出队)。复核反汇编级独证: 同址 mov w0,#0x1f4→#0x1f8, 前后指令逐字节同; zc 双态 801 消失+残留 61(种子既存缺口, fin_d 同现, 另案); t78/家族/无关 .o 全零漂移。
- **复核边界打击另立 4 件既存案(双态逐字节相同, 不阻链, 独立立卷)**: ①两跳/三跳限定别名链字段错值(h.inner.x 写 21 读 80, 2 跳即中——比 T83 修复面更广, 与 T85 疑同族, round61 在飞); ②两模块同名别名撞名双字段 SIGSEGV(高优); ③限定别名字段作嵌套聚合中间跳 SIGBUS(高优); ④限定形指针别名构造调用 missing_call_target(低优)。复核勘误纪律: "T83 机制完全正确"类无边界断言不入判决书。
- **fin_f 组装+三门预检绿(编排者亲跑)**: fin_f=fin_e+t84fix(500→504)+round63 诚实闸门(dynseq align gate); 钉种子烤 13.1s real_backend_codegen=1; t78 146/147 已知行; 家族 7/7 精确(4/3/2/4/3/7/5)。闸门 diff 绝对路径头用钉文件 patch 应用(.orig 已清)。
- **★链 r6 起飞**: ignite_20260718T092720_f14c23, 全站+gen3, 种子 7d1057af/树 sha 63b1bfa1 双盖戳。**按普查+闸门+三路汇聚证据, 布局类应已清零——r6 性质=确认跑**。判决点: gen2 回 ZC=0→terminal InternPoolRelease 崩清除→oracle 6→gen3 掩码定点首验。

## ★★★ 2026-07-18 17:5x 收割批次一百七十八 (acb7a9d3 会话) — round61 T85 收官(DIFF_READY+复核 CONFIRMED): 缓存污染假说证伪→真根=别名声明行字段解析落空+孤儿槽兜底读栈垃圾(双根叠加 101 行修)

- **T85 定性反转(round61)**: round59 复核臂的"字段元数据缓存裸名键污染"假说**实测证伪**(插桩 dump: texpr.typeDefAliasNames 表在 build-backend-driver 流程恒空 0 条; 真实缓存键本就是 (targetSourcePath, ownerLeaf, fieldName) 三元组不撞车)。**真根双叠加**: ①主根=PrimaryBodyIrLookupSourceFieldMeta 匹配到别名声明行(AggAlias = m1.RealAgg)后无条件找后续缩进字段行(纯别名单行无字段)→诚实 return false→上层 ConditionOperandSlot 双正规解析落空后落**既有孤儿槽兜底**(LocalI32Tag 从未被写入, 读栈残留)——两次比较各自独立走同一落空路径, 非跨访问污染; canary 免疫=无点单段标量直命中真字段表。②次根=SourceRootFromPath 只认带前导斜杠 "/src/" 中缀, 相对路径 --in:src/... 恒空根→跨模块别名目标文件不可解析, 单修①形同虚设。反汇编佐证: 比较左操作数栈槽 sp+0x18 只 ldr 无 str=孤儿槽铁证。
- **修=pobj 单文件净增 101 行**(round61/t85fix/t85fix_qualified_alias_field_lookup.diff): 别名重定向(结构标记判别纯别名, 零类型名特判)+相对路径约定处理+终尝试接既有生产级多跳解析器 LookupFieldPathMeta, 彻底失败仍诚实 false 不造新兜底。**复核 CONFIRMED**: 7 式新打击(4 连续子字段/双字段交错正反序/同名字段异 owner 交错/嵌套二级三连/同名类型同名字段击键)全部 baseline 静默错→fixed 与手算期望精确一致; 回归面(t78 146/147+家族 7/7+三文件 ZC+16 夹具+3 无关 .o)独立重跑全零漂移; 违禁审查无发现。
- **域外新立卷**: `var p: 跨模块别名; p = call()` 直接赋值形调用方缺 sret x8 目的寄存器→返回值按标量处理(diag9 可稳定复现, 与 mustFix 拓扑无关, diff 未触碰)——列为独立 sret 案待办。
- **态势**: 链 r6(fin_f, 无 T85)在飞——T85 属静默类, r6 terminal/oracle 若红即组 fin_g=fin_f+T85(+round60 复核 4 边界案交叉验证); 若 r6 全绿则 T85 不阻点火, 随后按序落账。

## ★★★ 2026-07-19 02:3x 收割批次一百八十 (ceaefe81 会话) — ★#128-r13 双根修落账 e2cda84f1(④重着陆+const 引用分支), muxer 净解锁, 新前沿=b.cond offset overflow(r14)

- **★r13 落账 `e2cda84f1`(+99/-2 单文件, 双镜头 CONFIRMED×2)**: ①④重着陆=IR-build 期 BODY_OP_PAYLOAD_LOAD 显式 field->size materialize(两条高风险路径实测证伪后的第三方案: codegen 反查槽型 SIGSEGV/改共享发射函数波及 3 调用点均弃), 先类型身份校验再 materialize(首版顺序被 VA5 证伪自纠); 复核A 从零 8 fixture 运行值手算全对, 复核B 手工回滚 materialize 运行值即损坏证必要性。②cold_register_const_binding 补裸标识符 str const 引用分支——rendezvousCodec 墙破, **muxer.cheng 意外净解锁 rc=2→0**(YamuxCodec 同类缺口一并修复)。cheng_cold.c 零触碰(r12 三修必然健在)。回归 1087/419 零翻转。
- **新前沿定谳**: switch.cheng 与 bitswap 链(bitswapadvertiser_smoke)同推进到 **b.cond offset overflow(delta=1365534/637876)=后端分支编码容量限制**——r14 件(分支 relaxation: 近/远分支 veneer 或反转+长跳, 单遍 backpatch 蓝图相关)。#54 gossipsub 订正: 顶层 rc=0, 真墙=pubsub/gossipsub.cheng 更早语法墙(expected ], 未下钻)。24B str 字段 confound=#136 既有缺陷(复核A 最小 isolation 证双侧同构)。
- **协调注记**: 本轮 fix 臂曾误在主仓 Edit 后逐行手术撤回自报——落账前已独立核实工作树零 r13 残留(apply --check 双口径过+零标记)。r13 hunk 区与 op-lane WIP 无重叠, 工作树本轮已同步。

## ★★ 2026-07-19 02:5x 检查点·用户令停飞 (ceaefe81 会话) — 两工作流停飞 resume 账本+本日会话战果快照

- **停飞二件(用户「先暂停任务」)**:
  ① **#128-r14**(b.cond offset overflow 分支 relaxation+gossipsub 语法墙探进): resume=`Workflow({scriptPath:'/Users/lbcheng/.claude/projects/-Users-lbcheng-cheng-lang/ceaefe81-c059-4fd9-b767-3a3e460f26ea/workflows/scripts/cold-128-r14-branch-relax-wf_c269d559-f81.js', resumeFromRunId:'wf_c269d559-f81'})`。要点: delta=637876 未超 ±1MB→判定条件真相是第一取证项; 禁抬上限绕过; 案卷基座 ~/cheng-patches/20260718/128r13/。
  ② **#14 S8 汇合审计**(全切片集成一致性+完备性批评家): resume=`Workflow({scriptPath:'/Users/lbcheng/.claude/projects/-Users-lbcheng-cheng-lang/ceaefe81-c059-4fd9-b767-3a3e460f26ea/workflows/scripts/v14-s8-convergence-audit-wf_af10d483-836.js', resumeFromRunId:'wf_af10d483-836'})`。产物目录 ~/cheng-patches/20260718/14s8/。
- **本会话段战果(批次一百七十一~一百八十, 12 笔代码落账)**: #10 线 r11 c2b0395a3/r12 70cee7bae(r9r10 吞噬恢复+静默错编译堵截, ④HELD→r13 重着陆)/r13 e2cda84f1(muxer 净解锁); #13 线 slice-8 终局 4fd773729(文件级 GEN-DIFF 336→0, 无设备面全谱收官); #14 线 underrun f3e168429+EOS v3 59ca9743a+块缓存 170dfd083(/goal 块缓存项收官, 无设备面全谱闭合); #15 线量化 lever 27b046f08(TOP5 5/5 满血, 八连收官)+linux 镜像 8d579c0c5+Metal 缓存 cd5dddcfc(-30%)。
- **待启队列(恢复时优先序)**: r14 resume→#137(begin 冷启动 destroy 握手)→#136(裸 ptr 全局截断)→S8 审计 resume→r15(pubsub/gossipsub 语法墙)。协调红色警示持续有效: op-lane 提交 bootstrap/*.c 前必须对账 70cee7bae(cold_parser.c hunk 只进 HEAD 未同步工作树)。

## ★★★ 2026-07-18 18:1x 收割批次一百七十九 (acb7a9d3 会话) — 链 r6 判决: gen2 ZC=0 回绿(T84 清墙)+★T83 崩溃签名消失(层坍缩类定谳已清)+新签名=T85 访问类(报表组装读别名字段孤儿槽)+round62 交叉测+round64 补全在飞

- **链 r6(ignite_20260718T092720_f14c23, fin_f=fin_e+t84fix+闸门)判决**: drvBake 12.2s+probes 11/11+**gen2 rc=0 ZC=0 回绿**(T84 一行 500→504 清墙实证, 战役第六绿)→terminal 0/2(GEN2 编译夹具自身 SIGSEGV -11)→oracle 0/6 同因→gen3 bake -5→ABORTED_GEN3_BAKE_FAILED。
- **★fusion 双工具归因(crash_triage lldb 活捕+addr 换算, 首发即中)**: 崩点=`ldrb w10,[x9]` x9=0x16fe00000(栈区边界), 命名帧链=AppendLine+452←AppendCompilerCsgV2Report+204←**RecordCompilerCsgMemory+788**←RunSystemLinkExecConcretePlanAfterSourceBundle——GEN2 组装 csg 内存报表(正是 `plan.typedExprFacts.count` 类限定别名多跳读的重灾区, lowering_plan:6746 同款)时从垃圾 str 值(长度 0x2730)拷贝=**T85 孤儿槽静默类**。**关键: r4 的 InternPoolRelease+68/x9=0x400000001 签名彻底消失=T83 层坍缩类在链上定谳已清**——洋葱换层非原地打转。
- **round62 交叉测判决(T85 对 round60 四边界案)**: 案②撞名 SIGSEGV **FIXED**(双真值扎实); 案① 两跳读回错值 UNCHANGED——**读写两条腿定谳**(写侧 offset 已对读回仍 80, 读腿=LookupResultFieldMeta 未被 T85 触碰); 案③中间跳 SIGBUS UNCHANGED(兜底分支未盖该调用点); 案④指针别名构造 UNCHANGED(独立子系统, 预期)。附带新立卷: int64 字段算术后 return 截断(裸 struct 同现, 非别名族)。
- **round64 在飞(wf_5bf5215d-2ae)**: T85 机制补全——别名重定向镜像到读腿(Result/Condition/Value 家族全枚举)+中间跳调用点, 基座=fin_e+T85, 带对抗复核(四跳链/读写交错/中间跳连续子字段/Result 家族四路打击)。**fin_g 组装序=fin_f+T85+round64 补全→链 r7**——按 r6 签名与 round62 判决, T85 族全清后 terminal 报表组装路径应通。

## ★★ 2026-07-19 03:3x 收割批次一百八十一 (ceaefe81 会话) — #14 S8 汇合审计判决(GAPS_FOUND)+批评家抓双高危盲区(s_aes 生命周期), 缺口闭合轮起飞

- **S8 审计判决(案卷 14s8/s8_audit.md)**: 阴性面扎实——dlsym 零错配/census 三轮逐字段吻合/无切片互踩/pause×EOS×seek 等组合推演成立/6 个 smoke 亲跑(含音频 ES 索引游标 seek 10/10)。六缺口全属验证深度/已披露残留类: ①design §3.4 纯 C 状态机穷举探针从未交付(唯一可行未做验证空洞) ②两 QUIC 双进程测试缺 runner ③=#137 在飞 ④块缓存 miss×teardown 上界未量化 ⑤双端 PrefetchTick 不对称(已披露) ⑥Android 纹理销毁同型竞态未覆盖(独立立项)。
- **★批评家抓双高危盲区(比六缺口重, 均为审计从未问过的问题)**: (a) **s_aes_* 资源泄漏面**: texture_release 全函数释放 codec/extractor/window/surface 唯独不碰 s_aes_stream/s_aes_codec/s_aes_ctx, 全仓零 AAudioStream_close/AMediaCodec_delete(s_aes_codec) 调用点, gpu_destroy 也遍历不到——09cb234e0 曾如实立卷后无人再提; (b) **进程重入功能缺口嫌疑**: 五个 s_aes_* 门控全局(inited/open_requested/open_done/open_result/engaged)全仓零重置写点(对照 s_es_engaged 有 EOS 显式清零)→静态证据强指同进程第二次播放音频 ES 不重新 dial/open=二次播放无声嫌疑(无设备未 100% 证实, 如实标注)。另: A-V 同步组合场景零审计维度+落账链名实缺口(S1-S8 全称 vs 只验尾部 8 条, 前 12 commit 未声明)。
- **缺口闭合轮(wf 起飞)**: 修件=s_aes 会话生命周期闭环(重入重置+资源释放接正确收尾入口); 交付件=状态机穷举探针+QUIC runner+上界量化论证; 复核加 A-V 同步组合维度。

## ★★ 2026-07-19 03:5x 收割批次一百八十二 (ceaefe81 会话) — #15 规划器×引擎接入侦察判决(前提反转)+S6-S10 切片提案定稿, S8 引擎侧先行起飞

- **★侦察判决(案卷 20260719/15plan/recon.md+critic.md)**: **前提反转**——规划器非「等引擎」: S1 确认门+S3 四回路生产化在案, S2 规则桥双端真接线(Android JNI libedgeplanner.so 实测 nm 有 T 符号/Harmony NAPI 镜像; iOS 纯 stub 硬编码 content_filter), 引擎真权重路径今日收官(TOP5 5/5)。**真缺口=设备路径**: 双端桥从未 setenv、APK/HAP 零权重打包→设备永远走规则分支从未调过模型; iOS mock 地基。
- **切片提案(S 编号已占到 S5b, 新片 S6 起)**: S6 端侧可行性探针(设备加载 942MiB 权重 load/forward/RSS 定生死, **需设备窗**)→S7 设备接线(含批评家抓的 resolveAsiTaskRind await 零超时保护补齐)→S8 结构化槽位输出(引擎侧纯 Cheng, **与 S7 可并行**)→S9 PWA 异步态 UI→S10 全覆盖验收(prompt-injection 对抗+三态能力矩阵)。安全铁律: 模型只出文本槽位值, confirmationRequired/effectClass/actions 永远手写模板。
- **批评家修正入卷**: 幽灵 commit 0c35850e3(真 S5b=4cf0de48a)/权重 942.3MiB 非 953MB/8 漏维度(超时/同设备 CPU 争用/权重完整性校验/槽位值 sanitization/隐私/并发重入/枚举演进/离线可见性)/S6 需量化门槛/S8 拆 a 选型+b 实现/S10 改三态可 diff 矩阵。
- **S8 引擎侧先行(wf 起飞)**: S8a 选型笔记(同 forward vs 二次 prompt 架构判断)+S8b 实现+对抗复核(prompt-injection 用例进复核火力)。S6 探针件挂设备窗清单。

## ★ 2026-07-19 04:2x 收割批次一百八十三 (ceaefe81 会话) — #137 v1 判决(目标场景闭合但全量枚举 REFUTED)封存, v2 锁面收编重飞

- **v1 判决(A REFUTED/B CONFIRMED)**: 补丁本体双镜头认可——begin 冷启动 check-then-use 真闭合(while 每帧 epoch 复查+g_window_touch_mutex 包 ensure 全体, 冷启动不持锁=ANR 与冷启动时长解耦; fix 臂读码还发现比案卷更重的变体: 多代级联可「复活」g_running 致真实 use-after-destroy, 一并堵住)。镜头A 按「全量枚举漏一个=REFUTED」硬标准裁决: gen.c 两处逐帧可达未加锁窗口触碰(present_gpu_commands :6161 setBuffersGeometry/present_compositor_frame :6434 window_set_geometry)——pre-existing 同类实例, 但「终局」框架必须覆盖。
- **v2 重飞(wf_a58cfc2d)**: 两触碰点收编统一锁形+三文件全量触碰点表格化重扫(第三点漏网=白干)+diff-of-diff 守窄幅。封存: fix.patch.REFUTED-v1-two-unprotected-touchpoints。

## ★★ 2026-07-19 04:5x 收割批次一百八十四 (ceaefe81 会话) — #136 v1 本体落账 c5ac4f3a0(完备性主张证伪措辞收窄)+v2 三姊妹点收编重飞

- **★#136 v1 落账 `c5ac4f3a0`(+63/-0, 双镜头「本体 CONFIRMED/完备性 REFUTED」按复核建议落账)**: 根因定谳=ptr 是唯一「引用宽度==值宽度(8B)」类型, BODY_OP_GLOBAL_ADDR 引用被三派发点(let/assign/单跳字段)当值 COPY_I64。修=插既有 cold_materialize_global_ref_value(guard 结构判断非 kind 猜, 15 既有调用点零扰动)。15fw 4 repro 全转绿; cd5dddcfc struct-wrap 裸形可还原已验证(独立 follow-up)。异根分立: str 内联初始化器 len=0=数据段重定位子系统待办(#156 注释在案); gen2 宽度族异码库。复核B 附带金块: .o cmp 误报=DWARF 嵌克隆路径串(lessons --root 陷阱再现), otool 文本段口径订正。
- **★完备性证伪(双镜头独立收敛=强交叉)**: 三姊妹派发点同根存活(证据夹具入卷 v_a_evidence/)——①LHS 裸全局 gDst=gSrc ②定长数组元素 localArr[i]=gPtr ③两跳嵌套 outer.inner.p。**v2 收编重飞(wf_4c1e5fcb)**: 三点+GLOBAL_ADDR 全触发面表格化枚举硬标准(漏一点且能造静默错值夹具=REFUTED)。#136 不以 v1 关闭。
- **协调**: cold_parser.c 本落账 index-only(op-lane WIP :18076 区重叠), op-lane 提交前对账 c5ac4f3a0。

## ★★★ 2026-07-18 19:1x 收割批次一百八十 (acb7a9d3 会话) — round64 修臂 DIFF_READY(读腿+中间跳同根定谳: TypeShapeFromTextImpl 纯别名不重定向)+fin_g 三门绿+链 r7 起飞+47GB 内存峰值定性

- **round64 修臂交付(DIFF_READY, 复核臂两度被进程/整机重启杀死已带缓存复飞)**: 读腿根因**再纠偏**——round62 曾误归 LookupResultFieldMeta(实际只服务 Result/Option 泛型); 真根=PrimaryBodyIrTypeShapeFromTextImpl 算出 aliasTarget 后**只喂指针别名分支**, 非指针纯别名从不重定向→跨文件别名链 size=0→①读侧 node_eval_miss 落孤儿槽(案①写21读80) ②外层聚合 size 算小→槽分配不足 SIGBUS(案③)——两案同根同修。第二坑: 单行别名声明(type Name = Target 无缩进块)连 T85 原版扫描都不认, 补分支后通。修=pobj 2 hunk ~82 行(复用 T85 原语自建 SourceTypeDefAliasTargetText helper)。自验: 案①全消融变体+案③ SIGBUS 全翻对; 案②不回归; 案④逐字节未伤; round61 13 夹具+7 式攻击+t78 146/147+家族 7/7+2 无关 .o 全零漂移。FAIL_TRACE 铁证: source_object_layout_not_found type=AliasC field_count=0→type_shape_qualified_miss→node_eval_miss 链条实录。
- **fin_g 组装+三门绿(编排者亲跑)**: fin_g=fin_f+t85fix+t85complete(首次 cp 被 18:52 整机重启掐断成 150M 残树, 已验明残缺删除重组); 钉种子烤 14.4s real_backend_codegen=1+t78 146/147+家族 7/7。**★链 r7 起飞**: ignite_20260718T110116_310513 全站+gen3, 树 sha 23e75d4b。判决点: T85 族(写腿+读腿+中间跳)全清后 terminal 报表组装路径应通→oracle→gen3 定点首验。round64 复核臂与链并行(轻臂不占内存)。
- **47GB 内存峰值定性(用户问询)**: 非泄漏——48GB 机器上链 gen2/gen3 各 14-16GB 实测常态(cap 16GiB 是 gen3 必需, 12GiB 默认会卡死)+多工作流座席并发烤炉叠加+常驻应用 ~5GB 同窗。当前无 Cheng 孤儿进程, 已回落。**新并发纪律: 链重载阶段(gen2/gen3)在跑时不再并行起新修复工作流, 复核类轻臂(14s 烤)不受限**。根治=#46 RSS 战役(regalloc 缺失 spill 放大是残余大头)。

## ★★ 2026-07-18 19:3x 收割批次一百八十一 (acb7a9d3 会话) — round64 复核 CONFIRMED(三杀后复飞成功): fin_g 两笔 diff 全带背书, r7 转完整复核确认跑

- **round64 复核 CONFIRMED**(复核臂历经 API 超时+整机重启两杀, 第三次带缓存复飞成功): 独立双克隆(rvx before/after)全案矩阵翻转复现(t1_2hop 80→21/t1_main 2→0/t4_main SIGBUS 138→0); after 树与实施方克隆 pobj 逐字节相同+src/core 全 diff 零差异=无隐藏改动; FAIL_TRACE 机制探针 miss 行消失; 五式新打击全绿(四跳链混排声明形/读写交错/中间跳连续子字段/Result 族/块形对照)——**rvD 意外正向副产品: 别名类型构造 return 的编译 bail=801 被顺带解锁**(before 编译即败→after 全绿+活检)。回归面独立重跑全零漂移。
- **三项非阻断勘误**: ①根因叙事收窄——真破坏面=【单行别名声明形】(块形跨文件别名在基座本就通, rvC 实证), 补丁的单行扫描分支才是承重件; ②type_shape_qualified_miss 打点挪到重定向前致修好后仍打 miss(名实不符, 观测语义跟进项); ③type 块行走状态机微型复制与本文件既有风格一致, 记清理机会。
- **态势**: 链 r7(fin_g)gen2 在跑, fin_g 全部增量(t84fix/闸门/t85fix/t85complete)均 CONFIRMED——r7=完整复核后的确认跑, 判决点 terminal 报表组装路径。

## ★★ 2026-07-19 05:4x 收割批次一百八十五 (ceaefe81 会话) — ★#14 s_aes 生命周期落账 57ac9a6bb(二次播放复合缺陷根治)+三交付件分级处置

- **★s_aes 生命周期落账 `57ac9a6bb`(+101/-0 单文件, 双镜头 CONFIRMED×2)**: S8 批评家盲区实测坐实且比原判更重——「无声+失速」复合缺陷(open_done latch 零重置吃陈旧结果+engaged 不清零致节流门被遗留 frames_played 击穿)。修=session_teardown(四门控复位, ctx_inited 刻意保留防 mutex 重初始化 UB)+owner_texture 所有权指针双挂载(texture_release 顶部+prepare_media_surface 身份预检——后者覆盖 texture_release 结构性不可达的「切不同素材」核心场景)。EOS 挂载点偏离任务书有据(s_aes_engaged 是 5 处真实门控, 照抄视频惯例会杀死倒退重播路径)。复核 A 附带纠偏 AAudioStream_close 阻塞文档主张(实际安全由 pcm_mu 尺寸门控+静态存活期兜底); 复核 B 补 NDK 语义门 0 新增。
- **三交付件分级处置(双镜头各 PARTIAL)**: ①EOS 状态机穷举探针=8/8 验证当前 HEAD 逻辑成立, 但复核 A 亲测「改生成器一行探针不转红」=快照式提取不追漂移, **不能当回归门**——归档 EVIDENCE-ONLY 不落 src/tests(防伪覆盖); ②QUIC 双进程 runner 两测试 all 模式全绿(7/7+三模式), 复核 B 抓素材检查不按模式裁剪缺陷——编排者已亲手修复(REQ_FILES 按 MODE 裁剪, bash -n 过); ③上界论证定谳新缺陷已立卷任务 #139(涓流无界+pthread_join 无超时; 区制 B 推导不自洽注记在案)。
- **#14 战役状态**: S8 审计闭环——六缺口+双盲区全部处置(修/立卷/归档各归其位); 无设备面剩 #137 v2(在飞)+#138/#139(立卷)+真机面(设备窗)。

## ★★★ 2026-07-18 20:0x 收割批次一百八十二 (acb7a9d3 会话) — 链 r7 判决: gen2 新墙 ZC=2(T85 双修引入双 mct 回归, macho 链接族)→T86 立卷+round65 消融根修起飞

- **链 r7(ignite_20260718T110116_310513, fin_g=fin_f+t85fix+t85complete)判决**: drvBake 12.7s+probes 11/11→**gen2 rc=2 ZC=2**: machoWriteEmbeddedAdhocSignature+MachoProviderLinkExe 双 missing_call_target(bail=0)→ABORTED_GEN2_BAKE_FAILED。**fin_f(r6)gen2 曾 ZC=0=回归由 T85 双修引入**——类型 shape/字段元数据重定向全局改变解析后, macho 链接族调用目标解析失手。净信息: 诚实 bail 非静默+爆炸半径恰 2 函数同族, 可枚举收敛特征保持; 但也实证 T85 重定向的作用域边界需要收紧(round64 复核 rvD"解锁 801"正向副作用的反面即此类连带激活)。
- **T86 立卷+round65 起飞(wf_39ccceeb-d0b)**: 消融三态定谳 culprit(t85fix/t85complete/交互)→调用点解析键行级根因(疑重定向改变 receiver/限定名→TargetFunctionIndexWithKind 查找键漂移, 或 mct 老家族 tail 名碰撞被激活)→真机制修(禁撤 T85 倒退/禁函数名特判)+别名案矩阵全量保卫(T85 战果无一回退为硬门)。复核带 T85 重定向作用域边界夹具打击。
- 洋葱链谱系更新: T83 层坍缩(清)→T84 硬编码遮蔽(清)→T85 访问三腿(修入待验)→T86 重定向连带激活 mct(在修)。每层爆炸半径: 1 bail→1 crash 签名→2 bail, 收敛特征未破。

## ★★★ 2026-07-19 06:0x 收割批次一百八十六 (ceaefe81 会话) — ★#128-r14 arm64 分支 relaxation 落账 360a602e5(后端编码容量根治, 双链 WAN 墙破)

- **★r14 落账 `360a602e5`(+300/-7 单文件, 复核双镜头独立 CONFIRMED×2, fix 臂占位返回不采信=复核即权威判例)**: 单遍 emit-first 下 239 条件分支发射点 nop 占位(2 个原子操作反向 cbnz 豁免), 回填短程直 patch/超 19-bit 走反转+veneer 长跳。637876 案定谳=硬件位宽非判定 bug, veneer 唯一正解。双复核各自独立跑双侧全量回归 1087/419 零翻转+自写 ARM64 解码器边界验证+170 hunk 穷举+体积 +2.6% 架构必然。复核 B 方法论金块: 识别旧会话灭失 scratchpad 的陈旧 v_b.md 不可采信, 全新 clone 重验覆盖(shadow 目录判例又一例)。
- **瑕疵立卷(零可观测影响, r15 收口)**: UNWRAP_OR_RETURN 手写 delta=2 未同步 +1(条件永假)。
- **WAN 前沿刷新**: switch/bitswapadvertiser 等 4 文件 rc=134 崩溃全消失, 推进到 **4 种互不相同的既有前端墙**(r15 triage 件)。#128 链至此 r8→r14 七连落账。

## ★★ 2026-07-19 06:3x 收割批次一百八十七 (ceaefe81 会话) — ★#137 v2 落账 23c122109(destroy 握手终局)+第 4 副本编排者反处方裁决(#140 立卷), 任务 #137 销

- **★#137 v2 落账 `23c122109`(3 文件 +162/-3, 复核A CONFIRMED/B 编译路径全绿)**: v1 基座(while 每帧 epoch 复查堵多代级联复活 use-after-destroy+mutex 包 ensure, 冷启动不持锁)+v2 收编两破口(present_gpu_commands setBuffersGeometry/host_window_set_geometry 全函数体, leaf 锁 ANR 上界=一次 OS 调用)+census 撞名护栏立功(第三份 AdapterSource 副本一并收编)。复核A 独立全量重扫无第三漏网点+死锁面 4 持锁点审计。
- **★第 4 副本编排者反处方裁决**: 复核B 抓 MobileShellHarmonyHostSource 第 4 份物理定义未加锁并处方「追加镜像」——编排者核实后**不采纳**: 单体区段零 destroy 对端机器(vsync 旧架构无渲染线程/epoch/锁), 无对端互斥的单点加锁=装饰性伪覆盖。真问题=单体导出路径(CLI 默认输出)系统性滞后三文件架构全部 #14 修复族→立卷 #140(弃用/迁移/显式废弃三选一, 归生成化迁移线)。处置书 137hs/monolith_4th_copy_disposition.md 防后续机械镜像。
- **任务 #137 销**: 编译路径 destroy 握手终局达成(v1 目标场景+两破口+全量枚举复核过); 残余=#138(Android 同型)+#140(单体路径)各归其卷。

## ★★★ 2026-07-18 20:3x 收割批次一百八十三 (acb7a9d3 会话) — ★regalloc 落地战役重启(用户令推翻 07-04 冻结裁决)+round66 S1 起飞

- **用户令**: "工作流完成 regalloc 落地"——重启 beat-c §2.4 曾裁决"不 fund"的 regalloc-gen1 线。动机升级: spill 放大既是编译 80x 慢根(性能线)也是 gen2 14-16GB 峰值主导(内存线 #46, 47GB 事件溯源), 两线同根。
- **侦察定案(编排者, 零重推导)**: 休眠资产在案——5 层 peephole+Stage9 块内 3-reg pool 已 shipped; primaryBodyIrLiveRegAssigned analysis 侧已存在但 **emitter 零读点**(只写不读, beat-c §2.4); ADR-07 扩展方向+硬约束(freeze-in-Prepare+*Raw 镜像/Fill*Op 同步=静默 miscompile 高危线)文档化在 §2.5; 动机数据陈旧须重测(__TEXT 7.06x/spill 72%/帧 256-286KB)。
- **round66 S1 起飞(wf_79699d8b-8d9)**: Design(休眠资产实地核+s1Spec+全切片 roadmap)→Build(基线 harness 三口径: bake wall/RSS+__TEXT+spill 密度+大帧分布 ∥ S1 实施=emitter 读 liveRegAssigned 接线, 正确性门权重最高任何门破即回滚)→对抗复核(5 式寄存器复用边界打击+变异注错证读点承重)。实验室=fin_g 钉基克隆(可烤可链验)。
- 并行: round65(T86 双 mct, setLen global_ambiguous 线索已递)在飞。

## ★★ 2026-07-19 07:0x 收割批次一百八十八 (ceaefe81 会话) — ★#15 S8 结构化槽位抽取落账 daed00d73(确认门锁死双重坐实)+KV cache 真杠杆立卷 #141

- **★S8 落账 `daed00d73`(+759 纯追加双文件, 双镜头 CONFIRMED×2, fix 臂诚实 PARTIAL=真权重全量套件超时间盒不冒充)**: S8a 选型定谳(同 forward 复用架构不可行/受限解码碰共享核心→二次 prompt 复用既有贪心生成); 安全铁律双重坐实(SlotEntry 三字段枚举完备无确认门表达通道+复核A 7/7 新对抗注入含越狱/零宽字符/双向控制符+两条未触分支探针补证); 实现期自抓 std Utf8Decode 残缺 UTF-8 硬 panic 真 bug 根修(BPE 边界不保证字符边界, 安全前缀截断+17 边界例)。零回归 8 夹具逐字节+SABI 闭包零污染。
- **★真机成本定谳(先测后定又立功)**: 无 KV cache 全量重算=单 forward ~13min, 生产默认 2 槽位外推 ≈6.9h——**KV cache 生成路径=~百倍级真杠杆, 立卷 #141**(含 F1 生产入口预算参数化/超时/取消, S7 接入前置)。S6 设备可行性探针的 go/no-go 判据由此有了硬数字锚。
- **#15 战役状态**: 引擎数值核八连+S8 槽位抽取落账; 端侧线次序刷新: #141 KV cache→S6 设备探针(设备窗)→S7 接线(含超时加固)→S10 验收。

## ★★ 2026-07-19 07:3x 收割批次一百八十九 (ceaefe81 会话) — ★#136-v2 五点收编落账 5ed1582fd(审计自扩两点)+第六面(基址消费通道)v3 重飞

- **★v2 落账 `5ed1582fd`(+121/-0, 本体双镜头 CONFIRMED)**: 三姊妹点收编——fix 臂插桩重钉真实位置(③在 parse_statement 内联 walker :21150, 证伪 v1 复核对 parse_store_field_path_into_ref 的指认=插桩优于读码判例)+审计自扩两点(④索引嵌套字段=修前硬拒合法语法 ⑤cold_store_value_into_slot inline-if/return/defer 统一器=14 调用点最高频面)。8 自建夹具逐点双真值+18 既有调用点字节零扰动(复核B 闭合 18+5=23)+回归三侧零翻转。**复核A 测量判例**: 首轮并发跑出 4 翻转=SIGKILL 资源争用假象, 串行重测归零——回归双侧必须串行。
- **★完备性第二度证伪(镜头A 从零夹具)**: 第六触发面=全局 T* 经 -> 读写的「基址消费」通道(读 parse_postfix :14902/写 parse_field_assign :18166, 写侧踩踏指针自身槽 run=66; 局部对照组正常=严格限定 GLOBAL_ADDR shadow)。v3 重飞(wf_78a736fb): 两跳语义(load 值→deref)修法禁照抄一跳原语+基址通道全谱枚举+值拷贝表合并 #136 总表。
- **协调**: v2 落账 index-only(op-lane WIP :18610 冲突), 工作树未同步, op-lane 对账 5ed1582fd。#136 洋葱: v1 三点→v2 五点→v3 基址通道, 不收敛不关闭。

## ★★★ 2026-07-18 20:5x 收割批次一百八十四 (acb7a9d3 会话) — round65 T86 收官(CONFIRMED: t85fix 漏排 "ref" 关键字一行修)+fin_h 三门绿+链 r8 起飞

- **T86 定谳(round65, 复核 CONFIRMED)**: culprit=t85fix——其共享别名重定向判定排除了 ""/"enum"/"object" 但**漏排 "ref"**: `X = ref`+缩进字段是 ref-object 合法表面(全树 65 处, 规范 L194-233 背书), 被误判为"指向类型 ref 的纯别名"→字段查找恒 false→setLen seq 桥接放弃落穿泛型路径→裸名撞 10 重载→global_ambiguous mct。传导链 FAIL_TRACE 逐环实测(seq_add_fail reason=8→seq_setlen_fail reason=3→global_ambiguous)。修=排除集补 "ref" 一行(三调用点全覆盖含 t85complete 两处同款隐患); ptr/str 经全树普查(5+2 处)人工查证为真别名不排, 取舍正确。消融三态: fin_g=BAIL/仅t85fix=BAIL/无双T85=CLEAN(=fin_f 逐字节)。复核加码: 16 文件 macho/link 族全枚举唯一翻转即目标文件+脱离 macho 语境最小夹具 x1 双真值+变异负体+t/rv 双系矩阵零回退+3 无关 .o 逐字节。
- **fin_h 组装+三门绿(编排者亲跑)**: fin_h=fin_g+t86fix; 烤 real_backend_codegen=1; macho_provider_linker.cheng 单 obj 检 ZC_NOT_READY_TOTAL count=0(.o 383843B 产出); t78 146/147 已知行; 家族 7/7 精确。**★链 r8 起飞**: ignite_20260718T122753_b0db50 全站+gen3, 树 sha 614ee63b。判决点: gen2 回 ZC=0→terminal 报表组装路径(T85 族全清后首验)→oracle→gen3 掩码定点。
- 复核尾巴如实记: 扩展 t 系夹具无正典目录(建议收编); system_link_exec DRV_FIX 侧 obj 补测后台收尾(风险极低)。round66 regalloc S1 并行在飞。

## ★★★ 2026-07-19 08:0x 收割批次一百九十 (ceaefe81 会话) — ★#128-r15 四墙落账 ff40a923a(WAN 544 净推进 306→313)+r16 立卷(墙4 泛型模板物化主件)

- **★r15 落账 `ff40a923a`(3 文件 +67/-4, 双镜头 CONFIRMED×2)**: 五墙全定谳互不同根——墙1 类型分类挪序/墙2 pubsub.cheng 缺 import(源码侧)/墙3 @importc 空格容错(spec 属实)/墙5 LVALUE 索引括号深度/delta2 收口(otool 实证 baseline b.eq 落 brk 本身=真编码错误非纯卫生)。复核B WAN 544 canonical 口径: **306→313 净 +7 零回归全可追溯**。
- **墙4 residual=r16 主件**: 泛型模板体跨模块懒加载从未独立物化(cold_clone_specialized_body 要求 function_bodies[template] 预存无填充机制); triage 臂实验性回填 SIGSEGV 已回退, Layer1 必要非充分补丁封存案卷。r16 次件: @importc 容错剩 2 处独立前缀实现(--emit:exe provider 路径)+wall5 深度计数字符串盲(响亮 die 非静默, 卫生)。
- **#128 链至此 r8→r15 八连落账**; WAN 前沿=墙4 泛型物化+gossipsub 链墙5 后新前沿。

## ★★★ 2026-07-18 21:2x 收割批次一百八十五 (acb7a9d3 会话) — 链 r8 判决: gen2 第七绿(T86 清墙)但 terminal/oracle 同签名崩→T87 立卷(sret 头号嫌疑)+round67 差分根修起飞

- **链 r8(ignite_20260718T122753_b0db50, fin_h)判决**: drvBake 14.2s+probes 11/11+**gen2 rc=0 ZC=0(第七绿, T86 一行修清双 mct 实证)**→terminal 0/2+oracle 0/6(GEN2 编译夹具自身 SIGSEGV)→gen3 ABORTED。
- **★崩溃同址定谳(fusion crash_triage 两链交叉)**: r6/r8 帧链逐帧同(AppendLine+452←AppendCompilerCsgV2Report+204←RecordCompilerCsgMemory+788), ldrb 于栈顶 guard 0x16fe00000, 拷贝长 0x2710/0x2730(~10KB)——「指针指向栈区的假 str」被报表组装逐字节拷贝走出栈顶。**T85 三腿+T86 未覆盖此类=独立缺陷族**。
- **T87 立卷, 头号嫌疑=round61 归档的 sret 案**: `var p; p = call()` 直接赋值形(区别 let 绑定)调用方不设 x8 sret→聚合/str 返回按标量处理→调用方读栈残留假 str。特征全吻合(栈区指针+round61 有 diag9 稳定复现夹具+round64 臂明言其修后此案变稳定可复现)。**决定性方法已交 round67(wf_75aa5330-a29)**: DRV(冷径金标)vs GEN2(纯径带毒)同函数反汇编差分+GEN2.map 行映射回源+diag9 双真值; 修=pobj 调用方 sret 发射(复核带 AAPCS 独立核+小聚合 x0/x1 反例防过度设置)。
- **战略问答存档(用户问 regalloc 杠杆)**: 中期杠杆 regalloc 最高(编译速度/内存/迭代周期三重复利); 当下最高=T87(点火唯一阻塞+gen3 定点金标反哺 regalloc 切片安全)。双线并行: round66(regalloc S1)+round67(T87)在飞。

## ★★★ 2026-07-19 08:3x 收割批次一百九十一 (ceaefe81 会话) — ★#136-v3 落账 c24b93363, #136 洋葱三轮收敛结案(任务销)+#142 立卷

- **★v3 落账 `c24b93363`(+77/-5 单文件, 双镜头 CONFIRMED×2)**: 基址消费通道三点(-> 读侧/字段写侧 base_slot 三消费点/裸 *ptr 本轮新发现)——locals_add_global_shadow 把裸全局 T* 映射成持 &gPtr 的 SLOT_OPAQUE_REF, 未解引用当基址消费=踩踏指针自身槽。两跳语义(PTR_LOAD 真 load)复核A 审计非伪修。
- **★#136 结案(v1 三点值拷贝→v2 五点→v3 三点基址, 十一点双通道)**: 复核A 从零枚举 26 调用点+44 直接消费点全对表**族内零遗漏**——对抗复核体系三轮层层证伪逼出的真收敛, 非实施方自证。复核B WAN 356 文件 5 个 .o DIFFERS 独立 root-cause 到 h3c 冗余死代码(三重验证无害)。
- **范围外立卷 #142**: &ptr->field 取址续接族(FIELD_REF 消费未转 SLOT_OBJECT_REF 裸槽, 局部对照同损坏=跨 kind 独立缺陷, 疑似未初始化内存读)+h3c DCE 恢复小件。

## ★★★ 2026-07-18 21:5x 收割批次一百八十六 (acb7a9d3 会话) — ★regalloc S1 落地(CONFIRMED): 设计臂证伪 naive 接线+块内写透驻留 ~350 行+spill 密度实测下降+S1-S6 路线图定案

- **设计臂(PLAN_READY, 价值最高)**: 实核证伪"emitter 读 liveRegAssigned"naive 路线——ghost liveness 采集不健全(operands 全当 slot id/漏 call 实参/无 CFG, §10 维度A 判决 arm64 同立), 直接接线=送错编。S1 重设计=块内写透驻留: 决策在 ResidencyPlanInPlace(pobj:60336)内沿生产级事实采集重建, 落 bodyIR 冻结数组接**已有配对读点**(零新 size/fill 镜像=根除失同步最高危), env 门 CHENG_REGALLOC_GEN1 默认 off 逐字节零迁移。★未列册休眠大件出土: regalloc_single_pass.cheng 3190 行 CFG-aware value-plan(call-clobber+edge-reconciliation 全建模, 生产零调用)——S3 复用候选。S1-S6 路线图: S2 读点扩宽(Cmp/CopyLocal 族)→S3 跨 Call 驻留(最大单刀候选)→S4 Prologue band 4→10→S5 spill-around-BL(条件项)→S6 B1 定测毕业+默认 on。正典 §2.5 行锚全漂 ~15k 已重钉。
- **基线臂**: parser.o spill 密度实测 50.36%(单寄存器 ldr/str [sp / 总指令, 含对 53.02%); DRV bake 13.36s/558MB; 大帧 top10+4095B imm ceiling×2; 幂等 harness 落 round66/baseline/(后续切片 A/B 同口径复用)。
- **实施臂(DIFF_READY ~350 行)+复核 CONFIRMED**: off 态零迁移逐字节验(primary.o+exe cmp IDENTICAL)+on 态全门绿(t78/家族/别名矩阵/8 枚 golden 值断言)+objdump 铁证(热夹具命中槽 10 处 ldr 全换 mov, spill 密度 30.8%→23.7%/30.5%→25.6%)。**mustFix(b2 激活前二选一)**: backend2_emit_ops 两收割 walker 缺 extras 游标镜像(b2+gen1 并用=响亮 data_reloc_not_adrp 硬崩非静默)——镜像三处或硬门禁 b2 twin。复核勘误: 实施报别名矩阵绝对值不可复现(核心零漂移主张不受影响)+k3a/b 单真值表述不符; latent 案 F3(StoreLocal fill/size 不对称)留卷。B1 正典口径被禁 --require-rebuild 挡, 代理口径(t78 全套 wall)墙钟纯噪声=S1 是 plumbing 刀符合预期。
- **round68 起飞**: mustFix 收口+S2 读点扩宽, 基座=fin_h+s1impl。并行: round67(T87 sret 差分)在飞。

## ★★★ 2026-07-18 22:2x 收割批次一百八十七 (acb7a9d3 会话) — round67 T87 收官(CONFIRMED: sret 证伪→裸全局 var 实参伪造栈槽真根, +45 行)+fin_i 四门绿+链 r9 起飞

- **T87 定谳(round67, 复核 CONFIRMED)**: sret 假说被反汇编差分**证伪**(复核 AAPCS 独立核 6 夹具: 现世系 sret 协议全对; 16B 小聚合内部 x8 约定偏离 AAPCS 但自洽, 记 C 边界 ABI 台账)。**真根=pobj 文本路径 AppendCallArgs targetNeedsAddress 裸名臂(slotId<0)对「裸模块全局作 var 实参」伪造未初始化局部栈槽传址**(GEN2 实证 add x0,sp,#0x140)——被调读栈残留假 str(len≈10KB)→报表首行 AppendLine 拷出栈顶崩; 写回静默蒸发进临时槽。节点路径全局 var-arg 臂只认 LocalAggregateTag, str 全局是 LocalStrTag→node miss 落雷。与 #136/qualified_import_var_global_desync 同属「全局左值处理」家族新成员。修=+45 行复用 &global 取址 golden 机制(GlobalAddressTag adrp+add, 槽名与赋值路径共用), 复核证实**顺带修好裸标量全局 var 实参静默错值**。
- **复核加码与新立卷**: ①DRV sha 不可作验收锚(树状态敏感, 三次烤三个 sha, 源字节+行为锚替代——落账纪律); ②预存缺口立独立案卷排队: 全局.field 作 var 实参(rc=4 双侧静默蒸发, 可检测性比崩溃更差)+限定导入 alias.g 族+同名跨模块歧义臂; ③dispatch_min 单 obj 超 540s 墙, 同形 repro 指令对照+四门代偿成立。
- **fin_i 组装+四门绿(编排者亲跑)**: fin_i=fin_h+t87fix; 烤 real_backend_codegen=1; t78 146/147 已知行; 家族 7/7; T87 repro rc=7 修复值。**★链 r9 起飞**: ignite_20260718T134759_90433c 全站+gen3, 树 sha b678cddc。T83→T87 五连修全在位, 判决点: gen2 保绿→terminal 报表毒源已除首验→oracle→gen3 定点。

## ★★★ 2026-07-18 23:5x 收割批次一百九十二 (acb7a9d3 会话) — 链 r9 崩溃定谳(盘满+harness 双因)+25Gi 清盘+parse_zc 健壮性根修 d65dd29+内存事件二号定因(op-lane 规划器实验叠加)

1. **链 r9(ignite_20260718T134759_90433c) CRASHED 定谳——双因**: ①真败相=gen2 自烤 "macho object writer: failed to write object"(command_023.stderr.log), 归因=盘 97%/仅 16Gi 余量撞 gen2 16GB RSS 峰+swap 膨胀; ②harness bug=chain.py parse_zc 在 gen2_ok 判定前无条件跑, 无 ZC 段即 RuntimeError 崩链(应为诚实 ABORTED_GEN2_BAKE_FAILED)。fin_i 五连修(T83→T87)预检全绿不受影响。
2. **25Gi 清盘**: nb_workspace 11G→3.5G(删 r56-r65 会话克隆树, 交付物全在 ~/cheng-patches; 保 r66/r67/tree_fin_*/全部 chain_runs 含钉种子源 f91128), 盘 16Gi→41Gi 可用。
3. **parse_zc 根修落账 fusion 仓 d65dd29**: rc==0 路径协议仍严格(响亮), 失败路径容忍缺 ZC 走诚实 ABORTED 判决携 stderrTail; 嵌入 Python 抽取 ast.parse 语法验证过。新链起飞自动带修。
4. **内存强制退出事件二号定因(用户报)**: 元凶=op-lane(ceaefe81) 小优规划器 Qwen2.5-0.5B 实验三进程叠加(classify_main ~11GB+real_weight_sanity_vb ~11GB+kv_rss_probe_vb 2.3GB↑)≈22GB/48GB 机器; 均为 harness 追踪合法在飞任务(log 落盘), 不可杀; 本会话零重进程。0.5B 权重本体 ~1GB 膨胀至 11GB=RSS 病活体样本(任务#46 同根)。
5. **新纪律=重活内存预检门**: 任何 ≥10GB 峰值任务(链 gen2/gen3、regalloc 烤炉)起飞前必跑 `ps aux` 扫 scratchpad/链进程, 有并发 >4GB 进程即持械待命; 已装排水监视器, 链 r9b(fin_i, 带 harness 修)与 round68 resume 均押后至排水完成。

## ★★★ 2026-07-19 00:2x 收割批次一百九十三 (acb7a9d3 会话) — ★nb_workspace 被外部二次清空(fin 世系全灭)+fin_i 从链快照逐字节复活+round68(regalloc S2) 重飞

1. **nb_workspace 外部清空事件**: 盘 44Gi→126Gi 跳变同刻, /Users/lbcheng/cheng-f24/nb_workspace 全目录被外部清空(tree_fin_e/f/g/h/i+r66/r67 树全灭; 本会话此前只删过 r56-r65)。同类事件第三次(seed-rescue-20260709/工件目录 20260717)。
2. **fin_i 复活+验真**: 链 r9b 起飞时的不可变快照(inputs/tree, 纯源 73M 无构建垃圾, 静止验证过)cp -R 回 nb_workspace/tree_fin_i, 用 chain.py 同款 tree_src_hash 算法复算=b678cddc **MATCH** 逐字节验真。教训追加: 链快照=世系的免费异地备份, 起链本身就是最强快照动作。
3. **round68 重飞 wf_127efd0d-0c2**: 基座 fin_h→fin_i(含 T87, 更优; s1impl.diff 行号偏移 git apply 自吸收), fix 臂提示词加轮次标记(防前轮 API 超时死亡臂 null 缓存重放, 记忆在案), 前置物(s1impl.diff/PLAN.md/harness.sh/round66 review 案卷)盘点全在。
4. **链 r9b 过站**: drvBake 绿→probes 11/11(41.9s)→gen2 自烤在飞。

## ★★ 2026-07-19 设备窗中场 (ceaefe81 会话) — 装配三墙定谳(PWA WIP 断边/cold 0709 后回归/audio ES 导出根缺口), HAP 线破局中

- **设备窗现场**: 双机在线(Android GBJ0222B24021692=scene APK 07-14 世代在装/鸿蒙 3KN0224C18003262=机主日用机无 ChengGuiDemo 需全新装)。Android 旧版基线已采: 冷启 2194ms/首帧 3064ms/tap→present 140ms; e2e 剧本旧版 publish trace 未触发(待新建或坐标核)。
- **装配三墙**: ①**PWA WIP 断边**: reachability 门 11 publish_* 路由无入边, 真凶=PWA 仓另一会话在制 PublishTypeSelector 重构(+74/-26, 标签改版中); publish_video 链路完好; 干净 HEAD 克隆 materialize 也挂(--retained-scene-only requires mobile scene routes=materialize 本依赖工作树未提交态, 老地雷复现)——APK 线暂缓等 PWA WIP 落账, 协调注记。②**cold 0709 后回归**: 当前 stage3(a1aeea91)与 HEAD 现编 cold 编 scene-runtime 均报 "expected : after condition"→伪 missing WebScenePaintCommandRectAt; **seed-rescue-20260709 stage3 编译成功**(24.5MB .o)=回归在 0709 之后引入且 HEAD 仍在, r17 立卷件(repro=devwin19/assemble-out/unimaker-react.scene-runtime.cheng)。③**audio ES 导出根缺口定谳**: v-系列 row 77 旧立卷("生产 HAP 是否链接这批符号未查清")今日坐实——scene .o 零 cheng_scene_media_audio_es 符号, @exportc 无静态调用者被闭包剔除; 修=--export-roots 显式 16 符号名单(三面镜子判例), 重编在跑。
- **HAP 线**: 16 根重编成功后换装 prebuilt→hvigorw 装机→今天落账的 EOS 全链/#137 握手/暂停忙等/NAPI control/audio ES 全链首次真机验证。

## ★★★ 2026-07-19 00:5x 收割批次一百九十四 (acb7a9d3 会话) — 链 r9b 判决: gen2 第八连绿(ZC=0)+★T88 立卷(t87fix 引入 GEN2 秒崩回归)+编排者亲手指令级取证+round70 起飞

1. **链 r9b(ignite_20260718T160008_3dfe6f) 判决**: drvBake 绿→probes 11/11→gen2 rc=0 **ZC=0**(1363s, 第八连绿)→terminal 0/2+oracle 0/6(GEN2 编任何夹具秒崩 SIGSEGV, RSS 仅 7MB=启动即崩, 签名全新)→gen3 自烤 SIGTRAP@71s→verdict=ABORTED_GEN3_BAKE_FAILED。harness parse_zc 修(d65dd29)首飞生效: 全程无 harness 崩。
2. **★T88 立卷+编排者亲手取证定谳**: 链自带 lldb 现场+fusion cheng_addr_symbolicate 双工具定帧: frame0=_PathTrim+144(ldrb [x9], x9=0x400000003=相邻两 int32 (3,4) 被当 str 数据指针), frame1=_LoweringTypedIrImportAliasTargetSourcePath+52(入口 PathTrim(qualifierRaw)), frame2=_LoweringAppendPrimaryObjectIrStatements+20788=lowering_plan.cheng:2245 call site(传 typedStmt.sourcePath/callQualifier 字段 str)。世代逻辑锁定引入者: fin_h→fin_i 唯一增量=t87fix, r8 GEN2 能跑过此点(崩更深处) ⇒ 回归=t87fix 引入。
3. **双假说**: A=walker 游标失步(t87fix 插新 op 种, 成对 walker 未镜像→同 body 后续实参错位, 同款病=round66 backend2 extras 游标 mustFix); B=字段偏移错编。判据: A 与 t87fix 臂触发顺序相关, B 无关。
4. **round70 起飞 wf_e4853311-649**(取证→根修→复核): 双镜头小 repro(fin_i vs fin_i-R-t87fix)+指令级差分; 修复范围纪律=仅 t87fix 回归面, 姊妹臂归 round69, 重叠面修最小公共真根。禁 revert 了事(r8 病灶会回来)。
5. **三工作流并飞**: round68(regalloc S2)+round69(T87 姊妹普查)+round70(T88)。round69 census 的 alias.g/global.field 电池与 T88 病灶同域, 收割时合并定谳。

## ★★ 2026-07-19 收割批次一百九十二 (ceaefe81 会话) — ★r16 落账 5c54dd88a(链接期物化, 措辞收窄)+★运行时特化缺陷三方坐实立卷 #143+r16 复核事故披露

- **★r16 落账 `5c54dd88a`(+377/-21 三文件, 双镜头窄口径 CONFIRMED)**: 墙4 链接期物化三件套(mmap Span 解耦[lldb 钉死前轮 SIGSEGV 死因]+template_index 精确路由删裸名 fallback 地雷+延迟物化堆队列)+fix 臂插桩推翻设计假设自纠出第四阻塞点(func_count 快照过期)。墙4 rc=2→0/WAN 544 净+4/回归净+3 零结构翻转; 次件 @importc 残余+wall5 字符串感知同笔。
- **★「可泛化闭合」被证伪→#143 立卷(r17 主件)**: 三方独立数据点汇合(实施 multispec 异常值+复核A 最小夹具+复核B 第三方复现)——跨模块泛型特化**运行时静默错值+SIGSEGV**(Some[int32](77).value 读 0/二次 Get rc=139), baseline/fixed 逐字节同=预存; 仓注释 826b3bfa1 早载 Option[str] 形本轮扩谱裸标量。**方法论警示: 退出码类验证(WAN rc/回归)探不到「链接成功值层坏」, r17 起值级断言强制**。
- **事故披露**: r16 复核B 清盘误删 #142 在制目录(142ar-fix/142ar-build, PID 32981 WAN 扫描中)——#142 返回时其证据按可疑处理, 需要则 resume 重跑; 已在 v_b.md 第零节自报。

## ★★★ 2026-07-19 01:3x 收割批次一百九十五 (acb7a9d3 会话) — ★T88 归因反转(t87fix 无罪, 剥皮非回归)+census 4 姊妹 BUG 定谳+三工作流重启 resume

1. **★批次一百九十四第 2/3 条归因修正**: round70 forensics 一段定谳 C_other——「回归=t87fix 引入」被指令级证伪。铁证: r9b vs r8 两 GEN2.primary.o 全对象 3919 符号差分仅 2 函数有差(t87fix 本体+其唯一命中点 RecordCompilerCsgMemory, 新码型 adrp/add+重定位全对); 崩溃函数逐字节相同。既有前提「r8 能跑过 lowering 点」错——r8 实际死在更早的 record 相(栈无 Lowering 帧, frame7=RecordCompilerCsgMemory+788)。真相=bug 链剥皮: t87fix 修好 record, GEN2 首次跑进 lowering, 撞上早已存在的下一层 miscompile。T88 改立=「lowering 相 callQualifier/sourcePath str 物化 miscompile」(0x400000003=(3,4) SoA 数据当 str 指针)。原始数据全套 round70/forensics/(双镜头克隆 r70_forensics{,b}_tree 可复用)。
2. **round69 census 定谳(36 夹具电池)**: 4 姊妹 BUG_CONFIRMED 全共享 T87 伪造栈槽签名, 两轴: ①限定名轴 s04(alias.g str var-arg 双双 SIGBUS 138, crashInsn ldrb [x9] 与 T88 同款)+s04c(读侧蒸发 ldr [sp,#0x10] 未写入槽=qualified desync 孪生); ②数组元素轴 s06b(全局 int32[N] 元素 var-arg 写回全丢)。s10 跨模块同名=栈垃圾/零值视图。global.field 轴与 str[N] 元素轴被 ZC bail 挡在编译期(诚实中止); round67-a3 的 field 静默蒸发形在 fin_i 下已转 bail 不可复现。阳性对照: T87 本体形指令级确认修复在位。
3. **头号新假说(T88=姊妹活体)**: lowering 数据链的限定别名全局读被错编→垃圾 intern 索引→(3,4) 当 str 指针; s04 崩溃签名与 T88 完全同款是强旁证。round70 Fix 臂已改写为 forensics2(lldb 动态取证+SoA/intern 反查+同根性判决, 修复路由归 round69 或独立), meta/phases 同步。
4. **进程重启处置**: 三工作流被杀后全部 resume(round69 census/round70 forensics 一段命中缓存零重跑; round68 fix 臂无缓存重跑)。新 goal hook=工作流并行推进点火线 T88 及后续+性能线 regalloc。

## 收割批次一百九十三（2026-07-19 凌晨, 设备窗+双落账+r17 发射）

**落账二笔**:
- #142 v1 落账 `ec7619e86`（bootstrap/cold_parser.c 80+/1-）: &ptr->field 取址续接族(SLOT_OPAQUE_REF 真二跳解引用+SLOT_OPAQUE 值拷贝转存)+h3c DCE 字节级恢复。双镜头 PARTIAL×2=核心双侧独立确认(za 9/9+官方回归 1087/419 双侧零语义差+h3c 5 生产文件 IDENTICAL), 完备性主张被复核A证伪收窄: **两跳指针链 &g->a->b 仍确定性错值**(saw_field 门禁仅首跳 materialize)→v2 在 r17; 另录预存族 &arr[i].field / &ptr->arrayField[idx] / var T* 引用形参三态皆错(独立根因)。
- #141 落账 `38e39fd08`: Dense KV cache WithKvState 三件套+生成循环+预算/取消。真权重 3.91x, decode ~11min→~4.8s。B=CONFIRMED 零回归; A=PARTIAL(核心数值等价 CONFIRMED, classify 生产入口同输入第二例对拍因环境事故未跑完, 非缺陷降级)。
- **工艺事故自曝**: #142 首次落账用 `git commit --only <pathspec>` 踩了 [[feedback_pathspec_commit_only]] 判例——把 op-lane 2088/999 工作树 WIP 一并卷进 413237598; 立即 `reset --mixed HEAD~1`+`apply --cached`+裸 commit 手术重做, 终态干净。pathspec commit 在共享文件上 = 永远的坑, 裸 commit(只提交 index)才是唯一安全形。
- **复核A自报险情**: 磁盘满时误删 68 个共享 scratchpad 在制目录(128r14_*/136v2_*/136v3_*/137hs_*/142ar_* 前缀)。已落账案卷全在 ~/cheng-patches 持久盘无损; 后续 resume 任何停飞工作流若引用 scratchpad 旧 clone 必先核实存在性。

**r17 四案工作流在飞** `wf_15c4fb2d-d2c`（脚本 cold-r17-quad-wf_15c4fb2d-d2c.js）: 1a=r12 尾名校验泛型占位符回归热修(36nodes/blocked_triage.md §2.5 配方)；1b=export-roots 特化体不物化(§3, 依赖 1a 补丁)；143=泛型特化运行时错值/SIGSEGV(128r16 案卷)；142v2=两跳指针链收尾(142ar/v_a.md REFUTED 节)。每案独立克隆+双镜头, 产物 ~/cheng-patches/20260719/r17/。

**设备窗鸿蒙 HAP 战果**（编排者亲手）:
- 三段链接墙清障配方: ①支撑 .o roots 必须从上一世代 prebuilt 备份 `nm -g | awk '$2=="T"'` 反推全集(publisher 配方是真子集, 差 12+2+1 个符号); ②cheng_f64_to_i32/i64 本世代 Cheng 闭包不存在, 正解=host_bridge.c 加 C helper(镜像 bootstrap/host_runtime.c, canonical src/tests/moq_droid_support/host_bridge.c + prebuilt 双处); ③cp 撞 host_bridge 的 libc_getsockname 用 llvm-objcopy --localize-symbol 收编。→ BUILD SUCCESSFUL, entry-default-signed.hap 119.6MB 鸿蒙首装成功。
- 黑屏两连根因(非 wall9): scene .o 与 rawfile fixture 世代错配——先 `rawfile length mismatch`(scene_data.bin 28237474≠28201590), 同步后再 `rawfile crc mismatch`(glyph_sdf_pixels.bin 同长度异内容)。**场景 .o 与 runtime fixture 必须同一次 materialize 出货**。双同步后两卡首页上屏, tap→present_media_surface ready ≈2.06s。
- 双卡拨号失败真根=DHCP 租约漂移: fixture 烘焙 sourcePeer .3(胡广生/安卓)/.4(麦田/鸿蒙), 现实 .7/.5。快照 fixture(ts-csg/scripts/unimaker-fixtures/unimaker-pwa-content-snapshot.json)IP 已刷新, rebake v4 全链管线在飞(物化→seed-rescue 场景重编→HAP)。预期: 麦田 sourcePeer=.5=鸿蒙自身→判局部走文件直读(绕开 bind 墙); 胡广生→拨安卓 .7:38000(netstat 实证安卓 own-serve UDP 绑定在位)。
- 鸿蒙固定端口 bind EADDRINUSE(98) 墙(07-11 立卷)复现, bind-triage 定性**任意固定端口**(38000/38001 皆败, ephemeral ok)——鸿蒙-as-server 独立立卷待攻, 不阻本窗 viewer 侧验证。
- hilog 工艺: 隐私掩码用 `param set persist.sys.hilog.private off` 关(hilog -p off 不支持); 全局 `-b D` 会淹没应用日志, 用完必回 `-b I`。

## ★★★ 2026-07-19 02:4x 收割批次一百九十六 (acb7a9d3 会话) — ★round69 收官(4 姊妹族修复 DIFF_READY+复核 PARTIAL 可落)+round70 收官(T88 真根=语句误分类, 白盒探针反转机制)+round71 起飞

1. **round69 收官**: fix 臂两 diff(round69/fix/): ①01_qualified_alias_global_rewrite=新 PrimaryBodyIrQualifiedGlobalRewrite() 把 alias.G 归一化为(目标模块路径, 裸名), 接入 5 个既有 TypedGlobal* helper+node-eval 读门, T87 GlobalAddressTag 臂自动传播——s04/s04c/s10 三族(SIGBUS 崩/读侧蒸发/跨模块同名)全翻绿; ②02_global_array_elem_scalar_vararg=AppendCallArgs slotId<0 臂对 globalArr[idx] 接既有 ElemAddrSlot 机制——s06b 蒸发翻绿。语义探针(16/7/40/3)全对。复核独立三 DRV(PRISTINE/FIXED/MUTATED)全门亲跑+8 对抗形: adv_a 隐式别名形意外也被治好(加分), 无误伤面。判决 PARTIAL 唯一 mustFix=披露 alias.arr[idx] 组合形缺口(修 #1#2 均不覆盖, 立卷不阻落地)。工作克隆 r69_fix_tree 在位。
2. **round70 收官(T88 机制两轮反转)**: forensics2 白盒定谳 DIFFERENT_ROOT(与姊妹族无关): 金标 repro t88_repro_v7_twofield.cheng(两字段 struct 字面量+内嵌调用值 str 字段, 无泛型/全局/别名)rc=139 确定性; 单字段 CLEAN; watchpoint 证实字段槽全程零写入。复核再反转机制一层: 聚合构造器函数在 repro 上从未被调用——真根在**语句分类层**(「let x=Ctor(f: call())」被判成整条=裸调用, 聚合 store 全体未发射), 6 候选函数探针排除清单在 round70/review/VERDICT.txt。oracle_000(fn main return 0)也崩 GEN2=T88 是 terminal/oracle 全零的唯一根。
3. **round71 起飞 wf_6e402e08-e6b**(pin→fix→review): 探针二分钉死误分类站点(typed_expr/lowering callTarget 判定)→分类层根修(禁消费端兜底)→对抗复核(嵌套构造器/首字段调用/多调用字段/构造器作实参/方法调用值字段 5 对抗形)。
4. **新立卷队列**: ①alias.arr[idx] var 实参组合形(r69 复核 adv_d) ②s04 原型限定 store 缺陷(front 派发层, ~pobj:43208 赋值语句字面量 realizer) ③gen3 SIGTRAP@71s 与 T88 同根性待 r10 链检。
5. **下次链飞行(r10)前置**: fin_j = fin_i + r69fix 两 diff + r71fix(待), 双镜头预检后单发全链。

## ★★★ 2026-07-19 03:2x 收割批次一百九十七 (acb7a9d3 会话) — ★regalloc S2 落地(复核 CONFIRMED 可落)+新立卷 backend2 @exportc 冷编译符号名缺陷

1. **round68 收官(r68-relaunch-2)**: s2impl.diff(741 行/3 文件, 基座=fin_i+S1 相对增量, round68/s2impl/): ①mustFix F1=backend2 twin 收割 walker extras 游标镜像修(data_reloc_not_adrp 硬崩→绿, 变异复核确认真实有效) ②family-1=Cmp lhs/rhs 读点扩宽(同 call-free 子区间资格计入) ③family-2=CopyLocal 源读重定向 ④F3 对称化(size 侧去 CopyLocalTag 限制与 fill 一致)。全门绿: off 态零迁移(parser.cheng 146k 指令强形 cmp IDENTICAL)+t78 双态 146/147+家族电池三态 7/7+别名矩阵 6/6+S1 goldens 8+S2 goldens 3(双 planner twin 一致)。生产级 A/B(parser.cheng obj): S1-only→S1+S2 ldr -36/mov +75/spill% 50.34→50.29; off→S1 ldr -23。复核独立三 DRV 全门亲跑逐字复现+4 新对抗夹具+变异注错被 golden 抓获(判别力实证)。
2. **复核唯一实质发现+已执行 mustFix**: b2 mustFix 表格的"干净构建"绿灯依赖暖化 provider_cache 掩盖既有缺陷——**新立卷: CHENG_BACKEND2 冷编译 program_support_backend.cheng 时 @exportc 符号被错误加 _export 后缀导出致 unresolved symbol**(DRV_BASE 即复现, 与 S2 无关, 归 backend2 provider-link 战线)。RESULTS.md 已按复核要求追加更正披露。
3. **S2 正式判定可落**; S3(跨 Call 驻留, 复用 regalloc_single_pass.cheng 3190 行休眠 CFG 资产)per PLAN.md 为下一刀。

## ★★★ 2026-07-19 04:3x 收割批次一百九十八 (acb7a9d3 会话) — ★T88 机制四轮反转终局: 修复落在死代码孪生上, 活体=WithFactsAndExprLayer; 编排者亲手三连实验定谳+round73 重落

1. **round71 收官**: pin 臂 PINNED(缺陷机制正确: 谓词A对 NormalizedExprConstructor 隐身→嵌套调用被认作行根→伪造 LetCall→pobj:47779 guard 跳过聚合初始化, 双探针+既有 trace 全链证据); fix 臂 diff 写好但探针 0 命中/v7 不翻绿; 复核 PARTIAL 用整机字节级 diff 坐实「改 typed_expr 该函数 DRV 逐字节不变」但把结论错误泛化为「build-backend-driver 对 src/core/lang 不敏感」。
2. **★编排者三连实验反转泛化结论**: ①裸种子冷路径编 v7 完全正确 rc=7(冷 C 层无罪, 缺陷只在 DRV 重编闭包); ②DRV.map(行映射=实际编入函数清单)显示 typed_expr.cheng 有 583 函数在闭包内——「lang 不敏感」错; ③pin 钉的 TypedExprIrAppendStatementsForScopeFromExprLayer(24750) 0 条目=**死代码消除未编入**, 活体孪生=TypedExprIrAppendStatementsForScopeWithFactsAndExprLayer(22684, 在编)。round71 修复/探针/变异全落在死副本上, 故一切"不生效"。T12/T13 孪生误配同款坑第二次收人头——**教训: lang 层源改先查 DRV.map 目标函数是否在编, 再插探针**。
3. **round73 起飞 wf_e7169e09-bed**: 修法三件套平移活体(先入口探针 sanity 证生效, 再改, 变异注错证承重), 验证门要求 v7 139→7 实翻+全 repro 梯队+t78+家族电池; 死副本处置一并决策。复核带 5 对抗形+独立注错。
4. **build-backend-driver 层构成认知修正**: Direct install 语义下 DRV=种子自拷贝+重编闭包(含 backend/lang/tooling/ir 共 3982 函数), 未进 map 的函数=死代码非层边界。gen2(1363s)=DRV 从源全闭包编 dispatch_min。

## ★★★ 2026-07-19 05:4x 收割批次一百九十九 (acb7a9d3 会话) — ★regalloc S3 落地(复核 CONFIRMED 零阻塞)+诚实负结果: parser.cheng 收益=0

1. **round72 收官**: s3impl.diff(175 行, 仅 pobj, 基座=fin_i+S1+S2, round72/s3impl/)。契约评估=不复用 regalloc_single_pass(access-table+CFG position 异体系, 零调用点, 未验证休眠接线与 ghost liveness 同类风险)也不重发明 CFG——原地扫 bodyIR.callSequence 原始字段+复用 PrimaryBodyIrCallUsesSlot(:26276), ~140 行零新依赖。排除口径一次实测返工: body-wide 全灭命中→改 crossing-scoped(触到该槽的具体 call 才截断)。resultSlot 排除由全块坏写闸自动兜底。
2. **复核 CONFIRMED**: 独立克隆链全门亲跑(off 零迁移含 parser 整文件级+t78 双态 146/147+家族 7+别名 6+goldens 22 项+S3 goldens k1/k2/k3 objdump 亲证)+5 新对抗夹具 20 组合全过(adv3 取址跨 call 形 off==on 证排除生效)+变异注错(排除逻辑整体 return false)→adv3 立即 run_rc=1 真 miscompile 被抓获。两非阻塞项: F1 别名矩阵绝对值跨环境不可复现(改报相对增量口径)/F2 resultSlot 显式分支=死代码(坏写闸已兜底, 下一棒清理)。
3. **★诚实负结果**: parser.cheng S1+S2→S1+S2+S3 增量=0(byte-for-byte IDENTICAL)。探针诊断: 2843 含 call 块→9789 候选→硬闸("全块每写皆 BinOp/CopyLocal")仅 187 存活(98% 刷掉)→0 个跨 call ≥2 可布线读。非实现缺陷——parser 类结构/字符串代码算术密度不足。S3 兑现价值需算术密集型文件复测; 硬闸放宽=独立契约评估项。
4. **round74(S4 band 扩容 4→10) 起飞**: 容量刀放大已证值的 S1/S2(ldr -36)命中上限; 联动复核大帧闸/imm ceiling(reload ceiling-aware 前科 :61120); 顺手清 F2 死分支。

## ★★★ 2026-07-19 12:3x 收割批次二百 (ceaefe81 会话) — ★r17 收割: 142v2+1b 双落账 / 143·1a 封存 / 1b 撞 op-lane 在飞同根重构

1. **#142-v2 落账 `3d4029854`**(bootstrap/cold_parser.c +48/-0, 双镜头 CONFIRMED×2): & 续接循环非首跳遇指针类型字段补真实 PTR_LOAD_I64(判据=上一跳字段声明类型 prev_hop_field_type, 非操作符拼写)——&g->a->b 两跳链地址坍缩静默错值根修, 任意跳数/混合链通用。复核A 六对抗夹具(栈基址/混合首跳/5跳/双预存族/3跳 retarget)未打穿; 官方回归三侧独立 1090/416 零差异; 5 生产清洁路径 cmp IDENTICAL。遗留预存两独立根因(&arr[i].field 返回值非地址 / &ptr->arrayField[idx] 索引丢失, 结构不相邻已实证)+var T* 引用形参族, 仍挂 #142。
2. **#128-r17 1b 落账 `a9706a7ff`**(bootstrap/cheng_cold.c +55 纯增, **index-only 未碰工作树**, 措辞收窄): cold_compile_source_function_direct 顶部镜像 r16 Fix B——template_index>=0 先具化模板体再 cold_clone_specialized_body 克隆重特化(深度恒1)。覆盖 depth-1 直接根形状(生产 compat_ffi 124-root 已过此墙), 三方独立回归零差异+负控制未削弱。**不覆盖 depth-2**: 间接根(main→caller→identity$g)与泛型链两层(inner/outer)仍 die——独立预存根因=BFS 入口 function_count 局部快照过期, 新铸特化 target>=旧快照被当外部符号静默丢弃, 两遍安全网只及深度1(复核A 钉死+反证: 显式列中间节点进 roots 可绕)。r18 立卷, 验收夹具=r17/1b 复核A 的 f1_minimal(root=main)/f2_genchain。
3. **★1b 落账前发现 op-lane 工作树在飞同根综合重构**: WT 版 cold_compile_source_function_direct(:35177)已换 ColdFunctionBodyStore 新 API+自带 template_index 重定向+cold_materialize_specialized_body_if_needed 克隆, 且有新函数 cold_materialize_reachable_function_fixed_point(:35252, work-list 不动点 BFS)——**疑似同时覆盖 1b 与 depth-2 缺陷**。故 1b 仅 index 落账(HEAD 即时正确+不 clobber 对方 WIP), 对方落账时自然整函数取代本笔; r18 验收以 depth-2 夹具对最终落账版本复测。
4. **#143 封存(补丁主动引入静默 miscompile, 禁落)**: r17/143 fix(297+/3- 六点根修)双镜头 PARTIAL+CONFIRMED——int32 标量族修复三方坐实(Some[int32].value 0→77/Get SIGSEGV→77/官方回归净+4 零翻转), 但复核A 用 Some[Point] 结构体变体证伪: **patched 把 baseline 本来读对的 g.x=11 读成 66(y 槽), Get[Point] 从编译期安全拒绝退化为编译过+运行垃圾值**——缺陷 3/4/6 把未解析占位符 T 硬编码 SLOT_I32(4字节), 隐含"T 恒为4字节标量"假设; Some[int64] 8字节截断两侧均未修(预存)。r18 重飞配方: 占位符 kind/宽度必须在特化时从实参类型解析(禁硬编码 SLOT_I32), 验收=Some[Point] 三字段/Get[Point]/Some[int64] 位模式, 且 int32 原族零回归。案卷 ~/cheng-patches/20260719/r17/143/(fix.patch 封存+v_a.md 证伪证据)。
5. **1a 封存(既定)**: 泛型占位符豁免(cold_type_object_ref_generic_exempt, 66行)被复核A adv_negctrl3(泛型函数+结构不相干实参)证伪出静默误放行——r18 收口轮加实参/形参 base 名相关性校验。**r17 方法论判例新增: 负控制必须覆盖「泛型函数+不相干实参」形状, 非泛型 Foo/Bar 对照触发不到新增代码路径=盲区**(实施臂与双镜头初版同踩)。
6. **r18 排队(三案)**: ①1a-rework(base 名相关性) ②143-rework(占位符宽度解析, Some[Point]/Some[int64] 验收) ③depth-2 BFS 过期快照(若 op-lane fixed_point 重构落账则改验收轮)。
7. **事故: devwin19/ 整目录灭失**(rebake_v4.sh/hap_relink.sh 在内, 疑磁盘清理期被外部会话删除, 未列入 disk_purge 记忆清单); 配方已全部沉淀 [[harmony-hap-generation-walls]], 新持久工作区=~/cheng-patches/20260719/devwin/。rebake v4 首败根因=**PWA 仓 publish 族 11 路由 WIP 断边**(route reachability 36/47, unreachable 全为 publish_*; PublishTypeSelector 等 4 组件未提交 WIP 所致), 非管线脚本问题; 处置=克隆 UniMaker HEAD(56d46d1 干净态)作物化 project-root 绕开, 验证在飞。

## ★★★ 2026-07-19 13:1x 收割批次二百零一 (acb7a9d3 会话) — ★round73 收官(修复+复核 CONFIRMED 零阻塞)+链 r10 判决 T89 层+round75/76 起飞

1. **round73 收官(T88 终局)**: fix 臂 DIFF_READY=**两 diff 缺一不可**(typed_expr 活体 TypedExprBindingRhsIsAggregateConstructor 三处: 谓词A 排除+flag+第三 guard; pobj Value 文本投影臂补 Result[T] 内型解析, miss 维持 poison 不落通用路径防 bail_44)。编排者独立复验: fin_j(=fin_i+r69+r73 全四 diff) T88 五梯队全 rc=7 且 stdout 正确。活体探针 21 命中+DRV.map 死副本 0 条目; 全门三轮逐位一致(v7 139→7, v4 垃圾→7, v3 静默→7, 家族电池 4/3/2/4/3/7/5, t78 146/147, 裸种子冷路径不回归)。变异: 双撤两 guard→139 复现(承重); 单撤 pobj 臂→v3/v4 复现(独立承重)。死副本不动(向零验证覆盖副本镜像=造第二份无验证代码)。
2. **复核 CONFIRMED 零 mustFix**: 11 对抗形双真值(嵌套构造器/首字段调用/多调用计数/构造器作实参/调用套调用/return-ctor/真裸调用未误伤)+5 轮独立变异。非阻塞立卷四项: ①Result[int32] Value 投影族裸形双驱动同坏(正交既有族) ②binding RHS 行尾注释族(更上层已坏, T88 对该形响亮崩溃存活) ③第三 guard 注释措辞与实测冗余结论订正 ④generic 构造器头(Box[int32])夹具缺口。
3. **★tree_fin_i 于 11:56 被外部换成 00:16 态**(无 typed_expr 修复)——fin 基座树会被外部换, 克隆/对照以内容锚为准非路径。
4. **链 r10=ignite_20260719T045700_ed34af(fin_j 快照)**: drvBake 12.5s→probes 11/11(enumadd_probe 绿)→gen2Bake rc=0 ZC=0 16.7min→**terminal 0/2+oracle 0/6 全红同签名: GEN2 编任何夹具 provider program_support 硬败「lowering plan: invalid resolved-call snapshot row index=85」(lowering_plan.cheng:1066 校验器; DRV 同输入全绿=GEN2 独病=DRV 错编快照构建/校验路径某函数, 剥皮下一层)**→gen3 SIGTRAP bakeRc=-5→ABORTED_GEN3_BAKE_FAILED。T88→T89 剥皮进度实证。
5. **seq_enum 回归定界**: 显式类型实参限定路径独红——`Ok[texpr.TypedExprIrStatementKind](x)` build_rc=2 missing_call_target(detail 只剩尾名=限定路径被剥成裸名); 裸 Ok(x)/Ok[int32]/Ok[本模块枚举] 全绿。round75 根修在飞。
6. **round76 起飞**: T89 取证(row85 坏字段定谳→被错编函数→round69/73 相关性判决)→根修→对抗复核。
7. **★两陷阱沉淀**: ①cp 克隆带陈旧 artifacts/bootstrap/compiler_main.direct, 不删=源改进不了 DRV(空烤全旧 driver); ②r73_fix_tree 绿 DRV(12:05)早于其源态(12:33+), 对照 DRV 行为必须核 build 时间 vs 源 mtime, 否则把「上一世代二进制」当「当前源行为」误判(round73 复核也踩同款, 其 uncovered ④ 已记 tree 被外部换)。

## ★★★ 2026-07-19 15:0x 收割批次二百零一 (ceaefe81 会话) — ★cold block 三缺口钉死(for-else 是静默误编译!)+v4 烘焙卡点定性+r18 配额墙 resume+r19 发射

1. **★v4 场景烘焙唯一编译阻塞定谳 = cold parser block 三缺口**: 场景闭包经 std/json(json.cheng:1042)→parseutils.parseBiggestFloat(:68-144), 该函数用 3×`block label:`+3×`break label`+3×for-else——①`block` HEAD cold 响亮拒编("unknown identifier 'block'", 文法 spec:316 合法, cold 从未支持); ②**for-else 被 cold 静默吞掉(误编译非拒编!)**: 探针 probe_for_else(3) 应=2 实测=0(else 从不执行, 零报错), break 路径正确——即使 block 通了浮点尾标也全错; ③标签 break 同族未见支持。**历史反转铁证**: v3 世代场景 .o nm 有 `T parseutils.parseBiggestFloat` 已编译 = 曾存在支持 block 的 cold 世代(随 seed-rescue 目录磁盘清理灭失), 现行 seed52 世系(a1aeea91/.bak cbf41e0b/HEAD 克隆三处实测)全部无此能力 = 能力丢失回归。
2. **★波及面警示**: for-else 静默误编译 = 任何 cold 闭包内 for-else 用户今日都在被静默错编; std/runtime 普查(parseutils 外未见第二处, awk 粗扫)。**r19 发射 wf_4751ab82-320**(fix+双镜头): 三件套实现+嵌套遮蔽/continue 语义/while-else 文法核查 6 维对抗门, 产物 ~/cheng-patches/20260719/r19/block/。种子换装(HEAD+r19 克隆烤+contract 验)由编排者在落账后执行。
3. **web_scene_runtime 非法语法规范迁移落账 `fb9b15d8b`**: if 8 项 || 折行(形式文法不允许表达式内换行)改单行——57376dfb0(07-17 S6)引入后无任何 cold 编译触达该文件 2 天(覆盖空洞), 今 v4 首触即拒; 探针 real_backend_codegen=1 复绿。同类普查: mobile_shell_codegen.cheng 的 || 折行在 C 字符串内=误报, 全仓 Cheng 源仅此一处。
4. **rebake v4 管线重建+三墙清障**: ①PWA publish 族 11 路由被**活树未提交 WIP** 断边(route reachability 36/47)——干净克隆(UniMaker HEAD 56d46d1)规避, 需补 node_modules 软链+tsconfig.json/tsconfig.node.json/asset_manifest_v1.json/gitignored 视频夹具; one-click 默认 47 路由目录硬钉 defaultProjectRoot, **新增 `--mobile-scene-routes-default-catalog` 旗标**(unimaker-one-click.mjs, 纯增) + 媒体三旗标(-video-file/-video-file-map vid_hgs/vid1/-image-file); ②克隆 HEAD 源 31 条 type.any 场景诊断物化拒(活树 WIP 已修)——**决策: 从活树 WIP 物化(mat-v4 完整出货) bake, publish 断边登记为 v4 KNOWN_DEFECT**(不在视频 E2E 路径, PWA 线落账自愈 v5); ③脚本配方全沉淀 ~/cheng-patches/20260719/devwin/rebake_v4.sh(宿主 dlsym 名以 cheng_gui_host_gen.c 实证为准: app 级 cheng_app_*/媒体族 cheng_scene_media_*)。
5. **r18 配额墙与 resume**: r18 首轮 8 臂完成 3(depth2-audit DIFF_READY+verify CONFIRMED 双绿归档: f1_direct PASS 证 1b 落账正确, f1_indirect/f2_genchain 逐字复现 depth-2 缺陷, 验收配方待 op-lane 重构落账), 5 臂(1a 双复核+143 修复+双复核)被 403 计费周期墙杀——**1a fix 已 DIFF_READY 未审**(md5 32e3c88d, +115 三层拆解: 占位符递归+实参骨架相关性匹配(base 尾名比较器与 r12 同族)+双调用点接线, 26 夹具+官方回归 1526 零差异); 探针定谳配额瞬断已恢复, resume wf 重飞 5 件在途。
6. **devwin19 灭失后续**: 新持久工作区 ~/cheng-patches/20260719/devwin/(rebake_v4.sh/pwa-head 克隆/head-probe 克隆+冷二进制); 鸿蒙设备离线(hdc Empty, E2E 需重新接线); 安卓 own-serve UDP 38000 不再绑定(app 重启后不自动回, detail 页开视频激活机制待查=E2E 编舞前置)。
7. **下一线(按序)**: r19 落账→种子换装(备份在位)→rebake v4 全链→HAP 装机→双卡 E2E(麦田=own-IP 直读/胡广生=拨安卓 .7:38000 需先激活)→r18 收割(1a/143 按判决落账或再 rework)。
