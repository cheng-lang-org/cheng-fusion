#include <stdio.h>
#include <stdint.h>

// Matches the Cheng `Node` layout: int32 a @0, int32 b @4, int64 c @8.
typedef struct Node {
    int32_t a;
    int32_t b;
    int64_t c;
} Node;

extern void    node_fill(void* p, int32_t x, int32_t y, int64_t z);
extern int64_t node_sum(void* p);
extern void    node_bump(void* p, int32_t d);

int main(void) {
    int fail = 0;
    Node n;

    node_fill(&n, 10, 20, 1000000000000LL);
    // verify the writes landed at the right offsets.
    if (n.a != 10) fail = 1;
    if (n.b != 20) fail = 1;
    if (n.c != 1000000000000LL) fail = 1;

    int64_t s = node_sum(&n);
    int64_t es = (int64_t)10 + (int64_t)20 + 1000000000000LL;
    if (s != es) fail = 1;

    node_bump(&n, 5);
    if (n.a != 15) fail = 1;
    if (n.b != 15) fail = 1;
    if (n.c != 1000000000005LL) fail = 1;

    int64_t s2 = node_sum(&n);
    int64_t es2 = (int64_t)15 + (int64_t)15 + 1000000000005LL;
    if (s2 != es2) fail = 1;

    printf("a=%d b=%d c=%lld sum=%lld sum2=%lld\n",
           n.a, n.b, (long long)n.c, (long long)s, (long long)s2);
    if (!fail) { printf("ptr_offset_rw OK\n"); return 0; }
    printf("ptr_offset_rw BAD\n");
    return 1;
}
