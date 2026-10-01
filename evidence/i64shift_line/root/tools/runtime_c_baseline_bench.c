#include <pthread.h>
#include <stdatomic.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <unistd.h>

typedef struct MemHeader {
  atomic_int rc;
  int size;
} MemHeader;

static int64_t now_ns(void) {
  struct timespec ts;
  clock_gettime(CLOCK_MONOTONIC, &ts);
  return (int64_t)ts.tv_sec * 1000000000LL + (int64_t)ts.tv_nsec;
}

static int64_t ns_per_op(int64_t elapsed, int count) {
  if (elapsed <= 0) return 1;
  return (elapsed + count - 1) / count;
}

static void emit(const char *name, int64_t ns) {
  printf("%s_c_ns_per_op=%lld\n", name, (long long)ns);
}

static void *mem_alloc(int size) {
  MemHeader *h = (MemHeader *)calloc(1, sizeof(MemHeader) + (size_t)size);
  if (!h) abort();
  atomic_store(&h->rc, 1);
  h->size = size;
  return (void *)(h + 1);
}

static MemHeader *mem_header(void *p) {
  return p ? ((MemHeader *)p) - 1 : 0;
}

static void mem_retain(void *p) {
  MemHeader *h = mem_header(p);
  if (h) atomic_fetch_add(&h->rc, 1);
}

static void mem_release(void *p) {
  MemHeader *h = mem_header(p);
  if (h && atomic_fetch_sub(&h->rc, 1) == 1) free(h);
}

static void *empty_thread_main(void *ctx) {
  (void)ctx;
  return 0;
}

static int64_t bench_orc(int iters) {
  void *p = mem_alloc(8);
  int64_t start = now_ns();
  for (int i = 0; i < iters; i++) {
    mem_retain(p);
    mem_release(p);
  }
  int64_t elapsed = now_ns() - start;
  mem_release(p);
  return ns_per_op(elapsed, iters);
}

static int64_t bench_atomic(int iters) {
  atomic_int value;
  atomic_init(&value, 0);
  int64_t start = now_ns();
  for (int i = 0; i < iters; i++) {
    atomic_fetch_add(&value, 1);
  }
  return ns_per_op(now_ns() - start, iters);
}

static int64_t bench_thread(int iters) {
  int64_t start = now_ns();
  for (int i = 0; i < iters; i++) {
    pthread_t t;
    if (pthread_create(&t, 0, empty_thread_main, 0) != 0) abort();
    if (pthread_join(t, 0) != 0) abort();
  }
  return ns_per_op(now_ns() - start, iters);
}

static int64_t bench_slice_bounds(int iters) {
  int data[128];
  int sum = 0;
  for (int i = 0; i < 128; i++) data[i] = i;
  int64_t start = now_ns();
  for (int i = 0; i < iters; i++) {
    sum += data[i & 127];
  }
  if (sum == -1) puts("impossible");
  return ns_per_op(now_ns() - start, iters);
}

static uint64_t hash_str(const char *s) {
  uint64_t h = 1469598103934665603ULL;
  for (; *s; s++) {
    h ^= (unsigned char)*s;
    h *= 1099511628211ULL;
  }
  return h;
}

static int64_t bench_hash_lookup(int iters) {
  const char *keys[4] = {"alpha", "beta", "gamma", "delta"};
  int vals[4] = {11, 22, 33, 44};
  int sum = 0;
  int64_t start = now_ns();
  for (int i = 0; i < iters; i++) {
    const char *key = (i & 1) ? "gamma" : "beta";
    uint64_t h = hash_str(key);
    for (int j = 0; j < 4; j++) {
      if (hash_str(keys[j]) == h && strcmp(keys[j], key) == 0) {
        sum += vals[j];
        break;
      }
    }
  }
  if (sum == -1) puts("impossible");
  return ns_per_op(now_ns() - start, iters);
}

static int64_t bench_syscall_write(int iters) {
  int64_t start = now_ns();
  for (int i = 0; i < iters; i++) {
    (void)write(1, "", 0);
  }
  return ns_per_op(now_ns() - start, iters);
}

int main(void) {
  emit("orc_retain_release", bench_orc(200000));
  emit("atomic_i32_add", bench_atomic(200000));
  emit("thread_spawn_join", bench_thread(200));
  emit("slice_bounds_loop", bench_slice_bounds(500000));
  emit("hash_lookup", bench_hash_lookup(200000));
  emit("syscall_write", bench_syscall_write(20000));
  return 0;
}
