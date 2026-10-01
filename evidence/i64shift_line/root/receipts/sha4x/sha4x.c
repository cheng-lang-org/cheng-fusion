#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <CommonCrypto/CommonDigest.h>
#include <arm_neon.h>

// 4-lane interleaved SHA-256 compression via ARMv8 SHA intrinsics.
// Group structure per the public-domain noloader/SHA-Intrinsics reference:
// su0 at group start, snapshot, hq/h2 pair, su1 at group end; schedule updates
// stop after round 47. Straight-line form (no K prefetch pipeline) — clang
// -O2 does the software pipelining across the 4 lanes.

static const uint32_t K[64] = {
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2};

static inline uint32_t ror(uint32_t x, int n){ return (x>>n)|(x<<(32-n)); }

static void sha256_block_scalar(uint32_t *h, const uint8_t *block) {
    uint32_t w[64];
    for (int i = 0; i < 16; i++)
        w[i] = ((uint32_t)block[i*4]<<24)|((uint32_t)block[i*4+1]<<16)|((uint32_t)block[i*4+2]<<8)|block[i*4+3];
    for (int i = 16; i < 64; i++) {
        uint32_t s0 = ror(w[i-15],7)^ror(w[i-15],18)^(w[i-15]>>3);
        uint32_t s1 = ror(w[i-2],17)^ror(w[i-2],19)^(w[i-2]>>10);
        w[i] = w[i-16]+s0+w[i-7]+s1;
    }
    uint32_t a=h[0],b=h[1],c=h[2],d=h[3],e=h[4],f=h[5],g=h[6],hh=h[7];
    for (int i = 0; i < 64; i++) {
        uint32_t S1 = ror(e,6)^ror(e,11)^ror(e,25);
        uint32_t ch = (e&f)^((~e)&g);
        uint32_t t1 = hh+S1+ch+K[i]+w[i];
        uint32_t S0 = ror(a,2)^ror(a,13)^ror(a,22);
        uint32_t mj = (a&b)^(a&c)^(b&c);
        uint32_t t2 = S0+mj;
        hh=g; g=f; f=e; e=d+t1; d=c; c=b; b=a; a=t1+t2;
    }
    h[0]+=a; h[1]+=b; h[2]+=c; h[3]+=d; h[4]+=e; h[5]+=f; h[6]+=g; h[7]+=hh;
}

static const uint32_t IV[8] = {0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,
                               0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19};

static void sha256_4block(uint32_t hout[4][8], const uint8_t *m[4]) {
    uint32x4_t S0[4], S1[4], M[4][4], T[4], T2[4], K4;
    for (int l = 0; l < 4; l++) {
        S0[l] = vld1q_u32(IV); S1[l] = vld1q_u32(IV+4);
        M[0][l] = vrev32q_u8(vld1q_u32((const uint32_t*)(m[l]+0)));
        M[1][l] = vrev32q_u8(vld1q_u32((const uint32_t*)(m[l]+16)));
        M[2][l] = vrev32q_u8(vld1q_u32((const uint32_t*)(m[l]+32)));
        M[3][l] = vrev32q_u8(vld1q_u32((const uint32_t*)(m[l]+48)));
    }
    for (int g = 0; g < 16; g++) {
        K4 = vld1q_u32(&K[4*g]);
        // consume the CURRENT window words first (ADD for rounds 4g..4g+3),
        // then let su0/su1 overwrite them with the +12-group schedule words.
        for (int l = 0; l < 4; l++) {
            T2[l] = S0[l];
            T[l]  = vaddq_u32(M[g%4][l], K4);
        }
        if (g < 12)
            for (int l = 0; l < 4; l++)
                M[g%4][l] = vsha256su0q_u32(M[g%4][l], M[(g+1)%4][l]);
        for (int l = 0; l < 4; l++) {
            S0[l] = vsha256hq_u32(S0[l], S1[l], T[l]);
            S1[l] = vsha256h2q_u32(S1[l], T2[l], T[l]);
        }
        if (g < 12)
            for (int l = 0; l < 4; l++)
                M[g%4][l] = vsha256su1q_u32(M[g%4][l], M[(g+2)%4][l], M[(g+3)%4][l]);
    }
    for (int l = 0; l < 4; l++) {
        S0[l] = vaddq_u32(S0[l], vld1q_u32(IV));
        S1[l] = vaddq_u32(S1[l], vld1q_u32(IV+4));
        vst1q_u32(hout[l], S0[l]);
        vst1q_u32(hout[l]+4, S1[l]);
    }
}

static double now_s(void){struct timespec ts;clock_gettime(CLOCK_MONOTONIC,&ts);return ts.tv_sec+ts.tv_nsec/1e9;}

int main(void) {
    uint8_t blocks[4][64];
    for (int b = 0; b < 4; b++)
        for (int i = 0; i < 64; i++) blocks[b][i] = (uint8_t)(i*3+b*97+1);
    uint32_t hw[4][8];
    const uint8_t *mp[4] = {blocks[0], blocks[1], blocks[2], blocks[3]};
    sha256_4block(hw, mp);
    int kat = 1;
    for (int b = 0; b < 4; b++) {
        uint32_t h[8]; memcpy(h, IV, 32);
        sha256_block_scalar(h, blocks[b]);
        if (memcmp(h, hw[b], 32) != 0) { kat = 0;
            printf("lane%d mismatch:\n hw", b);
            for (int i=0;i<8;i++) printf(" %08x", hw[b][i]);
            printf("\n sc");
            for (int i=0;i<8;i++) printf(" %08x", h[i]);
            printf("\n");
        }
    }
    printf("SHA4X_KAT_%s\n", kat?"PASS":"FAIL");
    if (!kat) return 1;

    const long groups = 1L<<18;
    uint8_t *buf = aligned_alloc(64, (size_t)groups*256);
    for (size_t i = 0; i < (size_t)groups*256; i++) buf[i] = (uint8_t)i;
    double best = 1e9;
    for (int r = 0; r < 5; r++) {
        double t0 = now_s();
        for (long g = 0; g < groups; g++) {
            const uint8_t *gp[4] = {buf+g*256, buf+g*256+64, buf+g*256+128, buf+g*256+192};
            sha256_4block(hw, gp);
        }
        double dt = now_s()-t0;
        if (dt < best) best = dt;
    }
    double mib = (double)groups*256/(1024.0*1024.0);
    printf("4x-interleaved SHA-256: %.1f ms for %.0f MiB -> %.0f MB/s\n", best*1e3, mib, mib/best);

    uint8_t md[CC_SHA256_DIGEST_LENGTH];
    best = 1e9;
    for (int r = 0; r < 5; r++) {
        double t0 = now_s();
        CC_SHA256(buf, (CC_LONG)((size_t)groups*256), md);
        double dt = now_s()-t0;
        if (dt < best) best = dt;
    }
    printf("CC_SHA256 single-stream: %.0f MB/s\n", mib/best);
    free(buf);
    return 0;
}
