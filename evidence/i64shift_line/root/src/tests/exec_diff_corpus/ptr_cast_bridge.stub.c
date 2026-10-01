#include <stdio.h>
#include <stdint.h>
#include <string.h>
#include <stdlib.h>

typedef struct ChengStrBridge {
    const char* ptr;
    int32_t len;
    int32_t store_id;
    int32_t flags;
} ChengStrBridge;

void setMem(void* dest, int32_t val, int32_t size) {
    memset(dest, val, (size_t)size);
}

ChengStrBridge driver_c_str_from_utf8_copy_bridge(const char* raw, int32_t n) {
    ChengStrBridge s;
    char* buf = (char*)malloc((size_t)n + 1);
    if (n > 0) memcpy(buf, raw, (size_t)n);
    buf[n] = '\0';
    s.ptr = buf; s.len = n; s.store_id = 0; s.flags = 1;
    return s;
}

extern int32_t ecd_len_of(int32_t);
extern int32_t ecd_pick_len(int32_t);

int main(void) {
    int l0 = ecd_len_of(0), l1 = ecd_len_of(1), l2 = ecd_len_of(2);
    int p0 = ecd_pick_len(0), p1 = ecd_pick_len(1), p2 = ecd_pick_len(2);
    printf("len_of 0=%d 1=%d 2=%d\n", l0, l1, l2);
    printf("pick_len 0=%d 1=%d 2=%d\n", p0, p1, p2);
    if (l0 == 0 && l1 == 5 && l2 == 11 && p0 == 1 && p1 == 5 && p2 == 11) {
        printf("ptr_cast_bridge OK\n");
        return 0;
    }
    printf("ptr_cast_bridge BAD\n");
    return 1;
}
