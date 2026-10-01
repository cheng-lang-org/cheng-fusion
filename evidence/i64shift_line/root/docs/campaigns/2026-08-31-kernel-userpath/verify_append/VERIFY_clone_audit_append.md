# VERIFY_clone_audit_append —— [CLONE-AUDIT] anchor_clones 克隆仓治理线（审计+安全清理）

date_utc=2026-09-06 · 代理=CLONE-AUDIT（战役 R 克隆仓治理）· 对象=/Users/lbcheng/cheng-f24/anchor_clones/（13 克隆 56G，审计前磁盘余 17GiB）· 禁触清单零接触（gen2wave2/、pb_parser/、主树源码）· 主树仅写入 campaign docs/patches · 未 git commit

## 结论先行

**审计+清理完成：磁盘可用 17GiB→47GiB，实际释放 ≈30GiB（超额完成 ≥13G 目标 2.3 倍）。anchor_clones 56G→29G。全删 5 克隆（bc_cont 5.4G、bc3 5.1G、cf_cont 4.1G、w151 1.3G、69817b8b2 1.3G，删前唯一 hunks 均已导出归档 patches/audit_*.patch）；6 个保留克隆清构建残留 ≈12.2G（缓存根/CoW tmp/.gen/.tmp-exec/驱动 exe/.map/.o），.w 文本台账全保留。发现 1 项未合入工作：bc3 的 parser W2 break/continue 终结语句处理（约 384 行新增，242 行不在主树）——已导出 audit_bc3.patch 归档，pb_parser 活线可能为其后继。/tmp/oob_ab 有活 bake 持有（pid 11169/11173 正写 bake_win/pb_run_fix3，供 pb_parser 线），本轮不动。**

## 一、处置表（13 克隆逐项）

| 克隆 | 体积 | HEAD vs 主树 | 唯一未合入 hunks | 建议动作→实际动作 |
|---|---|---|---|---|
| snap_split | 7.6G | 73debaef2=主树 HEAD | 无（80 文件修改，snap_split.patch 已归档 patches/ 2026-09-06 09:41） | 清构建物留证据→清 3.8G |
| gen2wave2 | 7.5G | — | —（GEN2-WAVE2 活线） | **禁触→零接触** |
| pb_parser | 7.2G | — | —（PHASEB-PARSER 活线） | **禁触→零接触** |
| gen2wave | 7.2G | 73debaef2 | 无（92 文件修改为 gen2wave2 前驱工作，VERIFY_gen2wave_1 在主树） | 清构建物留证据→清 3.3G |
| l3b4 | 7.1G | 73debaef2 | 无（77 文件修改，phasec 批次已归档） | 清构建物留证据→清 3.3G（.w gen2_* 文本证据 6.6MB 逐字节保留） |
| bc_cont | 4.6G | 73debaef2 | **有→已导出** audit_bc_cont.patch（3 文件 44KB）；typed_expr 131 行全含于主树；primary_object_plan 3 行（tupleArmOwner 早期形）主树已演进为 tupleArmType/Offset/Size/Align 形态 | 全删→删 5.4G |
| bc3 | 4.4G | 73debaef2 | **有→已导出** audit_bc3.patch（7 文件 77KB）；其中 parser.cheng W2 break/continue 终结语句链（384 增行，**242 行主树无、patches/ 旧档无**）+ compiler_csg breakStmtCount/continueStmtCount 桶 7 行 + lowering_plan W2 对账 5 行为真未合入工作 | 全删→删 5.1G |
| cf_cont | 4.1G | 73debaef2 | 无（4 文件修改 838+131 行经行级核对全含于主树；3 个 zz_cf_probe 未跟踪探针已附入 audit_cf_cont.patch 74KB） | 全删→删 4.1G |
| time_memo | 1.5G | 73debaef2 | 无（5 文件修改，time_exactmemo.patch 已归档） | 清构建物留证据→清 0.8G |
| l3b3 | 1.4G | 73debaef2 | 无（5 文件修改；.w/w152_parser_hunks.patch 留树） | 清构建物留证据→清 0.8G |
| w151 | 1.3G | 69817b8b2（主树祖先，已核实 merge-base） | 无（git status 全净，工作树可由 git 完整复现） | 安全删除→删 1.3G |
| 69817b8b2 | 1.3G | 69817b8b2=main | 无（status 全净） | 安全删除→删 1.3G |
| l3b2 | 0.7G | 73debaef2 | 无（5 文件修改，phasec_l3b2.patch 已归档） | 清构建物留证据→清 63M |

## 二、删前三查执行账

1. **进程持有核查**（lsof +D 全树 + pgrep）：仅 gen2wave2（bash 82363/kernel_dr 82368=活线 bake）与 pb_parser（git fsmonitor 72840）有活跃持有；snap_split/l3b4/gen2wave 仅 git fsmonitor 守护进程（无数据文件持有）；bc_cont/bc3/cf_cont/w151/69817b8b2 零持有。/tmp/oob_ab 另有活 bake（/usr/bin/time 11169 + cheng_w126 11173，运行 1m16s，正写 bake_win/pb_run_fix3/bake.log，root=pb_parser）→ **本轮 /tmp 判禁触**。
2. **mtime 冷却核查**：五个全删克隆最新内容 ≤2026-09-05 21:23（距审计 >15h）；保留克隆 ts-csg/tmp 最新文件 2026-09-05 09:59（65h 冷）。gen2wave2/pb_parser 当日活跃，未动。
3. **唯一 hunks 归档核查**：主树 HEAD=73debaef2 与各克隆 HEAD 同源（69817b8b2/73debaef2 均经 merge-base 核实为主树祖先）→ 克隆工作树 diff 与主树工作态直接可比。逐文件 cmp + 行级包含核对（新增非平凡行逐行 grep 主树对应文件）：cf_cont 全含；bc_cont 仅 3 行早期形被主树演进版取代；bc3 的 parser W2 链主树无。三个 PhaseB 克隆删除前均导出全量 `git diff` 至 patches/audit_bc_cont.patch / audit_bc3.patch / audit_cf_cont.patch（cf_cont 附带 3 个未跟踪探针的 new-file diff）。执行后 ls 复核五克隆已不存在。

## 三、执行账与释放量

| 步骤 | 对象 | 释放（du 实测） |
|---|---|---|
| 全删 | bc_cont | 5495M |
| 全删 | bc3 | 5256M |
| 全删 | cf_cont | 4229M |
| 全删 | w151 | 1370M |
| 全删 | 69817b8b2 | 1367M |
| 清残留 | snap_split（csg-cargo 缓存根+ts-csg/tmp 2.4G+src/.gen 343M+src/.tmp-exec 129M+artifacts 未跟踪物+.w 驱动 exe/.map） | 3796M |
| 清残留 | gen2wave（同类） | 3362M |
| 清残留 | l3b4（同类） | 3332M |
| 清残留 | time_memo（缓存根+artifacts+.w 3×kernel_driver 178M） | 826M |
| 清残留 | l3b3（缓存根+.w/runs 4×kernel_driver 178M+ab_gate 大文件保留） | 778M |
| 清残留 | l3b2（缓存根） | 63M |
| **合计** | | **≈29.7G（du 口径）；df 口径 17GiB→47GiB** |

只读目录前置 `chmod -R u+w` 再删；APFS CoW 克隆 ts-csg/tmp（三克隆 65h 冷、字节级同源同刻）整体清除。删后 df 两轮复核无「体积不动」半清理信号（APFS 容器层 purgeable 同步回收）。

## 四、保留清单

- **活线领地零接触**：gen2wave2/（7.5G，bash 82363 持有）、pb_parser/（7.2G）、主树 /Users/lbcheng/cheng-lang 源码。
- **保留克隆（6）**：snap_split、gen2wave、l3b4、time_memo、l3b3、l3b2——工作树修改原样保留（status 行数清理前后逐一相符 80/92/77/5/5/5），.git 完整，ts-csg 源码/artifacts 中 git 跟踪文件（含 vpn-proxy-local 密钥 2 文件、fs51-work/fs46-evidence 跟踪 63 文件）经 tar 往返零丢失。
- **.w 文本台账全保留**：l3b4 gen2_* 文本证据 6.6MB（brief 点名）、snap_split 的 VERIFY/patch/脚本/run 文本、time_memo 的 samples/*.txt 与 ab_gate 7.1M×N 文本、l3b3 的 ab_gate 文本与 w152_parser_hunks.patch。
- **归档新增（主树 docs/campaigns/2026-08-31-kernel-userpath/）**：patches/audit_bc_cont.patch、patches/audit_bc3.patch、patches/audit_cf_cont.patch。
- **证据补档（/tmp/oob_ab → verify_append/）**：19 份主树缺失 VERIFY 已拷入（bootparse_census、phaseb_bc2、phaseb_bc3、phaseb_constr_freeze、phaseb_parser、phasec_w5、w94/95/97/98/99/102/142/143/146/147/148/149/154），逐份核验 present=19/19。
- **/tmp/oob_ab 本体未动**：活 bake 持有（pid 11169/11173 → pb_parser 线），且 cheng_w126 为活线正在执行的编译器二进制。

## 五、发现与移交

1. **未合入工作（已归档待裁决）**：bc3 的 phaseB-W2「break/continue 终结语句 parser 节点化 + receipt rootEvent 锚定 + summary kind 对账桶」整链（parser.cheng 384 增行中 242 行主树无；compiler_csg 7 行、lowering_plan 5 行、compiler_parser_receipt 1 行、compiler_snapshot_schema 1 行主树无）。主树 parser.cheng 已有 breakStmtCount 字样但非 bc3 形态；**pb_parser 活线可能正在重做/后继该工作**——裁决权在 PHASEB-PARSER 线，裁决前唯一权威文本=patches/audit_bc3.patch。
2. bc_cont primary_object_plan 的 tupleArmOwner 3 行为主树 tupleArm* 演进形的早期迭代，无独立价值，仅存档于 audit patch。
3. /tmp/oob_ab 共 14G，其中 bake_win/、merge_0906/、cheng_w126 为 pb_parser 活线工作区；活线收工后可按本表第四节清单外口径另行清理（VERIFY 已全部补入主树，剩余为可再生产物）。
