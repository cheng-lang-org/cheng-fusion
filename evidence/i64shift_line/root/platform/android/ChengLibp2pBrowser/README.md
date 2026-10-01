# Cheng libp2p Browser (Android)

左边是系统 WebView（常规浏览器）。网页 `onPageFinished` 之后才打开右边：纯 Cheng 1:1 元素/样式/事件编译，paint op 经 GLES 上屏。

右边输入框和跳转经 `cheng/apps/libp2p_browser/sync_protocol` 发给已连接并指定的手机节点。

## 接线

1. 用 `artifacts/bootstrap/cheng.stage3` 把 `src/apps/libp2p_browser/host_abi.cheng` 编成 `aarch64-linux-android` 对象。
2. NDK 把该对象与 `cheng_libp2p_browser_jni.cpp` 链成 `libcheng_libp2p_browser.so`。
3. 安装本模块 APK。桌面端在「指定手机节点」填本机 Cheng peer id。

引擎门禁（不依赖真机）：

```
bash tools/libp2p_browser_gate.sh
```
