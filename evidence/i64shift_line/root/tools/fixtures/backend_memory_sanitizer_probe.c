#include <limits.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#ifndef __has_feature
#define __has_feature(feature) 0
#endif

#if !__has_feature(address_sanitizer)
#error "address sanitizer instrumentation is required"
#endif

#if !__has_feature(undefined_behavior_sanitizer)
#error "undefined behavior sanitizer instrumentation is required"
#endif

static int run_asan_failure(void) {
    volatile unsigned char *storage =
        (volatile unsigned char *)malloc(32u);
    if (storage == NULL) {
        return 91;
    }
    storage[0] = 7u;
    free((void *)storage);
    return (int)storage[0];
}

static int run_ubsan_failure(void) {
    volatile int32_t value = INT_MAX;
    return value + 1;
}

int main(int argc, char **argv) {
    if (argc == 1) {
        void *storage = malloc(64u);
        if (storage == NULL) {
            return 92;
        }
        memset(storage, 0, 64u);
        free(storage);
        puts("backend_memory_sanitizer_probe=ready");
        return 0;
    }
    if (argc == 2 && strcmp(argv[1], "--asan-failure") == 0) {
        return run_asan_failure();
    }
    if (argc == 2 && strcmp(argv[1], "--ubsan-failure") == 0) {
        return run_ubsan_failure();
    }
    return 93;
}
