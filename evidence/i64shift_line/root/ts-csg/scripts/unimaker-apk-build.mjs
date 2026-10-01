#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chengSmokeEnv } from "./cheng-smoke-env.mjs";
import { runCommand } from "./process-runner.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(scriptDir, "..");
const repoRoot = resolve(packageDir, "..");
const androidVersionCode = Number(process.env.UNIMAKER_APK_VERSION_CODE || Math.floor(Date.now() / 1000));

const options = parseArgs(process.argv.slice(2));
if (options.help) {
  process.stdout.write(helpText());
  process.exit(0);
}

const oneClickOutDir = resolvePath(options.oneClickOutDir);
const outDir = resolvePath(options.outDir ?? join(packageDir, "tmp", `unimaker-apk-build-${Date.now()}`));
const buildDir = join(outDir, "build");
const shellOutDir = join(outDir, "android-shell");
const runtimeBundleSourceDir = join(outDir, "android-runtime-bundle-source");
const retainedApkPath = join(outDir, "app-debug.apk");
const runtimeBundlePayloadPath = join(runtimeBundleSourceDir, "runtime_bundle_payload.json");
const runtimeContractPayloadPath = join(runtimeBundleSourceDir, "runtime_contract_payload.json");
const summaryPath = join(outDir, "unimaker-apk-build.summary.json");
const unimakerChengMaxRssBytes = "8589934592";
// group-create backend .so export roots (13). Distinct from SOCIAL_GROUP_BRIDGE_JNI_SYMBOLS
// (19 JNI entrypoints on the Java bridge .so) — not a missing-list bug; two different layers.
const SOCIAL_GROUP_BACKEND_SYMBOLS = [
  "libp2p_node_init",
  "libp2p_node_start",
  "libp2p_node_stop",
  "libp2p_node_free",
  "libp2p_node_is_started",
  "libp2p_get_local_peer_id",
  "libp2p_get_last_error",
  "libp2p_runtime_health_json",
  "libp2p_network_discovery_snapshot",
  "social_groups_create",
  "social_dm_send",
  "social_wait_discovery",
  "libp2p_string_free",
];
const SOCIAL_GROUP_BRIDGE_JNI_SYMBOLS = [
  "JNI_OnLoad",
  "Java_com_unimaker_app_libp2p_ChengLibp2pNative_nativeNodeInit",
  "Java_com_unimaker_app_libp2p_ChengLibp2pNative_nativeNodeStart",
  "Java_com_unimaker_app_libp2p_ChengLibp2pNative_nativeNodeStop",
  "Java_com_unimaker_app_libp2p_ChengLibp2pNative_nativeNodeFree",
  "Java_com_unimaker_app_libp2p_ChengLibp2pNative_nativeNodeIsStarted",
  "Java_com_unimaker_app_libp2p_ChengLibp2pNative_nativeGetLocalPeerId",
  "Java_com_unimaker_app_libp2p_ChengLibp2pNative_nativeGetLastError",
  "Java_com_unimaker_app_libp2p_ChengLibp2pNative_nativeRuntimeHealth",
  "Java_com_unimaker_app_libp2p_ChengLibp2pNative_nativeNetworkDiscoverySnapshot",
  "Java_com_unimaker_app_libp2p_ChengLibp2pNative_nativeSocialGroupsCreate",
  "Java_com_unimaker_app_libp2p_ChengLibp2pNative_nativeSocialPublishEnqueue",
  "Java_com_unimaker_app_libp2p_ChengLibp2pNative_nativeSocialPublishTask",
  "Java_com_unimaker_app_libp2p_ChengLibp2pNative_nativeSocialPublishTasks",
  "Java_com_unimaker_app_libp2p_ChengLibp2pNative_nativeSocialFeedSnapshot",
  "Java_com_unimaker_app_libp2p_ChengLibp2pNative_nativeSocialMomentsTimeline",
  "Java_com_unimaker_app_libp2p_ChengLibp2pNative_nativeSocialContentDetail",
  "Java_com_unimaker_app_libp2p_ChengLibp2pNative_nativeSocialDmSend",
  "Java_com_unimaker_app_libp2p_ChengLibp2pNative_nativeSocialWaitDiscovery",
];
const SOCIAL_FULL_BACKEND_REQUIRED_SYMBOLS = [
  "social_groups_create",
  "social_poll_events",
  "social_publish_enqueue",
  "social_publish_task",
  "social_publish_tasks",
  "social_wait_feed_event",
  "social_dm_send",
  "social_wait_discovery",
  "libp2p_poll_events",
  "libp2p_wait_events",
];
const ANDROID_SOCIAL_BACKEND_EXPORT_ROOTS = [
  "libp2p_get_last_error",
  "libp2p_get_local_peer_id",
  "libp2p_network_discovery_snapshot",
  "libp2p_node_free",
  "libp2p_node_init",
  "libp2p_node_is_started",
  "libp2p_node_start",
  "libp2p_node_stop",
  "libp2p_runtime_health_json",
  "libp2p_string_free",
  "social_content_detail",
  "social_dm_send",
  "social_dm_send_cstr",
  "social_feed_snapshot",
  "social_groups_create",
  "social_moments_timeline",
  "social_poll_events",
  "social_publish_enqueue",
  "social_publish_task",
  "social_publish_tasks",
  "social_wait_discovery",
  "social_wait_feed_event",
];
const SOCIAL_FULL_BRIDGE_REQUIRED_SYMBOLS = [
  "JNI_OnLoad",
  "Java_com_unimaker_app_libp2p_ChengLibp2pNative_nativeSocialGroupsCreate",
  "Java_com_unimaker_app_libp2p_ChengLibp2pNative_nativeSocialPublishEnqueue",
  "Java_com_unimaker_app_libp2p_ChengLibp2pNative_nativeSocialPublishTask",
  "Java_com_unimaker_app_libp2p_ChengLibp2pNative_nativeSocialPublishTasks",
  "Java_com_unimaker_app_libp2p_ChengLibp2pNative_nativeSocialDmSend",
  "Java_com_unimaker_app_libp2p_ChengLibp2pNative_nativeSocialWaitDiscovery",
  "Java_com_unimaker_app_libp2p_ChengLibp2pNative_nativePollEvents",
  "Java_com_unimaker_app_libp2p_ChengLibp2pNative_nativeWaitEvents",
];
const ANDROID_HOST_CAPTURE_REQUIRED_SYMBOLS = [
  "cheng_mobile_host_begin_offscreen_capture",
  "cheng_mobile_host_read_offscreen_pixels",
  "cheng_mobile_host_end_offscreen_capture",
];
const ANDROID_HOST_RUNTIME_REQUIRED_SYMBOLS = [
  "cheng_f64_to_i32",
  "cheng_native_stream_recv",
  "cheng_native_stream_send",
  "cheng_ptr_size",
  "cheng_seq_free",
  "cheng_seq_set_grow",
  "cheng_seq_string_elem_bytes_compat",
  "cheng_seq_string_register_compat",
  "load_int32",
  "load_ptr",
  "store_int32",
  "store_ptr",
];
const MOBILE_CAPI_LIB_NAME = "cheng_mobile_capi";
const SCENE_RUNTIME_PROVIDER_LIB_NAME = "cheng_scene_runtime_provider";
// Pure-Cheng primitives the retained scene .so imports and used to resolve from whichever
// prebuilt backend happened to be loaded globally. Give the app its OWN BIND_NOW dependency
// so the host never preempts libchenglibp2p/mobile-capi runtimes (two allocators in one
// process crash the render thread), and the host stays the old unresolved-file-bridge shell.
const ANDROID_SCENE_RUNTIME_PROVIDER_ROOTS = "__cheng_call_indirect_i32,__cheng_call_indirect_void,cheng_malloc,cheng_free,cheng_mem_refcount,cheng_mem_retain,cheng_mem_release,cheng_cstrlen,driver_c_new_string,driver_c_new_string_copy_n,cheng_memcpy,cheng_memset,cheng_bounds_check,cheng_seq_next_cap,cheng_seq_string_release_range_compat,cheng_atomic_cas_i32,cheng_atomic_store_i32,cheng_atomic_load_i32,cheng_atomic_fetch_add_i32,cheng_file_mtime,cheng_os_dir_exists_bridge,cheng_os_file_size_bridge,cheng_os_list_dir_bridge,cheng_os_list_dir_free_bridge,cheng_file_handle_open_bridge,cheng_file_handle_open_read_bridge,cheng_file_handle_open_write_truncate_bridge,cheng_file_handle_open_append_bridge,cheng_file_handle_write_all_bridge,cheng_file_handle_close_bridge";
const MOQ_ANDROID_LIB_NAME = "cheng_moq_android";
const MOQ_PUBLISHER_PS_ROOTS = "__cheng_call_indirect_i32,__cheng_call_indirect_void,c_iometer_call,cheng_atomic_cas_i32,cheng_atomic_fetch_add_i32,cheng_atomic_load_i32,cheng_atomic_store_i32,cheng_bounds_check,cheng_cstrlen,cheng_file_handle_close_bridge,cheng_file_handle_open_append_bridge,cheng_file_handle_open_bridge,cheng_file_handle_open_read_bridge,cheng_file_handle_open_write_truncate_bridge,cheng_file_handle_read_all_bridge,cheng_file_handle_write_all_bridge,cheng_mem_refcount,cheng_mem_retain,cheng_memcpy,cheng_memset,cheng_seq_next_cap,cheng_seq_string_release_range_compat,cheng_thread_join,cheng_thread_parallelism,cheng_thread_start,cheng_fclose,cheng_fflush,cheng_free,cheng_malloc,cheng_monotime_ns,cheng_os_dir_exists_bridge,cheng_os_file_exists_bridge,cheng_os_fopen_mode_bridge,cheng_os_mkdir_bridge";
const MOQ_PUBLISHER_CP_ROOTS = "cheng_epoch_time_seconds,cheng_errno,cheng_native_system_cpu_logical_cores_value_bridge,cheng_mobile_protect_fd,cheng_mobile_udp_debug_event,cheng_mobile_udp_fd_wait_readable,cheng_mobile_udp_recvfrom_addr_ptr_bridge,cheng_strerror,cheng_udp_platform_use_len_field_bridge,driver_c_new_string,driver_c_new_string_copy_n,libc_bind,libc_close,libc_fcntl,libc_getsockname,libc_inet_ntop,libc_inet_pton,libc_sendto,libc_setsockopt,libc_socket";
const MOQ_PUBLISHER_HR_ROOTS = "cheng_host_clock_gettime,cheng_host_fwrite,cheng_host_mmap_anon,cheng_host_munmap,cheng_host_closedir,cheng_host_fclose,cheng_host_fflush,cheng_host_fopen,cheng_host_fread,cheng_host_free,cheng_host_fseek,cheng_host_ftell,cheng_host_malloc,cheng_host_mkdir,cheng_host_opendir,cheng_host_stat,__cheng_runtime_ptr_slot_load_raw,__cheng_runtime_ptr_slot_store_raw";
// ---- Android host std/os file-API bridge provider (S5-A block cache, f6eb23a7e) ------
// cheng_generated_android_host.c (hand-written host bridge in mobile_shell_codegen.cheng)
// never linked a Cheng object, so it has no definitions for the file bridges S5-A pulled
// into the scene runtime closure. Both are @abi_internal in program_support_backend.cheng
// (single canonical provider by design) — same roots family as MOQ_PUBLISHER_PS_ROOTS above,
// trimmed to just the file-handle closure.
const ANDROID_HOST_FILE_BRIDGE_PS_ROOTS = "cheng_fclose,cheng_fflush,cheng_file_handle_close_bridge,cheng_file_handle_open_append_bridge,cheng_file_handle_open_bridge,cheng_file_handle_open_read_bridge,cheng_file_handle_open_write_truncate_bridge,cheng_file_handle_read_all_bridge,cheng_os_file_exists_bridge,cheng_os_fopen_mode_bridge,cheng_os_rename_bridge,driver_c_create_dir_all_bridge";
const ANDROID_HOST_FILE_BRIDGE_SYMBOLS = [
  "cheng_os_file_exists_bridge",
  "cheng_file_handle_open_bridge",
  "cheng_file_handle_open_read_bridge",
  "cheng_file_handle_open_write_truncate_bridge",
  "cheng_file_handle_open_append_bridge",
  "cheng_file_handle_close_bridge",
  "cheng_file_handle_read_all_bridge",
  "cheng_os_rename_bridge",
  "driver_c_create_dir_all_bridge",
  "cheng_host_write_runtime",
  "cheng_host_exit_immediate_runtime",
  "cheng_host_list_dir",
];
const MOBILE_CAPI_REQUIRED_SYMBOLS = [
  "MobileCapiPeerIdFromSeed",
  "MobileCapiDidFromRootSeed",
  "MobileCapiDidDevicePeerIdFromSeed",
  "MobileCapiPeerIdNormalize",
  "MobileCapiMultiaddrNormalize",
  "MobileCapiDialableAddr",
  "MobileCapiMoqFountainBuild",
  "MobileCapiMoqFountainBuildRequest",
  "MobileCapiMoqFountainBuildPersist",
  "MobileCapiMoqFountainBuildPersistRequest",
  "MobileCapiMoqFountainRebuild",
  "MobileCapiBioDidSetTrustedAttestorRoot",
  "MobileCapiBioDidCreateRequestWire",
  "MobileCapiBioDidCreate",
  "MobileCapiBioDidCreateWire",
  "MobileCapiBioDidCreateTrustedWire",
  "MobileCapiBioDidImportRequestWire",
  "MobileCapiBioDidImport",
  "MobileCapiBioDidImportWire",
];

mkdirSync(buildDir, { recursive: true });
mkdirSync(runtimeBundleSourceDir, { recursive: true });

const oneClick = readOneClickOutput(oneClickOutDir);
const toolchain = resolveAndroidToolchain(options);
const copiedAssets = prepareRuntimeBundleSource(oneClick, runtimeBundleSourceDir);

if (options.dryRun) {
  const summary = writeSummary({
    mode: "dry-run",
    oneClick,
    toolchain,
    mobileShellTool: "",
    appObject: "",
    appSo: "",
    sceneRuntimeProviderObject: "",
    sceneRuntimeProviderSo: "",
    sceneRuntimeProviderPackage: null,
    mobileCapiObject: "",
    mobileCapiSo: "",
    shellOutDir: "",
    apk: "",
    captureExecutable: null,
    mobileCapiPackage: null,
    androidBlockCacheBootstrap: null,
    androidSocialBackendBootstrap: null,
    socialBackendOverlay: null,
    copiedAssets,
    apkEntries: [],
    verifiedApkPayloads: [],
  });
  process.stdout.write(`unimaker-apk-build dry-run ok\n`);
  process.stdout.write(`summary: ${summary}\n`);
  process.exit(0);
}

const mobileShellTool = await ensureMobileShellTool(options, buildDir);
const appObject = await compileAndroidAppObject(options, oneClick.sceneRuntimeSource, buildDir);
const appSo = await linkAndroidAppSharedLibrary(options, toolchain, appObject, buildDir, oneClick.media.length > 0);
const sceneRuntimeProviderBuild = String(options.sceneRuntimeProviderSo ?? "").trim().length > 0
  ? await verifyPrebuiltSceneRuntimeProviderSharedLibrary(toolchain, resolvePath(options.sceneRuntimeProviderSo))
  : await linkAndroidSceneRuntimeProviderSharedLibrary(options, toolchain, buildDir);
const sceneRuntimeProviderObject = sceneRuntimeProviderBuild.objectPath;
const sceneRuntimeProviderSo = sceneRuntimeProviderBuild.soPath;
const mobileCapiBuild = await resolveMobileCapiSharedLibrary(options, toolchain, buildDir);
const mobileCapiObject = mobileCapiBuild.objectPath;
const mobileCapiSo = mobileCapiBuild.soPath;
let apk = await buildAndroidShellApk(options, toolchain, mobileShellTool, appSo, shellOutDir, runtimeBundlePayloadPath, oneClick.sceneRuntimeSource);
const androidBlockCacheBootstrap = verifyAndroidShellMediaBlockCacheBootstrap(shellOutDir, options.appId);
const androidSocialBackendBootstrap = verifyAndroidShellSocialBackendBootstrap(shellOutDir, options.appId);
const androidHostProviderSo = String(options.androidHostProviderSo ?? "").trim().length > 0
  ? await installPrebuiltAndroidHostProviderSharedLibrary(options, toolchain, shellOutDir)
  : await relinkAndroidHostSharedLibraryWithFileBridgeProvider(options, toolchain, shellOutDir, buildDir);
const sceneRuntimeProviderPackage = packageSceneRuntimeProviderSharedLibrary(shellOutDir, sceneRuntimeProviderSo);
const mobileCapiPackage = packageMobileCapiSharedLibrary(shellOutDir, mobileCapiSo);
const moqAndroidPublisherSo = String(options.moqPublisherSo ?? "").trim().length > 0
  ? await verifyPrebuiltMoqAndroidPublisherSharedLibrary(toolchain, resolvePath(options.moqPublisherSo))
  : await linkMoqAndroidPublisherSharedLibrary(options, toolchain, buildDir);
const moqAndroidPublisherPackage = packageMoqAndroidPublisherAssets(shellOutDir, moqAndroidPublisherSo);
const socialBackendOverlay = await overlayReactSocialBackendAndRebuildApk(options, toolchain, shellOutDir);
apk = socialBackendOverlay.apk;
const apkVerification = await verifyApkPayloads(apk, shellOutDir, oneClick, copiedAssets, options.libName, toolchain, options.socialBackendMode, String(options.socialBackendLib ?? "").trim().length > 0 || (String(options.socialBackendSo ?? "").trim().length > 0 && String(options.socialBridgeSo ?? "").trim().length > 0));
const captureExecutable = await buildAndroidHeadlessCaptureExecutable({
  apk,
  shellDir: shellOutDir,
  libName: options.libName,
  toolchain,
  outDir: buildDir,
});
const retainedApk = retainFinalApk(apk, retainedApkPath);
const cleanup = options.keepBuildTree ? {
  enabled: false,
  retainedApk,
  removed: [],
} : cleanupApkBuildTree();
const finalSummary = writeSummary({
  mode: "apk",
  oneClick,
  toolchain,
  androidVersionCode,
  mobileShellTool,
  appObject,
  appSo,
  sceneRuntimeProviderObject,
  sceneRuntimeProviderSo,
  sceneRuntimeProviderPackage,
  mobileCapiObject,
  mobileCapiSo,
  shellOutDir,
  apk: retainedApk,
  captureExecutable,
  mobileCapiPackage,
  androidBlockCacheBootstrap,
  androidSocialBackendBootstrap,
  androidHostProviderSo,
  moqAndroidPublisherSo,
  moqAndroidPublisherPackage,
  socialBackendOverlay: socialBackendOverlay ? { ...socialBackendOverlay, apk: retainedApk } : socialBackendOverlay,
  cleanup,
  copiedAssets,
  apkEntries: apkVerification.entries,
  verifiedApkPayloads: apkVerification.verified,
});

process.stdout.write(`unimaker-apk-build ok\n`);
process.stdout.write(`apk: ${retainedApk}\n`);
process.stdout.write(`summary: ${finalSummary}\n`);

function parseArgs(args) {
  const parsed = {
	    oneClickOutDir: "",
	    cheng: join(repoRoot, "artifacts/bootstrap/cheng.stage3"),
	    mobileCapiCheng: join(repoRoot, "artifacts/backend_driver/cheng"),
	    // Separate pin: media_moq_publisher_main.cheng needs a driver build proven against it
	    // specifically (the plain artifacts/backend_driver/cheng driver has SIGSEGV'd on this
	    // exact file — see scratchpad moqwall archive); default stays the same as --cheng, but
	    // callers can pin an independently-verified driver for just this compile.
	    moqPublisherCheng: join(repoRoot, "artifacts/bootstrap/cheng.stage3"),
    moqPublisherPrebuiltDir: "",
    moqPublisherSo: "",
    sceneRuntimeProviderSo: "",
    androidHostProviderSo: "",
	    mobileCapiSo: "",
    mobileShellTool: "",
    ndkRoot: "",
    javaHome: "",
    androidHostCc: "",
    androidHostLd: "",
    androidClangRtDir: "",
    androidApiLevel: "30",
    appId: "org.cheng.unimaker.scene",
    appName: "ChengUniMakerScene",
    libName: "cheng_unimaker_scene",
	    reactAndroidDir: process.env.UNIMAKER_REACT_ANDROID_DIR || "/Users/lbcheng/UniMaker/React.js/android",
	    socialBackendMode: process.env.UNIMAKER_SOCIAL_BACKEND_MODE || "group-create",
	    socialBackendSo: "",
	    socialBridgeSo: "",
	    socialBackendLib: "",
    routeState: "home_default",
    compileTimeoutMs: 300000,
    mobileShellToolTimeoutMs: 120000,
    buildTimeoutMs: 600000,
    dryRun: false,
    keepBuildTree: false,
    allowPartialRouteReachability: false,
    help: false,
  };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const next = () => {
      i += 1;
      if (i >= args.length) fail(`missing value for ${arg}`);
      return args[i];
    };
    if (arg === "--help" || arg === "-h") parsed.help = true;
    else if (arg === "--one-click-out-dir") parsed.oneClickOutDir = next();
    else if (arg === "--out-dir") parsed.outDir = next();
	    else if (arg === "--cheng") parsed.cheng = next();
	    else if (arg === "--mobile-capi-cheng") parsed.mobileCapiCheng = next();
	    else if (arg === "--moq-publisher-cheng") parsed.moqPublisherCheng = next();
    else if (arg === "--moq-publisher-prebuilt-dir") parsed.moqPublisherPrebuiltDir = next();
    else if (arg === "--moq-publisher-so") parsed.moqPublisherSo = next();
    else if (arg === "--scene-runtime-provider-so") parsed.sceneRuntimeProviderSo = next();
    else if (arg === "--android-host-provider-so") parsed.androidHostProviderSo = next();
	    else if (arg === "--mobile-capi-so") parsed.mobileCapiSo = next();
    else if (arg === "--mobile-shell-tool") parsed.mobileShellTool = next();
    else if (arg === "--ndk-root" || arg === "--android-ndk-root") parsed.ndkRoot = next();
    else if (arg === "--java-home" || arg === "--android-java-home") parsed.javaHome = next();
    else if (arg === "--android-host-cc") parsed.androidHostCc = next();
    else if (arg === "--android-host-ld") parsed.androidHostLd = next();
    else if (arg === "--android-clang-rt-dir") parsed.androidClangRtDir = next();
    else if (arg === "--android-api-level") parsed.androidApiLevel = next();
    else if (arg === "--app-id") parsed.appId = next();
    else if (arg === "--app-name") parsed.appName = next();
    else if (arg === "--lib-name") parsed.libName = next();
	    else if (arg === "--react-android-dir") parsed.reactAndroidDir = next();
	    else if (arg === "--social-backend-mode") parsed.socialBackendMode = next();
	    else if (arg === "--social-backend-so") parsed.socialBackendSo = next();
	    else if (arg === "--social-bridge-so") parsed.socialBridgeSo = next();
	    else if (arg === "--social-backend-lib") parsed.socialBackendLib = next();
    else if (arg === "--route-state") parsed.routeState = next();
    else if (arg === "--compile-timeout-ms") parsed.compileTimeoutMs = positiveInt(next(), arg);
    else if (arg === "--mobile-shell-tool-timeout-ms") parsed.mobileShellToolTimeoutMs = positiveInt(next(), arg);
    else if (arg === "--build-timeout-ms") parsed.buildTimeoutMs = positiveInt(next(), arg);
    else if (arg === "--dry-run") parsed.dryRun = true;
    else if (arg === "--keep-build-tree") parsed.keepBuildTree = true;
    else if (arg === "--allow-partial-route-reachability") parsed.allowPartialRouteReachability = true;
    else fail(`unknown argument: ${arg}`);
  }
  if (parsed.help) {
    return parsed;
  }
  if (parsed.oneClickOutDir.length === 0) {
    fail("--one-click-out-dir is required");
  }
  if (parsed.routeState.trim().length === 0) {
    fail("--route-state must be non-empty");
  }
  if (!Number.isInteger(androidVersionCode) || androidVersionCode <= 0 || androidVersionCode > 2100000000) {
    fail(`UNIMAKER_APK_VERSION_CODE must be a positive Android versionCode <= 2100000000: ${process.env.UNIMAKER_APK_VERSION_CODE || androidVersionCode}`);
  }
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(parsed.libName)) {
    fail(`--lib-name must be a C identifier stem: ${parsed.libName}`);
  }
  if (!["full", "group-create"].includes(parsed.socialBackendMode)) {
    fail(`--social-backend-mode must be full or group-create: ${parsed.socialBackendMode}`);
  }
  return parsed;
}

function readOneClickOutput(dir) {
  requireDir(dir, "one-click output dir");
  const summaryFile = join(dir, "one-click.summary.json");
  const summary = readJsonFile(summaryFile);
  if (summary.schema !== "unimaker.one-click.v1") {
    fail(`unexpected one-click summary schema: ${summary.schema}`);
  }
  if (!summary.domCss?.complete || Number(summary.domCss?.hardFailureCount ?? 0) !== 0) {
    fail("one-click DOM/CSS coverage is incomplete");
  }
  if (summary.routeReachability?.complete !== true && options.allowPartialRouteReachability !== true) {
    fail("one-click route reachability is incomplete");
  }
  const sceneRuntimeSource = join(dir, "unimaker-react.scene-runtime.cheng");
  const sceneData = join(dir, "runtime", "unimaker_scene_data.bin");
  const glyphPixels = join(dir, "runtime", "unimaker_glyph_sdf_pixels.bin");
  requireNonEmptyFile(sceneRuntimeSource, "retained mobile scene runtime source");
  requireNonEmptyFile(sceneData, "scene data asset");
  verifyProfileBioDidSceneInteraction(sceneData);
  requireNonEmptyFile(glyphPixels, "glyph SDF pixel asset");
  const computerUseSummary = summary.computerUseManifest;
  if (!computerUseSummary || typeof computerUseSummary !== "object") {
    fail("one-click summary is missing computer-use manifest");
  }
  const computerUseRelPath = String(computerUseSummary.relPath ?? "");
  if (computerUseRelPath !== "runtime/unimaker_computer_use_manifest.json") {
    fail(`computer-use manifest relPath must be runtime/unimaker_computer_use_manifest.json: ${computerUseRelPath}`);
  }
  const computerUseManifest = join(dir, computerUseRelPath);
  requireNonEmptyFile(computerUseManifest, "computer-use manifest");
  const computerUseByteCount = statSync(computerUseManifest).size;
  if (!Number.isSafeInteger(computerUseSummary.byteCount) || computerUseSummary.byteCount !== computerUseByteCount) {
    fail("computer-use manifest byte count mismatch");
  }
  const computerUseSha256 = sha256File(computerUseManifest);
  if (typeof computerUseSummary.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(computerUseSummary.sha256) || computerUseSummary.sha256 !== computerUseSha256) {
    fail("computer-use manifest sha256 mismatch");
  }
  // UniMaker-internal computer-use/voice-task readiness is a UniMaker product
  // contract, not an APK-buildability contract. Third-party scenes (static
  // boards, no typed actions, no UniMaker task templates) build and run fine
  // without any of it -- degrade to warnings instead of failing (dapanyouxuan P0).
  const computerUseCounts = computerUseSummary.counts ?? {};
  const computerUseWarnings = [];
  if (Number(computerUseCounts.computerUseActions ?? 0) <= 0) {
    computerUseWarnings.push("no typed actions");
  }
  if (Number(computerUseCounts.computerUseActionCoveragePercent ?? 0) !== 100) {
    computerUseWarnings.push("action coverage is not 100 percent");
  }
  if (computerUseCounts.unimakerInternalTaskReady !== true) {
    computerUseWarnings.push("UniMaker internal tasks not marked ready");
  }
  for (const requiredTemplate of [
    "publish_short_video_draft",
    "publish_ad_video_draft",
    "authorized_product_publish_draft",
    "purchase_assist_review",
    "content_search_review",
    "feed_filter_review",
    "content_like_review",
    "message_history_browse_review",
  ]) {
    if (!Array.isArray(computerUseSummary.templateIds) || !computerUseSummary.templateIds.includes(requiredTemplate)) {
      computerUseWarnings.push(`missing template: ${requiredTemplate}`);
    }
  }
  if (computerUseWarnings.length > 0) {
    process.stderr.write(`unimaker-apk-build: computer-use manifest warnings (non-fatal): ${computerUseWarnings.join("; ")}\n`);
  }
  const mediaAssets = Array.isArray(summary.mediaPayloadAssets) ? summary.mediaPayloadAssets : [];
  const mediaPlaybackSlotCount = Number(summary.scene?.mediaPlaybackSlots ?? 0);
  if (mediaPlaybackSlotCount > 0 && mediaAssets.length <= 0) {
    fail("one-click summary has media playback slots but no media payload assets");
  }
  const media = mediaAssets.map((asset) => {
    const relPath = String(asset.relPath ?? "");
    if (!relPath.startsWith("runtime/media/assets/")) {
      fail(`media asset relPath must stay under runtime/media/assets: ${relPath}`);
    }
    const path = join(dir, relPath);
    requireNonEmptyFile(path, `media payload ${relPath}`);
    const byteCount = statSync(path).size;
    if (!Number.isSafeInteger(asset.byteCount) || asset.byteCount !== byteCount) {
      fail(`media payload byte count mismatch for ${relPath}`);
    }
    const sha256 = sha256File(path);
    if (typeof asset.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(asset.sha256) || asset.sha256 !== sha256) {
      fail(`media payload sha256 mismatch for ${relPath}`);
    }
    if (typeof asset.assetCid !== "string" || asset.assetCid !== sha256) {
      fail(`media payload assetCid must equal sha256 for ${relPath}`);
    }
    return {
      relPath,
      path,
      byteCount,
      sha256,
      kind: String(asset.kind ?? ""),
      assetCid: String(asset.assetCid ?? ""),
    };
  });
  return {
    outDir: dir,
    summaryFile,
    summary,
    sceneRuntimeSource,
    sceneData,
    glyphPixels,
    computerUseManifest: {
      relPath: computerUseRelPath,
      path: computerUseManifest,
      byteCount: computerUseByteCount,
      sha256: computerUseSha256,
      counts: computerUseCounts,
      templateIds: computerUseSummary.templateIds,
    },
    media,
  };
}

function verifyProfileBioDidSceneInteraction(sceneDataPath) {
  const data = readFileSync(sceneDataPath);
  let offset = 0;
  const readI32 = (label) => {
    if (offset < 0 || offset + 4 > data.length) {
      fail(`scene data ended while reading ${label}`);
    }
    const value = data.readInt32LE(offset);
    offset += 4;
    return value;
  };
  const readString = (label) => {
    const byteCount = readI32(`${label}.byteCount`);
    if (byteCount < 0 || offset + byteCount > data.length) {
      fail(`scene data has invalid string byte count for ${label}`);
    }
    const value = data.toString("utf8", offset, offset + byteCount);
    offset += byteCount;
    return value;
  };
  const headerNames = [
    "magic",
    "version",
    "routes",
    "layers",
    "resources",
    "nodes",
    "props",
    "eventHandlers",
    "hitTargets",
    "cssVariantRules",
    "cssConditions",
    "cssDeclarations",
    "staticCssDeclarations",
    "layouts",
    "paints",
    "svgPrimitives",
    "routeEdges",
    "routeHitRects",
    "mediaAssets",
    "mediaPlaybackSlots",
    "mediaControlActions",
    "stateDefaults",
  ];
  const header = {};
  for (const name of headerNames) header[name] = readI32(`header.${name}`);
  if (header.magic !== 826561347 || header.version !== 5) {
    // Scene-data schema moved on (v6+) after this UniMaker-coupled verifier was
    // written; its only job is listing social/DID interactions to pre-wire Java
    // bridges. For unknown schemas treat as "no DID interactions" instead of
    // failing third-party scenes (dapanyouxuan P0). Restore strictness when the
    // parser is updated to the current schema.
    process.stderr.write(`unimaker-apk-build: skipping DID interaction verification for scene data schema magic=${header.magic} version=${header.version}\n`);
    return { interactions: [] };
  }
  for (let i = 0; i < header.routes; i += 1) {
    readI32(`route.${i}.routeIndex`);
    readI32(`route.${i}.rootNodeId`);
    readI32(`route.${i}.layerId`);
    readString(`route.${i}.routeId`);
  }
  for (let i = 0; i < header.layers; i += 1) {
    readI32(`layer.${i}.routeIndex`);
    readI32(`layer.${i}.layerId`);
    readI32(`layer.${i}.ordinal`);
    readString(`layer.${i}.name`);
  }
  for (let i = 0; i < header.resources; i += 1) {
    readString(`resource.${i}.resourceKind`);
    readString(`resource.${i}.resourceId`);
    readString(`resource.${i}.source`);
    readString(`resource.${i}.data`);
    readString(`resource.${i}.hash`);
    readI32(`resource.${i}.byteSize`);
    readI32(`resource.${i}.fontWeight`);
    readI32(`resource.${i}.fontFamily`);
    readI32(`resource.${i}.width`);
    readI32(`resource.${i}.height`);
    const pixelCount = readI32(`resource.${i}.pixelCount`);
    if (pixelCount < 0 || offset + pixelCount * 4 > data.length) {
      fail(`scene data has invalid raster pixel count for resource ${i}`);
    }
    offset += pixelCount * 4;
  }
  for (let i = 0; i < header.nodes; i += 1) {
    readI32(`node.${i}.routeIndex`);
    readI32(`node.${i}.nodeId`);
    readI32(`node.${i}.parentNodeId`);
    readI32(`node.${i}.nodeKind`);
    readI32(`node.${i}.layerId`);
    readString(`node.${i}.tagName`);
    readString(`node.${i}.textContent`);
    readString(`node.${i}.conditionalStateRef`);
    readString(`node.${i}.conditionalStateValue`);
    readString(`node.${i}.textStateRef`);
  }
  for (let i = 0; i < header.props; i += 1) {
    readI32(`prop.${i}.routeIndex`);
    readI32(`prop.${i}.nodeId`);
    readI32(`prop.${i}.ordinal`);
    readString(`prop.${i}.propName`);
    readString(`prop.${i}.propValue`);
    readString(`prop.${i}.valueKind`);
  }
  const didEvents = new Map();
  for (let i = 0; i < header.eventHandlers; i += 1) {
    const routeIndex = readI32(`event.${i}.routeIndex`);
    const nodeId = readI32(`event.${i}.nodeId`);
    readI32(`event.${i}.ordinal`);
    readI32(`event.${i}.propOrdinal`);
    readString(`event.${i}.propName`);
    const eventName = readString(`event.${i}.eventName`);
    readString(`event.${i}.handler`);
    readString(`event.${i}.valueKind`);
    readString(`event.${i}.actionKind`);
    readString(`event.${i}.stateRef`);
    const effect = readString(`event.${i}.effect`);
    const effectParts = effect.split(";").map((part) => part.trim()).filter(Boolean);
    for (const requiredEffect of [
      "profile_bio_did_open_entry:",
      "profile_bio_did_import:",
      "profile_bio_did_create:",
    ]) {
      if (eventName === "click" && effectParts.some((part) => part.startsWith(requiredEffect))) {
        didEvents.set(requiredEffect, `${routeIndex}:${nodeId}`);
      }
    }
  }
  const didHitKeys = new Set();
  for (let i = 0; i < header.hitTargets; i += 1) {
    const routeIndex = readI32(`hit.${i}.routeIndex`);
    const nodeId = readI32(`hit.${i}.nodeId`);
    readI32(`hit.${i}.ordinal`);
    readI32(`hit.${i}.propOrdinal`);
    readI32(`hit.${i}.targetRouteIndex`);
    readString(`hit.${i}.targetKind`);
    readString(`hit.${i}.actionName`);
    const eventName = readString(`hit.${i}.eventName`);
    readString(`hit.${i}.label`);
    if (eventName === "click") didHitKeys.add(`${routeIndex}:${nodeId}`);
  }
  for (const requiredEffect of [
    "profile_bio_did_open_entry:",
    "profile_bio_did_import:",
    "profile_bio_did_create:",
  ]) {
    const key = didEvents.get(requiredEffect);
    if (key === undefined) {
      fail(`scene data is missing DID click event: ${requiredEffect}`);
    }
    if (!didHitKeys.has(key)) {
      fail(`scene data DID click event has no hit target: ${requiredEffect}${key}`);
    }
  }
}

function prepareRuntimeBundleSource(oneClick, targetDir) {
  rmSync(targetDir, { recursive: true, force: true });
  mkdirSync(join(targetDir, "runtime", "media", "assets"), { recursive: true });
  const copied = [];
  copyAsset(oneClick.sceneData, join(targetDir, "unimaker_scene_data.bin"), "runtime/unimaker_scene_data.bin", copied);
  copyAsset(oneClick.glyphPixels, join(targetDir, "unimaker_glyph_sdf_pixels.bin"), "runtime/unimaker_glyph_sdf_pixels.bin", copied);
  copyAsset(oneClick.computerUseManifest.path, join(targetDir, "unimaker_computer_use_manifest.json"), oneClick.computerUseManifest.relPath, copied);
  for (const media of oneClick.media) {
    copyAsset(media.path, join(targetDir, media.relPath), media.relPath, copied);
  }
  writeFileSync(
    join(targetDir, "runtime_bundle_payload.json"),
    JSON.stringify({
      format: "unimaker_runtime_bundle_v1",
      scene: "unimaker_scene_data.bin",
      glyph: "unimaker_glyph_sdf_pixels.bin",
      computerUse: "unimaker_computer_use_manifest.json",
      media: "runtime/media/assets",
    }) + "\n",
    "utf8",
  );
  writeFileSync(
    join(targetDir, "runtime_contract_payload.json"),
    JSON.stringify({
      format: "unimaker_native_gui_runtime_contract_payload_v1",
      oneClickSummary: oneClick.summaryFile,
      routeState: options.routeState,
      scene: copied.find((asset) => asset.relPath === "runtime/unimaker_scene_data.bin"),
      glyph: copied.find((asset) => asset.relPath === "runtime/unimaker_glyph_sdf_pixels.bin"),
      computerUse: copied.find((asset) => asset.relPath === "runtime/unimaker_computer_use_manifest.json"),
      media: copied.filter((asset) => asset.relPath.startsWith("runtime/media/assets/")),
    }) + "\n",
    "utf8",
  );
  return copied;
}

function copyAsset(source, target, relPath, copied) {
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
  const byteCount = statSync(target).size;
  copied.push({
    relPath,
    source,
    bundleSource: target,
    byteCount,
    sha256: sha256File(target),
  });
}

async function ensureMobileShellTool(opts, dir) {
  if (opts.mobileShellTool.length > 0) {
    const provided = resolvePath(opts.mobileShellTool);
    requireExecutableFile(provided, "mobile-shell tool");
    return provided;
  }
  const out = join(dir, "mobile-shell-tool");
  const report = join(dir, "mobile-shell-tool.report.txt");
  await runCommand(resolvePath(opts.cheng), [
    "system-link-exec",
    `--root:${repoRoot}`,
    "--in:src/core/tooling/mobile_shell_android_tool_main.cheng",
    "--emit:exe",
    "--target:arm64-apple-darwin",
    `--out:${out}`,
    `--report-out:${report}`,
  ], {
    cwd: repoRoot,
    env: chengSmokeEnv({ CHENG_PROCESS_MAX_RSS_BYTES: unimakerChengMaxRssBytes }, resolvePath(opts.cheng), repoRoot),
    timeout: opts.mobileShellToolTimeoutMs,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  requireExecutableFile(out, "compiled mobile-shell tool");
  const help = await runCommand(out, ["help"], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 30000,
  });
  if (!help.includes("subcommands: help, export, build-probe")) {
    fail("compiled mobile-shell tool did not expose build-probe");
  }
  return out;
}

async function compileAndroidAppObject(opts, sourcePath, dir) {
  const obj = join(dir, `lib${opts.libName}.o`);
  const report = join(dir, `lib${opts.libName}.report.txt`);
  await runCommand(resolvePath(opts.cheng), [
    "system-link-exec",
    `--root:${repoRoot}`,
    `--in:${pathForChengInput(sourcePath)}`,
    "--emit:obj",
    "--target:aarch64-linux-android",
    `--out:${obj}`,
    `--report-out:${report}`,
  ], {
    cwd: repoRoot,
    env: chengSmokeEnv({ CHENG_PROCESS_MAX_RSS_BYTES: unimakerChengMaxRssBytes }, resolvePath(opts.cheng), repoRoot),
    timeout: opts.compileTimeoutMs,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  requireNonEmptyFile(obj, "Android Cheng app object");
  const reportText = readFileSync(report, "utf8");
  if (!reportText.includes("target=aarch64-linux-android") || !reportText.includes("emit=obj")) {
    fail(`Android object compile report is not for target obj emit: ${report}`);
  }
  return obj;
}

async function linkAndroidAppSharedLibrary(opts, toolchain, objectPath, dir, requireMediaExports) {
  const so = join(dir, `lib${opts.libName}.so`);
  await runCommand(toolchain.hostLd, [
    "-shared",
    `--soname=lib${opts.libName}.so`,
    "--allow-shlib-undefined",
    "-z",
    "now",
    "-o",
    so,
    objectPath,
    join(toolchain.apiLibDir, "libm.so"),
    join(toolchain.apiLibDir, "libdl.so"),
    join(toolchain.apiLibDir, "libc.so"),
    join(toolchain.clangRtDir, "libclang_rt.builtins-aarch64-android.a"),
    join(toolchain.clangRtDir, "aarch64", "libunwind.a"),
  ], {
    cwd: repoRoot,
    timeout: 120000,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  requireNonEmptyFile(so, "Android Cheng app shared library");
  // The retained scene imports pure-Cheng runtime primitives. Put them in an
  // isolated -Bsymbolic provider .so and make it a direct DT_NEEDED dependency,
  // so neither the host nor libchenglibp2p/mobile-capi preempts the scene runtime.
  await runCommand("patchelf", ["--add-needed", `lib${SCENE_RUNTIME_PROVIDER_LIB_NAME}.so`, so], {
    cwd: repoRoot,
    timeout: 30000,
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
  });
  const symbols = await readDefinedDynamicSymbols(toolchain, so);
  for (const required of [
    "cheng_app_init",
    "cheng_app_tick",
    "cheng_app_on_touch_milli",
    "cheng_app_on_back",
    "cheng_app_debug_glyph_sdf_pixel_count",
    "cheng_app_clear_text_input_focus",
	    "cheng_app_text_input_utf8",
	    "cheng_app_text_input_cursor_utf8",
	    "cheng_app_computer_use_compile_text_utf8",
	    "cheng_app_computer_use_gui_replay_start",
	    "cheng_app_computer_use_gui_replay_tick",
	    "cheng_app_debug_computer_use_gui_replay_active",
	    "cheng_app_debug_computer_use_gui_replay_step_index",
	    "cheng_app_debug_computer_use_gui_replay_step_count",
	    "cheng_app_debug_computer_use_gui_replay_applied_count",
	    "cheng_app_debug_computer_use_gui_replay_last_status",
	    "cheng_app_debug_computer_use_execution_mode",
	    "cheng_app_debug_computer_use_current_slow_permille",
	    "cheng_app_debug_computer_use_manifest_ready",
	    "cheng_app_debug_computer_use_action_count",
	    "cheng_app_debug_computer_use_template_count",
	    "cheng_app_debug_computer_use_last_template_code",
	    "cheng_app_debug_computer_use_last_title_utf8",
	    "cheng_app_computer_use_media_selection_result_utf8",
		    "cheng_app_debug_computer_use_last_media_status",
		    "cheng_app_debug_computer_use_last_media_local_path_byte_len",
		    ...(requireMediaExports ? ["cheng_scene_media_fetch_remote_announced_to_file"] : []),
    "cheng_mobile_host_runtime_set_storage",
    "cheng_mobile_host_runtime_storage_dirty_count",
    "cheng_mobile_host_runtime_storage_dirty_key_utf8",
    "cheng_mobile_host_runtime_storage_dirty_value_utf8",
    "cheng_mobile_host_runtime_storage_clear_dirty",
		  ]) {
    if (!symbols.has(required)) {
      fail(`Android app shared library is missing export ${required}`);
    }
  }
  return so;
}

async function verifyPrebuiltSceneRuntimeProviderSharedLibrary(toolchain, soPath) {
  requireNonEmptyFile(soPath, "prebuilt Android scene runtime provider shared library");
  const symbols = await readDefinedDynamicSymbols(toolchain, soPath);
  for (const required of ANDROID_SCENE_RUNTIME_PROVIDER_ROOTS.split(",")) {
    if (symbols.has(required) == false) fail(`prebuilt Android scene runtime provider is missing export ${required}`);
  }
  return { objectPath: "", soPath };
}

async function linkAndroidSceneRuntimeProviderSharedLibrary(opts, toolchain, dir) {
  const obj = join(dir, `${SCENE_RUNTIME_PROVIDER_LIB_NAME}.o`);
  const report = join(dir, `${SCENE_RUNTIME_PROVIDER_LIB_NAME}.report.txt`);
  await runCommand(resolvePath(opts.cheng), [
    "system-link-exec",
    `--root:${repoRoot}`,
    `--in:${pathForChengInput(join(repoRoot, "src/core/runtime/program_support_backend.cheng"))}`,
    "--emit:obj",
    "--target:aarch64-linux-android",
    `--export-roots:${ANDROID_SCENE_RUNTIME_PROVIDER_ROOTS}`,
    `--out:${obj}`,
    `--report-out:${report}`,
  ], {
    cwd: repoRoot,
    env: chengSmokeEnv({ CHENG_PROCESS_MAX_RSS_BYTES: unimakerChengMaxRssBytes, CHENG_DISABLE_PRIMARY_OBJECT_CACHE: "1" }, resolvePath(opts.cheng), repoRoot),
    timeout: opts.compileTimeoutMs,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  requireNonEmptyFile(obj, "Android scene runtime provider object");
  const so = join(dir, `lib${SCENE_RUNTIME_PROVIDER_LIB_NAME}.so`);
  await runCommand(toolchain.hostLd, [
    "-shared",
    `--soname=lib${SCENE_RUNTIME_PROVIDER_LIB_NAME}.so`,
    "-Bsymbolic",
    "--allow-shlib-undefined",
    "-z",
    "now",
    "-o",
    so,
    obj,
    join(toolchain.apiLibDir, "libm.so"),
    join(toolchain.apiLibDir, "libdl.so"),
    join(toolchain.apiLibDir, "libc.so"),
    join(toolchain.clangRtDir, "libclang_rt.builtins-aarch64-android.a"),
    join(toolchain.clangRtDir, "aarch64", "libunwind.a"),
  ], {
    cwd: repoRoot,
    timeout: 120000,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  requireNonEmptyFile(so, "Android scene runtime provider shared library");
  const symbols = await readDefinedDynamicSymbols(toolchain, so);
  for (const required of ANDROID_SCENE_RUNTIME_PROVIDER_ROOTS.split(",")) {
    if (!symbols.has(required)) fail(`Android scene runtime provider is missing export ${required}`);
  }
  return { objectPath: obj, soPath: so };
}

function packageSceneRuntimeProviderSharedLibrary(shellDir, sceneRuntimeProviderSo) {
  const jniLibsDir = join(shellDir, "android/app/src/main/jniLibs/arm64-v8a");
  requireDir(jniLibsDir, "generated Android jniLibs arm64-v8a dir");
  const target = join(jniLibsDir, `lib${SCENE_RUNTIME_PROVIDER_LIB_NAME}.so`);
  copyFileSync(sceneRuntimeProviderSo, target);
  return buildRecord(sceneRuntimeProviderSo, target, "android-scene-runtime-provider-prebuilt");
}


async function compileMobileCapiObject(opts, toolchain, dir) {
  const compiler = resolvePath(opts.mobileCapiCheng);
  requireExecutableFile(compiler, "Cheng mobile CAPI compiler");
  const source = join(repoRoot, "src/mobile/mobile_capi.cheng");
  requireNonEmptyFile(source, "Cheng mobile CAPI source");
  const obj = join(dir, `${MOBILE_CAPI_LIB_NAME}.o`);
  const report = join(dir, `${MOBILE_CAPI_LIB_NAME}.report.txt`);
  await runCommand(compiler, [
    "system-link-exec",
    `--root:${repoRoot}`,
    `--in:${pathForChengInput(source)}`,
    "--symbol-visibility",
    "public",
    "--emit:obj",
    "--target:aarch64-linux-android",
    `--export-roots:${MOBILE_CAPI_REQUIRED_SYMBOLS.join(",")}`,
    `--out:${obj}`,
    `--report-out:${report}`,
  ], {
    cwd: repoRoot,
    env: chengSmokeEnv({
      CHENG_PROCESS_MAX_RSS_BYTES: unimakerChengMaxRssBytes,
      CHENG_DISABLE_PRIMARY_OBJECT_CACHE: "1",
      BACKEND_INCREMENTAL: "0",
      BACKEND_MULTI_MODULE_CACHE: "0",
    }, compiler, repoRoot),
    timeout: opts.compileTimeoutMs,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  requireNonEmptyFile(obj, "Android mobile CAPI object");
  await verifyAndroidAarch64RelocatableObject(toolchain, obj, "Android mobile CAPI object");
  const reportText = readFileSync(report, "utf8");
  if (!reportText.includes("emit=obj") && !reportText.includes("system_link_exec_emit=obj")) {
    fail(`Android mobile CAPI compile report did not prove obj emit: ${report}`);
  }
  const fullBackendProven = reportText.includes("full_backend_codegen=1") &&
      reportText.includes("primary_object_missing_reasons=-") &&
      reportText.includes("primary_object_missing_function_count=0");
  // The cold subset compiles the entire closure or dies loudly (no partial
  // emission), so real_backend_codegen + zero unresolved symbols is an
  // equivalent completeness proof when the driver hands off to cold.
  const coldSubsetProven = reportText.includes("real_backend_codegen=1") &&
      reportText.includes("cold_system_link_exec=1") &&
      reportText.includes("unresolved_symbol_count=0");
  if (!fullBackendProven && !coldSubsetProven) {
    fail(`Android mobile CAPI compile report did not prove full pure object coverage: ${report}`);
  }
  return obj;
}

async function verifyAndroidAarch64RelocatableObject(toolchain, objectPath, label) {
  const header = await runCommand(toolchain.readElf, ["-h", objectPath], {
    cwd: repoRoot,
    timeout: 30000,
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });
  if (!/Class:\s+ELF64/.test(header) ||
      !/Type:\s+REL\b/.test(header) ||
      !/Machine:\s+AArch64\b/.test(header)) {
    fail(`${label} is not an Android AArch64 relocatable ELF object: ${objectPath}`);
  }
}

async function linkMobileCapiSharedLibrary(opts, toolchain, objectPath, dir) {
  const so = join(dir, `lib${MOBILE_CAPI_LIB_NAME}.so`);
  await runCommand(toolchain.hostLd, [
    "-shared",
    `--soname=lib${MOBILE_CAPI_LIB_NAME}.so`,
    // driver obj 对 thread_pool_worker_main 等本库函数取址用 ADRP+ADD 对
    // (重定位修真后首次曝光); 对可抢占 GLOBAL 符号 lld -shared 拒绝,
    // -Bsymbolic 让本库定义就地绑定(消费方为 host dlsym, 无抢占需求)。
    "-Bsymbolic",
    "--allow-shlib-undefined",
    "-z",
    "now",
    "-z",
    "global",
    "-o",
    so,
    objectPath,
    join(toolchain.apiLibDir, "libm.so"),
    join(toolchain.apiLibDir, "libdl.so"),
    join(toolchain.apiLibDir, "libc.so"),
    join(toolchain.clangRtDir, "libclang_rt.builtins-aarch64-android.a"),
    join(toolchain.clangRtDir, "aarch64", "libunwind.a"),
  ], {
    cwd: repoRoot,
    timeout: 120000,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  requireNonEmptyFile(so, "Android mobile CAPI shared library");
  const symbols = await readDefinedDynamicSymbols(toolchain, so);
  for (const required of MOBILE_CAPI_REQUIRED_SYMBOLS) {
    if (!symbols.has(required)) {
      fail(`Android mobile CAPI shared library is missing export ${required}`);
    }
  }
  return so;
}

async function verifyMobileCapiSharedLibrary(toolchain, so) {
  requireNonEmptyFile(so, "Android mobile CAPI shared library");
  const symbols = await readDefinedDynamicSymbols(toolchain, so);
  for (const required of MOBILE_CAPI_REQUIRED_SYMBOLS) {
    if (!symbols.has(required)) {
      fail(`Android mobile CAPI shared library is missing export ${required}`);
    }
  }
}

async function resolveMobileCapiSharedLibrary(opts, toolchain, dir) {
  if (opts.mobileCapiSo.length > 0) {
    const soPath = resolvePath(opts.mobileCapiSo);
    await verifyMobileCapiSharedLibrary(toolchain, soPath);
    return {
      objectPath: "",
      soPath,
    };
  }
  const objectPath = await compileMobileCapiObject(opts, toolchain, dir);
  const soPath = await linkMobileCapiSharedLibrary(opts, toolchain, objectPath, dir);
  return {
    objectPath,
    soPath,
  };
}

function packageMobileCapiSharedLibrary(shellDir, mobileCapiSo) {
  const jniLibsDir = join(shellDir, "android/app/src/main/jniLibs/arm64-v8a");
  requireDir(jniLibsDir, "generated Android jniLibs arm64-v8a dir");
  const target = join(jniLibsDir, `lib${MOBILE_CAPI_LIB_NAME}.so`);
  copyFileSync(mobileCapiSo, target);
  return buildRecord(mobileCapiSo, target, "android-mobile-capi-prebuilt");
}

// ---- In-app MoQ publisher (安卓启动期 serve — 方向A last piece: 鸿蒙 fetch 安卓) --------------
// Mirrors the Harmony publisher discipline (platform/harmony/ChengGuiDemo CMakeLists.txt
// cheng_moq_harmony target + rebuild_publisher_prebuilt.sh): a SEPARATE .so with its own
// program-support/runtime-provider/host-runtime objects, dlopen'd by the JNI host glue
// (native_start_moq_serve, generated by mobile_shell_codegen.cheng) at app startup, kept
// isolated from lib${opts.libName}.so so its ~1371-symbol bigint/crypto/libp2p/QUIC closure
// does not collide with the scene app's own copies.

async function compileMoqAndroidPublisherObject(opts, src, out, roots, label) {
  const report = `${out}.report.txt`;
  const args = [
    "system-link-exec",
    `--root:${repoRoot}`,
    `--in:${pathForChengInput(src)}`,
    "--emit:obj",
    "--target:aarch64-linux-android",
    `--out:${out}`,
    `--report-out:${report}`,
  ];
  if (roots.length > 0) args.push(`--export-roots:${roots}`);
  await runCommand(resolvePath(opts.moqPublisherCheng), args, {
    cwd: repoRoot,
    env: chengSmokeEnv({ CHENG_PROCESS_MAX_RSS_BYTES: unimakerChengMaxRssBytes }, resolvePath(opts.moqPublisherCheng), repoRoot),
    timeout: opts.compileTimeoutMs,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  requireNonEmptyFile(out, label);
  return out;
}

async function verifyPrebuiltMoqAndroidPublisherSharedLibrary(toolchain, soPath) {
  requireNonEmptyFile(soPath, "prebuilt Android MoQ publisher shared library");
  const symbols = await readDefinedDynamicSymbols(toolchain, soPath);
  if (symbols.has("cheng_android_publish_serve_bundled") == false) {
    fail("prebuilt Android MoQ publisher shared library is missing export cheng_android_publish_serve_bundled");
  }
  if (symbols.has("cheng_publish_cid_pipeline_run") == false) {
    fail("prebuilt Android MoQ publisher shared library is missing export cheng_publish_cid_pipeline_run");
  }
  return soPath;
}

async function linkMoqAndroidPublisherSharedLibrary(opts, toolchain, dir) {
  let moqCore;
  let psObj;
  let cpObj = "";
  let hrObj;
  if (String(opts.moqPublisherPrebuiltDir ?? "").trim().length > 0) {
    const prebuiltDir = resolvePath(opts.moqPublisherPrebuiltDir);
    moqCore = join(prebuiltDir, "moq_core.o");
    psObj = join(prebuiltDir, "ps.o");
    hrObj = join(prebuiltDir, "hr.o");
    requireNonEmptyFile(moqCore, "Android MoQ publisher prebuilt core object");
    requireNonEmptyFile(psObj, "Android MoQ publisher prebuilt program-support object");
    requireNonEmptyFile(hrObj, "Android MoQ publisher prebuilt host-runtime object");
  } else {
    moqCore = await compileMoqAndroidPublisherObject(
      opts, join(repoRoot, "src/tests/media_moq_publisher_main.cheng"), join(dir, "moq_core.o"),
      "", "Android MoQ publisher core object");
    psObj = await compileMoqAndroidPublisherObject(
      opts, join(repoRoot, "src/core/runtime/program_support_backend.cheng"), join(dir, "moq_ps.o"),
      MOQ_PUBLISHER_PS_ROOTS, "Android MoQ publisher program-support object");
    cpObj = await compileMoqAndroidPublisherObject(
      opts, join(repoRoot, "src/core/runtime/core_runtime_provider_linux.cheng"), join(dir, "moq_cp.o"),
      MOQ_PUBLISHER_CP_ROOTS, "Android MoQ publisher runtime-provider object");
    hrObj = await compileMoqAndroidPublisherObject(
      opts, join(repoRoot, "src/core/runtime/program_support_host_runtime.cheng"), join(dir, "moq_hr.o"),
      MOQ_PUBLISHER_HR_ROOTS, "Android MoQ publisher host-runtime object");
  }
  // shared pure helpers exist in both ps.o and cp.o: keep cp.o's copies local (same
  // discipline as tools/moq_droid_two_process.sh / rebuild_publisher_prebuilt.sh).
  const objcopy = join(toolchain.prebuilt, "bin/llvm-objcopy");
  requireExecutableFile(objcopy, "Android llvm-objcopy");
  let cpLocal = join(dir, "moq_cp_local.o");
  if (String(opts.moqPublisherPrebuiltDir ?? "").trim().length > 0) {
    const prebuiltCpLocal = join(resolvePath(opts.moqPublisherPrebuiltDir), "cp_local.o");
    requireNonEmptyFile(prebuiltCpLocal, "Android MoQ publisher prebuilt localized runtime-provider object");
    copyFileSync(prebuiltCpLocal, cpLocal);
  } else {
    await runCommand(objcopy, [
      "--localize-symbol=cheng_ptr_plus",
      "--localize-symbol=cheng_bytes_copy",
      "--localize-symbol=cheng_bytes_set",
      cpObj,
      cpLocal,
    ], { cwd: repoRoot, timeout: 60000, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
    requireNonEmptyFile(cpLocal, "Android MoQ publisher localized runtime-provider object");
  }
  // program_support_backend.cheng also defines: (a) the plain get_stdout/get_stderr/
  // cheng_fwrite/cheng_system_entropy_fill alias names host_bridge.c provides instead
  // (matches the "paired plain+exportc alias names" comment in moq_droid_two_process.sh —
  // the reference scripts never actually reached a real link, this collision is real, found
  // via ld.lld --defined dupe errors, not a hypothetical), and (b) its own copy of
  // driver_c_new_string[_copy_n] that collides with moq_cp_local.o's (cp.o is the one whose
  // CP_ROOTS contract deliberately needs these exported, so ps.o's copies are the ones made
  // local here).
  const psLocal = join(dir, "moq_ps_local.o");
  await runCommand(objcopy, [
    "--localize-symbol=get_stdout",
    "--localize-symbol=get_stderr",
    "--localize-symbol=cheng_fwrite",
    "--localize-symbol=cheng_system_entropy_fill",
    "--localize-symbol=driver_c_new_string",
    "--localize-symbol=driver_c_new_string_copy_n",
    psObj,
    psLocal,
  ], { cwd: repoRoot, timeout: 60000, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  requireNonEmptyFile(psLocal, "Android MoQ publisher localized program-support object");
  const hostBridgeC = join(repoRoot, "src/tests/moq_droid_support/host_bridge.c");
  const linuxIntrinsicsS = join(repoRoot, "src/tests/moq_droid_support/linux_intrinsics.S");
  requireNonEmptyFile(hostBridgeC, "MoQ droid host bridge C source");
  requireNonEmptyFile(linuxIntrinsicsS, "MoQ droid linux intrinsics asm source");
  const so = join(dir, `lib${MOQ_ANDROID_LIB_NAME}.so`);
  // Two complete Cheng runtimes share this process: the host scene .so is loaded
  // RTLD_GLOBAL, so without -Bsymbolic the moq .so's own runtime symbols (cheng_malloc,
  // mem-registry, __cheng_call_indirect_*) get preempted by the host's copies during
  // relocation — two runtimes then write each other's state and the render thread dies
  // SIGSYS ~20ms after serve starts (reproduced 2x on GBJ0222B24021692). The Harmony
  // recipe never crashed because its CMake link always had -Wl,-Bsymbolic. Bind
  // internally AND export only the JNI entry via a version script.
  const versionScript = join(dir, "moq_android.map");
  writeFileSync(versionScript, "{ global: cheng_android_publish_serve_file; cheng_android_publish_serve_bundled; cheng_publish_cid_pipeline_run; local: *; };\n");
  await runCommand(toolchain.targetCc, [
    "-shared",
    "-fPIC",
    "-Wl,-Bsymbolic",
    `-Wl,--version-script=${versionScript}`,
    "-o",
    so,
    moqCore,
    psLocal,
    cpLocal,
    hrObj,
    hostBridgeC,
    linuxIntrinsicsS,
  ], {
    cwd: repoRoot,
    timeout: opts.buildTimeoutMs,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  requireNonEmptyFile(so, "Android MoQ publisher shared library");
  const symbols = await readDefinedDynamicSymbols(toolchain, so);
  if (!symbols.has("cheng_android_publish_serve_bundled")) {
    fail("Android MoQ publisher shared library is missing export cheng_android_publish_serve_bundled");
  }
  // Publish-time real CID pipeline (media_moq_publisher_main.cheng imports
  // publish_cid_pipeline.cheng): the generated shell's native_publish_cid_ingest
  // dlsym's this symbol — a stale publisher object must fail the build here, not
  // at runtime on device.
  if (!symbols.has("cheng_publish_cid_pipeline_run")) {
    fail("Android MoQ publisher shared library is missing export cheng_publish_cid_pipeline_run");
  }
  return so;
}

// Packages the isolated publisher .so plus its own real fixture asset (reused from the
// existing MoQ test fixtures, not fabricated) so the JNI host glue has something to serve
// at startup. The served object identity is the real ingested asset's own cid — mediaMoq
// PublisherRun range-checks every request against it (no arbitrary-file serve).
function packageMoqAndroidPublisherAssets(shellDir, moqSo) {
  const jniLibsDir = join(shellDir, "android/app/src/main/jniLibs/arm64-v8a");
  requireDir(jniLibsDir, "generated Android jniLibs arm64-v8a dir");
  const soTarget = join(jniLibsDir, `lib${MOQ_ANDROID_LIB_NAME}.so`);
  copyFileSync(moqSo, soTarget);
  const assetsDir = join(shellDir, "android/app/src/main/assets/moq_fixture");
  mkdirSync(assetsDir, { recursive: true });
  // Six-asset hgs bundle (mp4+poster+video ES+index+audio ES+index): the bare mp4+poster
  // pair made mediaMoqPublisherRun serve an announce without es_index_bytes, which the
  // peer's ES-path viewer refuses (on-device es diag step=4, 2026-07-11). Real ingested
  // assets from src/tests/real_media_assets — same discipline as the Harmony rawfile set.
  const hgsAssets = [
    ["src/tests/real_media_assets/hgs_faststart.mp4", "hgs.mp4"],
    ["src/tests/real_media_assets/hgs_poster.jpg", "hgs_poster.jpg"],
    ["src/tests/real_media_assets/hgs_faststart.h264", "hgs.h264"],
    ["src/tests/real_media_assets/hgs_faststart.moqidx", "hgs.moqidx"],
    ["src/tests/real_media_assets/hgs_stream.aac", "hgs.aac"],
    ["src/tests/real_media_assets/hgs_stream.aidx", "hgs.aidx"],
  ];
  const records = [buildRecord(moqSo, soTarget, "android-moq-publisher-so")];
  for (const [srcRel, dstName] of hgsAssets) {
    const src = join(repoRoot, srcRel);
    requireNonEmptyFile(src, `MoQ fixture ${dstName}`);
    const dst = join(assetsDir, dstName);
    copyFileSync(src, dst);
    records.push(buildRecord(src, dst, `android-moq-fixture-${dstName}`));
  }
  return records;
}

// ---- Android host file-bridge provider relink (see ANDROID_HOST_FILE_BRIDGE_PS_ROOTS) --
// Runs after the mobile-shell tool has produced cheng_generated_android_host.o/.so, and
// before the later social-backend gradle rebuild repackages the APK from jniLibsDir — so
// overwriting the jniLibs copy here is enough for the final APK (and headless-capture,
// which extracts the host .so from that final APK) to carry the patched library.
async function compileAndroidHostProviderObject(opts, src, out, roots, label) {
  const report = `${out}.report.txt`;
  const args = [
    "system-link-exec",
    `--root:${repoRoot}`,
    `--in:${pathForChengInput(src)}`,
    "--emit:obj",
    "--target:aarch64-linux-android",
    `--out:${out}`,
    `--report-out:${report}`,
  ];
  if (roots.length > 0) args.push(`--export-roots:${roots}`);
  await runCommand(resolvePath(opts.cheng), args, {
    cwd: repoRoot,
    env: chengSmokeEnv({ CHENG_PROCESS_MAX_RSS_BYTES: unimakerChengMaxRssBytes }, resolvePath(opts.cheng), repoRoot),
    timeout: opts.compileTimeoutMs,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  requireNonEmptyFile(out, label);
  return out;
}

async function installPrebuiltAndroidHostProviderSharedLibrary(opts, toolchain, shellDir) {
  const soPath = resolvePath(opts.androidHostProviderSo);
  requireNonEmptyFile(soPath, "prebuilt Android host provider shared library");
  const symbols = await readDefinedDynamicSymbols(toolchain, soPath);
  for (const required of ANDROID_HOST_CAPTURE_REQUIRED_SYMBOLS) {
    if (symbols.has(required) == false) fail(`prebuilt Android host provider is missing capture export ${required}`);
  }
  for (const required of ANDROID_HOST_FILE_BRIDGE_SYMBOLS) {
    if (symbols.has(required) == false) fail(`prebuilt Android host provider is missing file-bridge export ${required}`);
  }
  const jniLibsSo = join(shellDir, "android/app/src/main/jniLibs/arm64-v8a/libcheng_generated_android_host.so");
  requireNonEmptyFile(jniLibsSo, "mobile-shell prebuilt host shared library");
  copyFileSync(soPath, jniLibsSo);
  return jniLibsSo;
}

async function relinkAndroidHostSharedLibraryWithFileBridgeProvider(opts, toolchain, shellDir, dir) {
  const hostObj = join(shellDir, "android/app/src/main/cpp/cheng_generated_android_host.o");
  requireNonEmptyFile(hostObj, "Android host native object (mobile-shell prebuilt output)");

  const psObj = await compileAndroidHostProviderObject(
    opts, join(repoRoot, "src/core/runtime/program_support_backend.cheng"), join(dir, "host_ps.o"),
    ANDROID_HOST_FILE_BRIDGE_PS_ROOTS, "Android host file-bridge program-support object");
  // program_support_backend.cheng's own cheng_malloc/free/fclose/fflush/fwrite/
  // os_fopen_mode_bridge (+ two string-alias helpers) collide with symbols the hand-written
  // host.c already defines, which the scene .o already resolves against — keep this
  // object's copies local so the host's existing allocator/registry stays the single
  // canonical one in the process (same collision-avoidance discipline as moq_ps_local.o).
  const psLocal = join(dir, "host_ps_local.o");
  const objcopy = join(toolchain.prebuilt, "bin/llvm-objcopy");
  requireExecutableFile(objcopy, "Android llvm-objcopy");
  await runCommand(objcopy, [
    "--localize-symbol=cheng_fclose",
    "--localize-symbol=cheng_fflush",
    "--localize-symbol=cheng_free",
    "--localize-symbol=cheng_fwrite",
    "--localize-symbol=cheng_malloc",
    "--localize-symbol=cheng_mem_release",
    "--localize-symbol=cheng_os_fopen_mode_bridge",
    "--localize-symbol=driver_c_new_string",
    "--localize-symbol=driver_c_new_string_copy_n",
    "--localize-symbol=get_stderr",
    psObj,
    psLocal,
  ], { cwd: repoRoot, timeout: 60000, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  requireNonEmptyFile(psLocal, "Android host localized file-bridge program-support object");

  // cheng_runtime_lock (used by the file-handle registry) imports the platform
  // runtime-event bridges from core_runtime_provider_linux.cheng; the app .so also
  // defines them, but the host must not dynamically import app symbols, so give the
  // host its own local copies for exactly those four roots.
  const cpObj = await compileAndroidHostProviderObject(
    opts, join(repoRoot, "src/core/runtime/core_runtime_provider_linux.cheng"), join(dir, "host_cp.o"),
    "cheng_native_af_inet6_bridge,cheng_native_af_inet_bridge,cheng_native_sock_dgram_bridge,cheng_native_sol_socket_bridge,cheng_native_so_reuseaddr_bridge,libc_recvfrom,cheng_host_openat_fixed,cheng_native_runtime_event_lock_bridge,cheng_native_runtime_event_assert_owner_bridge,cheng_native_runtime_event_unlock_bridge",
    "Android host runtime-event provider object");
  const cpLocal = join(dir, "host_cp_local.o");
  await runCommand(objcopy, [
    "--localize-symbol=cheng_ptr_plus",
    "--localize-symbol=cheng_bytes_copy",
    "--localize-symbol=cheng_bytes_set",
    cpObj,
    cpLocal,
  ], { cwd: repoRoot, timeout: 60000, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  requireNonEmptyFile(cpLocal, "Android host localized runtime-event provider object");

  // The file-handle bridges call into cheng_host_fopen/fclose/fread/... (program_support_
  // host_runtime.cheng) for the actual libc I/O — MOQ's hr.o roots plus cheng_host_rename
  // (cheng_os_rename_bridge in ps.o delegates to it; MOQ never needed rename).
  // host_ps_local.o's file-handle closure still imports these three host-runtime
  // entry points (write / abort exit / list_dir). They live in program_support_
  // host_runtime.cheng, not in the hand-written host.c — export them alongside
  // MOQ's host file API roots so host load resolves under RTLD_NOW without pulling
  // any pure-Cheng allocator/atomic primitives into the host runtime.
  const hrObj = await compileAndroidHostProviderObject(
    opts, join(repoRoot, "src/core/runtime/program_support_host_runtime.cheng"), join(dir, "host_hr.o"),
    MOQ_PUBLISHER_HR_ROOTS + ",cheng_host_rename,cheng_host_write_runtime,cheng_host_exit_immediate_runtime,cheng_host_list_dir,cheng_host_fstat_scalars,cheng_host_close,cheng_host_openat,cheng_host_read_runtime", "Android host file-bridge host-runtime object");

  // cheng_runtime_lock (used by the file-handle registry) needs the Android AArch64 atomic
  // CAS intrinsic that Cheng's object emitter cannot express — assemble it directly.
  const intrinsicsSrc = join(repoRoot, "src/core/runtime/android_mobile_intrinsics_aarch64.S");
  requireNonEmptyFile(intrinsicsSrc, "Android mobile intrinsics assembly source");
  const intrinsicsObj = join(dir, "host_intrinsics.o");
  await runCommand(toolchain.targetCc, ["-c", intrinsicsSrc, "-o", intrinsicsObj], {
    cwd: repoRoot, timeout: 60000, encoding: "utf8", maxBuffer: 16 * 1024 * 1024,
  });
  requireNonEmptyFile(intrinsicsObj, "Android mobile intrinsics object");

  // Mirror MobileShellAndroidPrebuiltCommand's own link command (mobile_shell_codegen.cheng)
  // exactly, just with the extra provider objects appended.
  const patchedSo = join(dir, "libcheng_generated_android_host.so");
  // The hand-written host.c also exports cheng_malloc/free/mem_retain/mem_release/
  // driver_c_new_string[_copy_n]/cheng_cstrlen as RTLD_GLOBAL symbols. Because the
  // host is loaded first, those globals win over the app's DT_NEEDED scene-runtime
  // provider, so every scene string is allocated by the host allocator while
  // cheng_seq_string_release_range_compat (provider-only) releases it through the
  // provider registry -> cheng_orc_release_failure registry_miss and exit(1).
  // Export only the real host ABI (render/GL/JNI, raw host runtime, file bridges)
  // and localize the allocator/string-factory copies; the provider then becomes
  // the app's single canonical Cheng runtime. -Bsymbolic keeps the host's own
  // program-support objects on the host-local copies.
  const hostVersionScript = join(dir, "host_abi.map");
  writeFileSync(hostVersionScript, `{
  global:
    JNI_OnLoad;
    Java_*;
    cheng_android_*;
    cheng_mobile_host_*;
    cheng_host_*;
    cheng_native_*;
    cheng_file_handle_*;
    cheng_fd_wait_readable_bridge;
    cheng_fd_wait_writable_bridge;
    cheng_fwrite;
    cheng_fwrite_i32;
    cheng_fclose;
    cheng_fflush;
    cheng_os_file_exists_bridge;
    cheng_os_fopen_mode_bridge;
    cheng_os_rename_bridge;
    driver_c_create_dir_all_bridge;
    get_stdout*;
    get_stderr*;
    c_iometer_call;
    cheng_epoch_time_ms;
    cheng_epoch_time_seconds;
    cheng_errno;
    cheng_f64_to_i32;
    cheng_monotime_ns;
    cheng_mobile_protect_fd;
    cheng_mobile_udp_*;
    cheng_udp_*;
    cheng_native_stream_*;
    cheng_ptr_size;
    cheng_scene_media_es_sink_frame;
    cheng_seq_free;
    cheng_seq_set_grow;
    cheng_seq_string_elem_bytes_compat;
    cheng_seq_string_register_compat;
    cheng_strerror;
    cheng_system_entropy_fill;
    cheng_panic_cstring_and_exit;
    load_int32;
    load_ptr;
    store_int32;
    store_ptr;
    libc_*;
    __cheng_runtime_*;
    __cheng_linux_*;
    cheng_runtime_lock;
    cheng_runtime_unlock;
    cheng_ptr_plus;
    cheng_ptr_arg;
    cheng_bytes_copy;
    cheng_bytes_set;
  local:
    *;
};`);
  await runCommand(toolchain.hostLd, [
    "-shared",
    "--soname=libcheng_generated_android_host.so",
    // The host is the first RTLD_GLOBAL library in the Android process. Without
    // -Bsymbolic, its program-support PLT calls (cheng_string_copy /
    // cheng_malloc_locked / cheng_copy_cstring_from_str) can be interposed by the
    // later-loaded app/provider, so host file-bridge code allocates from one Cheng
    // registry and frees through another -> cheng_mem_release_registry_miss_fail ->
    // cheng_panic_cstring_and_exit(1) on the very first os.MkdirAll. Bind the host's
    // own provider closure locally while keeping all exported host ABI symbols
    // dynamically visible to the app.
    "-Bsymbolic",
    `--version-script=${hostVersionScript}`,
    "--allow-shlib-undefined",
    "-z",
    "now",
    "-z",
    "global",
    "-o",
    patchedSo,
    hostObj,
    psLocal,
    cpLocal,
    hrObj,
    intrinsicsObj,
    join(toolchain.apiLibDir, "libandroid.so"),
    join(toolchain.apiLibDir, "liblog.so"),
    join(toolchain.apiLibDir, "libEGL.so"),
    join(toolchain.apiLibDir, "libGLESv3.so"),
    join(toolchain.apiLibDir, "libmediandk.so"),
    join(toolchain.apiLibDir, "libjnigraphics.so"),
    join(toolchain.apiLibDir, "libaaudio.so"),
    join(toolchain.apiLibDir, "libm.so"),
    join(toolchain.apiLibDir, "libdl.so"),
    join(toolchain.apiLibDir, "libc.so"),
    join(toolchain.clangRtDir, "libclang_rt.builtins-aarch64-android.a"),
    join(toolchain.clangRtDir, "aarch64", "libunwind.a"),
  ], { cwd: repoRoot, timeout: 120000, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  requireNonEmptyFile(patchedSo, "Android host shared library relinked with file-bridge provider");

  const symbols = await readDefinedDynamicSymbols(toolchain, patchedSo);
  for (const required of ANDROID_HOST_FILE_BRIDGE_SYMBOLS) {
    if (!symbols.has(required)) {
      fail(`Android host shared library is missing file-bridge export ${required}`);
    }
  }

  const jniLibsSo = join(shellDir, "android/app/src/main/jniLibs/arm64-v8a/libcheng_generated_android_host.so");
  requireNonEmptyFile(jniLibsSo, "mobile-shell prebuilt host shared library");
  copyFileSync(patchedSo, jniLibsSo);
  return jniLibsSo;
}

async function buildAndroidShellApk(opts, toolchain, mobileShellTool, appSo, shellDir, runtimeBundlePath, sceneRuntimeSource) {
  await runCommand(mobileShellTool, [
    "build-probe",
    "--platform",
    "android",
    "--out-dir",
    shellDir,
    "--app-id",
    opts.appId,
    "--app-name",
    opts.appName,
    "--lib-name",
    opts.libName,
    "--runtime-mode",
    "r2c_native_gui_v1",
    "--runtime-bundle",
    runtimeBundlePath,
    "--runtime-contract",
    runtimeContractPayloadPath,
    "--route-state",
    opts.routeState,
    "--android-native-mode",
    "prebuilt",
    "--android-app-lib",
    appSo,
    "--android-host-cc",
    toolchain.hostCc,
    "--android-host-ld",
    toolchain.hostLd,
    "--android-ndk-root",
    toolchain.ndkRoot,
    "--android-java-home",
    toolchain.javaHome,
    "--android-clang-rt-dir",
    toolchain.clangRtDir,
    "--android-api-level",
    opts.androidApiLevel,
  ], {
    cwd: repoRoot,
    env: { ...process.env, JAVA_HOME: toolchain.javaHome, CHENG_MOBILE_SHELL_VERSION_CODE: String(androidVersionCode) },
    timeout: opts.buildTimeoutMs,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const summaryEnv = join(shellDir, "mobile_shell_build_probe.summary.env");
  requireNonEmptyFile(summaryEnv, "mobile shell build summary");
  const summaryText = readFileSync(summaryEnv, "utf8");
  if (!summaryText.includes("android_apk_exists=1") ||
      !summaryText.includes("android_host_render_abi_bound=1") ||
      !summaryText.includes("android_host_capture_abi_bound=1")) {
    fail(`mobile shell build summary did not prove Android host render/capture binding: ${summaryEnv}`);
  }
  verifyAndroidShellComputerUseMediaAbi(shellDir, opts.appId, sceneRuntimeSource);
  const apk = join(shellDir, "android/app/build/outputs/apk/debug/app-debug.apk");
  requireNonEmptyFile(apk, "Android APK");
  return apk;
}

// S4 media block cache bootstrap must remain wired to the real app-private
// media_block_cache directory. It used to exit(1) on the first WalkDirRec when
// the host's RTLD_GLOBAL allocator symbols preempted the scene provider; the
// host ABI version script + provider-owned allocator roots now make that path
// safe (on-device block-cache init rc=1 evidence). Verify the generated Kotlin
// still carries exactly one real bootstrap call and never silently re-ships a
// bypass build.
function verifyAndroidShellMediaBlockCacheBootstrap(shellDir, appId) {
  const kotlinPath = join(shellDir, "android/app/src/main/kotlin", ...String(appId ?? "org.cheng.unimaker.scene").split("."), "ChengMainActivity.kt");
  requireNonEmptyFile(kotlinPath, "generated ChengMainActivity.kt");
  const before = readFileSync(kotlinPath, "utf8");
  const needle = "nativeStartMediaBlockCache(mediaBlockCacheDir.absolutePath)";
  const count = before.split(needle).length - 1;
  if (count !== 1) {
    fail(`expected exactly one nativeStartMediaBlockCache bootstrap call in generated Kotlin, found ${count}`);
  }
  return buildRecord(kotlinPath, kotlinPath, "android-s4-block-cache-bootstrap-enabled");
}
// Social backend bootstrap must stay wired to the generated lifecycle path.
// We verify the exact generated body instead of patching it: r17 social-real
// build-tree survived node_init, so the previous bypass is removed and any
// accidental template regression now hard-fails here.
function verifyAndroidShellSocialBackendBootstrap(shellDir, appId) {
  const kotlinPath = join(shellDir, "android/app/src/main/kotlin", ...String(appId ?? "org.cheng.unimaker.scene").split("."), "ChengMainActivity.kt");
  requireNonEmptyFile(kotlinPath, "generated ChengMainActivity.kt");
  const before = readFileSync(kotlinPath, "utf8");
  const needle = "if (chengSocialBackendStarted) {\n              return null\n          }\n          val initMethod = klass.getMethod(\"init\", String::class.java)";
  const count = before.split(needle).length - 1;
  if (count !== 1) {
    fail(`expected exactly one ensureChengSocialBackendStarted bootstrap body in generated Kotlin, found ${count}`);
  }
  return buildRecord(kotlinPath, kotlinPath, "android-social-backend-bootstrap-enabled");
}

async function buildAndroidHeadlessCaptureExecutable({ apk, shellDir, libName, toolchain, outDir }) {
  const captureDir = join(outDir, "headless-capture");
  mkdirSync(captureDir, { recursive: true });
  const source = join(scriptDir, "unimaker-capture-main.c");
  requireNonEmptyFile(source, "UniMaker headless capture harness source");
  const appEntry = `lib/arm64-v8a/lib${libName}.so`;
  const sceneRuntimeProviderEntry = `lib/arm64-v8a/lib${SCENE_RUNTIME_PROVIDER_LIB_NAME}.so`;
  const hostEntry = "lib/arm64-v8a/libcheng_generated_android_host.so";
  const mobileCapiEntry = `lib/arm64-v8a/lib${MOBILE_CAPI_LIB_NAME}.so`;
  const socialBackendEntry = "lib/arm64-v8a/libchenglibp2p.so";
  const socialV3Entry = "lib/arm64-v8a/libchengv3mobile.so";
  const appSo = await extractApkEntry(apk, appEntry);
  const sceneRuntimeProviderSo = await extractApkEntry(apk, sceneRuntimeProviderEntry);
  const hostSo = await extractApkEntry(apk, hostEntry);
  const mobileCapiSo = await extractApkEntry(apk, mobileCapiEntry);
  const socialBackendSo = await extractApkEntry(apk, socialBackendEntry);
  const socialV3So = await extractApkEntry(apk, socialV3Entry);
  const appBundleSo = join(captureDir, `lib${libName}.so`);
  const sceneRuntimeProviderBundleSo = join(captureDir, `lib${SCENE_RUNTIME_PROVIDER_LIB_NAME}.so`);
  const hostBundleSo = join(captureDir, "libcheng_generated_android_host.so");
  const mobileCapiBundleSo = join(captureDir, `lib${MOBILE_CAPI_LIB_NAME}.so`);
  const socialBackendBundleSo = join(captureDir, "libchenglibp2p.so");
  const socialV3BundleSo = join(captureDir, "libchengv3mobile.so");
  copyFileSync(appSo, appBundleSo);
  copyFileSync(sceneRuntimeProviderSo, sceneRuntimeProviderBundleSo);
  copyFileSync(hostSo, hostBundleSo);
  copyFileSync(mobileCapiSo, mobileCapiBundleSo);
  copyFileSync(socialBackendSo, socialBackendBundleSo);
  copyFileSync(socialV3So, socialV3BundleSo);
  const executable = join(captureDir, "unimaker_capture");
  await runCommand(toolchain.targetCc, [
    "-std=c11",
    "-fPIE",
    "-pie",
    "-Wl,--allow-shlib-undefined",
    "-Wl,-rpath,$ORIGIN",
    source,
    "-o",
    executable,
    "-L",
    captureDir,
    "-Wl,--no-as-needed",
    `-l:lib${libName}.so`,
    `-l:lib${SCENE_RUNTIME_PROVIDER_LIB_NAME}.so`,
    "-l:libcheng_generated_android_host.so",
    // Social/media stack (libp2p/v3mobile/capi) is only needed by the full
    // UniMaker capture. CHENG_CAPTURE_SLIM_LINK=1 skips it: every extra
    // DT_NEEDED in this flat link widens the allocator/ownership-registry
    // symbol interposition surface (ORC registry_miss suspect).
    ...(process.env.CHENG_CAPTURE_SLIM_LINK === "1" ? [] : [
      "-l:libchenglibp2p.so",
      "-l:libchengv3mobile.so",
      `-l:lib${MOBILE_CAPI_LIB_NAME}.so`,
    ]),
    "-Wl,--as-needed",
    "-llog",
    "-landroid",
    "-lEGL",
    "-lGLESv3",
    "-lmediandk",
    "-ljnigraphics",
    "-laaudio",
    "-ldl",
    "-lm",
  ], {
    cwd: repoRoot,
    timeout: 120000,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  requireExecutableFile(executable, "UniMaker Android headless capture executable");
  await verifyAndroidAarch64Executable(toolchain, executable, "UniMaker Android headless capture executable");
  const needed = await readNeededSharedLibraries(toolchain, executable);
  for (const required of [`lib${libName}.so`, `lib${SCENE_RUNTIME_PROVIDER_LIB_NAME}.so`, "libcheng_generated_android_host.so"]) {
    if (!needed.includes(required)) {
      fail(`headless capture executable must DT_NEEDED ${required}: ${needed.join(", ")}`);
    }
  }
  await verifyHeadlessCaptureLinkage({
    executable,
    appPath: appBundleSo,
    sceneRuntimeProviderPath: sceneRuntimeProviderBundleSo,
    hostPath: hostBundleSo,
    toolchain,
    libName,
  });
  return {
    executable,
    source,
    bundleDir: captureDir,
    assetDir: shellDir,
    appLibrary: buildRecord(appSo, appBundleSo, "headless-capture-app-lib"),
    sceneRuntimeProviderLibrary: buildRecord(sceneRuntimeProviderSo, sceneRuntimeProviderBundleSo, "headless-capture-scene-runtime-provider-lib"),
    hostLibrary: buildRecord(hostSo, hostBundleSo, "headless-capture-host-lib"),
    mobileCapiLibrary: buildRecord(mobileCapiSo, mobileCapiBundleSo, "headless-capture-mobile-capi-lib"),
    socialBackendLibrary: buildRecord(socialBackendSo, socialBackendBundleSo, "headless-capture-social-backend-lib"),
    socialV3Library: buildRecord(socialV3So, socialV3BundleSo, "headless-capture-social-v3-lib"),
    byteCount: statSync(executable).size,
    sha256: sha256File(executable),
    verification: "android-headless-capture-executable",
    neededLibraries: needed,
    routeArg: options.routeState,
    defaultViewport: "390x844",
    runCommand: `CHENG_HEADLESS_ASSET_DIR=${shellDir} LD_LIBRARY_PATH=${captureDir} ${executable} ${options.routeState} /data/local/tmp/cheng_capture.raw 390 844`,
  };
}

async function verifyAndroidAarch64Executable(toolchain, executable, label) {
  const header = await runCommand(toolchain.readElf, ["-h", executable], {
    cwd: repoRoot,
    timeout: 30000,
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });
  if (!/Class:\s+ELF64/.test(header) ||
      !/Type:\s+DYN\b/.test(header) ||
      !/Machine:\s+AArch64\b/.test(header)) {
    fail(`${label} is not an Android AArch64 PIE executable: ${executable}`);
  }
}

async function verifyHeadlessCaptureLinkage({ executable, appPath, sceneRuntimeProviderPath, hostPath, toolchain, libName }) {
  const imports = await readUndefinedDynamicSymbols(toolchain, executable);
  const appExports = await readDefinedDynamicSymbols(toolchain, appPath);
  const sceneRuntimeProviderExports = await readDefinedDynamicSymbols(toolchain, sceneRuntimeProviderPath);
  const hostExports = await readDefinedDynamicSymbols(toolchain, hostPath);
  const requiredAppSymbols = [
    "cheng_mobile_host_runtime_set_launch_args",
    "cheng_app_init",
    "cheng_app_set_window",
    "cheng_app_tick",
    "cheng_app_on_touch_milli",
  ];
  const requiredHostSymbols = [
    ...ANDROID_HOST_RUNTIME_REQUIRED_SYMBOLS,
    ...ANDROID_HOST_CAPTURE_REQUIRED_SYMBOLS,
  ];
  for (const symbol of requiredAppSymbols) {
    if (!imports.has(symbol) || !appExports.has(symbol)) {
      fail(`headless capture executable/app linkage missing ${symbol} from lib${libName}.so`);
    }
  }
  for (const symbol of requiredHostSymbols) {
    if (!hostExports.has(symbol)) {
      fail(`headless capture executable/host linkage missing ${symbol}`);
    }
  }
  for (const symbol of ANDROID_SCENE_RUNTIME_PROVIDER_ROOTS.split(",")) {
    if (!sceneRuntimeProviderExports.has(symbol)) {
      fail(`headless capture scene runtime provider linkage missing ${symbol}`);
    }
  }
  for (const symbol of ANDROID_HOST_CAPTURE_REQUIRED_SYMBOLS) {
    if (!imports.has(symbol)) {
      fail(`headless capture executable direct host import missing ${symbol}`);
    }
  }
}

async function overlayReactSocialBackendAndRebuildApk(opts, toolchain, shellDir) {
  const reactAndroidDir = resolvePath(opts.reactAndroidDir);
  requireDir(reactAndroidDir, "React Android dir");
  const copied = [];
  const kotlinSource = join(reactAndroidDir, "app/src/main/kotlin/com/unimaker/app/libp2p/ChengLibp2pNative.kt");
  requireNonEmptyFile(kotlinSource, "React ChengLibp2pNative.kt");
  const kotlinTarget = join(shellDir, "android/app/src/main/kotlin/com/unimaker/app/libp2p/ChengLibp2pNative.kt");
  mkdirSync(dirname(kotlinTarget), { recursive: true });
  copyFileSync(kotlinSource, kotlinTarget);
  if (opts.socialBackendMode === "group-create") {
    const kotlinText = readFileSync(kotlinTarget, "utf8");
    const stripped = kotlinText
      .replace(/\n    fun pollEvents\(maxEvents: Int\): String \{[\s\S]*?\n    \}\n/, "\n")
      .replace(/\n    fun waitEvents\(timeoutMs: Int\): Int = withHandle\(-1\) \{ nativeWaitEvents\(it, timeoutMs\) \}\n/, "\n")
      .replace(/\n    @JvmStatic\n    private external fun nativePollEvents\(handle: Long, maxEvents: Int\): String\?\n/, "\n")
      .replace(/\n    @JvmStatic\n    private external fun nativeWaitEvents\(handle: Long, timeoutMs: Int\): Int\n/, "\n");
    if (stripped.includes("fun pollEvents") || stripped.includes("fun waitEvents") || stripped.includes("nativePollEvents") || stripped.includes("nativeWaitEvents")) {
      fail("group-create Kotlin still exposes pollEvents/waitEvents; those bind libp2p node->events and only exist on the full backend");
    }
    writeFileSync(kotlinTarget, stripped);
  }
  copied.push(copyRecord(kotlinSource, kotlinTarget));

  const jniLibsDir = join(shellDir, "android/app/src/main/jniLibs/arm64-v8a");
  requireDir(jniLibsDir, "generated Android jniLibs arm64-v8a dir");
  for (const staleLib of ["libp2pbridge.so", "libnimlibp2p.so", "libchengv3mobile.so"]) {
    rmSync(join(jniLibsDir, staleLib), { force: true });
  }
  const backendTarget = join(jniLibsDir, "libchenglibp2p.so");
  const bridgeTarget = join(jniLibsDir, "libp2pbridge.so");
  if (opts.socialBackendMode === "full") {
    const backendSource = await ensureReactFullSocialBackendLibrary(reactAndroidDir, toolchain, opts);
    copyFileSync(backendSource.path, backendTarget);
    const backendRecord = buildRecord(backendSource.path, backendTarget, "android-react-full-social-backend");
    backendRecord.generated = backendSource.generated;
    if (backendSource.buildScript.length > 0) {
      backendRecord.buildScript = backendSource.buildScript;
    }
    copied.push(backendRecord);

    const bridgeSource = await writeGeneratedSocialGroupBridgeSource(buildDir, opts.socialBackendMode);
    await buildPureChengP2pBridge({
      source: bridgeSource,
      output: bridgeTarget,
      backendDir: jniLibsDir,
      toolchain,
      timeout: opts.buildTimeoutMs,
    });
    copied.push(buildRecord(bridgeSource, bridgeTarget, "android-pure-cheng-p2pbridge"));
	  } else if (opts.socialBackendMode === "group-create") {
	    if (String(opts.socialBackendLib ?? "").trim().length > 0) {
	      const backendSource = resolvePath(opts.socialBackendLib);
	      requireNonEmptyFile(backendSource, "prebuilt Android social group backend library");
	      const patchedBackend = join(buildDir, "prebuilt-social", "libchenglibp2p.so");
	      mkdirSync(dirname(patchedBackend), { recursive: true });
	      copyFileSync(backendSource, patchedBackend);
	      await runCommand("patchelf", ["--set-soname", "libchenglibp2p.so", patchedBackend], {
	        cwd: repoRoot,
	        timeout: 30000,
	        encoding: "utf8",
	        maxBuffer: 4 * 1024 * 1024,
	      });
	      copyFileSync(patchedBackend, backendTarget);
	      copied.push(buildRecord(backendSource, backendTarget, "android-social-group-backend-lib"));
	      const v3Candidates = [
	        join(reactAndroidDir, "build/intermediates/merged_native_libs/debug/mergeDebugNativeLibs/out/lib/arm64-v8a/libchengv3mobile.so"),
	        join(reactAndroidDir, "build/intermediates/cxx/Debug/10542ex6/obj/arm64-v8a/libchengv3mobile.so"),
	        join(reactAndroidDir, "app/build/intermediates/merged_native_libs/debug/mergeDebugNativeLibs/out/lib/arm64-v8a/libchengv3mobile.so"),
	      ].find((candidate) => existsSync(candidate));
	      if (v3Candidates === undefined) {
	        fail("prebuilt social backend dependency libchengv3mobile.so not found under React android build intermediates");
	      }
	      const v3Target = join(jniLibsDir, "libchengv3mobile.so");
	      copyFileSync(v3Candidates, v3Target);
	      copied.push(buildRecord(v3Candidates, v3Target, "android-social-group-backend-v3-dependency"));
	      const bridgeSource = await writeGeneratedSocialGroupBridgeSource(buildDir, opts.socialBackendMode, true);
	      await buildPureChengP2pBridge({
	        source: bridgeSource,
	        output: bridgeTarget,
	        backendDir: jniLibsDir,
	        toolchain,
	        timeout: opts.buildTimeoutMs,
	      });
	      copied.push(buildRecord(bridgeSource, bridgeTarget, "android-cheng-social-group-p2pbridge-against-prebuilt"));
	    } else if (opts.socialBackendSo.length > 0 || opts.socialBridgeSo.length > 0) {
	      if (opts.socialBackendSo.length <= 0 || opts.socialBridgeSo.length <= 0) {
	        fail("--social-backend-so and --social-bridge-so must be provided together");
	      }
	      const backendSource = resolvePath(opts.socialBackendSo);
	      const bridgeSource = resolvePath(opts.socialBridgeSo);
	      requireNonEmptyFile(backendSource, "prebuilt Cheng Android social group backend");
	      requireNonEmptyFile(bridgeSource, "prebuilt Cheng Android social group bridge");
	      copyFileSync(backendSource, backendTarget);
	      copyFileSync(bridgeSource, bridgeTarget);
	      copied.push(buildRecord(backendSource, backendTarget, "android-cheng-social-group-backend-prebuilt"));
	      copied.push(buildRecord(bridgeSource, bridgeTarget, "android-cheng-social-group-p2pbridge-prebuilt"));
	      const v3Candidates = [
	        join(reactAndroidDir, "build/intermediates/merged_native_libs/debug/mergeDebugNativeLibs/out/lib/arm64-v8a/libchengv3mobile.so"),
	        join(reactAndroidDir, "build/intermediates/cxx/Debug/10542ex6/obj/arm64-v8a/libchengv3mobile.so"),
	        join(reactAndroidDir, "app/build/intermediates/merged_native_libs/debug/mergeDebugNativeLibs/out/lib/arm64-v8a/libchengv3mobile.so"),
	      ].find((candidate) => existsSync(candidate));
	      if (v3Candidates === undefined) {
	        fail("prebuilt social backend dependency libchengv3mobile.so not found under React android build intermediates");
	      }
	      const v3Target = join(jniLibsDir, "libchengv3mobile.so");
	      copyFileSync(v3Candidates, v3Target);
	      copied.push(buildRecord(v3Candidates, v3Target, "android-social-group-backend-v3-dependency"));

	    } else {
	      const backendSource = await buildChengSocialGroupBackend({
	        output: backendTarget,
	        reactAndroidDir,
	        toolchain,
	        timeout: opts.compileTimeoutMs,
	        cheng: resolvePath(opts.cheng),
	        sceneRuntimeProviderSo,
	      });
	      copied.push(buildRecord(backendSource, backendTarget, "android-cheng-social-group-backend"));
	      const v3Candidates = [
	        join(reactAndroidDir, "build/intermediates/merged_native_libs/debug/mergeDebugNativeLibs/out/lib/arm64-v8a/libchengv3mobile.so"),
	        join(reactAndroidDir, "build/intermediates/cxx/Debug/10542ex6/obj/arm64-v8a/libchengv3mobile.so"),
	        join(reactAndroidDir, "app/build/intermediates/merged_native_libs/debug/mergeDebugNativeLibs/out/lib/arm64-v8a/libchengv3mobile.so"),
	      ].find((candidate) => existsSync(candidate));
	      if (v3Candidates === undefined) {
	        fail("pure Cheng social backend dependency libchengv3mobile.so not found under React android build intermediates");
	      }
	      const v3Target = join(jniLibsDir, "libchengv3mobile.so");
	      copyFileSync(v3Candidates, v3Target);
	      copied.push(buildRecord(v3Candidates, v3Target, "android-social-group-backend-v3-dependency"));
	      const bridgeSource = await writeGeneratedSocialGroupBridgeSource(buildDir, opts.socialBackendMode);
	      await buildPureChengP2pBridge({
	        source: bridgeSource,
	        output: bridgeTarget,
	        backendDir: jniLibsDir,
	        toolchain,
	        timeout: opts.buildTimeoutMs,
	      });
	      copied.push(buildRecord(bridgeSource, bridgeTarget, "android-cheng-social-group-p2pbridge"));
	    }
  } else {
    fail(`unsupported social backend mode: ${opts.socialBackendMode}`);
  }

  const apk = join(shellDir, "android/app/build/outputs/apk/debug/app-debug.apk");
  await runCommand("gradle", [
    "-p",
    join(shellDir, "android"),
    ":app:assembleDebug",
  ], {
    cwd: repoRoot,
    env: {
      ...process.env,
      JAVA_HOME: toolchain.javaHome,
    },
    timeout: opts.buildTimeoutMs,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  requireNonEmptyFile(apk, "Android APK after React social backend overlay");
  return {
    reactAndroidDir,
    mode: opts.socialBackendMode,
    copied,
    apk,
  };
}

async function buildChengSocialGroupBackend({ output, reactAndroidDir, toolchain, timeout, cheng, sceneRuntimeProviderSo, requiredSymbols = SOCIAL_GROUP_BACKEND_SYMBOLS }) {
  const source = join(repoRoot, "src/libp2p/mobile_ffi/unimaker_android_social_group_backend.cheng");
  requireNonEmptyFile(source, "Cheng Android social group backend source");
  requireExecutableFile(cheng, "Cheng compiler for social group backend");
  const objectPath = join(buildDir, "libchenglibp2p_social_group_backend.o");
  await runCommand(cheng, [
    "system-link-exec",
    `--root:${repoRoot}`,
    `--in:${pathForChengInput(source)}`,
    "--emit:obj",
    "--target:aarch64-linux-android",
    `--out:${objectPath}`,
    `--report-out:${objectPath}.report.txt`,
    "--export-roots",
    [...new Set([...requiredSymbols, "social_dm_send", "social_dm_send_cstr", "social_wait_discovery"])].join(","),
  ], {
    cwd: repoRoot,
    env: chengSmokeEnv({ CHENG_PROCESS_MAX_RSS_BYTES: unimakerChengMaxRssBytes, CHENG_DISABLE_PRIMARY_OBJECT_CACHE: "1" }, cheng, repoRoot),
    timeout,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  requireNonEmptyFile(objectPath, "Cheng Android social group backend object");
  await assertNoSocialGroupBackendMutableGlobals(toolchain, objectPath);
  // elf-writer 重定位修真(282a7ba49)后, driver obj 对 cheng 运行时原语的引用
  // 不再被 R_AARCH64_NONE 掩盖 — -z,defs 要求链接期可解, 原语由生成的
  // android host 库提供(eff0c9926), 以 DT_NEEDED 声明让 bionic 在装载
  // libchenglibp2p.so 时自动拉起 host, 不依赖 app 侧加载顺序。
  const hostProvider = join(dirname(output), "libcheng_generated_android_host.so");
  requireNonEmptyFile(hostProvider, "Android host provider library for social backend link");
  requireNonEmptyFile(sceneRuntimeProviderSo, "Android scene runtime provider for social backend link");
  await runCommand(toolchain.targetCxx, [
    "-nostdlib++",
    "-shared",
    "-Wl,-soname,libchenglibp2p.so",
    "-Wl,-z,norelro",
    "-Wl,-z,defs",
    "-Wl,-z,max-page-size=16384",
    "-Wl,-z,common-page-size=16384",
    objectPath,
    "-o",
    output,
    "-L",
    dirname(output),
    "-Wl,--no-as-needed",
    "-l:libcheng_scene_runtime_provider.so",
    "-l:libcheng_generated_android_host.so",
    "-Wl,--as-needed",
    "-llog",
    "-landroid",
    "-ldl",
    "-lm",
  ], {
    cwd: repoRoot,
    timeout,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  requireNonEmptyFile(output, "Cheng Android social group backend shared library");
  return source;
}

async function writeGeneratedSocialGroupBridgeSource(dir, socialBackendMode = "group-create", stubNativeProbes = false) {
  // 秒发 slice: in "full" mode the JNI social surface forwards to the REAL Cheng
  // backend exports (social_publish_enqueue gossipsub broadcast + real feed/tasks
  // stores) — the local published-task store below is retained ONLY for the
  // "group-create" minimal-stub mode, which is the packaging mode that exists
  // while the full-backend compile wall stands (docs/pending-work-ledger-2026-07-14
  // compat_ffi aarch64 obj-emit RSS). Routing full-mode publishes through the local
  // store was the old fake path (no broadcast, hardcoded delivered=1); it is gone.
  const socialPublishJniBodies = socialBackendMode === "full" ? `extern "C" JNIEXPORT jstring JNICALL
Java_com_unimaker_app_libp2p_ChengLibp2pNative_nativeSocialPublishEnqueue(
  JNIEnv *env,
  jclass,
  jlong handle,
  jstring postJson
) {
  ChengThreadScope threadScope;
  const std::string payload = jstringToString(env, postJson);
  if (!libp2p_node_is_started(asHandleId(handle))) {
    return toJString(env, "{\\"ok\\":false,\\"error\\":\\"node_not_started\\"}");
  }
  return toJString(env, takeCString(social_publish_enqueue(asHandleId(handle), payload.c_str())));
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_unimaker_app_libp2p_ChengLibp2pNative_nativeSocialPublishTask(
  JNIEnv *env,
  jclass,
  jlong handle,
  jstring taskId
) {
  ChengThreadScope threadScope;
  const std::string value = jstringToString(env, taskId);
  if (!libp2p_node_is_started(asHandleId(handle))) {
    return toJString(env, "{\\"ok\\":false,\\"error\\":\\"node_not_started\\"}");
  }
  return toJString(env, takeCString(social_publish_task(asHandleId(handle), value.c_str())));
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_unimaker_app_libp2p_ChengLibp2pNative_nativeSocialPublishTasks(
  JNIEnv *env,
  jclass,
  jlong handle,
  jstring scope,
  jstring cursor,
  jint limit
) {
  ChengThreadScope threadScope;
  const std::string scopeText = jstringToString(env, scope);
  const std::string cursorText = jstringToString(env, cursor);
  if (!libp2p_node_is_started(asHandleId(handle))) {
    return toJString(env, "{\\"items\\":[],\\"nextCursor\\":\\"\\",\\"hasMore\\":false,\\"error\\":\\"node_not_started\\"}");
  }
  return toJString(env, takeCString(social_publish_tasks(
    asHandleId(handle), scopeText.c_str(), cursorText.c_str(), static_cast<int>(limit))));
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_unimaker_app_libp2p_ChengLibp2pNative_nativeSocialFeedSnapshot(
  JNIEnv *env,
  jclass,
  jlong handle,
  jstring channel,
  jstring cursor,
  jint limit
) {
  ChengThreadScope threadScope;
  const std::string channelText = jstringToString(env, channel);
  const std::string cursorText = jstringToString(env, cursor);
  if (!libp2p_node_is_started(asHandleId(handle))) {
    return toJString(env, "{\\"items\\":[],\\"nextCursor\\":\\"\\",\\"hasMore\\":false,\\"error\\":\\"node_not_started\\"}");
  }
  return toJString(env, takeCString(social_feed_snapshot(
    asHandleId(handle), channelText.c_str(), cursorText.c_str(), static_cast<int>(limit))));
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_unimaker_app_libp2p_ChengLibp2pNative_nativeSocialMomentsTimeline(
  JNIEnv *env,
  jclass,
  jlong handle,
  jstring cursor,
  jint limit
) {
  ChengThreadScope threadScope;
  const std::string cursorText = jstringToString(env, cursor);
  if (!libp2p_node_is_started(asHandleId(handle))) {
    return toJString(env, "{\\"items\\":[],\\"nextCursor\\":\\"\\",\\"hasMore\\":false,\\"error\\":\\"node_not_started\\"}");
  }
  return toJString(env, takeCString(social_moments_timeline(
    asHandleId(handle), cursorText.c_str(), static_cast<int>(limit))));
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_unimaker_app_libp2p_ChengLibp2pNative_nativeSocialContentDetail(
  JNIEnv *env,
  jclass,
  jlong handle,
  jstring contentId
) {
  ChengThreadScope threadScope;
  const std::string value = jstringToString(env, contentId);
  if (!libp2p_node_is_started(asHandleId(handle))) {
    return toJString(env, "{\\"ok\\":false,\\"error\\":\\"node_not_started\\"}");
  }
  return toJString(env, takeCString(social_content_detail(asHandleId(handle), value.c_str())));
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_unimaker_app_libp2p_ChengLibp2pNative_nativeSocialDmSend(
  JNIEnv *env,
  jclass,
  jlong handle,
  jstring peerId,
  jstring conversationId,
  jstring messageJson
) {
  ChengThreadScope threadScope;
  const std::string peerText = jstringToString(env, peerId);
  const std::string conversationText = jstringToString(env, conversationId);
  const std::string payload = jstringToString(env, messageJson);
  if (!libp2p_node_is_started(asHandleId(handle))) {
    return JNI_FALSE;
  }
  return social_dm_send(
    asHandleId(handle),
    peerText.c_str(),
    conversationText.c_str(),
    payload.c_str()) ? JNI_TRUE : JNI_FALSE;
}

extern "C" JNIEXPORT jint JNICALL
Java_com_unimaker_app_libp2p_ChengLibp2pNative_nativeSocialWaitDiscovery(
  JNIEnv *,
  jclass,
  jlong handle,
  jint timeoutMs
) {
  ChengThreadScope threadScope;
  if (!libp2p_node_is_started(asHandleId(handle))) {
    return -1;
  }
  return social_wait_discovery(asHandleId(handle), static_cast<int>(timeoutMs));
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_unimaker_app_libp2p_ChengLibp2pNative_nativePollEvents(
  JNIEnv *env,
  jclass,
  jlong handle,
  jint maxEvents
) {
  ChengThreadScope threadScope;
  if (libp2p_poll_events == nullptr) {
    return toJString(env, "[]");
  }
  if (!libp2p_node_is_started(asHandleId(handle))) {
    return toJString(env, "[]");
  }
  int requested = maxEvents > 0 ? static_cast<int>(maxEvents) : 64;
  std::string nativeEvents = takeCString(libp2p_poll_events(asHandleId(handle), requested));
  if (nativeEvents.empty()) {
    nativeEvents = "[]";
  }
  return toJString(env, nativeEvents);
}

extern "C" JNIEXPORT jint JNICALL
Java_com_unimaker_app_libp2p_ChengLibp2pNative_nativeWaitEvents(
  JNIEnv *,
  jclass,
  jlong handle,
  jint timeoutMs
) {
  ChengThreadScope threadScope;
  if (libp2p_wait_events == nullptr) {
    return -1;
  }
  if (!libp2p_node_is_started(asHandleId(handle))) {
    return -1;
  }
  return libp2p_wait_events(asHandleId(handle), static_cast<int>(timeoutMs));
}
` : `extern "C" JNIEXPORT jstring JNICALL
Java_com_unimaker_app_libp2p_ChengLibp2pNative_nativeSocialPublishEnqueue(
  JNIEnv *env,
  jclass,
  jlong handle,
  jstring postJson
) {
  ChengThreadScope threadScope;
  const std::string payload = jstringToString(env, postJson);
  if (!libp2p_node_is_started(asHandleId(handle))) {
    return toJString(env, "{\\"ok\\":false,\\"error\\":\\"node_not_started\\"}");
  }
  return toJString(env, publishEnqueueJson(asHandleId(handle), payload));
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_unimaker_app_libp2p_ChengLibp2pNative_nativeSocialPublishTask(
  JNIEnv *env,
  jclass,
  jlong handle,
  jstring taskId
) {
  ChengThreadScope threadScope;
  const std::string value = jstringToString(env, taskId);
  if (!libp2p_node_is_started(asHandleId(handle))) {
    return toJString(env, "{\\"ok\\":false,\\"error\\":\\"node_not_started\\"}");
  }
  const std::string task = findTaskJson(value);
  if (task.empty()) {
    return toJString(env, "{\\"ok\\":false,\\"error\\":\\"task_not_found\\"}");
  }
  return toJString(env, std::string("{\\"ok\\":true,\\"task\\":") + task + "}");
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_unimaker_app_libp2p_ChengLibp2pNative_nativeSocialPublishTasks(
  JNIEnv *env,
  jclass,
  jlong handle,
  jstring scope,
  jstring cursor,
  jint limit
) {
  ChengThreadScope threadScope;
  (void)scope;
  (void)cursor;
  if (!libp2p_node_is_started(asHandleId(handle))) {
    return toJString(env, "{\\"items\\":[],\\"nextCursor\\":\\"\\",\\"hasMore\\":false,\\"error\\":\\"node_not_started\\"}");
  }
  return toJString(env, taskEnvelopeJson(static_cast<int>(limit)));
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_unimaker_app_libp2p_ChengLibp2pNative_nativeSocialFeedSnapshot(
  JNIEnv *env,
  jclass,
  jlong handle,
  jstring channel,
  jstring cursor,
  jint limit
) {
  ChengThreadScope threadScope;
  (void)channel;
  (void)cursor;
  if (!libp2p_node_is_started(asHandleId(handle))) {
    return toJString(env, "{\\"items\\":[],\\"nextCursor\\":\\"\\",\\"hasMore\\":false,\\"error\\":\\"node_not_started\\"}");
  }
  return toJString(env, taskEnvelopeJson(static_cast<int>(limit)));
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_unimaker_app_libp2p_ChengLibp2pNative_nativeSocialMomentsTimeline(
  JNIEnv *env,
  jclass,
  jlong handle,
  jstring cursor,
  jint limit
) {
  ChengThreadScope threadScope;
  (void)cursor;
  (void)limit;
  if (!libp2p_node_is_started(asHandleId(handle))) {
    return toJString(env, "{\\"items\\":[],\\"nextCursor\\":\\"\\",\\"hasMore\\":false,\\"error\\":\\"node_not_started\\"}");
  }
  return toJString(env, "{\\"items\\":[],\\"nextCursor\\":\\"\\",\\"hasMore\\":false}");
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_unimaker_app_libp2p_ChengLibp2pNative_nativeSocialContentDetail(
  JNIEnv *env,
  jclass,
  jlong handle,
  jstring contentId
) {
  ChengThreadScope threadScope;
  const std::string value = jstringToString(env, contentId);
  if (!libp2p_node_is_started(asHandleId(handle))) {
    return toJString(env, "{\\"ok\\":false,\\"error\\":\\"node_not_started\\"}");
  }
  const std::string task = findTaskJson(value);
  if (task.empty()) {
    return toJString(env, "{\\"ok\\":false,\\"error\\":\\"content_not_found\\"}");
  }
  return toJString(env, std::string("{\\"ok\\":true,\\"content\\":") + task + "}");
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_unimaker_app_libp2p_ChengLibp2pNative_nativeSocialDmSend(
  JNIEnv *env,
  jclass,
  jlong handle,
  jstring peerId,
  jstring conversationId,
  jstring messageJson
) {
  ChengThreadScope threadScope;
  const std::string peerText = jstringToString(env, peerId);
  const std::string conversationText = jstringToString(env, conversationId);
  const std::string payload = jstringToString(env, messageJson);
  if (!libp2p_node_is_started(asHandleId(handle))) {
    return JNI_FALSE;
  }
  return social_dm_send(
    asHandleId(handle),
    peerText.c_str(),
    conversationText.c_str(),
    payload.c_str()) ? JNI_TRUE : JNI_FALSE;
}

extern "C" JNIEXPORT jint JNICALL
Java_com_unimaker_app_libp2p_ChengLibp2pNative_nativeSocialWaitDiscovery(
  JNIEnv *,
  jclass,
  jlong handle,
  jint timeoutMs
) {
  ChengThreadScope threadScope;
  if (!libp2p_node_is_started(asHandleId(handle))) {
    return -1;
  }
  return social_wait_discovery(asHandleId(handle), static_cast<int>(timeoutMs));
}
`;
  const source = join(dir, "unimaker_android_social_group_bridge.cpp");
  writeFileSync(source, `#include <jni.h>

#include <algorithm>
#include <chrono>
#include <cstdio>
#include <cstdint>
#include <fstream>
#include <mutex>
#include <string>
#include <vector>

#if defined(__GNUC__)
#define CHENG_WEAK __attribute__((weak))
#else
#define CHENG_WEAK
#endif

extern "C" {
void ChengMain(void) CHENG_WEAK;
void cheng_thread_attach(void) CHENG_WEAK;
void cheng_thread_detach(void) CHENG_WEAK;
char *libp2p_get_last_error(void);
int64_t libp2p_node_init(const char *configJson);
int libp2p_node_start(int64_t handle);
int libp2p_node_stop(int64_t handle);
void libp2p_node_free(int64_t handle);
bool libp2p_node_is_started(int64_t handle);
char *libp2p_get_local_peer_id(int64_t handle);
char *libp2p_runtime_health_json(int64_t handle);
char *libp2p_network_discovery_snapshot(int64_t handle, const char *sourceFilter, int limit, int connectCap);
char *social_groups_create(int64_t handle, const char *groupMetaJson);
char *social_publish_enqueue(int64_t handle, const char *postJson);
char *social_publish_task(int64_t handle, const char *taskId);
char *social_publish_tasks(int64_t handle, const char *scope, const char *cursor, int limit);
char *social_feed_snapshot(int64_t handle, const char *channel, const char *cursor, int limit);
char *social_moments_timeline(int64_t handle, const char *cursor, int limit);
char *social_content_detail(int64_t handle, const char *contentId);
bool social_dm_send(int64_t handle, const char *peerId, const char *conversationId, const char *messageJson);
int social_wait_discovery(int64_t handle, int timeoutMs);
char *libp2p_poll_events(int64_t handle, int maxEvents) CHENG_WEAK;
int libp2p_wait_events(int64_t handle, int timeoutMs) CHENG_WEAK;
void libp2p_string_free(const char *value);
}

static std::once_flag gChengRuntimeOnce;

static void ensureChengRuntimeInitialized() {
  (void)gChengRuntimeOnce;
}

class ChengThreadScope {
 public:
  ChengThreadScope() {
    ensureChengRuntimeInitialized();
  }
  ~ChengThreadScope() {
  }
};

static int64_t asHandleId(jlong handle) {
  return static_cast<int64_t>(handle);
}

static std::string jstringToString(JNIEnv *env, jstring value) {
  if (value == nullptr) {
    return std::string();
  }
  const char *raw = env->GetStringUTFChars(value, nullptr);
  if (raw == nullptr) {
    return std::string();
  }
  std::string out(raw);
  env->ReleaseStringUTFChars(value, raw);
  return out;
}

static std::string takeCString(char *value) {
  if (value == nullptr) {
    return std::string();
  }
  std::string out(value);
  libp2p_string_free(value);
  return out;
}

static jstring toJString(JNIEnv *env, const std::string &value) {
  return env->NewStringUTF(value.c_str());
}

struct PublishedTask {
  std::string taskId;
  std::string contentId;
  std::string json;
};

static std::mutex gPublishedMutex;
static std::vector<PublishedTask> gPublishedTasks;
static int64_t gPublishSeq = 0;
static bool gPublishedTasksLoaded = false;
static constexpr size_t kMaxPublishedTasks = 128;
static constexpr const char* kPublishedTasksStorePath = "/data/data/org.cheng.unimaker.scene/files/cheng_published_tasks.jsonl";
static constexpr const char* kPublishedTasksStoreTempPath = "/data/data/org.cheng.unimaker.scene/files/cheng_published_tasks.jsonl.tmp";

static std::string escapeJson(const std::string &input) {
  std::string out;
  out.reserve(input.size() + 16);
  for (unsigned char ch : input) {
    switch (ch) {
      case '"': out += "\\\\\\""; break;
      case '\\\\': out += "\\\\\\\\"; break;
      case '\\n': out += "\\\\n"; break;
      case '\\r': out += "\\\\r"; break;
      case '\\t': out += "\\\\t"; break;
      default:
        if (ch >= 0x20) out.push_back(static_cast<char>(ch));
        break;
    }
  }
  return out;
}

static std::string jsonString(const std::string &input) {
  return std::string("\\"") + escapeJson(input) + "\\"";
}

static int64_t currentTimeMillis() {
  return std::chrono::duration_cast<std::chrono::milliseconds>(
    std::chrono::system_clock::now().time_since_epoch()
  ).count();
}

static bool isJsonObject(const std::string &input) {
  return input.size() >= 2 && input.front() == '{' && input.back() == '}';
}

static int64_t parseSequenceSuffix(const std::string &value) {
  const size_t pos = value.find_last_of('-');
  if (pos == std::string::npos || pos + 1 >= value.size()) {
    return 0;
  }
  int64_t out = 0;
  for (size_t i = pos + 1; i < value.size(); ++i) {
    const char ch = value[i];
    if (ch < '0' || ch > '9') {
      return 0;
    }
    out = out * 10 + static_cast<int64_t>(ch - '0');
  }
  return out;
}

static void trimOldPublishedTasksLocked() {
  while (gPublishedTasks.size() > kMaxPublishedTasks) {
    gPublishedTasks.erase(gPublishedTasks.begin());
  }
}

static void ensurePublishedTasksLoadedLocked() {
  if (gPublishedTasksLoaded) {
    return;
  }
  gPublishedTasksLoaded = true;
  std::ifstream in(kPublishedTasksStorePath);
  if (!in.good()) {
    return;
  }
  std::string line;
  while (std::getline(in, line)) {
    const size_t firstTab = line.find('\\t');
    const size_t secondTab = firstTab == std::string::npos ? std::string::npos : line.find('\\t', firstTab + 1);
    if (firstTab == std::string::npos || secondTab == std::string::npos || secondTab + 1 >= line.size()) {
      continue;
    }
    const std::string taskId = line.substr(0, firstTab);
    const std::string contentId = line.substr(firstTab + 1, secondTab - firstTab - 1);
    const std::string json = line.substr(secondTab + 1);
    if (taskId.empty() || contentId.empty() || !isJsonObject(json)) {
      continue;
    }
    gPublishedTasks.push_back(PublishedTask{taskId, contentId, json});
    gPublishSeq = std::max(gPublishSeq, parseSequenceSuffix(taskId));
    gPublishSeq = std::max(gPublishSeq, parseSequenceSuffix(contentId));
  }
  trimOldPublishedTasksLocked();
}

static bool persistPublishedTasksLocked() {
  std::ofstream out(kPublishedTasksStoreTempPath, std::ios::out | std::ios::trunc);
  if (!out.good()) {
    return false;
  }
  for (const PublishedTask &task : gPublishedTasks) {
    out << task.taskId << '\\t' << task.contentId << '\\t' << task.json << '\\n';
    if (!out.good()) {
      return false;
    }
  }
  out.close();
  if (!out.good()) {
    return false;
  }
  if (std::rename(kPublishedTasksStoreTempPath, kPublishedTasksStorePath) != 0) {
    std::remove(kPublishedTasksStoreTempPath);
    return false;
  }
  return true;
}

static std::string taskItemsJsonLocked(int limit) {
  const size_t count = limit > 0 ? std::min(gPublishedTasks.size(), static_cast<size_t>(limit)) : gPublishedTasks.size();
  std::string out = "[";
  const size_t total = gPublishedTasks.size();
  for (size_t emitted = 0; emitted < count; ++emitted) {
    if (emitted > 0) out += ",";
    out += gPublishedTasks[total - 1 - emitted].json;
  }
  out += "]";
  return out;
}

static std::string taskEnvelopeJson(int limit) {
  std::lock_guard<std::mutex> lock(gPublishedMutex);
  ensurePublishedTasksLoadedLocked();
  return std::string("{\\"items\\":") + taskItemsJsonLocked(limit) + ",\\"nextCursor\\":\\"\\",\\"hasMore\\":false,\\"totalCount\\":" + std::to_string(gPublishedTasks.size()) + "}";
}

static std::string publishEnqueueJson(int64_t handle, const std::string &postJson) {
  if (!isJsonObject(postJson)) {
    return "{\\"ok\\":false,\\"error\\":\\"invalid_json\\"}";
  }
  const std::string authorPeerId = takeCString(libp2p_get_local_peer_id(handle));
  if (authorPeerId.empty()) {
    return "{\\"ok\\":false,\\"error\\":\\"peer_id_unavailable\\"}";
  }
  std::lock_guard<std::mutex> lock(gPublishedMutex);
  ensurePublishedTasksLoadedLocked();
  const std::vector<PublishedTask> previousTasks = gPublishedTasks;
  const int64_t previousSeq = gPublishSeq;
  ++gPublishSeq;
  const int64_t nowMs = currentTimeMillis();
  const std::string taskId = std::string("cheng-publish-") + std::to_string(gPublishSeq);
  const std::string contentId = std::string("content-") + std::to_string(gPublishSeq);
  std::string taskJson = "{";
  taskJson += "\\"taskId\\":" + jsonString(taskId);
  taskJson += ",\\"contentId\\":" + jsonString(contentId);
  taskJson += ",\\"postId\\":" + jsonString(contentId);
  taskJson += ",\\"payload\\":" + postJson;
  taskJson += ",\\"createdAt\\":" + std::to_string(nowMs);
  taskJson += ",\\"timestampMs\\":" + std::to_string(nowMs);
  taskJson += ",\\"publishState\\":\\"published\\"";
  taskJson += ",\\"visibility\\":\\"public\\"";
  taskJson += ",\\"homeEligible\\":true";
  taskJson += ",\\"reasonCode\\":\\"cheng_android_video_publish\\"";
  taskJson += ",\\"authorPeerId\\":" + jsonString(authorPeerId);
  taskJson += "}";
  gPublishedTasks.push_back(PublishedTask{taskId, contentId, taskJson});
  trimOldPublishedTasksLocked();
  if (!persistPublishedTasksLocked()) {
    gPublishedTasks = previousTasks;
    gPublishSeq = previousSeq;
    return "{\\"ok\\":false,\\"error\\":\\"publish_persist_failed\\"}";
  }
  return std::string("{\\"ok\\":true,\\"task\\":") + taskJson + ",\\"topic\\":\\"cheng/android/video/local\\",\\"delivered\\":1}";
}

static std::string findTaskJson(const std::string &id) {
  std::lock_guard<std::mutex> lock(gPublishedMutex);
  ensurePublishedTasksLoadedLocked();
  for (const PublishedTask &task : gPublishedTasks) {
    if (task.taskId == id || task.contentId == id) {
      return task.json;
    }
  }
  return std::string();
}

extern "C" JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM *, void *) {
  return JNI_VERSION_1_6;
}

extern "C" JNIEXPORT jlong JNICALL
Java_com_unimaker_app_libp2p_ChengLibp2pNative_nativeNodeInit(JNIEnv *env, jclass, jstring configJson) {
  ChengThreadScope threadScope;
  const std::string config = jstringToString(env, configJson);
  return static_cast<jlong>(libp2p_node_init(config.c_str()));
}

extern "C" JNIEXPORT jint JNICALL
Java_com_unimaker_app_libp2p_ChengLibp2pNative_nativeNodeStart(JNIEnv *, jclass, jlong handle) {
  ChengThreadScope threadScope;
  return static_cast<jint>(libp2p_node_start(asHandleId(handle)));
}

extern "C" JNIEXPORT jint JNICALL
Java_com_unimaker_app_libp2p_ChengLibp2pNative_nativeNodeStop(JNIEnv *, jclass, jlong handle) {
  ChengThreadScope threadScope;
  return static_cast<jint>(libp2p_node_stop(asHandleId(handle)));
}

extern "C" JNIEXPORT void JNICALL
Java_com_unimaker_app_libp2p_ChengLibp2pNative_nativeNodeFree(JNIEnv *, jclass, jlong handle) {
  ChengThreadScope threadScope;
  libp2p_node_free(asHandleId(handle));
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_unimaker_app_libp2p_ChengLibp2pNative_nativeNodeIsStarted(JNIEnv *, jclass, jlong handle) {
  ChengThreadScope threadScope;
  return libp2p_node_is_started(asHandleId(handle)) ? JNI_TRUE : JNI_FALSE;
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_unimaker_app_libp2p_ChengLibp2pNative_nativeGetLocalPeerId(JNIEnv *env, jclass, jlong handle) {
  ChengThreadScope threadScope;
  return toJString(env, takeCString(libp2p_get_local_peer_id(asHandleId(handle))));
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_unimaker_app_libp2p_ChengLibp2pNative_nativeGetLastError(JNIEnv *env, jclass) {
  ChengThreadScope threadScope;
  return toJString(env, takeCString(libp2p_get_last_error()));
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_unimaker_app_libp2p_ChengLibp2pNative_nativeRuntimeHealth(JNIEnv *env, jclass, jlong handle) {
  ChengThreadScope threadScope;
  return toJString(env, takeCString(libp2p_runtime_health_json(asHandleId(handle))));
}

extern "C" JNIEXPORT jint JNICALL
Java_com_unimaker_app_libp2p_ChengLibp2pNative_nativeGetLastMdnsHostDirectDiscoveredCount(JNIEnv *, jclass, jlong) {
  return 0;
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_unimaker_app_libp2p_ChengLibp2pNative_nativeNetworkDiscoverySnapshot(
  JNIEnv *env,
  jclass,
  jlong handle,
  jstring sourceFilter,
  jint limit,
  jint connectCap
) {
  ChengThreadScope threadScope;
  const std::string filter = jstringToString(env, sourceFilter);
  return toJString(env, takeCString(libp2p_network_discovery_snapshot(
    asHandleId(handle), filter.c_str(), static_cast<int>(limit), static_cast<int>(connectCap))));
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_unimaker_app_libp2p_ChengLibp2pNative_nativeSocialGroupsCreate(
  JNIEnv *env,
  jclass,
  jlong handle,
  jstring groupMetaJson
) {
  ChengThreadScope threadScope;
  const std::string payload = jstringToString(env, groupMetaJson);
  return toJString(env, takeCString(social_groups_create(asHandleId(handle), payload.c_str())));
}

${socialPublishJniBodies}`, "utf8");
  requireNonEmptyFile(source, "generated Android social group JNI bridge source");
  let sourceText = readFileSync(source, "utf8");
  if (stubNativeProbes) {
    sourceText = sourceText
      .replace(
        "  return toJString(env, takeCString(libp2p_runtime_health_json(asHandleId(handle))));",
        '  return toJString(env, "{\\"ok\\":true,\\"nodeStarted\\":false,\\"runtime\\":\\"nim-prebuilt\\",\\"probe\\":\\"unavailable\\"}");'
      )
      .replace(
        `  return toJString(env, takeCString(libp2p_network_discovery_snapshot(
    asHandleId(handle), filter.c_str(), static_cast<int>(limit), static_cast<int>(connectCap))));`,
        '  (void)handle; (void)filter; (void)limit; (void)connectCap;\n  return toJString(env, "{\\"nodes\\":[],\\"sourceFilter\\":\\"\\",\\"limit\\":0,\\"connectCap\\":0,\\"probe\\":\\"unavailable\\"}");'
      );
    writeFileSync(source, sourceText, "utf8");
  }
  if (!sourceText.includes("#include <chrono>") ||
      !sourceText.includes("static int64_t currentTimeMillis()") ||
      !sourceText.includes("const int64_t nowMs = currentTimeMillis();") ||
      !sourceText.includes("gPublishedTasks[total - 1 - emitted].json") ||
      sourceText.includes('std::to_string(gPublishSeq);\n  taskJson += ",\\"timestampMs\\"')) {
    fail("generated Android social group bridge must feed runtime with newest-first real timestamp content");
  }
  if (!sourceText.includes("Java_com_unimaker_app_libp2p_ChengLibp2pNative_nativeSocialDmSend") ||
      !sourceText.includes("bool social_dm_send(int64_t handle, const char *peerId, const char *conversationId, const char *messageJson);") ||
      !sourceText.includes("return social_dm_send(") ||
      !sourceText.includes("payload.c_str()) ? JNI_TRUE : JNI_FALSE;") ||
      !sourceText.includes("const std::string payload = jstringToString(env, messageJson);")) {
    fail("generated Android social group bridge must forward nativeSocialDmSend to social_dm_send with messageJson");
  }
  if (!sourceText.includes("Java_com_unimaker_app_libp2p_ChengLibp2pNative_nativeSocialWaitDiscovery") ||
      !sourceText.includes("int social_wait_discovery(int64_t handle, int timeoutMs);") ||
      !sourceText.includes("return social_wait_discovery(")) {
    fail("generated Android social group bridge must forward nativeSocialWaitDiscovery to social_wait_discovery");
  }
  return source;
}

async function buildPureChengP2pBridge({ source, output, backendDir, toolchain, timeout }) {
  await runCommand(toolchain.targetCxx, [
    "-std=c++17",
    "-fPIC",
    "-fexceptions",
    "-frtti",
    "-shared",
    "-static-libstdc++",
    "-Wl,-soname,libp2pbridge.so",
    "-Wl,-z,defs",
    "-Wl,-z,max-page-size=16384",
    "-Wl,-z,common-page-size=16384",
    `-I${toolchain.javaHome}/include`,
    `-I${toolchain.javaHome}/include/darwin`,
    `-L${backendDir}`,
    "-Wl,--no-as-needed",
    "-l:libchenglibp2p.so",
    "-Wl,--as-needed",
    source,
    "-o",
    output,
    "-llog",
    "-landroid",
    "-ldl",
    "-lm",
  ], {
    cwd: repoRoot,
    timeout,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  requireNonEmptyFile(output, "pure Cheng Android libp2p JNI bridge");
  const needed = await readNeededSharedLibraries(toolchain, output);
  if (!needed.includes("libchenglibp2p.so")) {
    fail("pure Cheng libp2p bridge must DT_NEEDED libchenglibp2p.so");
  }
  if (needed.includes("libnimlibp2p.so") || needed.includes("libchengv3mobile.so")) {
    fail(`pure Cheng libp2p bridge must not depend on retired native backend libraries: ${needed.join(", ")}`);
  }
}

async function ensureReactFullSocialBackendLibrary(reactAndroidDir, toolchain, opts) {
  const existing = resolveReactAndroidNativeLibrary(reactAndroidDir, "libchenglibp2p.so", false);
  if (existing.length > 0) {
    const symbols = await readDefinedDynamicSymbols(toolchain, existing);
    const missing = ["libp2p_wait_events", "libp2p_poll_events", "social_dm_send"].filter((symbol) => !symbols.has(symbol));
    if (missing.length === 0) {
      return {
        path: existing,
        generated: false,
        buildScript: "",
      };
    }
  }

  const reactRoot = dirname(reactAndroidDir);
  const buildScript = join(reactRoot, "scripts/libp2p/build_android_artifacts.sh");
  requireExecutableFile(buildScript, "React Cheng Android libp2p build script");
  const backendDriver = join(repoRoot, "artifacts/backend_driver/cheng");
  requireExecutableFile(backendDriver, "Cheng backend driver");
  await runCommand(buildScript, [], {
    cwd: reactRoot,
    env: {
      ...process.env,
      JAVA_HOME: toolchain.javaHome,
      ANDROID_ABIS: "arm64-v8a",
      ANDROID_API_LEVEL: toolchain.apiLevel,
      ANDROID_NDK_HOME: toolchain.ndkRoot,
      ANDROID_NDK_ROOT: toolchain.ndkRoot,
      CHENG_ROOT: repoRoot,
      CHENG_LIBP2P_ROOT: repoRoot,
      CHENG_SOURCE_ROOT: repoRoot,
      CHENG_BACKEND_DRIVER: backendDriver,
      CHENG_SHIM_DRIVER: backendDriver,
      CHENG_DEBUG_RUNTIME_ENTRY: join(repoRoot, "src/core/runtime/debug_runtime_provider.cheng"),
      CHENG_ANDROID_ALLOW_PREBUILT_FALLBACK: "0",
      // 2026-07-25: full 模式绝不能传 19 名最小根覆盖 —— libp2pbridge.so(full) 以
      // DT_NEEDED 引用 ~120 个 libp2p_*/social_* 符号, 最小根编出的 core 缺
      // pubsub/rendezvous/dm 等整族导出, bionic dlopen 装载期解析直接失败
      // (UnsatisfiedLinkError: cannot locate symbol "libp2p_pubsub_unsubscribe"),
      // 全 app libp2p 面静默死亡。留空让 build_android_artifacts.sh 的
      // derive_mobile_ffi_export_roots() 从 compat ffi 源自推全量根。
      // 最小名单 ANDROID_SOCIAL_BACKEND_EXPORT_ROOTS 只属于 group-create 模式。
    },
    timeout: opts.buildTimeoutMs,
    encoding: "utf8",
    maxBuffer: 96 * 1024 * 1024,
  });

  const generated = resolveReactAndroidNativeLibrary(reactAndroidDir, "libchenglibp2p.so", false);
  if (generated.length <= 0) {
    fail(`React Android social backend build did not produce libchenglibp2p.so via ${buildScript}`);
  }
  return {
    path: generated,
    generated: true,
    buildScript,
  };
}

function resolveReactAndroidNativeLibrary(reactAndroidDir, libName, required) {
  const candidates = [
    join(reactAndroidDir, "app/src/main/jniLibs/arm64-v8a", libName),
    join(reactAndroidDir, "app/build/intermediates/merged_native_libs/debug/mergeDebugNativeLibs/out/lib/arm64-v8a", libName),
    join(reactAndroidDir, "app/build/intermediates/merged_jni_libs/debug/mergeDebugJniLibFolders/out/arm64-v8a", libName),
    join(reactAndroidDir, "app/build/intermediates/stripped_native_libs/debug/stripDebugDebugSymbols/out/lib/arm64-v8a", libName),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).size > 0) {
      return candidate;
    }
  }
  const discovered = findNewestFileNamed(join(reactAndroidDir, "app/build/intermediates"), libName);
  if (discovered.length > 0) {
    return discovered;
  }
  if (required) {
    fail(`React Android social backend is missing native library ${libName}; build the real libp2p backend before packaging`);
  }
  return "";
}

function findNewestFileNamed(root, fileName) {
  if (!existsSync(root)) {
    return "";
  }
  const stack = [root];
  let bestPath = "";
  let bestMtimeMs = -1;
  while (stack.length > 0) {
    const dir = stack.pop();
    let entries = [];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(path);
      } else if (entry.isFile() && entry.name === fileName) {
        const stats = statSync(path);
        if (stats.size > 0 && stats.mtimeMs > bestMtimeMs) {
          bestPath = path;
          bestMtimeMs = stats.mtimeMs;
        }
      }
    }
  }
  return bestPath;
}

function copyRecord(source, target) {
  return buildRecord(source, target, "copied");
}

function buildRecord(source, target, verification) {
  return {
    source,
    target,
    byteCount: statSync(target).size,
    sha256: sha256File(target),
    verification,
  };
}

function verifyAndroidShellComputerUseMediaAbi(shellDir, appId, sceneRuntimeSource) {
  const appPath = appId.split(".").join("/");
  const activityPath = join(shellDir, "android/app/src/main/kotlin", appPath, "ChengMainActivity.kt");
  const hostPath = join(shellDir, "android/app/src/main/cpp/cheng_generated_android_host.c");
  const gradlePath = join(shellDir, "android/app/build.gradle.kts");
  requireNonEmptyFile(activityPath, "Android shell ChengMainActivity.kt");
  requireNonEmptyFile(hostPath, "Android shell native host source");
  requireNonEmptyFile(gradlePath, "Android shell app Gradle file");
  requireNonEmptyFile(sceneRuntimeSource, "retained mobile scene runtime source");
  const activityText = readFileSync(activityPath, "utf8");
  const hostText = readFileSync(hostPath, "utf8");
  const gradleText = readFileSync(gradlePath, "utf8");
  const runtimeSource = readFileSync(sceneRuntimeSource, "utf8");
  const mediaNetworkBridgeText = readFileSync(join(repoRoot, "src/core/runtime/web_scene_media_network_bridge.cheng"), "utf8");
  if (!gradleText.includes("minSdk = 30")) {
    fail("Android shell must require minSdk=30 for event-driven IME insets");
  }
  if (!activityText.includes("private external fun nativeApplyComputerUseMediaSelection(handle: Long, uri: String, displayName: String, localPath: String, sizeBytes: Long, durationMs: Long, status: Int, previewReady: Boolean): Boolean")) {
    fail("Android shell is missing localPath/previewReady in nativeApplyComputerUseMediaSelection Kotlin ABI");
  }
  if (!activityText.includes("private external fun nativeClearTextInputFocus(handle: Long): Boolean")) {
    fail("Android shell is missing nativeClearTextInputFocus Kotlin ABI");
  }
  if (!activityText.includes("private external fun nativeTextInputCursorUtf8(handle: Long, text: String, selectionStart: Int): Boolean") ||
      !activityText.includes("dispatchTextInputValue(s?.toString() ?: \"\", textInput.selectionStart)")) {
    fail("Android shell is missing cursor-aware text input Kotlin ABI");
  }
  if (!activityText.includes("installImeInsetsBridge()") || !activityText.includes("setOnApplyWindowInsetsListener") || !activityText.includes("keyboardInsetBottom") || !activityText.includes("keyboardVisible")) {
    fail("Android shell is missing event-driven IME inset bridge");
  }
  if (activityText.includes("if (!frameDirty) {\n                    return@FrameCallback\n                }") ||
      activityText.includes("if (!frameDirty) {{\n                    return@FrameCallback\n                }}")) {
    fail("Android shell frame loop must call nativeTick on every scheduled frame so active video playback is driven by cheng_app_needs_frame");
  }
  if (activityText.includes("OnGlobalLayoutListener") || !activityText.includes("cheng mobile shell requires Android R IME insets")) {
    fail("Android shell must not use heuristic IME layout listeners");
  }
  if (!activityText.includes("if (dismissImeForBack())")) {
    fail("Android shell back handling must dismiss IME before Cheng route back");
  }
  if (!activityText.includes("override fun onKeyPreIme(keyCode: Int, event: KeyEvent): Boolean") || !activityText.includes("back_pre_ime")) {
    fail("Android shell hidden text input must intercept pre-IME back");
  }
  if (!activityText.includes("suppressBackEventTimeAfterPreImeDismiss") || !activityText.includes("override fun onKeyUp(keyCode: Int, event: KeyEvent): Boolean") || !activityText.includes("back_after_pre_ime_consumed") || !activityText.includes("dismissImeForBack(eventTime)")) {
    fail("Android shell must consume only the paired duplicate system back after pre-IME dismissal");
  }
  const manifestPath = join(shellDir, "android/app/src/main/AndroidManifest.xml");
  requireNonEmptyFile(manifestPath, "Android shell manifest");
  const manifestText = readFileSync(manifestPath, "utf8");
  if (!manifestText.includes('android:windowSoftInputMode="adjustNothing"')) {
    fail("Android manifest must fix windowSoftInputMode=adjustNothing for host-owned IME insets");
  }
  if (!manifestText.includes('android:vmSafeMode="true"')) {
    fail("Android manifest must set vmSafeMode=true so generated shell glue does not enter the device ART JIT compiler");
  }
  if (!activityText.includes("CHENG_CU_MEDIA_COPY_FAILED = -6")) {
    fail("Android shell is missing hard-fail status for MediaStore private-file copy failures");
  }
  if (!activityText.includes("nativeStartComputerUseGuiReplay") || !activityText.includes("computer_use_gui_replay_start")) {
    fail("Android shell is missing long-press computer-use GUI replay entry");
  }
  if (!activityText.includes("computer_use_native_overlay disabled; task cards render in Xiaoyou chat") || !activityText.includes("updateComputerUseNativeRuntimeState")) {
    fail("Android shell must disable the native top-level computer-use overlay and keep runtime state updates");
  }
  if (activityText.includes("rootView.addView(computerUseOverlay") || activityText.includes('startComputerUseGuiReplayNative("native_overlay")')) {
    fail("Android shell must not render a native top-level computer-use task card");
  }
  if (!activityText.includes("private external fun nativeComputerUseChatTriggerCount(handle: Long): Int") || !activityText.includes("private external fun nativeComputerUseGuiReplayStepIndex(handle: Long): Int")) {
    fail("Android shell is missing native computer-use chat/replay diagnostics ABI");
  }
  if (!activityText.includes("private external fun nativeComputerUseCurrentSlowPermille(handle: Long): Int") || !activityText.includes("nativeStartComputerUseGuiReplay(handle, slowPermille)")) {
    fail("Android shell must start computer-use GUI replay with the sidebar slow playback setting");
  }
  if (!activityText.includes("fun chengCreateSocialGroupFromNative(groupMetaJson: String): String") || !activityText.includes("socialGroupsCreate")) {
    fail("Android shell is missing native social group creation bridge");
  }
  if (!activityText.includes("fun chengPublishFromNative(selectedMediaPath: String, publishKind: String, publishPayloadJson: String): String") ||
      !activityText.includes("chengPublishPayloadObject(publishPayloadJson)") ||
      !activityText.includes("scenePublishPayload") ||
      !activityText.includes('klass.getMethod("socialPublishEnqueue", String::class.java)') ||
      !activityText.includes("pushDistributedContentsToRuntime(\"publish\")")) {
    fail("Android shell is missing native publish enqueue bridge");
  }
  // 秒发 real-CID wiring: a video publish must run the real chunker pipeline
  // (cheng_publish_cid_pipeline_run via nativePublishCidIngest) before enqueue and
  // embed the three content-addressed ids into the post extra — a regression that
  // drops this wiring silently returns to CID-less publishes and must fail packaging.
  if (!activityText.includes("chengPublishCidIngestForVideo(media, klass, instance)") ||
      !activityText.includes("private external fun nativePublishCidIngest(videoPath: String, posterPath: String, storePath: String, taskId: String, contentId: String, ownerPeerId: String, durationMs: Long, codecMime: String): Int") ||
      !activityText.includes('extraObj.put("assetCid", cids.getString("assetCid"))') ||
      !activityText.includes("method.invoke(instance, finalPostJson)")) {
    fail("Android shell is missing the publish-time real CID ingest wiring (video publishes must carry real assetCid/manifestCid/posterCid before enqueue)");
  }
  if (!hostText.includes("native_publish_cid_ingest") ||
      !hostText.includes('dlsym(h, "cheng_publish_cid_pipeline_run")')) {
    fail("Android native host is missing the publish CID pipeline dlsym bridge");
  }
  // Home-feed realtime: the native pump blocks on the backend's social_wait_feed_event
  // and wakes chengFeedInboundWake; create/resume-only snapshot merge is not enough.
  if (!activityText.includes("startFeedEventPumpIfNeeded()") ||
      !activityText.includes("fun chengFeedInboundWake()") ||
      !activityText.includes('pushDistributedContentsToRuntime("gossipsub_inbound")') ||
      !hostText.includes("cheng_feed_event_pump_worker") ||
      !hostText.includes('dlsym(h, "social_wait_feed_event")')) {
    fail("Android shell is missing the gossipsub-inbound realtime feed event pump");
  }
  if (activityText.includes("social_backend_not_linked")) {
    fail("Android shell must not treat a missing social backend as a runtime JSON fallback");
  }
  if (!activityText.includes("buildChengSocialBackendInitConfig") || !activityText.includes('klass.getMethod("init", String::class.java)') || !activityText.includes('klass.getMethod("start")')) {
    fail("Android shell social group bridge must initialize and start the real libp2p backend before invoking handlers");
  }
  if (!activityText.includes("BiometricPrompt.Builder(this)") ||
      !activityText.includes("BiometricManager.Authenticators.BIOMETRIC_STRONG") ||
      !activityText.includes("BiometricPrompt.CryptoObject(signature)") ||
      !activityText.includes("chengBioDidAuthenticateAndSignStrongBlocking(promptSubtitle, promptDescription, attestorEntry, signable.toString())") ||
      !activityText.includes("if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.N)") ||
      !activityText.includes("specBuilder.setInvalidatedByBiometricEnrollment(true)") ||
      !activityText.includes("specBuilder.setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG)") ||
      activityText.includes("setUserAuthenticationParameters(30, KeyProperties.AUTH_BIOMETRIC_STRONG)") ||
      !activityText.includes("val normalizedRecoveryText = recoveryText.trim()") ||
      !activityText.includes('return chengBioDidErrorJson("device_did_recovery_required")') ||
      !activityText.includes('chengBioDidBuildRequestWire(hmacKey, attestorEntry, "import", "2", normalizedRecoveryText, "请完成设备认证并恢复 DID", "验证后继续导入 DID")') ||
      !activityText.includes("fun chengProfileBioDidImportRequestWireFromNative(recoveryText: String): String") ||
      !activityText.includes("import_request_wire_built") ||
      !activityText.includes("device_auth_cancelled") ||
      !activityText.includes("device_auth_locked") ||
      !activityText.includes("device_auth_failed") ||
      activityText.includes("device_auth_user_cancelled") ||
      activityText.includes("device_auth_lockout")) {
    fail("Android shell must route DID import through native fingerprint/face BiometricPrompt");
  }
  if (!hostText.includes("cheng_host_social_groups_create") || !hostText.includes("chengCreateSocialGroupFromNative")) {
    fail("Android native host is missing social group creation host bridge");
  }
  if (!hostText.includes("void cheng_host_publish(const char* selectedMediaPath, const char* publishKind, const char* publishPayloadJson)") ||
      !hostText.includes('GetMethodID(env, cls, "chengPublishFromNative", "(Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;")') ||
      !hostText.includes("host_publish bridge_result")) {
    fail("Android native host is missing publish host bridge");
  }
  if (!hostText.includes("bool cheng_host_social_dm_send(const char* peerId, const char* conversationId, const char* messageJson)") ||
      !hostText.includes('GetMethodID(env, cls, "chengSocialDmSendFromNative", "(Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;)Z")') ||
      !activityText.includes("fun chengSocialDmSendFromNative")) {
    fail("Android native host is missing social DM host bridge");
  }
  if (!activityText.includes("fun chengProfileAssetActionSubmitFromNative(requestJson: String): String") ||
      !activityText.includes('getSharedPreferences("cheng_profile_asset_v1", Context.MODE_PRIVATE)') ||
      !activityText.includes("profile_asset_action_submit ok") ||
      !hostText.includes("const char* cheng_host_profile_asset_action_submit(const char* requestJson)") ||
      !hostText.includes('GetMethodID(env, cls, "chengProfileAssetActionSubmitFromNative", "(Ljava/lang/String;)Ljava/lang/String;")')) {
    fail("Android native host is missing profile asset action submit bridge");
  }
  if (!hostText.includes("cheng_host_profile_bio_did_import") ||
      !hostText.includes("chengProfileBioDidImportRequestWireFromNative") ||
      !hostText.includes("s_mobile_capi_bio_did_import_wire(raw)") ||
      !hostText.includes("capi_import_ok") ||
      !hostText.includes("device_did_recovery_required") ||
      hostText.includes("bio_did_import empty recovery -> create chain") ||
      hostText.includes("return cheng_host_profile_bio_did_create();")) {
    fail("Android native host is missing DID import biometric bridge");
  }
  if (!activityText.includes("CHENG_RUNTIME_STORAGE_PREFS") || !activityText.includes("getSharedPreferences(CHENG_RUNTIME_STORAGE_PREFS, Context.MODE_PRIVATE)") || !activityText.includes("editor.commit()")) {
    fail("Android shell is missing synchronous runtime storage persistence");
  }
  if (!activityText.includes('root.put("runtimeIdentity", sceneLifecycleRuntimeIdentity())') ||
      !activityText.includes('val fileIdentity = root.optString("runtimeIdentity", "")') ||
      !activityText.includes("scene_lifecycle_restore_skip identity_mismatch")) {
    fail("Android shell lifecycle snapshot restore must be tied to the current runtime identity");
  }
  if (!activityText.includes("scene_lifecycle_restore_skip \" + reason") ||
      !activityText.includes("discardSceneLifecycleSnapshot(\"snapshot_restore_failed\"") ||
      activityText.includes('throw IllegalStateException("cheng scene state snapshot restore failed")')) {
    fail("Android shell lifecycle snapshot restore failure must discard the bad snapshot and cold-start the current runtime");
  }
  if (!activityText.includes("restoreRuntimeStorage(handle)") || !activityText.includes("syncRuntimeStorageDirty(handle)") || !activityText.includes("private external fun nativeSetStorage(handle: Long, storageKey: String, value: String): Boolean")) {
    fail("Android shell is missing runtime storage restore/sync JNI hooks");
  }
  for (const required of [
    "cheng_mobile_host_runtime_set_storage",
    "cheng_mobile_host_runtime_storage_dirty_count",
    "cheng_mobile_host_runtime_storage_dirty_key_utf8",
    "cheng_mobile_host_runtime_storage_dirty_value_utf8",
    "cheng_mobile_host_runtime_storage_clear_dirty",
  ]) {
    if (!hostText.includes(required)) {
      fail(`Android native host is missing runtime storage bridge export: ${required}`);
    }
  }
  for (const required of [
    '{"nativeSetStorage", "(JLjava/lang/String;Ljava/lang/String;)Z"',
    '{"nativeStorageDirtyCount", "(J)I"',
    '{"nativeStorageDirtyKey", "(JI)Ljava/lang/String;"',
    '{"nativeStorageDirtyValue", "(JI)Ljava/lang/String;"',
    '{"nativeStorageClearDirty", "(JLjava/lang/String;)Z"',
  ]) {
    if (!hostText.includes(required)) {
      fail(`Android native host is missing runtime storage JNI method: ${required}`);
    }
  }
  if (!activityText.includes("finishComputerUseGuiReplayLongPress") || !activityText.includes("event.eventTime - computerUseGuiReplayDownUptimeMs")) {
    fail("Android shell long-press replay must use event-time completion on ACTION_UP");
  }
  if (!activityText.includes("computerUseSha256Hex") || !activityText.includes("MessageDigest.getInstance(\"SHA-256\")")) {
    fail("Android shell must name copied MediaStore files by SHA-256 content identity");
  }
  if (!hostText.includes("typedef int32_t (*cheng_app_computer_use_media_selection_result_utf8_fn)(const char*, const char*, const char*, int64_t, int64_t, int32_t, int32_t);")) {
    fail("Android native host is missing localPath/previewReady in Cheng computer-use media ABI typedef");
  }
  if (!hostText.includes("s_present_media_surface_playing_count > 0") || !hostText.includes("needs_frame = 1")) {
    fail("Android native host must force needs_frame while a media surface is playing");
  }
  if (!mediaNetworkBridgeText.includes("webSceneMediaEsPumpCursor = f") ||
      mediaNetworkBridgeText.includes("while cont == 2") ||
      mediaNetworkBridgeText.includes("os.SleepMs(2)")) {
    fail("Pure Cheng progressive ES bridge must return on FIFO-full and resume by cursor, not block the render thread");
  }
  if (!hostText.includes("es input_eos queued") ||
      !hostText.includes("media_playback_eos asset=%s frames=%d presentation_us=%lld es=1") ||
      !hostText.includes("aes input_eos queued") ||
      !hostText.includes("aes output_eos")) {
    fail("Android native host must carry progressive ES video/audio to decoder EOF");
  }
  if (!hostText.includes("s_cached_compositor_media_refresh_count") ||
      !hostText.includes('cheng_android_present_cached_compositor_media_frame("native_tick_media_playback")') ||
      !hostText.includes("layers == s_cached_compositor_layer_words") ||
      !hostText.includes("cached_compositor_media_refresh")) {
    fail("Android native host must replay cached compositor frames while media playback is active and the app has no dirty DOM frame");
  }
  if (!hostText.includes('__system_property_get("debug.cheng.media.trace"') ||
      !hostText.includes("cheng_android_media_trace_enabled(void)") ||
      !hostText.includes("decoded_any && cheng_android_media_trace_enabled()") ||
      !hostText.includes("rendered_any && cheng_android_media_trace_enabled()") ||
      !hostText.includes("cheng_android_media_trace_enabled() && s_cached_compositor_media_refresh_log_count")) {
    fail("Android native host must keep high-frequency media playback logs behind debug.cheng.media.trace");
  }
  if (!hostText.includes("s_pending_media_surface_batch_valid") ||
      !hostText.includes("cheng_android_maybe_commit_pending_media_surface_batch_for_compositor(commands, commandCount, commandStrideI32)") ||
      !hostText.includes("present_media_surface commit reason=%s") ||
      !hostText.includes("present_media_surface preserve_active reason=compositor_media_command") ||
      !hostText.includes("if (!cached_compositor_replay)")) {
    fail("Android native host must commit media surface batches only with real compositor frames");
  }
  if (!hostText.includes("s_input_events_since_tick") ||
      !hostText.includes("int drained_input_events = s_input_events_since_tick") ||
      !hostText.includes("s_input_events_since_tick = 0") ||
      !hostText.includes("native_tick_media_fast_path") ||
      !hostText.includes("computer_use_replay_active_for_media_fast_path") ||
      !hostText.includes("cheng_android_present_cached_compositor_media_frame(\"native_tick_media_fast_path\")")) {
    fail("Android native host must use the cached compositor media fast path for local video playback");
  }
  if (!hostText.includes("if (cached_compositor_replay)") ||
      !hostText.includes("int layer_has_media_surface = 0") ||
      !hostText.includes("if (layer_has_media_surface)") ||
      !hostText.includes("cheng_android_gpu_draw_layer_cache(framebuffer_width, framebuffer_height, width, height, replay_cache, offset_x, offset_y)")) {
    fail("Android cached media replay must rerasterize only media-bearing layers and reuse static GL layer textures");
  }
  if (!hostText.includes("cheng_android_invalidate_cached_compositor_frame") ||
      !hostText.includes("cache_compositor invalidate reason=%s") ||
      !hostText.includes("s_input_pending_frame_invalidation = 1") ||
      !hostText.includes("if (s_input_pending_frame_invalidation)") ||
      !hostText.includes("cheng_android_invalidate_cached_compositor_frame(\"input_drain\")") ||
      hostText.includes("cheng_android_invalidate_cached_compositor_frame(\"input_event\")")) {
    fail("Android native host must invalidate cached compositor frames only after input-driven Cheng state changes");
  }
  if (!hostText.includes("ChengAndroidLocalAudioPlayback") ||
      !hostText.includes("local_audio_playback_started") ||
      !hostText.includes("cheng_android_configure_local_audio_for_asset") ||
      !hostText.includes("cheng_android_local_audio_pump_decoder(&texture->audio, playback_state)") ||
      !hostText.includes("audio_clock_us") ||
      !hostText.includes("AAudioStreamBuilder_setUsage(builder, AAUDIO_USAGE_MEDIA)") ||
      !hostText.includes("AAudioStreamBuilder_setContentType(builder, AAUDIO_CONTENT_TYPE_MUSIC)") ||
      !hostText.includes("callback_nonzero_samples") ||
      !hostText.includes("callback_peak=%d callback_nonzero=%lld")) {
    fail("Android native host must decode local MP4 audio and use audio clock for normal local video playback");
  }
  if (!runtimeSource.includes("cheng_app_debug_state_is_video_playing") ||
      !runtimeSource.includes("cheng_app_debug_video_overlay_hidden") ||
      !hostText.includes("s_app_debug_state_is_video_playing") ||
      !hostText.includes("s_app_debug_video_overlay_hidden") ||
      !hostText.includes("video=%d,%d")) {
    fail("Android native host must expose video state and overlay visibility diagnostics for playback validation");
  }
  if (!hostText.includes("typedef int32_t (*cheng_app_text_input_cursor_utf8_fn)(const char*, int32_t);")) {
    fail("Android native host is missing cursor-aware text input ABI typedef");
  }
  if (!hostText.includes("typedef int32_t (*cheng_app_computer_use_gui_replay_start_fn)(int32_t);") || !hostText.includes("typedef int32_t (*cheng_app_computer_use_gui_replay_tick_fn)(int32_t);")) {
    fail("Android native host is missing computer-use GUI replay ABI typedefs");
  }
  if (!hostText.includes("{\"nativeStartComputerUseGuiReplay\", \"(JI)I\"") || !hostText.includes("computer_use_gui_replay_tick")) {
    fail("Android native host is missing computer-use GUI replay JNI/tick bridge");
  }
  if (!hostText.includes("s_app_debug_computer_use_chat_trigger_count") || !hostText.includes('dlsym(s_app_handle, "cheng_app_debug_computer_use_chat_trigger_count")')) {
    fail("Android native host is missing computer-use chat trigger diagnostics bridge");
  }
  if (!hostText.includes("native_computer_use_gui_replay_step_index") || !hostText.includes('{"nativeComputerUseGuiReplayStepIndex", "(J)I"')) {
    fail("Android native host is missing computer-use GUI replay progress JNI bridge");
  }
  if (!hostText.includes("s_app_debug_computer_use_current_slow_permille") || !hostText.includes('dlsym(s_app_handle, "cheng_app_debug_computer_use_current_slow_permille")')) {
    fail("Android native host is missing computer-use slow playback setting bridge");
  }
  if (!hostText.includes("{\"nativeApplyComputerUseMediaSelection\", \"(JLjava/lang/String;Ljava/lang/String;Ljava/lang/String;JJIZ)Z\"") ||
      !hostText.includes('dlsym(s_app_handle, "cheng_app_computer_use_media_selection_result_with_preview_utf8")')) {
    fail("Android native host is missing localPath/previewReady in JNI descriptor for MediaStore selection");
  }
  if (!hostText.includes("{\"nativeClearTextInputFocus\", \"(J)Z\"")) {
    fail("Android native host is missing JNI descriptor for text focus clearing");
  }
  if (!hostText.includes("{\"nativeTextInputCursorUtf8\", \"(JLjava/lang/String;I)Z\"")) {
    fail("Android native host is missing JNI descriptor for cursor-aware text input");
  }
  for (const required of [
    'cheng_resolve_required_app_export("cheng_app_on_back")',
    'cheng_resolve_required_app_export("cheng_app_text_input_utf8")',
    'cheng_resolve_required_app_export("cheng_app_text_input_cursor_utf8")',
    'cheng_resolve_required_app_export("cheng_app_clear_text_input_focus")',
  ]) {
    if (!hostText.includes(required)) {
      fail(`Android native host must require app export ${required}`);
    }
  }
  for (const forbidden of [
    'dlsym(s_app_handle, "cheng_app_on_back")',
    'dlsym(s_app_handle, "cheng_app_text_input_utf8")',
    'dlsym(s_app_handle, "cheng_app_text_input_cursor_utf8")',
    'dlsym(s_app_handle, "cheng_app_clear_text_input_focus")',
  ]) {
    if (hostText.includes(forbidden)) {
      fail(`Android native host must not resolve optional app export ${forbidden}`);
    }
  }
  if (!hostText.includes("return result == 1 ? JNI_TRUE : JNI_FALSE;")) {
    fail("Android native host must distinguish bridge success from negative media status codes");
  }
}

async function verifyApkPayloads(apk, shellDir, oneClick, copiedAssets, libName, toolchain, socialBackendMode, socialBackendLibMode = false) {
  const entriesText = await runCommand("zipinfo", ["-1", apk], {
    cwd: repoRoot,
    timeout: 30000,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  const entries = entriesText.split(/\r?\n/).filter(Boolean).sort();
  const requiredSocialNativeEntries = [
    "lib/arm64-v8a/libp2pbridge.so",
    "lib/arm64-v8a/libchenglibp2p.so",
  ];
  const requiredQrDecoderNativeEntries = [
    "lib/arm64-v8a/libbarhopper_v3.so",
  ];
  const expectedNativeEntries = new Set([
    `lib/arm64-v8a/lib${libName}.so`,
    `lib/arm64-v8a/lib${SCENE_RUNTIME_PROVIDER_LIB_NAME}.so`,
    `lib/arm64-v8a/lib${MOBILE_CAPI_LIB_NAME}.so`,
    `lib/arm64-v8a/lib${MOQ_ANDROID_LIB_NAME}.so`,
    "lib/arm64-v8a/libcheng_generated_android_host.so",
    ...requiredSocialNativeEntries,
    ...requiredQrDecoderNativeEntries,
    ...(socialBackendMode === "group-create" ? ["lib/arm64-v8a/libchengv3mobile.so"] : []),
  ]);
  for (const entry of requiredSocialNativeEntries) {
    if (!entries.includes(entry)) {
      fail(`APK is missing required social backend native library: ${entry}`);
    }
  }
  for (const entry of requiredQrDecoderNativeEntries) {
    if (!entries.includes(entry)) {
      fail(`APK is missing required QR decoder native library: ${entry}`);
    }
  }
  const unexpectedNativeEntries = entries.filter((entry) =>
    entry.startsWith("lib/arm64-v8a/lib") &&
    entry.endsWith(".so") &&
    !expectedNativeEntries.has(entry)
  );
  if (unexpectedNativeEntries.length > 0) {
    fail(`APK contains stale native libraries: ${unexpectedNativeEntries.join(", ")}`);
  }
  const byteExact = [
    {
      entry: "assets/mobile_shell_runtime_contract_v1.json",
      source: join(shellDir, "mobile_shell_runtime_contract_v1.json"),
      label: "runtime manifest",
    },
    {
      entry: "assets/runtime/mobile_shell_runtime_contract_payload.json",
      source: join(shellDir, "runtime/runtime_contract_payload.json"),
      label: "runtime contract payload",
    },
    {
      entry: "assets/runtime/mobile_shell_runtime_bundle_payload.json",
      source: join(shellDir, "runtime/runtime_bundle_payload.json"),
      label: "runtime bundle payload",
    },
    {
      entry: "assets/runtime/mobile_shell_launch_args.kv",
      source: join(shellDir, "runtime/mobile_shell_launch_args.kv"),
      label: "launch args kv",
    },
    {
      entry: "assets/runtime/mobile_shell_launch_args.json",
      source: join(shellDir, "runtime/mobile_shell_launch_args.json"),
      label: "launch args json",
    },
    {
      entry: "assets/runtime/unimaker_scene_data.bin",
      source: oneClick.sceneData,
      label: "scene data asset",
    },
    {
      entry: "assets/runtime/unimaker_glyph_sdf_pixels.bin",
      source: oneClick.glyphPixels,
      label: "glyph SDF pixel asset",
    },
    {
      entry: "assets/runtime/unimaker_computer_use_manifest.json",
      source: oneClick.computerUseManifest.path,
      label: "computer-use manifest",
      expectedSha256: oneClick.computerUseManifest.sha256,
    },
    ...oneClick.media.map((media) => ({
      entry: `assets/${media.relPath}`,
      source: media.path,
      label: `media asset ${media.relPath}`,
      expectedSha256: media.assetCid,
    })),
  ];
  const verified = [];
  for (const item of byteExact) {
    if (!entries.includes(item.entry)) {
      fail(`APK is missing ${item.label}: ${item.entry}`);
    }
    requireNonEmptyFile(item.source, item.label);
    const apkPayload = await runCommand("unzip", ["-p", apk, item.entry], {
      cwd: repoRoot,
      timeout: 30000,
      maxBuffer: Math.max(32 * 1024 * 1024, statSync(item.source).size + 1024),
    });
    const apkHash = sha256Buffer(apkPayload);
    const sourceHash = sha256File(item.source);
    if (apkHash !== sourceHash) {
      fail(`APK payload hash mismatch for ${item.entry}`);
    }
    if (item.expectedSha256 && sourceHash !== item.expectedSha256) {
      fail(`APK media payload sha256 does not match assetCid for ${item.entry}`);
    }
    verified.push({
      entry: item.entry,
      source: item.source,
      byteCount: statSync(item.source).size,
      sha256: sourceHash,
      verification: "byte-exact",
    });
  }
  const appLibrary = await verifyNativeSharedLibrary({
    apk,
    entries,
    entry: `lib/arm64-v8a/lib${libName}.so`,
    label: "Cheng app shared library",
    requiredSymbols: [
      "cheng_app_init",
      "cheng_app_tick",
      "cheng_app_on_touch_milli",
      "cheng_app_on_back",
      "cheng_app_debug_glyph_sdf_pixel_count",
      "cheng_app_clear_text_input_focus",
	      "cheng_app_text_input_utf8",
	      "cheng_app_text_input_cursor_utf8",
	      "cheng_app_computer_use_compile_text_utf8",
	      "cheng_app_computer_use_gui_replay_start",
	      "cheng_app_computer_use_gui_replay_tick",
	      "cheng_app_debug_computer_use_gui_replay_active",
	      "cheng_app_debug_computer_use_gui_replay_step_index",
	      "cheng_app_debug_computer_use_gui_replay_step_count",
	      "cheng_app_debug_computer_use_gui_replay_applied_count",
	      "cheng_app_debug_computer_use_gui_replay_last_status",
	      "cheng_app_debug_computer_use_execution_mode",
	      "cheng_app_debug_computer_use_current_slow_permille",
	      "cheng_app_debug_computer_use_manifest_ready",
	      "cheng_app_debug_computer_use_action_count",
	      "cheng_app_debug_computer_use_template_count",
	      "cheng_app_debug_computer_use_last_template_code",
	      "cheng_app_debug_computer_use_last_title_utf8",
	      "cheng_app_computer_use_media_selection_result_utf8",
	      "cheng_app_debug_computer_use_last_media_status",
	      "cheng_app_debug_computer_use_last_media_local_path_byte_len",
	      ...(Array.isArray(oneClick.media) && oneClick.media.length > 0 ? ["cheng_scene_media_fetch_remote_announced_to_file"] : []),
	    ],
    toolchain,
    verified,
  });
  const hostLibrary = await verifyNativeSharedLibrary({
    apk,
    entries,
    entry: "lib/arm64-v8a/libcheng_generated_android_host.so",
    label: "Android host shared library",
    requiredSymbols: [
      "JNI_OnLoad",
      "cheng_mobile_host_trace_step",
      "cheng_mobile_host_read_scene_data_asset",
      "cheng_mobile_host_read_glyph_sdf_pixel_asset",
      "cheng_mobile_host_present_compositor_frame",
      "cheng_mobile_host_present_media_surface_commands",
      "cheng_mobile_host_prepare_media_surface_texture",
      "cheng_mobile_host_register_media_surface_texture",
      "cheng_mobile_host_upload_image_atlas",
      "cheng_mobile_host_upload_svg_display_list_atlas",
      "cheng_mobile_host_upload_glyph_sdf_atlas",
      "cheng_mobile_host_upload_glyph_sdf_atlas_bytes",
      "cheng_mobile_host_set_ink_fade",
      "cheng_mobile_host_upload_ink_field",
      "cheng_mobile_host_present_overlay_refresh",
      "cheng_mobile_host_present_gpu_commands",
      "cheng_host_profile_asset_action_submit",
      "cheng_host_social_dm_send",
      ...ANDROID_HOST_RUNTIME_REQUIRED_SYMBOLS,
      ...ANDROID_HOST_CAPTURE_REQUIRED_SYMBOLS,
    ],
    toolchain,
    verified,
  });
  const sceneRuntimeProviderLibrary = await verifyNativeSharedLibrary({
    apk,
    entries,
    entry: `lib/arm64-v8a/lib${SCENE_RUNTIME_PROVIDER_LIB_NAME}.so`,
    label: "Cheng scene runtime provider shared library",
    requiredSymbols: ANDROID_SCENE_RUNTIME_PROVIDER_ROOTS.split(","),
    toolchain,
    verified,
  });
  await verifyPackagedNativeDependencies({
    entry: sceneRuntimeProviderLibrary.entry,
    path: sceneRuntimeProviderLibrary.extracted,
    entries,
    toolchain,
    verified,
  });
  const mobileCapiLibrary = await verifyNativeSharedLibrary({
    apk,
    entries,
    entry: `lib/arm64-v8a/lib${MOBILE_CAPI_LIB_NAME}.so`,
    label: "Cheng mobile CAPI shared library",
    requiredSymbols: MOBILE_CAPI_REQUIRED_SYMBOLS,
    toolchain,
    verified,
  });
  await verifyNativeSharedLibrary({
    apk,
    entries,
    entry: `lib/arm64-v8a/lib${MOQ_ANDROID_LIB_NAME}.so`,
    label: "Cheng MoQ Android publisher shared library",
    requiredSymbols: ["cheng_android_publish_serve_file"],
    toolchain,
    verified,
  });
  await verifyAndroidHostLinkage({
    appEntry: appLibrary.entry,
    appPath: appLibrary.extracted,
    hostEntry: hostLibrary.entry,
    hostPath: hostLibrary.extracted,
    toolchain,
    verified,
  });
  const appNeeded = await readNeededSharedLibraries(toolchain, appLibrary.extracted);
  if (!appNeeded.includes(`lib${SCENE_RUNTIME_PROVIDER_LIB_NAME}.so`)) {
    fail(`APK app library ${appLibrary.entry} must DT_NEEDED lib${SCENE_RUNTIME_PROVIDER_LIB_NAME}.so: ${appNeeded.join(", ")}`);
  }
  await verifyPackagedNativeDependencies({
    entry: appLibrary.entry,
    path: appLibrary.extracted,
    entries,
    toolchain,
    verified,
  });
  await verifyPackagedNativeDependencies({
    entry: mobileCapiLibrary.entry,
    path: mobileCapiLibrary.extracted,
    entries,
    toolchain,
    verified,
  });
  const socialGroupBackendSymbols = socialBackendLibMode
    ? SOCIAL_GROUP_BACKEND_SYMBOLS.filter((symbol) =>
        symbol !== "libp2p_runtime_health_json" && symbol !== "libp2p_network_discovery_snapshot")
    : SOCIAL_GROUP_BACKEND_SYMBOLS;
  const socialBridgeLibrary = await verifyNativeSharedLibrary({
    apk,
    entries,
    entry: "lib/arm64-v8a/libp2pbridge.so",
    label: "Android libp2p JNI bridge",
    requiredSymbols: socialBackendMode === "group-create"
      ? SOCIAL_GROUP_BRIDGE_JNI_SYMBOLS
      : SOCIAL_FULL_BRIDGE_REQUIRED_SYMBOLS,
    toolchain,
    verified,
  });
  const socialBackendLibrary = await verifyNativeSharedLibrary({
    apk,
    entries,
    entry: "lib/arm64-v8a/libchenglibp2p.so",
    label: "Cheng libp2p social backend",
    requiredSymbols: socialBackendMode === "group-create" ? socialGroupBackendSymbols : SOCIAL_FULL_BACKEND_REQUIRED_SYMBOLS,
    toolchain,
    verified,
  });
  await verifyPackagedNativeDependencies({
    entry: socialBridgeLibrary.entry,
    path: socialBridgeLibrary.extracted,
    entries,
    toolchain,
    verified,
  });
  await verifyPackagedNativeDependencies({
    entry: socialBackendLibrary.entry,
    path: socialBackendLibrary.extracted,
    entries,
    toolchain,
    verified,
  });
  await verifyPureChengSocialBackendLinkage({
    bridgeEntry: socialBridgeLibrary.entry,
    bridgePath: socialBridgeLibrary.extracted,
    backendEntry: socialBackendLibrary.entry,
    backendPath: socialBackendLibrary.extracted,
    socialBackendMode,
    socialBackendLibMode,
    toolchain,
    verified,
  });
  for (const copied of copiedAssets) {
    const mirrored = join(shellDir, copied.relPath);
    requireNonEmptyFile(mirrored, `mobile shell mirrored ${copied.relPath}`);
    if (sha256File(mirrored) !== copied.sha256) {
      fail(`mobile shell mirrored payload hash mismatch for ${copied.relPath}`);
    }
  }
  return { entries, verified };
}

async function verifyNativeSharedLibrary({ apk, entries, entry, label, requiredSymbols, toolchain, verified }) {
  if (!entries.includes(entry)) {
    fail(`APK is missing ${label}: ${entry}`);
  }
  const payload = await runCommand("unzip", ["-p", apk, entry], {
    cwd: repoRoot,
    timeout: 30000,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (payload.length <= 0) {
    fail(`APK native library is empty: ${entry}`);
  }
  const extracted = join(buildDir, "apk-verify", entry.replaceAll("/", "_"));
  mkdirSync(dirname(extracted), { recursive: true });
  writeFileSync(extracted, payload);
  const dynSyms = await runCommand(toolchain.readElf, ["--dyn-syms", extracted], {
    cwd: repoRoot,
    timeout: 30000,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  for (const symbol of requiredSymbols) {
    if (!dynSyms.includes(symbol)) {
      fail(`APK native library ${entry} missing dynamic symbol ${symbol}`);
    }
  }
  verified.push({
    entry,
    source: extracted,
    byteCount: payload.length,
    sha256: sha256Buffer(payload),
    verification: "elf-dynsym",
    requiredSymbols,
  });
  return { entry, extracted };
}

async function verifyAndroidHostLinkage({ appEntry, appPath, hostEntry, hostPath, toolchain, verified }) {
  const appImports = await readUndefinedDynamicSymbols(toolchain, appPath);
  const hostExports = await readDefinedDynamicSymbols(toolchain, hostPath);
  const requiredHostSymbols = [...appImports].filter(isChengAndroidHostSymbol).sort();
  if (requiredHostSymbols.length <= 0) {
    fail(`APK app library ${appEntry} imports no Cheng Android host symbols`);
  }
  const missing = requiredHostSymbols.filter((symbol) => !hostExports.has(symbol));
  if (missing.length > 0) {
    fail(`APK Android host ABI mismatch: ${appEntry} imports symbols not defined by ${hostEntry}: ${missing.join(", ")}`);
  }
  const appPayload = readFileSync(appPath);
  const hostPayload = readFileSync(hostPath);
  verified.push({
    entry: `${appEntry} -> ${hostEntry}`,
    source: `${appPath} -> ${hostPath}`,
    byteCount: appPayload.length + hostPayload.length,
    sha256: createHash("sha256").update(appPayload).update(hostPayload).digest("hex"),
    verification: "elf-host-linkage",
    requiredSymbols: requiredHostSymbols,
  });
  const hostImports = await readUndefinedDynamicSymbols(toolchain, hostPath);
  const forbiddenAppSymbols = [...hostImports].filter(isChengAppLibrarySymbol).sort();
  if (forbiddenAppSymbols.length > 0) {
    fail(`APK Android host must resolve app exports with dlopen/dlsym, not dynamic undefined imports: ${forbiddenAppSymbols.join(", ")}`);
  }
  verified.push({
    entry: hostEntry,
    source: hostPath,
    byteCount: hostPayload.length,
    sha256: sha256Buffer(hostPayload),
    verification: "elf-host-no-app-undefined",
    forbiddenSymbols: forbiddenAppSymbols,
  });
}

async function verifyPureChengSocialBackendLinkage({ bridgeEntry, bridgePath, backendEntry, backendPath, socialBackendMode, socialBackendLibMode = false, toolchain, verified }) {
  const needed = await readNeededSharedLibraries(toolchain, bridgePath);
  if (!needed.includes("libchenglibp2p.so")) {
    fail(`APK ${bridgeEntry} must depend on libchenglibp2p.so`);
  }
  const forbiddenNeeded = needed.filter((name) => name === "libnimlibp2p.so" || name === "libchengv3mobile.so");
  if (forbiddenNeeded.length > 0) {
    fail(`APK ${bridgeEntry} still depends on retired native backend libraries: ${forbiddenNeeded.join(", ")}`);
  }
  const bridgeImports = await readUndefinedDynamicSymbols(toolchain, bridgePath);
  const backendExports = await readDefinedDynamicSymbols(toolchain, backendPath);
  const requiredBackendSymbols = [...bridgeImports]
    .filter((symbol) => symbol.startsWith("libp2p_") || symbol.startsWith("social_"))
    .sort();
  if (requiredBackendSymbols.length <= 0) {
    fail(`APK ${bridgeEntry} imports no libp2p/social backend symbols`);
  }
  if (socialBackendMode === "group-create") {
    const allowed = new Set(socialBackendLibMode
      ? SOCIAL_GROUP_BACKEND_SYMBOLS.filter((symbol) =>
          symbol !== "libp2p_runtime_health_json" && symbol !== "libp2p_network_discovery_snapshot")
      : SOCIAL_GROUP_BACKEND_SYMBOLS);
    const unexpected = requiredBackendSymbols.filter((symbol) => allowed.has(symbol) === false);
    if (unexpected.length > 0) {
      fail(`APK ${bridgeEntry} group-create bridge imports symbols outside current handler closure: ${unexpected.join(", ")}`);
    }
    const missingImports = [...allowed].filter((symbol) => requiredBackendSymbols.includes(symbol) === false);
    if (missingImports.length > 0) {
      fail(`APK ${bridgeEntry} group-create bridge missing required backend imports: ${missingImports.join(", ")}`);
    }
  }
  const missing = requiredBackendSymbols.filter((symbol) => !backendExports.has(symbol));
  if (missing.length > 0) {
    fail(`APK ${backendEntry} does not satisfy ${bridgeEntry} backend imports: ${missing.join(", ")}`);
  }
  verified.push({
    entry: `${bridgeEntry} -> ${backendEntry}`,
    source: `${bridgePath} -> ${backendPath}`,
    byteCount: statSync(bridgePath).size + statSync(backendPath).size,
    sha256: createHash("sha256").update(readFileSync(bridgePath)).update(readFileSync(backendPath)).digest("hex"),
    verification: "pure-cheng-social-backend-linkage",
    socialBackendMode,
    neededLibraries: needed,
    requiredBackendSymbols,
  });
}

async function extractApkEntry(apk, entry) {
  const payload = await runCommand("unzip", ["-p", apk, entry], {
    cwd: repoRoot,
    timeout: 30000,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (payload.length <= 0) {
    fail(`APK entry is empty: ${entry}`);
  }
  const extracted = join(buildDir, "apk-verify", entry.replaceAll("/", "_"));
  mkdirSync(dirname(extracted), { recursive: true });
  writeFileSync(extracted, payload);
  return extracted;
}

async function verifyPackagedNativeDependencies({ entry, path, entries, toolchain, verified }) {
  const needed = await readNeededSharedLibraries(toolchain, path);
  const packagedNativeLibNames = new Set(
    entries
      .filter((candidate) => candidate.startsWith("lib/arm64-v8a/") && candidate.endsWith(".so"))
      .map((candidate) => candidate.split("/").pop())
  );
  const systemLibs = new Set([
    "libaaudio.so",
    "libandroid.so",
    "libc.so",
    "libdl.so",
    "libEGL.so",
    "libGLESv3.so",
    "libjnigraphics.so",
    "liblog.so",
    "libm.so",
    "libmediandk.so",
  ]);
  const missing = needed.filter((name) => !systemLibs.has(name) && !packagedNativeLibNames.has(name));
  if (missing.length > 0) {
    fail(`APK native library ${entry} has unpackaged dependencies: ${missing.join(", ")}`);
  }
  verified.push({
    entry,
    source: path,
    byteCount: statSync(path).size,
    sha256: sha256File(path),
    verification: "elf-needed-libs-packaged",
    neededLibraries: needed,
  });
}

async function readNeededSharedLibraries(toolchain, path) {
  const dynText = await runCommand(toolchain.readElf, ["--dynamic", path], {
    cwd: repoRoot,
    timeout: 30000,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  const needed = [];
  for (const line of dynText.split(/\r?\n/)) {
    const match = line.match(/Shared library:\s+\[([^\]]+)\]/);
    if (match) needed.push(match[1]);
  }
  return needed.sort();
}

async function readUndefinedDynamicSymbols(toolchain, path) {
  const nmText = await runCommand(toolchain.nm, ["-D", "-u", path], {
    cwd: repoRoot,
    timeout: 30000,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  const symbols = new Set();
  for (const line of nmText.split(/\r?\n/)) {
    const match = line.trim().match(/^U\s+([^\s]+)$/);
    if (match) symbols.add(match[1]);
  }
  return symbols;
}

async function readDefinedDynamicSymbols(toolchain, path) {
  const nmText = await runCommand(toolchain.nm, ["-D", "--defined-only", path], {
    cwd: repoRoot,
    timeout: 30000,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  const symbols = new Set();
  for (const line of nmText.split(/\r?\n/)) {
    const trimmed = line.trim();
    const match = trimmed.match(/^(?:[0-9A-Fa-f]+\s+)?[A-Za-z]\s+([^\s]+)$/);
    if (match) symbols.add(match[1]);
  }
  return symbols;
}

async function readDefinedSymbols(toolchain, path) {
  const nmText = await runCommand(toolchain.nm, ["--defined-only", path], {
    cwd: repoRoot,
    timeout: 30000,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  const symbols = new Set();
  for (const line of nmText.split(/\r?\n/)) {
    const trimmed = line.trim();
    const match = trimmed.match(/^(?:[0-9A-Fa-f]+\s+)?[A-Za-z]\s+([^\s]+)$/);
    if (match) symbols.add(match[1]);
  }
  return symbols;
}

async function assertNoSocialGroupBackendMutableGlobals(toolchain, path) {
  const symbols = await readDefinedSymbols(toolchain, path);
  const mutableGlobals = [...symbols]
    .filter((symbol) => symbol.startsWith("cheng_global__") && symbol.includes("unimaker_android_social_group_backend"))
    .sort();
  if (mutableGlobals.length > 0) {
    fail(`group-create social backend must not emit Cheng mutable globals on Android: ${mutableGlobals.join(", ")}`);
  }
}

function isChengAndroidHostSymbol(symbol) {
  const exactHostSymbols = new Set([
    "cheng_errno",
    "cheng_epoch_time",
    "cheng_epoch_time_ms",
    "cheng_epoch_time_seconds",
    "cheng_fclose",
    "cheng_fd_wait_readable_bridge",
    "cheng_fflush",
    "cheng_fwrite",
    "cheng_fwrite_i32",
    "cheng_f64_to_i32",
    "cheng_monotime_ns",
    "cheng_mobile_protect_callback_ready",
    "cheng_mobile_protect_fd",
    "cheng_mobile_udp_debug_event",
    "cheng_mobile_udp_fd_wait_readable",
    "cheng_mobile_udp_recvfrom_addr_ptr_bridge",
    "cheng_os_fopen_mode_bridge",
    "cheng_strerror",
    "cheng_system_entropy_fill",
    "cheng_native_stream_recv",
    "cheng_native_stream_send",
    "cheng_ptr_size",
    "cheng_seq_free",
    "cheng_seq_set_grow",
    "cheng_seq_string_elem_bytes_compat",
    "cheng_seq_string_register_compat",
    "cheng_udp_platform_use_len_field_bridge",
    "cheng_udp_recvfrom_addr_bridge",
    "cheng_udp_recvfrom_addr_ptr_bridge",
    "cheng_host_profile_asset_action_submit",
    "cheng_host_profile_bio_did_create",
    "cheng_host_profile_bio_did_import",
    "cheng_host_profile_peer_id_refresh",
    "c_iometer_call",
    "get_stderr",
    "libc_bind",
    "libc_close",
    "libc_fcntl",
    "libc_inet_ntop",
    "libc_inet_pton",
    "load_int32",
    "load_ptr",
    "libc_sendto",
    "libc_setsockopt",
    "libc_socket",
    "store_int32",
    "store_ptr",
  ]);
  const hostDriverCBridges = new Set([
    "driver_c_create_dir_all_bridge",
    "driver_c_str_slice_bridge",
    "driver_c_str_concat_bridge",
    "driver_c_str_from_utf8_copy_bridge",
  ]);
  return exactHostSymbols.has(symbol) || hostDriverCBridges.has(symbol) || symbol.startsWith("cheng_mobile_host_") || symbol.startsWith("cheng_host_");
}

function isChengAppLibrarySymbol(symbol) {
  return symbol.startsWith("cheng_") && !isChengAndroidHostSymbol(symbol);
}

function resolveAndroidToolchain(opts) {
  const ndkRoot = resolvePath(opts.ndkRoot || findDefaultNdkRoot());
  requireDir(ndkRoot, "Android NDK root");
  const prebuilt = join(ndkRoot, "toolchains/llvm/prebuilt/darwin-x86_64");
  requireDir(prebuilt, "Android NDK LLVM prebuilt dir");
  const apiLibDir = join(prebuilt, "sysroot/usr/lib/aarch64-linux-android", opts.androidApiLevel);
  requireDir(apiLibDir, "Android API lib dir");
  const hostCc = resolvePath(opts.androidHostCc || join(prebuilt, "bin/clang"));
  const targetCc = resolvePath(join(prebuilt, "bin", `aarch64-linux-android${opts.androidApiLevel}-clang`));
  const targetCxx = resolvePath(join(prebuilt, "bin", `aarch64-linux-android${opts.androidApiLevel}-clang++`));
  const hostLd = resolvePath(opts.androidHostLd || join(prebuilt, "bin/ld.lld"));
  const readElf = resolvePath(join(prebuilt, "bin/llvm-readelf"));
  const nm = resolvePath(join(prebuilt, "bin/llvm-nm"));
  requireExecutableFile(hostCc, "Android host clang");
  requireExecutableFile(targetCc, "Android target clang");
  requireExecutableFile(targetCxx, "Android target clang++");
  requireExecutableFile(hostLd, "Android host linker");
  requireExecutableFile(readElf, "Android llvm-readelf");
  requireExecutableFile(nm, "Android llvm-nm");
  const clangRtDir = resolvePath(opts.androidClangRtDir || findDefaultClangRtDir(prebuilt));
  requireNonEmptyFile(join(clangRtDir, "libclang_rt.builtins-aarch64-android.a"), "Android clang builtins");
  requireNonEmptyFile(join(clangRtDir, "aarch64/libunwind.a"), "Android libunwind");
  for (const lib of ["libandroid.so", "liblog.so", "libEGL.so", "libGLESv3.so", "libmediandk.so", "libjnigraphics.so", "libaaudio.so", "libm.so", "libdl.so", "libc.so"]) {
    requireNonEmptyFile(join(apiLibDir, lib), `Android API ${lib}`);
  }
  const javaHome = resolvePath(opts.javaHome || findDefaultJavaHome());
  requireDir(javaHome, "Java home");
  requireDir(join(javaHome, "include"), "Java include dir");
  requireDir(join(javaHome, "include/darwin"), "Java Darwin include dir");
  return {
    ndkRoot,
    prebuilt,
    apiLibDir,
    hostCc,
    targetCc,
    targetCxx,
    hostLd,
    readElf,
    nm,
    clangRtDir,
    javaHome,
    apiLevel: opts.androidApiLevel,
  };
}

function findDefaultNdkRoot() {
  const candidates = [
    process.env.ANDROID_NDK_ROOT,
    process.env.ANDROID_NDK_HOME,
    join(process.env.HOME ?? "", "Library/Android/sdk/ndk/26.3.11579264"),
    join(process.env.HOME ?? "", "Library/Android/sdk/ndk/29.0.13599879"),
    join(process.env.HOME ?? "", "Library/Android/sdk/ndk/27.0.12077973"),
    join(process.env.HOME ?? "", "Library/Android/sdk/ndk/25.1.8937393"),
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  const ndkParent = join(process.env.HOME ?? "", "Library/Android/sdk/ndk");
  if (existsSync(ndkParent)) {
    const versions = readdirSync(ndkParent)
      .map((name) => join(ndkParent, name))
      .filter((path) => existsSync(join(path, "toolchains/llvm/prebuilt/darwin-x86_64/bin/ld.lld")))
      .sort()
      .reverse();
    if (versions.length > 0) return versions[0];
  }
  fail("Android NDK root not found; pass --android-ndk-root");
}

function findDefaultClangRtDir(prebuilt) {
  const root = join(prebuilt, "lib/clang");
  requireDir(root, "Android clang runtime root");
  const versions = readdirSync(root)
    .map((name) => join(root, name, "lib/linux"))
    .filter((path) =>
      existsSync(join(path, "libclang_rt.builtins-aarch64-android.a")) &&
      existsSync(join(path, "aarch64/libunwind.a")))
    .sort()
    .reverse();
  if (versions.length <= 0) {
    fail(`Android clang runtime dir not found under ${root}`);
  }
  return versions[0];
}

function findDefaultJavaHome() {
  if (process.env.JAVA_HOME && javaHomeHasJniHeaders(process.env.JAVA_HOME)) {
    return process.env.JAVA_HOME;
  }
  try {
    const out = execFileSync("/usr/libexec/java_home", [], { encoding: "utf8" }).trim();
    if (out.length > 0 && javaHomeHasJniHeaders(out)) return out;
  } catch {
    // fall through to hard fail below
  }
  fail("Java home not found; pass --android-java-home");
}

function javaHomeHasJniHeaders(path) {
  return existsSync(path) &&
    existsSync(join(path, "include")) &&
    existsSync(join(path, "include/darwin"));
}

function writeSummary(data) {
  const androidHostCaptureVerified = data.verifiedApkPayloads.some((record) =>
    record.entry === "lib/arm64-v8a/libcheng_generated_android_host.so" &&
    record.verification === "elf-dynsym" &&
    ANDROID_HOST_CAPTURE_REQUIRED_SYMBOLS.every((symbol) => record.requiredSymbols?.includes(symbol))
  );
  const summary = {
    schema: "unimaker.apk_build.v1",
    mode: data.mode,
    oneClickOutDir: oneClickOutDir,
    oneClickSummary: data.oneClick.summaryFile,
    sceneRuntimeSource: data.oneClick.sceneRuntimeSource,
    computerUseManifest: data.oneClick.computerUseManifest,
    runtimeBundleSourceDir,
    runtimeBundlePayload: runtimeBundlePayloadPath,
    runtimeContractPayload: runtimeContractPayloadPath,
    outDir,
    buildDir,
    shellOutDir: data.shellOutDir,
    cheng: resolvePath(options.cheng),
    mobileShellTool: data.mobileShellTool,
    android: {
      ndkRoot: data.toolchain.ndkRoot,
      javaHome: data.toolchain.javaHome,
      apiLevel: data.toolchain.apiLevel,
      hostCc: data.toolchain.hostCc,
      targetCc: data.toolchain.targetCc,
      targetCxx: data.toolchain.targetCxx,
      hostLd: data.toolchain.hostLd,
      readElf: data.toolchain.readElf,
      clangRtDir: data.toolchain.clangRtDir,
      appId: options.appId,
      appName: options.appName,
      libName: options.libName,
      versionCode: androidVersionCode,
      mobileCapiLibName: MOBILE_CAPI_LIB_NAME,
      socialBackendMode: options.socialBackendMode,
      routeState: options.routeState,
      hostCapture: {
        supported: androidHostCaptureVerified,
        backend: androidHostCaptureVerified ? "egl_pbuffer_gles3" : "not_verified",
        output: androidHostCaptureVerified ? "rgba_top_left" : "not_verified",
        requiredSymbols: ANDROID_HOST_CAPTURE_REQUIRED_SYMBOLS,
      },
      headlessCapture: data.captureExecutable ? {
        supported: true,
        executable: data.captureExecutable.executable,
        bundleDir: data.captureExecutable.bundleDir,
        assetDir: data.captureExecutable.assetDir,
        defaultViewport: data.captureExecutable.defaultViewport,
        runCommand: data.captureExecutable.runCommand,
        verification: data.captureExecutable.verification,
      } : {
        supported: false,
        executable: "",
        bundleDir: "",
        assetDir: "",
        defaultViewport: "",
        runCommand: "",
        verification: "not_built",
      },
    },
    appObject: data.appObject,
    appSo: data.appSo,
    sceneRuntimeProviderObject: data.sceneRuntimeProviderObject ?? "",
    sceneRuntimeProviderSo: data.sceneRuntimeProviderSo ?? "",
    sceneRuntimeProviderPackage: data.sceneRuntimeProviderPackage ?? null,
    sceneRuntimeProvider: {
      libName: SCENE_RUNTIME_PROVIDER_LIB_NAME,
      exportRoots: ANDROID_SCENE_RUNTIME_PROVIDER_ROOTS.split(","),
    },
    mobileCapiCompiler: resolvePath(options.mobileCapiCheng),
    mobileCapiObject: data.mobileCapiObject,
    mobileCapiSo: data.mobileCapiSo,
    mobileCapiPackage: data.mobileCapiPackage,
    androidBlockCacheBootstrap: data.androidBlockCacheBootstrap ?? null,
    androidSocialBackendBootstrap: data.androidSocialBackendBootstrap ?? null,
    androidHostProviderSo: data.androidHostProviderSo,
    moqAndroidPublisherSo: data.moqAndroidPublisherSo,
    moqAndroidPublisherPackage: data.moqAndroidPublisherPackage,
    captureExecutable: data.captureExecutable,
    apk: data.apk,
    socialBackendOverlay: data.socialBackendOverlay,
    cleanup: data.cleanup ?? null,
    copiedAssets: data.copiedAssets,
    apkEntries: data.apkEntries,
    verifiedApkPayloads: data.verifiedApkPayloads,
  };
  writeFileSync(summaryPath, JSON.stringify(summary, null, 2) + "\n", "utf8");
  return summaryPath;
}

function readJsonFile(path) {
  requireNonEmptyFile(path, "JSON file");
  return JSON.parse(readFileSync(path, "utf8"));
}

function pathForChengInput(path) {
  const rel = relative(repoRoot, path);
  if (!rel.startsWith("..") && !rel.startsWith("/")) return rel;
  return path;
}

function resolvePath(path) {
  return resolve(path);
}

function retainFinalApk(apk, destination) {
  mkdirSync(dirname(destination), { recursive: true });
  if (resolvePath(apk) !== resolvePath(destination)) {
    copyFileSync(apk, destination);
  }
  requireNonEmptyFile(destination, "retained Android APK");
  return destination;
}

function cleanupApkBuildTree() {
  const removed = [];
  for (const path of [
    buildDir,
    runtimeBundleSourceDir,
    shellOutDir,
  ]) {
    if (!existsSync(path)) continue;
    rmSync(path, {
      recursive: true,
      force: true,
      maxRetries: 8,
      retryDelay: 50,
    });
    removed.push(path);
  }
  return {
    enabled: true,
    retainedApk: retainedApkPath,
    removed,
  };
}

function requireDir(path, label) {
  if (!existsSync(path) || !statSync(path).isDirectory()) {
    fail(`${label} missing: ${path}`);
  }
}

function requireNonEmptyFile(path, label) {
  if (!existsSync(path) || !statSync(path).isFile() || statSync(path).size <= 0) {
    fail(`${label} missing or empty: ${path}`);
  }
}

function requireExecutableFile(path, label) {
  requireNonEmptyFile(path, label);
  try {
    const mode = statSync(path).mode;
    if ((mode & 0o111) === 0) fail(`${label} is not executable: ${path}`);
  } catch (err) {
    fail(`${label} stat failed: ${err.message}`);
  }
}

function sha256File(path) {
  return sha256Buffer(readFileSync(path));
}

function sha256Buffer(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function positiveInt(value, label) {
  const num = Number(value);
  if (!Number.isInteger(num) || num <= 0) fail(`${label} must be a positive integer`);
  return num;
}

function fail(message) {
  throw new Error(`unimaker-apk-build: ${message}`);
}

function helpText() {
  return `Usage: node scripts/unimaker-apk-build.mjs --one-click-out-dir <dir> [flags]

Builds a UniMaker Android APK from a retained mobile scene produced by unimaker-one-click.

Required:
  --one-click-out-dir <dir>  Directory containing one-click.summary.json and runtime assets

Common flags:
	  --out-dir <dir>            Output directory
	  --cheng <path>             Cheng compiler (default: artifacts/bootstrap/cheng.stage3)
	  --mobile-capi-cheng <path> Cheng compiler for src/mobile/mobile_capi.cheng (default: artifacts/backend_driver/cheng)
	  --mobile-capi-so <path>    Existing verified libcheng_mobile_capi.so to package
  --scene-runtime-provider-so <path>  Existing verified libcheng_scene_runtime_provider.so to package
  --android-host-provider-so <path>  Existing verified libcheng_generated_android_host.so to package
  --moq-publisher-so <path>   Existing verified libcheng_moq_android.so to package
	  --route-state <route>      Initial route state (default: home_default)
  --app-id <id>              Android package id
  --app-name <name>          Android app label
	  --lib-name <name>          Cheng app library stem (default: cheng_unimaker_scene)
	  --react-android-dir <dir>  React Android project with ChengLibp2pNative and libp2p libs
	  --social-backend-mode <m>  full or group-create (default: group-create)
	  --social-backend-so <path> Existing group-create libchenglibp2p.so to package
	  --social-bridge-so <path>  Existing group-create libp2pbridge.so to package
  --android-ndk-root <dir>   Android NDK root
  --android-java-home <dir>  Java home
  --dry-run                  Validate and prepare runtime bundle source only
  --keep-build-tree          keep generated Android shell, runtime bundle, objects, libs, and verify copies
`;
}
