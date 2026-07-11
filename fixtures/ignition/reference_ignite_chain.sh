#!/bin/zsh
W=/Users/lbcheng/cheng-f24
S=/Users/lbcheng/cheng-lang/artifacts/bootstrap/cheng.stage3
E() { echo "[ign52] $@"; }
unset CHENG_NO_BACKEND_DRIVER_HANDOFF CHENG_REQUIRE_PURE_PROVIDERS 2>/dev/null
export CHENG_PROCESS_MAX_RSS_BYTES=12884901888
CMPW() { timeout 300 "$1" system-link-exec --root:$W/tree --in:"$2" --emit:exe --link-providers --target:arm64-apple-darwin --out:"$3" > "$3.log" 2>&1; }
$S system-link-exec --root:$W/tree --in:$W/tree/src/core/tooling/backend_driver_dispatch_min.cheng --emit:exe --link-providers --target:arm64-apple-darwin --out:$W/DRV52 > $W/drv52.log 2>&1
[ $? -eq 0 ] && [ -x $W/DRV52 ] || { E "DRV52_RED"; tail -2 $W/drv52.log; exit 2; }
E "DRV52_GREEN"
for T in "/tmp/lenfix/triv.cheng:7:triv" "/tmp/wipv11/rbytes.cheng:5:rbytes" "/tmp/bisect11/s4_debug_readwrite.cheng:5:s4dbg" "/tmp/wipv11/rerr.cheng:0:rerr" "/tmp/bisect11/s4b_strconcat_chain_isolated.cheng:0:s4b" "/tmp/nsa/nsatest.cheng:0:nsa" "/tmp/f8b/f8repro.cheng:0:f8repro" "/tmp/f11/g12.cheng:0:g12" "/tmp/f13/repro/isolate13.cheng:0:iso13" "/tmp/f13/repro/isolate7.cheng:0:iso7" "/tmp/f13/repro/isolate9.cheng:0:iso9"; do
  IFS=: read -r F X N <<< "$T"
  CMPW $W/DRV52 $F $W/p_$N.exe || { E "PROBE $N CFAIL $(tail -1 $W/p_$N.exe.log)"; exit 3; }
  RR=$(timeout 10 $W/p_$N.exe >/dev/null 2>&1; echo $?)
  [ "$RR" = "$X" ] || { E "PROBE $N RED run=$RR expect=$X"; exit 3; }
done
E "PROBES_GREEN 11/11"
if [ ! -x $W/GEN2AB ]; then
  $W/DRV52 system-link-exec --root:$W/tree --in:$W/tree/src/core/tooling/backend_driver_dispatch_min.cheng --emit:exe --link-providers --target:arm64-apple-darwin --out:$W/GEN2AB > $W/gen2ab.log 2>&1
  B=$?
  [ $B -eq 0 ] && [ -x $W/GEN2AB ] || { E "GEN2AB_RED rc=$B $(grep -aoE 'unresolved symbol[^\"]*|ZC_NOT_READY_TOTAL count=[0-9]+' $W/gen2ab.log | tail -2 | tr '\n' ' ')"; exit 4; }
fi
E "GEN2AB_GREEN size=$(stat -f %z $W/GEN2AB) $(grep -oE 'ZC_NOT_READY_TOTAL count=[0-9]+' $W/gen2ab.log | tail -1)"
T=0
for TT in "/tmp/lenfix/triv.cheng:7:triv" "/tmp/f11/g12.cheng:0:g12" "/tmp/f8b/f8repro.cheng:0:f8repro"; do
  IFS=: read -r F X N <<< "$TT"
  CMPW $W/GEN2AB $F $W/t_$N.exe || { E "TERMINAL $N COMPILE_RED rc=$? $(tail -1 $W/t_$N.exe.log)"; T=1; continue; }
  RR=$(timeout 15 $W/t_$N.exe >/dev/null 2>$W/te_$N.txt; echo $?)
  SL=$(wc -l < $W/te_$N.txt | tr -d ' ')
  if [ "$RR" = "$X" ]; then E "TERMINAL $N GREEN run=$RR stderr=$SL"; else E "TERMINAL $N RED run=$RR expect=$X stderr=$SL"; T=1; fi
done
[ $T -eq 0 ] || { E "TERMINAL_RED"; exit 5; }
E "★★TERMINAL_GREEN"
ORC=""; FAIL=0
for T in "/tmp/enum11/minimal/min.cheng:0:min" "/tmp/bisect11/s2_str_seq_clone.cheng:0:s2" "/tmp/wipv11/rbytes.cheng:5:orbytes" "/tmp/nsa/nsatest.cheng:0:onsa" "/tmp/bisect11/s4b_strconcat_chain_isolated.cheng:0:os4b" "/tmp/f13/repro/isolate13.cheng:0:oiso13"; do
  IFS=: read -r F X N <<< "$T"
  CMPW $W/GEN2AB $F $W/o_$N.exe || { ORC="$ORC $N=CFAIL"; FAIL=1; continue; }
  RR=$(timeout 10 $W/o_$N.exe >/dev/null 2>&1; echo $?)
  ORC="$ORC $N=$RR/$X"; [ "$RR" = "$X" ] || FAIL=1
done
E "ORACLE$ORC"
[ $FAIL -eq 0 ] || { E "ORACLE_RED"; exit 6; }
$W/GEN2AB system-link-exec --root:$W/tree --in:$W/tree/src/core/tooling/backend_driver_dispatch_min.cheng --emit:exe --link-providers --target:arm64-apple-darwin --out:$W/GEN3W > $W/gen3w.log 2>&1
D=$?
[ $D -eq 0 ] && [ -x $W/GEN3W ] || { E "GEN3W_RED rc=$D"; exit 7; }
E "GEN3W_GREEN size=$(stat -f %z $W/GEN3W)"
MASK=$(python3 /tmp/integ/macho_masked_cmp.py $W/GEN2AB $W/GEN3W 2>&1 | tail -2 | tr '\n' ' ')
E "FIXPOINT masked: $MASK"
E "★★★IGNITION_SEQUENCE_COMPLETE"
