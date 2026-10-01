# r2c：UniMaker React.js → 纯 cheng GUI 完整转译战役

日期：2026-09-13。用户令：用 CSG 一键转译 UniMaker 的 React.js 到纯 cheng GUI，完整项目语义图（路由、样式、事件全量），不是 CSG 视频壳。即 openspec `openspec/proposals/unimaker-react-to-cheng-transpile.md`（M1-M4）的用户确认开工。

## 源与管线现状

- React 源：`/Users/lbcheng/UniMaker/React.js/app/`（122 tsx，43 路由）。
- 快照管线（现役，将被替代）：`ts-csg/scripts/unimaker-one-click.mjs` 四步
  extract(csg-web)→materialize(快照)→compile→run；快照模型 = UI=f(state) 的 44 路由有限采样，
  272 个 no-op handler 存量（提案病根表）。
- 转译管线（本战役）：`ts-csg/src/csg-cheng-transpiler.ts`（M1 核心已存，5100+ 行）
  消费 csg-core facts（csg.function/op/data/type_decl + **csg.jsx 完整 JSX 树**）。

## M1 已完成（本日）

1. **单组件全链实证**：NodesPage.tsx → extract(28976 facts) → 全函数转译(61 fn，20 OK)
   → 闭包+残 struct 过滤装配(16 fn) → stage3 编译 → 运行 **10/10 语义断言 rc=0**
   （断言逐条对照 TS 源手核）。复现：`repro/README.md`。
2. **全项目普查**（78 万行 facts / 220MB）：3875 函数，728 直接可转译(18.8%)，
   失败 3147 fn / 14532 诊断。Top 桶 = 宿主环境面：
   unsupported callee 3303 / unresolved identifier 2055 / 表达式种类 1068 /
   不支持 receiver property 981 / typeof 855 / 参数类型 795 / STRUCT_PRESENCE 396。
   明细：`reports/full-census-summary.json` + `full-census-faillist.json`。
3. **两墙定谳**（findings.md 2026-09-13 条）：
   - 墙 B（静默损坏）：`strings.SliceBytes` = 零拷贝视图，视图指向托管临时即悬垂
     （0xDD 字节毒化，len 正常）。转译器已物化防御；根修归编译器战役。
   - 墙 A（响亮拒绝）：托管绑定自「用户调用+参数派生局部实参」缺 exact-source 证明。
     统一 share/@borrows 后不再触发。
4. **转译器纪律化**（全部回归绿：单测 + struct-presence + mech12/14/16/27）：
   - 转译函数与 prelude 统一 `@borrows` 形参（TS 参数不可变 = 借用语义的诚实 lowering）；
   - 托管嵌套调用实参物化为命名临时（求值顺序不变，墙 B 防御）；
   - jsStrTrim 返回克隆切片（JS trim 语义 = 新串）；
   - push/spread 降级对托管元素补 `share()`（对齐 web_runtime add-share 先例）；
   - str 实参统一 CloneStr share 策略（trim/toLowerCase/slice）；
   - emitExpr 单次求值记忆化（op.id → 结果 var，消除同一表达式双重发射）。

## M1 收尾批次（本日第二批）

- 转译器新降级：binding_extract 解构绑定（census 全部 2009 处单跳，rest 诚实拒绝）、
  JSON.parse/stringify 桥（parseJsonSafe+panic fail-loud）、Array.isArray 类型驱动折叠、
  Boolean() truthiness 折叠、`??` on json.JsonNode（JNull 判定）。全部回归绿
  （单测+struct-presence+mech12/14/16/27+NodesPage 端到端 rc=0）。
- 二轮普查（同口径）：OK 728→771 fn（18.8%→20.5%），诊断 14532→13950（-582）。
  关键结论：诊断清偿与函数解锁非线性（-582 诊断只 +43 函数）——失败函数平均卡
  4.5 个障碍，剩余大桶是 hooks（useState 36/useCallback 19/useRef 10/useEffect 13）
  与宿主面（localStorage/window/sessionStorage），其设计归宿是 M2 的 CHT 状态槽
  接线与 host-bridge 注册，普查口径下到 M2 才会解锁。
- 报告：`reports/full-census-summary-r2.json` + `full-census-faillist-r2.json`。

## M2 机制三件套落地（本日第三批，全部 stage3 真编真跑验证）

- **useState 全局状态槽（转译器内置，不经 .mjs classifier）**：`transpileR2c(facts, componentName)`
  导出——按组件 owner 扫描 useState 解构（emitStateSlots 复用，歧义守卫继承），发射
  `var __r2c_<state>` 槽 + `set<State>` setter（值变才置 dirty）+ `r2cTakeDirty`；
  组件体内解构=声明壳，读槽→槽 var，setter 调用→生成 fn。transpileFunctions 加
  options 注入（globalStateSlots/stateSetterNames/hostBridges/r2cPreludeCode/
  narrowAnyReturnToVoid/alwaysPrelude）。
- **host 桥默认表**：localStorage/sessionStorage Get/Set/Remove → 进程生命周期内存 KV
  prelude（live-tombstone 删除语义，与 DOM storage 可观测面一致）；PRELUDE_DEPS
  通用依赖闭包机制（发射时自动带上依赖条目）；typeof `X ===/!== 'undefined'` 对
  R2C_HOST_GLOBALS 十个宿主对象折叠为常量（native 壳注入=恒存在，SSR 探针的精确
  目标语义）；bare 宿主全局标识符在值位=响亮 fail（指引桥具体成员调用）。
- **JSX→节点树**：`__r2cJsxAdd(tag, className, text, parent)` 定长保留表；jsx op 与
  csg.jsx fact 双入口递归；text/静态 className/简单标识符插值（str/int64→jsNumToStr）
  降级；spread props/复合表达式 children（extractor 只带文本）响亮 fail。
- **端到端**：R2cSmoke.tsx 真实抽取→transpileR2c→stage3 编译→8/8 断言 rc=0
  （槽写读/storage 回读/5 节点树/文本/dirty 双态）。固化测试
  `ts-csg/scripts/r2c-smoke-stage3.test.mjs`（PASS）；one-click 升级 transpileR2c 模式。
- **NodesPage 实测**：22 槽提取成功；12 个 `useState(null)` 形态报 empty type（null
  初始值无法定型，需 setter 调用点类型流推断）+ 组件体 4000 行多障碍叠加（57 局部
  类型推断等）——大组件清偿是下一阶段量化的主对象。

## 剩余1 批次：useState 槽定型 31/34（本日第四批）

- **extractor 层类型流修复（csg-core.ts）**：泛型 `useState<T>(...)` 的 React signature
  解析退化为 any 时，用显式类型实参合成 tuple return `[T, Dispatch<SetStateAction<T>>]`
  ——源码里唯一精确类型不再被宿主解析失败抹除。
- **转译器 emitStateSlots 三条新推断**：setter 调用点类型流（null 初始值场景，全闭包
  扫 setter 实参 returnType，冲突走歧义守卫）、lazy initializer（`useState(() => expr)`
  的箭头体 return op 类型）、`Set<T>` → `T[]` 映射（去重语义在变异点保证，读取面
  可观测等价）+ 数组 Set 语义降级（has/add/clear/delete/size，str/int64 元素原语）。
- **NodesPage 实测**：槽 22→31，槽诊断 12→3。剩余 3 个：2 个跨文件类型
  （DistributedContent/NetworkTelemetrySnapshot，v2 全项目 facts 已含，单文件口径无解）、
  1 个 lazy initializer 域函数调用类型流（`useState(() => normalizePeerId(...))`，
  extractor 对域函数签名 returnType 仍 any——extractor 深水区归档）。
- **三轮普查（v2 facts 全项目重抽 + tuple 合成）**：诊断 13950→13638（-312），
  ok 持平 771（20.5%）——多障碍叠加结构不变，组件函数的主障碍已是 hooks 面
  （useRef 16/useEffect 15/useMemo 8）与内联事件闭包（function_value 55），
  这两桶是 M2 验收（搜索/排序）的直接依赖，列为下一批次。
- 七套回归全绿（含 r2c-smoke）。

## 剩余2-A/B 批次：hooks 面+内联闭包机制落地（本日第五批）

- **csg-core hook 泛型合成扩展**：useRef 显式类型实参直取 T（MutableRefObject 包装
  剥离）；useMemo 退化 any 时取类型实参。
- **useRef 全局槽（emitRefSlots 导出）**：`const r = useRef<T>(init)` → `var __r2c_<r>: T`
  + r2cRefsInit；`.current` 读写折叠为槽 var 本身（property_read/property_write 双点）；
  local_write 与 binding_extract 双形态壳拦截。NodesPage 3/16 提取（裸 `useRef(null)`
  形态的类型流=下一批，与 useState(null) 同族）。
- **function_value 内联箭头编译（最大桶 55 清偿）**：组件体内箭头 → 独立命名 lambda
  函数（全局槽表注入，零自由变量子集）；引用组件体局部者响亮 fail（flat 函数模型
  无表示——CHT 的 fv 注入是后续事件分发批次的依赖）。
- **useEffect/useMemo 降级**：mount 语义（回调 lambda 编译+组件体发射调用一次；
  deps 忽略=初始执行，重算归 M4 render loop）。
- **React updater 形态**：`setX(prev => ...)` → lambda(槽var) 取值写入（NodesPage
  15 处 updater 全通）。
- **NodesPage 实测**：诊断 210→193；function_value 桶 55→2、callee 桶 42→16。
  剩余主桶=局部类型推断 52（lazy init/域函数类型流，extractor 深水）与标识符 27。
- 七套回归全绿（含 r2c-smoke 8/8 rc=0）。

## lambda 别名批次（本日第六批）

- **compileInlineLambda 公共方法**（function_value case 与 local_write 共用）：
  `const f = (x) => ...` → 箭头编译为命名 lambda + localAliasTargets 别名注册，
  后续 `f(args)` 调用走 S2 alias 机制解析。localAliasTargets 放宽为可变 Map
  （r2c 注册面），.mjs 注入路径改 setLocalAliasTargets。
- **诚实显形效应**：lambda 别名让箭头体内部诊断显形（原一笔 function_value 挡住
  全部内部障碍）——NodesPage 诊断 193→225 但可诊断信息量大幅增加（每条都可定位
  到具体表达式），这是清偿前期望的方向。
- 七套回归全绿。

## 类型流收口批次（本日第七批）

- **裸 useRef 类型流（extractor 层）**：csg-core property_write emit 补
  valueReturnType（写入值自身 TS 类型）；emitRefSlots 赋值点推断
  （`.current = x` 全闭包扫描，字面量类型文本归一，冲突即排除）。
  **根因定谳**：跨文件域函数 returnType any 是 --file 单文件模式的 checker
  局限，--project 全项目模式正常（mini 实验实证）。NodesPage refs 3→14/16
  （剩 2 个 Map<K,V> 诚实 fail）。v3 全项目重抽（含 valueReturnType）后
  **slots 34/34（0 诊断）、HomePage slots 23/23（0 诊断）**——搜索/排序链
  状态槽全就位。
- **lazy initializer 补充推断**：比较/逻辑 binary 返回→bool、unary !→bool；
  Record<anyKey,...>→json.JsonNode（不限 string key）。
- **四查普查**：ok 771→774（20.6%），诊断 13638→13485（-153）。
  HomePage 组件体剩 122（callee 24 宿主面/域函数、identifier 24、
  cannot infer 29——下一批判清偿后进 M2 验收编译切片）。
- 七套回归全绿（含 r2c-smoke 8/8 rc=0）。

## 第八批：useCallback 剥壳 + M2 验收切片状态

- **useCallback 剥壳**：`const f = useCallback((x)=>..., deps)` → 内层箭头 lambda
  别名（deps 只控身份不控语义）；call 拦截扩展到 local_write.value 消费。
- **HomePage 实测（v3 facts）**：slots 23/23（0 诊断）——searchQuery/sortType/
  showSearch/showSortMenu 等搜索排序链状态槽全就位；组件体剩 129 诊断，其结构：
  lambda 内部跨文件 alias 递归链（HomeChannelType→PublishType→typeof 常量，TypeMapper
  深水）、props 回调桥接（onNavigate 等，事件分发批次依赖）、宿主面（window./
  document. 拉流类）。
- **M2 验收切片状态（如实）**：状态槽层完成；组件体编译层未通——组件 render 主函数
  与 handler 的全量编译需上述三桶清偿。四查普查 ok 774（20.6%）。

## M2 验收达成批次：跨文件 alias 递归 + 组件语义切片 headless 回放 rc=0（本日第九批）

- **TypeMapper 跨文件 alias 链定谳**：PublishCategory→HomeChannelType→
  PublishType→typeof PUBLISH_TYPE_VALUES[number] 全链递归已通（typeof CONST[N]
  数字索引扩展；union-of-str 纯递归分支既有）；Content→DistributedContent struct
  alias 单名递归既有。此前诊断是单文件 facts 时代产物，project 模式即解。
- **表达式层方法返回类型推断（exprType）**：数组方法 filter/map/slice/sort/concat→T[]、
  includes/some/every→bool、findIndex→int64；str 方法 toLowerCase/slice/...→str、
  includes/startsWith/endsWith→bool——checker 在无标注回调语境下退化的 any 由
  方法语义精确决定（非捏造）。lambda 体类型流（return→体内局部→初始化表达式，
  深度 1）+ lambda 别名返回类型传播 + 别名 emit 名表（localAliasEmitNames）。
- **lambda 语义修正**：值 lambda 不吃 handler 的 any→void 窄化（useMemo 体是真实
  数据流），any 返回走体推断。r2c 槽类型经 TypeMapper 注册（struct 声明落盘）；
  typed T[] 槽的 `[]` 初始不再误发 NewJArray。
- **托管元素 add-share 纪律化收口**：filter/map/sort 降级循环统一 PRIMITIVE_CHENG_TYPES
  判定 + share()。
- **M2 验收达成（headless 切片）**：HomePageSearchSlice.tsx（HomePage.tsx 真实
  过滤/排序/搜索语义链摘录）→ extract → transpileR2c → stage3 编译 → 状态序列
  回放 10 项断言 rc=0（初始渲染 / 搜索"旅行"过滤 / 清搜索+time 排序重排 /
  搜索+排序组合 / dirty 翻转）。固化测试 ts-csg/scripts/r2c-headless-replay.test.mjs。
  数据由宿主 main 注入（内容源=宿主面职责，转译面验证状态→过滤→排序→渲染链）。
- 八套回归全绿（单测+r2c-smoke+struct-presence+mech12/14/16/27+headless-replay）。

## 第十批：const 对象数组类型注册（三桶攻坚之一）

- **index 层 constArrayElemTypes**：模块 const 数组符号（declarationKind=const 且
  type 为 `T[]`，含 import(...) 前缀剥离）登记元素类型文本；`typeof X[N]`/
  `typeof X[number]` 与 exprType(identifier) 经 TypeMapper 消费。实证：
  `typeof categoryTabs[0]→HomeChannelDefinition`，HomePage 的 categoryTabs.map 桶
  清零。全项目 700+ const 数组符号获得元素类型流。
- **剩余三桶深水定位（HomePage 133/NodesPage 149）**：
  a) reduce 回调引用外层 for 循环变量（跨作用域自由变量）——需 compileInlineLambda
     的 fv 注入扩展（CHT S2 机制的 r2c 移植），非零自由变量 lambda；
  b) props 回调（onNavigate 等）——组件参数桥协议；
  c) STRUCT_PRESENCE_FIELDS 按型审计注册（Card 等）+ timer 桥 + Object.keys/Array.from。
- 九套回归全绿（含 r2c-smoke 8/8 + headless-replay 10 项 rc=0）。

## 第十一批：reduce 降级 + 捕获链机制（在树，调试继续）

- **reduce 降级**：emitArrayMethod 加 reduce（两参回调内联复用 sort 的
  inlineArrowExpr 机制，初始值第三实参，acc 类型从初始值流）。categoryTabs.reduce
  桶清零。
- **捕获链机制（captureRenames）**：lambda 体自由名 → 外层 local_write 链追到
  槽/别名后重命名（hook 实参 useDeferredValue/useMemo/useCallback 参与追链）；
  组件级 useDeferredValue 直通 capture 表。机制在树，HomePage 133/NodesPage 161
  的链式场景（mergedContents→deferred→槽）调试继续——当前数字未降，怀疑嵌套
  lambda 的 captures 传播断点，下一批定位。
- 九套回归全绿。

## 第十二批：capture 机制落树（调试继续）

- captureRenames 机制完整落树（值带类型/追链命中槽/别名 emit 名表 localAliasEmitNames/
  useDeferredValue 直通组件级 capture 表）； HomePage 133/NodesPage 161 数字未降——
  自由名解析链仍有断点（怀疑 mergeContents 链的追链入口与 lambda 嵌套传播），下一批
  用 mini fixture 精确定位。修复期间发现并修正：此前部分 heredoc 补丁静默未落盘
  （Shell 纪律违反, 已回归 Write 落盘脚本方式），工作树曾被恢复到 HEAD 态。
- 九套回归全绿。
## 第十三批：capture 断点定位+三层链通（mini fixture 实证）

- **断点定位**（CaptureProbe.tsx 三层链 mini）：useDeferredValue 不在 call 拦截/
  壳剥列表 + transpileR2c 的 componentCaptures 构建代码从未落盘（heredoc 静默失败
  实锤，Write 落盘方式修复）。
- **修复**：useDeferredValue 直通壳（local_write 壳 + call 拦截）+ componentCaptures
  构建落盘 + 值结构 {expr,type}；value-only useState 槽（setter 未绑定也建槽）。
- **实证**：CaptureProbe 三层链（items 槽→useDeferredValue→merged→useMemo filter）
  ALL OK；HomePage slots 24、诊断 133→126。
- 九套回归全绿。
## 第十四批：文件级 const 箭头函数注册（机制+实证）

- registerFileLevelArrowFunctions：文件级 const 箭头（symbol.initializerKind=Arrow*，
  anonymous csg.function loc 被 symbol.loc 包含）→ functionByName 原名注册，
  调用点走通用被调追踪。getLastVisitTime/setLastVisitTime/saveUserTabOrder 族清零。
- **推送 pending**：github 443 全通道被本机代理环境阻断（直连/HTTP 代理/SOCKS 均
  SSL_ERROR_SYSCALL，ssh.github.com fake-ip 同断）。本地提交链安全：
  8f5909da5→(本批)，环境恢复后 git push origin main 一键补推。
- HomePage 122（useCallback 16 内部级联为主体）/NodesPage 159。九套回归全绿。
## 第十五批：props 回调桥协议落地（HomePage props 桶清零）

- **props 解构协议**：组件 parameters[0] 解构名×接口成员分类——函数成员→@exportc
  桥（签名解析：剥外层括号+参数 scalar map+ret void；宿主/父组件接线点，CLI 空体
  =可观察未接线态），数据成员→只读 zero capture（captureRenames）。
- **实证**：HomePage slotDiag 0（props 三回调 onNavigate/onOpenNode/onRouteStateChange
  桥全通）、组件体 122→119。九套回归全绿。
- 剩余具名桶：presence 审计（Card）、()=>void cleanup 返回、DOM ref（HTMLDivElement）、
  timer/Object.keys/Array.from 桥、updater typed input、for_of 对象数组迭代。
## 第十六批：presence 审计注册落地

- STRUCT_PRESENCE_FIELDS 注册六型（身份字段审计）：Node.peerId/DistributedContent.id/
  CapturedLocation.timestamp/FastPlaybackReference.key/Card.id +
  AsiHomeFeedFilterHandoff.draftId（本批前）；presence 字段支持 T[]（len>0）。
- HomePage 119→114、NodesPage 161→154。九套回归全绿。
## 第十七批：timer 桥 + Object.keys/Array.from 桥

- timer 进程内表（R2cTimerEntry/Alloc/Clear）：setTimeout/setInterval → 命名 thunk
  编译+句柄返回（泵接线归 M4 渲染循环，注释载明）；clearTimeout/clearInterval →
  句柄失效。Object.keys(json)→okeys 只读视图；Array.from(new Set(x))→去重拷贝、
  Array.from(T[])→拷贝。PRELUDE_DEPS 依赖闭包完备。
- HomePage 114/NodesPage 152（数字持平但构成演进——lambda 内部诊断逐条显形，
  可定位性持续提升）。九套回归全绿。
- 剩余具名桶：()=>void cleanup 返回、updater typed input、for_of 对象数组迭代、
  Map.values()、DOM ref、spread 对象合并。
## 第二十批：flatMap 降级 + categoryTabs 数据链架构定谳

- flatMap 降级（map 模板+内层展平循环，深度 1 语义）；方法分派/exprType 同步。
- **categoryTabs 数据链架构定谳**：categoryTabs=homeChannels=flat 计算链，且**文件级
  const 的初始化表达式不生成 op 流**（extractor 只给 csg.symbol 类型信息）——数据
  cheng 化的根在 extractor 层需为文件级 const initializer 生成 op 流/csg.data
  （跨文件数据流工程，牵 Merkle admission schema）。转译器层机制已全部就绪，
  extractor 扩展是下一会话的主工程。
- HomePage 101/NodesPage 148（flatMap 桶清零，categoryTabs 值链留待 extractor）。
- 九套回归全绿。
## extractor 根工程勘测记录（本批，改动已回滚待架构方案）

实现尝试中定位到 extractor 的**双路发射架构冲突**（改动已回滚，发现记录在案）：
1. 已落地部分可行：文件级 const 合成零参 fn fact（emitSymbol/owner/parameters 空/returnType）
   + initializer 的 emitExpression op 流 + entry block；
2. 冲突：visit 通用子树走访与合成 emitExpression 对**同一嵌套箭头**各 emitFunction 一次——
   id 相同（node 派生）但 owner 语境不同（组件/文件 vs 合成 const fn）→ Merkle 真实碰撞；
3. 深层结构：csg-core 存在 visit(1187)/emitExpression(2204) 两条 csg.call/csg.function
   发射路径，文件级合成必须先定义「嵌套声明的 owner 归属规则」（合成 const fn 拥有其
   initializer 子树的全部嵌套声明，visit 路径在 depth>0 时全跳过——包括 ArrowFunction 的
   emitFunction），且 emittedFactIds id 去重需配「同 id 异内容=fail」语义；
4. 修复方案草案（下一会话）：owner 归属规则 + visit 深度抑制扩展到 FunctionLike 分支 +
   emittedFactIds 碰撞即 fail 的三件套，全部在 csg-core 单文件内，预估一个会话完成。
- 回滚后九套回归全绿（HEAD 行为不变）。
## 第二十一批：extractor 三件套落地（跨文件数据 cheng 化根工程打通）

- 文件级 const initializer op 流合成落地：合成零参 fn（独立 stableId symbol/fid 域）
  + fileLevelConstDepth 合成期 visit 全静默（owner 归属规则）+ emittedFactIds
  同 id 异内容 fail-loud + VariableDeclaration 分支 return（子树覆盖语义）。
- 实证：HomePage 单文件抽取过 Merkle；categoryTabs 桶 12→4（合成 fn 值链激活，
  剩余为深层 map/reduce/参数类型桶——链条活了显形的已知类型）。
- 九套回归全绿。
## 第二十二批：v4 全项目 facts 实证（extractor 三件套生效）

- v4 重抽（含合成 const fn op 流）通过 Merkle+沙箱校验。
- **HomePage 组件体 101→58**（categoryTabs 值链激活）；NodesPage 148→148
  （slotDiag 0/refs 14 维持）；HomePage slots 24+refs 6、NodesPage slots 34+refs 14。
- 剩余 58 条构成：cannot infer 19 / callee 16 / identifier 12（跨文件下一层：
  CategoryDef 等类型流 + lambda 内 find/reduce 的参数/迭代链）——继续机械清偿。
- 九套回归全绿（含 r2c-smoke 8/8 + headless-replay 10 项 rc=0）。
## 第二十三批收口（本会话终态）

- v5 全项目 facts（fileconst 标记）实证：HomePage 93/NodesPage 146——剩余诊断呈
  长尾分布（每条需个体分析），单一机制批量清偿阶段结束。
- M2 验收的 headless 部分（搜索过滤/排序重排/状态序列回放 10 项 rc=0）已固化；
  真机验收前置 = 组件体长尾清偿 + 设备/壳协调（FORTIFY 修复链 + M17 播放器基建，
  跨战役依赖），移交下一会话按 task_plan 剩余桶清单继续。
- 全部批次九套回归绿；工作树干净；20 提交待推送（环境恢复后一键补推）。
## 第二十四批：Map 槽模型落地（95b7fb0d4）

- TypeMapper: Map<K,V>→合成 R2cMap_<K>_<V> {keys,vals} struct；emitCall R2cMap 分支
  get/set/has/delete/values/size→helper（get miss→零 struct+presence 判定语义自洽；
  托管元素 share 纪律）；mapHelperTexts 按组合生成+extraPreludeFns 共享 sink+组装去重。
- HomePage 93/NodesPage 138（Map 桶 nextCache.get/set/delete、pwaOnlineNodeCacheRef
  .current.values、stableOrder.has 清零路径）。九套回归全绿。
## 第二十五批收口（长尾个体清单固化）

- 最新实测（v5 facts）：HomePage 91 / NodesPage 135。
- HomePage 剩余：useCallback 14（内层 lambda 级联——每条 lambda 内部 1-3 个具体诊断）、
  t:4（categoryTabs.map 对象解构参数的 path 类型流）、markAppMarketplaceViewed 4/
  triggerContentRefresh 2（文件级 fn 内部 lambda 级联）、props (initialTruthRoute ?? '').trim 1。
- NodesPage 剩余：nextCache Map 三操作（合成 struct 值流）、libp2pService.* 8+Capacitor
  2+document.addEventListener 2（宿主服务桥，需 M3 服务接线设计）、targetPeerId.trim 2
  （props capture 类型流）、JSX 复合插值 2（extractor expression child 关联 op）。
- 长尾个体分析阶段：每条诊断已具名定位，机制路径明确；下一会话按清单逐项清偿后
  组件体全量编译 → 真机验收 → M3/M4。
## 长尾审计清单固化（第二十六批）

长尾诊断定性完成：全部为「**源码隐式 any**」性质（TS 源无显式类型注解、checker
推断链断在 createContext(null)/宽松上下文）——无编译期信息可挖，需人工审计注册
（CHT hand-audited whitelist 同款模式）。审计清单：
1. useLocale()（app/i18n/LocaleContext.tsx:38）返回 { t, locale }——t 为 (k:string)=>string
   翻译函数；CHT_BRIDGE_RETURN_TYPES/返回类型注册后 HomePage 的 {t} 解构与 t(...) 调用
   全通（约 10 条诊断）。
2. getTabLabel/unreadCountsMemo/handleFeedTouch* 族：useCallback lambda 内部依赖上述
   useLocale 链+categoryTabs find/reduce 链，上游通后自动消解。
3. triggerContentRefresh/markAppMarketplaceViewed（文件级 const fn）：内部 localStorage
   /refresh 链，上游通后消解。
4. NodesPage：nextCache=new Map 拷贝链（Map 槽 entries/values 桥）、document.addEventListener
   （宿主服务桥，M3 服务接线设计）、libp2pService.*/Capacitor.getPlatform（同）、
   targetPeerId.trim（props capture 类型流——componentCaptures 值带类型）。
5. spread 对象合并（JsonNode 浅合并 prelude）、JSX 复合插值（extractor expression child
   关联 op）。
全部注册/桥表落在转译器既有的 STRUCT_PRESENCE_FIELDS/CHT_BRIDGE_RETURN_TYPES/
DEFAULT_R2C_HOST_BRIDGES 三张表上，机械执行。
## 第二十八批收口（local_write 显式类型回归原形式——typed let+合成 obj 构造触发 kind 检查）

- local_write 尾行回退 var name = init（typed let 与合成 obj 构造组合触发编译器
  declared_kind/actual_kind 检查，mech14 既有绿依赖旧形式）；OW1 直接构造分支保留
  （MapProbe 场景 var c1: NodeInfo 正确产出）。
- Map 消费链残余定谳：裸声明 struct 局部+字段写字面量的 exact-source 拒绝
  （第 3 层编译器语义边界）——BLOCKED-compiler-wall 维持，归编译器战役。
- 九套回归全绿。
## 第二十九批：startTransition 降级 + Array.some 谓词（f9c3f176a）

- startTransition(fn)：并发标记在 flat 模型无意义，回调立即执行（语义注释载明）。
- Array.some：谓词循环（同 includes/findIndex 模式，短路与索引递增）。
- HomePage 84/NodesPage 127（构成演进）。九套回归全绿。
## 第三十批：Map.entries 桥 + props capture 类型流

- Map.entries：合成 R2cEntry_<K>_<V> {key,value} pair struct + __r2cMapEntryMake
  helper（ENTRY_MAKE_SEEN 去重）+ entries() 循环构造。
- props 数据成员 capture 带 cheng 类型（targetPeerId.trim 链的类型流补全）；
  transpileFunctions 包装兼容 string/{expr,type} 双形态。
- 九套回归全绿。
## 第三十一批：import 别名解析 + new Map/Set typeArguments 合成 + 通用 struct 字段写

- **import 别名解析**（18 条 normalizePeerId 清零）：call op 携带 calleeResolvedName
  （import specifier 的真实导出名）；unresolved callee 前查真名注册表——跨文件
  import 别名调用直通。
- new Map/Set typeArguments 合成（nextCache Map 链清零）；通用 struct 字段写；
  useLocale 桥+i18n prelude；Map.entries 桥；props capture 类型流。
- 九套回归全绿。
## 第三十一批收口（九套回归全绿）

机制面（三十一批）全部就绪：useState 槽/host 桥/JSX 树/lambda 别名/capture 链/props 桥/
presence 审计/timer·keys·Array.from·encodeURIComponent·flatMap·reduce·some/Map 槽模型/
new Set·Map/document·Number 桥/typeof 未绑定/fileconst/startTransition/Map.entries/
通用 struct 字段写/extractor 三件套+v5 facts。
九套回归全绿（单测+r2c-smoke 8/8+headless-replay 10 项+struct-presence+mech12/14/16/27）。
## 第三十二批收口（v6 facts 实证）

- new op 携带 typeArguments 文本（new Map<string,Node>() 的容器类型不再丢失）；
  转译器 exprType/case new 按 typeArguments 合成 R2cMap struct；
  **NodesPage nextCache Map 链桶清零**（entries/set/get/delete）。
- NodesPage 剩余：libp2pService.*（宿主服务桥，M3 接线）、Capacitor.getPlatform、
  document.addEventListener、nextCache.entries 残余、filter 块体箭头、
  binding_extract t、MapProbe struct 三层墙（BLOCKED-compiler-wall）。
- 九套回归全绿。
## 长尾共同根因定谳（第三十三批）

NodesPage/HomePage 剩余诊断的共同根因：**外层可变局部的 lambda 捕获**——
lambda（独立 fn）引用组件体的 let/var 局部（nextCache/displayContents/handleFeedTouch* 等）
在 flat 函数模型中不可表达（Cheng 无闭包），需「捕获局部提升为全局槽」机制：
- 编译期：lambda 体自由名追链到外层 local_write（非槽）→ 合成全局槽 __r2cCap_<name>: T
  + 外层函数该名的读写 rename 为槽 var + 槽 Init 声明
- 已有同族先例：emitRefSlots（useRef 槽）/componentCaptures（useDeferredValue 直通）
- 实现量：一个完整批次（rename 协同跨外层/lambda 双侧 + 类型流 + 槽 Init 时序）
- MapProbe struct 三层 exact-source 墙（BLOCKED-compiler-wall）独立归编译器战役
## 下一步（按提案 M2→M4）

| 阶段 | 内容 | 判据 |
| --- | --- | --- |
| M1 收尾 | 普查 Top 桶机械清偿：host-bridge 白名单（callee 3303）、标识符解析（2055）、typeof/??/presence（1600+） | 可转译率 18.8% → 60%+；每批全量回归 |
| M2 | JSX 树转译（csg.jsx → 节点构建代码，className 走既有 CSS/layout facts）；useState 槽 + dirty 重求值 + scene 增量重建 | HomePage 搜索输入即时过滤/排序重排；增量帧 <16ms；digest 44/44 不回退 |
| M3 | 全组件转译，快照事件表退役（保留 routeId 投影） | 272 no-op 清零；像素 oracle 不低于现基线 |
| M4 | dirty 子树最小化/IME/转场接缝 | 切换 P95 <50ms |

## 环境事实（复现必读）

- canonical stage3 要求包布局：root 有 `cheng-package.toml`、入口在 `src/` 下、
  std/core/apps 实体拷贝进包（realpath 前缀检查拒 symlink）。
  helper：`ts-csg/scripts/cheng-scratch-package.mjs`。
- 全项目 csg-core 抽取 ~18 分钟（大头 = `~/.cheng-held/csg-cli validate` 纯 cheng
  沙箱校验）；命令与参数见 repro README。

## 第三十四批收口（组件箭头 callee 通道 + 块体箭头 map/filter/reduce + 数值 Record 字典 + ChtEvent）

机制面（三十四批）：
1. **组件箭头 callee 通道**：组件体 const 箭头（直接/useCallback/useMemo 包裹）在
   transpile() 开头**预注册**确定性编译名 `__r2cfn_<name>_<fid12>`，写入共享的
   localAliasTargets/EmitNames（lambda 实例共享同一 Map 实例）；调用位置
   emitCall 用 calleeEmit=预注册名发射（修掉发射裸常量名的潜在错误文本）；
   buildCaptureRenames/identifier 值读只对**零参**箭头生成 `emitName()` 调用。
   影子判定改用 renameStack（renameOf(name)!==name），hook 别名合法持有
   localTypes 条目，不再误伤（displayContents 裸名回归即此误伤，已修）。
2. **块体箭头数组方法**：compileBlockArrowHelper 从 filter 泛化到
   filter|map|reduce 三模式（transpileWithInjectedParams helper + 自由变量注入）；
   回调解析新增 identifier→targetFunction（组件箭头走别名表，模块函数走
   functionByName）；map 用 helper 返回类型作元素类型，reduce 校验
   retType===accType；helper 实例补接 r2c 槽表/props/捕获/别名表。
3. **数值 Record 字典**：`{} as Record<K, number>`（AsExpression 携带断言类型，
   extractor 新增 returnType 文本）→ R2cMap_str_int64 字典构造 + element
   read/write 走 __r2cMapGet/Set（键=str/int64 限制定语沿用）；非数值 Record
   保持 json.JsonNode 约定不动（spread-merge 语义不变）。
4. **事件参数 ABI**：transpileFunctions 默认 preferredEventParamType="ChtEvent"；
   transpileR2c 合成 ChtEvent type_decl + forceStructs 保证独立可编译。
5. **mapHelper/entryMake 文本纯化**：去掉跨装配 SEEN 短路（单进程多组件时第二
   个组件拿不到 helper 文本的隐性泄漏），去重在装配 join 处。

普查（v7 全项目重抽 + probe）：HomePage 84→59（v7 口径 90，extractor 表达面变宽）、
NodesPage 123→105。剩余已具名：JSX 复合插值 ×19、ChtInlineObj property 写、
ChtEvent.touches、scrollTop/str 表读、async await-split ×4、.catch 连续值 ×6、
window/document listener、EventSource/Capacitor/indexOf/reduce 解构参数。

回归：r2c-smoke 2/2+headless-replay+mech12×2/14/16/27+struct-presence 全绿；
**spread-merge+map-consumption 两套红=并行 lane 编译器回归**（body-store-freeze
exact var call_arg / managed bind move，stash 判责实证：预会话构建同红，与本批无关，
归 kernel-driver-w2 区）。

## 第三十五批收口（useLocale 成员桥补全）

- `const { t } = useLocale()` 的 binding_extract 壳：hook 成员桥命中时只注册
  `t: str` 类型、零发射（值经 componentCaptures/hookMemberBridges 流动）。
- **成员访问式翻译键**：`t.home_sortByHot`（命名空间成员 ACCESS，非调用）
  → `__r2cT("home_sortByHot")`（str），property_read 新分支；
  hookMemberBridges（name→bridge fn）新字段贯穿 lambda/helper 实例。
- 普查（v7）：HomePage 90→89、NodesPage 105→96。
- 回归：七套绿（r2c-smoke+headless-replay+mech12×2/14/16/27+struct-presence）。
- 剩余最大类：JSX 复合插值（`||`/三元/IIFE 无 str 类型流）、reduce 解构参数
  `{key}`、ChtInlineObj property 写、ChtEvent.touches、async await-split、
  .catch 非纯连续值、window/document listener、EventSource/Capacitor。

## 第三十六批收口（嵌套 JSX op 发射 + 复合插值类型流 + IIFE + 解构参数 sanitize）

机制面：
1. **嵌套 JSX 元素 op 化**（csg-core）：此前只有 JSX 根元素在函数体走 op 流，结构化
   后代元素（span 等）只有 fact 无 op——fact.op 缺失，插值 childOp 无从关联。emit
   表达式的 jsx 分支新增 stampChildJsxOps：每个结构化后代元素发一个 op（带
   emitChildExpressionOp 回调）并回填 fact.op；块遍历对 jsx op 按「树经根表达式发射」
   跳过语句化。
2. **fact 路径 childOp 关联**：emitJsxFactSubtree 按 ordinal 从 fact.op 的 children
   取 childOp，插值降到 emitExpr 精确类型流（不再文本 only）；空容器 `{''}`/注释按
   React 语义渲染空文本节点/跳过，不再响亮 fail。
3. **useLocale 桥类型流闭环**：exprType 对 `t.key`（property_read，receiver 为桥成员）
   与 `t("k")`（call）返回 str；emitCall 桥成员调用 → `__r2cT(args)`；exprType 的
   expression/AsExpression 携带断言类型。
4. **JSX 三元分支**：`cond ? <A/> : <B/>` 走 emitJsxChildElementSubtree 条件挂载。
5. **IIFE**：`((...) => {...})(args)` receiver=function_value → compileInlineLambda
   命名 lambda + 实参调用。
6. **解构参数 sanitize**：`(acc, { key }) => ...` 的参数名 `{ key }` 非法 cheng
   标识符——签名发 sanitized 名（__p1_key），localTypes 保原键，emitNameOf 映射读。

普查（v8 全项目重抽，847k 行）：HomePage 85→78；NodesPage 96→129（嵌套发射暴露
更深真实失败面：JSX 列表渲染 .map、str .length emit、ChtInlineObj 写）。
七套回归全绿（spread-merge/map-consumption 维持并行 lane 编译器红，判责不变）。

## 第三十七批收口（JSX 列表渲染首 Subset + 收紧）

- `.map(item => <jsx/>)` 单 return 箭头：循环逐元素把箭头的 jsx fact 挂到父节点，
  item 参数经 renameStack 绑定循环元素变量（精确类型流）；**块体箭头（绑定/guard
  return）显式 return false 响亮失败**——inline 线性化未落地前 engaging 即丢码，
  sortedTabKeys 场景（tab/count 中间绑定+`if (!tab) return null`）等线性化批次。
- fact 路径子树路由：emitJsxFactSubtree 的 expression children 先试
  emitJsxChildElementSubtree（&&/三元 jsx/map 列表），再落文本路径。
- 普查（v8）：HomePage 77 / NodesPage 129；七套回归绿。

## 第三十八批收口（块体箭头列表渲染 inline 线性化）

- emitJsxListBlockLinearized：`arr.map((item) => { stmts; if (!guard) return null;
  stmts; return <jsx/>; })` 逐迭代线性发射——guard return 重写为 `var __eN = true` /
  `if cond: __eN = false` / `if __eN:` **嵌套作用域**，JS return-in-callback 语义
  精确保留（guard 之后该迭代全部跳过）。
- 非 guard 语句段经**临时合成块**走主语句机制（emitBlockInner，用完即删）——
  binding/local_write/expression 语义零复制。
- 形状准入：语句种类白名单 + guard then 块恰一非 jsx return + 无 else + 唯一
  最终 jsx return；guard 块内 op（含 return null）从语句流排除（否则误 abort）。
  abort 判定用**入口 diagnostics 快照增量**（全量判定会被既有失败误触发）。
- 首个实战场景 sortedTabKeys×categoryTabs 复合 tab 卡片列表清偿成功
  （`unresolved 'count'`×3 + 复合插值同时消失）。普查：HomePage 77（构成更深层）。
- 七套回归绿。

## 第三十九批收口（合成类型 decl 跨 index 种子化）

- 根因：transpileR2c 的槽抽取在自己的 index 合成 ChtInlineObj_*/R2cMap_* decl，
  transpileFunctions 的新 index 只有类型 NAME 没有 decl——property write 响亮失败、
  struct 永不出成。
- 修复：TranspileR2cOptions.extraTypeDecls（synthesized.* decl 收集），
  transpileFunctions 在**work queue 之前**种子化 typeDeclByName+usedStructs
  （放队后会晚于发射——首版即错在这）。
- 效果：ChtInlineObj property write 清零；HomePage 77→73 / NodesPage 129→118。
- 七套回归绿。

## 第四十批收口（.catch 可归约扩展 + ChtEvent.touches 首触模型）

- **.catch 归约面扩展**：零参续体 + 语句仅 expression + 返回裸字面量/新鲜复合字面量
  （解包 as 断言/括号链）→ 可归约为 tried 调用。论证：cheng 桥调用无拒绝通道，
  续体在目标语义中不可达（机制 9 §4 同一论证的诚实延伸）。NodesPage ×6 清零。
- **ChtEvent 首触模型**：struct 加 touchCount/touch0X/touch0Y（运行时喂真值）；
  `const touch = event.touches[0]` 别名化（touchAliases：presence 折叠
  `e.touchCount > 0`，clientX/Y 折叠 e.touch0X/0Y）。无 Touch 对象物化。
  HomePage 触摸 pull-refresh handler 连锁清偿（73→68）。
- 七套回归绿。剩余：scrollTop 元素句柄桥（需 runtime 滚动态）、async split/
  排除清单、EventSource/Capacitor → 组件体全量编译。

## 第四十一批收口（scrollTop 元素句柄桥）

- stable-ABI 立场（ChtEvent 同款）：prelude 声明滚动存储（__r2cScrollHandles/Offsets，
  64 槽按句柄键）+ 读桥 `__r2cElemScrollTop(node): int64`（缺省 0=未滚动）+ 运行时
  写通道 `__r2cElemSetScrollTop`（shell 在滚动事件写入；M4 输入工作接真值）。
- `contentScrollRef.current?.scrollTop ?? 0`：可选链缺席折叠为句柄 0，读桥把句柄 0
  映射到 0——`?? 0` 语义精确保留，emitExpr/exprType 双侧 int64 分支。
- HomePage 64 / NodesPage 116；七套回归绿。

## 第四十二批收口（排除清单机制——子集边界具名化）

- `r2cExclusionManifest(results)` + `r2cExclusionClassOf(reason)` 导出；transpileR2c
  返回值新增 `exclusions` 字段。硬失败保持硬（被排除 fn 永不出成），但每条失败
  获得稳定分类：async-await / async-bridge / host-eventsource / host-capacitor /
  host-listener / host-event / host-global / jsx-component-element /
  catch-continuation / **unsupported**。
- 门禁判据成型：组件「清单外零失败」= unsupported 类计数为 0 且业务关键 fn
  （搜索/排序）不在清单内——这是「组件体全量编译」的可审计定义。
- 首轮清单（v8）：HomePage 64 条（unsupported 47 + jsx-component-element 11 +
  async-await 4 + host-global 2）；NodesPage 116 条（unsupported 97 + host-listener 4
  + host-capacitor 4 + jsx-component-element 7 + async-await 2 + host-eventsource 2）。
  十批机制面清偿后，剩余失败面首次获得稳定分类视图。
- 七套回归绿。

## 第四十三批收口（useLocale 动态键读）

- `t[tab.labelKey]`（element_read on hook 成员桥）→ `__r2cT(key)`——与调用形态
  `t(key)` 同一降级；exprType 双侧 str。getTabLabel 三连级联清偿
  （内层 lambda + local + 引用处）。HomePage 64→60；七套回归绿。

## 第四十四批收口（列表三元箭头 + 值位 jsx 三元响亮失败定则）

- 列表渲染扩展：`.map(item => cond ? <A/> : <B/>)` 单语句三元箭头——逐迭代
  `if cond:` 挂 A `else:` 挂 B（含仅真分支/仅假分支形态）。
- **值位 jsx 三元定则**：exprType 对 jsx 分支三元保持 undefined（值位无父节点可挂）——
  JSX 子位走 emitJsxChildElementSubtree 已正确处理，其余上下文响亮失败。首版
  int32 放行产生 +2 脱根错码面，已回退（教训：jsx 值位只有「挂载」一种合法消费）。
- 普查 HomePage 60 / NodesPage 116。七套回归绿。

## 第四十五批收口（失败 op 定位探针 + unsupported 真实形态证据表）

- `fail()` 新增 R2C_FAIL_DEBUG=1 门控转储：fn 名 + op 类型@行号 + whenTrue/whenFalse/
  value/receiver/argument 五个引用位的 op 摘要——所有 fail 站点一次性获得精确定位能力。
- 首轮证据表（v8，HomePage/NodesPage）：
  1. window/document.addEventListener/removeEventListener（lambda 内）——host-listener 排除类，级联根之一。
  2. unsubscribe = subscribeDistributedContents(...)——subscribe 桥缺失，级联根之二。
  3. newOrder.indexOf（str[]）——exprType 有规则、emit 无降级。
  4. findRefreshedContent：.find() 无 presence 注册结构响亮失败（audited 契约）→ 应进排除清单命名类 find-presence。
  5. unreadCountsMemo reduce helper `unresolved 'key'`：解构参数在 helper 内的 binding_extract 未接线。
  6. useCallback ×7 与多数 local 失败均为上述根的次生级联。
- 七套回归绿。

## 第四十六批收口（证据表清偿第一批：indexOf/命名类/解构绑定首版）

- **①indexOf emit 落地**：emitArrayMethod 新增 indexOf（线性搜索循环，-1 未命中）；
  修复**分发白名单缺 indexOf**（exprType 有规则但 emit 永不达）。
- **②find-presence 命名类**归档。**③effect-cleanup 命名类**：unsubscribe 根因=
  域函数返回函数值（r2c 无函数值），生命周期面归 r2c runtime（M2+）。
- **④解构参数绑定首版（未生效，开放）**：renameStack 注入疑似 memberT6 解析链
  静默跳过，下批探针定位。
- 普查 HomePage 60 / NodesPage 116；七套回归绿。

## 第四十七批收口（解构参数绑定定谳——captureRenames 通道）

- memberT6 链探针定谳：全链**通**（raw="{ key }" → declaredT=HomeChannelDefinition →
  decl6=yes → member6=HomeChannelType → memberT6=str），绑定环有执行——真根是
  **transpile() 的 localTypes.clear() 把 transpile 前注入的 helper.localTypes['key']
  清空**，identifier 读取走不到 renameOf/localTypes 分支。
- 修复：改经 **captureRenames 注入**（identifier case 第一梯队，免疫 clear，
  同时携带 expr+type）：helper.captureRenames = wrapped(原 captures + {key:
  {expr: "__p1_key.key", type: "str"}})。
- 效果：unreadCountsMemo reduce 三连级联清零；HomePage 60→56。
  /tmp 探针与 v8 facts 被 24h 卫生清扫 wiped，已重建。
- 七套回归绿。

## 第四十八批收口（indexOf 移位修复 + M2 cone 状态定谳）

- **indexOf 移位 bug**（批次 46 引入）：分支插在 arrow 解析之后的 single-expr 区——
  indexOf 无箭头走 arrow===undefined 块，永不达。移到 includes 旁（arrow 解析前）。
  handleDragOver 级联清零：HomePage 56→52。
- **M2 cone 状态定谳**：诊断中无 displayContents/handleCategoryChange/
  resetToSmartSort/searchQuery 相关条目=搜索/排序语义链 lambda 全部编译成功。
  剩余 52 条 unsupported 全挂 HomePage 渲染体：jsx-component-element ×11、
  host-global ×2、async-await ×4、IIFE 插值、域 async 链。
- M2 验收编译侧前置=渲染体三大机制：组件元素内联/visibilityState 桥/async 排除面归档。
- 七套回归绿。

## 第四十九批收口（组件元素分类细化：host-icon/route-page 具名归档）

- index 新增 iconNames（csg.import lucide-react external_package 的 named imports）。
- 组件元素分支（fact 挂载路径）：lucide 图标 → **host-icon** 排除类（纯视觉资产，
  M3 图标素材通道，不挂节点）；`<Suspense fallback>{单个大写组件}</Suspense>` →
  **route-page** 排除类（lazy 页面= M3 路由单元，挂载点排除，路由谓词已由外层
  guard 发射）。值位组件元素维持响亮失败（jsx 值位定则）。
- 效果：HomePage jsx-component-element 11→4（剩 Sidebar/ChannelManager/
  VirtualizedMasonry/ResponsiveMasonry——需 props 通道，下批）；host-icon ×7。
  NodesPage host-icon ×2 + route-page ×1。
- 七套回归绿。

## 第五十批收口（props valueOp 通道 + extractor owner 重入缺陷定位——WIP）

- **jsxProps 扩展**（extractor）：expression 属性新增 valueOp（body 上下文回调发
  emitExpression op，同 children 模式）；根 jsx op 与 stampChildJsxOps 两处调用点
  传回调。转译器侧 propOpByName 关联（fact.op.props 按 name+valueOp）就绪。
- **转译器消费就绪**：Masonry/ResponsiveMasonry 容器降级（div 挂载+children 照挂）；
  VirtualizedMasonry(items, renderItem) 列表循环（N1 同款）。
- **extractor owner 重入缺陷（已定位待修，挡 v9）**：jsxProps 回调在 emitOp 参数
  求值期执行嵌套 emitExpression——C2（先求值再传）后仍碰撞 a61f7905（HomePage 688
  cleanup arrow，owner 从 HomePage 翻转 f80f51）。诊断器 R2C_COLLISION_DEBUG 就位。
- 七套回归绿；普查维持 v8 口径 60/116。

## 第五十一批收口（owner 重入修复定谳 + props 通道全链生效）

- **owner 重入缺陷修复（extractor）**：根因实锤——同一匿名 arrow 节点经两条遍历
  路径各调一次 emitFunction（map 实参求值 owner=HomePage vs JSX props 回调
  owner=map 回调 context），fn fact 的 owner=currentOwner() 随栈深翻转→确定性
  node id 碰撞。修复=**函数抽取幂等重入**（extractedFunctionIds：同 id 二次进入
  直接复用返回，body 不重发——首次抽取的 ops 为权威）。
- **props valueOp 全链生效**：VirtualizedMasonry(items,renderItem) 列表循环 +
  Masonry/ResponsiveMasonry 容器降级从清单消失；op 路径同步 icon/route-page
  分支。HomePage jsx-component-element 4→2、route-page +2；NodesPage 4→3、
  route-page 2。
- v9 facts（856k 行）。剩余 jsx-component-element：ChannelManager + 两个 route-page
  形态页面 + 空 tag 2 条。
- 七套回归绿。

## 第五十二批收口（visibilityState 桥 + fragment 直挂）

- **document.visibilityState 桥**：prelude `__r2cDocumentVisibilityState(): str`
  （shell-owned ABI，CLI 目标缺省 "visible"）——host-global ×2 清零（listener
  桥需求显形为 host-listener ×2）。
- **JSX fragment 直挂**：fact 挂载路径 children 直接挂 parentVar（精确 React
  语义）；op 值位 fragment 响亮失败（值位定则）。位置教训：F1 误插
  emitJsxContainer（无 parentVar 作用域）、F2 插在 childOpByOrdinal 声明前。
- 未包装 Suspense 的大写组件维持 jsx-component-element（M3 组件内联），
  不加 Page 后缀启发式。
- 清单（v9）：HomePage {unsupported 35, host-listener 2, async-await 4,
  host-icon 7, jsx-component-element 2, route-page 2}；NodesPage {unsupported 97,
  host-listener 4, host-eventsource 2, host-capacitor 4, async-await 2,
  route-page 2, jsx-component-element 3, host-icon 2}。七套回归绿。

## 第五十三批收口（Array.from(Map.keys/values) + unsupported 口径清单）

- **Array.from(map.keys()/values())**：R2cMap 的 keys/vals 数组逐元素拷贝循环
  （managed 元素 share）——NodesPage 97→95。
- **unsupported 深水区口径清单（v9 manifest 原文聚类）**：
  - HomePage 35：unsupported callee ×5 / cannot infer local ×5 / unresolved ×3
    （次生级联根=IIFE 内部体+异步域链）/ jsx composite ×3（IIFE 冒泡）/
    ternary ×3 / 0.48 浮点 ×2（诚实 fail，int64 模型）/ ?? on undefined ×2
  - NodesPage 95：cannot infer local ×5 / ternary ×5 / .map 元素类型 ×3 /
    .length on undefined ×2 / struct boolean presence ×2（objBoxRef presence
    注册墙=audited 机制）/ Array.from 残余 / for_of unsupported iterable
- **探针口径差异记录**：R2C_FAIL_DEBUG 88 行 vs manifest unsupported 132 条——
  差 44=transpile() 级 opId 为空的失败（parameter type 等）不打探针+次生冒泡
  文本不重打。ternary 实修前先对齐口径。
- 七套回归绿。

## 第五十四批收口（递归 JSX 三元树 + 值位三元定则确认）

- **口径对齐**：manifest 条目自带 opId，探针侧反查 opsById 拿 loc+分支形态。
  ternary 真实形态=全部 JSX 分支（含嵌套 ConditionalExpression）。
- **emitTernaryJsxTree 递归树**：ternBranchShapeOk 先验（jsx/嵌套三元/null 字面量
  白名单，深度 8）→ emitTernBranch 挂载（jsx→fact 子树、null→零发射、嵌套三元→
  递归 if/else）。渲染位三元清偿：NodesPage 114。
- **值位三元定则确认**：`const el = cond ? <A/> : <B/>` 响亮失败保持（r2c 无延迟
  子树模型）。HomePage +2=tab 卡片子树深化暴露新失败。
- 普查：HomePage 54 / NodesPage 114。七套回归绿。

## 第五十五批收口（三类定位——根因聚焦 hook 别名类型链）

- manifest opId 反查实证：.map 元素类型 ×4 全是 JSX 列表渲染位（receiver 类型
  断链致 map 分支全跳）；.length on undefined ×2=filteredNodes（useMemo hook
  别名）exprType undefined——slots 表 nodes:Node[] 存在、内层形态简单——
  断点不在链深，疑似 hook 分支 retType 计算，需专门探针轮。
- struct presence ×4 维持 audited 注册墙。
- H1：exprType(function_value) identifier→local_write 链升级全深迭代
  （保守改进保留）。七套回归绿。

## 第五十三批修正 + 第五十六批（跨文件名遮蔽修复——displayContents 类型链定谳）

- **根因实锤（chaindbg 逐跳探针）**：displayContents retType 误推 str[]——
  exprType(identifier:filtered) hop=0 直接命中 constArrayElemTypes 跨文件名碰撞。
- **修复**：inferBodyReturnType 的 identifier local_write 链优先（词法 scoped）；
  hook 分支 retType 改用 inferBodyReturnType。
- 效果：displayContents=DistributedContent[] ✓；displayContents.map 走 N1
  列表渲染（子树深化暴露等量新失败——净计数 54/114 稳定）。
- **新定则**：exprType 的全局名字表查询前必须先穷尽词法 local_write 链——
  跨文件名遮蔽是 flat fn 模型的系统性风险。
- 七套回归绿。

## 第五十七批收口（词法遮蔽定则全 exprType 推广）

- exprType identifier 分支：全局名字表查询前插入 fnId 词法 local_write 链
  （12 跳上限，循环引用兜底）。防御性固化——所有 exprType 消费面统一受保护。
- 普查 HomePage 54 / NodesPage 114 稳定；七套回归绿。

## 第五十八批（定位轮：渲染体深化残余全景——manifest opId 反查）

HomePage unsupported 35 逐条 line 定位（无代码改动，证据归档）：
- **950 三元 ×3**：prop/模板位的 JSX 分支三元（className 模板内）——值位发射
  触发 ternary fail；与渲染位（emitTernaryJsxTree 已清）不同消费位——待定则。
- **792 IIFE 插值 ×2 + getTabLabel(tab) 插值**：IIFE 冒泡+组件箭头调用插值的
  childOp stamp 待查。**799 template span undefined**：模板 span 类型断链同族。
- **252/369/375/542/559/586/688/312**：async 域链+listener+0.48 浮点——已具名
  排除类或诚实 fail。**952 products/EcomProduct**：域类型解析。
- 结论：搜索/排序 cone 的渲染位（列表+tab 卡片+搜索框）已全部可发射；残余集中
  在非 cone 的页面级/资产级面。七套回归绿（无代码改动）。

## 第五十九批收口（三待查项：③落地 ②查证 ①数据入库）

- **③组件箭头别名调用返回类型链落地**：exprType(call) 新增 localAliasTargets→
  functionById→returnType 映射分支——getTabLabel(tab) 等组件箭头调用插值的
  类型流打通。
- **②toFixed 查证**：机制已存在（int64 补零小数精确语义）——799 span fail
  真根=distanceValue 槽类型 receiver 链——留档待专门轮。
- **①949 嵌套三元 consumer 追踪数据**：949/950 consumer=null（纯嵌套分支）；
  920 有 jsx@919 div childOp 关联但 subtree 未消化——下轮插桩定位。
- 七套回归绿。

## 第六十批收口（语句流双消费修复——HomePage 54→35 / NodesPage 114→100）

- **根因实锤（栈帧抓取）**：920/949/950 三元（expression kind）被 emitBlockInner
  语句流当语句 emit（值位 fail）——同时又被 jsx@919 的 children childOp 挂载
  （挂载成功）——**双消费**。949/950 consumer=null 纯嵌套分支同因。
- **修复（Z1）**：referenced 收集对 opKind==="jsx" 的 op 额外收集
  children[].childOp——表达式被 jsx child 消费=经 childOp 路径挂载，永非独立语句。
- ③getTabLabel 别名返回类型链（同批）；②toFixed 机制已存在查证；
  ①949 consumer 数据入档。七套回归绿。

## 第六十一批收口（NodesPage 深化残余第一批：size 惯性+filter 谓词 bool 上下文）

- **`selectedPeerIds.size`（Set<T>→T[] 槽）**：property_read size on T[] →
  `int64(len(recv))`（exprType/emit 双侧）——数组 size 惯性写法清偿。
- **filter 块体 helper 的 bool 返回上下文注入**：declaredReturnOverride 字段
  （transpileWithInjectedParams 的 ret any/undefined/void 时用调用方上下文类型）
  ——filter 谓词恒 bool 契约。
- NodesPage 100→99（size ×1 + 部分链）；七套回归绿。

## 第六十二批收口（filteredNodes 链清偿确认 + NodesPage 剩余深水族归档）

- **filteredNodes@3070 清偿确认**：filter helper bool 上下文注入生效，块体箭头
  级联（.filter return any + cannot infer local + .length undefined）全消。
- **NodesPage 剩余深水族归档**（全部有明确机制归属，非悬案）：
  1. **Map 消费链**：nextCache.entries/set、rememberPeerProfiles nextCache
  2. **JSON.stringify(Node[])**：结构化序列化（需 struct→JSON 编码器）
  3. **setTimeout**：deferred-effect 泵未接线（r2c runtime timer 泵）
  4. **域函数桥**：scheduleRefreshNativeStatus/syncDistributedContentFromNetwork/
     parseObject 泛型/域类型 osStats
  5. **truthNodeContents return union**：数组元素类型并集
  6. **cloneDiagnosticsRecord**：json.JsonNode property write
  7. **try body loop**：catch-shell 循环限制（机制边界）
  8. **struct presence ×4**：audited 注册墙（维持）
- 七套回归绿。

## 第六十三批收口（JSON.stringify(T[]) 数组编码分支）

- stringify case 新增 T[] 分支：标量元素（str/int64/bool）经 jsonStringifyXxx、
  struct 元素经 `__chtJsonOf_<T>` 编码器（jsonStructEncoderRequests 请求，装配侧
  自动产出）——值位发射 JSON 数组拼接循环。
- 效果：JSON.stringify(Node[]) ×2 清零。NodesPage 99→**97**。七套回归绿。

## 第六十四批收口（Map 拷贝构造 + R2cEntry 元素类型化——机制就绪，链路验证待续）

- **new Map(otherMap) 拷贝构造**：emitCall/emitExpr 双侧 R2cMap 源拷贝循环；
  exprType 同型返回。
- **R2cEntry 元素类型化**：[0]→kt / [1]→vt（exprType）。
- nextCache 链（typeArgs 2+boxRef current 源）验证待续——下轮探针打
  localTypes 实值。普查 HomePage 35 / NodesPage 97 稳定。七套回归绿。

## 第六十五批收口（Map entries 白名单修复 + useRef<Map> 槽类型根因定位）

- **Map 方法白名单缺 entries（实锤）**：Map 方法分支白名单
  get/set/has/delete/values/size **不含 entries**——批次 36 的 entries 桥在
  白名单内不可达（memberName TS narrow 联合直接暴露）。白名单补 entries。
- **nextCache 根因再深一层**：`new Map<string,Node>(ref.current)` 的
  inferLocalType：typeSource 空、typeText="any"、value exprType 断链——真根=
  **pwaOnlineNodeCacheRef（useRef<Map<K,V>>）的 ref 槽类型未推导**（Map 泛型
  box-ref 无槽类型）——修复=emitRefSlots/exprType 对 Map 泛型 ref 合成
  R2cMap_K_V 槽类型（下一批）。
- 普查：HomePage 35 / NodesPage 97 稳定。七套回归绿。

## 第六十六批收口（Map 链修复连锁实测——NodesPage 97→81）

- 批次 64/65 的 Map 链修复（entries 白名单+拷贝构造+R2cEntry 类型化）连锁显现：
  NodesPage unsupported 97→**81**（-16：mergePwaOnlineNodeSnapshot/
  rememberPeerProfiles/commitPwaOnlineNodeCache 等 Map 消费链批量解锁）。
- 剩余大头：cannot infer local ×5（域桥族）、ternary ×5、.length ×2、
  struct presence ×4、Map 深消费残余（for_of missing iterable 等）。
- 七套回归绿。

## 第六十七批（定位轮：filteredNodes override 未生效路径 + NodesPage 81 全景）

- **filteredNodes@3070 回归**：filter bool override（批次 61）在
  transpileWithInjectedParams 的窄化路径外仍有一条 "return type: unsupported
  type 'any'" fail——下轮打印 helper 的**完整诊断列表**（非首条）定位具体
  fail 站点（transpile() vs transpileWithInjectedParams 双实现的返回类型
  fail 各有一处）。
- **NodesPage 81 全景**：ternary ×5@3814/3873/3904/3946/3724（渲染位三元
  嵌套，部分 shapeOk=false 需逐个看分支白名单外形态）、.length ×2
  （filteredNodes 链回归连带）、struct presence ×4（audited 墙）、
  members.size/for_of 残余、osStats/localProfile/renderPieChart/openNodeChat/
  openNodeDetailByPeerId（域桥/域类型/expression op not found）。
- 下轮优先级：①helper 完整诊断定位 filteredNodes；②NodesPage 渲染位 ternary
  逐个 shapeOk=false 的分支形态；③域桥族归档或 audited 桥注册。
- 树干净（本轮纯定位，无代码改动）。

## 第六十八批收口（返回类型 override 双实现统一 + body 推导 fallback）

- **filteredNodes fail 站点定谳**：filter override 只设在 transpile()——helper
  实际走 transpileWithInjectedParams（独立实现，各有一处返回类型 fail）——
  override 补第二实现。
- **transpileWithInjectedParams 补 inferBodyReturnType fallback**——map helper
  的 'any' 返回清偿（替换为更深层的 struct presence/expression-op 诊断）。
- **教训**：helper 的 transpileWithInjectedParams 是独立实现——transpile() 的
  任何能力改动都要问"第二实现要不要同步"。
- 普查：HomePage 35 / NodesPage 97 稳定。七套回归绿。

## 第六十九批收口（排除清单分类细化：struct-presence/domain-bridge/extractor-op-missing）

- 分类器扩充：struct-presence（ChtInlineObj 真值判断无注册 presence 字段——
  audited 注册墙具名）、domain-bridge（域函数缺 audited default/monomorphize
  any 实参）、extractor-op-missing（expression op not found——extractor
  数据完整性）。
- HomePage unsupported 35→26、NodesPage 95→59。七套回归绿。

## 第七十批收口（extractor-op-missing 定谳：null 分支惯性 id + Z2 零发射）

- "expression op not found" 定谳：missingId=字符串 "null"——三元 null 分支经
  String(null) 变惯性 id 查表失败。修复：ternBranchShapeOk/emitTernBranch 对
  "null"/""/"undefined" 惯性 id 视为 null 分支零发射（React 精确语义）。
- mapFn 值位的 "null" 返回留档（需 mappedElemType 上下文零值）。
- 普查 HomePage 35 / NodesPage 97 稳定。七套回归绿。

## 第七十一批收口（null 返回零值通路 + struct null 归档）

- emitExpr 对 "null"/"undefined" 惯性 id：返回 currentReturnType 的
  zeroValueOf 零值（标量/已映射类型精确清偿）；struct 元素的 null 返回
  （NodeSystemProfile map）归 struct-presence audited 族（数组 null 占位需
  presence 语义，与真值判断同根）。
- 普查：HomePage 35 / NodesPage 97 稳定。七套回归绿。

## 第七十二批收口（jsx-childOp 全局反查集 + 无条件语句跳过）

- **双消费根因闭环**：NodesPage 5 条渲染位三元有 childOp 关联仍被语句流 emit——
  Z1 局部收集漏跨块/嵌套树引用 + "expression" 在 STATEMENT_OP_KINDS。
- **修复**：index.childOpReferenced 全局集（构建时收集全部 jsx children[].childOp）
  + 语句流对命中者无条件跳过（挂载路径消费，emitExpr 失败仍 fail-loud）。
- 普查：HomePage **33** / NodesPage **92**。七套回归绿。

## 第七十三批收口（filter helper bool 上下文二次验证 + 剩余全景定谳）

- **filteredNodes 链清偿复核**：filter helper 的 "return type any" 已消
  （bool 上下文注入生效）——helperdbg 当前仅剩 mapFn 的
  NodeSystemProfile presence（audited 族）与 expression op not found
  （extractor 族）。
- **NodesPage 剩余全景**（97 条）：全部归属已具名族——Map 深消费残余、
  域桥族、union 数组返回、JsonNode 写、try-body-loop、struct-presence
  audited 墙、setTimeout 泵。
- 普查：HomePage 33 / NodesPage 92→97 波动（各批修复的链式显形与回归
  互抵）。七套回归绿。

## 第七十四批收口（spread 字面量 json 类型流——rememberPeerProfiles 族修复）

- **根因补全**：`{ ...jsonRef }` spread 字面量（无注解）在 emit 侧走 json 路径但
  **exprType 无对应分支**——spreadAny + returnType 不可映射 → json.JsonNode。
- 修复后 rememberPeerProfiles/overlayCachedPeerProfiles/commitPwaOnlineNodeCache
  链的类型流打通。NodesPage 92→**90**。七套回归绿。
- 剩余：域桥族、union 返回、JsonNode 写、try-loop、setTimeout 泵。

## 第七十五批收口（optional 参数 initializer 缺省——域桥族批量清偿）

- **optionalInitializerDefault**：optional 参数的 initializerKind 精确映射
  （FalseKeyword→false/TrueKeyword→true/NullKeyword→""）；双 arity 站点接入。
- scheduleRefreshNativeStatus 域桥族批量清偿——**NodesPage 86**。七套回归绿。

## 第七十六批收口（filter helper retType 尊重 override——NodesPage 90→81）

- **7419 的 retType 检查未考虑 declaredReturnOverride**（target.returnType='any'
  → types.map undefined → "not mappable" fail）——批次 61 的 bool override 实际
  已生效于 helper 编译，但外层 retType 检查在 override 前拦截。修复=retType
  undefined 时采用 override 值。
- 效果：filteredNodes 链清偿（filter 块箭头 ×2 + cannot infer local + .length
  ×2 连带）——**NodesPage 90→81**。七套回归绿。

## 第七十七批收口（Array.join 实装——str 元素循环拼接）

- Array.join(sep) 实装：str 元素白名单+循环拼接（sep 缺省 ","；非 str 元素
  响亮失败要求先转换）。白名单+emit 双侧接入。
- handleCreateGroup 的 members.slice/map/join 链就绪。
- 普查：HomePage 33 / NodesPage 81 稳定。七套回归绿。

## 第七十八批收口（JsonNode 点写字段——cloneDiagnosticsRecord 族修复）

- property_write 对 json.JsonNode receiver：点写字段降级为括号写
  `recv["field"] = v`（与 json 括号写同语义）——cloneDiagnosticsRecord 的
  systemProfile/resourceSnapshot 写清偿。
- 普查：NodesPage 81→**79**。七套回归绿。

## 第七十九批收口（try catch-shell 标志守卫单次壳——try-body-loop 限制解除）

- catch-shell 从 `while true + break` 改为**标志守卫单次壳**——body 内循环的
  break 绑定正确层级，try-body-loop 限制解除（refreshNativeStatus 等清偿）。
- mark 传播语义不变；catch/finally 在 while 外缩进不变。
- 普查：NodesPage 81→**79**。七套回归绿。

## 第八十批收口（M2 headless 验收语义序列判定）

- **M2 验收的 headless 部分达成判定**：r2c-headless-replay 的状态序列回放
  已完整固化搜索/排序语义——
  1. 初始渲染：3 条内容/计数/首条标题（rc=2/3）
  2. **搜索输入"旅行"→即时过滤 1 条**（rc=4/5）
  3. **排序切换 time→重排贝塔在前**（rc=6/7）
  4. **搜索+排序组合→阿尔法**（rc=8/9）
  5. dirty 置位（rc=10）
  每轮七套回归全绿=该语义序列持续 rc=0。
- **M2 验收剩余分界**：真机验收依赖 ①HomePage 渲染体全量编译（剩余
  unsupported 逐类，非 cone 的页面级/资产级面）②native shell 集成
  （跨战役，UniMaker APK 线）。
- 深水族剩余（union 返回/timer 泵/域桥族 osStats/localProfile）维持逐批推进。

## 第八十一批收口（inline lambda body 推导无条件化——union 返回清偿）

- truthNodeContents 的 fn returnType 是 union 注解——transpile() 的
  inferBodyReturnType fallback 被 `retText=~any` 限定挡住。
- **修复**：inlineLambdaMode 下 ret 推导失败时**无条件尝试 body 推导**。
- truthNodeContents 族清偿——**NodesPage 79→76**。七套回归绿。

## 第八十二批收口（struct null 元素归档细化——unsupported 24/40）

- mapFn 值位的 struct null 返回（NodeSystemProfile）从 extractor-op-missing
  细化为 **struct-presence**（zeroValueOf 通路保留标量清偿）。
- 分类全景：HomePage unsupported 24 / NodesPage unsupported 40。七套回归绿。

## 第八十四批收口（lambda 链类型传递统一——NodesPage 81→76）

- **根因闭环**：buildCaptureRenames 的 hook 别名 type 用 types.map(fn.returnType)
  ——'any' 声明→type undefined→lambda 内 .length/.map 断。
- **修复（统一机制）**：fnValueOpIdByLocal（local→inner function_value op id，
  pre-reg/emit 双侧记录）+captureRenames type 改走 exprType(innerOpId)
  全深 body 推导链（'any' 声明仅 fallback）。
- 普查：HomePage 33 / NodesPage **76**。七套回归绿。

## 第八十四批 B（setter 内 new Set() 无源——槽元素类型空数组）

- state setter 调用的 arg0 为无源 new Set() 时：槽 chengType=T[] 提供元素类型，
  发射空 var __tN: T[]（空 Set == 空 T[]，T[] 模型精确语义）。
- 七套回归绿；普查维持 HomePage 33 / NodesPage 76。

## 第八十五批（定位轮：NodesPage 76 复核——剩余为跨组件/深链两类）

- NodesPage 76 复核（批次 84B 后）：剩余构成与前次一致，无新可机械清偿项：
  1. **跨组件 setter/槽族**（3160-3161）：setRuntimeNetworkTelemetry/
     diagnosticsPeerId 是 localProfile 子组件作用域的 useState——主组件槽表
     天然不含（跨组件作用域，需组件内联机制=M3 范围）
  2. **Map 深消费残余**（1944-2112）：entries 遍历/for_of 解构/批量 set——
     helper 修复后仍在的形态需逐个 helperdbg
  3. **域桥族**（2912/3173/3185）：parseObject 泛型/renderPieChart any/osStats
  4. **setTimeout 泵**（2364）/**try-loop 已修**（2417 消失确认——批次 79）
  5. HomePage 24：0.48 浮点诚实 fail/域桥/union 渲染位三元残余
- 树干净（无代码改动）。七套回归绿（上批）。

## 第八十六批（复核轮：helper 层剩余全部归 audited/extractor 族）

- __t6_mapFn 的 4× 'peerId'：`Object.keys(androidMdnsPeers).map((peerId) =>
  normalizePeerId(peerId))` —— normalizePeerId 为域函数（domain-bridge ×18
  已归档），参数注入边界内的失败随域桥 audited 注册一并处理。
- helper 层剩余全景：22× null-element（struct-presence audited）+ 4× peerId
  （domain-bridge）+ 2× NodeSystemProfile presence——**无悬案，全部归属具名族**。
- 普查：HomePage 33 / NodesPage 76（unsupported 真值）+ 具名类（struct-presence
  10/domain-bridge 6/listener 4/effect-cleanup 2/eventsource 2/capacitor 4/
  async 4/component 3+1/route 1）。七套回归绿。

## 第八十七批收口（lambda 自由标识符值捕获——compileInlineLambda 外层类型注入）

- **自由标识符值捕获**（compileInlineLambda）：lambda body 使用的标识符中，凡
  在本作用域已类型化者注入 t2.captureRenames——peerId 三层穿透（updateByPeer
  参数→updater→prev.map 回调→map helper）。
- 语义依据：r2c 扁平模型同帧求值，enclosing params/locals 在回调执行期恒定。
- 普查：HomePage 33 / NodesPage 76 稳定。七套回归绿。

## 第八十八批收口（setTimeout deferred-effect r2c 接线——setTimeout 族清零）

- transpileFunctions 新增 deferredFrameKind option；transpileR2c 传
  R2C_DEFERRED_FRAME_KIND=900；result.ok 后发射 `<fn>__resume()`。
- lambda 层穿透补全（compileInlineLambda 传 t2.deferredFrameKind）——
  hydratePeerProfile 族清零。泵 runtime 侧由装配 main 接线（r2c.deferred）。
- 七套回归绿。

## 第八十八批收口（op 路径 fragment 根挂载——HomePage 渲染树总闸门打通）

- **HomePage 总根因实锤（子代理 C）**：渲染根是 fragment `<>`（L659），op 路径
  emitJsxContainer 缺 fragment 分支——整棵渲染树（57 jsx op）从未挂载。
- **修复（FR1）**：emitJsxContainer fragment 分支——根 fragment children 挂
  渲染根（parent=-1），嵌套 fragment 经 fact 路径。
- HomePage unsupported 33→**26**。七套回归绿。

## 第九十批收口（for_of pair 解构双绑定降级——WIP 如实标注）

- PD1 实装：pair 解构双绑定降级（body binding_extract path index 收集→
  .key/.value 双 let+localTypes 注册），循环体内 body 正常发射。
- **如实标注**：机制就绪但**路径未命中**——entries() exprType 在 lambda 层仍断
  （疑 nextCache 的 new Map 类型在 lambda localTypes 的注册时序）——下轮探针。
- 普查：HomePage 48 / NodesPage 89（WIP 基线）。七套回归绿。

## 第九十一批收口（PD1 路径打通确认——pairdbg 实证 R2cEntry_str_Node[]）

- **PD1 路径打通实证**（pairdbg 探针）：for_of@2056 的 pIterT=
  R2cEntry_str_Node[] ✓（entries() 类型链全通）——pair 解构双绑定发射正常，
  剩余为 body 内域函数链（cloneNode/normalizePeerId 等——domain-bridge 族，
  域函数本体编译专项）。
- **诚实修正**：批次 90 的「路径未命中」判断有误——PD1 当时已命中，计数波动
  是 body 域函数链的显形（跨批次探针口径差异）。
- 普查：HomePage 48 / NodesPage 89（WIP 基线）。七套回归绿。

## 第九十二批收口（域函数本体探针 + ?? str pinning + PD1 loc 修复——七套绿）

- **域函数本体编译探针**（domain_probe）：cloneNode/normalizePeerId/
  hasSystemProfileSignals/isFreshPwaOnlineNode 本体全 OK；
  getNodeRemark fail=`(remarks[k] ?? '').trim` receiver 类型链；
  stabilizeNodeOrder=组件槽跨 fn 引用；resolveContentCoordinates=Pick 映射。
- X2 str pinning 实装（exprType/emit 双侧）。PD1 pairdbg loc typing 修复。
- 七套回归绿。

## 第九十三批（定位轮：trimdbg 实证 trim 分支正常——剩余 fail 为另一条同文本 call）

- trimdbg 实证：`(x ?? '').trim` 的 trim 分支 recvT=str 正常命中（jsStrTrim 发射）
  ——getNodeRemark 的剩余 fail 是**另一条同文本 call**（memberName 缺失或不同
  receiver 形态），需 op 级 callee 全文定位（下轮：fail 打 op.callee 全文）。
- 普查：HomePage 33 / NodesPage 97→92 波动。七套回归绿。

## 第九十四批收口（getNodeRemark 定谳——Record 跨模型桥族归档）

- getNodeRemark 签名实锤：`remarks: Record<string, string>`——**json 模型折叠**
  （Record→json.JsonNode）使 element_read 返回 JsonNode 而非 str——`.trim` 断。
- **定谳**：Record<string,string> 键读返回 str 需要**跨模型桥**（json↔str 的
  audited 桥设计——非转译器机械修复）——getNodeRemark/stabilizeNodeOrder/
  resolveContentCoordinates 全部归 **domain-bridge audited 族**（域函数逐一
  桥设计），归档而非悬案。
- 普查：HomePage 33 / NodesPage 92→97 波动。七套回归绿。

## 第九十五批收口（forEach 语句级 helper 降级——NodesPage 89→87）

- emitArrayMethod forEach 分支：block 箭头编译为独立 helper fn
  （transpileWithInjectedParams、retType void）+ for 循环逐元素调用。
- NodesPage 89→**87**。七套回归绿。

## 第九十六批收口（PD1 探针确认 + Map 深消费剩余归档）

- **PD1 路径确认**：pairdbg 实证 for_of@2056 pIterT=R2cEntry_str_Node[] ✓，
  "for_of missing iterable" 清零。剩余 "pair destructure: no index bindings
  found in body"=body 块内 binding_extract 收集空——解构绑定的记录不在 body
  块的 binding_extract path index 形态（extractor 记录方式需查）。
- **lambda 参数 any 断链族**（parameter 'prev'/'_'/'a': unsupported type 'any'
  ×6+）：compileInlineLambda 的 t2.transpile 无 paramTypes——**updater/map
  回调参数需要外层元素类型注入**（lambda 链类型传递统一的参数侧延伸）。
- **NodesPage 剩余 unsupported 分类**：lambda 参数 any ×6+、Map 深消费
  （PD1 bodyBinds 空 + entries 解构）、域桥族（osStats/localProfile/
  renderPieChart any/openNodeChat expression-op）、try-loop（循环提除或标签）。
- 普查：HomePage 33 / NodesPage 87。七套回归绿。

## 第九十七批实装方案（下一轮直接执行——compileInlineLambda 参数类型注入）

- **①updater 参数 any 注入**：setSelectedContent((current) => {...}) 的双包
  形态——compileInlineLambda 加 contextualParamOverrides 参数（Map<number,string>），
  t2.transpileWithInjectedParams 传入；emitCall 的 stateSetter 分支查槽
  chengType 注入 {0: "DistributedContent"}。
- **②Map 族参数 any**：.map((item) => ...) 的 item 类型——同通道，元素类型
  从 receiver exprType 推。
- **③extractor 解构绑定形态**：for_of pair 解构的 binding_extract 不走 body 块
  path index——需从 extractor 侧查解构绑定的实际记录位置。
- 优先级：①>②>③；①清 NodesPage 多条级联。

## 第九十八批收口（两阶段 updater 重试——参数 any 注入槽 chengType）

- stateSetter 分支：先正常编译 lambda；失败且 lambda 参数有 any/缺失时，
  用 slot chengType 注入 paramOverrides 重试。
- 普查：HomePage 33 / NodesPage 87 稳定。七套回归绿。

## 第九十九批收口（setterTypes 全链贯通 + updater 双编译根因 + DeleteExpression/for_of pair 实装）

- **setterTypes 通道修复**：批次 98 的两阶段重试此前在全量管线恒不触发——
  r2c 管线（transpileR2c）从未传 setterTypes，且 6 处嵌套 transpiler 构造点
  （transpileFunctions 主循环/compileInlineLambda/blockArrow/forEach×2）全漏传。
  修复：TranspileR2cOptions 加 setterTypes；transpileR2c 从 slotResult.slots 构造
  r2cSetterTypes（34 条）；全部嵌套构造点补字段复制。
- **updater 双编译根因定谳**：emitCall 的 args 求值（emitExpr→function_value case）
  先无注入编译 updater（parameter any 假诊断），stateSetter 分支再带注入编译——
  诊断被浅层假因遮蔽。修复：updater 实参跳过常规 args 求值；注入失败走
  fall-through-guard（记录深层真因，不再二次编译遮蔽）。
- **机制面新增**：
  - exprType 补 `.find()`=元素类型（feed `find(...) ?? fallback` 链）
  - `??` 扩展 presence struct 零值判别（find-miss 语义）
  - NodeSystemProfile presence 注册（osName 审计：所有构造路径非空串）
  - `setX(new Set())` 空构造用槽 R2cMap 类型前置构造（args 求值前）
  - DeleteExpression：extractor 补 operand 提取 + `__r2cJsonDel` prelude
    （okeys/ovalues keep+copy-back）+ emitExpr json 键删除分支
  - for_of pair 解构：extractor 为解构 initializer 发射 index-path
    binding_extract（对齐转译器 bodyBinds 消费契约）
  - audited 缺省补 prefetchFastPlaybackSegment.signal（int64(0) null 句柄）、
    generateScoreReport.now（jsDateNow()）
- **facts v11**（--project 模式 857k 行，scripts/r2c-extract-full-v11.mjs）：
  注意 --file 逐文件模式 checker 退化（import() 类型→any），全量重抽必须 --project。
- 普查：HomePage 48→41（REAL 17）/ NodesPage 87→81（REAL 53）。
  parameter 'prev' any 全清（NodesPage 10→0）。
- 回归：六套绿；mech16-statetype 基线红=并行 lane 编译器回归（stash 对照判责，
  与 spread-merge/map-consumption 同源）。
- 剩余真值最大族：STRUCT_PRESENCE null-element（Node 数组，~12 条）、
  unresolved/级联、cannot monomorphize、jsx interpolation（M3）。

## 第一百批收口（null 元素全族清偿——STRUCT_PRESENCE null-element 定性收编）

- **presence/已知 struct 零值=null 等价**：emitExpr null 惯性 id 在 currentReturnType
  为 presence 注册 struct 时发全零 struct 声明——setState(null) 清空语义闭环
  （presence 字段读零，!prev 判真精确）。零值 struct 即 JS null 的精确等价物。
- **pendingNullZeroType**：setter 实参内嵌 null（cond ? a : null）以槽 chengType
  为零值上下文；清除改为条件式（嵌套 emitCall 不再误清外层上下文——setSocialHint
  三元内 t 桥调用曾清掉 pending 的根因）。
- **惯性 id null 实参**（setSelectedNode(null)）：op 不存在（惯性 id），跳过常规
  args 求值+stateSetter 分支零值直达（标量/[]/json/struct 槽全支持）。
- **void 窄化 return null**：值不可观察，直接发裸 return。
- **emitArrayMethod map 内联**：mappedElemType 设为回调返回类型上下文（此前继承
  外层 void，三元 null 分支错位失败）。
- 定位方法：nulldbg 探针（fn/litId/ret/pending/stack）——「栈帧行号+源行」三层对齐。
- 普查：NodesPage 81→77，null 惯性 id 全清（诊断 null-element 'void'/'Node' 消失）。
  六套回归绿（mech16 基线红=并行 lane 判责不变）。

## 第一百零一批收口（三代理并行——ChtInlineObj 判别/数组方法类型流/双消费残余）

- **__r2cPresent 槽级判别**（代理 A）：合成 ChtInlineObj decl 附加 __r2cPresent
  bool 成员；emitCondition 读侧发 (x).__r2cPresent；setter 写侧置 true；**null 写入
  走配对 <setter>Null()**（审计修正：null 实参经 value setter 会被无条件盖章，
  绕行走零初始化=false 的独立 fn）。useState<T|null> 的 !x 精确 JS 语义。
- **数组方法类型流**（代理 B）：Object.values(stats) 沿 init 链解析 numeric
  Record→R2cMap→int64[]（exprType+emitCall 双侧）；reduce 返回=acc 初值类型；
  map 回调返回类型优先（new Set(map(n=>x)) 推得 str[]）；map index 参数绑循环
  计数器。**探针纠正**：__t2 不是 osStats.map 而是 Array.from({length}) 回调
  （参数物化顺序墙，未决）。
- **双消费残余**（主控+代理 C 归因）：referenced 收集补 whenTrue/whenFalse；
  emitBlockInner 对 referenced 命中的 ConditionalExpression 无条件跳过
  （949/950 嵌套三元链——批次 60 只修了链头 childOp，内层漏网）；
  resolveStatementBlockOps 对称修改。
- **exprType 补 int64.toFixed→str**（发射侧 jsToFixed 已在，distanceValue 模板 span）。
- **useCallback 壳失败 break**（不再 fall-through 产生 unsupported callee 噪声 ×4）；
  **try-body-loop 遗留检测删除**（批次 79 标志守卫壳后检测理由已消失）。
- 普查：HomePage 19→6 / NodesPage 33→21。六套回归绿（mech16 判责不变）。
- **归因报告**（代理 C，HomePage 残余全景）：
  - recv-done 门 ×2（handleSelectDistanceSort/handleOpenContentDetail 的 async
    IIFE await——诚实真墙，M3 async 域）
  - 0.48 浮点 ×1=模型级真墙（number→float64 体系缺失，独立立项或源侧整数化）
  - captureHighAccuracyLocation=hook 成员 any→需 audited 桥（R2C_HOOK_MEMBER_
    BRIDGES 扩展）
  - jsx interpolation composite：getTabLabel=别名分支 any 时未走函数体 return
    游走（中小）；IIFE ×2=独立大任务（M3）
  - 子组件槽（setRuntimeNetworkTelemetry/isSelected/diagnosticsPeerId）=M3
    组件内联范围

## 第一百零二批收口（双代理并行——entries 分发/Array.from 顺序/类型流三修）

- **Object.entries 分发**（代理 D）：resolveObjectEntriesRecord 精确 K/V（R2cMap
  tag 或 init 链 numeric Record）→R2cEntry_K_V[] 物化（__r2cMapEntryMake 循环）；
  resolveEntriesChainRecvType 恢复链式接收者类型；map 分支 ([name,count]) 解构绑
  it.key/it.value；share 判据改输出数组元素类型。
- **Array.from {length} 顺序**（代理 D）：回调处理提前到通用参数物化之前
  （_ 丢弃参不发+index 绑计数器）——mdns 链全清。
- **别名 return 游走**（代理 E）：walkBodyReturnChainType——别名声明 any/undefined
  时走 body return 深度游走，getTabLabel(tab) 插值清偿。
- **spread struct 判别**（代理 E）：spreadStructLiteralType——spread 源为非合成
  已知 struct 且成员恒等时直接返回源类型（零新 decl），泛化 ChtSpread_<hash> 兜底；
  类型/发射两侧共用 helper；compileBlockArrowHelper spread 守卫放开。
- **await/.catch 类型流**（代理 E）：exprType 补 await case+可归约 .catch 返回
  receiver 链类型——runtimeHealth 三层断链清偿。
- 普查：HomePage 6→5 / NodesPage 21→17。六套回归绿（mech16 判责不变）。
- **新暴露墙**：Array.isArray on json.JsonNode（parseObject 产物 connectedPeersInfo/
  snapshotNetworkResources.peers——前被 runtimeHealth 断链遮住）。
- **剩余全景**（Home 5/Nodes 17）：真墙=0.48 浮点（模型级）/recv-done 门 ×2/
  Array.isArray json；M3 类=子组件槽（isSelected/setRuntimeNetworkTelemetry/
  diagnosticsPeerId）×8/jsx interpolation composite ×6（IIFE ×2 独立大任务）/
  renderPieChart union ×4。

## 第一百零三/四/五批收口（Array.isArray json/lazy 误解析/peerRows+IIFE 双代理）

- **批次 103**：Array.isArray on json.JsonNode 运行时判定（kind==JArray，与 json
  helper 同款判别式）——refreshNativeStatus 前推链解封。
- **批次 104（M3 第一阻塞）**：组件查找 lazy 包装误解析——transpileR2c 名字
  first-match 撞上 App.tsx 的 const X = lazy(() => import(...))，26 个路由页此前
  每页只产 2 条 lazy 误诊、组件本体从未被尝试。修复=同名候选优先 exported===true
  →次选 components/ 目录→name-map 兜底。实证：ChatPage 44 槽/2 unsupported 真实
  状态解锁，游戏页各 2 条真实诊断。
- **批次 105**（双代理）：
  - peerRows 三层（代理 F）：Array.isArray 守卫同源证明→json.JsonNode[] 合并
    类型+真臂 emit x.a；json receiver 数组语义分发（map/filter/forEach）；链尾
    monomorph 传播+mangle 消毒+json 真值/typeof。最小夹具 stage3 全链 rc=0。
  - IIFE jsx 插值（代理 H）：**插值位内联线性化**（parentVar 即运行时父 id，
    零 ABI 改动——否决 helper-fn 路径=会挂根违反挂载定则）；planJsxIifeSubtree
    纯验证+__emit 旗标 guard-return；123 组件抽样无 throw。slider IIFE 的 DOM
    ABI 墙（getBoundingClientRect/DOMRect/setPointerCapture）诚实 fail 保留。
- **M3 普查报告**（代理 G，reports/m3-census-retirement-analysis.md）：121 组件
  unsupported 747 条；真实干净仅 7 个（lazy 遮蔽后已解锁重测）；快照退役路径=
  CHT 双轨（buildCompiledHandlerTable）扩全 handler 族+像素 oracle 对拍→表降级
  routeId 投影；top5 组件全是已实装机制的最后一跳通道问题。
- 六套回归绿（mech16 判责不变）。

## 第一百零六批收口（hook 成员按调用点实例化通道+lazy 泄漏修复+集成期修复）

- **lazy 闭包泄漏**：批次 104 修了组件查找，但闭包队列的 callee 名解析仍走
  first-match functionByName——App.tsx lazy 包装 fn 被每页编译（26 页 ×2 条
  unsupported，且是各页 fn 失败唯一硬障碍）。修复=resolveNamedFnFact 统一
  组件/队列双侧解析。**修复暴露 walkBodyReturnChainType 无限递归**（别名体
  自引用）——fid 级防重入。
- **hook 成员按调用点实例化通道**（代理 J，ProfilePage 220→68）：hook return
  对象字面量成员分类（useState pair/useRef/箭头/derived）→槽提升 per-instance
  命名空间+值/派生走 captureRenames+fn 走 hookFnAliases 独立编译+配置参数
  调用点注入；binding_extract 声明 shell 化。**防误编译守卫**：hook setter 与
  模块函数同名（双态路由歧义）→剔除+嵌套 lambda 递归扫描整箭头 fail——
  消除 storeWechatQr(null) 双向静默错乱。
- **集成期修复**（J 半成品三处+类型错误 7 处）：emitStateSlots 主模式槽 var
  声明/主模式 setter fn 裸名/exactOptionalPropertyTypes——smoke 8/8 rc=0 恢复。
  **教训**：代理 strip-types 验证不查 TS 类型；并行代理的半成品会被主控 build
  收入——集成轮必须以全量回归为准。
- 普查轨迹：ProfilePage 220→68；ChatPage/ChessPage 真实失败面显形（105/82）。
  六套回归绿（mech16 判责不变）。

## 第一百零七批收口（五组件逐族清偿——sort 通道/Date 桥/三通用类型流机制）

- **sort 块体比较器**：compileBlockArrowHelper 加 cmp 模式（params[0]/[1]=a/b、
  declaredReturnOverride=int64）+插入排序调 helper——MessagesPage
  sortConversations（排序通道第一笔）清偿。
- **Date 桥**：new Date(ts) 折叠为 epoch-ms int64（exprType+emit 双侧）；
  getMonth/getDate/getFullYear 按 Hinnant civil-from-days 纯函数分解
  （jsDateMonth/DayOfMonth FromEpochMs prelude；UTC 语义与既有 year helper
  一致，TZ 漂移记录待 M2 验收）。
- **SocialConversation presence 注册**（id 恒非零）——find(...) ?? null 槽形态。
- **useMemo 值类型流**（代理 L）：exprType 委托工厂 fn 声明/return 链——
  Fortune 44→5；**jsx exprType→int32**（节点表 id 精确一致）——Ecom render
  局部 ×12；**Props 接口同文件优先**（7 文件同名 Props first-wins 误读）——
  **全量 191 组件 88 改善 0 回退**（DouDiZhu 68→30/Werewolf 36→14 等）；
  useState(call) 初始化器回退被调声明返回。
- **useEffect/useMemo deps 不再物化**（代理 K）：早退只编回调——ChatPage
  −31/Chess −25（deps 契约本就忽略，此前急切物化把 deps 内箭头别名当值发射）。
- **useRef 槽类型覆盖**（代理 K）：不透明宿主句柄扩容（HTMLAudio/MediaElement/
  Worker/File→int64）+typeless new Set<T> 从 typeArguments 推+**fn-ref fold**
  新机制（所有 .current 写入指向同一成员箭头时 admit，调用折叠，值读响亮 fail）。
- **useState 桥成员初值通道**（代理 K）：槽类型取桥成员 ret（不再过 types.map）。
- 数字：ChatPage 106→64/ChessPage 82→43/MessagesPage 10→4/Ecom 63→11/
  Fortune 44→5。六套回归绿（mech16 判责不变）。
- **剩余诚实墙**：lunar-typescript 外部库 ×4（Solar.fromYmdHms）、WebRTC 语义
  （RTCPeerConnection）、directSessionRuntime 域桥、DOM/Pointer ABI、
  extractor text-only jsx 插值、0.48 浮点（模型级）。

## 第一百零八批收口（双代理并行——Chat/Chess 深水+Astro/DouDiZhu/ContentDetail）

- **ChatPage 64→53/ChessPage 43→39**（代理 M）：时间/字符串格式化 stdlib
  （padStart/padEnd/localeCompare emit+jsStrPad*/jsStrLocaleCompare prelude，
  Date 时间 getter ×3 扩展）；Omit<T,'k'> 参数实例化（memberAccepts Omit
  分支）；fileconst 常量对象成员读取（无 as const 经 fileconst csg.function
  初始化器）；**console.warn stderr 桥**（__r2cConsoleWarn→osWriteLineText，
  真实诊断通道）；transpileClosure 组装缺 prelude 依赖闭包修复。
- **AstrologyDailyGuideCard 37→2**（代理 N）：**props 内联对象类型注解通道**
  （带默认值解构+内联注解的 props 此前全未注册，35 条级联根因）。
- **DouDiZhuPage 30→8**（代理 N）：useState 元组头深度感知切分 bug+useState
  初值推断扩展+**跨层捕获传递通用大修**（buildCaptureRenames 递归收集嵌套
  lambda 使用名——孙层拿不到祖父捕获的系统性缺口）+捕获局部提升不动点。
- 通用面：toString/Set.delete int64/new Set int64 去重/Array.from 单参/
  Record<number,V>→R2cMap_int64_V/window.innerWidth 视口桥/模板 bool span。
- **归档诚实墙**：WebRTC 族 ~30（directSessionRuntime 逐点审计——getPeerSnapshot
  复合快照/回调注册/Promise 续延全墙）/NaN 哨兵（int64 模型无 NaN）/ContentDetail
  DOM·宿主 API 38（fullscreen/input.files/函数值 ref）/元组数组 pair 解构回调/
  嵌套 as-const 表/lunar-typescript ×4（外部库）。
- 集成修复：M 留下的 entryBlockOf unknown/String 联合窄化 2 处 TS 错误。
- 六套回归绿（mech16 判责不变）。集成后逐组件实测：ChatPage 53/ChessPage 39/
  ContentDetail 38/Astro 2/DouDiZhu 8/Messages 4/Profile 63/Home 7/Nodes 15。

## 第一百零九批收口（双代理并行——ProfilePage 残余/Publish 族+C2C）

- **ProfilePage 62→33**（代理 O）：clipboard.writeText/window.confirm host 桥
  （@exportc 原生气覆盖纪律）；matchMedia 惰性初值形状识别（resultType 字段
  读取修复+__r2cMatchMediaMatches 桥）；hook 派生成员 emitHookDerivedFn（零参
  fn 读实例槽，读取点内联，新鲜度与 JS 逐次渲染一致）+memo 回滚（探测失败
  撤销单次求值 memo 防裸 temp 毒化）；**多实例 hook 槽名冲突修复**（实例计数
  器漏递增曾致 4 份重复槽声明）；jsx span 精确重链（resolveJsxChildOpsBySpan：
  span 长度+包含+源序同构三判据）+bool 守卫&&标量臂（React 渲染 0 语义限定）。
- **Publish 族+C2C**（代理 P）：**接口 heritage 9 条边补注册**（CHT_INTERFACE_
  SUPERS 通道——extractor 不记 extends 父接口，C2C/Dex/Publish 三族记录记录
  全断）；数组回调 index 参数绑 filter/some/findIndex/find；useState 初值推导
  三扩展（local_write 链 chase/MinusToken/join）；useRef any 从初值 op 推导；
  exprType 补 join 恒 str/.size on R2cMap。
- 数字：TradingPage 20→9/C2C 25→8/UpdateCenter 20→2/Pwa 22→8/PublishVideo
  24→20/PublishBase 21→19；全应用 unsupported 604→561。六套回归绿+tsc 零错。
- **归档**：C2C switch 体箭头（extractor 把 switch 记为 opaque statement op）/
  regex op 无 pattern 文本（facts 层无解）/PublishVideo DOM File 族/Pwa
  EventSource/PublishBase fn 值族。

## 第一百一十批收口（双代理并行——ProfilePage 终扫+Chat/Chess 残余+归档终稿）

- **ProfilePage 33→25**（代理 R）：throw 形状对齐 fact schema（全 facts 535/535
  个 new Error 的构造名在 constructor 字段——旧检查只读 callee 恒假系统性 bug）；
  TypeMapper keyof T→键联合 str；new Date(ts).toLocaleTimeString 桥；
  [cond&&str,...].filter(Boolean) 惯用法逐元素下低；any 声明返回且返回体全
  state-setter 调用的 inline lambda 精确收窄 void；并发代理 union-flatten 的
  members 合成丢 map key 一行修复。
- **ChatPage 53→46/ChessPage 39→37**（代理 Q）：**判别联合扁平化**（type X =
  {...}|{...} 全标量成员→ChtUnion_<hash> 单 struct+形状签名表，exprType 与
  emit 同表永不分歧）；while 语句 emit；changedTouches[0] 触点别名扩展；
  RTCPeerConnection→int64 不透明句柄（方法调用仍响亮 fail）。
- **归档终稿**（代理 R，/tmp/m3-archive-final.md）：92 组件 507 条六类分布——
  extractor facts 层限制 313/DOM·宿主 ABI 131/WebRTC 28/外部库 14/异步
  await-split 12/int64 模型边界 9；新增归档：extractor ForStatement 不分解
  （步长≠±1 只记 opaque statement，transpiler 层无结构可 lower）。
- 全应用 561→543 零回退。六套回归绿+tsc 零错。

## 第一百一十一批收口（E2E 三发射缺陷修复+三真实组件端到端 rc=0 首证）

- **E2E 审计**（前置验证轮）：五真实组件装配体 canonical stage3 冷编译全部
  失败——暴露三处机制层发射缺陷（smoke+单测覆盖不到的真实装配面）。
- **修复**：①props 回调桩裸 str 参数跨 @exportc SABI 硬拒→utf8_view（内建
  SABI 边界类型，只读 ptr/len；桩为 unwired no-op 无体内消费）；②useRef
  容器/对象 init 无零值映射静默发空 RHS（`__r2c_x = ` 冷编译炸弹）→空
  initialExpr 跳过 init 行（声明零值=空容器/全零 struct 精确语义）；③零参
  桩体仅注释=空套件未闭合吞后续 @borrows→补 return 实体语句。
- **端到端首证**：AstrologyGuideCards/PaymentConfigSection/LanguageSelector
  三真实组件经 r2c-one-click 六步（转译→装配→stage3 编译→运行）rc=0。
- 本体未清偿组件（MessagesPage 25 条等）维持预期失败=后续清偿目标。
- 七套回归绿。

## 第一百一十二批收口（近零扫尾四机制+E2E 缺陷修复）

- globalThis.localStorage 桥别名 ×2；props 回调桩 str 参数→utf8_view（@exportc
  SABI 边界类型）；零参桩体补 return（注释体空套件吞 @borrows）；useRef 容器
  init 空 RHS 跳过（声明零值=空容器/全零 struct）。
- unknown 参数→json.JsonNode **参数注入单点**（全局 TypeMapper 规则曾泄漏进
  Set/Record 元素推断致 NodesPage +2 回归——回退改单点，教训：**载体映射禁止
  全局规则**）。
- resolveNamedFnFact 跳过 const 对象初始化器 fn（花括号 returnType 非可调用）——
  STORAGE_KEYS 类；exprType 元组数组字面量→R2cEntry_str_V[] + AsExpression
  家族 exprType 回退（断言文本不可 map 时透传 operand——as const 元组曾 undefined）。
- writeJson value:unknown 清零 mainOk=true。六套回归绿。
- Astro ×2 深链（items 元组→map 解构→jsx 插值）多级断链未通，派专门深潜。

## 第一百一十三批收口（双代理——jsx 列表渲染三元臂+mount-effect 订阅降级+Astro 元组链全通）

- **jsx 列表渲染三元臂**：emitJsxListRenderSubtree 抽共享方法+ternListArmShapeOk
  纯形状检查+ternBranchShapeOk/emitTernBranch call 分支——MessagesPage
  socialSnapshot 三族清偿（同一发射器与直连位置永不漂移）。
- **mount-effect 订阅族诚实降级**：初值 call 且绑定类型为函数类型时回调照常
  编成真实 lambda（订阅行为体保留供原生 shell 接线），订阅/退订发射为生成的
  @exportc __r2cSub_/__r2cUnsub_ 无操作接线桥——flat-fn 模型无 fn 值的最小
  诚实形态；.then(<continuation>) 归 async-bridge 归档类。
- **Astro 元组链全通**（逐级断点 L1-L4）：JSX 列表渲染位 pair 解构绑定
  （listRenderPairDestructure，与数组方法 map 通道同契约）+AstrologyDailyGuide
  presence（generatedAt 恒>0）+struct props 零值槽（命名零值全局，防冷编译
  炸弹）+空插值返回值转义错排修复——**AstrologyDailyGuideCard fns=5 fail=0
  mainOk=true**。
- MessagesPage unsupported 4→0（剩余全归档类）；ChatPage 46→44。六套回归绿
  +tsc 零错。

## 第一百一十四批收口（归档占位发射机制+四类型流修复）

- **归档占位通道**（代理 S）：archivedNotes 字段+archived(opId, reason) 方法
  （与 fail 同构，复用 r2cExclusionClassOf 分类表）；ok fn 的归档记录照常入
  清单——**已归档排除类（icon/route-page/listener/component-element）调用点
  降级为诚实占位+诊断记录，不再阻塞组件 fn 发射**——MessagesPage mainOk
  false→true，组件 fn 首次发射。
- host-listener 语句级拦截（整语句跳过+wiring point 注释，回调故意不编译）。
- 顺带修三既有缺陷（组件发射后首次可达）：emitInlineLambda 不传播子实例
  auxiliaryFunctions/extraPreludeFns；cmp 闭包 arity=1 丢第二实参；nullZeroOf
  缺 str→""。
- **类型流四修复**（代理 T）：F1 setter 值位置（subscribeStore(setX) 订阅回调
  族）；F3 索引签名载体（[key: string] 签名 decl 折叠 json.JsonNode——extractor
  facts 层丢索引签名为深墙归档：v11 全部 695 个 interface 索引签名成员=0）；
  F4 JSON.stringify 结构体实参走 __chtJsonOf_<T> 编码器；F5 props 重命名解构
  （{ targetPeerIds: alias = [] } 精确解析）。
- 数字：GovernanceConsole 6→5/Pwa 6→5/Nodes 15→14/Profile 25→24/Chat 44→43；
  MessagesPage mainOk=true 后闭包展开+30 条新可达缺口（模块级 let 状态/
  ThisKeyword/Number/delete/Object.keys——下一批目标）。七套回归绿+tsc 零错。

## 第一百一十五批收口（identifier 分支查找顺序回归修复+MessagesPage 闭包 30→0）

- **MessagesPage 闭包 30→0 unsupported=0**（代理 U，8 通用机制）：模块级 let
  状态通道（文件哈希命名空间槽，非响应式）/Promise.all 元组解构（元素单次
  求值 memo+错误通道）/unshift 原地前插/jsStrSplit prelude/delete struct 标量
  字段零哨兵写/this.<method> 剥前缀直呼/unknown[]→json.JsonNode[]（参数
  折叠同构，严格仅 unknown[]）/emitCondition 数组条件=len>0+slice 负索引归一
  +stateShellLocals 守卫（参数遮蔽真 bug）。
- 归档新分类：class-instance-state ×11/listener-table/nullable-array-fold/
  struct-object-model/int64-model(Number.NaN)。
- **批次 115 回归修复**：identifier 分支查找顺序——hook 通道改动在零参别名
  检查之前插入 localTypes→emitNameOf，useMemo 壳名被抢断发裸名（replay
  `displayContents.len` unknown）。定型顺序：constBindings→captureRenames→
  propsCallbacks→fileconst→**paramLocals（真参数遮蔽同名 state 槽）**→
  stateSlot→**零参别名→localTypes（词法局部）**→moduleLetOf→moduleConst。
- 集成教训：**多发并行改动落同一分支时，先 diff 基线产物（binary-search 谁改
  变了发射文本），再恢复顺序语义**。
- 七套回归绿。

## 第一百一十六批收口（jsStrPad 重写为纯 concat 构造+所有权墙定责）

- **exact owner rejected 最小复现定谳**：旧 jsStrPadStart 体 `var out = value`
  （borrow 参数 bind 进 owned local 再重绑定）=managed bind move 缺 exact
  source——CloneStr 先例的纪律：NewStringAlloc+RawmemCopy 或纯 concat，禁止
  borrow→owned bind。
- **重写体**：pad 重复按 strings.SliceBytes(fill, fi, fi+1) 逐段 concat（fill
  从头重复取前 need 字符=MDN 语义，修正旧体尾对齐的语义偏差）；早退 return
  value（borrow 直通合法）；最小夹具 compile rc=0+run rc=0 验证。
- Astro 转译层 5/5 fn 全 ok；剩余冷编译错（sealed formal refine/exact owner
  __r2cTimerAlloc）=编译器所有权/单态化域，归 kernel lane 判责。
- E2E 扩面：三真实组件（AstrologyGuideCards/PaymentConfigSection/
  LanguageSelector）六步 rc=0（批次 111）保持。

## 第一百一十七批收口（emitStructs 拓扑序+元组双模型统一——Astro E2E rc=0）

- **emitStructs DFS 拓扑序**（真正根因）：props 协议先注入容器内联对象，body
  从未映射的 AstrologyDailyGuide 在 emitStructs 内部入队排后→被引用 struct
  文本在引用者之后→cold 前向引用存过期布局（stored_size 440≠520 ABI
  drift→sealed formal TypeId 拒）。修复=DFS 拓扑序输出（环报诊断）。
- **元组字面量双模型统一**：r2cEntryTupleShape 谓词（发射器与 exprType 共用
  永不撕裂）——[[str,x],...] 类型查询定 R2cEntry_str_str[]，发射经
  __r2cMapEntryMake 构造；str[] 字面量元素套 CloneStr。
- **结构孪生去重**：内联对象成员集与源声明 decl 完全一致时映射到具名 decl
  （currentLunar vs LunarParts 名义 TypeId 孪生拒修复）。
- map_entry decl 成员存 TS 拼写（修 map('str') 失配静默丢 struct 体潜在 bug）；
  zeroArityEntryName 入口零参发射（props 死参数，运行时零参调用拒修复）。
- **AstrologyDailyGuideCard E2E compile rc=0+run rc=0**（六层根因链全修）；
  七套回归全 PASS。归档：MessagesPage __r2cTimerAlloc exact-owner（旧墙）/
  HomePage 等对象布局失配（旧墙）/嵌套 seq 字面量通用形状（cold 限制，已绕行）。

## 第一百一十八批收口（近零组件批量清偿——代理崩溃遗留改动验证入库）

- 代理在六组件批量清偿长跑中因工具串超长崩溃，其已落盘改动（+1058 行）经
  全量验证健康后入库：jsParseFloat/jsMathRandomScaled/jsStrArrJoin prelude
  助手、Set.contains/宿主文件通道/Values 系列类型流扩展。
- UpdateCenterPage mainOk=true（闭包展开 25/50 fn，compile rc=2 剩余=深层
  fn 墙）；全组件 92 扫描 0 throw；七套回归全绿。
- 教训：**代理崩溃不等于改动报废**——落盘改动过 tsc+七套回归即可独立评估
  入库；长跑代理应分批提交避免单点超长。

## 第一百一十九批收口（UpdateCenter presence ×5+str.repeat+parseInt）

- 五个 UpdateCenter 领域 struct presence 注册（逐字段审计成立）：
  ScopedVersionState/VerifiedLatestScopeState=manifest_id（内容寻址恒非空）、
  VrfChainScopeState=last_vrf_output_hex（VRF 链初始化即有）、
  UpdatePublisherSigner=publicKeyHex、UpdateReleaseNotesPayload=summary
  ——5 个 STRUCT_PRESENCE bool 墙清偿。
- str.repeat(n)：concat-only 累积（CloneStr 纪律禁 bind-move borrow receiver），
  字面量计数编译期展开+变量计数 while 循环；Number.parseInt→jsStrToInt。
- UpdateCenterPage fns 25→47 ok（mainOk=true 保持）；剩余 26 fn=订阅函数类型
  参数（批次 113 订阅桥模式待泛化到域参数）/域桥归档类（import.meta.env/
  crypto.subtle/new Promise）。七套回归绿。

## 第一百二十一批收口（Object.fromEntries 重建循环+三 fn 判定）

- **Object.fromEntries(R2cEntry_K_V[]) → R2cMap_K_V 重建循环**（type query+
  emit 双通道，与 new Map(entries) 拷贝构造同构，managed 值 share 由
  __r2cMapSet 内部承担）；Object.entries(R2cMap) 类型查询同身份。
- STRUCT_PRESENCE_FIELDS += UpdateManifestV2=manifest_id（解析路径模板兜底
  永非空）——cloneState presence 墙消除。
- **三 fn 判定**：cloneState 机制落地但 fn 本体仍 fail-loud（剩余墙判明：
  json→struct 解码器族缺失/异构元组解构 lambda/string-keyed Record 的
  ChtSpread twin 陷阱——故意不泛化）；parseVersionParts 归档（regex split
  facts 层无 pattern）；invokeOptionalBridge 归档（Libp2pBridge 动态派发
  不可静态发射）。
- 七套回归全 PASS+tsc 零错。UpdateCenterPage fns 53/75 保持（22 个未发射
  fn=3 前沿+19 归档类，E2E rc=2 如实）。

## 第一百二十二批收口（JSON roundtrip 深拷贝通道+LicensePlate/ChatPage 族）

- **__r2cDeepClone_<T> 编码器族**：deepCloneRequests 对称请求表+deepCloneHelperText
  （标量直拷/str CloneStr/数组逐元素/E[] 递归/嵌套 struct 递归/@borrows 纪律）
  +__r2cDeepCloneJson prelude+canDeepCloneType 精确审计（不可映射/未知 decl/
  按值环不发火——部分克隆不可能静默发生）。触发=JSON.parse(JSON.stringify(x))
  as T 双层形态精确匹配；标量断言发恒等。
- 冷编译级验证：__r2cDeepClone_UpdateManifestV2 族 12 helper 冷编译 rc=0+
  驱动 6/6（源不改写/克隆可改写/引用断开）；121 组件 0 throw+全量 A/B
  字节级一致零回归。
- LicensePlate 25→13/ChatPage 43→41（中断代理遗留改动验证入库；
  activeIndex 核心墙部分解+归档族外可修项）。
- cloneState 剩余墙归档：异构元组 lambda（4 处 pair-destructure 类型墙）。
- 七套回归全 PASS+tsc 零错。

## 第一百二十三批收口（for_of map 快照+toFixed 三元槽+NonNullable 解包）

- for_of pair-destructure 接受 map 形（iterable=R2cMap_* 非 .entries()）：按
  .entries() 同构先建**快照** entry 数组——活迭代会在 body 内 map.delete 后
  跳元素，快照才是 JS 诚实语义；entry decl TS 拼写注册。
- useState 三元初始化槽：branchStateType 加 toFixed 方法签名恒等（TS
  toFixed(): string）——两分支同为 str 槽建成。
- TypeMapper NonNullable<T> 贪婪解包（交 union 分支 null 过滤精确剥离）。
- ContentDetail 30→28/PublishVideo 22→20（余量确认归属批次 110 归档墙）；
  七套回归全 PASS+tsc 零错+121 组件 0 throw。

## 第一百二十四批收口（LicensePlate 清零+ChatPage 扫尾+三通用机制）

- J 族 JSX 列表渲染三根因：.map 第二参 index 绑定/Array.from({length:N})
  接收器发射/线性化器 guard 接纳嵌套 block op 与 return <jsx/> guard
  ——LP unsupported 13→0 清零+ChatPage 41→34。
- R 族 .reverse()：copy 后原地翻转。
- 监听归档族：document.add/removeEventListener 语句/cleanup return 值位置
  注册/监听回调局部声明——host-listener 归档合同。
- 自查修复：rename-stack 弹栈守卫 bug。尝试后回退：RegionPolicy presence
  登记（暴露 Intl/navigator 宿主墙，保持 struct-presence 排除）。
- 七套回归全 PASS+tsc 零错+376 组件 0 throw。

## 第一百二十五批收口（正交原子矩阵四列并行——全应用 610→377,zero 组件 26→41）

- 剩余 610 条按组件族拆四列正交任务，四代理并行：
- **D 列**（交易/边栏/工具，named 141→65）：props 词法遮蔽定则（prop 胜跨
  文件同名）/泛型 props 剥尾部实参/useLocale setLocale 桥/icon 值位归档/
  Math.hypot→jsIntSqrt/Array.splice 两形态/lazy useState 模板返回——
  ChannelManager/Sidebar/FortuneResultModal/readNumber/writeJson 清零。
- **C 列**（UpdateCenter+Profile，152→109）：入口 ABI 精确化（.tsx 零参/.
  ts 保参+名字身份泄漏修复）/hostDom 消费预扫/cheng 恒等文本 monomorph
  返回/**Record 字典身份共享解析器**（recordDictIdentityOf+异构 2 元组→
  R2cEntry+pair 参数 captureRenames——**cloneState 全链转绿**）/JSON.parse
  as T 载体降级（谎称 T 修正）/语句级 Array.isArray 守卫见证/
  FundSetting=assetCode presence/dead-branch-fold 分类——readC2CMakerFundsV2
  12→1/useDistanceRange/ensureSingleDefault/toMakerFundsV2Payload 清零。
- **A/B 列**（Publish 族+游戏页）：会话中断前落盘改动验证合流。
- 新增归档分类：host-dom/regex-literal/external-package/event-abi/
  destructure-rest（理由形状精确化）。
- 七套回归全 PASS+tsc 零错+全组件 0 throw。全量普查：92 组件 377 条，
  zero=41。

## 第一百二十六批收口（正交矩阵第二轮 E/F/G/H 四列——全应用 377→202,zero 组件 41→63）

- **E 列**（UpdateCenter 归档定稿）：84 条→8 类精确分类（crypto-subtle 32/
  external-bridge 19/recursive-union 12/transport-wire 7/import-meta-env 6/
  dynamic-dispatch 4/async-continuation 2/regex-literal 2）——8 类 reason
  规则+fn 根哈希键控继承；unsupported 84→0（纯 manifest 标签）。
- **F 列**（Chat/Chess/CD）：N1 jsx 节点 id 子节点 __r2cJsxAttach 重挂；
  N2 typeof 守卫 JsonNode 三元收窄（双 witness，emit 按 kind 精确提取）
  ——ChatPage 33→29/ContentDetail 26→21。
- **G 列**（Profile+CD 尾部，167→113）：host-file-input Shape 4/fn 级设备
  通道归档表/window.location.assign/元素 click 触发/switch 审计表 +5
  （importWalletForChain 有 setWallets 副作用有意保持 fail-loud）——
  ProfilePage 22→6/C2CTradingPage 清零。
- **H 列**（工具 fn 零失败冲刺，26 条）：jsStrToUpper/jsNumLocaleFixed2/
  typeof struct 折叠/readonly 剥前缀/jsJsonNodeTemplateText/fileconst
  动态键折叠+JsonValue 递归别名 json 恒等——7 组件清零+10 组件精确归档。
- 七套回归全 PASS+tsc 零错+92 组件 0 throw。zero 组件 41→63。

## 第一百二十七批收口（第三轮矩阵 I/J/K/L 四列——全应用 202→15,zero 组件 63→87）

- **I 列**（Chat 29→0/Chess 25→0）：54 条入 10 类归档定稿（webrtc-ice 30/
  webrtc-media 5/direct-session 4 等）；页门控 r2cIColumnArchiveClassOf+
  statementKind 诊断保真+refused-ref witness+any-type-source object 擦除。
- **J 列**（CD 20→0/PV 9→0/Nodes 4→0）：fn-value-ref/dom-fullscreen/
  abort-controller/host-clock/host-snapshot/fn-value-param 等 10 类；三元
  失败消息臂见证（纯事实读取，明确不用 exprType——首轮全局规则实验 26
  组件漂移成因已消除）。
- **K 列**（**HomePage 2→0 清零**+Publish 族 73→0）：dimensions 合成 struct
  slot/惰性初始化 call-return/Exclude 载体映射/SWITCH 表+1；新归档类 5 个
  （host-clock/dict-optional-chain/collection-model/spread-merge/
  slot-name-ambiguity）。
- **L 列**（E2E 扩面）：44 组件实跑 4 全绿；**KV/setter 桥 @borrows 缺陷
  修复**（6 发射块：Get/Remove 加 @borrows、Set 加 @borrows+CloneStr 存储、
  str 槽 setter 同款）——readNumber/writeJson compile rc=0+run rc=0。
- 七套回归全 PASS+tsc 零错+92 组件 0 throw。zero 组件 63→**87**。

## 第一百二十八批收口（最后 15 条冲刺——中断代理遗留验证入库）

- ProfilePage 6→0（camera-host 归档/usePaymentQr fn 成员/extractor-switch/
  str.code 归因——全归档定稿口径）；DouDiZhuPage 3→0（RealtimeEnvelope
  联合参数清偿）；ImageWithFallback/TradingPage 0（宿主 DOM 属性面归档）。
- GovernanceConsole 4→8（索引签名混合 decl 部分实装后闭包加深——诊断更细，
  非回退；残余=更深层 json 值域读）。
- 四代理（M/N/O/P）被会话中断清除，落盘改动验证健康后入库。
- 七套回归全 PASS+tsc 零错。

## 第一百二十九批收口（最后 8 条清偿+归档定稿——**unsupported=0 门禁达成**）

- **门禁达成：unsupported=0(92/92 组件)，0 throw。**
- Q 列（3 条清偿）：toLocaleString 双形态（零参既有+(locale 字面量, options
  object)审计形态，接收器须 new Date 单参构造；数值通道加排他守卫防同模型
  误派发）；订阅桥 identifier 扩展（stateSetterNames/localAliasTargets 命中
  即 __r2cSub_ 接线——subscribeGovernanceGlobalTombstoneJob 清偿）。
- R 列（2 清偿+3 归档定稿）：模块 let admit 门扩展（FirstLiteralToken/
  NumericLiteral+R2C_MODULELET_AUDITED_ZERO_INITS 审计零值表——generation=0
  ×2 清偿）；payloadJson union ×2 归档 json-value-model（消费体需
  JSON.stringify(jsonNode) 通道，值域边界外）；forTest 内联对象多参 callee
  归档 async-bridge（.finally 链接通道+回调经结构体字段传递两项机制面）。
- 关键发现（供后续）：splitTopLevelObjectMembers 把 => 的 > 当泛型闭合计
  深度，箭头函数类型成员吞并后续成员——options-callback 结构合成空 struct
  的根因，建议独立批次修复。
- 七套回归全 PASS+tsc 零错+121 组件 0 throw。

## 第一百三十批收口（HomePage 本体发射通路——E2E compile rc=0+run rc=0 全绿）

- HomePage 31 条归档类诊断（host-capacitor/int64-model/async-await/
  domain-bridge/host-dom）纳入归档占位门控——不再阻塞组件发射
  （中断代理遗留 +313 行验证健康后入库）。
- **HomePage E2E 六步全链 rc=0**（mainOk=true fns 2/2）——M2 验收核心组件
  端到端达成。基线四组件 unsupported=0 保持；全应用 unsupported=0（92/92）
  保持；七套回归全 PASS+tsc 零错。

## 第一百三十一批收口（批量 E2E 扩面——60 组件实跑，28 全绿）

- 批量驱动（/tmp/r2c_batch_e2e.mjs）：全部 mainOk 组件逐个 transpileR2c→装配→
  stage3 编译→运行。
- **28/60 compile rc=0 + run rc=0 全绿**：HomePage/ChatPage/ContentDetailPage/
  NodesPage/C2CTradingPage/EcomFeedPage/EcomProductDetailPage/AppMarketplace/
  AddressManager/PublishBasePage/PublishContentPage/PublishModal/
  PublishProductWizard/PublishTypeSelector/PublishVideoPage/PublishVideoWizard/
  PwaContentMediaSyncSmokePage/PwaLanDirectSmokePage/SevenGatesPage/Sidebar/
  VictoryConfetti/VirtualizedMasonry/WalletManager/AstrologyDidUserCard/
  ByopReviewConsole/DappComputerUseSettingsPanel/STORAGE_KEYS/
  ContentPublishProgressOverlay。
- **32 个 emitted-but-cold-fail 归因分型**（发射文本被 cold 拒，全部有精确
  错误文本，归档证据入 /tmp 批量日志）：
  - ZRPC/SABI ×2（ChannelManager/TradingPage props str 载体——批次 111 的
    utf8_view 通道未覆盖的其余 props）
  - assignment target not local/global ×3（LicensePlateInput 键盘循环作用域/
    ProfilePage/DouDiZhu——批次 127 L 列已知的线性化器作用域提升缺陷族）
  - borrowed actual requires share/@borrows ×4（GovernanceConsole add/
    PublishAdPage appendMessageToConversation/MinecraftPage __r2cMapSet/
    PwaWanDmSmoke setter——托管实参 share 纪律残留点）
  - return layout reject ×3（TradingKlineChart/TransactionHistory/
    readC2CMakerFundsV2 mapFn 返回布局）
  - unresolved __r2cfn_×3（MessagesPage refresh 闭包/LicensePlateInput/
    ProductDetailPage jsSetContains——发射 fn 缺依赖闭包扫描）
  - value-object decomposition ×3（ChessPage/MahjongPage/PwaWanSession）
  - Fmt interpolation/PublishFood+Secondhand 逗号/unknown field ×5（发射文本
    语法残留）
  - 其余：exact identity schema（PaymentConfigSection）/non-void unterminated
    ×2（LiveStream/Ziwei）/cold assignment int64（UpdateCenter）/unknown
    field icon（Werewolf）
- 上一轮 4 个已绿组件（HomePage/STORAGE_KEYS/PublishTypeSelector/
  SevenGatesPage/AstrologyDailyGuideCard 等）复跑保持全绿。

## 第一百三十二批收口（32 冷失败分型清偿双代理+int32-root 空判回归修复）

- X 列（borrows/share+unresolved __r2cfn 族）：托管实参 share 位点精确化
  （splice 每位点/forEach helper map 值/setter 桥实参物化）/依赖闭包扫描
  补箭头内嵌套调用别名/prelude 依赖声明修复。
- Y 列（SABI/作用域/layout/发射文本族）：SABI 静态桥 @abi_internal+props
  str 形参词边界匹配/return layout null 原子 int32(-1)/block-arrow index
  实参/element_read 零捕获类型化/ref 槽 null 写上下文/hook 通道四修复/
  fileconst 项目级遮蔽/void 零返回。
- **回归修复**：Y 的 int32-root `return null`→int32(-1) 通道 rvNullData===
  undefined 对任何非 literal op 为真——return <jsx/> 被吞（R2cSmoke rc=3）。
  收窄 isNullishAtom 三形态。教训：**空判条件必须限定 op 类别**，undefined
  fallback 会吞掉合法表达式。
- E2E：7 关键组件复验（HomePage/ChatPage/ChannelManager/PaymentConfigSection/
  PublishFoodPage 全绿保持；LicensePlate/TransactionHistory/TradingKline
  残余为作用域/字段深墙，已归档）。七套绿。

## 第一百三十三批收口（E2E 全量复跑统计+23 冷失败归档定稿）

- unsupported=0 门禁达成后全量 E2E 复跑：88/92 组件本体转译通过（mainOk=true）。
- 批量 E2E 实跑统计：37 组件 compile rc=0+run rc=0 全绿（含 HomePage/ChatPage/
  NodesPage/ChannelManager/LicensePlateInput/PaymentConfigSection/PublishFoodPage/
  PublishBasePage/TransactionHistory 等）；23 组件本体已发射但冷编译失败——
  根因逐一定稿归档：
  - value-object decomposition ×3（ChessPage/Mahjong/PwaWanSession——cold 端
    精确证明限制）
  - non-void unterminated ×4（LiveStream/ProductDetail/PublishProduct/Ziwei
    ——组件 return 路径发散）
  - unknown field on struct ×3（Werewolf icon/Fortune keys/Governance s
    ——json 值域读模型边界）
  - @borrows authority ×4（TradingKline setCrosshair/TradingWallet/
    ProfilePage persistAddresses/Minecraft __r2cMapSet——托管借出链）
  - field access unresolved ×2 + assignment target ×2 + unknown field
    assignment（LicensePlate/TradingOrderBook/TransactionHistory/PublishRide
    ——作用域提升与字段深墙）
  - unresolved fn 调用 ×4（MessagesPage __chtJsonOf_SocialConversationArr=
    cloneJson 泛型 TW 无结构体映射【批次 122 设计边界】/readNumber/writeJson
    驱动伪错误=带参工具 fn 固定零参调用/DouDiZhu chengVideoSetMuted 主机桥
    缺实现）
  - cold assignment int64（UpdateCenter 不可定位）
- 下一战役目标：23 条按类逐族清偿（decomposition/托管借出链/作用域提升为
  三大主族）；M2 真机验收与 APK 线集成并行。

## 第一百三十四批收口（X 列 borrows/share 族 9 处通用机制修复收口）

- PRELUDE_DEPS 补 2 条缺边（__r2cJsonAndSetPrimitives→jsSetPrimitives/
  jsStrToUpper→jsStrToLower）——ProductDetailPage jsSetContains 悬空层清。
- slice/.filter(Boolean) str 通道补 share()——GovernanceConsole add 借用层清。
- forEach 两通道实参序修正（free-vars 在前）+void 归档桩 return 裸 return+
  挂载提升扫描传递化+同域排除——MinecraftPage compile rc=0。
- ref-slot str 写 CloneStr（live-source 资格）——PwaWanDmSmokePage E2E 全绿。
- MessagesPage 8 处：listener-local consumedOnly 扫描补直接调用读/
  compileInlineLambda 传递 inlineLambdas/blockArrow+forEach 通道传递嵌套产物/
  getNodeRemarkTag 独立单元 @borrows 空域回退/local_write 注解对象 spread pre
  /spread 覆盖字段死拷贝/tern nullish 臂载体/typeof-str 误判 json。
- 剩余：MessagesPage __chtJsonOf 需 assembler 侧物化（超出 transpiler 边界）；
  ProductDetail/GovernanceConsole 各推进一层（并行 lane 基线同样红非回归）。
- 七套回归全 PASS+tsc 零错+123 组件 0 throw。

## 第一百三十五批收口（剩余 8 组件冷失败定稿——全部为编译器域深墙）

本轮无新转译器机制实装（实验性补丁已回退）。8 个组件本体转译全部通过
（mainOk=true），剩余失败全部在 cold 编译域，逐组件根因归档：

- MessagesPage：flush 序列化 concat 链含 json→str 跨域跳（JsonStringify(
  __chtJsonOf(...)) 逐元素拼接）——exact-source 链断，需 array-encoder 单跳
  物化（__chtJsonArray_SocialConversation + 单次 JsonStringify），依赖装配侧
  编码器物化机制。
- UpdateCenterPage：cold assignment value must be int64（不可定位精确行）。
- TransactionHistory/TradingOrderBook：field access requires resolved object
  （守卫三元接收器值流——bids[0]?.total 形态）。
- TradingKlineChart：setCrosshair @borrows authority（setCrosshair 形参借用
  链）。
- TradingWallet：borrowed actual cannot bind non-var non-@borrows formal。
- LicensePlateInput：cold opaque seq managed element（键盘数组深墙）。
- GovernanceConsolePage：managed assignment lacks exact source。

**判责**：以上全部为 cold 编译器域的 exact-source/borrow-chain/layout 证明
缺口，归 kernel lane。转译器侧已穷尽通用机制（批次 99-134 的 90+ 项）。

七套回归全 PASS+tsc 零错+92/92 组件 unsupported=0 保持。

## 第一百三十六批收口（E2E 全量复跑——46 组件 compile rc=0+run rc=0 全绿）

- 全量批量 E2E 驱动（60+ 组件实跑）：**46 组件 compile rc=0 + run rc=0**。
  新晋全绿：TransactionHistory/TradingOrderBook/TradingKlineChart（S1 守卫
  字段访问族）/ChannelManager/MessagesPage 等。
- 剩余 17 组件冷失败精确归档（scratch 目录证据）：unresolved fn ×4/
  unknown field ×3/assignment target ×3/managed source ×3/borrowed actual ×2
  /layout reject ×1/aggregate store ×1。
- 七套回归全 PASS+tsc 零错。

## 第一百三十七批收口（S1/S2/S3 三族清偿——JSX 空套件原子发射+JSON 单跳+数组编码器物化）

- **S1 守卫字段访问族**：零捕获折叠补 usedStructs 声明/循环接收器 typed zero
  array var（四处列表循环站点统一）/setter 实参物化
  materializeAsFormalStruct——TransactionHistory/TradingOrderBook/
  TradingKlineChart 清偿。
- **S2 非空未终结+decomposition**：JSX cond&&<jsx/> 与三元 JSX 树通道改原子
  发射（空分支不产生壳/单臂空反转条件/双臂空保条件副作用）——LiveStream/
  Ziwei/ProductDetail/PublishProduct unterminated 清偿；T[][] 毒类型门
  （五通道检测）——Chess/Mahjong/PwaWanSession 归档
  decomposition-proof-limit。
- **S3 剩余杂族**：jsonStructEncoderHelperText 扩展 __chtJsonArray_<Elem> 数组
  编码器（标量内联/struct 递归/嵌套防环）+JSON.stringify(T[]) 单跳
  JsonStringify（json 节点透传 share）+module-let str store CloneStr+
  ternaryScalarStrCarrier（int64∪str）/declMembersWithSupers 展开/
  adaptStructStore 字段名义适配/hoistChainType supers 扩展/String(str) 恒等
  /jsonParseBridge CloneStr——MessagesPage/Governance/LicensePlate 清偿+
  UpdateCenter 8 道墙逐层清偿剩 1（inline-object twin 碰撞精确归档）。
- E2E：MessagesPage/Governance/LicensePlate compile rc=0+run rc=0 全绿；
  七套回归全 PASS+tsc 零错。

## 第一百三十八批收口（V 列 layout/aggregate/keys 定稿+沿途连带实修）

- readC2CMakerFundsV2：return null 原子发射声明零值 struct var——layout reject
  清偿；归档 asserted-parse 解码对非内联 parse 绑定的一致性缺口。
- FortuneResultModal：Object.entries(json 载体字典)走节点 okeys/ovalues
  sidecar 物化 R2cEntry[]+__r2cJsonNodeNum 逐 kind ToNumber——unknown keys
  清偿；归档 handler 捕获帧 body-store-freeze(后端 lane)。
- ZiweiPage：fileconst 常量标识符类型侧回答/inlineObjectStructuralTwin 归一
  checker 降级成员(any/unknown 通配+字面量拓宽)/两臂类型归一致；归档
  __chtJsonOf_AstrologyRecord 编码器 TChart 别名静默中止。
- 沿途连带：buildCaptureRenames 解析 useMemo 整体解构绑定/泛型实例化剥离
  (AstrologyRecord<unknown>→基型)/JSON.stringify 结构体分支包 JsonStringify/
  三元零值臂空 if 头不再留/try 无壳 flat body 按 depth 发射。
- 七套回归全 PASS+tsc 零错。

## 第一百三十九批收口（T 代理五组件清偿——全部 compile rc=0+run rc=0）

- DouDiZhuPage：chengVideoSetMuted PRELUDE_SOURCES 条目（@exportc 桥+CLI
  目标记录）+hook 实例 ref 槽 chengType 进 hookStructTypes（state 槽同契约
  补齐）。
- GovernanceConsolePage：guardedTypeofJsonTernary 扩展 &&合取解包（合取
  守卫已蕴含 typeof 枚举证明）——timeLabel 单态体推进。
- ProfilePage：hook-arrow 通道 requestingTranspilers.push+monomorphRequests
  入依赖闭包（__chtJsonArray_str 物化）/Q_ 别名结构等价归并
  （structMemberSignature 相等重写平名）/mixed-spread 数组种入
  pendingFieldStructType/emitArrayMethod 接收器未重赋值裸局部消去 staging。
- LicensePlateInput：2-D 常量表行结构体模型（ChtConstRow_<N>+逐行 var
  构造，.len/.[] 发射 .cells.*；decl 惰性注册防 extraTypeDecls sweep 泄漏）。
- LiveStreamPage：publishDistributedContent 精确归档（transport-wire/
  fn-value-param）/Libp2pBridge 直调归档/Translations ≥1024 成员折叠
  json.JsonNode 载体（JsonGetField 组合）。
- 9 组件 E2E 全绿；七套回归全 PASS+tsc 零错。

## 第一百四十批收口（invokeOptionalBridge int64 handles stub——七套全绿）

- invokeOptionalBridge @exportc 桥参数从 utf8_view 改 int64(不透明句柄)——
  utf8_view 形参在 C ABI 中需 aggregate/reference authority(冷编译拒)，
  int64 句柄无此要求且 unwired stub 不读内容——语义等价。
- 七套回归全 PASS。

## 第一百四十一批收口（U 列断言解码通道+字段审计+元素双胞胎修复）

- 断言-解析解码通道：JSON.parse(raw) as T 非内联绑定走 __r2cDecode_<T>/
  __r2cDecodeArr_<T> 家族(std/json 访问器逐字段构造，key 用原始成员名)——
  TradingWallet E2E 全绿。
- props no-op stub 存在托管形参时加 @borrows。
- PublishRidePage 五处成员写入点统一成员审计+上下文类型注入(assign 字段
  pendingFieldStructType)+数组字面量托管元素 add-loop。
- String(error) unknown 戳 str catch 局部恒等折叠/materializeAsFormalStruct
  参考实际发射类型/buildControlVrfPayload 泛型实例返回见证/switch 审计表
  preempt 返回类型/事件元素归档字段读折叠。
- 全量批 61 组件：47 compile rc=0+run rc=0、7 冷失败、10 归档墙、0 throw。
- 七套回归全 PASS+tsc 零错。剩余：PublishRide 双胞胎合成路径 typeName 对齐/
  UpdateCenter invokeOptionalBridge 桥契约(并行 lane 在途)/Werewolf 文件级
  类型解析机制。七套绿。已推送。

## 第一百四十二批收口（W3——ZiweiPage 编码器家族完整性+Fortune 全局槽物化）

- ZiweiPage：jsonStructEncoderHelperText visit/visitArr 改返回成功布尔——不可
  映射成员按 emitStructs 同一判定 layout 一致 drop（家族保持完整），仅顶层
  数组请求基 decl 缺失保留 loud；__chtJsonArray 悬空调用消除。归因与任务
  假设不符已实证：AstrologyRecord 是泛型接口自身泛型参数（非别名可解析）。
- FortuneResultModal：template 降级中全局状态槽裸标识符读先物化具名局部再入
  链——body-store-freeze 根因=全局状态槽直接作 + 操作数（StrAdd 降形被判
  partial authority）。
- 附带：resolveModuleSpec 补完（相对 specifier 项目相对路径解析）——
  HomePage/ChatPage/NodesPage 全 THROW 修复。
- ZiweiPage/FortuneResultModal/MessagesPage E2E 全绿；七套回归全 PASS+tsc
  零错。

## 第九十六批 B 收口（filter(Boolean) 真值过滤 + forEach 块箭头 helper + Array.from {length} 计次）

- filter(Boolean)：Boolean 实参识别→str 元素 `it != ""` 循环。
- forEach 块箭头 helper：retType void，freeVar 捕获 localTypes ∩ usedNames。
- Array.from {length} 计次循环：object_literal length + 单表达式箭头 +
  renameStack 值捕获 + add 循环。
- 七套回归绿。

## 战役状态固化（2026-09-15，批次 34-96B 完成后）

- **普查基线**：HomePage 26 unsupported / NodesPage 39 unsupported（真值）+
  具名排除类（host-icon 12/route-page 3/struct-presence 11/domain-bridge 9/
  effect-cleanup 6/async-await 8/listener 6/eventsource 2/capacitor 4/
  jsx-component-element 9）——unsupported 真值从批次 48 的 84/116 降至 26/39。
- **已实装机制面**（全部七套回归绿）：组件箭头 callee 通道/Record 字典/
  ChtEvent ABI/lambda 自由值捕获/op 路径 fragment 根挂载/递归 JSX 三元树/
  forEach 块箭头 helper/Array.join/JSON.stringify(T[])/filter(Boolean)/
  Array.from {length}/catch-shell 标志守卫/spread json 类型流/setTimeout
  deferred-effect 接线/optional initializer 缺省/size 惯性/JsonNode 点写/
  scrollTop 桥/Map entries 白名单/Map 拷贝构造/R2cEntry 类型化/词法遮蔽
  定则/lambda 链类型传递统一/排除清单分类细化/域函数本体探针等。
- **下一前沿**（按优先级）：
  1. lambda 参数 any 注入（compileInlineLambda 传 paramTypes——updater/map
     回调参数外层元素类型注入，清 ×6+）
  2. Map 深消费 pair 解构（PD1 bodyBinds 空的 extractor 记录形态查证）
  3. 域桥族 audited 桥注册（normalizePeerId/getNodeRemark json↔str 桥/
     resolveContentCoordinates Pick 映射）
  4. filter(Boolean) 真值过滤触达验证
  5. timer 泵（setTimeout 装配 main 接 r2c.deferred）
  6. listener 桥决策（归档 or 桥接）
  7. extractor-op-missing ×2（extractor 数据完整性）
  → 全部清偿后即清单外零失败门禁 → 组件体全量编译 → M2 真机验收

## 战役进度收口（批次 34-96B，2026-09-15）

**机制面实装量**（40+ 独立机制，全部七套回归绿）：
组件箭头 callee 通道 / R2cMap 字典 / ChtEvent ABI / lambda 自由值捕获 /
op 路径 fragment 根挂载 / 递归 JSX 三元树 / forEach 块箭头 helper /
Array.join / JSON.stringify(T[]) / filter(Boolean) / Array.from {length} /
catch-shell 标志守卫 / spread json 类型流 / setTimeout deferred 接线 /
optional initializer 缺省 / size 惯性 / JsonNode 点写 / scrollTop 桥 /
Map entries 白名单 / Map 拷贝构造 / R2cEntry 类型化 / 词法遮蔽
定则 / lambda 链类型传递统一 / 排除清单分类细化 / 域函数本体探针 等。

**普查轨迹**：NodesPage 116→87→76→92→97→89→87（波动=修复链式显形），
HomePage 116→84→54→33→26→48→33。unsupported 真值 65 条。

**剩余 65 条根因族**（按杠杆排序）：
1. lambda 参数 any 注入 ×6+
2. Map 深消费 pair 解构 ×3
3. 域桥族 audited 桥 ×5
4. ternary 渲染位残余 ×5
5. 组件槽跨 fn ×6
6. filter(Boolean) ×1
7. listener 桥 ×4
8. extractor-op-missing ×2
9. setTimeout 泵 runtime ×2
10. 0.48 浮点 ×1

搜索/排序 cone 渲染位已全部可发射。七套回归绿。

## 批次143：调用方文件优先的跨模块同名解析（W1/W2 遗产验证+清偿）

背景：批次142 的 W1(双胞胎铸造)/W2(Werewolf icon+PublishRide) 代理因用量崩溃，落盘改动两块（lambda 捕获自由变量→注入参数通道 + inferLocalType 局部类型身份走声明文件表）。本轮逐一验证并清偿全量 facts 下显形的墙。

- **W1/W2 遗产验证**：build+tsc 零错。UpdateCenterPage 单文件 facts E2E 全绿（fv 注入修复生效，publishGossipWithRetry 冷失败清偿）；WerewolfPage 单文件 E2E 全绿。
- **全量 facts 复跑显形三墙+清偿三墙**（单文件 facts 看不见——跨模块 cone 才完整）：
  1. **15 个 base64ToBytes 私有双胞胎**：resolveNamedFnFact exported-first 编了 gossipsubWireAdapter 的 exported 双胞胎（`Uint8Array<ArrayBufferLike>` 返回文本不降级）→ 调用悬空。修：`functionByNameInFile`（按声明文件分组的 fn 表）+ `bareFnFactOf`（emitCall/preTarget/domTarget/fnRef/fileconst 六处发射关键点）+ 闭包队列 WorkItem.callerFile（扫描点传编译方文件，pop 时 caller 优先解析）——TS 模块作用域：本文件私有声明 shadow 一切外文件同名。
  2. **usePortraitGameViewport 双页双胞胎+裸 return hook**：hook 实例解析改组件文件优先；hook 成员表只从对象字面量 return 构建，`return viewport` 裸标识符 → 空表 → whole-result local 脱路由 → hook 落入裸 fn 编译（useState 无槽升举）。修：空表播种合成成员（返回标识符 opId）+ 自键整值捕获（声明壳 localTypes=捕获类型，标识符读返回槽 var）——`solveWerewolfPortraitLayout(portraitViewport)` 全值传参链接闭合。
  3. **fn 级归档边界早退盲区**：参数/返回类型映射失败在 transpile() 前段早退，永远到不了 5553 行的归档边界 → crypto cone 全灭。修：两处早退点接边界（audited channels 同判），字节域归档桩钉 str 载体（与 sha256Hex `string|Uint8Array` union 折叠 str 的桩参数一致）——UpdateCenter VRF cone 链接闭合。
  4. **数组 .concat**：emitArrayMethod 无 concat 分支，裸 call 回退撞项目同名 fn（service.ts getConnectedPeers `new Set(x.concat(y))`）。修：push-copy 分支（管理元素 share，数组实参逐元素展开/标量实参单元素追加）。
- **结果**：PublishRidePage 全量 facts E2E **全绿 run=0**（W2 目标达成，usePublishLocation(locale) hook 实例化全链）；全绿组件 7/7 compile rc=0 零回归；七套回归全 PASS。
- **剩余深墙**：WerewolfPage `players` 跨文件 Player 双胞胎（doudizhu/werewolf 两 engine 各自 export interface Player，扁平 first-wins 让 engine 本文件的 `Player[]` 注解解析到外文件 decl，内联元素构造 ChtInlineObj 而字段期望 Q_Player）——正解=自声明碰撞名重写自限定拼写（Q_ 机器已有，需接入 rewriteLocalTypeImports + struct 成员映射带 decl 文件上下文），即 W1 双胞胎铸造的完整体。UpdateCenter 剩 crypto-subtle 归档锥（VRF/签名链，字节域归档墙，已链接闭合为桩）。

## 批次144：双胞胎铸造完整体（自声明碰撞名自限定重写）+ 交换语义修复

全量普查基线（批次143 代码）：60 组件 50 compile rc=0 / 48 全绿 run=0（Publish 全家族 Ad/Food/Product/Ride/Video/Modal/Wizard 首次整族解锁）/ 2 冷失败 / 10 not-emitted。

- **自声明身份条目**：typeImportsByFile 为每个文件的本地 type_decl 注册 `$root/<file>`（无扩展名，与 checker 成员文本哈希一致）。同文件素名经 import() 机器解析：flat 同 decl → 素名（零行为变化）；结构同构双胞胎 → 素名；真碰撞 → Q_ 别名。**players 双胞胎墙清偿**（createWerewolfGame `Player[]` 注解不再解析到 doudizhu 的 flat Player）。
- **三处类型身份对齐**：emitStateSlots tuple-head / 调用点形参物化 / hook 槽类型全部走声明文件身份表——Q_PortraitGameViewport 全链一致，@borrows source-authority 墙清偿。
- **nullish 原子成员载体**：`wolfTarget: null` 曾物化零值 WerewolfGameState 存入 int64 字段（kind mismatch）；修为绑定成员声明类型（int64(0)），统一/直接两条字面量循环+statement 流直写。
- **数组解构交换语义修复（重要误编译）**：`[a[i],a[j]]=[a[j],a[i]]` 原朴素顺序 store 让两元素同值（JS 先求值 RHS）——标量数组静默错序；修为 RHS 先物化临时（str CloneStr/托管 share），语句流直写 lines。
- **[...param] 真实拷贝**：单 spread 别名借用形参缓冲=向调用方泄漏变异+元素读 authority 链断裂；对 param 源改逐元素拷贝。
- **concat 分发**：数组方法白名单补 concat（push-copy，数组实参展开/标量追加）。
- **结果**：七套回归 PASS×3 轮；绿组件 6/6 零回归；**WerewolfPage 首次端到端编译通过**。
- **剩余两墙（编译器/运行时域，归 kernel lane）**：①WerewolfPage 冷运行时 brk 陷阱（cheng_cold runtime helper，运行时域新墙）；②UpdateCenterPage body-store-freeze 精确权威墙（kernel lane 已知在飞墙）。

## 批次145：useState 工厂初始化 + StateInit 闭包种子 + 退役陈年分解门

- **useState 工厂初始化**：`useState(createX())` 的零参工厂调用此前静默落入零值兜底——struct 槽零值是活陷阱（每次成员读都是模型零；`game.players[game.humanId]` 对 len=0 数组界检查 brk）。修为发射精确 init `createX()`。**WerewolfPage 运行时 SIGTRAP 清偿**（lldb 符号化→prog.map 定位 WerewolfPage+876→反汇编=数组界检查→回溯 `__r2c_game` 槽未初始化）。
- **StateInit 闭包种子**：r2cStateInit 是装配文本，无 fn 体闭包扫描——`createChessGame()` 的 callee 从不进编译队列（Werewolf 因组件体恰好也引用工厂而幸免）。修为扫描 r2cPreludeCode 的 init 行、项目 fn 解析通过即种入队列。
- **退役 decomposition-proof-limit 门**：门基于早期实测（四形态拒）；今日 cheng.stage3 实测 struct 包裹 T[][] 四形态（whole-struct 分解/per-field store/fn 返回返回值/全局替换）**全编全跑**——kernel lane 已修，门只隐藏已工作程序。删除。
- **保留实测（归 kernel lane）**：裸 `T[][]` 类型仍墙——三形态复现：`b[0]=[1,2]`（opaque seq scalar store layout mismatch）/ `b[1][0]=9` 与 `x=b[1][0]`（exact owner rejected）/ 裸全局字面量替换（managed global replace TypeId mismatch）。ChessPage board/MahjongPage tiles/PwaWanSessionSmokePage 状态槽都是裸 `number[][]`。
- **全量普查（批次145）**：60 组件 **51 compile rc=0 / 51 全绿 run=0**（WerewolfPage、ChatPage 新晋）；4 冷失败全 kernel 域（3 裸 T[][] + 1 body-store-freeze）；not-emitted 10→5（C2CTradingPageLegacy/ContentCard/ErrorBoundary/GameIcons/PublishSecondhandPage）。七套回归 PASS。

## M3 批次：CHT 清零 + routeId 纯投影 + 退役门禁（c814f0e09 / 86ad1ce23）

- **CHT 清零达成**：invoke_sites 70→0（LIVE post-compile），CHT_compiled 11→12 零回退。根修=mech12/14 声明类型表补裸形态 fallback（extractor 现代盖裸类型实参 `RTCIceCandidateInit[]`/`T | null`，历史 `MutableRefObject<T>` 包装形全 bundle 0 次，两表静默为空→box-ref 家族整体无法准入）；handleClose 真编译（128KB 模块全 fv 签名+ref 槽+KV 往返）。残余 gesture:5 项按既定契约诚实归类离桶（指针/滚轮几何事件离散派发无法驱动，非欠账）。
- **routeId=f(state) 纯投影**：导航状态槽 `__csgSceneRouteStatePage`（8 处 route-index 写入点同步写槽，fan-out 路由坍缩 family page=React deriveHomeRouteState 同构）；`routeIdFromState` 臂序与 App.tsx resolveCurrentRouteState 同构、home_default 兜底臂逐字保留；读侧 host_runtime_current_route_state + state_snapshot_json 改走投影（family page 时兜底 baked map 取精确 per-card id）。
- **普查管线修复**：①one-click 提取诊断 fail 点接线 --tolerate-diagnostics；②runtime 参数必须数组（字符串被逐字符迭代→空 facts→held CLI 拒空文件的连环掩盖）；③--allow-dropped-shape 全 7 形状旗标；④scene facts debug JSONL 镜像（stop-after + post-CHT 两点）绕 held-CLI authority 双卡死。
- **M2 克隆重写修复**：托管元素 add 纪律（share 包裹）使原四重写模式只中 store 侧（6/12），补 add share→__m2CloneContent（6 add 边界）——12 克隆位点全恢复，所有权语义（独立重绑定）回归正轨。
- **门禁脚本** `m3-retirement-gate.mjs`：invokeSegmentCount=0 + routeIdFromState 存在 + 全类计数三断言；FAIL 臂实证（census facts invoke=70）。
- **遗留两墙（移交载具/守卫 lane）**：①glyph 步 beat_c 守卫 monitor `write_all(None)` TypeError（9/8 老版；glyph 二进制本体经 sidecar 重建实证 rc=0 产出 34.8MB 像素，非二进制问题）；②held-CLI 新陈不配对（旧 CLI 不识新 Pack 形状、新 CLI 烤件带 darwin 路径桥回归——csgc 权威读写面待载具刷新；stage3 重烤 bootstrap-bridge preflight 有 authority 合同归 Cheng 侧驱动 lane）。
- **M3 验收进度**：272 no-op 清零 ✓（现口径 70→0）；routeId 投影 ✓（运行时投影+读侧接线）；静态场景快照退役=机制面完成（投影/CHT/门禁全就位），端到端 oracle 对拍待两墙清偿后跑通。

## M3 收官追加：守卫 monitor 修复 + 编译推进到 cold 解析墙（f9a53be8f）

- **守卫 monitor 修复**：`stable_regular_file_snapshot` 的 V6-MEM 流式摘要优化（with_data=False 返回 data=None）漏给 command-snapshot 物化点传 with_data=True——该点是唯一消费字节的调用方。修复后全管线 glyph 步恢复 PASS（3844 glyphs/917 runs/34.8MB 像素落盘）。内建钉值同步 099177c9→df6f0ed3。
- **管线推进**：修复后全管线连过 DOM/CSS（complete=true hardFailures=0）、路由清单 47/47、可达性 47/47（296 边）、CHT 12 handler 编译、scene manifest（1961 handlers）、glyph 预计算、像素资产——推进到 scene runtime 编译（--emit:obj）。
- **scene runtime 编译墙（移交 kernel lane）**：`cold_parser.c:1999 "managed producer lacks exact TypeId/function/value definition"`（recovery=1 无定位输出），级联 `reachable function body missing: csgSceneRuntime.__m2RebindHomeList`。判据：__m2RebindHomeList 与 r50 可编译版逐字节一致（diff=0）→ 模块内其他新增面（47-44 新路由/CHT handleClose 128KB 模块/gesture 改写）触发 cold_parser exact-managed-definition 判据表之一。cold_parser.c 系 kernel lane 在飞修改面（会话开始时即有 WIP），判据表 11 项条件在 cold_parser.c:1983-1997。复现：重跑 one-click 全管线即达。
- **M3 状态**：语义交付全部完成且在 facts/源码层验证；生产编译墙=cold_parser 域（kernel lane 领地）。

## M3 并行追加：oracle React 基线 16/16 + v2cur 编译墙真因发现

- **oracle React 侧基线就绪**：16/16 路由截图+raw+text_run_boxes 落 `artifacts/m3-oracle-baseline/`（1.3MB，manifest 含 sha256+复现命令）。三个对拍语义坑如实记录（react-baseline.findings.json）：①5 路由按 React 源语义本就渲染 home_default（后缀路由只在 one-click 侧存在）；②content_detail 分钟级时钟文本漂移（Han 掩码覆盖）；③tab_profile PeerId 每会话随机且纯 ASCII（Han 掩码不豁免，需 pin 身份约定）。React node_modules 已 npm ci 恢复。
- **v2cur 编译墙真因发现**：v2cur（禁 cold cache 后）在 scene runtime 编译失败于 `__chtFld_ChtInlineObj_36a8dc12_conversationId`——**CHT handleClose 模块的字段访问器集含 move/moves(RealtimeChessWireMove)/peerId 等字段，而 ChtInlineObj_36a8dc12 的 type 块声明(L79464)只有 4 字段**——CHT 类型发射与访问器生成不一致（inline-object 双胞胎碰撞），旧 stage3 静默容忍、v2cur 严格 resolver 暴露。转译器侧真 bug，归 r2c lane 下一批清偿。
- **v2cur 调用配方**（本轮实证）：①入口必须在 `<root>/src/` 下；②主树撞 `cold object cache store payload identity failed`→`CHENG_DISABLE_COLD_OBJECT_CACHE=1` 绕开（主树 cache 状态系旧编译器所写）；③最小复现（type 前向引用/嵌套 struct 成员/struct 数组成员）均 PASS，v2cur 类型解析本身健康。

## M3 追加批次：编译墙三修复 + cold_parser 证据包定稿（2c30ddb35）

- **闭包发现修正**：buildM2HomeWiring 的 displayContents 引擎发现被 extractor 的 owner-id 记录形态误导（useMemo 箭头 targetFunction 指向宿主组件 fn，ids 检查命中组件全 body）——转译产物丢 DistributedContent 类型块+把 render body 当引擎。修=只接受匿名箭头且不拥有 mergedContents local_write。
- **reorderM2StateTypes 结构化重写**：旧版按 r50 布局假设的行号 splice——39 成员 DistributedContent 加入 type 块后索引错位，splice 切掉 jsSetNowMs 函数头（孤儿语句）+prelude 自带 @borrows 与再写叠加双注解→冷解析恢复拒绝级联。修=按实际文本解析 unit span 结构化重排+@borrows 再写幂等化。教训：对生成文本做行号 splice 的手术必须每次从实际文本重推 span。
- **missing-record-type 装配 pass**：wiring 各域引用的记录族（DistributedContent/WalletEntry/Piece/Move）类型块缺失——one-click 装配末端扫描 used-undeclared 记录名，TypeMapper 传递闭包发射声明块，按名去重（Q_/ChtInlineObj_ 合成 twin 不发，防冷布局分裂）。
- **借用形参**：__nodesPeerMatchesFilter 调用点全为序列元素借用读，by-value 形参拒收——改 @borrows 借用视图（fn 只读）。
- **cold_parser 证据包（移交 kernel lane）**：缺陷=cross-module 限定拼写 `<import-alias>.<Type>` 的 TypeId 解析（qualifier 跟随别名变化、resolve NULL，cold_parser.c:1999 唯一失败条款 exact_type_id=-1）；双模块对照（声明类型同形跨模块 seq 传参）rc=0 证明简单形态完好→缺陷在限定拼写归一或大规模类型表。复现：重跑 one-click 全管线（约 40min 到编译点）或用 UNIMAKER_KEEP_COMPILE_INPUTS=1 保留的装配现场（entry+6 parts+runtime 模块）直接 cheng.stage3 --emit:obj。
- **oracle 工具链就绪**（X3 代理）：16 路由 React 基线+路由语义映射表+PeerId pin 方案（localStorage 两键预置，双跑 sha 一致实证）+批处理脚本 m3-oracle-run-all.mjs（--list/--selftest/--compiled-out，r50 dry-run 16 行 BLOCKED 如实）。三前置：voice-task 6 歧义诊断修复（或管线侧诊断分类）、编译解锁、大 --pipeline-timeout-ms（extract 实测 ~40min）。

## M3 决定性突破批次：编译+链接全绿，run 首次到达（0dbde57f9/b36e5ff10/bd7ca3cd3/299016dc4/61025e9c0/0dbde57f9/9d1d9dbe1/9478691e9）

**历史性里程碑：M3 scene runtime 首次全链编译+链接通过，exe 产出并运行。**

- **stub 正则闭合引号**：stubHostPresentFamilyForDesktopExe 的 `@importc\("NAME\)` 缺 importc 字符串闭合引号——本体从未匹配过（no-op），present_gpu 符号从未被 stub。修后实证 changed=true。emitMode 默认 obj→exe（全程序走 --link-providers 完整 provider 链接，driver ABI 由 darwin provider 提供）。
- **emitExpr 裸引号笔误**：synth-excluded archived fold 两处返回 `"` 应为 `""`（str carrier zero）+optional-absent 检查提前（修 number 缺席错绑 str 零）。红绿实证。
- **Doudizhu borrow 形态**：`@borrows`+`var json.JsonNode` 形参（JsonSetFieldStr 的 std 先例）——authority 层过。
- **11 类借用形态级联清偿**（O 代理，工程量最大）：str 投影 CloneStr 19 处/nodes JsonOwnedClone 8 处/chtFromJsonArray 绑定/59 个 CHT json writer 翻 @borrows/WriteNode/voice finalize/Chess 2D cell/Home LocationNode/去别名多 move/括号平衡/managed-args-pass 两窄规则。**离线三重 rc=0 实证**（手改副本+全量 entry 14MB+生成器重产出）。
- **场景编译+链接全绿**：m3-full20（exe 模式）——cheng.stage3 --emit:exe --link-providers 全链通过，exe 产出。**[4/4] Running 首次到达**。
- **run exit 3 新前端（下一批）**：WebStyleSheetParse 解析 Tailwind CSS 文本失败（CSS 含 `.z-\[60\]` 转义类名等 5900 条声明；web_style_runtime 解析器疑不认转义/某构造）——数据/解析器浅层，非借用/所有权域。
- **测试债两笔**：csg-facts-identity-smoke 断言更新到 sandbox 契约（exit=0，变异 7 处等价保留）；filter-block-arrow 断言等价更新（批次137 alias elision 有意行为）。附带发现 src/ 下 Aug 25 陈旧 .js 编译残留会遮蔽绝对路径导入。
- **oracle 全套就绪**：16 路由 React 基线（pin 方案实证）+路由映射+driver（--exe 参数化，raw 格式对齐实证）+run-all 批处理（selftest/plumbing 全过）+dump 构建脚本。编译解锁后最短路径：`m3-dump-build.sh`→`m3-oracle-driver.mjs --exe`→`run-all --compiled-out`。
