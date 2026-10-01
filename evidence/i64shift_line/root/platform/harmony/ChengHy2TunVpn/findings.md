# Findings

## 2026-06-09 Harmony global PAC requires system permission

repro=Add `ohos.permission.SET_PAC_URL` then install the HAP on the connected Harmony device.
actual=Install fails with permission grant failure for `ohos.permission.SET_PAC_URL`; `vpnExtension.VpnConfig` has no HTTP proxy/PAC field.
impact=Global TUN can be shipped for ordinary app signing; global PAC cannot be made production-ready without privileged/system or enterprise permission.
next=Keep PAC hard-fail for this signing profile. Re-enable only after a signing profile grants `SET_PAC_URL`, then call `connection.setPacFileUrl()` against the Cheng local proxy listener.
