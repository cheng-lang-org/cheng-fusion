import guiHost from 'libcheng_gui_host.so'
import display from '@ohos.display'
import picker from '@ohos.file.picker'
import fs from '@ohos.file.fs'
import hilog from '@ohos.hilog'
import geoLocationManager from '@ohos.geoLocationManager'
import abilityAccessCtrl, { Permissions } from '@ohos.abilityAccessCtrl'
import common from '@ohos.app.ability.common'
import { BusinessError } from '@ohos.base'

const CHENG_FILE_PICKER_LOG_DOMAIN = 0xC0DE
const CHENG_LOCATION_LOG_DOMAIN = 0xC0DE
// OHOS geoLocationManager BusinessError codes (see @ohos.geoLocationManager.d.ts
// getCurrentLocation/getLastLocation @throws tags): 3301200 is the only one of the
// three that maps to a retryable "no fix in time" — 3301000/3301100 (service down /
// switch off) are both surfaced as the same "unavailable, check GPS switch" text
// Android uses for its equivalent unavailable branch.
const CHENG_LOCATION_ERROR_CODE_FAILED_TO_OBTAIN = 3301200
const CHENG_MEDIA_LOG_DOMAIN = 0xC0DE

// #14 NAPI media control dispatch: JSON contract for the media-action requests
// EntryAbility.ets forwards from Want parameters via AppStorage — must stay in sync
// with interface ChengMediaActionRequest in entryability/EntryAbility.ets.
interface ChengMediaActionRequest {
  seq: number;
  slot: string;
  actions: string[];
  payload: string;
}

@Entry
@Component
struct Index {
  private surfaceController: XComponentController = new XComponentController()
  private readonly locationAtManager = abilityAccessCtrl.createAtManager()

  // #14 NAPI media control dispatch: media-action requests arrive from EntryAbility's
  // Want-parameter surface (the OHOS mirror of Android's handleMediaActionIntent Intent
  // extras) through this AppStorage watcher; the guiHost.applyMediaAction call itself
  // lives on this page with the rest of the guiHost wiring (same placement convention
  // as startMediaBlockCache in aboutToAppear). In-app play/pause/seek gestures never
  // pass through ArkTS on this platform — the XComponent dispatches touches natively —
  // so this externally-driven surface is the page's only honest media-action call site.
  @StorageProp('chengMediaActionRequest') @Watch('onChengMediaActionRequest') chengMediaActionRequest: string = ''

  onChengMediaActionRequest(): void {
    this.dispatchChengMediaActionRequest(this.chengMediaActionRequest)
  }

  // Mirrors Android's validateMediaSlotId charset ([a-zA-Z0-9_.-], non-empty), but
  // fail-closed with a log instead of throwing — an invalid EXTERNAL command must not
  // crash the ability.
  private validChengMediaSlotId(value: string): boolean {
    if (value.length === 0) {
      return false
    }
    for (let i = 0; i < value.length; i++) {
      const ch = value.charAt(i)
      const valid = (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9')
        || ch === '_' || ch === '.' || ch === '-'
      if (!valid) {
        return false
      }
    }
    return true
  }

  // Mirrors Android's validateMediaActionKind charset ([a-zA-Z], non-empty).
  private validChengMediaActionKind(value: string): boolean {
    if (value.length === 0) {
      return false
    }
    for (let i = 0; i < value.length; i++) {
      const ch = value.charAt(i)
      const valid = (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z')
      if (!valid) {
        return false
      }
    }
    return true
  }

  private dispatchChengMediaActionRequest(serialized: string): void {
    if (serialized.length === 0) {
      return
    }
    let slot = ''
    let payload = ''
    let actions: string[] = []
    try {
      const request = JSON.parse(serialized) as ChengMediaActionRequest
      slot = request.slot
      payload = request.payload
      actions = request.actions
    } catch (err) {
      hilog.error(CHENG_MEDIA_LOG_DOMAIN, 'ChengGuiDemo', 'media_action_bad_request err=%{public}s', JSON.stringify(err))
      return
    }
    if (!this.validChengMediaSlotId(slot)) {
      hilog.error(CHENG_MEDIA_LOG_DOMAIN, 'ChengGuiDemo', 'media_action_invalid_slot slot=%{public}s', slot)
      return
    }
    for (const action of actions) {
      if (!this.validChengMediaActionKind(action)) {
        hilog.error(CHENG_MEDIA_LOG_DOMAIN, 'ChengGuiDemo', 'media_action_invalid_action action=%{public}s', action)
        return
      }
    }
    // Same multi-action loop shape as Android's handleMediaActionIntent dispatch: each
    // action is forwarded with the shared slot/payload; per-action queued/dropped is
    // logged, not aggregated (the native side logs its own receipt detail line when the
    // render thread drains the mailbox).
    for (const action of actions) {
      const ok = guiHost.applyMediaAction(action, slot, payload) as boolean
      hilog.info(CHENG_MEDIA_LOG_DOMAIN, 'ChengGuiDemo', 'media_action_dispatch slot=%{public}s action=%{public}s ok=%{public}d', slot, action, ok ? 1 : 0)
    }
  }

  aboutToAppear(): void {
    const context = getContext(this)
    // Pass the device's real display density (DPR) so the native host maps the
    // physical XComponent surface to the correct logical viewport — otherwise a
    // hardcoded ratio leaves the scene laid out narrower than the screen (right
    // edge unpainted). Must run before OnSurfaceCreated starts the render loop.
    try {
      const d: display.Display = display.getDefaultDisplaySync()
      guiHost.setDensity(d.densityPixels)
    } catch (err) {
    }
    // Hand the native side the resource manager so it can read scene_data.bin and
    // the runtime payloads from entry/src/main/resources/rawfile.
    guiHost.setResourceManager(context.resourceManager)

    // Startup-period own-content serve: this device's bundled 麦田 asset goes up on
    // an ephemeral MoQ-over-QUIC listener from app launch — no 发布 tap required, so
    // a paired viewer device can dial in as soon as this app is running. Must run
    // after setResourceManager (native extracts the rawfile assets to cache first).
    // Idempotent with the 发布 button's cheng_host_publish (shared start-gate), so
    // this never races or double-binds a later user publish.
    guiHost.startOwnServe()

    // S4 block cache production wiring (video-seek-scrub-blueprint.md §S4): initializes
    // the GOP block cache against the OHOS per-HAP sandbox cache dir (native-side hardcoded
    // path, mirrors startOwnServe's own cache-path constants — no ArkTS path lookup needed
    // on this platform). Idempotent; safe to call alongside startOwnServe every launch.
    guiHost.startMediaBlockCache()

    // #14 NAPI media control dispatch: a cold-start media Want (EntryAbility.onCreate
    // runs before this page exists, so the @Watch above never fires for it) is consumed
    // here for parity with Android's onCreate-time handleMediaActionIntent. The native
    // dispatcher honestly drops it with a log when the host has not begun yet (surface
    // not created at aboutToAppear) — deterministic and visible in hilog, not silent.
    if (this.chengMediaActionRequest.length > 0) {
      this.dispatchChengMediaActionRequest(this.chengMediaActionRequest)
    }

    // Cross-device 秒开 now runs on the native render thread (cheng_gui_host_tick),
    // sequential with the scene tick, to avoid corrupting the single-threaded Cheng
    // runtime from a concurrent pthread.

    // File picker bridge: native (cheng_host_open_file_picker, called on the Cheng
    // render thread) cannot invoke @ohos.file.picker directly — it is ArkTS-only,
    // UIAbility-bound. Register this callback once; native queues requests onto it
    // via a napi_threadsafe_function (cheng_gui_entry.cpp).
    guiHost.registerFilePickerCallback((refName: string, kind: string, resultMode: string, resultStateRef: string) => {
      this.handleFilePickerRequest(refName, kind, resultMode, resultStateRef)
    })

    // GPS location capture bridge: native (cheng_host_capture_location, called on the
    // Cheng render thread) cannot invoke @ohos.geoLocationManager directly — it is
    // Promise-based and ArkTS-only. Register this callback once; native queues
    // requests onto it via a napi_threadsafe_function (cheng_gui_entry.cpp), same
    // wiring as the file picker above.
    guiHost.registerLocationCaptureCallback((timeoutMs: number, maxAgeMs: number, previewRef: string, statusRef: string, messageRef: string) => {
      this.handleLocationCaptureRequest(timeoutMs, maxAgeMs, previewRef, statusRef, messageRef)
    })
  }

  // Opens the OHOS picker matching `kind`, copies the picked file into the app
  // cache as a real sandbox path (cheng_host_publish and the scene's mime-from-
  // extension inference both need a plain filesystem path, not a media:// or
  // docs:// picker URI), then hands the result back to native. Any cancellation
  // or failure delivers an empty localPath — native treats that as an honest
  // no-op (mirrors Android's onActivityResult RESULT_OK-mismatch branch).
  private async handleFilePickerRequest(refName: string, kind: string, resultMode: string, resultStateRef: string): Promise<void> {
    let uris: string[] = []
    try {
      if (kind === 'image' || kind === 'video' || kind === 'image-video') {
        const photoPicker = new picker.PhotoViewPicker(getContext(this))
        const mimeType = kind === 'image' ? picker.PhotoViewMIMETypes.IMAGE_TYPE
          : kind === 'video' ? picker.PhotoViewMIMETypes.VIDEO_TYPE
          : picker.PhotoViewMIMETypes.IMAGE_VIDEO_TYPE
        const result = await photoPicker.select({ MIMEType: mimeType, maxSelectNumber: 1 })
        uris = result.photoUris
      } else if (kind === 'audio') {
        const audioPicker = new picker.AudioViewPicker(getContext(this))
        uris = await audioPicker.select({ maxSelectNumber: 1 })
      } else if (kind === 'text' || kind === 'text-document') {
        const documentPicker = new picker.DocumentViewPicker(getContext(this))
        uris = await documentPicker.select({ fileSuffixFilters: ['文本/PDF/EPUB|txt,pdf,epub'], maxSelectNumber: 1 })
      } else if (kind === 'any') {
        const documentPicker = new picker.DocumentViewPicker(getContext(this))
        uris = await documentPicker.select({ maxSelectNumber: 1 })
      } else {
        // native already validates kind before dispatching here; an unknown kind
        // reaching this branch is a contract bug, not a runtime condition.
        hilog.error(CHENG_FILE_PICKER_LOG_DOMAIN, 'ChengGuiDemo', 'file_picker_open unsupported kind=%{public}s', kind)
        guiHost.deliverFilePickerResult(refName, kind, resultMode, resultStateRef, '', '')
        return
      }
    } catch (err) {
      // User cancelled the system picker, or the picker failed to launch —
      // both surface as a rejected promise on OHOS. Honest no-op, not a crash.
      hilog.info(CHENG_FILE_PICKER_LOG_DOMAIN, 'ChengGuiDemo', 'file_picker_cancel_or_error ref=%{public}s err=%{public}s', refName, JSON.stringify(err))
      guiHost.deliverFilePickerResult(refName, kind, resultMode, resultStateRef, '', '')
      return
    }
    if (uris.length === 0) {
      guiHost.deliverFilePickerResult(refName, kind, resultMode, resultStateRef, '', '')
      return
    }
    const uri = uris[0]
    const rawName = decodeURIComponent(uri.substring(uri.lastIndexOf('/') + 1))
    const dotIndex = rawName.lastIndexOf('.')
    const ext = dotIndex >= 0 ? rawName.substring(dotIndex) : ''
    const destPath = getContext(this).cacheDir + '/picker_' + Date.now() + '_' + Math.floor(Math.random() * 1000000) + ext
    try {
      fs.copyFileSync(uri, destPath)
    } catch (err) {
      hilog.error(CHENG_FILE_PICKER_LOG_DOMAIN, 'ChengGuiDemo', 'file_picker_copy_failed ref=%{public}s err=%{public}s', refName, JSON.stringify(err))
      guiHost.deliverFilePickerResult(refName, kind, resultMode, resultStateRef, '', '')
      return
    }
    hilog.info(CHENG_FILE_PICKER_LOG_DOMAIN, 'ChengGuiDemo', 'file_picker_result ref=%{public}s dest=%{public}s name=%{public}s', refName, destPath, rawName)
    guiHost.deliverFilePickerResult(refName, kind, resultMode, resultStateRef, destPath, rawName)
  }

  private locationCapturePermissions(): Permissions[] {
    return ['ohos.permission.APPROXIMATELY_LOCATION', 'ohos.permission.LOCATION']
  }

  // Mirrors Android's hasPublishLocationPermission + requestPermissions flow: check
  // first (either fine- or coarse-location already granted is enough), request only
  // if neither is.
  private async ensureLocationCapturePermission(): Promise<boolean> {
    const context = getContext(this) as common.UIAbilityContext
    const permissions = this.locationCapturePermissions()
    try {
      for (let index = 0; index < permissions.length; index++) {
        const granted = this.locationAtManager.verifyAccessTokenSync(context.applicationInfo.accessTokenId, permissions[index])
        if (granted === abilityAccessCtrl.GrantStatus.PERMISSION_GRANTED) {
          return true
        }
      }
    } catch (err) {
    }
    try {
      const result = await this.locationAtManager.requestPermissionsFromUser(context, permissions)
      return result.authResults.some((value: number): boolean => value === 0)
    } catch (err) {
      return false
    }
  }

  // Mirrors Android's freshLastKnownLocation: a cached fix within maxAgeMs skips the
  // fresh-fix wait entirely. getLastLocation() throws when no cached fix exists yet —
  // an honest miss, not an error, so this falls through to a fresh fetch.
  private freshLastKnownGeoLocation(maxAgeMs: number): geoLocationManager.Location | null {
    if (maxAgeMs <= 0) {
      return null
    }
    try {
      const last = geoLocationManager.getLastLocation()
      if (Date.now() - last.timeStamp <= maxAgeMs) {
        return last
      }
    } catch (err) {
    }
    return null
  }

  // Single-shot GPS fix: permission → GPS-switch check → cached fix → fresh fetch
  // (20s default timeout, aligned with Android's requestSingleUpdate + postDelayed
  // timeout — mobile_shell_codegen.cheng runLocationCapture). Delivers back through
  // cheng_gui_host_location_capture_deliver (cheng_gui_host_adapter.c); never fakes a
  // fix. Every failure classifies into the same permission_denied/unavailable/timeout
  // codes + Chinese text Android's writeLocationCaptureFailure uses.
  private async handleLocationCaptureRequest(timeoutMs: number, maxAgeMs: number, previewRef: string, statusRef: string, messageRef: string): Promise<void> {
    const permitted = await this.ensureLocationCapturePermission()
    if (!permitted) {
      hilog.warn(CHENG_LOCATION_LOG_DOMAIN, 'ChengGuiDemo', 'location_capture_permission_denied preview_ref=%{public}s', previewRef)
      guiHost.deliverLocationCaptureResult(previewRef, statusRef, messageRef, false, 0, 0, 'permission_denied', '定位权限被拒绝，请在系统设置中开启定位权限')
      return
    }
    let enabled = false
    try {
      enabled = geoLocationManager.isLocationEnabled()
    } catch (err) {
      enabled = false
    }
    if (!enabled) {
      hilog.warn(CHENG_LOCATION_LOG_DOMAIN, 'ChengGuiDemo', 'location_capture_switch_off preview_ref=%{public}s', previewRef)
      guiHost.deliverLocationCaptureResult(previewRef, statusRef, messageRef, false, 0, 0, 'unavailable', '定位服务不可用，请检查 GPS 开关')
      return
    }
    const cached = this.freshLastKnownGeoLocation(maxAgeMs)
    if (cached !== null) {
      hilog.info(CHENG_LOCATION_LOG_DOMAIN, 'ChengGuiDemo', 'location_capture_cached preview_ref=%{public}s', previewRef)
      guiHost.deliverLocationCaptureResult(previewRef, statusRef, messageRef, true, cached.latitude, cached.longitude, '', '')
      return
    }
    const effectiveTimeoutMs = timeoutMs > 0 ? timeoutMs : 20000
    try {
      const location = await geoLocationManager.getCurrentLocation({
        priority: geoLocationManager.LocationRequestPriority.ACCURACY,
        scenario: geoLocationManager.LocationRequestScenario.UNSET,
        timeoutMs: effectiveTimeoutMs,
      })
      hilog.info(CHENG_LOCATION_LOG_DOMAIN, 'ChengGuiDemo', 'location_capture_fix preview_ref=%{public}s', previewRef)
      guiHost.deliverLocationCaptureResult(previewRef, statusRef, messageRef, true, location.latitude, location.longitude, '', '')
    } catch (err) {
      const code = (err as BusinessError).code
      hilog.error(CHENG_LOCATION_LOG_DOMAIN, 'ChengGuiDemo', 'location_capture_failed preview_ref=%{public}s code=%{public}d', previewRef, code)
      if (code === CHENG_LOCATION_ERROR_CODE_FAILED_TO_OBTAIN) {
        guiHost.deliverLocationCaptureResult(previewRef, statusRef, messageRef, false, 0, 0, 'timeout', '定位超时，请重试')
      } else {
        guiHost.deliverLocationCaptureResult(previewRef, statusRef, messageRef, false, 0, 0, 'unavailable', '定位服务不可用，请检查 GPS 开关')
      }
    }
  }

  // System back gesture/button: route into the scene's route stack (e.g. exit the
  // fullscreen video player back to the feed). Returns true to consume the event;
  // false (scene already at root) lets the system handle it = leave the app.
  onBackPress(): boolean {
    try {
      return guiHost.navigateBack() as boolean
    } catch (err) {
      return false
    }
  }

  build() {
    Column() {
      XComponent({
        id: 'chengGuiSurface',
        type: XComponentType.SURFACE,
        libraryname: 'cheng_gui_host',
        controller: this.surfaceController
      })
        .width('100%')
        .height('100%')
    }
    .width('100%')
    .height('100%')
    .backgroundColor('#000000')
  }
}
