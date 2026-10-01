// KAT + throughput for sha64blk_compress: N=64 serial-chain single-stream.
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <CommonCrypto/CommonDigest.h>
extern void sha64blk_compress(unsigned char *st, const unsigned char *msg, const unsigned char *k);
static const unsigned int K[64] = {0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2};
static const unsigned int IV[8] = {0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19};
static unsigned int ror(unsigned int x,int n){return (x>>n)|(x<<(32-n));}
static double now_s(void){struct timespec ts;clock_gettime(CLOCK_MONOTONIC,&ts);return ts.tv_sec+ts.tv_nsec/1e9;}
int main(void){
    enum { N = 64 };
    unsigned char st[32], msg[N*64];
    memcpy(st,IV,32);
    for (int i=0;i<N*64;i++) msg[i]=(unsigned char)i;
    // reference: 64 sequential CC-style compressions via CC_SHA256 on the
    // full 4096B message (CC processes the same 64 blocks with same IV init
    // only if we hash exactly these 4096 bytes from IV state — CC_SHA256
    // starts from IV, and our chain also starts from IV: identical).
    unsigned char mdRef[32];
    // our compress of 64 blocks == first 32B of CC_SHA256(msg[0..4096])? NO —
    // CC adds padding; without padding the mid-state after 64 blocks equals
    // the internal state which we cannot read from CC. Instead verify with
    // our own scalar 64-block chain.
    // scalar chain:
    unsigned int h[8]; memcpy(h,IV,32);
    static unsigned int KW[64];
    for (int b=0;b<N;b++){
        unsigned int w[64];
        for(int i=0;i<16;i++) w[i]=((unsigned int)msg[b*64+i*4]<<24)|((unsigned int)msg[b*64+i*4+1]<<16)|((unsigned int)msg[b*64+i*4+2]<<8)|msg[b*64+i*4+3];
        for(int i=16;i<64;i++){unsigned int s0=ror(w[i-15],7)^ror(w[i-15],18)^(w[i-15]>>3),s1=ror(w[i-2],17)^ror(w[i-2],19)^(w[i-2]>>10);w[i]=w[i-16]+s0+w[i-7]+s1;}
        unsigned int a=h[0],b2=h[1],c=h[2],d=h[3],e=h[4],f=h[5],g=h[6],hh=h[7];
        for(int i=0;i<64;i++){unsigned int S1=ror(e,6)^ror(e,11)^ror(e,25),ch=(e&f)^((~e)&g),t1=hh+S1+ch+K[i]+w[i],S0=ror(a,2)^ror(a,13)^ror(a,22),mj=(a&b2)^(a&c)^(b2&c),t2=S0+mj;hh=g;g=f;f=e;e=d+t1;d=c;c=b2;b2=a;a=t1+t2;}
        h[0]+=a;h[1]+=b2;h[2]+=c;h[3]+=d;h[4]+=e;h[5]+=f;h[6]+=g;h[7]+=hh;
    }
    sha64blk_compress(st,msg,(const unsigned char*)K);
    int kat = memcmp(h,st,32)==0;
    printf("SHA64BLK_KAT_%s\n", kat?"PASS":"FAIL");
    if (!kat){
        printf(" asm:"); for(int i=0;i<8;i++)printf(" %08x",*(unsigned int*)(st+4*i));
        printf("\n ref:"); for(int i=0;i<8;i++)printf(" %08x",h[i]); printf("\n");
        return 1;
    }
    const long groups=1L<<13; // 8192 calls x 64 blocks x 64B = 32MiB
    unsigned char *msp=aligned_alloc(64,(size_t)groups*4096);
    unsigned char *stp=aligned_alloc(64,(size_t)groups*32);
    if(!msp||!stp){printf("alloc\n");return 2;}
    for (size_t i=0;i<(size_t)groups;i++) memcpy(stp+i*32,IV,32);
    for (size_t i=0;i<(size_t)groups*4096;i++) msp[i]=(unsigned char)i;
    double best=1e18;
    for(int r=0;r<5;r++){
        double t0=now_s();
        for(long g=0;g<groups;g++) sha64blk_compress(stp+(size_t)g*32, msp+(size_t)g*4096, (const unsigned char*)K);
        double dt=now_s()-t0;
        if(dt>0&&dt<best)best=dt;
    }
    double mib=(double)groups*4096/(1024.0*1024.0);
    printf("single-stream 64blk: %.1f ms for %.0f MiB -> %.0f MB/s\n",best*1e3,mib,mib/best);
    unsigned char md[32]; best=1e18;
    for(int r=0;r<5;r++){double t0=now_s();CC_SHA256(msp,(CC_LONG)((size_t)groups*4096),md);double dt=now_s()-t0;if(dt>0&&dt<best)best=dt;}
    printf("CC_SHA256 same size: %.0f MB/s\n",mib/best);
    return 0;
}
