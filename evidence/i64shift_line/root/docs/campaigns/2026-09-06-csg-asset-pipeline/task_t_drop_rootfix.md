# task_t_drop_rootfix.md — T 战役：冷后端 drop 胶合跨闭包碰撞根修与真机终验

日期：2026-09-12。承 task_r_orc_miss_fix.md（R 线：ORC p=0x1 根因定位与解阻）。
修复全部发生在专用克隆 `/Users/lbcheng/cheng-f24/anchor_clones/orcfix`（R 线解阻版
防波堤+源级 owned 深拷已在此工作树）；主仓 src/bootstrap 零改动（patches/ 与本文
档除外）；两仓 git 零写操作（patch 按任务授权 git add -f 进 index）。设备
HUAWEI Mate 70 Pro+（serial 3KN0224C18003262）。

---

## 1. 判词

**drop 胶合跨闭包碰撞根修完成并真机实锤：两轮真机（防波堤版 + fail-stop 版
psb）orc_miss 全部绝迹、fetch 全链 sha256-match、fail-stop 下零崩溃，R 线
§回归判据完整达成。秒开闭环仍差最后一层：manifest_load_failed 为独立中间层
缺陷（fetch sha256 正确但 load 失败），与 ORC/drop 无关，按判据如实 BLOCKED
另案。**

## 2. 碰撞机制定稿（R 线观测正确，根因修正为跨闭包符号碰撞）

1. **真机反汇编铁证**（装机 so 内 `<cold-drop-object:51>` @0x66210）：
   序言 19 次 `ldr x10,[x0,#0..144]` = 152B/19 字布局；45 个 `bl` 调用点跨
   6 函数（StreamManifestParseEx×26、parseMultiAddressInto×11、ssm1d_load×3、
   Ssm1dDispatch×3、StreamManifestLoadFileEmbedded×1、drop:231 嵌套×1）；
   parseMultiAddressInto 调用点 caller 仅拷 4 字（32B 槽）→ helper 读 19 字
   越界释放。p=0x1（str.flags）/p=0x21（len）/p=const 串静态地址逐一对应。
2. **根因（本轮定稿，补正 R 线「canonical identity 折叠」假设）**：drop
   helper 是合成符号，名 `<cold-drop-object:row>` 的 row 只是**本编译闭包内**
   的 ObjectDef 行号。同一 so 链接多个 Cheng 闭包（ssm1d/ssm1q/psb/psh/dbg），
   每闭包都有自己的 row 51——ssm1d 闭包 row51=152B/19 字类型、ssm1q 闭包
   row51=SegmentRead 32B/2 字段。链接 flags `--allow-multiple-definition`
   把同号 helper 静默合并为首个定义，**其余闭包对该 helper 的全部调用绑定到
   错误布局的 glue**。单闭包编译内 canonical 键精确无碰撞（探针全景：ssm1q
   闭包 3547 次 ensure、58 helper、0 跨类型共享；orcfix/ohosdev 双 root 同），
   故碰撞只在链接期可见、此前不可归因。
3. **键缺什么（补 R 线之问）**：缺**布局**与**闭包间唯一性**。编译期防线
   （param_size/exact_type_id）在单闭包内自洽；跨闭包只看符号名。

## 3. 根修（patches/t_drop_canonical_layout_bucket.patch，已 add -f 入主仓 index）

1. `cold_object_drop_layout_fingerprint`：FNV-1a 64 位哈希 slot_size/is_ref/
   inherited_field_count/field_count + 每 field kind/size/offset/array_len。
2. helper 全局唯一命名 `<cold-drop-object:row.fingerprint16>`：跨闭包同类型
   同布局才同名（链接合并且行为一致，符合「同布局可共享」）；不同布局永不
   合并。row 保留诊断可读性。（`@` 因 lld 解析为符号版本分隔符而弃用。）
3. 同闭包内同 row 布局漂移防御（canonical 折叠破缺兜底）：按名查桶，无则
   新建桶 helper；`Symbols.object_drop_helper_layout_fingerprints` 存桶 0
   指纹（cold_types.h + cheng_cold.c 镜像 struct；初建/两处增长/释放四点同步）。
4. 三处调用面（slot/exact/generic 特化）backstop：`helper->param_size[0] ==
   调用方槽宽`，不等 fail-stop。
5. 观测面：`CHENG_COLD_DROP_HELPER_DIAG` 门控打印 ensure 全景。

## 4. 验证阶梯（全部真实输出）

### a. obj/链接层
- 修前复现链：装机 so 内 drop:51（19 字序言）邻居符号为 Ssm1dStateLine/
  ssm1d_cmd/ssm1d_load——确证其来自 ssm1d 闭包；ssm1q 闭包 obj 的 reloc 表
  显示 parseMultiAddress 等 11 处调用指向本闭包 row51（SegmentRead）→
  链接后全部绑定 ssm1d 的 152B 版本。
- 修后：so 内 `<cold-drop-object:51.252761f8679ff111>`（ssm1q SegmentRead
  32B）与 `<cold-drop-object:51.cbeb203eca60b8b3>`（ssm1d 152B）**并存**，
  ssm1d/ssm1q 两闭包 helper 名集合交集为 0（无任何跨闭包合并）。
- force 注入门控自测（临时，已还原）：同 row 布局分裂被「value-object
  decomposition tree is not exact」一致性校验 fail-stop 拦截——不静默产毒。

### b. 回归判据（R 线 §回归判据 + 默认行为）
- R 线三形态夹具 `src/tests/r_orc_repro_stackinit.cheng` darwin obj：修前
  （w126_re）与修后 sha256 逐位一致
  `bf1c157926a716def8a9a3e0fbd6dfebea81d056f85be77f9db393423e480aa4`；
- ssm1q 闭包（orcfix root，分桶/命名前 v1 根修）ohos obj 修前修后逐位一致
  `147f7d4d90efee06...`；v3（跨闭包唯一命名）按判据允许「仅 helper 命名
  差异」：58 个 helper 全部改名 row.fp，函数体与调用指令流不变；
- ssm1q 闭包（ohosdev root）ohos obj：rootfix 与 w126_re 逐位一致 `c38e0f86...`；
- canary rc=0；车头 self-check rc=0。

### c. 真机闭环终验（真实 hilog，两轮）
**轮 1（根修 v3 + rguard 防波堤 psb，orcfix 闭包，09:23:45）**：
```
T_PUBLISH worker serve rc=97 chunks=45 headerLen=4625 kfChunk=0 kfLen=65572
fetch stage=0/1/3 elapsedMs=165/465/1667
fetch ok chunks=45 kfChunk=0 manifest=4625B chunk=65572B
    sha256-match=be20ab8ec6be22e984ffc92163bb5b73e2d22e4394b92d44cd127de18d3eb5a6
T_FETCH done fetchMs=1818
（本轮 hilog 全文 0 条 orc_miss——R 线轮每轮 5 条，绝迹）
assemble+load resp=ERR manifest_load_failed
T_RECEIVE totalMs=2178 (fetchMs=1819 loadMs=2163 renderMs=15) state=ERR not_inited
render rc=-6 detail=ERR frame_meta_invalid
```
**轮 2（防波堤回退：psb 换 psb_ohos_m6q.o fail-stop 版 a4d865ca，09:24:42）**：
```
T_FETCH done fetchMs=1816（sha256-match 同上）
assemble+load resp=ERR manifest_load_failed
T_RECEIVE totalMs=2176 (fetchMs=1817 loadMs=2162 renderMs=14) state=ERR
（0 条 orc_miss、0 次 fail-stop 崩溃——miss 绝迹故防波堤可安全回退，
 R 线 §回归判据「psb 恢复 fail-stop 后全链仍绿」达成）
```
判据逐条：orc_miss 绝迹 ✓；T_RECEIVE totalMs 出数 ✓；fetch 全链 sha256
PASS ✓；state 非 ERR ✗（见 d）——灰度上屏未达成。

### d. frame_meta_invalid 判别（完成）
orc_miss 绝迹 + fetch 整流 sha256-match + fail-stop psb 下零崩溃三者齐备后
`manifest_load_failed` 仍 100% 复现（两轮四次 assemble+load 全 ERR）→ **判定
为独立中间层缺陷**（manifest 解析/load 路径，非 ORC 误释放次生损坏）。
R 线 §6 假设 (a)（drop 胶合合法块误 release 的次生损坏）被排除。另案输入：
assemble+load 入参 bytes=2955365 与 rawfile 一致，ERR 在 manifest 解析层；
建议下轮在 ssm1q manifest.ParseEx 的 IsErr 分支打 detail 码定位。

## 5. 环境事件存档（非遗留缺陷，如实）
1. 冷对象缓存 store die（`cold object cache store payload identity failed`）：
   `--out` 落在 /tmp 时产物 gid=wheel ≠ egid=staff，被 payload 身份组校验
   合法拒绝。工作流结论：编译产物必须落仓内路径。诊断探针已还原。
2. darwin exe 链接 repro 夹具失败：R 线 lr 钩 `_cheng_miss_diag_store_lr`
   的 C 实现活在 UniMaker ssm1_napi_shim.c，纯 darwin 链接无 shim →
   unresolved；夹具判据改走 obj 层（§4.b）。
3. 真机首轮回退教训：`ssm1_harmony_build.sh` 默认 `SSM1_OHOSDEV_ROOT=ohosdev`
   （M4 代闭包，无 R 线解阻源），R 线真机轮实际用 orcfix 的 fixed 闭包——
   闭包选错会复现旧缺陷形态（本轮已用 orcfix 闭包复刻并记录）。

## 6. 复验序列（已执行，留档）
```
车头：orcfix .tmp-exec/t_drop_v3/cheng sha256
  038c1cd66cc6f6f474a6887849192fb968c2741c0ef3d921a7e61b0d7bc76d67
ssm1d_export_ohos.o / ssm1q_loopback_ohos.o：orcfix root + v3 车头重编
（v3 命名：两闭包 helper 名交集 0，so 内 drop:51 两版本并存）
ssm1_harmony_build.sh（PSB_OHOS_OBJ=psb_ohos_rguard.o）→ libssm1napi.so
  16KB align=0x4000 全过 → hvigor assembleHap → hdc install -r →
  aa start -b com.example.unimaker -a Ssm1Ability → hilog 终验（§4.c）
轮 2：PSB_OHOS_OBJ=psb_ohos_m6q.o（fail-stop）重链重装复验（§4.c 轮 2）
```

## 7. 待主仓入库清单
1. `patches/t_drop_canonical_layout_bucket.patch`（v3，已 add -f 入 index；
   对主仓 HEAD 干净基线 `git apply --check` 通过）。
2. 根修车头：`tools/build_backend_driver_clt.sh` 重烤，v3 sha256
   `038c1cd66cc6f6f474a6887849192fb968c2741c0ef3d921a7e61b0d7bc76d67`。
3. S 线 canonical 折叠 WIP（跨布局 die）与本 patch 互补：前者守单闭包折叠，
   后者保跨闭包链接 + drop 层结构不串扰。

## 8. BLOCKED / 待办（如实）
1. **秒开闭环最后一层**：`manifest_load_failed` 独立中间层缺陷（判别见
   §4.d）。秒开三判据中 orc_miss 绝迹/fetch PASS 已达成，state=ERR 未达成；
   rendered=false 未上屏。建议战役：ssm1q manifest.ParseEx/load 路径 detail
   码打点 → 定位解析拒绝原因。
2. dial 首跳 1.26s、fetchMs≈1.8s：传输层另案（R 线 §9.1 遗留持续）。
3. 本轮真机期间设备两次锁屏/离线（devicelock 10106102 拦截 aa start、hdc
   断连约 50 分钟），均如实等待恢复后复测。
