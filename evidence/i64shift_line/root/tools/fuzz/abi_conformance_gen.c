/* abi_conformance_gen.c — deterministic ABI conformance case generator.
 *
 * Per seed, emits TWO independent FFI conformance programs (one per
 * direction) plus a pure-clang mirror for each, so PASS/FAIL is attributable
 * per direction and generator bugs are separable from compiler bugs:
 *
 *   import direction (Cheng calls C):
 *     <outdir>/imp_main.cheng  Cheng entry: @importc decls of c_f*, calls
 *                              them with concrete args, aggregates checksum,
 *                              returns (checksum & 127).
 *     <outdir>/imp_impl.c      clang-compiled implementations of c_f*.
 *     <outdir>/imp_mirror.c    standalone pure-clang replica; its exit code
 *                              must equal expect_imp (oracle self-check).
 *
 *   export direction (C calls Cheng):
 *     <outdir>/exp_mod.cheng   Cheng module (no main) with @exportc ch_f*.
 *     <outdir>/exp_main.c      clang main calling ch_f*, aggregates
 *                              checksum, returns (checksum & 127).
 *     <outdir>/exp_mirror.c    standalone pure-clang replica; exit code must
 *                              equal expect_exp.
 *
 * Signatures: 0..16 params drawn from {int32,int64,bool}, return type from
 * the same set. >8 params exercise AArch64 stack passing; mixed int32/bool
 * stack params exercise Darwin's packed (natural-size) stack slot rules.
 * Callee semantics (identical on both sides, wrap-safe):
 *   acc = K; for each param: acc = acc*31 + widen(p); return narrow(acc)
 * Caller aggregation: sum = (sum*33) ^ widen(ret); exit = sum & 127.
 * All arithmetic is uint64 wrap, matching Cheng int64 wrap semantics; the
 * generator simulates both programs and prints:
 *   expect_imp=<0..127> expect_exp=<0..127>
 *
 * Build/link recipe (validated repo pattern: emit:obj + cc link):
 *   cheng system-link-exec --in:imp_main.cheng --emit:obj -> imp_main.o
 *   cc -c imp_impl.c; cc -o imp imp_main.o imp_impl.o; ./imp -> expect_imp
 *   cheng system-link-exec --in:exp_mod.cheng --emit:obj -> exp_mod.o
 *   cc -o exp exp_main.c exp_mod.o; ./exp -> expect_exp
 *
 * Usage: abi_conformance_gen --seed:N --outdir:DIR
 * Exit: 0 ok, 2 usage/io error.
 */
#include <stdio.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <stdarg.h>

typedef enum { TY_I32 = 0, TY_I64 = 1, TY_BOOL = 2 } Ty;

#define MAX_FN 10
#define MAX_PAR 16

typedef struct {
    int nparams;
    Ty params[MAX_PAR];
    Ty ret;
    uint64_t k;                 /* per-function start constant */
    int64_t args[MAX_PAR];      /* concrete call-site arguments */
} Sig;

/* ---- deterministic rng (splitmix64) ---- */
static uint64_t g_state;
static uint64_t rnd64(void) {
    uint64_t z = (g_state += 0x9e3779b97f4a7c15ULL);
    z = (z ^ (z >> 30)) * 0xbf58476d1ce4e5b9ULL;
    z = (z ^ (z >> 27)) * 0x94d049bb133111ebULL;
    return z ^ (z >> 31);
}
static uint32_t rnd(uint32_t n) { return (uint32_t)(rnd64() % n); }

/* ---- value pools: exercise sign extension / truncation / large i64 ---- */
static int64_t pick_i32(void) {
    switch (rnd(8)) {
    case 0: return 0;
    case 1: return 1;
    case 2: return -1;
    case 3: return 127;
    case 4: return -128;
    case 5: return 2147483647LL;
    case 6: return -2147483647LL - 1;
    default: return (int32_t)rnd64();
    }
}
static int64_t pick_i64(void) {
    switch (rnd(8)) {
    case 0: return 0;
    case 1: return 1;
    case 2: return -1;
    case 3: return 2147483648LL;          /* > INT32_MAX */
    case 4: return -2147483649LL;         /* < INT32_MIN */
    case 5: return 0x123456789abcLL;
    case 6: return -0x7edcba987654321LL;
    default: {
        int64_t v = (int64_t)rnd64();
        if (v == INT64_MIN) v = INT64_MIN + 1;   /* keep -v representable for literal emission */
        return v;
    }
    }
}

static int64_t pick_arg(Ty t) {
    if (t == TY_I32) return pick_i32();
    if (t == TY_I64) return pick_i64();
    return (int64_t)(rnd64() & 1);
}

/* ---- shared callee semantics (oracle) ---- */
static uint64_t widen(Ty t, int64_t v) {
    if (t == TY_BOOL) return v ? 1u : 0u;
    if (t == TY_I32) return (uint64_t)(int64_t)(int32_t)v;
    return (uint64_t)v;
}
static int64_t callee_eval(const Sig *s) {
    uint64_t acc = s->k;
    for (int i = 0; i < s->nparams; i++)
        acc = acc * 31u + widen(s->params[i], s->args[i]);
    if (s->ret == TY_I32) return (int32_t)(uint32_t)acc;
    if (s->ret == TY_BOOL) return (int64_t)(acc & 1u);
    return (int64_t)acc;
}
static int expect_of(const Sig *sigs, int n) {
    uint64_t sum = 0;
    for (int i = 0; i < n; i++)
        sum = sum * 33u ^ widen(sigs[i].ret, callee_eval(&sigs[i]));
    return (int)(sum & 127u);
}

/* ---- output buffer ---- */
static char g_buf[1 << 20];
static size_t g_len;
static void sb(const char *fmt, ...) {
    va_list ap;
    va_start(ap, fmt);
    g_len += (size_t)vsnprintf(g_buf + g_len, sizeof(g_buf) - g_len, fmt, ap);
    va_end(ap);
}
static int flush_to(const char *dir, const char *name) {
    char path[4096];
    snprintf(path, sizeof(path), "%s/%s", dir, name);
    FILE *f = fopen(path, "wb");
    if (!f) { fprintf(stderr, "abi_gen: cannot open %s\n", path); return 0; }
    fwrite(g_buf, 1, g_len, f);
    fclose(f);
    g_len = 0;
    return 1;
}

static const char *cheng_ty(Ty t) {
    return t == TY_I32 ? "int32" : t == TY_I64 ? "int64" : "bool";
}
static const char *c_ty(Ty t) {
    return t == TY_I32 ? "int32_t" : t == TY_I64 ? "int64_t" : "bool";
}

/* Cheng literal for an argument value */
static void sb_cheng_lit(Ty t, int64_t v) {
    if (t == TY_BOOL) { sb(v ? "true" : "false"); return; }
    if (t == TY_I32) {
        if (v == -2147483647LL - 1) sb("(0 - 2147483647 - 1)");
        else if (v < 0) sb("(0 - %lld)", -(long long)v);
        else sb("%lld", (long long)v);
        return;
    }
    /* INT64_MIN excluded by pick_i64 */
    if (v < 0) sb("(int64(0) - int64(%lld))", -(long long)v);
    else sb("int64(%lld)", (long long)v);
}

/* C literal for an argument value */
static void sb_c_lit(Ty t, int64_t v) {
    if (t == TY_BOOL) { sb(v ? "true" : "false"); return; }
    if (t == TY_I32) {
        if (v == -2147483647LL - 1) sb("(-2147483647 - 1)");
        else sb("%lld", (long long)v);
        return;
    }
    if (v == INT64_MIN) sb("(-9223372036854775807LL - 1)");
    else sb("%lldLL", (long long)v);
}

/* C function with the shared callee semantics. */
static void sb_c_fn(const char *prefix, int idx, const Sig *s, int isStatic) {
    sb("%s%s %s%d(", isStatic ? "static " : "", c_ty(s->ret), prefix, idx);
    if (s->nparams == 0) sb("void");
    for (int p = 0; p < s->nparams; p++)
        sb("%s%s _a%d", p ? ", " : "", c_ty(s->params[p]), p);
    sb(") {\n");
    sb("    uint64_t acc = %lluULL;\n", (unsigned long long)s->k);
    for (int p = 0; p < s->nparams; p++) {
        if (s->params[p] == TY_BOOL)
            sb("    acc = acc * 31u + (_a%d ? 1u : 0u);\n", p);
        else if (s->params[p] == TY_I32)
            sb("    acc = acc * 31u + (uint64_t)(int64_t)_a%d;\n", p);
        else
            sb("    acc = acc * 31u + (uint64_t)_a%d;\n", p);
    }
    if (s->ret == TY_I32) sb("    return (int32_t)(uint32_t)acc;\n");
    else if (s->ret == TY_BOOL) sb("    return (acc & 1u) != 0u;\n");
    else sb("    return (int64_t)acc;\n");
    sb("}\n\n");
}

/* C prototype (extern decl) */
static void sb_c_proto(const char *prefix, int idx, const Sig *s) {
    sb("extern %s %s%d(", c_ty(s->ret), prefix, idx);
    if (s->nparams == 0) sb("void");
    for (int p = 0; p < s->nparams; p++)
        sb("%s%s", p ? ", " : "", c_ty(s->params[p]));
    sb(");\n");
}

/* C aggregation statement: sum = sum * 33u ^ widen(call); */
static void sb_c_call_agg(const char *prefix, int idx, const Sig *s) {
    sb("    sum = sum * 33u ^ ");
    if (s->ret == TY_BOOL) sb("(%s%d(", prefix, idx);
    else if (s->ret == TY_I32) sb("(uint64_t)(int64_t)(%s%d(", prefix, idx);
    else sb("(uint64_t)(%s%d(", prefix, idx);
    for (int p = 0; p < s->nparams; p++) {
        if (p) sb(", ");
        sb_c_lit(s->params[p], s->args[p]);
    }
    if (s->ret == TY_BOOL) sb(") ? 1u : 0u);\n");
    else sb("));\n");
}

/* C main aggregating calls to <prefix><i> for sigs[0..n) */
static void sb_c_main(const char *prefix, const Sig *sigs, int n) {
    sb("int main(void) {\n    uint64_t sum = 0;\n");
    for (int i = 0; i < n; i++)
        sb_c_call_agg(prefix, i, &sigs[i]);
    sb("    return (int)(sum & 127u);\n}\n");
}

int main(int argc, char **argv) {
    long long seed = -1;
    const char *outdir = 0;
    for (int i = 1; i < argc; i++) {
        if (!strncmp(argv[i], "--seed:", 7)) seed = atoll(argv[i] + 7);
        else if (!strncmp(argv[i], "--outdir:", 9)) outdir = argv[i] + 9;
    }
    if (seed < 0 || !outdir) {
        fprintf(stderr, "usage: abi_conformance_gen --seed:N --outdir:DIR\n");
        return 2;
    }
    g_state = (uint64_t)seed * 0x9e3779b97f4a7c15ULL + 0x1234567ULL;
    for (int i = 0; i < 4; i++) rnd64();

    int nimp = 3 + (int)rnd(6);   /* 3..8 import-direction functions */
    int nexp = 3 + (int)rnd(6);   /* 3..8 export-direction functions */
    Sig imp[MAX_FN], expt[MAX_FN];

    for (int i = 0; i < nimp; i++) {
        imp[i].nparams = (int)rnd(MAX_PAR + 1);
        for (int p = 0; p < imp[i].nparams; p++) imp[i].params[p] = (Ty)rnd(3);
        imp[i].ret = (Ty)rnd(3);
        imp[i].k = (uint64_t)(i + 1) * 1000003u + 7u;
        for (int p = 0; p < imp[i].nparams; p++)
            imp[i].args[p] = pick_arg(imp[i].params[p]);
    }
    for (int i = 0; i < nexp; i++) {
        expt[i].nparams = (int)rnd(MAX_PAR + 1);
        for (int p = 0; p < expt[i].nparams; p++) expt[i].params[p] = (Ty)rnd(3);
        expt[i].ret = (Ty)rnd(3);
        expt[i].k = (uint64_t)(i + 101) * 1000003u + 7u;
        for (int p = 0; p < expt[i].nparams; p++)
            expt[i].args[p] = pick_arg(expt[i].params[p]);
    }

    int expect_imp = expect_of(imp, nimp);
    int expect_exp = expect_of(expt, nexp);

    /* ---- imp_main.cheng ---- */
    g_len = 0;
    sb("# generated by tools/fuzz/abi_conformance_gen.c seed=%lld expect_imp=%d\n\n",
       seed, expect_imp);
    for (int i = 0; i < nimp; i++) {
        sb("@importc(\"c_f%d\")\nfn CF%d(", i, i);
        for (int p = 0; p < imp[i].nparams; p++)
            sb("%sp%d: %s", p ? ", " : "", p, cheng_ty(imp[i].params[p]));
        sb("): %s\n\n", cheng_ty(imp[i].ret));
    }
    sb("fn main(): int32 =\n");
    sb("    var sum: int64 = int64(0)\n");
    for (int i = 0; i < nimp; i++) {
        sb("    let r%d: %s = CF%d(", i, cheng_ty(imp[i].ret), i);
        for (int p = 0; p < imp[i].nparams; p++) {
            if (p) sb(", ");
            sb_cheng_lit(imp[i].params[p], imp[i].args[p]);
        }
        sb(")\n");
        if (imp[i].ret == TY_BOOL)
            sb("    sum = (sum * int64(33)) ^ (r%d ? int64(1) : int64(0))\n", i);
        else if (imp[i].ret == TY_I32)
            sb("    sum = (sum * int64(33)) ^ int64(r%d)\n", i);
        else
            sb("    sum = (sum * int64(33)) ^ r%d\n", i);
    }
    sb("    return int32(sum & int64(127))\n");
    if (!flush_to(outdir, "imp_main.cheng")) return 2;

    /* ---- imp_impl.c ---- */
    g_len = 0;
    sb("/* generated by tools/fuzz/abi_conformance_gen.c seed=%lld (import impls) */\n", seed);
    sb("#include <stdint.h>\n#include <stdbool.h>\n\n");
    for (int i = 0; i < nimp; i++)
        sb_c_fn("c_f", i, &imp[i], 0);
    if (!flush_to(outdir, "imp_impl.c")) return 2;

    /* ---- imp_mirror.c ---- */
    g_len = 0;
    sb("/* generated by tools/fuzz/abi_conformance_gen.c seed=%lld expect_imp=%d (mirror) */\n",
       seed, expect_imp);
    sb("#include <stdint.h>\n#include <stdbool.h>\n\n");
    for (int i = 0; i < nimp; i++)
        sb_c_fn("m_c_f", i, &imp[i], 1);
    sb_c_main("m_c_f", imp, nimp);
    if (!flush_to(outdir, "imp_mirror.c")) return 2;

    /* ---- exp_mod.cheng ---- */
    g_len = 0;
    sb("# generated by tools/fuzz/abi_conformance_gen.c seed=%lld (export module)\n\n", seed);
    for (int i = 0; i < nexp; i++) {
        sb("@exportc(\"ch_f%d\")\nfn ChF%d(", i, i);
        for (int p = 0; p < expt[i].nparams; p++)
            sb("%sp%d: %s", p ? ", " : "", p, cheng_ty(expt[i].params[p]));
        sb("): %s =\n", cheng_ty(expt[i].ret));
        sb("    var acc: int64 = int64(%llu)\n", (unsigned long long)expt[i].k);
        for (int p = 0; p < expt[i].nparams; p++) {
            if (expt[i].params[p] == TY_BOOL)
                sb("    acc = (acc * int64(31)) + (p%d ? int64(1) : int64(0))\n", p);
            else if (expt[i].params[p] == TY_I32)
                sb("    acc = (acc * int64(31)) + int64(p%d)\n", p);
            else
                sb("    acc = (acc * int64(31)) + p%d\n", p);
        }
        if (expt[i].ret == TY_I32)
            sb("    return int32(acc)\n");
        else if (expt[i].ret == TY_BOOL)
            sb("    return (acc & int64(1)) == int64(1)\n");
        else
            sb("    return acc\n");
        sb("\n");
    }
    if (!flush_to(outdir, "exp_mod.cheng")) return 2;

    /* ---- exp_main.c ---- */
    g_len = 0;
    sb("/* generated by tools/fuzz/abi_conformance_gen.c seed=%lld expect_exp=%d (export harness) */\n",
       seed, expect_exp);
    sb("#include <stdint.h>\n#include <stdbool.h>\n\n");
    for (int i = 0; i < nexp; i++)
        sb_c_proto("ch_f", i, &expt[i]);
    sb("\n");
    sb_c_main("ch_f", expt, nexp);
    if (!flush_to(outdir, "exp_main.c")) return 2;

    /* ---- exp_mirror.c ---- */
    g_len = 0;
    sb("/* generated by tools/fuzz/abi_conformance_gen.c seed=%lld expect_exp=%d (mirror) */\n",
       seed, expect_exp);
    sb("#include <stdint.h>\n#include <stdbool.h>\n\n");
    for (int i = 0; i < nexp; i++)
        sb_c_fn("m_ch_f", i, &expt[i], 1);
    sb_c_main("m_ch_f", expt, nexp);
    if (!flush_to(outdir, "exp_mirror.c")) return 2;

    printf("expect_imp=%d expect_exp=%d\n", expect_imp, expect_exp);
    return 0;
}
