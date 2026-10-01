# ESP-Mosaico 纯 Cheng SDK

> 版本 2026-08-24 · 面向乐鑫《esp-dev-kits》ESP32-S31 分册（Release master，2026-08-21）第 3 章 ESP-Mosaico V1.0 与 `cheng-unimaker-mosaico-business-plan.md`。
>
> 本 SDK 是纯 Cheng 源码包：公开表面零指针、零 C、零 Mock。唯一例外是 `hal.cheng` 的 `@importc` 声明边界——那是给 P4 阶段乐鑫 BSP shim 层的契约，宿主测试从不链接它。

## 已验证事实（本仓当前官方口径）

- 门禁：`bash tools/mosaico_sdk_gate.sh` → `mosaico_sdk_gate=PASS`（9/9：7 个测试程序 + hal 对象出码 + esp32s31 对象 ISA 合法性；驱动为现烤 `bootstrap/cheng_cold.c`，sha256 打进门禁输出，门禁内强制禁用冷对象缓存——缓存键不随编译器二进制失效，不禁会把陈旧对象当成当前结果）。
- 测试形态：全部数值世界（无 str/echo），退出码即失败位图，门禁逐项解码。字符串/echo 路径在当前冷编译器上属于 runtime provider 红（allocation ledger 函数体未过），SDK 刻意避开。
- esp32s31 出码：全部 15 个 SDK 模块可产出 ELF32 RISC-V 对象（e_machine=243、e_flags=0x3）。2026-08-24 修复 `bootstrap/rv64_emit.h` 四处机器字编码缺陷（LUI/AUIPC 的 U 型立即数被右移 12 位；DIV/REM/DIVW/REMW 的 funct3/funct7 违反 M 扩展规范，其中有符号 DIV 曾被编成无符号 DIVU；RV64 LWU 被编成 LD）后，`riscv_elf_isa_check.py --forbid-rv64-only` 全部通过，并纳入门禁硬性判定。

## 模块地图（src/mosaico/）

| 模块 | 内容 | 数据来源 |
|---|---|---|
| board.cheng | 全部管脚/I2C 地址/电平极性常量 | 乐鑫分册第 3 章管脚表与地址表 |
| frame.cheng | 定长字节帧原语（长度经返回值链式传递） | 编译器已验证表面 |
| events.cheng | 事件类型 + 有界丢弃最旧队列（打包 int32 槽位） | 计划 §9 事件纪律 |
| input.cheng | GPIO7 按键消抖状态机 + LED(GPIO3 低有效)/马达(GPIO8 高有效) 电平策略 | 分册 + 计划 §三 |
| bmi270.cheng | 六轴：初始化序列构建、加速度解析(±2g, mg≈raw*61/1000)、摇一摇检测器 | I2C 0x69 / INT GPIO2；寄存器值 Bosch 手册，P4 上机复核 |
| bmm150x2.cheng | 双磁力计(0x11/0x12)：初始化、13bit 原始解析、对碰检测（双传感器窗口内一致才触发，持续磁场拒判） | 计划 §四/§十六 |
| cst9220.cheng | 触摸(0x5A, INT GPIO6)：包解析 + 点击判定策略（纯函数） | 社区文档布局，P4 复核 |
| es8311.cheng | 音频 codec(0x19)：录音/放音初始化序列、静音帧、上电顺序策略(GPIO56 rail → I2C → GPIO45 PA) | 分册电源树 |
| co5300.cheng | QSPI AMOLED 唤醒序列、窗口寻址、条纹 tile 生成器（信物印） | AMOLED 家族命令约定，P4 复核 |
| bq27220.cheng | 电量计(0x55)：电压/电流/SOC/温度 BE 寄存器解析 | TI BQ27220 TRM |
| slots.cheng | 左右磁吸槽扫描计划(GPIO14 低选左 0x50/GPIO39 高选右 0x51)、白名单、I2S/DVP/EEPROM 资源互斥 | 分册复用表（硬约束写进代码） |
| power.cheng | VCC_3V3(GPIO60 低有效)软启动机、关机请求(GPIO57 开漏低) | 分册电源说明 |
| publish.cheng | UniMaker 事件信封（'CHNG' magic + kind + nonce + ts + CRC32 IEEE 反射，含 "123456789"→0xCBF43926 已知答案测试） | 计划技术架构 §3 |
| app_v0.cheng | V0 四步流程纯状态机：Idle→Recording→Confirming→Publishing→ReceiptWait；触摸确认门禁防误发；二次摇动取消 | 计划 §三/§十六 |
| hal.cheng | BSP shim 契约：gpio/i2c/wait_event/time/abort（仅声明，obj 出码验证过） | P4 ESP-IDF 侧待实现 |

测试（src/tests/mosaico_t_*.cheng）：frame_board / events_input / bmi270 / bmm150_cst9220 / devs2(es8311+co5300+bq27220) / app(slots+power+publish) / appflow(V0 四步场景)。

## 当前编译器表面规则（写新模块前必读）

这些不是风格建议，是当前冷编译器 admission 的实测边界，全部有探针证据：

1. 缓冲区一律调用方持有定长数组 + **长度经返回值链式传递**（`n = Put(buf, n, x)`）。两个串行调用共享同一个 `var int32` 实参会触发 read-edge admission 红。
2. 循环体内禁止带 var 参数的函数调用（含缓冲区转发）；循环只做直写下标操作。
3. builder 用「局部数组直写 + 一次拷贝循环」模式；把调用方缓冲区跨函数转发再链式写会静默丢写（实测 a[0] 读回 0）。
4. 状态机写成纯标量函数，状态打包进 int32；不要用 enum/case/match-return（case 只吃 int32 且 match 臂内 return 触发 body-store-freeze 红）。
5. 无字符串、无动态序列跨调用、无模块级 const 数组（函数体内不可见）、无一元 `~`（用减法清位）。
6. 测试不用 std/system（runtime provider ledger 当前红）；标记走退出码位图。

以上每条都会随后端 lane 推进而失效；失效时以 `tools/mosaico_sdk_gate.sh` 为准重新校准，不要凭旧记忆写代码。

## 边界与诚实声明

- 未上真机。所有寄存器魔数除乐鑫分册直接给出的（管脚/地址/极性）外均标注了来源与 P4/P2 复核要求。
- BMI270/BMM150/CST9220/CO5300/ES8311 的寄存器级常量来自厂商手册的社区整理版本，P4 bring-up 必须逐条对照芯片实物确认。
- 功耗数字一个都没有写进代码——计划 P5 明确禁止在实测前做任何 runtime claim。
- esp32s31 ISA 合法性已修复并进硬性门禁；后续新增模块必须过同一检查。
