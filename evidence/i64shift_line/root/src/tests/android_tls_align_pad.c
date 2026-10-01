/* TLS alignment pad for aarch64-linux-android static executables.
 *
 * 问题：NDK r27 的 libc.a 携带 GWP-ASan 的 8 字节 __thread 对象（对齐 8），
 * ld.lld 取输入最大对齐得到 PT_TLS p_align=8；而 ARM64 Bionic 的
 * __libc_init_tls 要求主执行档 TLS 段对齐 >= 64，否则 exec 即 SIGABRT：
 *   "executable's TLS segment is underaligned: alignment is 8 (skew 0),
 *    needs to be at least 64 for ARM64 Bionic"
 * Cheng 自身对象无 TLS 节（输入 .o 已核实），垫片提供一个 64 字节对齐的
 * .tbss 节把输出 PT_TLS 对齐抬到 64。
 *
 * 完整构建/链接配方（在仓库根目录执行）：
 *   RE=<NDK>/toolchains/llvm/prebuilt/darwin-x86_64/bin   # NDK r27+
 *   $RE/clang --target=aarch64-linux-android21 --sysroot=$RE/../sysroot \
 *       -fno-emulated-tls -c src/tests/android_tls_align_pad.c -o tls_pad.o
 *   # 注意 -fno-emulated-tls：API<29 时 clang 默认 emutls，__thread 会落 .data
 *   # 注意 TLS 垫片必须显式进链接：--provider-objects 在 ELF link-providers
 *   # 路径不生效，用链接器包装脚本把 tls_pad.o 追加为末位输入：
 *   printf '#!/bin/sh\nexec %s/aarch64-linux-android21-clang "$@" %s/tls_pad.o\n' \
 *       "$RE" "$WORKDIR" > "$WORKDIR/tlsfix_clang.sh" && chmod +x .../tlsfix_clang.sh
 *   export CHENG_ELF_LINKER="$WORKDIR/tlsfix_clang.sh"
 *   receipts/crypto_hw_driver/cheng_v2 system-link-exec --root:. \
 *       --in:src/tests/rsa_pss_aarch64_verify_probe.cheng --emit:exe \
 *       --target:aarch64-linux-android --out:probe --report-out:probe.report \
 *       --link-providers
 *   # 另需 export CHENG_DISABLE_COLD_OBJECT_CACHE=1（共享冷缓存被外来二进制
 *   # 条目污染时会报 "cold object cache entry integrity failure"）。
 *   adb push probe /data/local/tmp/probe && adb shell chmod 744 /data/local/tmp/probe
 *   adb shell /data/local/tmp/probe
 */
__attribute__((aligned(64))) __thread char cheng_android_tls_align_pad[64] = {0};
