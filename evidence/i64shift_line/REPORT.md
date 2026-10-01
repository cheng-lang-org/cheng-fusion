# I64SHIFT_LINE 报告 — or-of-shifts "丢 <<" 假说证伪 + 真臂定位 + 标注权威刀

基座: HEAD 61750d177（git archive 快照根 .rebuild/i64shift_line/root; 活树 bootstrap 同哈希）
归因驱动: kd2_abv_1（abverdict_line 钉定件, sha256 c3df5702d6c06eca148650f0896e5c6f3bf6fed5cdde3f1f7435dc3729ad5898）零烤复用
烤制: 排队（ladder.sh 就绪; 槽位协议同 bake_clone_root）

## 1. 真臂定位（机器码正命中, 非排除法）

任务书假说「int64 移位复合丢 << 项」**证伪**：

- 归档 realshape/rotr64.exe（产出 RED rotr8 的原件）rotr64 函数反汇编
  （0x100000b30, 180B）: `asr x0,x0,x1` (0xb74) + `lsl x0,x0,x1` (0xba8) +
  `orr x0,x0,x1` (0xbb8) **三项俱全, << 项从未丢失**。
- RED 真因（case2, v=0x8000000000000000 负数, n=8）: 有符号 `>>` 规范语义 =
  ashr（docs/cheng-formal-spec.md 1.3.2, 例句 int32(-1)>>1==int32(-1)），
  ashr(0x8000...,8)=0xFF80000000000000（符号填充）≠ 期望 0x0080000000000000。
  v1 夹具期望按逻辑移位计算且作用在负输入上——**规范下永不可满足, 坏仪器**。
  5c41e41d4 旁路提交的「两层根因」第 2 层（丢 << 项）同属误诊; 第 1 层（ashr 语义）
  成立, 且正是生产改 uint64 的正确理由。

**真缺陷（本刀对象）**: 有符号 `>>` 在「uint64 标记泄漏进 int64 标注 let」时错发 LSR：

- 判决点 bootstrap/cold_parser.c:55808
  `else op_code = left_unsigned ? BODY_OP_I64_LSR : BODY_OP_I64_ASR;`
  （I32 同构判决点 :55874, 按 cold_slot_type_is_uint32）
- 泄漏点 bootstrap/cold_parser.c:81231（parse_let_binding 反别名拷贝）
  `body_slot_set_type(body, copy_slot, body->slot_type[slot]);` —— 无条件继承
  **初始化器**槽标记, 显式标注（`let v: int64 = <uint64 表达式>`）被无视。
- 五臂判别探针 probe/i64shift_disc.cheng @ kd2_abv_1 @ HEAD（logs/disc.*,
  probe/i64shift_disc.exe.machine-code）:
  - A 纯 int64 let → asr ✓
  - **B int64 标注 let 吃 uint64 初始化器 → lsr ✗（RED_B, 唯一红臂）**
  - C var 标注吃 uint64 → asr ✓（var 预分配槽按标注重标, 旁证）
  - D 推断 let 吃 uint64 → lsr ✓（规范要求, 刀不得破坏）
  - E 无 let 直接 >> → asr ✓
- 同族污染实证: 归档探针 int64_shift_semantics_probe 的「signed」行全部被该泄漏
  污染（v 来自 uint64 返回的 sha384U64FromBytes）——fixtures/expected_probe_output.txt
  （C oracle）对 probe2/probe.out 的 diff 恰为 8 行 signed 侧错值, uint 侧全对。
  「合成探针 GREEN」的判读对象本身是泄漏值。

## 2. 刀（annotation authority, bootstrap 域结构根修）

- knife/i64shift_annotation_authority.patch: parse_let_binding 反别名拷贝处,
  显式标注且 ann_kind==kind 时以标注跨度重标 copy_slot; 跨 kind 与推断 let 保持
  原传播（#143/#144 族保护不回退）。单点修复, 同喂 I64/I32 两个移位判决点及
  无符号比较/除法消费方。
- knife/annfix_comment_at_prose.patch: cold_parser.c 五处 `/* */` 注释散文行以
  `@` 开头, 使 patch_preflight 对该文件任意补丁恒 FAIL（null 补丁基线档
  knife/null_baseline.patch 判词同 ann=5）。改词（冠词前缀）后 ann=0 PASS。
  零语义, 修活机械门。
- 预检: annfix=PASS(ann=0); knife 对基线零新增（ann=5=基线同五条, displaced=0,
  wedged=0, balance 30/0）。顺序叠加逐字节等价校验 knife/seq_check.py=SEQ_EQ_COMBINED True。
- cc -fsyntax-only 全 TU（cheng_cold.c 含刀）零错误（13 条既有 warning）。
- 行为面扫描: src/std+src/apps+src/quic 标注与初始化器标记基本一致
  （syscall* 返回 int64、zlibAdler32 返回 int32、rng/gcm/http 均 uint64 链）,
  翻转面≈空; 方向 = 规范化。

## 3. 验证阶梯（ladder.sh, LADDER_VERDICT=GREEN @ 17:22）

- 金丝雀 2/2: i64s_two_line_canary + ordinary_zero_exit_fixture 全 rc=0
- 红臂（ctrl 驱动, 同基座未修补）: i64shift_disc → RED_B run_rc=1 ✓
- 绿臂（knife 驱动）: i64shift_disc 五臂全绿 run_rc=0 ✓（B 臂由 lsr 转 asr）
- realshape: rotr64_realshape_u64 OK + rotr64_realshape_i64spec OK ✓
- 合成探针（knife 驱动）输出 == fixtures/expected_probe_output.txt == C oracle:
  diff 0 字节（刀后 signed_shr8=ff80.../or_term=ff80... 等与 C 语义逐位一致;
  预刀污染值 0080.../0180... 已归档比对在案）
- 三合同恒等（同根 knife-root + 等长出件目录 A/B + 双驱动, --emit:obj）:
  ordinary_zero_exit / call_fixture / cold_nested_fmt_interpolation_smoke 全
  obj=IDENTICAL（刀零漂移）。v6_direct1_repro 非 HEAD 夹具, 未跑（3/3+1）。
  注: 跨根/exe 逐字节判据无效——.o 内嵌源/出件绝对路径, exe 内嵌 LC_UUID
  （实测 52144B exe 恰 201B 差全在 0x2dc UUID 区）; walleknife primary.o 恒等同判据。
- 三烤: kd_i64s_knife_{1,2,3} byte_1v2=DIFF byte_1v3=DIFF（已知 cc 同源非确定,
  archive 先例同判）, 钉 kd_i64s_knife_1
  sha256=a4d1d1b93f01a65974ce654a40aebb73ea246be1c0d500d086e8c3805646aa4b
- 三后端同治臂判（knife 驱动 --emit:obj 反汇编, tools/split_arm_check.py）:
  - arm64（零烤预刀档）: caseB lsr 泄漏实锤; 刀后sar 判 GREEN
  - x86_64: 预刀 caseB=shrq RED 实锤（arms/x86_64 预刀档）; 刀后 sarq GREEN
  - riscv64: 预刀 caseB2=srl RED 实锤; 刀后 sra GREEN（主夹具撞既有 rv64
    "composite return capture unsupported" ABI 缺口, 双三元组同现, 与本案无关;
    用参数形最小夹具 i64shift_riscv_min）
- 瞬态注记: 全新根首编偶发「primary object emit failed」（冷对象缓存侧车竞态,
  墙E f7e51d12d 在飞域, 无补丁 ctrl 驱动同样偶发, 复现 logs/repro1.* rc=0）,
  compile_run 已带重试一次语义并逐尝试入日志。
- 落库闭环: i64s_knife 根 = git archive(61750d177) + annfix + knife 两冻结件,
  即提交后的树; 提交后 diff 提交文件与根文件须逐字节相等。

## 4. 备份

backup_dest_1=/Users/lbcheng/cheng-fusion/evidence/i64shift_line
backup_dest_2=/Users/lbcheng/cheng-f24/i64shift_line
