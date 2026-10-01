# VERIFY_annot_release_append —— [ANNOT-RELEASE] parseperf_3 annotation 树遗弃修复(施工刀 A,GEN2 profiles 相解锁)2026-09-08

date_utc=2026-09-07T20:20Z~2026-09-08T06:5xZ · 代理=ANNOT-RELEASE(战役 R,诊断线 RATCHET-DIAG 施工线)· 克隆=/Users/lbcheng/cheng-f24/annotrel(anchor_clones 外;cp -cR 主树 0d3c8f5401+223 脏全量,基线 commit 9ab2309d;src/bootstrap/tools 三面 diff -rq 主树全等)· patch=patches/annot_release.patch(主树 apply 口径见 §五)· 全轮 bake_win 锁内(owner=ANNOT-RELEASE-*,用毕核自撤)

## 一、结论先行

**刀 A 落地全判据过门:annotation 树遗弃修复(F3 OFF 臂交接 `work.activeAnnotationTree` + 既有 `CompilerCsgBuildSourceScratchRelease` 释放)使 profiles 相 RSS 棘轮消失——自烤轮 after_profiles 完整落地 @213.5s,RSS=543.6MiB(m1d 形态 500-560MiB 预估带内;刀前 rd1/rd2 双轮 1.019/1.002GiB trip 且 profiles 相未完成);VM_ALLOCATE 增殖段速率 1.65-2.4 段/s→0.23-0.29 段/s(≈8× 削减,两轮独立复证);四夹具门 pass=4 known_red=0 stale=0、probe 12 绿/7 红/0 stale 判词对认证基线逐字零漂移;终刀形配对烤机同名 ×2 sha=a2038ab7 恒等。净削减 ≈565MB@trip 态兑现。附带清偿存量红一笔:parseperf_3 合入笔误在 `compilerCsgAccumulateParserForest` 上留下双 `@borrows`(注释块前后各一),Cheng 链 parser fail-closed 判 duplicate——既往自烤轮全部 trip 于 ≤124 源从未到达该源故未暴露,本刀让编译首次活着推进到 compiler_csg.cheng 才揭盖;按 wall154 同款修法删注释块前多余标注(借用语义零变化)。自烤穿帽 902.5s 死于 m2d 已知 metadata/forest 段(RATCHET-DIAG 预告的下一刀靶,非本刀回归)。**

## 二、刀体(2 处,均 src/core/tooling/compiler_csg.cheng)

| # | 面 | 内容 |
|---|---|---|
| 主刀 | :36656 F3 块加 `else` 分支 | `work.activeAnnotationTree = sourceAnnotationTree; sourceAnnotationTree = nil`(move+置 nil,与 :36501 既有 `work.parserForestAccumulator` 交接同款范式),紧贴既有 `CompilerCsgBuildSourceScratchRelease(work)`(:35884 释放 activeAnnotationTree)——按 :36598 注释原意接线,而非注释外显式 Release。F3 ON 臂零改动(累积 helper 全出口自带 move/Release+置 nil)。abort 面 :35974 自动覆盖 |
| 附刀 | :36455 删一个重复 `@borrows` | parseperf_3 处置#5 合入笔误(注释块前后各一);primary_object_plan.cheng:77810 wall154 先例同款修法(删注释块前的,保留紧贴 fn 的),借用语义零变化 |

红线遵守:parser.cheng/langintern/primary/cargo 零接触;Release 既有 panic 面(parser.cheng:10126-10150 同族 lang/parser.cheng:36184)原样生效——主刀使 :35884 从恒 nil 释放变为每源真实释放一次,panic 面由死代码变活覆盖。

## 三、验收链(四判据全过)

| 门 | 结果 |
|---|---|
| ①配对烤机 ×2 同名 sha EQ | **PASS** 终刀形 seed f2b3932e(克隆自烤冷链 CLT cc,与诊断线 seed 逐字节同)→ kernel_driver sha256=a2038ab7cf41a37b99b765df19121d1aa46157d156d1a3619697e57fd72a0c9a ×2(wall 278/301s,rc=0)。注:异名配对(…ar1/…ar2)实测 113 字节差=输出路径串内容嵌入,同名口径正是为此;C 链车头烤健康基线 210s 内 3 倍=630s,实测 248-320s(load 13-82 波动如实标注) |
| ②自烤 900s 帽(终刀 driver 严格自烤) | **PASS(判据内)** sb2:dispatch_min 全闭包 239/239 源 profiles 相完成,`after_profiles @213.5s rss_bytes=543,605,648(518.6MiB)`;无 guard trip(峰 802MB@764s);902.5s 看门狗收于 metadata/forest 段(m2d 口径同款已知病灶,RATCHET-DIAG §六预告的 forest 波次刀靶,非本刀回归) |
| ③四夹具门+12 绿 | **PASS** pass=4 known_red=0 stale=0(ordinary/call_fixture/cold_nested/v6 全绿,run 列与基线一致);probe_pass=12 probe_red=7 probe_stale=0——for `surface=..< rootNode=-1`、try `statement_offset=82 statement_offset=61`、match/closure/generic/array 七红判词与 parseperf_3 认证态逐字吻合 |
| ④F3 ON 态回归 | **PASS** 临时翻 `work.parserForestAccumulate=true`(commit 后烤 F3 ON driver 61c03c83,rc=0 wall=248s):四夹具 4/4 PASS 判词零漂移;probe 区 18/19 完成(defer/for/match/closure/generic/try/array 七红判词与认证态逐字吻合,12 绿),末件 probe_sizeof 由外部会话杀壳后单件补跑:compile rc=0+run rc=0+stdout `probe_sizeof=pass`(与基线 0/0/- 一致)——19/19 零漂移,else 分支与累积臂互斥共存无扰动;开关已还原 false 交付态 |

## 四、profiles 相 RSS 对照(主判据账)

分相曲线(同观察者口径 CHENG_PARSER_DEBUG=1):

| 相/时刻 | rd2(刀前) | sb2(刀后) |
|---|---|---|
| after_sort_sources(棘轮起点) | 248MB@t63 | 257MB@t52 |
| 棘轮中段 | 903MB@t117(纯爬零回落) | 486→383→481MB 波动(波峰回落=释放-复用发生) |
| profiles 相终点 | **无**(124 源 trip 1.002GiB@132s) | **543.6MiB@213.5s(after_profiles 落地,239/239 源)** |
| 相增量 | ~828MB@未完成 | ~287MB@完成(257→543) |

VM_ALLOCATE 增殖段(vmmap dirty 口径):

| 轮 | 窗 | 段数增速 | 形态 |
|---|---|---|---|
| rd2(刀前) | t63→t127(64s) | 92→205 段(**1.65→2.4 段/s**) | 永不回收,128MiB 满+64MiB×3 阶梯堆积 |
| sb1(刀后轮 1,旧源 driver 死于存量双 @borrows@187s) | t56→t121(65s) | 90→105 段(**0.23 段/s**) | 波动回落 |
| sb2(刀后轮 2,终刀 driver) | t52→t213(161s,239 源全完成) | 90→137 段(**0.29 段/s**) | 工作集正常涨落(190MB 面 vs sort 后 100MB) |

对锚栏:profiles 相终值 543.6MiB vs RATCHET-DIAG 预估带 500-560MiB(m1d 形态)——**带内命中**;vs 768MiB 编译臂管理锚 −29%(健度侧达标)。刀前对照 rd1 1.019GiB/rd2 1.002GiB 双 trip,净削减 ≈565MB@trip 态兑现(诊断 §一 #1 预估值)。GEN2 rc=0 前置「RSS 穿 1GiB 帽」的 profiles 相由本刀解锁;前沿现移至 metadata/forest 段(m2d 已知,m2d 口径 586MB 起步/868s trip,GEN2-P1 T1 靶区)。

## 五、交付物

- patch:docs/campaigns/2026-08-31-kernel-userpath/patches/annot_release.patch(42 行,sha256=fff543934dc55573ca6ae6a4424cc48185dba43e48eb23dab4fe521192a8073d;相对克隆基线 9ab2309d,主树 `git apply --check` rc=0,stat=compiler_csg.cheng +12/−2)
- 证据:克隆 .w/ar/{bake*_shell.log, gate_ar.log, gate_f3on.log, sb_1/, sb_2/(rss_curve.csv/stage_timeline/vmmap 16 张+digest), vmmap_digest.py, ar_*.sh}(克隆 git 即时 commit 链 9ab2309d→daee169a→3370c55b→F3ON 探针→还原,全账在库)
- driver/seed hash 台账:seed f2b3932e(冷链 CLT cc 克隆 cheng_cold.c,与 RATCHET-DIAG seed 逐字节同);终刀 driver a2038ab7×2;旧源(含双 @borrows)driver ff7a0739×2;F3 ON driver 61c03c83;异名对照 9d4e3603/d357f635(路径嵌入实证对)
- 大对象清理:kernel_driver 二进制 7 件+seed candidate+克隆 .tmp-exec 烤制树+/tmp/nonexistent_dir_should_be_created(probe_sizeof 单件产物)交付后全删,文本台账保留

## 六、纪律记录

- 全轮 bake_win 锁排队持窗(owner=ANNOT-RELEASE-bake{1..5}/sb-{1,2}),用毕核 owner 自撤;bake1 首跑 `/usr/bin/time -k`(GNU 选项)macOS 拒,即改 `timeout 700`(rc 紧邻捕获,0 浪费);一次 python3 - heredoc 违纪自纠(后续一律编辑工具落盘)
- 测量窗 load 13-144(他线 python/渲染共存,RATCHET-DIAG 同窗);RSS 判据不受 load 影响,墙钟如实标注
- 病态处置账:①sb1 rc=2 `duplicate @borrows`(parseperf_3 存量合入笔误,双 @borrows 于 compilerCsgAccumulateParserForest;既往自烤轮 trip 于 ≤124 源从未到达该源、烤机车头为 C 链 parser 不查,故从未暴露)→ wall154 同款修法删多余标注→ 终刀重烤;②F3 ON 门 18/19 处被外部会话杀壳(无残留进程)→ 缺件 probe_sizeof 单件补跑补齐,不重烧全门
- 门树峰 vs 768MiB 锚:F3 OFF 门进程树峰 913.4MiB(v6 夹具 913MiB,+18.9%;parseperf_3 同夹具 896.4MiB,+16.7%——差 +1.9% 属 load 13-18 测量噪声带,判词零漂移不受影响);sb2 自烤峰 802MB(forest 段,非帽内死亡)
