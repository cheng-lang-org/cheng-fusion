This legacy prebuilt directory is disabled in Gradle.
Android now builds libcheng_hy2_tun_core.so from Cheng source through CMake.

Required Cheng core ABI symbols:

- cheng_hy2_tun_core_start
- cheng_hy2_tun_core_stop
- cheng_hy2_tun_core_status

The JNI adapter forwards protect(fd) to Android VpnService.protect. The Cheng core must call protect_fd before connecting sockets that must bypass the VPN route.
