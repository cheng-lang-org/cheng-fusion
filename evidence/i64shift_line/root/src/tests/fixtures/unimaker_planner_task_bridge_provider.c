#include <stdint.h>
#include <string.h>

/* Desktop SABI host stub for cheng_unimaker_planner_classify_task_kind.
 * Mirrors tests/cheng/backend/fixtures/sabi/sabi_string_provider.c:
 * captures the emitted taskKind bytes into a static buffer, exposes a
 * byte-exact comparator so the Cheng smoke can assert on it. */

#define UNIMAKER_TEST_EMIT_BUF_CAP 256

static unsigned char unimaker_test_emit_buf[UNIMAKER_TEST_EMIT_BUF_CAP];
static int64_t unimaker_test_emit_len = -1;

int32_t cheng_unimaker_planner_task_kind_emit(const unsigned char *data, int64_t len) {
    if (!data || len < 0 || len > UNIMAKER_TEST_EMIT_BUF_CAP) {
        unimaker_test_emit_len = -1;
        return -1;
    }
    memcpy(unimaker_test_emit_buf, data, (size_t)len);
    unimaker_test_emit_len = len;
    return 0;
}

int32_t unimaker_test_emit_matches(const unsigned char *expected, int64_t expected_len) {
    if (unimaker_test_emit_len < 0 || unimaker_test_emit_len != expected_len) return 0;
    if (!expected) return 0;
    return memcmp(unimaker_test_emit_buf, expected, (size_t)expected_len) == 0 ? 1 : 0;
}

/* 任务03: 取消/失败无 emit 副作用断言用 —— clear 归零捕获态, touched 报告
 * 自上次 clear 以来是否发生过任何 emit。 */
void unimaker_test_emit_clear(void) {
    unimaker_test_emit_len = -1;
}

int32_t unimaker_test_emit_touched(void) {
    return unimaker_test_emit_len >= 0 ? 1 : 0;
}
