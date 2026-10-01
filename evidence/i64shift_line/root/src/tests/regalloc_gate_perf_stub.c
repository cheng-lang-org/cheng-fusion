#include <stdint.h>

extern int32_t regallocGatePerfHot(int32_t iterations);

int main(void) {
    return regallocGatePerfHot(2000000) == 44000010 ? 0 : 21;
}
