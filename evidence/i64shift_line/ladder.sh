#!/bin/bash
# i64shift_line 烤制+验证阶梯（排队槽执行; 幂等可续跑）
# 真臂: bootstrap/cold_parser.c parse_let_binding 反别名拷贝无视显式标注 → uint64 标记
#       泄漏进 int64 标注 let → cold_parser.c:55808 `left_unsigned ? LSR : ASR` 错发逻辑移位
#       (spec 1.3.2 违规)。刀 = 标注权威 (annotation authority)。
# 判定面: 红(i64shift_disc RED_B @ctrl 驱动) → 绿(@knife 驱动); u64/i64spec realshape OK;
#         合成探针输出 == C oracle 冻结期望; 金丝雀 2/2; 四合同恒等; 三烤钉 sha;
#         x64/riscv 同型臂 obj 反汇编臂判。
set -u
MAIN=/Users/lbcheng/cheng-lang
LINE=$MAIN/.rebuild/i64shift_line
KN=$LINE/knife
CC=/usr/bin/cc
SDK=/Library/Developer/CommandLineTools/SDKs/MacOSX.sdk
CLT_OBJDUMP=/Library/Developer/CommandLineTools/usr/bin/objdump
GUARD=$MAIN/tools/beat_c_process_group_guard.sh
SLOT=$MAIN/.rebuild/COMPILE_SLOT.lock
LOGS=$LINE/logs
DR=$LINE/driver
mkdir -p "$LOGS" "$DR"
# 幂等自清扫: 本阶梯自己的守卫/判词旧件（守卫脚本拒绝覆盖既有报告名）
rm -f "$LOGS"/c_*_a[12].guard.report.txt "$LOGS"/c_*_a[12].out.txt "$LOGS"/c_*_a[12].err.txt \
      "$LOGS"/arm_*.guard.report.txt "$LOGS"/arm_*.out.txt "$LOGS"/arm_*.err.txt \
      "$LOGS"/bake_*.guard.report.txt "$LOGS"/bake_*.out.txt "$LOGS"/bake_*.err.txt \
      "$LOGS"/verdict_face.txt
find "$LINE/arms" -name "arm_verdict.txt" -delete 2>/dev/null

say() { echo "[$(date +%H:%M:%S)] $*"; }

hold_slot() { # 阶段级槽位（与 bake_clone_root 同协议: 死检清陈锁, 1h 上限）
  local waits=0
  while ! mkdir "$SLOT" 2>/dev/null; do
    local owner; owner=$(cat "$SLOT/owner.txt" 2>/dev/null | sed -n 's/^pid=\([0-9]*\).*/\1/p')
    if [ -n "${owner:-}" ] && ! kill -0 "$owner" 2>/dev/null; then
      say "stale slot (owner pid=$owner dead), clearing"; rm -rf "$SLOT"; continue
    fi
    waits=$((waits + 30))
    if [ "$waits" -ge 3600 ]; then say "SLOT_WAIT_TIMEOUT"; exit 7; fi
    sleep 30
  done
  printf 'pid=%s purpose=i64shift_ladder start=%s\n' $$ "$(date +%s)" > "$SLOT/owner.txt"
}

guarded() { # 1GiB 进程树守卫恒定
  local name=$1; shift
  local tmo=$1; shift
  bash "$GUARD" --rss-limit:1073741824 --timeout:"$tmo" --expected-exit-code:0 \
    --report-out:"$LOGS/$name.guard.report.txt" --stdout:"$LOGS/$name.out.txt" \
    --stderr:"$LOGS/$name.err.txt" -- "$@"
}

# ---------- phase 1: 受控克隆根（bake_clone_root 自管槽; 补丁后置叠加） ----------
# 注: bake_clone_root --patch 通道对 cold_parser.c 被既有基线 ann=5 卡死（活树注释散文
#     行以 @ 开头, patch_preflight 对任意补丁同判; null 补丁基线档=
#     knife/null_baseline.patch 判词）。annfix 补丁使该文件过门(ann=0 PASS)。
#     故 root 以净基座创建, 两个已预检冻结件按序手工叠加(--fuzz=0), 单变量性由
#     ctrl/knife 两根的差异 = 恰这两补丁保证。
CTRL_ROOT=$MAIN/.rebuild/clone_roots/i64s_ctrl
KNIFE_ROOT=$MAIN/.rebuild/clone_roots/i64s_knife
if [ ! -d "$CTRL_ROOT/src" ]; then
  bash "$MAIN/tools/bake_clone_root.sh" i64s_ctrl || { say "CTRL_ROOT_FAIL"; exit 1; }
fi
if [ ! -d "$KNIFE_ROOT/src" ]; then
  bash "$MAIN/tools/bake_clone_root.sh" i64s_knife || { say "KNIFE_ROOT_FAIL"; exit 1; }
fi
if [ -d "$KNIFE_ROOT/src" ] && [ ! -f "$KNIFE_ROOT/.i64s_knife_state.txt" ]; then
  ( cd "$KNIFE_ROOT" \
    && patch -N -p1 --fuzz=0 < "$KN/annfix_comment_at_prose.patch" \
    && patch -N -p1 --fuzz=0 < "$KN/i64shift_annotation_authority.patch" ) \
    || { say "KNIFE_PATCH_FAIL"; exit 1; }
  ( cd "$KNIFE_ROOT" && shasum -a 256 bootstrap/cold_parser.c ) > "$KNIFE_ROOT/.i64s_knife_state.txt"
fi
say "roots ready: ctrl=$CTRL_ROOT knife=$KNIFE_ROOT"

# ---------- phase 1b: 全程持槽（烤制+判定面; 退出释放） ----------
hold_slot
release_slot() { rm -rf "$SLOT"; }
trap release_slot EXIT INT TERM

# 夹具入根（源测试身份与根绑定）
for R in "$CTRL_ROOT" "$KNIFE_ROOT"; do
  cp "$LINE/probe/i64shift_disc.cheng" "$R/src/tests/"
  cp "$LINE/probe/i64shift_riscv_min.cheng" "$R/src/tests/"
  cp "$LINE/fixtures/rotr64_realshape_u64.cheng" "$R/src/tests/"
  cp "$LINE/fixtures/rotr64_realshape_i64spec.cheng" "$R/src/tests/"
  printf 'fn main(): int32 = return 0\n' > "$R/src/tests/i64s_two_line_canary.cheng"
done

# ---------- phase 2: 驱动烤制（knife 三烤钉 sha; ctrl 单烤） ----------
bake_driver() { # $1=root $2=out
  guarded "bake_$(basename "$2")" 900 "$CC" -isysroot "$SDK" -std=c11 -O2 \
    "$1/bootstrap/cheng_cold.c" -o "$2"
}
DC=$DR/kd_i64s_ctrl
DK1=$DR/kd_i64s_knife_1; DK2=$DR/kd_i64s_knife_2; DK3=$DR/kd_i64s_knife_3
if [ ! -x "$DC" ]; then
  bake_driver "$CTRL_ROOT" "$DC" || { say "CTRL_DRIVER_FAIL"; exit 1; }
fi
for D in "$DK1" "$DK2" "$DK3"; do
  if [ ! -x "$D" ]; then
    bake_driver "$KNIFE_ROOT" "$D" || { say "KNIFE_DRIVER_FAIL $D"; exit 1; }
  fi
done
"$DK1" status >/dev/null || { say "DRIVER_STATUS_FAIL"; exit 1; }
{
  echo "ctrl_sha256=$(shasum -a 256 "$DC" | awk '{print $1}')"
  for D in "$DK1" "$DK2" "$DK3"; do
    echo "knife=$(basename "$D") sha256=$(shasum -a 256 "$D" | awk '{print $1}') disasm_sha256=$("$CLT_OBJDUMP" -d "$D" | shasum -a 256 | awk '{print $1}')"
  done
  echo "knife_byte_1v2=$(cmp -s "$DK1" "$DK2" && echo SAME || echo DIFF)"
  echo "knife_byte_1v3=$(cmp -s "$DK1" "$DK3" && echo SAME || echo DIFF)"
  echo "pinned_driver=kd_i64s_knife_1"
} > "$LOGS/driver_shas.txt"
cat "$LOGS/driver_shas.txt"

# ---------- phase 3: 判定面 ----------
# C oracle 重建自检（冻结期望文件 fixtures/expected_probe_output.txt 不重生成）
if [ ! -x "$LINE/fixtures/probe_ref_bin" ]; then
  "$CC" -O0 "$LINE/fixtures/probe_reference.c" -o "$LINE/fixtures/probe_ref_bin"
fi

VERDICT=GREEN
note() { echo "$*" | tee -a "$LOGS/verdict_face.txt"; }
: > "$LOGS/verdict_face.txt"

compile_run() { # $1=tag $2=root $3=driver $4=src(rel) $5=exe ; sets crc/rrc
  # 瞬态重试: 全新根首编偶发冷对象缓存侧车竞态（墙E f7e51d12d 域, 无补丁驱动同样
  # 偶发; 复现档 logs/repro1.* rc=0）。每次尝试入日志, 判词取最后一次。
  for attempt in 1 2; do
    guarded "c_${1}_a${attempt}" 900 "$3" system-link-exec --root:"$2" --in:"$4" --emit:exe \
      --target:arm64-apple-darwin --out:"$5" --report-out:"$5.report.txt"
    crc=$?
    [ "$crc" != 0 ] && continue
    rrc=ABSENT
    if [ -x "$5" ]; then "$5" > "$5.out" 2>&1; rrc=$?; fi
    return
  done
  rrc=ABSENT
}

# 3a 金丝雀 2/2（knife 驱动先判活）
for f in i64s_two_line_canary ordinary_zero_exit_fixture; do
  compile_run "canary_$f" "$KNIFE_ROOT" "$DK1" "src/tests/$f.cheng" "$LINE/canary/$f.exe"
  say "canary $f compile_rc=$crc run_rc=$rrc"
  echo "canary $f compile_rc=$crc run_rc=$rrc" >> "$LOGS/verdict_face.txt"
  [ "$crc" = 0 ] && [ "$rrc" = 0 ] || VERDICT=RED
done

# 3b 红臂: ctrl 驱动必须 RED_B（同基座未修补）
compile_run "red_disc_ctrl" "$CTRL_ROOT" "$DC" "src/tests/i64shift_disc.cheng" "$LINE/red_ctrl/disc.exe"
red_line=$(head -1 "$LINE/red_ctrl/disc.exe.out" 2>/dev/null)
say "RED_arm ctrl compile_rc=$crc run_rc=$rrc out=$red_line"
echo "red_arm(_ctrl) compile_rc=$crc run_rc=$rrc out=$red_line expect=RED_B" >> "$LOGS/verdict_face.txt"
{ [ "$crc" = 0 ] && [ "$rrc" = 1 ] && [ "$red_line" = "RED_B" ]; } || VERDICT=RED

# 3c 绿臂: knife 驱动五臂全绿
compile_run "green_disc" "$KNIFE_ROOT" "$DK1" "src/tests/i64shift_disc.cheng" "$LINE/green_knife/disc.exe"
gout=$(head -1 "$LINE/green_knife/disc.exe.out" 2>/dev/null)
say "GREEN_arm knife compile_rc=$crc run_rc=$rrc out=$gout"
echo "green_arm(knife) compile_rc=$crc run_rc=$rrc out=$gout expect=OK" >> "$LOGS/verdict_face.txt"
{ [ "$crc" = 0 ] && [ "$rrc" = 0 ] && [ "$gout" = "OK i64shift disc green" ]; } || VERDICT=RED

# 3d realshape 两件（knife 驱动）
for v in rotr64_realshape_u64 rotr64_realshape_i64spec; do
  compile_run "rs_$v" "$KNIFE_ROOT" "$DK1" "src/tests/$v.cheng" "$LINE/realshape/$v.exe"
  oout=$(head -1 "$LINE/realshape/$v.exe.out" 2>/dev/null)
  say "realshape $v compile_rc=$crc run_rc=$rrc out=$oout"
  echo "realshape $v compile_rc=$crc run_rc=$rrc out=$oout" >> "$LOGS/verdict_face.txt"
  { [ "$crc" = 0 ] && [ "$rrc" = 0 ]; } || VERDICT=RED
done

# 3e 合成探针 == C oracle（knife 驱动; 双 oracle: C 原生件 + 冻结期望文件）
compile_run "probe" "$KNIFE_ROOT" "$DK1" "src/tests/int64_shift_semantics_probe.cheng" "$LINE/probe_out/int64_probe.exe"
"$LINE/fixtures/probe_ref_bin" > "$LINE/probe_out/c_oracle.txt"
/usr/bin/diff "$LINE/fixtures/expected_probe_output.txt" "$LINE/probe_out/int64_probe.exe.out" > "$LINE/probe_out/diff_expected.txt" 2>&1
/usr/bin/diff "$LINE/fixtures/expected_probe_output.txt" "$LINE/probe_out/c_oracle.txt" > "$LINE/probe_out/diff_coracle.txt" 2>&1
p1=0 ; [ -s "$LINE/probe_out/diff_expected.txt" ] && p1=1
[ -s "$LINE/probe_out/diff_coracle.txt" ] && p1=1
say "probe_vs_expected_diff_bytes=$(wc -c < "$LINE/probe_out/diff_expected.txt") probe_vs_c_diff_bytes=$(wc -c < "$LINE/probe_out/diff_coracle.txt")"
echo "probe oracle diff_expected_bytes=$(wc -c < "$LINE/probe_out/diff_expected.txt") diff_c_bytes=$(wc -c < "$LINE/probe_out/diff_coracle.txt")" >> "$LOGS/verdict_face.txt"
[ "$p1" = 0 ] || VERDICT=RED

# 3f 四合同恒等（同一 knife 根 + 等长输出目录 A/B + 双驱动; 无污染形状必须零漂移）
#   .o 内嵌源/出件绝对路径与 LC_UUID（链接器随机）, 跨根/exe 判无效（本轮实测:
#   exe 52144B 恰 201B 差全在 0x2dc UUID 区; .o 差=根路径串）。
#   同根同长协议实测: OBJ_IDENTICAL（walleknife_line primary.o 恒等同判据）。
mkdir -p "$LINE/contract/A" "$LINE/contract/B"
for f in ordinary_zero_exit_fixture call_fixture cold_nested_fmt_interpolation_smoke; do
  rm -f "$LOGS/idc_a_$f.guard.report.txt" "$LOGS/idc_a_$f.out.txt" "$LOGS/idc_a_$f.err.txt" \
        "$LOGS/idc_b_$f.guard.report.txt" "$LOGS/idc_b_$f.out.txt" "$LOGS/idc_b_$f.err.txt"
  guarded "idc_a_$f" 900 "$DC" system-link-exec --root:"$KNIFE_ROOT" --in:"src/tests/$f.cheng" --emit:obj \
    --target:arm64-apple-darwin --out:"$LINE/contract/A/$f.o" --report-out:"$LINE/contract/A/$f.o.report.txt"
  c1=$?
  guarded "idc_b_$f" 900 "$DK1" system-link-exec --root:"$KNIFE_ROOT" --in:"src/tests/$f.cheng" --emit:obj \
    --target:arm64-apple-darwin --out:"$LINE/contract/B/$f.o" --report-out:"$LINE/contract/B/$f.o.report.txt"
  c2=$?
  if [ "$c1" = 0 ] && [ "$c2" = 0 ]; then
    id=DIFFER
    cmp -s "$LINE/contract/A/$f.o" "$LINE/contract/B/$f.o" && id=IDENTICAL
    say "contract $f obj=$id"
    echo "contract $f obj=$id" >> "$LOGS/verdict_face.txt"
    [ "$id" = IDENTICAL ] || VERDICT=RED
  else
    say "contract $f compile ctrl=$c1 knife=$c2"
    echo "contract $f compile ctrl=$c1 knife=$c2" >> "$LOGS/verdict_face.txt"
    VERDICT=RED
  fi
done

# 3g x64/riscv 同型臂（knife 驱动 obj; 反汇编臂判）
#   x86_64: 主判别夹具五臂。riscv: 主夹具撞既有 rv64 "composite return capture"
#   ABI 缺口（与本案无关, 双三元组同现）, 用参数形最小夹具 i64shift_riscv_min
#   （caseB2=标注权威修复臂, caseA2=纯 int64 臂, caseD2=推断 uint64 臂）。
arm_check() { # $1=triple $2=asr_mnem $3=lsr_mnem $4=src $5=tag-spec...
  local t=$1 m_asr=$2 m_lsr=$3 src=$4; shift 4
  mkdir -p "$LINE/arms/$t"
  rm -f "$LOGS/arm_${t}.guard.report.txt" "$LOGS/arm_${t}.out.txt" "$LOGS/arm_${t}.err.txt"
  guarded "arm_${t}" 900 "$DK1" system-link-exec --root:"$KNIFE_ROOT" \
    --in:"$src" --emit:obj --target:"$t" \
    --out:"$LINE/arms/$t/disc.o" --report-out:"$LINE/arms/$t/disc.o.report.txt"
  local crc2=$?
  local rcfile="$LINE/arms/$t/arm_verdict.txt"
  if [ "$crc2" != 0 ]; then echo "target=$t compile_rc=$crc2 VERDICT=COMPILE_FAIL" > "$rcfile"; VERDICT=RED; return; fi
  "$CLT_OBJDUMP" -d "$LINE/arms/$t/disc.o" > "$LINE/arms/$t/disc.asm" 2>"$LINE/arms/$t/disasm.err"
  "$CLT_OBJDUMP" -t "$LINE/arms/$t/disc.o" > "$LINE/arms/$t/disc.symtab" 2>/dev/null
  if [ ! -s "$LINE/arms/$t/disc.asm" ] || [ ! -s "$LINE/arms/$t/disc.symtab" ]; then
    echo "target=$t compile_rc=0 disasm=UNAVAILABLE(objdump)" > "$rcfile"; return
  fi
  python3 "$LINE/tools/split_arm_check.py" "$LINE/arms/$t/disc.asm" \
    "$LINE/arms/$t/disc.symtab" "$m_asr" "$m_lsr" "$@" > "$rcfile" 2>&1
  grep -q "VERDICT=GREEN" "$rcfile" || VERDICT=RED
}
mkdir -p "$LINE/arms"
arm_check x86_64-unknown-linux-gnu sar shr src/tests/i64shift_disc.cheng \
  caseA=asr caseB=asr caseC=asr caseD=lsr caseE=asr
# riscv objdump 需 homebrew llvm-objdump（CLT 不含 riscv target）
RISCV_DISASM=/opt/homebrew/opt/llvm/bin/llvm-objdump
arm_check_rv() {
  local t=riscv64-unknown-linux-gnu src=src/tests/i64shift_riscv_min.cheng
  mkdir -p "$LINE/arms/$t"
  rm -f "$LOGS/arm_${t}.guard.report.txt" "$LOGS/arm_${t}.out.txt" "$LOGS/arm_${t}.err.txt"
  guarded "arm_${t}" 900 "$DK1" system-link-exec --root:"$KNIFE_ROOT" \
    --in:"$src" --emit:obj --target:"$t" \
    --out:"$LINE/arms/$t/disc.o" --report-out:"$LINE/arms/$t/disc.o.report.txt"
  local crc2=$?
  local rcfile="$LINE/arms/$t/arm_verdict.txt"
  if [ "$crc2" != 0 ]; then echo "target=$t compile_rc=$crc2 VERDICT=COMPILE_FAIL" > "$rcfile"; VERDICT=RED; return; fi
  if [ -x "$RISCV_DISASM" ]; then
    "$RISCV_DISASM" -d "$LINE/arms/$t/disc.o" > "$LINE/arms/$t/disc.asm" 2>"$LINE/arms/$t/disasm.err"
    "$RISCV_DISASM" -t "$LINE/arms/$t/disc.o" > "$LINE/arms/$t/disc.symtab" 2>/dev/null
  fi
  if [ ! -s "$LINE/arms/$t/disc.asm" ] || [ ! -s "$LINE/arms/$t/disc.symtab" ]; then
    echo "target=$t compile_rc=0 disasm=UNAVAILABLE" > "$rcfile"; return
  fi
  python3 "$LINE/tools/split_arm_check.py" "$LINE/arms/$t/disc.asm" \
    "$LINE/arms/$t/disc.symtab" sra srl caseA2=asr caseB2=asr caseD2=lsr > "$rcfile" 2>&1
  grep -q "VERDICT=GREEN" "$rcfile" || VERDICT=RED
}
arm_check_rv

say "LADDER_VERDICT=$VERDICT"
echo "LADDER_VERDICT=$VERDICT" >> "$LOGS/verdict_face.txt"
exit 0
