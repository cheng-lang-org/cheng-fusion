// Clean 3-way compare on a 4-block message:
//  A) sha4blk_compress (serial generator N=4)
//  B) cheng1x_compress x4 (PASS anchor, one block at a time)
//  C) scalar chain
#include <stdio.h>
#include <string.h>
extern void sha4blk_compress(unsigned char *st, const unsigned char *msg, const unsigned char *k);
extern void cheng1x_compress(unsigned char *st, const unsigned char *blk, const unsigned char *k);
static const unsigned int K[64] = {0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2};
static const unsigned int IV[8] = {0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19};
static unsigned int ror(unsigned int x,int n){return (x>>n)|(x<<(32-n));}
static void prt(const char*t,const unsigned char*s){printf("  %s:",t);for(int i=0;i<8;i++)printf(" %08x",*(unsigned int*)(s+4*i));printf("\n");}
int main(void){
    unsigned char msg[256];
    for (int i=0;i<256;i++) msg[i]=(unsigned char)i;
    unsigned char stA[32], stB[32], blk[64];
    // A: serial N=4, one call
    memcpy(stA,IV,32);
    sha4blk_compress(stA,msg,(const unsigned char*)K);
    prt("A serial4 ",stA);
    // B: cheng1x per block
    memcpy(stB,IV,32);
    for (int b=0;b<4;b++){ memcpy(blk,msg+b*64,64); cheng1x_compress(stB,blk,(const unsigned char*)K); }
    prt("B cheng1x4",stB);
    // C: scalar chain
    unsigned int h[8]; memcpy(h,IV,32);
    for (int b=0;b<4;b++){
        unsigned int w[64];
        for(int i=0;i<16;i++) w[i]=((unsigned int)msg[b*64+i*4]<<24)|((unsigned int)msg[b*64+i*4+1]<<16)|((unsigned int)msg[b*64+i*4+2]<<8)|msg[b*64+i*4+3];
        for(int i=16;i<64;i++){unsigned int s0=ror(w[i-15],7)^ror(w[i-15],18)^(w[i-15]>>3),s1=ror(w[i-2],17)^ror(w[i-2],19)^(w[i-2]>>10);w[i]=w[i-16]+s0+w[i-7]+s1;}
        unsigned int a=h[0],b2=h[1],c=h[2],d=h[3],e=h[4],f=h[5],g=h[6],hh=h[7];
        for(int i=0;i<64;i++){unsigned int S1=ror(e,6)^ror(e,11)^ror(e,25),ch=(e&f)^((~e)&g),t1=hh+S1+ch+K[i]+w[i],S0=ror(a,2)^ror(a,13)^ror(a,22),mj=(a&b2)^(a&c)^(b2&c),t2=S0+mj;hh=g;g=f;f=e;e=d+t1;d=c;c=b2;b2=a;a=t1+t2;}
        h[0]+=a;h[1]+=b2;h[2]+=c;h[3]+=d;h[4]+=e;h[5]+=f;h[6]+=g;h[7]+=hh;
    }
    unsigned char stC[32]; memcpy(stC,h,32);
    prt("C scalar  ",stC);
    printf("A==C: %s   B==C: %s\n", memcmp(stA,stC,32)==0?"yes":"NO", memcmp(stB,stC,32)==0?"yes":"NO");
    return 0;
}
