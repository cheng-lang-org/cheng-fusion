# purept_w2i2.md — W2 第二片（i2）：TLS 1.3 握手状态机（client+server+双端自握手）

判词：**绿**。173 检查 0 失败，`unresolved_symbol_count=0`，编译与运行 rc=0（冻结
stage3 驱动，sha256 前 20 位 `05af823e7db0c8ea1a69cbd0`）。

## 1. 交付物（全部新文件，既有文件零改动）

| 文件 | 行数 | 内容 |
| --- | --- | --- |
| `src/quic/pure/tls13_state_client.cheng` | 598 | client 事件化状态机：Configure→Begin（出 CH）→Feed(单条握手消息) 逐态推进 expectSH→EE→Cert→CV→SFin→complete；SH 域检（suite/version/key_share 组+长度）→x25519→handshake secrets；逐消息 transcript（槽 0）；CV 无条件验签（ed25519 epoch-1 / RSA-PSS-SHA256 按**证书 SPKI 实际算法**分发，密钥取自收到的端实体证书）；SFin 验窗 hash(CH..CV)→master/c ap/s ap/exp master/双向 traffic key+iv→出 client Finished→res master |
| `src/quic/pure/tls13_state_server.cheng` | 442 | server 镜像：Configure（x25519 派生 pub；certDer 空则内置最小自证 DER，ed25519 SPKI 可被 client 提取）→Feed(CH) 域检（suite 覆盖/version/key_share）后一次产出整段 flight（SH‖EE‖Cert‖CV‖SFin）→Feed(CFin) 验后 complete；CV 用 RFC 8446 final 内容序自签 |
| `src/tests/purept_w2i2_tls13_handshake.cheng` | 615 | 判据驱动：A 流级向量重放 33 项 / B server 向量锚 5 项 / C 自握手 3 轮×23=69 项 / D 负例 13 例 61 项 / E 接口形态 5 项，共 173 |

原语只 import（std/crypto/{curve25519,rsa,minasn1,sha256}、cheng/libp2p/crypto/ed25519、
i1 三件套 keyschedule/transcript/messages），零修改。transcript 槽位约定：client=槽 0，server=槽 1。

## 2. 判据数字

| 判据 | 要求 | 实测 |
| --- | --- | --- |
| a. RFC 8448 §3 流级重放 | 状态机走完向量，产出与 §3 逐字节等 | **A 段 33/33**：Begin 产 CH==向量逐字节；喂 SH/EE/Cert/CV/SFin 全过；hs secret(B3)、c/s hs traffic(B4/B5)、双向 hs key+iv(B8/B9)、srv finished key(B10)、srv Finished vd(B11)、c/s ap(B12/B13)、exp master(B14)、双向 ap key+iv(B15/B16)、cli finished key+vd(B17/B18)、res master(B19)、resumption(B20) 全部逐字节等；产 CFin==向量逐字节；**向量 CV 的 RSA-PSS-SHA256 签名为真实验证**（n/e 从向量证书 SPKI 提取，纯 bigint modexp，非跳过）。server 侧锚 B 段 5/5：喂向量 CH→shared(B3 输入)、hs secret(B3) 逐字节等、flight 首字节=SH |
| b. 双端自握手 ≥3 条 | 双端 ap secrets 逐字节等+双向 verify_data 验过+transcript 终态一致 | **C 段 69/69（3 轮×23）**：每轮 x25519=SHA256(标签‖轮次)、ed25519=RFC 8032 TEST1/2/3 官方向量密钥、随机数独立；判 shared/cap/sap/双向 key+iv/res master 双端逐字节相等、transcript hash0==hash1、证书内 SPKI pubkey==server 签名公钥（证书-密钥绑定）、双端 complete 且 err=0 |
| c. 负例 ≥6 按态精确拒 | 篡改 CV/错 Fin/换 transcript 字节→精确态+码 | **D 段 13 例 61/61**：①EE 篡改→CV 步拒(态4,码9) ②CV 签名篡改→(4,9) ③SFin vd 篡改→(5,10) ④CFin 篡改喂 server→(1,7) ⑤EE 先于 SH→(1,1) ⑥CV 填 Cert 槽→(3,1) ⑦SH cipher 翻转→(1,3) ⑧SH key_share 组翻转→(1,5) ⑨SH version 翻转→(1,4) ⑩SFin 截断→(5,2) ⑪CH 无公共 suite→server(0,3) ⑫CH 无 key_share→(0,4) ⑬CH 无 1.3 version→(0,5)；被拒机即死（再喂=码13/9） |
| d. 事件化接口 | 喂一段→出一段+状态迁移，无内部循环 | **E 段 5/5**+接口冻结：`Configure→Begin→ProducedOf` 出 CH；`Feed(msg)` 一条一迁移（同态重喂=拒，码1）；终态 `ProducedOf` 出 Finished；server 首喂出整 flight（W3b 按头切分进 CRYPTO 流）；无任何跨消息内部循环 |

合计 **173 PASS / 0 FAIL**，退出码 0。

## 3. 方法与证据

- 驱动判活：repo 根 `./cheng` 判死（SIGILL rc=132，两次）→按配方 `results/exe_dd_verdict_run.md`
  用冻结 `artifacts/bootstrap/cheng.stage3`（sha256 前 20 位 `05af823e7db0c8ea1a69cbd0`）
  金丝雀 `src/tests/ordinary_zero_exit_fixture.cheng` compile_rc=0/run_rc=0/unresolved=0。
- RFC 8448 三处 draft-18 形差异（Python cryptography oracle 先行逆向实锤，模拟脚本+复算
  在 .scratch/w2i2_*.py，运行证据见 evidence）：
  1. Certificate 的 certificate_request_context 为 **1 字节**长度（final 为 2 字节）；
  2. CV 签名内容为 **64 空格 ‖ 上下文串 ‖ 00 ‖ hash(CH..Cert)**（final 序相反）——
     用 PSS EM 解包提取真实 H 后全空间对拍唯一命中；
  3. ServerFinished verify_data = HMAC(finished_key_s, **hash(CH..CV 含 CV 本身**))。
  client 机以 `cvContentStyle=2`（cvStyle 配置）逐字节复放这三点；自握手双端走 RFC 8446
  final 序。**无任何验签跳过路径**：8448 的 RSA CV 与自握手的 ed25519 CV 都是真实验签。
- 证据目录 `results/w2i2_evidence/`：compile.log、w2i2.report.txt（unresolved=0）、
  run.log（173 PASS 全名）、run.err（空）。哈希绑定（sha256 前 20 位）：
  state_client `6f2e0c9d28af023d797fea55` / state_server `f006db429b88dd264eac3a98` /
  驱动 `90b91fd75a7b768489745200` / 驱动 exe `ff19017fb6ad88509d914097` / stage3
  `05af823e7db0c8ea1a69cbd0`。构建产物在 cheng_scratch_scope.sh 作用域内即焚，仅证据落 docs。
- 共享树零改动：本线足迹仅上表三个新文件+本 evidence 目录（git status 复核，未 commit）。

## 4. 编译器代际契约增量（本片实测新沉淀，接 i1 §4 的 9 条）

10. **不能用托管全局初始化局部**（`var ch: Bytes = <global>` = plain local copy 拒）；
    需要副本时用 `BytesSlice(global,…)` 视图或 msg.tls13OwnedBytes 拷贝。
11. **仍存活的全局不能作 plain 托管形参实参传跨模块函数**（asn1EncodeBitString(global) 拒）；
    @borrows 形参收全局合法；plain 形参一律先落 `BytesSlice` 视图局部。
12. **访问器不得经包装函数返回「形参的 Slice 视图」**（视图根在 byval 形参上无法物化，
    minasn1 内 `BytesSliceView is @borrow_result` 注释同源）；直接 `BytesSlice(global,…)`。
13. **托管 struct 局部（如 Asn1TagValueNext）的字段 move 进全局后，struct 本体 drop 即拒**
    （drop-source lacks exact owned definition）；字段取值用 BytesSlice 拷贝。
14. i1 codec 两处**编码器/解码器长度形不一致**（builder 的 session_id 用 u16 向量、
    decoder 按 RFC 8448 u8 读；Certificate context 同类）——本片状态机自带 CH/SH/Cert
    构造器对齐 decoder 形，**禁用 msg 的 CH/SH builder 与 u16 context 形**；D11-13 的
    策略变体经 `tls13CliBuildHello`（公开 builder）生成。
15. 驱动 expectTrue 的 `assert(false,…)` 即刻终止运行（rc=1）——诊断打印必须放在
    expect 之前。

## 5. 已知边界（如实）

- HelloRetryRequest 不在本片：Begin 的 chOverride 入参即二 flight 重建钩子（标注，未实现 HRR 状态）。
- 0-RTT、client 证书请求、X.509 链验证不在本片：client 只做端实体 SPKI 提取+CV 验签；
  server 内置最小自证 DER（campaign 免 PKI 模型）。
- session_id echo 校验不做：i1 codec 未暴露对端 echo 字节（本片双端用空 session id，
  wire 形一致）；codec 扩展归后续片。
- AEAD 记录层不在本片：状态机吐/吞裸握手消息，QUIC CRYPTO 流分帧与包保护归 W3b
  （flight 按 4 字节握手头自分隔，切分由 pump 侧完成——驱动 C/D 段即外部驱动实证）。
- ServerHello 的 legacy_session_id echo 字节因上述 codec 限制未读，域检覆盖
  suite/version/key_share 组/长度四项。
