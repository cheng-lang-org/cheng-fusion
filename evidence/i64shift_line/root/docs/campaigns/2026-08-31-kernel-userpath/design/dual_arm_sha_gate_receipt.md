# 双臂 sha 对拍：判据订正 + 机械件落地（C2 欠账的仪器半）

日期：2026-09-13 | 线：RSI 融合线（A7/S5 原始件）| 依赖：无（原始件已在盘，零编译）

## 结论（先行）

1. **裸「exe sha 相等」在这条产物族上恒不可满足**，拿它当确定性判据只会得到假红。证据总账
   §8.69/§8.71 记的「exe sha 对拍待墙通后补」，补的时候**必须换判据**，否则补出来的是噪声。
2. **有判别力的判据是两半**：① `.primary.o` 逐字节相同；② exe 的全部差异字节**落在两处已点名的
   非确定摘要字段内**（CHENGPVC 的 evidence/proof 摘要，与文件末 32 字节）。两半都成立才绿。
3. 本轮交付机械件 `tools/exe_sha_pair.py`（内置 7 例自测，含 3 例负对照），并在 S5 原始件上
   实测取得 **GATE_RC=0**；负对照（在 `__TEXT,__text` 里翻 1 字节）实测 **判红**。
4. **未竟**：真正要补的两臂对拍（diag vs hardcut 在发射点的产物）仍被**现役前沿墙
   `compiler parser receipt: generic declaration header invalid`（B7 在攻）**前置阻塞——两臂当前
   都到不了发射点。本件把"墙通后一条命令出判词"这件事做完，不等于欠账已清。

## 一、口径订正的依据（全部为本轮实测，非推断）

原始件：`.rebuild/a7s5/`（S5 轮产物，2026-09-13 10:08–10:21，零改动只读）。

### 1.1 对象半：四件 `.primary.o` 逐字节相同

| 件 | sha256 | 字节 |
|---|---|---|
| `pristine_ordinary_zero_exit_fixture.exe.primary.o` | `7b594c89a24f01f3b7478a103e126f9a9300ac444ed1d4b160fb3556df98b771` | 612 |
| `patched_ordinary_zero_exit_fixture.exe.primary.o` | 同上 | 612 |
| `det_r1.exe.primary.o` | 同上 | 612 |
| `det_r2.exe.primary.o` | 同上 | 612 |

⇒ 跨「pristine/patched」与跨「同一驱动两次烤」**均为逐字节相同**。这是有判别力的那一半。

### 1.2 可执行半：四件 exe 的 sha 全不同，但差异**全部**落在两处摘要内

四件大小同为 7,451,752 B，sha256 分别为
`fe294004…`(det_r1) / `ca8a18ec…`(det_r2) / `10d7246c…`(pristine) / `c98e2bb1…`(patched)。

Mach-O 段表（`parse_containers` 实读，det_r1）：

```
(outside-sections)      0        .. 4096
__TEXT,__text           4096     .. 613792
__TEXT,__stubs          613792   .. 614848
(outside-sections)      614848   .. 622592
__DATA,__data           622592   .. 7387952
__DATA,__got            7387952  .. 7388656
(outside-sections)      7388656  .. 7451752
```

CHENGPVC 承诺块位于 **7393744**（段表外），120 B；四件字段实测：

| 件 | content_set_digest | evidence_digest | proof_digest |
|---|---|---|---|
| det_r1 | `b23920d0ef544532…` | `be41ffade2514665…` | `bd9cbc2a3cd99699…` |
| det_r2 | `b23920d0ef544532…` | `3b9f31cf348f7b86…` | `5eabe1ffa3af7ecc…` |
| pristine | `b23920d0ef544532…` | `42ca272cbd950d58…` | `538cabded72f083a…` |
| patched | `b23920d0ef544532…` | `bab7db426d3f6ab9…` | `a55cbf6a9a340b7d…` |

⇒ `version/sha256_alg/size/provider_count/content_set_digest` **四件全同**；
`evidence_digest`+`proof_digest` **每一对都不同——包括 det_r1 vs det_r2（同一驱动、同源、两次独立烤）**。

六对臂的差异字节**全量归因**（不是抽样）：

| 对 | 差异段数 | 摘要窗口内字节 | 末 32 B | **其它** |
|---|---|---|---|---|
| det_r1 vs det_r2 | 3 | 63 | 32 | **0** |
| det_r1 vs pristine | 2 | 64 | 32 | **0** |
| det_r1 vs patched | 2 | 64 | 32 | **0** |
| det_r2 vs pristine | 3 | 63 | 32 | **0** |
| det_r2 vs patched | 3 | 63 | 32 | **0** |
| pristine vs patched | 4 | 64 | 30 | **0** |

⇒ 首差偏移恒为 **7393800** = 承诺块 + 56 = `evidence_digest` 字段首字节。**没有任何一个字节
落在具名 section（__text/__stubs/__data/__got）里。**

### 1.3 为什么这是"判据订正"而不是"放宽门"

det_r1 与 det_r2 是**同一驱动、同一源码、同一命令行**的两次独立烤制，二者 exe sha 就不同 ⇒
exe sha 的不等**不携带"产物是否等价"的信息**。把它当判据，等价产物也会被判红（假红），
而真正的回归（代码段变了）反而可能被同一处的噪声掩盖。订正后的判据**更严**：它要求
`.primary.o` 逐字节相同**且**其余全部字节（含 `content_set_digest`）逐字节相同，只放过那 96 B
已被两次独立烤制证明为非确定的摘要面。

## 二、机械件

`tools/exe_sha_pair.py`（只读；无第三方依赖；自带 Mach-O64/32 段表解析）：

```
python3 tools/exe_sha_pair.py --self-test          # 7 例：4 通用 + 3 摘要面负对照
```

自测实测 **7/7 PASS**（含"__TEXT,__text 翻字节必红"、"承诺块 version 字段翻字节必红"、
"摘要面差异未声明时仍必红"三例）。**门口只在显式声明时打开**：
`--allow-commitment-digests` 只放行承诺块 `[+56,+120)` 64 B；`--allow-eof-digest` 只放行末 32 B
且**与任何具名 section 重叠即拒跑**（不在真代码上开口子）。

墙通后的两条命令（**当前两臂都到不了，跑出来只会是同墙判词**）：

```
python3 tools/exe_sha_pair.py \
  --object <armA>.primary.o --object <armB>.primary.o \
  --exe armA=<armA>.exe --exe armB=<armB>.exe \
  --allow-commitment-digests --allow-eof-digest
```

## 三、本轮的判据/工具身份（可复核）

| 件 | sha256 |
|---|---|
| `tools/exe_sha_pair.py`（自测 7/7） | `6c2bf7d67552bb1f299930774468146fc1311b60bc9deb60f192d112912fe08e` |
| S5 原始件目录 | `.rebuild/a7s5/`（只读，未改动） |

## 四、与 B7 链的关系（用户给定的主链）

`B7 通墙 → 补 sha 对拍 → 档 1/2 语料解锁 → C1/C2 对 234 源冻结测量合同 → RSI 自动筛选内核收敛`

本件完成的是第二环的**仪器与口径**（换判据 + 一条命令出判词 + 负对照），并把它的**前置依赖**
显式钉在 B7 上。第一环（B7）仍在攻 `compiler_parser_receipt.cheng:6914`，非本线领地，本线不碰。
