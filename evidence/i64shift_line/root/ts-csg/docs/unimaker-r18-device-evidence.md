# UniMaker r18 device evidence

Round 14 verified the r18 retained mobile APK and the same `libcheng_unimaker_scene.so`
runtime with two new device probes.

## Social bootstrap + GUI render (APK)

`UNIMAKER_APK_VERSION_CODE=1800000022`, package `org.cheng.unimaker.scene`.

Evidence file: `src/.gen/oneclick-r12-computer-use/r18-final-device.log`

```text
Libp2pNative: init: success handle=1
Libp2pNative: getLocalPeerId: resultLen=52
cheng-mobile-shell: scene data asset read ok bytes=21962243 crc32=4b4da271
cheng-mobile-shell: native_create init_done app_status=0
cheng-mobile-shell: present_compositor frame=1 layers=2 commands=83
cheng-mobile-shell: present_media_surface ready commands=2 video=2
```

No `load_library_failed`, no `social_backend_bootstrap_bypassed`, and no
`No implementation found` JNI errors in the final build.

The group-create backend is now built by the APK script itself from
`src/libp2p/mobile_ffi/unimaker_android_social_group_backend.cheng` using the
normal `artifacts/bootstrap/cheng.stage3` compiler, then linked against the
scene runtime provider and generated host provider. It initializes in-process
and returns the device-stable peer id instead of the previous Nim backend
`libp2p_node_init` hang.

## Video OpenAsset / Play (headless, same runtime)

```text
media_control_sequence slot=unimaker.truth.video.slot.0.104
  open=1 play=1
  open_latency_ms=0 play_latency_ms=0 total_latency_ms=0
receipt[0] action=OpenAsset status=1 state=1
receipt[1] action=Play      status=1 state=2
```

The latency instrumentation is in `ts-csg/scripts/unimaker-capture-main.c`
(`CHENG_CAPTURE_MEDIA_OPEN_PLAY`).

## Full-scenario Xiaoyou computer-use replay

Probe source: `ts-csg/scripts/unimaker-cu-replay-probe.c`

Evidence file: `src/.gen/oneclick-r12-computer-use/r18-computer-use-replay.log`

```text
manifest_ready=1 action_count=633 template_count=8 step_count=24 coverage=100
...
ALL_COMPUTER_USE_REPLAY_OK=1
```

All eight voice-task templates compile, step counts match, every step applies,
and every replay exits with `replay_status=2`:

- publish_short_video_draft      4/4 steps
- publish_ad_video_draft         4/4 steps
- authorized_product_publish_draft 5/5 steps
- purchase_assist_review         3/3 steps
- content_search_review          1/1 step
- feed_filter_review             4/4 steps
- content_like_review            1/1 step
- message_history_browse_review  2/2 steps

## Video card tap -> OpenAsset/Play (headless, patched r18 feed-card interceptor)

`UNIMAKER_APK_VERSION_CODE=1800000023` build succeeded. The same runtime .so was
pushed to the headless bundle and the first video card was hit at logical
(97,566):

```text
pre_tap_box node=105 x=8 y=502 w=179 h=128 target=101
post_tap_event hit_node=101 hit_status=1 apply_status=1
post_tap_media_receipt[0] action=OpenAsset status=1 state=1
post_tap_media_receipt[1] action=Play      status=1 state=2
```

Evidence: `src/.gen/oneclick-r12-computer-use/r18-video-card-tap.log`

## Still open

- Install `1800000023` on the device (blocked this round by the rebooted device\n  PIN-lock; `pm install` returns `INSTALL_FAILED_ABORTED: User rejected permissions`)\n  and then capture APK UI tap → `host_video_texture_ready=1` first-frame timing.
- Harmony HAP build/run.
