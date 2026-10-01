#include <stdio.h>
#include <stdint.h>

// Matches the Cheng `Cell` layout: int32 v@0, int32 pad@4 (8 bytes/elem).
typedef struct Cell {
    int32_t v;
    int32_t pad;
} Cell;

extern int32_t walk_sum(void* p, int32_t n);
extern int32_t elem_at(void* p, int32_t idx);

int main(void) {
    int fail = 0;
    Cell a[5];
    a[0].v = 7;  a[0].pad = 0;
    a[1].v = 14; a[1].pad = 0;
    a[2].v = 21; a[2].pad = 0;
    a[3].v = 28; a[3].pad = 0;
    a[4].v = 35; a[4].pad = 0;

    // walk the whole array, summing each deref'd element: 7+14+21+28+35 = 105.
    int32_t s = walk_sum(a, 5);
    if (s != 105) fail = 1;

    // element i at base + i*8.
    if (elem_at(a, 0) != 7)  fail = 1;
    if (elem_at(a, 2) != 21) fail = 1;
    if (elem_at(a, 4) != 35) fail = 1;

    // a partial walk over the first 3 elements: 7+14+21 = 42.
    if (walk_sum(a, 3) != 42) fail = 1;

    // a single-element walk reads just the base element.
    if (walk_sum(a, 1) != 7) fail = 1;

    printf("sum=%d e0=%d e2=%d e4=%d\n", s, elem_at(a, 0), elem_at(a, 2), elem_at(a, 4));
    if (!fail) { printf("ptr_walk_array OK\n"); return 0; }
    printf("ptr_walk_array BAD\n");
    return 1;
}
