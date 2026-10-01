#include <stdint.h>
#include <stdlib.h>

static int sabi_bytes_equal(const unsigned char *data,
                               int64_t len,
                               const char *expected,
                               int64_t expected_len) {
    if (!data || len != expected_len) return 0;
    for (int64_t i = 0; i < len; i++) {
        if (data[i] != (unsigned char)expected[i]) return 0;
    }
    return 1;
}

int64_t SabiAcceptUtf8(const unsigned char *data, int64_t len) {
    return sabi_bytes_equal(data, len, "sabi utf8\n", 10) ? len : -1;
}

int64_t SabiAcceptBytes(const unsigned char *data, int64_t len) {
    return sabi_bytes_equal(data, len, "sabi bytes\n", 11) ? len : -1;
}

int64_t SabiCStringLen(const char *text) {
    if (!text) return -1;
    int64_t n = 0;
    while (text[n] != '\0') n++;
    return n;
}

char *SabiDupCString(const char *text) {
    if (!text) return 0;
    int64_t n = SabiCStringLen(text);
    if (n < 0) return 0;
    char *out = (char *)malloc((size_t)n + 1);
    if (!out) return 0;
    for (int64_t i = 0; i <= n; i++) out[i] = text[i];
    return out;
}

void SabiFree(void *ptr) {
    free(ptr);
}
