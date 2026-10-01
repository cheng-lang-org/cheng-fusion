/*
 * cheng_program_gen.c — deterministic random Cheng program generator with a
 * built-in reference evaluator (the third oracle for differential testing).
 *
 * Usage:
 *   cheng_program_gen --seed:42 --out:/abs/prog.cheng [--features:all|min|csv]
 * Prints one line to stdout:  expect=<exit code 0..127>
 *
 * Build: cc -std=c11 -O2 -o gen tools/fuzz/cheng_program_gen.c
 * Driver: tools/diff_fuzz_test.sh
 *
 * Generated programs use only spec-stable integer/bool constructs with fully
 * parenthesized expressions, no div/mod, no strings, no imports, so the
 * reference evaluation is total and deterministic (wrap-around arithmetic,
 * shift count = rhs mod W per docs/cheng-formal-spec.md 1.3.2).
 */
#include <stdarg.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define MAX_EXPR 32768
#define MAX_STMT 8192
#define MAX_VARS 96
#define MAX_FNS 8
#define MAX_PARAMS 13
#define OUT_CAP (1 << 20)

typedef enum { TY_I32 = 0, TY_I64 = 1, TY_BOOL = 2 } Ty;

enum {
    F_BOOL_SIG = 1 << 0, /* bool params / bool returns across calls */
    F_TERNARY  = 1 << 1,
    F_FOR      = 1 << 2,
    F_CALLS    = 1 << 3,
    F_NARROW   = 1 << 4, /* int32(int64expr) truncation */
    F_SHIFT    = 1 << 5, /* << >> incl. negative/oob counts */
    F_I64      = 1 << 6,
    F_WIDE     = 1 << 7, /* extreme constants */
};
#define F_ALL (F_BOOL_SIG | F_TERNARY | F_FOR | F_CALLS | F_NARROW | F_SHIFT | F_I64 | F_WIDE)
#define F_MIN (F_FOR | F_CALLS)

static uint32_t g_features = F_ALL;

/* ---------- deterministic prng (splitmix64) ---------- */
static uint64_t g_state;
static uint64_t rnd_u64(void) {
    uint64_t z = (g_state += 0x9e3779b97f4a7c15ull);
    z = (z ^ (z >> 30)) * 0xbf58476d1ce4e5b9ull;
    z = (z ^ (z >> 27)) * 0x94d049bb133111ebull;
    return z ^ (z >> 31);
}
static int32_t rnd_range(int32_t lo, int32_t hi) { /* inclusive */
    return lo + (int32_t)(rnd_u64() % (uint64_t)((int64_t)hi - (int64_t)lo + 1));
}
static int rnd_pct(int p) { return rnd_range(1, 100) <= p; }

/* ---------- AST ---------- */
typedef enum { EK_CONST, EK_VAR, EK_BIN, EK_CMP, EK_LOG, EK_NOT, EK_TERN, EK_CALL, EK_CONV } EKind;
enum { B_ADD, B_SUB, B_MUL, B_AND, B_OR, B_XOR, B_SHL, B_SHR };
enum { C_EQ, C_NE, C_LT, C_LE, C_GT, C_GE };
enum { L_AND, L_OR };

typedef struct {
    uint8_t kind, ty, op;
    int32_t a, b, c;
    int64_t val;
    int32_t var;
    int32_t fn;
    int32_t argc;
    int32_t args[MAX_PARAMS];
} Expr;

typedef enum { SK_DECL, SK_ASSIGN, SK_IF, SK_FOR, SK_RET } SKind;
typedef struct {
    uint8_t kind;
    uint8_t isVar;
    uint8_t inclusive;
    int32_t var;   /* decl/assign target; for: loop var */
    int32_t expr;  /* decl/assign/ret value; if: cond */
    int32_t lo, hi;
    int32_t thenHead, elseHead, bodyHead;
    int32_t next;
} Stmt;

typedef struct {
    uint8_t ty;
    uint8_t isMut;
    char name[8];
} Var;

typedef struct {
    char name[8];
    int32_t paramCount;
    uint8_t paramTy[MAX_PARAMS];
    uint8_t retTy;
    int32_t varCount;
    Var vars[MAX_VARS];
    int32_t bodyHead;
    int32_t localNames, loopNames;
} Fn;

static Expr g_expr[MAX_EXPR]; static int32_t g_exprCount;
static Stmt g_stmt[MAX_STMT]; static int32_t g_stmtCount;
static Fn g_fns[MAX_FNS]; static int32_t g_fnCount;

static void die_gen(const char *msg) { fprintf(stderr, "cheng_program_gen: %s\n", msg); exit(3); }

static int32_t new_expr(uint8_t kind, uint8_t ty) {
    if (g_exprCount >= MAX_EXPR) die_gen("expr pool overflow");
    Expr *e = &g_expr[g_exprCount];
    memset(e, 0, sizeof *e);
    e->kind = kind; e->ty = ty;
    return g_exprCount++;
}
static int32_t new_stmt(uint8_t kind) {
    if (g_stmtCount >= MAX_STMT) die_gen("stmt pool overflow");
    Stmt *s = &g_stmt[g_stmtCount];
    memset(s, 0, sizeof *s);
    s->kind = kind; s->next = -1;
    s->thenHead = -1; s->elseHead = -1; s->bodyHead = -1;
    return g_stmtCount++;
}

/* ---------- generation ---------- */
typedef struct {
    int32_t fn;
    int32_t visible[MAX_VARS];
    int32_t visCount;
    int isMain; /* main's exit code is OS-truncated &0xff: mask every return with &127 */
} Ctx;

static int32_t ctx_new_var(Ctx *c, uint8_t ty, int isMut, int isLoop) {
    Fn *f = &g_fns[c->fn];
    if (f->varCount >= MAX_VARS) die_gen("var overflow");
    int32_t id = f->varCount++;
    Var *v = &f->vars[id];
    v->ty = ty; v->isMut = (uint8_t)isMut;
    if (isLoop) snprintf(v->name, sizeof v->name, "i%d", f->loopNames++);
    else snprintf(v->name, sizeof v->name, "v%d", f->localNames++);
    c->visible[c->visCount++] = id;
    return id;
}

static uint8_t rnd_int_ty(void) {
    if ((g_features & F_I64) && rnd_pct(35)) return TY_I64;
    return TY_I32;
}

static int64_t rnd_const_val(uint8_t ty) {
    if (ty == TY_BOOL) return rnd_range(0, 1);
    if ((g_features & F_WIDE) && rnd_pct(12)) {
        /* INT32_MIN is excluded: `(-2147483648)` does not round-trip as an i32 literal. */
        static const int64_t wide[] = { INT32_MAX, -2147483647LL, -1, 0x7fff, 0x10000, 0x55555555LL, -0x33333333LL };
        return wide[rnd_range(0, (int32_t)(sizeof wide / sizeof wide[0]) - 1)];
    }
    return rnd_range(-1024, 1024);
}

static int32_t gen_const(uint8_t ty) {
    int32_t e = new_expr(EK_CONST, ty);
    g_expr[e].val = rnd_const_val(ty);
    return e;
}

static int32_t pick_var(Ctx *c, uint8_t ty, int mutOnly) {
    int32_t cand[MAX_VARS]; int32_t n = 0;
    for (int32_t i = 0; i < c->visCount; i++) {
        Var *v = &g_fns[c->fn].vars[c->visible[i]];
        if (v->ty != ty) continue;
        if (mutOnly && !v->isMut) continue;
        cand[n++] = c->visible[i];
    }
    if (n == 0) return -1;
    return cand[rnd_range(0, n - 1)];
}

static int32_t pick_callee(Ctx *c, uint8_t retTy) {
    int32_t cand[MAX_FNS]; int32_t n = 0;
    for (int32_t i = 0; i < c->fn && i < g_fnCount; i++)
        if (g_fns[i].retTy == retTy) cand[n++] = i;
    if (n == 0) return -1;
    return cand[rnd_range(0, n - 1)];
}

static int32_t gen_expr(Ctx *c, uint8_t ty, int depth);

static int32_t gen_leaf(Ctx *c, uint8_t ty) {
    int32_t v = pick_var(c, ty, 0);
    if (v >= 0 && rnd_pct(60)) {
        int32_t e = new_expr(EK_VAR, ty);
        g_expr[e].var = v;
        return e;
    }
    return gen_const(ty);
}

static int32_t gen_call(Ctx *c, uint8_t ty, int depth) {
    int32_t callee = pick_callee(c, ty);
    if (callee < 0) return -1;
    int32_t e = new_expr(EK_CALL, ty);
    g_expr[e].fn = callee;
    g_expr[e].argc = g_fns[callee].paramCount;
    for (int32_t i = 0; i < g_fns[callee].paramCount; i++)
        g_expr[e].args[i] = gen_expr(c, g_fns[callee].paramTy[i], depth - 1);
    return e;
}

static int32_t gen_bool_expr(Ctx *c, int depth) {
    if (depth <= 0 || rnd_pct(20)) return gen_leaf(c, TY_BOOL);
    int r = rnd_range(1, 100);
    if (r <= 50) { /* comparison over ints */
        uint8_t oty = rnd_int_ty();
        int32_t e = new_expr(EK_CMP, TY_BOOL);
        g_expr[e].op = (uint8_t)rnd_range(C_EQ, C_GE);
        g_expr[e].a = gen_expr(c, oty, depth - 1);
        g_expr[e].b = gen_expr(c, oty, depth - 1);
        return e;
    }
    if (r <= 75) {
        int32_t e = new_expr(EK_LOG, TY_BOOL);
        g_expr[e].op = (uint8_t)rnd_range(L_AND, L_OR);
        g_expr[e].a = gen_bool_expr(c, depth - 1);
        g_expr[e].b = gen_bool_expr(c, depth - 1);
        return e;
    }
    if (r <= 87) {
        int32_t e = new_expr(EK_NOT, TY_BOOL);
        g_expr[e].a = gen_bool_expr(c, depth - 1);
        return e;
    }
    if ((g_features & F_CALLS) && (g_features & F_BOOL_SIG)) {
        int32_t e = gen_call(c, TY_BOOL, depth);
        if (e >= 0) return e;
    }
    return gen_leaf(c, TY_BOOL);
}

static int32_t gen_expr(Ctx *c, uint8_t ty, int depth) {
    if (ty == TY_BOOL) return gen_bool_expr(c, depth);
    if (depth <= 0 || rnd_pct(22)) return gen_leaf(c, ty);
    int r = rnd_range(1, 100);
    if (r <= 52) { /* binary */
        int hi = (g_features & F_SHIFT) ? B_SHR : B_XOR;
        uint8_t op = (uint8_t)rnd_range(B_ADD, hi);
        int32_t e = new_expr(EK_BIN, ty);
        g_expr[e].op = op;
        g_expr[e].a = gen_expr(c, ty, depth - 1);
        if ((op == B_SHL || op == B_SHR) && rnd_pct(70)) {
            int32_t s = new_expr(EK_CONST, ty);
            g_expr[s].val = rnd_range(-3, 40);
            g_expr[e].b = s;
        } else {
            g_expr[e].b = gen_expr(c, ty, depth - 1);
        }
        return e;
    }
    if (r <= 64 && (g_features & F_TERNARY)) {
        int32_t e = new_expr(EK_TERN, ty);
        g_expr[e].c = gen_bool_expr(c, depth - 1);
        g_expr[e].a = gen_expr(c, ty, depth - 1);
        g_expr[e].b = gen_expr(c, ty, depth - 1);
        return e;
    }
    if (r <= 76 && (g_features & F_I64)) {
        if (ty == TY_I64) { /* widening: int64(i32) */
            int32_t e = new_expr(EK_CONV, TY_I64);
            g_expr[e].a = gen_expr(c, TY_I32, depth - 1);
            return e;
        }
        if (g_features & F_NARROW) { /* narrowing: int32(i64) */
            int32_t e = new_expr(EK_CONV, TY_I32);
            g_expr[e].a = gen_expr(c, TY_I64, depth - 1);
            return e;
        }
    }
    if (r <= 90 && (g_features & F_CALLS)) {
        int32_t e = gen_call(c, ty, depth);
        if (e >= 0) return e;
    }
    return gen_leaf(c, ty);
}

/* statement list builder */
typedef struct { int32_t head, tail; } SList;
static void slist_init(SList *l) { l->head = -1; l->tail = -1; }
static void slist_push(SList *l, int32_t s) {
    if (l->head < 0) { l->head = s; l->tail = s; return; }
    g_stmt[l->tail].next = s; l->tail = s;
}

/* the compilers reject statements that follow a construct which returns on
   every path (dead code in the same suite), so generation must stop there */
static int list_always_returns(int32_t head);
static int stmt_always_returns(int32_t si) {
    Stmt *st = &g_stmt[si];
    if (st->kind == SK_RET) return 1;
    if (st->kind == SK_IF)
        return st->elseHead >= 0 && list_always_returns(st->thenHead) && list_always_returns(st->elseHead);
    return 0;
}
static int list_always_returns(int32_t head) {
    for (int32_t s = head; s >= 0; s = g_stmt[s].next)
        if (stmt_always_returns(s)) return 1;
    return 0;
}

static void guard_nondefault_init(int32_t e) {
    /* `let x: T = <implicit default literal>` is a compile-time hard error;
       bump literal zero/false initializers to a non-default value. */
    Expr *x = &g_expr[e];
    if (x->kind != EK_CONST) return;
    if (x->ty == TY_BOOL) x->val = 1;
    else if (x->val == 0) x->val = (int64_t)rnd_range(1, 9);
}

static void gen_action(Ctx *c, SList *out, int stmtDepth, uint8_t retTy);

static void gen_block(Ctx *c, SList *out, int count, int stmtDepth, uint8_t retTy) {
    for (int i = 0; i < count; i++) {
        gen_action(c, out, stmtDepth, retTy);
        if (out->tail >= 0 && stmt_always_returns(out->tail)) break;
    }
    if (out->head < 0) { /* a suite cannot be empty: synthesize an assignment or no-op decl */
        int32_t tgt = pick_var(c, TY_I32, 1);
        if (tgt >= 0) {
            int32_t s = new_stmt(SK_ASSIGN);
            g_stmt[s].var = tgt;
            g_stmt[s].expr = gen_expr(c, TY_I32, 1);
            slist_push(out, s);
        } else {
            int32_t s = new_stmt(SK_DECL);
            g_stmt[s].isVar = 0;
            g_stmt[s].var = ctx_new_var(c, TY_I32, 0, 0);
            g_stmt[s].expr = gen_expr(c, TY_I32, 1);
            guard_nondefault_init(g_stmt[s].expr);
            slist_push(out, s);
        }
    }
}

static void gen_flat_stmt(Ctx *c, SList *out) {
    int32_t tgt = pick_var(c, TY_I32, 1);
    if (tgt < 0) tgt = pick_var(c, TY_I64, 1);
    if (tgt >= 0) {
        int32_t s = new_stmt(SK_ASSIGN);
        g_stmt[s].var = tgt;
        g_stmt[s].expr = gen_expr(c, g_fns[c->fn].vars[tgt].ty, 2);
        slist_push(out, s);
        return;
    }
    int32_t s = new_stmt(SK_DECL);
    g_stmt[s].isVar = 0;
    g_stmt[s].expr = gen_expr(c, TY_I32, 1); /* RHS before the var becomes visible */
    g_stmt[s].var = ctx_new_var(c, TY_I32, 0, 0);
    guard_nondefault_init(g_stmt[s].expr);
    slist_push(out, s);
}

static void gen_action(Ctx *c, SList *out, int stmtDepth, uint8_t retTy) {
    if (stmtDepth >= 3) { /* hard nesting cap: only flat statements */
        gen_flat_stmt(c, out);
        return;
    }
    int r = rnd_range(1, 100);
    if (r <= 45) { /* assignment to a mutable var */
        uint8_t ty = rnd_int_ty();
        int32_t tgt = pick_var(c, ty, 1);
        if (tgt < 0) { tgt = pick_var(c, TY_I32, 1); ty = TY_I32; }
        if (tgt >= 0) {
            int32_t s = new_stmt(SK_ASSIGN);
            g_stmt[s].var = tgt;
            g_stmt[s].expr = gen_expr(c, g_fns[c->fn].vars[tgt].ty, 2);
            slist_push(out, s);
            return;
        }
        r = 50; /* fall through to if */
    }
    if (r <= 70 || stmtDepth >= 2 || !(g_features & F_FOR)) {
        if (stmtDepth >= 1 && rnd_pct(18)) { /* nested early return */
            int32_t s = new_stmt(SK_RET);
            int32_t e = gen_expr(c, retTy, 2);
            if (c->isMain) { /* keep main's exit codes in 0..127 */
                int32_t m = new_expr(EK_BIN, TY_I32);
                g_expr[m].op = B_AND;
                g_expr[m].a = e;
                int32_t mask = new_expr(EK_CONST, TY_I32);
                g_expr[mask].val = 127;
                g_expr[m].b = mask;
                e = m;
            }
            g_stmt[s].expr = e;
            slist_push(out, s);
            return;
        }
        int32_t s = new_stmt(SK_IF);
        g_stmt[s].expr = gen_bool_expr(c, 2);
        SList thenL; slist_init(&thenL);
        int32_t savedVis = c->visCount;
        gen_block(c, &thenL, rnd_range(1, 2), stmtDepth + 1, retTy);
        c->visCount = savedVis;
        g_stmt[s].thenHead = thenL.head;
        if (rnd_pct(50)) {
            SList elseL; slist_init(&elseL);
            gen_block(c, &elseL, rnd_range(1, 2), stmtDepth + 1, retTy);
            c->visCount = savedVis;
            g_stmt[s].elseHead = elseL.head;
        }
        slist_push(out, s);
        return;
    }
    /* for loop over constant range */
    int32_t s = new_stmt(SK_FOR);
    int32_t savedVis = c->visCount;
    g_stmt[s].var = ctx_new_var(c, TY_I32, 0, 1);
    g_stmt[s].lo = rnd_range(0, 5);
    g_stmt[s].hi = g_stmt[s].lo + rnd_range(0, 6);
    g_stmt[s].inclusive = (uint8_t)rnd_pct(30);
    SList body; slist_init(&body);
    gen_block(c, &body, rnd_range(1, 2), stmtDepth + 1, retTy);
    g_stmt[s].bodyHead = body.head;
    c->visCount = savedVis; /* loop var goes out of scope */
    slist_push(out, s);
}

static uint8_t rnd_sig_ty(void) {
    if ((g_features & F_BOOL_SIG) && rnd_pct(20)) return TY_BOOL;
    return rnd_int_ty();
}

static void gen_fn(int32_t idx, int isMain) {
    Fn *f = &g_fns[idx];
    memset(f, 0, sizeof *f);
    Ctx c; memset(&c, 0, sizeof c); c.fn = idx;
    SList body; slist_init(&body);

    if (isMain) {
        snprintf(f->name, sizeof f->name, "main");
        f->retTy = TY_I32;
        f->paramCount = 0;
        c.isMain = 1;
        /* var chk: int32 = <const != 0> */
        int32_t chk = ctx_new_var(&c, TY_I32, 1, 0);
        int32_t d = new_stmt(SK_DECL);
        g_stmt[d].isVar = 1; g_stmt[d].var = chk;
        int32_t init = new_expr(EK_CONST, TY_I32);
        g_expr[init].val = rnd_range(1, 99);
        g_stmt[d].expr = init;
        slist_push(&body, d);
        /* fold every helper at least once */
        for (int32_t k = 0; k < idx; k++) {
            Fn *callee = &g_fns[k];
            int32_t call = new_expr(EK_CALL, callee->retTy);
            g_expr[call].fn = k;
            g_expr[call].argc = callee->paramCount;
            for (int32_t i = 0; i < callee->paramCount; i++)
                g_expr[call].args[i] = gen_expr(&c, callee->paramTy[i], 2);
            if (callee->retTy == TY_BOOL) {
                /* if call(): chk = (chk ^ c1) else: chk = (chk ^ c2) */
                int32_t s = new_stmt(SK_IF);
                g_stmt[s].expr = call;
                SList thenL, elseL; slist_init(&thenL); slist_init(&elseL);
                int32_t a1 = new_stmt(SK_ASSIGN);
                g_stmt[a1].var = chk;
                int32_t x1 = new_expr(EK_BIN, TY_I32); g_expr[x1].op = B_XOR;
                int32_t vc1 = new_expr(EK_VAR, TY_I32); g_expr[vc1].var = chk;
                int32_t k1 = new_expr(EK_CONST, TY_I32); g_expr[k1].val = rnd_range(1, 4095);
                g_expr[x1].a = vc1; g_expr[x1].b = k1;
                g_stmt[a1].expr = x1; slist_push(&thenL, a1);
                int32_t a2 = new_stmt(SK_ASSIGN);
                g_stmt[a2].var = chk;
                int32_t x2 = new_expr(EK_BIN, TY_I32); g_expr[x2].op = B_XOR;
                int32_t vc2 = new_expr(EK_VAR, TY_I32); g_expr[vc2].var = chk;
                int32_t k2 = new_expr(EK_CONST, TY_I32); g_expr[k2].val = rnd_range(1, 4095);
                g_expr[x2].a = vc2; g_expr[x2].b = k2;
                g_stmt[a2].expr = x2; slist_push(&elseL, a2);
                g_stmt[s].thenHead = thenL.head;
                g_stmt[s].elseHead = elseL.head;
                slist_push(&body, s);
            } else {
                int32_t folded = call;
                if (callee->retTy == TY_I64) {
                    if (g_features & F_NARROW) {
                        int32_t cv = new_expr(EK_CONV, TY_I32);
                        g_expr[cv].a = call;
                        folded = cv;
                    } else {
                        /* compare-based fold avoids narrowing */
                        int32_t s = new_stmt(SK_IF);
                        int32_t cmp = new_expr(EK_CMP, TY_BOOL);
                        g_expr[cmp].op = C_GT;
                        g_expr[cmp].a = call;
                        int32_t z = new_expr(EK_CONST, TY_I64); g_expr[z].val = 0;
                        g_expr[cmp].b = z;
                        g_stmt[s].expr = cmp;
                        SList thenL; slist_init(&thenL);
                        int32_t a1 = new_stmt(SK_ASSIGN);
                        g_stmt[a1].var = chk;
                        int32_t x1 = new_expr(EK_BIN, TY_I32); g_expr[x1].op = B_XOR;
                        int32_t vc1 = new_expr(EK_VAR, TY_I32); g_expr[vc1].var = chk;
                        int32_t k1 = new_expr(EK_CONST, TY_I32); g_expr[k1].val = rnd_range(1, 4095);
                        g_expr[x1].a = vc1; g_expr[x1].b = k1;
                        g_stmt[a1].expr = x1; slist_push(&thenL, a1);
                        g_stmt[s].thenHead = thenL.head;
                        slist_push(&body, s);
                        folded = -1;
                    }
                }
                if (folded >= 0) {
                    int32_t a = new_stmt(SK_ASSIGN);
                    g_stmt[a].var = chk;
                    int32_t x = new_expr(EK_BIN, TY_I32); g_expr[x].op = B_XOR;
                    int32_t vc = new_expr(EK_VAR, TY_I32); g_expr[vc].var = chk;
                    g_expr[x].a = vc; g_expr[x].b = folded;
                    g_stmt[a].expr = x;
                    slist_push(&body, a);
                }
            }
        }
        int nExtra = rnd_range(0, 2);
        for (int i = 0; i < nExtra; i++) {
            gen_action(&c, &body, 0, TY_I32);
            if (body.tail >= 0 && stmt_always_returns(body.tail)) break;
        }
        if (!(body.tail >= 0 && stmt_always_returns(body.tail))) {
            /* return (chk & 127) */
            int32_t ret = new_stmt(SK_RET);
            int32_t m = new_expr(EK_BIN, TY_I32); g_expr[m].op = B_AND;
            int32_t vc = new_expr(EK_VAR, TY_I32); g_expr[vc].var = chk;
            int32_t mask = new_expr(EK_CONST, TY_I32); g_expr[mask].val = 127;
            g_expr[m].a = vc; g_expr[m].b = mask;
            g_stmt[ret].expr = m;
            slist_push(&body, ret);
        }
        f->bodyHead = body.head;
        return;
    }

    snprintf(f->name, sizeof f->name, "f%d", (int)idx);
    f->retTy = rnd_sig_ty();
    f->paramCount = rnd_range(0, 12); /* > 8 exercises stack-passing ABI */
    for (int32_t i = 0; i < f->paramCount; i++) {
        f->paramTy[i] = rnd_sig_ty();
        int32_t id = ctx_new_var(&c, f->paramTy[i], 0, 0);
        snprintf(f->vars[id].name, sizeof f->vars[id].name, "p%d", (int)i);
    }
    f->localNames = 0;
    int nDecl = rnd_range(1, 3);
    for (int i = 0; i < nDecl; i++) {
        uint8_t ty = rnd_pct(15) ? TY_BOOL : rnd_int_ty();
        int isVar = rnd_pct(65);
        int32_t s = new_stmt(SK_DECL);
        g_stmt[s].isVar = (uint8_t)isVar;
        /* init expr first so the new binding cannot reference itself */
        g_stmt[s].expr = gen_expr(&c, ty, 2);
        guard_nondefault_init(g_stmt[s].expr);
        g_stmt[s].var = ctx_new_var(&c, ty, isVar, 0);
        slist_push(&body, s);
    }
    int nAct = rnd_range(1, 4);
    for (int i = 0; i < nAct; i++) {
        gen_action(&c, &body, 0, f->retTy);
        if (body.tail >= 0 && stmt_always_returns(body.tail)) break;
    }
    if (!(body.tail >= 0 && stmt_always_returns(body.tail))) {
        int32_t ret = new_stmt(SK_RET);
        g_stmt[ret].expr = gen_expr(&c, f->retTy, 3);
        slist_push(&body, ret);
    }
    f->bodyHead = body.head;
}

/* ---------- reference evaluation ---------- */
typedef struct {
    int64_t vals[MAX_VARS];
    int returned;
    int64_t retVal;
} Frame;

static int64_t wrap_ty(uint8_t ty, int64_t x) {
    if (ty == TY_I32) return (int64_t)(int32_t)(uint64_t)x;
    if (ty == TY_BOOL) return x != 0;
    return x;
}
static int64_t ashr_w(uint8_t ty, int64_t a, int32_t k) {
    if (ty == TY_I32) {
        int32_t v = (int32_t)(uint64_t)a;
        if (k == 0) return v;
        if (v < 0) return (int64_t)(int32_t)~((~(uint32_t)v) >> k);
        return (int64_t)(int32_t)((uint32_t)v >> k);
    }
    if (k == 0) return a;
    if (a < 0) return (int64_t)~((~(uint64_t)a) >> k);
    return (int64_t)((uint64_t)a >> k);
}

static int64_t eval_call(int32_t fnIdx, const int64_t *args);

static int64_t eval_expr(int32_t fnIdx, Frame *fr, int32_t ei) {
    Expr *e = &g_expr[ei];
    switch ((EKind)e->kind) {
    case EK_CONST: return wrap_ty(e->ty, e->val);
    case EK_VAR: return fr->vals[e->var];
    case EK_BIN: {
        int64_t a = eval_expr(fnIdx, fr, e->a);
        int64_t b = eval_expr(fnIdx, fr, e->b);
        int32_t W = (e->ty == TY_I32) ? 32 : 64;
        switch (e->op) {
        case B_ADD: return wrap_ty(e->ty, (int64_t)((uint64_t)a + (uint64_t)b));
        case B_SUB: return wrap_ty(e->ty, (int64_t)((uint64_t)a - (uint64_t)b));
        case B_MUL: return wrap_ty(e->ty, (int64_t)((uint64_t)a * (uint64_t)b));
        case B_AND: return wrap_ty(e->ty, a & b);
        case B_OR:  return wrap_ty(e->ty, a | b);
        case B_XOR: return wrap_ty(e->ty, a ^ b);
        case B_SHL: {
            int32_t k = (int32_t)(((b % W) + W) % W);
            return wrap_ty(e->ty, (int64_t)((uint64_t)a << k));
        }
        case B_SHR: {
            int32_t k = (int32_t)(((b % W) + W) % W);
            return ashr_w(e->ty, a, k);
        }
        }
        die_gen("bad bin op");
    }
    case EK_CMP: {
        int64_t a = eval_expr(fnIdx, fr, e->a);
        int64_t b = eval_expr(fnIdx, fr, e->b);
        switch (e->op) {
        case C_EQ: return a == b;
        case C_NE: return a != b;
        case C_LT: return a < b;
        case C_LE: return a <= b;
        case C_GT: return a > b;
        case C_GE: return a >= b;
        }
        die_gen("bad cmp op");
    }
    case EK_LOG: {
        int64_t a = eval_expr(fnIdx, fr, e->a);
        if (e->op == L_AND) return a ? (eval_expr(fnIdx, fr, e->b) != 0) : 0;
        return a ? 1 : (eval_expr(fnIdx, fr, e->b) != 0);
    }
    case EK_NOT: return eval_expr(fnIdx, fr, e->a) == 0;
    case EK_TERN:
        return eval_expr(fnIdx, fr, e->c) ? eval_expr(fnIdx, fr, e->a)
                                          : eval_expr(fnIdx, fr, e->b);
    case EK_CONV: {
        int64_t a = eval_expr(fnIdx, fr, e->a);
        return wrap_ty(e->ty, a);
    }
    case EK_CALL: {
        int64_t args[MAX_PARAMS];
        for (int32_t i = 0; i < e->argc; i++) args[i] = eval_expr(fnIdx, fr, e->args[i]);
        return eval_call(e->fn, args);
    }
    }
    die_gen("bad expr kind");
    return 0;
}

static void eval_stmts(int32_t fnIdx, Frame *fr, int32_t head) {
    for (int32_t s = head; s >= 0 && !fr->returned; s = g_stmt[s].next) {
        Stmt *st = &g_stmt[s];
        switch ((SKind)st->kind) {
        case SK_DECL:
        case SK_ASSIGN:
            fr->vals[st->var] = eval_expr(fnIdx, fr, st->expr);
            break;
        case SK_IF:
            if (eval_expr(fnIdx, fr, st->expr)) eval_stmts(fnIdx, fr, st->thenHead);
            else if (st->elseHead >= 0) eval_stmts(fnIdx, fr, st->elseHead);
            break;
        case SK_FOR: {
            int64_t hi = st->inclusive ? st->hi : (int64_t)st->hi - 1;
            for (int64_t i = st->lo; i <= hi && !fr->returned; i++) {
                fr->vals[st->var] = (int64_t)(int32_t)i;
                eval_stmts(fnIdx, fr, st->bodyHead);
            }
            break;
        }
        case SK_RET:
            fr->retVal = eval_expr(fnIdx, fr, st->expr);
            fr->returned = 1;
            break;
        }
    }
}

static int64_t eval_call(int32_t fnIdx, const int64_t *args) {
    Fn *f = &g_fns[fnIdx];
    Frame fr; memset(&fr, 0, sizeof fr);
    for (int32_t i = 0; i < f->paramCount; i++) fr.vals[i] = wrap_ty(f->paramTy[i], args[i]);
    eval_stmts(fnIdx, &fr, f->bodyHead);
    return wrap_ty(f->retTy, fr.retVal);
}

/* ---------- emission ---------- */
static char g_out[OUT_CAP]; static size_t g_outLen;
static void sb(const char *fmt, ...) {
    va_list ap;
    va_start(ap, fmt);
    int n = vsnprintf(g_out + g_outLen, OUT_CAP - g_outLen, fmt, ap);
    va_end(ap);
    if (n < 0 || g_outLen + (size_t)n >= OUT_CAP) die_gen("output overflow");
    g_outLen += (size_t)n;
}

static const char *ty_name(uint8_t ty) {
    return ty == TY_I32 ? "int32" : ty == TY_I64 ? "int64" : "bool";
}

static void emit_expr(int32_t fnIdx, int32_t ei) {
    Expr *e = &g_expr[ei];
    switch ((EKind)e->kind) {
    case EK_CONST:
        if (e->ty == TY_BOOL) { sb(e->val ? "true" : "false"); return; }
        if (e->ty == TY_I64) {
            if (e->val < 0) sb("int64(-%lld)", (long long)-e->val);
            else sb("int64(%lld)", (long long)e->val);
            return;
        }
        if (e->val < 0) sb("(-%lld)", (long long)-e->val);
        else sb("%lld", (long long)e->val);
        return;
    case EK_VAR: sb("%s", g_fns[fnIdx].vars[e->var].name); return;
    case EK_BIN: {
        static const char *ops[] = { "+", "-", "*", "&", "|", "^", "<<", ">>" };
        sb("("); emit_expr(fnIdx, e->a); sb(" %s ", ops[e->op]); emit_expr(fnIdx, e->b); sb(")");
        return;
    }
    case EK_CMP: {
        static const char *ops[] = { "==", "!=", "<", "<=", ">", ">=" };
        sb("("); emit_expr(fnIdx, e->a); sb(" %s ", ops[e->op]); emit_expr(fnIdx, e->b); sb(")");
        return;
    }
    case EK_LOG:
        sb("("); emit_expr(fnIdx, e->a); sb(e->op == L_AND ? " && " : " || "); emit_expr(fnIdx, e->b); sb(")");
        return;
    case EK_NOT: sb("(!"); emit_expr(fnIdx, e->a); sb(")"); return;
    case EK_TERN:
        sb("("); emit_expr(fnIdx, e->c); sb(" ? "); emit_expr(fnIdx, e->a); sb(" : "); emit_expr(fnIdx, e->b); sb(")");
        return;
    case EK_CONV:
        sb(e->ty == TY_I64 ? "int64(" : "int32(");
        emit_expr(fnIdx, e->a);
        sb(")");
        return;
    case EK_CALL:
        sb("%s(", g_fns[e->fn].name);
        for (int32_t i = 0; i < e->argc; i++) {
            if (i) sb(", ");
            emit_expr(fnIdx, e->args[i]);
        }
        sb(")");
        return;
    }
}

static void indent(int depth) { for (int i = 0; i < depth; i++) sb("    "); }

static void emit_stmts(int32_t fnIdx, int32_t head, int depth) {
    for (int32_t s = head; s >= 0; s = g_stmt[s].next) {
        Stmt *st = &g_stmt[s];
        switch ((SKind)st->kind) {
        case SK_DECL:
            indent(depth);
            sb("%s %s: %s = ", st->isVar ? "var" : "let",
               g_fns[fnIdx].vars[st->var].name, ty_name(g_fns[fnIdx].vars[st->var].ty));
            emit_expr(fnIdx, st->expr);
            sb("\n");
            break;
        case SK_ASSIGN:
            indent(depth);
            sb("%s = ", g_fns[fnIdx].vars[st->var].name);
            emit_expr(fnIdx, st->expr);
            sb("\n");
            break;
        case SK_IF:
            indent(depth);
            sb("if ");
            emit_expr(fnIdx, st->expr);
            sb(":\n");
            emit_stmts(fnIdx, st->thenHead, depth + 1);
            if (st->elseHead >= 0) {
                indent(depth);
                sb("else:\n");
                emit_stmts(fnIdx, st->elseHead, depth + 1);
            }
            break;
        case SK_FOR:
            indent(depth);
            sb("for %s in %d%s%d:\n", g_fns[fnIdx].vars[st->var].name,
               st->lo, st->inclusive ? ".." : "..<", st->hi);
            emit_stmts(fnIdx, st->bodyHead, depth + 1);
            break;
        case SK_RET:
            indent(depth);
            sb("return ");
            emit_expr(fnIdx, st->expr);
            sb("\n");
            break;
        }
    }
}

static void emit_fn(int32_t idx) {
    Fn *f = &g_fns[idx];
    sb("fn %s(", f->name);
    for (int32_t i = 0; i < f->paramCount; i++) {
        if (i) sb(", ");
        sb("p%d: %s", (int)i, ty_name(f->paramTy[i]));
    }
    sb("): %s =\n", ty_name(f->retTy));
    emit_stmts(idx, f->bodyHead, 1);
    sb("\n");
}

/* ---------- C emission (independent oracle via clang -O0) ---------- */
static void emit_c_expr(int32_t fnIdx, int32_t ei) {
    Expr *e = &g_expr[ei];
    switch ((EKind)e->kind) {
    case EK_CONST:
        if (e->ty == TY_BOOL) { sb(e->val ? "true" : "false"); return; }
        if (e->ty == TY_I64) { sb("INT64_C(%lld)", (long long)e->val); return; }
        sb("INT32_C(%lld)", (long long)e->val);
        return;
    case EK_VAR: sb("%s", g_fns[fnIdx].vars[e->var].name); return;
    case EK_BIN: {
        /* wrap-around + spec shifts via helpers; &|^ direct */
        static const char *fn32[] = { "add32", "sub32", "mul32", NULL, NULL, NULL, "shl32", "shr32" };
        static const char *fn64[] = { "add64", "sub64", "mul64", NULL, NULL, NULL, "shl64", "shr64" };
        const char **fns = (e->ty == TY_I64) ? fn64 : fn32;
        if (fns[e->op]) {
            sb("%s(", fns[e->op]); emit_c_expr(fnIdx, e->a); sb(", "); emit_c_expr(fnIdx, e->b); sb(")");
            return;
        }
        static const char *ops[] = { NULL, NULL, NULL, "&", "|", "^", NULL, NULL };
        sb("("); emit_c_expr(fnIdx, e->a); sb(" %s ", ops[e->op]); emit_c_expr(fnIdx, e->b); sb(")");
        return;
    }
    case EK_CMP: {
        static const char *ops[] = { "==", "!=", "<", "<=", ">", ">=" };
        sb("("); emit_c_expr(fnIdx, e->a); sb(" %s ", ops[e->op]); emit_c_expr(fnIdx, e->b); sb(")");
        return;
    }
    case EK_LOG:
        sb("("); emit_c_expr(fnIdx, e->a); sb(e->op == L_AND ? " && " : " || "); emit_c_expr(fnIdx, e->b); sb(")");
        return;
    case EK_NOT: sb("(!"); emit_c_expr(fnIdx, e->a); sb(")"); return;
    case EK_TERN:
        sb("("); emit_c_expr(fnIdx, e->c); sb(" ? "); emit_c_expr(fnIdx, e->a); sb(" : "); emit_c_expr(fnIdx, e->b); sb(")");
        return;
    case EK_CONV:
        sb(e->ty == TY_I64 ? "(int64_t)(" : "(int32_t)(uint32_t)(uint64_t)(");
        emit_c_expr(fnIdx, e->a);
        sb(")");
        return;
    case EK_CALL:
        sb("%s(", g_fns[e->fn].name);
        for (int32_t i = 0; i < e->argc; i++) {
            if (i) sb(", ");
            emit_c_expr(fnIdx, e->args[i]);
        }
        sb(")");
        return;
    }
}

static const char *c_ty_name(uint8_t ty) {
    return ty == TY_I32 ? "int32_t" : ty == TY_I64 ? "int64_t" : "bool";
}

static void emit_c_stmts(int32_t fnIdx, int32_t head, int depth) {
    for (int32_t s = head; s >= 0; s = g_stmt[s].next) {
        Stmt *st = &g_stmt[s];
        switch ((SKind)st->kind) {
        case SK_DECL:
            indent(depth);
            sb("%s %s = ", c_ty_name(g_fns[fnIdx].vars[st->var].ty), g_fns[fnIdx].vars[st->var].name);
            emit_c_expr(fnIdx, st->expr);
            sb(";\n");
            break;
        case SK_ASSIGN:
            indent(depth);
            sb("%s = ", g_fns[fnIdx].vars[st->var].name);
            emit_c_expr(fnIdx, st->expr);
            sb(";\n");
            break;
        case SK_IF:
            indent(depth);
            sb("if (");
            emit_c_expr(fnIdx, st->expr);
            sb(") {\n");
            emit_c_stmts(fnIdx, st->thenHead, depth + 1);
            indent(depth);
            if (st->elseHead >= 0) {
                sb("} else {\n");
                emit_c_stmts(fnIdx, st->elseHead, depth + 1);
                indent(depth);
            }
            sb("}\n");
            break;
        case SK_FOR:
            indent(depth);
            sb("for (int32_t %s = %d; %s <%s %d; %s++) {\n",
               g_fns[fnIdx].vars[st->var].name, st->lo,
               g_fns[fnIdx].vars[st->var].name, st->inclusive ? "=" : "", st->hi,
               g_fns[fnIdx].vars[st->var].name);
            emit_c_stmts(fnIdx, st->bodyHead, depth + 1);
            indent(depth);
            sb("}\n");
            break;
        case SK_RET:
            indent(depth);
            sb("return ");
            emit_c_expr(fnIdx, st->expr);
            sb(";\n");
            break;
        }
    }
}

static void emit_c_program(long long seed, int expect) {
    sb("/* generated C oracle: seed=%lld expect=%d */\n", seed, expect);
    sb("#include <stdbool.h>\n#include <stdint.h>\n");
    sb("static int32_t add32(int32_t a, int32_t b){ return (int32_t)((uint32_t)a + (uint32_t)b); }\n");
    sb("static int32_t sub32(int32_t a, int32_t b){ return (int32_t)((uint32_t)a - (uint32_t)b); }\n");
    sb("static int32_t mul32(int32_t a, int32_t b){ return (int32_t)((uint32_t)a * (uint32_t)b); }\n");
    sb("static int32_t shl32(int32_t a, int32_t b){ uint32_t k = (uint32_t)b & 31u; return (int32_t)((uint32_t)a << k); }\n");
    sb("static int32_t shr32(int32_t a, int32_t b){ uint32_t k = (uint32_t)b & 31u; return (int32_t)(a < 0 ? ~(int32_t)((~(uint32_t)a) >> k) : (int32_t)((uint32_t)a >> k)); }\n");
    sb("static int64_t add64(int64_t a, int64_t b){ return (int64_t)((uint64_t)a + (uint64_t)b); }\n");
    sb("static int64_t sub64(int64_t a, int64_t b){ return (int64_t)((uint64_t)a - (uint64_t)b); }\n");
    sb("static int64_t mul64(int64_t a, int64_t b){ return (int64_t)((uint64_t)a * (uint64_t)b); }\n");
    sb("static int64_t shl64(int64_t a, int64_t b){ uint64_t k = (uint64_t)b & 63u; return (int64_t)((uint64_t)a << k); }\n");
    sb("static int64_t shr64(int64_t a, int64_t b){ uint64_t k = (uint64_t)b & 63u; return a < 0 ? (int64_t)~((~(uint64_t)a) >> k) : (int64_t)((uint64_t)a >> k); }\n\n");
    for (int32_t i = 0; i < g_fnCount; i++) {
        Fn *f = &g_fns[i];
        int isMain = (i == g_fnCount - 1);
        sb("%s%s %s(", isMain ? "int " : "static ", isMain ? "" : c_ty_name(f->retTy),
           isMain ? "main" : f->name);
        if (f->paramCount == 0) sb("void");
        for (int32_t p = 0; p < f->paramCount; p++) {
            if (p) sb(", ");
            sb("%s p%d", c_ty_name(f->paramTy[p]), (int)p);
        }
        sb(") {\n");
        emit_c_stmts(i, f->bodyHead, 1);
        sb("}\n\n");
    }
}

/* ---------- driver ---------- */
static uint32_t parse_features(const char *s) {
    if (!s || !*s || strcmp(s, "all") == 0) return F_ALL;
    if (strcmp(s, "min") == 0) return F_MIN;
    uint32_t m = 0;
    char buf[256];
    snprintf(buf, sizeof buf, "%s", s);
    for (char *tok = strtok(buf, ","); tok; tok = strtok(NULL, ",")) {
        if (!strcmp(tok, "bool_sig")) m |= F_BOOL_SIG;
        else if (!strcmp(tok, "ternary")) m |= F_TERNARY;
        else if (!strcmp(tok, "for")) m |= F_FOR;
        else if (!strcmp(tok, "calls")) m |= F_CALLS;
        else if (!strcmp(tok, "narrow")) m |= F_NARROW;
        else if (!strcmp(tok, "shift")) m |= F_SHIFT;
        else if (!strcmp(tok, "i64")) m |= F_I64;
        else if (!strcmp(tok, "wide")) m |= F_WIDE;
        else { fprintf(stderr, "cheng_program_gen: unknown feature %s\n", tok); exit(2); }
    }
    return m;
}

int main(int argc, char **argv) {
    long long seed = -1;
    const char *outPath = NULL;
    const char *outCPath = NULL;
    const char *featuresArg = "all";
    for (int i = 1; i < argc; i++) {
        if (!strncmp(argv[i], "--seed:", 7)) seed = atoll(argv[i] + 7);
        else if (!strncmp(argv[i], "--out:", 6)) outPath = argv[i] + 6;
        else if (!strncmp(argv[i], "--emit-c:", 9)) outCPath = argv[i] + 9;
        else if (!strncmp(argv[i], "--features:", 11)) featuresArg = argv[i] + 11;
        else { fprintf(stderr, "usage: cheng_program_gen --seed:N --out:PATH [--emit-c:PATH] [--features:all|min|csv]\n"); return 2; }
    }
    if (seed < 0 || !outPath) {
        fprintf(stderr, "usage: cheng_program_gen --seed:N --out:PATH [--emit-c:PATH] [--features:all|min|csv]\n");
        return 2;
    }
    g_features = parse_features(featuresArg);
    g_state = (uint64_t)seed * 0x9e3779b97f4a7c15ull + 0x243f6a8885a308d3ull;

    int32_t nHelpers = rnd_range(1, MAX_FNS - 2);
    for (int32_t i = 0; i < nHelpers; i++) { g_fnCount = i; gen_fn(i, 0); }
    g_fnCount = nHelpers;
    gen_fn(nHelpers, 1);
    g_fnCount = nHelpers + 1;

    int64_t dummy[1] = { 0 };
    int64_t ret = eval_call(nHelpers, dummy);
    int expect = (int)(ret & 127);

    sb("# generated by tools/fuzz/cheng_program_gen.c seed=%lld features=0x%x expect=%d\n\n",
       seed, (unsigned)g_features, expect);
    for (int32_t i = 0; i < g_fnCount; i++) emit_fn(i);

    FILE *fp = fopen(outPath, "wb");
    if (!fp) { fprintf(stderr, "cheng_program_gen: cannot open %s\n", outPath); return 2; }
    fwrite(g_out, 1, g_outLen, fp);
    fclose(fp);

    if (outCPath) {
        g_outLen = 0;
        emit_c_program(seed, expect);
        FILE *fc = fopen(outCPath, "wb");
        if (!fc) { fprintf(stderr, "cheng_program_gen: cannot open %s\n", outCPath); return 2; }
        fwrite(g_out, 1, g_outLen, fc);
        fclose(fc);
    }
    printf("expect=%d\n", expect);
    return 0;
}
