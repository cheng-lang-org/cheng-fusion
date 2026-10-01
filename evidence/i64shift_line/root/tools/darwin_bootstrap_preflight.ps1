param(
    [string]$OutReport = ".tmp-exec\gate\darwin_probe_preflight.report.txt",
    [string]$ProbeReport = ".tmp-exec\darwin_arm64_probe\self_preflight_default.report.txt",
    [string]$ValidationManifest = ".tmp-exec\darwin_arm64_probe\self_preflight_default.internal-link-probe.darwin-validation.txt",
    [string]$ValidationScript = ".tmp-exec\darwin_arm64_probe\self_preflight_default.internal-link-probe.darwin-validate.sh",
    [string]$ValidationResult = $env:CHENG_DARWIN_VALIDATION_RESULT,
    [string]$ProviderLinkerSource = "src\core\backend\macho_provider_linker.cheng",
    [string]$ValidationBundleZip = ".tmp-exec\darwin_validation_handoff.zip"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Exists-File($Path) {
    if ($Path -eq $null -or $Path -eq "") {
        return 0
    }
    return [int](Test-Path -LiteralPath $Path -PathType Leaf)
}

function Read-KeyValueReport($Path) {
    $map = @{}
    if ($Path -eq $null -or $Path -eq "") {
        return $map
    }
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        return $map
    }
    foreach ($line in Get-Content -LiteralPath $Path) {
        $trimmed = $line.Trim()
        if ($trimmed -eq "" -or $trimmed.StartsWith("#")) {
            continue
        }
        $equals = $trimmed.IndexOf("=")
        if ($equals -lt 1) {
            continue
        }
        $map[$trimmed.Substring(0, $equals)] = $trimmed.Substring($equals + 1)
    }
    return $map
}

function Report-Value($Map, $Key, $Default) {
    if ($Map.ContainsKey($Key)) {
        return [string]$Map[$Key]
    }
    return $Default
}

function Contains-Text($Path, $Needle) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        return 0
    }
    $text = Get-Content -LiteralPath $Path -Raw
    return [int]($text.Contains($Needle))
}

$pureRunner = "artifacts/bootstrap/system_link_exec_pure"
$stage3 = "artifacts/bootstrap/cheng.stage3"
$backendDriver = "artifacts/backend_driver/cheng"
$probe = Read-KeyValueReport $ProbeReport
$manifest = Read-KeyValueReport $ValidationManifest
$validation = Read-KeyValueReport $ValidationResult

$sourceExists = Exists-File $ProviderLinkerSource
$sourceExternalCodesign = Contains-Text $ProviderLinkerSource "/usr/bin/codesign"
$sourceEmbeddedCodeSignature = [int](
    (Contains-Text $ProviderLinkerSource "LC_CODE_SIGNATURE") -or
    (Contains-Text $ProviderLinkerSource "CodeDirectory") -or
    (Contains-Text $ProviderLinkerSource "embedded_adhoc_sha256_code_directory")
)

$probeInternalLinkSuccess = Report-Value $probe "darwin_internal_link_probe_success" "0"
$probeStaticAuditSuccess = Report-Value $probe "darwin_internal_link_audit_static_success" "0"
$probeCodeSignature = Report-Value $probe "darwin_internal_link_audit_code_signature" "0"
$probeCodeSignatureReason = Report-Value $probe "darwin_internal_link_audit_code_signature_reason" ""
$probeRuntimeValidated = Report-Value $probe "darwin_internal_link_promote_unverified_runtime_validated" "0"
$manifestRuntimeValidated = Report-Value $manifest "runtime_execution_validated" "0"
$manifestDarwinCommand = Report-Value $manifest "darwin_validation_darwin_command" ""
$manifestPortableDarwinCommand = Report-Value $manifest "darwin_validation_portable_darwin_command" ""
$manifestWindowsImportEnv = Report-Value $manifest "darwin_validation_windows_import_env" ""
$validationResultExists = Exists-File $ValidationResult
$validationResultVersionMatch = [int]((Report-Value $validation "validation_result_version" "") -eq "1")
$validationResultTargetMatch = [int]((Report-Value $validation "target" "") -eq "arm64-apple-darwin")
$manifestArtifactSize = Report-Value $manifest "artifact_size" ""
$manifestArtifactSha256 = Report-Value $manifest "artifact_sha256" ""
$manifestTarget = Report-Value $manifest "target" ""
$manifestStaticAuditSuccess = Report-Value $manifest "static_audit_success" "0"
$manifestCodeSignature = Report-Value $manifest "code_signature" "0"
$manifestStaticReady = [int](
    ($manifestTarget -eq "arm64-apple-darwin") -and
    ($manifestStaticAuditSuccess -eq "1") -and
    ($manifestCodeSignature -eq "1") -and
    ($manifestArtifactSize -ne "") -and
    ($manifestArtifactSha256 -ne "")
)
$effectiveStaticReady = [int](
    (($probeInternalLinkSuccess -eq "1") -and ($probeStaticAuditSuccess -eq "1")) -or
    ($manifestStaticReady -eq 1)
)
$effectiveCodeSignature = [int](($probeCodeSignature -eq "1") -or ($manifestCodeSignature -eq "1"))
$validationResultArtifactSizeMatch = [int](
    ($validationResultExists -eq 1) -and
    ($manifestArtifactSize -ne "") -and
    ((Report-Value $validation "artifact_size" "") -eq $manifestArtifactSize) -and
    ((Report-Value $validation "artifact_size_match" "0") -eq "1")
)
$validationResultArtifactSha256Match = [int](
    ($validationResultExists -eq 1) -and
    ($manifestArtifactSha256 -ne "") -and
    ((Report-Value $validation "artifact_sha256" "") -eq $manifestArtifactSha256) -and
    ((Report-Value $validation "artifact_sha256_match" "0") -eq "1")
)
$validationResultStaticChecks = [int](
    ((Report-Value $validation "artifact_exists" "0") -eq "1") -and
    ((Report-Value $validation "chmod_755" "0") -eq "1") -and
    ((Report-Value $validation "lc_main" "0") -eq "1") -and
    ((Report-Value $validation "lc_code_signature" "0") -eq "1") -and
    ((Report-Value $validation "libsystem" "0") -eq "1")
)
$validationResultCodesignVerify = [int]((Report-Value $validation "codesign_verify" "0") -eq "1")
$validationResultRuntimeValidated = [int]((Report-Value $validation "runtime_execution_validated" "0") -eq "1")
$validationResultSuccess = [int]((Report-Value $validation "validation_result_success" "0") -eq "1")
$validationResultComplete = [int](
    ($validationResultExists -eq 1) -and
    ($validationResultVersionMatch -eq 1) -and
    ($validationResultTargetMatch -eq 1) -and
    ($validationResultArtifactSizeMatch -eq 1) -and
    ($validationResultArtifactSha256Match -eq 1) -and
    ($validationResultStaticChecks -eq 1) -and
    ($validationResultCodesignVerify -eq 1) -and
    ($validationResultRuntimeValidated -eq 1) -and
    ($validationResultSuccess -eq 1)
)
$runtimeValidated = [int](($probeRuntimeValidated -eq "1") -or ($manifestRuntimeValidated -eq "1") -or ($validationResultComplete -eq 1))
$signedProbeNotInSource = [int](($effectiveCodeSignature -eq 1) -and ($sourceEmbeddedCodeSignature -eq 0))
$validationBundleOutDir = ".tmp-exec\darwin_arm64_probe\darwin-validation-bundle"
$validationBundleCommand = "powershell -ExecutionPolicy Bypass -File tools\export_darwin_validation_bundle.ps1 -Manifest `"$ValidationManifest`" -OutDir `"$validationBundleOutDir`" -ZipPath `"$ValidationBundleZip`""
$validationRemoteCommandTemplate = "powershell -ExecutionPolicy Bypass -File tools\export_darwin_validation_bundle.ps1 -Manifest `"$ValidationManifest`" -OutDir `"$validationBundleOutDir`" -RemoteHost `"<user@darwin-arm64-host>`" -RunRemote"
if ($ValidationResult -ne "") {
    $validationImportEnv = "CHENG_DARWIN_VALIDATION_RESULT=$ValidationResult"
} elseif ($manifestWindowsImportEnv -ne "") {
    $validationImportEnv = $manifestWindowsImportEnv
} else {
    $validationImportEnv = "CHENG_DARWIN_VALIDATION_RESULT=<path-to-darwin-result.txt>"
}
$validationImportCommand = "powershell -ExecutionPolicy Bypass -File tools\darwin_bootstrap_preflight.ps1 -ValidationResult `"<path-to-darwin-result.txt>`""

$outDir = Split-Path -Parent $OutReport
if ($outDir -ne "" -and -not (Test-Path -LiteralPath $outDir -PathType Container)) {
    New-Item -ItemType Directory -Force -Path $outDir | Out-Null
}

$lines = @(
    "darwin_probe_preflight=1",
    "target=arm64-apple-darwin",
    "host_os=$([System.Environment]::OSVersion.Platform)",
    "host_runtime_can_execute_darwin_arm64=0",
    "pure_runner=$pureRunner",
    "pure_runner_exists=$(Exists-File $pureRunner)",
    "stage3=$stage3",
    "stage3_exists=$(Exists-File $stage3)",
    "backend_driver=$backendDriver",
    "backend_driver_exists=$(Exists-File $backendDriver)",
    "provider_linker_source=$ProviderLinkerSource",
    "provider_linker_source_exists=$sourceExists",
    "provider_linker_external_codesign_dependency=$sourceExternalCodesign",
    "provider_linker_embedded_code_signature_support=$sourceEmbeddedCodeSignature",
    "latest_probe_report=$ProbeReport",
    "latest_probe_report_exists=$(Exists-File $ProbeReport)",
    "latest_probe_internal_link_success=$probeInternalLinkSuccess",
    "latest_probe_static_audit_success=$probeStaticAuditSuccess",
    "latest_probe_code_signature=$probeCodeSignature",
    "latest_probe_code_signature_reason=$probeCodeSignatureReason",
    "validation_manifest=$ValidationManifest",
    "validation_manifest_exists=$(Exists-File $ValidationManifest)",
    "validation_manifest_target=$manifestTarget",
    "validation_manifest_target_match=$([int]($manifestTarget -eq "arm64-apple-darwin"))",
    "validation_manifest_static_audit_success=$manifestStaticAuditSuccess",
    "validation_manifest_code_signature=$manifestCodeSignature",
    "validation_manifest_static_ready=$manifestStaticReady",
    "validation_manifest_artifact_size=$manifestArtifactSize",
    "validation_manifest_artifact_sha256=$manifestArtifactSha256",
    "validation_manifest_runtime_execution_validated=$manifestRuntimeValidated",
    "validation_manifest_darwin_command=$manifestDarwinCommand",
    "validation_manifest_portable_darwin_command=$manifestPortableDarwinCommand",
    "validation_manifest_windows_import_env=$manifestWindowsImportEnv",
    "validation_script=$ValidationScript",
    "validation_script_exists=$(Exists-File $ValidationScript)",
    "validation_bundle_zip=$ValidationBundleZip",
    "validation_bundle_command=$validationBundleCommand",
    "validation_remote_hook_env=CHENG_DARWIN_REMOTE_HOST",
    "validation_remote_command_template=$validationRemoteCommandTemplate",
    "validation_result_import_env=$validationImportEnv",
    "validation_result_import_command=$validationImportCommand",
    "validation_result_input=$ValidationResult",
    "validation_result_exists=$validationResultExists",
    "validation_result_version_match=$validationResultVersionMatch",
    "validation_result_target_match=$validationResultTargetMatch",
    "validation_result_artifact_size_match=$validationResultArtifactSizeMatch",
    "validation_result_artifact_sha256_match=$validationResultArtifactSha256Match",
    "validation_result_static_checks=$validationResultStaticChecks",
    "validation_result_codesign_verify=$validationResultCodesignVerify",
    "validation_result_runtime_validated=$validationResultRuntimeValidated",
    "validation_result_success=$validationResultSuccess",
    "validation_result_complete=$validationResultComplete",
    "validation_static_ready=$effectiveStaticReady",
    "signed_probe_not_reproducible_from_main_source=$signedProbeNotInSource",
    "ordinary_emit_exe_runtime_success_claimed=0",
    "self_input_emit_obj_success_claimed=0",
    "darwin_runtime_success_claimed=$runtimeValidated",
    "production_emit_exe_success_claimed=0"
)

if ($runtimeValidated -eq 1) {
    $lines += @(
        "validation_status=runtime_import_available",
        "gate_blocked=0",
        "gate_blocker_id=",
        "gate_blocker_phase=",
        "next_blocker="
    )
} elseif ($signedProbeNotInSource -eq 1) {
    $lines += @(
        "validation_status=blocked",
        "gate_blocked=1",
        "gate_blocker_id=embedded_signature_not_merged_to_main_source",
        "gate_blocker_phase=darwin_provider_linker",
        "next_blocker=merge_embedded_adhoc_signature_source_then_run_arm64_darwin_validation"
    )
} elseif ($effectiveStaticReady -eq 1) {
    $lines += @(
        "validation_status=blocked",
        "gate_blocked=1",
        "gate_blocker_id=darwin_runtime_validation_missing",
        "gate_blocker_phase=darwin_runtime_execute",
        "next_blocker=run_validation_script_on_arm64_darwin_and_import_result"
    )
} else {
    $lines += @(
        "validation_status=blocked",
        "gate_blocked=1",
        "gate_blocker_id=darwin_probe_artifacts_unavailable_on_windows_worker",
        "gate_blocker_phase=darwin_probe_preflight",
        "next_blocker=produce_linkerless_probe_or_provide_darwin_runner"
    )
}

$lines | Set-Content -LiteralPath $OutReport -Encoding ASCII
$lines | ForEach-Object { Write-Output $_ }
