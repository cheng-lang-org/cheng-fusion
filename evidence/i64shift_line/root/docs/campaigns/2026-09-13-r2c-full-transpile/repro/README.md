# M1 装配闭环复现（NodesPage.tsx）

```bash
cd /Users/lbcheng/cheng-lang/ts-csg
npm run build
D=tmp/r2c-census && mkdir -p $D/src
# 1. 抽取（单文件，秒级）
node dist/cli.js --emit csg-core \
  --file /Users/lbcheng/UniMaker/React.js/app/components/NodesPage.tsx \
  --root /Users/lbcheng/UniMaker/React.js \
  --out $PWD/$D/nodes-facts.jsonl
# 2. 装配（转译+闭包过滤+残struct剔除+组合）
node $D/assemble2.mjs $D/nodes-facts.jsonl $D/src/assembled.cheng $D/main-assemble.cheng
# 3. 编译运行（需包布局: cheng-package.toml + src/std|core 拷贝, 见 assemble 输出提示）
printf 'package_id = "r2c-census"\n' > $D/cheng-package.toml
cp -R /Users/lbcheng/cheng-lang/src/std $D/src/std
cp -R /Users/lbcheng/cheng-lang/src/core $D/src/core
/Users/lbcheng/cheng-lang/artifacts/bootstrap/cheng.stage3 system-link-exec \
  --root:$PWD/$D --in:src/assembled.cheng --emit:exe \
  --target:arm64-apple-darwin --out:$D/nodes-assembled
$D/nodes-assembled   # 期望 rc=0（10 组语义断言全过）
```

main-assemble.cheng 的断言全部对照 NodesPage.tsx 真实函数语义手核
（toSourceTag("video")→null/""、" LAN "→"LAN"、formatNodeOsLabel、
formatNodeTitleWithRemark 的 ||链+三元组合等）。
