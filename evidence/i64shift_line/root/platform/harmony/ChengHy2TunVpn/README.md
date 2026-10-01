# ChengHy2TunVpn Harmony

生产交付（纯 Cheng 核心 + ArkTS VpnExtension 壳）：

```sh
# 静态 ABI 门禁
sh platform/mobile/ChengHy2TunCore/product_gate.sh

# 签名 HAP（签名材料可从 build-profile.json5 自动加载；默认不装机）
cd platform/harmony/ChengHy2TunVpn
CHENG_HARMONY_INSTALL=0 sh scripts/sign_install_harmony_hap.sh
# 装机+真机门禁（需 hdc 在线）
sh scripts/product_perf_stability_gate.sh
```

签名 HAP：`entry/build/default/outputs/default/entry-default-signed.hap`

默认 Harmony 配置现在指向 dosg：

- exit name: `dosg`
- host: `165.245.176.65`
- TCP forward port: `7443`
- UDP/QUIC port: `7443`
- default transport: `tcp-tls-forward`
- product gate default: `CHENG_HARMONY_TRANSPORTS=tcp-tls-forward`
- remote repo: `root@dosg:/root/cheng-lang`

显式跑 UDP/QUIC 回归：

```sh
CHENG_HARMONY_TRANSPORTS='udp-quic tcp-tls-forward' scripts/product_perf_stability_gate.sh
```

产品模式：

- `tun`: 通过 `VpnExtension` 接管流量；`route_mode=fast`（默认）只把 `198.18.0.0/16` 与已知被墙 IP 字面前缀装进 TUN（OS 级国内直连），`route_mode=global` 装 IPv4 默认路由。
- `pac`: 鸿蒙公开 `VpnExtension.VpnConfig` 没有 HTTP proxy/PAC 字段；系统 PAC API `connection.setPacFileUrl()` 需要 `ohos.permission.SET_PAC_URL`。当前普通签名产品会 hard-fail，不写系统 PAC，不伪装成功。拿到系统/企业授权后再接 Cheng 本地 proxy listener：`http://localhost:<port>/cheng-hy2-tun.pac`，端口从 `18080..18089` 里按顺序绑定。

`hy2-tun-client.example.json` 不保存 token。默认配置读取同目录 `auth.token`，启动前只在内存里注入 `exits[].auth`，不会写回 config，也不会打印 token。

服务端部署和启动：

```sh
cd /Users/lbcheng/cheng-lang/platform/harmony/ChengHy2TunVpn
CHENG_HY2_TUN_AUTH_TOKEN='<至少 32 字节的真实 token>' scripts/vultr_hy2_tun_server.sh deploy
scripts/vultr_hy2_tun_server.sh start
scripts/vultr_hy2_tun_server.sh status
```

脚本固定通过 SSH 执行远端仓库命令：`ssh root@vultr 'cd /root/cheng-lang && ...'`。缺 `artifacts/backend_driver/cheng`、缺服务端二进制、构建失败、缺 `server.json`、缺证书文件都会直接失败。

Harmony 端验证：

```sh
bash -n scripts/vultr_hy2_tun_server.sh
node -e 'JSON.parse(require("fs").readFileSync("entry/src/main/resources/rawfile/hy2-tun-client.example.json","utf8"))'
rg -n 'windows|205\.186\.67\.165|local-shared-token' entry/src/main/resources/rawfile scripts
```
