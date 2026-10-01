# 纯 Cheng 捕鱼规划进度

2026-09-05：用户要求制定纯 Cheng 开发计划。

- 完成相关 lessons、正式规范和现有引擎计划审阅。
- 完成三路只读审计：图形/音频/输入、模拟/联网/存储、纯 Cheng/平台 ABI。
- 确认现有移动壳会生成其他语言代码；严格纯 Cheng 需要单独打通平台与 shader。
- 确认旧 ECS 文档过时；按64槽源码、8槽输入和实际碰撞/传输行为制定补齐任务。
- 当前交付状态：完成产品提案、19项开发任务、流程图及三文件；OpenSpec 保持 `propose`。
- 文档Review已完成并修正：shader真实前端入口、单机存储前置、触摸/权威反馈口径、RoomKey、重连幂等键、恢复时钟、全房间连续碰撞事件排序。
- 文档检查通过：19任务身份唯一、依赖节点存在、E2先于D4、相关文档存在、代码围栏闭合、无行尾空白；`git diff --check`通过。本轮仅文档验证，不计软件门禁通过。
- 未做：游戏实现、编译器修改、测试执行、真机安装、性能测量、分支/worktree、发布。

2026-09-05（晚）：用户指示实施（A1 基线组先行），并明确：纯 Cheng 编译器为权威入口，不用 C 链编译器；DoD/SoA/Arena/ORC；指针类型/操作不进公开面。

- 现场核实编译入口与三支载具；确认 `./cheng` 主对象代码生成当前委托 C 车头（C 车头×HEAD 双载体格局），纯链自举重烤归 kernel-userpath 战役热区，本役不覆盖共享载具。
- 六既有 smoke 当日矩阵：6/6 编译层阻断（W-A1-1 跨模块 @borrows 准入、W-A1-2 staging PathDirExists 假阴、W-A1-4 SIGILL）；全部有最小复现探针。
- 规范侧迁移落地：冗余默认初始化 8 处、29 个只读函数 @borrows 注解、借用源显式共享改 Fmt 拷贝、篡改用例改 @borrows 字段克隆——全部按规范 §0.2/§594 与现行契约，无业务层绕过。
- 站点修：compiler_main.cheng staging 假阴两处改 os 直调（同 GateBootstrapBridge 先例；根因台账已注记）。
- 交付：capabilities.json、fishing_platform_contract.cheng、fishing_gate.cheng（baseline 全实现+其余阶段硬失败）、fixtures 18 支、VERIFY_a1.md、VERIFY_a1_matrix.txt。
- 设备实际回读：HUAWEI DCO-AL00 / Android 12 / arm64-v8a / Vulkan 1.2.0 / Adreno 730；双验收机冻结未完成。
- A1 done 未达（smoke 未绿、门禁自测未跑）；未填任何 PASS。下一步在编译器链两族墙清偿（kernel-userpath 阶梯）+ 自举重烤后，重跑门禁 baseline 至全绿，再进 B 组。

2026-09-05（深夜）：W-A1-1 反转定谳 + 门禁基建收敛。

- 跨模块 @borrows "编译器缺口"反转：系他线烤机窗口内三文件注解被树操作剥除；重注解后 C 链 7/7（六 smoke+合同）compile/run 双零，p7 全绿，import merge 旗标到位。
- 门禁迁 src/tools/（cold 包根约束），契约修复四项（WriteFile void 回读校验、ListDir 归一、ExtractFilename move、精确长度切片避 CloneStrRange 溢出），负例组改已证形态（neg2/neg3/neg4；neg1_ptr 留档待 no-pointer 策略层）。
- baseline 全流程 C 链预验证：9 过 1 失（唯一失=neg4，[cheng_seed] 在 .cheng parser 层，纯链载具即拒）——门禁基建可用。
- 干净参照载具：现烤 C 链 7259fc95caa60b66。
- 待他线 fp_D2（纯链自举载具，烤机 60min+ 进行中，监视器挂中）落地后：run_fp_d2_validation.sh 一键 7 测试直跑 + baseline PASS。
