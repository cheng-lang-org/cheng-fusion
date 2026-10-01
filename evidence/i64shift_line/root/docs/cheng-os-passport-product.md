# Cheng OS 护照产品合同

权威：本文件。硬件评估板是 FOLOTOY AI Passport（ESP32-C3FH8X）。对外产品名是 Cheng OS 护照，不是官方 GAME/IMAGE/Token，也不是「换官方小游戏」。

本轮落地：`src/cheng_os/passport/` 能力核 + computer use syscall + `tools/cheng_os_passport_gate.sh`。P3–P5 只在本文记账，不开工。

## 出厂合同（货存在，不是 Cheng OS）

官方「买之前」写死：

- 开箱即用，第一次开机是出厂固件 + **出厂身份卡**。不是 Cheng DID，不是 Cheng OS。
- 改名字 / 头像 / 图片：微信小程序走蓝牙。Cheng OS 不准把微信写成系统设置或身份源。
- 装完整固件、换玩法：Windows 或 macOS，Chrome / Edge **Web Serial**，USB。Cheng 换核只走这条，不另发明安装器当第一路径。
- 刷挂了：进 Bootloader 救回官方固件。真机试 Cheng 镜像前必须先证明能救砖。
- 四种出厂玩法以官网为准。Cheng OS 是整核替换，不是第五个官方玩法皮肤。

两条刷机不能混：

- [换官方小游戏](https://ai-passport.folotoy.cn/guides/flash-official-firmware/)：只换内容，**身份卡保留**。禁止当成本产品。
- [本地固件工具](https://ai-passport.folotoy.cn/tools/web-flasher/)：写入本地 `.bin`。这才是整包换核。[FoloToy/ai-passport](https://github.com/FoloToy/ai-passport) 是 MIT，`idf.py set-target esp32c3`。

货态 → Web Serial 整包换核 → Cheng 态。没换核就没有本产品。第一代可闪镜像 = ESP-IDF 引导 + 官方 BSP 金属层 + Cheng 能力核当 app。禁止声称纯 Cheng 从零吐出可启动盘。

## 硬件即 OS 能力

每项公开硬件必须同时有 syscall、effect、nonce 回执。缺回执不准对外讲。测试：`src/tests/cheng_os_passport_caps_smoke.cheng`。

| 硬件 | cap id | syscall | effect | 回执字段 |
|---|---|---|---|---|
| C3 + 8MB Flash | `CapKernel=1` | `SysTick` | `EffIdentityPrint` | envelope CRC + nonce |
| 三键 | `CapKeys=2` | `SysKey1Down/Up` `SysKey2Down/Up` `SysKey3Down/Up` | `EffConfirmPrompt` | kind + nonce |
| 麦 | `CapAudioIn=3` | `SysVoiceEnd` | （出带长度，本机不算 ASR） | payloadLen |
| 喇叭 | `CapAudioOut=4` | — | `EffTone` | tone command CRC |
| 240×320 | `CapDisplay=5` | — | `EffIdentityPrint` `EffConfirmPrompt` `EffReceipt` `EffStepTitle` | cmd kind |
| Wi-Fi | `CapWifi=6` | （会话打开，P3 接线） | 上行 event / 下行 command | dir + nonce |
| BLE | `CapBle=7` | 近场配对算力点（换核后不准走微信） | 同上 | dir + nonce |
| 被动 NFC | `CapNfc=8` | `SysNfcTap` | — | nonce 对齐；V0 由对等点读 NDEF |
| USB-C | `CapUsb=9` | Web Serial 换核 | — | 官方 flasher 校验 |
| 500 mAh | `CapPower=10` | `SysBattery` | — | battery 槽；P5 前不准写续航小时 |

只承认 [FoloToy/ai-passport](https://github.com/FoloToy/ai-passport) 已列 BSP。不得从 C3 规格表臆造未列入接口。Mosaico 摇一摇/对碰/磁吸槽不存在。

## CHNG v2 信封

新建 `src/cheng_os/passport/wire.cheng`，不改 `src/mosaico/publish.cheng`。

```
0..3   'C''H''N''G'
4      version = 2
5      dir：0 上行 syscall 事件 / 1 下行 effect
6      kind
7..10  nonce（LE）
11..14 timestamp ms 低字（LE）
15..18 payloadLen（LE）
19..22 CRC32 IEEE 反射，覆盖 [0..19)
```

共 23 字节。CRC 算法与 mosaico 相同；已知答案 `"123456789" → 0xCBF43926`。dir 不是 0/1、CRC 错、nonce 错配一律 hard-fail。测试：`src/tests/cheng_os_passport_caps_smoke.cheng`（wire 段）。

## 五环与状态机

护照是 OS 节点。手机/电脑是被操作的外设和算力对等点，不是 OS。

1. 身份环：Cheng 态上电亮 Cheng 身份印；拍卡 nonce 与屏上一致。出厂身份卡换核后作废。
2. 意图环：三键或按住说话。护照只出录音结束 + 长度。
3. 执行环：`computer_use` 是 OS syscall。对等点走现成 `WebSceneComputerUseAdmit` / Apply / `gui_replay`。
4. 确认环：`external-publish` / `payment` 必须 `SysKey3` 或 `SysNfcTap`。对等点不能代点。
5. 回执环：Admit/Apply 成功后下行 `EffReceipt` + `EffTone`。双端同一 nonce + CRC。

状态：`Idle → IntentArmed → Confirming → ExecWait → ReceiptShown`。下行 `EffConfirmPrompt` 可从 Idle 直接进入 Confirming。测试：`src/tests/cheng_os_passport_kernel_smoke.cheng`。

## 15 秒剧本

真机：货态能开机 → Web Serial 整包换核（失败则 Bootloader 救回）→ 下面五步。无真机：同一语义走 `src/tests/cheng_os_passport_computer_use_smoke.cheng`。

1. Cheng 态身份印，不是出厂身份卡，也不是四种官方玩法。
2. 键或 `SysVoiceEnd` 进入确认。
3. 对等点对可见 computer use 做 Admit（例：`external-publish`）。
4. `SysKey3` 或 `SysNfcTap` 后才能 Admit(confirmed=true)。
5. 下行 `EffReceipt`，核进 `ReceiptShown`，双端 nonce 一致。

## 禁止项

- 把出厂即用、出厂身份卡、微信改皮、换官方小游戏写成 Cheng OS。
- 用微信小程序当 Cheng 系统设置或身份源。
- 把完整编译器或 UniMaker 整机塞进 C3。
- 抄 Mosaico 管脚；改 mosaico 信封源；碰 op-lane 热文件。
- mock Apply、stub CID、用截图当回执。
- P5 前写续航小时。声称纯 Cheng 可启动盘。
- 新 worktree；裸 `/tmp` 树不绑任务生命周期。

## 阶段

- P0 本文 + `task_plan.md` 战役条。
- P1 `src/cheng_os/passport/{caps,wire,syscall,effect,kernel,hal}.cheng`。
- P2 `computer_use.cheng` + computer-use smoke；确认前不得 Admit 通过。
- P3 对等点 SABI（未开工）。
- P4 C3 `riscv32imc` 出码，禁套 `esp32s31` 浮点 ABI（未开工）。
- P5 真机整包换核 + 15 秒实拍（未开工）。
