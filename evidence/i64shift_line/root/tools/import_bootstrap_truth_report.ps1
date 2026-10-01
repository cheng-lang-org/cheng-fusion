param(
    [string]$InputReport = ".tmp-exec\gate\windows_bootstrap_truth_gate.report.txt",
    [string]$OutReport = ".tmp-exec\gate\bootstrap_truth_import.report.txt",
    [switch]$RequireRuntimeSuccess,
    [string]$DarwinValidationManifest = "",
    [string]$DarwinValidationResult = $env:CHENG_DARWIN_VALIDATION_RESULT,
    [string]$LinuxValidationManifest = "",
    [string]$LinuxRuntimeResult = $env:CHENG_LINUX_X86_64_BOOTSTRAP_IMPORTED_RESULT
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Fail($Message) {
    Write-Error $Message
    exit 1
}

function Normalize-LocalPath($Path) {
    if ($Path -eq "") {
        return ""
    }
    if ($Path -match '^/([a-zA-Z])/(.*)$') {
        $drive = $Matches[1].ToUpperInvariant()
        $rest = $Matches[2].Replace('/', '\')
        return "$drive`:\$rest"
    }
    return $Path
}

function Read-KeyValueReport($Path) {
    $localPath = Normalize-LocalPath $Path
    if (-not (Test-Path -LiteralPath $localPath -PathType Leaf)) {
        Fail "missing input report: $Path"
    }

    $map = @{}
    foreach ($line in Get-Content -LiteralPath $localPath) {
        $trimmed = $line.Trim()
        if ($trimmed -eq "" -or $trimmed.StartsWith("#")) {
            continue
        }
        $equals = $trimmed.IndexOf("=")
        if ($equals -lt 1) {
            continue
        }
        $key = $trimmed.Substring(0, $equals)
        $value = $trimmed.Substring($equals + 1)
        $map[$key] = $value
    }
    return $map
}

function Try-ReadKeyValueReport($Path) {
    $localPath = Normalize-LocalPath $Path
    $map = @{}
    if ($localPath -eq "" -or -not (Test-Path -LiteralPath $localPath -PathType Leaf)) {
        return $map
    }
    foreach ($line in Get-Content -LiteralPath $localPath) {
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

function Is-Zero($Value) {
    return ([string]$Value) -eq "0"
}

function Is-One($Value) {
    return ([string]$Value) -eq "1"
}

function Path-Exists-NonEmpty($Path) {
    $localPath = Normalize-LocalPath $Path
    if ($localPath -eq "") {
        return $false
    }
    if (-not (Test-Path -LiteralPath $localPath -PathType Leaf)) {
        return $false
    }
    return ((Get-Item -LiteralPath $localPath).Length -gt 0)
}

function Resolve-ExistingPathText($Path) {
    $localPath = Normalize-LocalPath $Path
    if ($localPath -eq "" -or -not (Test-Path -LiteralPath $localPath -PathType Leaf)) {
        return $localPath
    }
    return (Resolve-Path -LiteralPath $localPath).Path
}

$inputLocalPath = Normalize-LocalPath $InputReport
$inputFullPath = (Resolve-Path -LiteralPath $inputLocalPath).Path
$report = Read-KeyValueReport $inputFullPath

$runnerBuildRc = Report-Value $report "runner_build_rc" ""
$runtimeExecuteRc = Report-Value $report "runtime_execute_rc" ""
$objectWritten = Report-Value $report "object_written" "0"
$exeWritten = Report-Value $report "exe_written" "0"
$emittedExeRc = Report-Value $report "emitted_exe_rc" ""
$target = Report-Value $report "target" ""
$input = Report-Value $report "input" ""
$progressOut = Report-Value $report "progress_out" ""
$pureRunner = Report-Value $report "pure_runner" ""
$runtimeReport = Report-Value $report "runtime_report" ""

$runnerBuildOk = Is-Zero $runnerBuildRc
$runtimeExecuteOk = Is-Zero $runtimeExecuteRc
$objectOk = Is-One $objectWritten
$exeOk = Is-One $exeWritten
$emittedExeOk = Is-Zero $emittedExeRc
$runtimeReportExists = Path-Exists-NonEmpty $runtimeReport
$pureRunnerExists = Path-Exists-NonEmpty $pureRunner
$progressOutExists = Path-Exists-NonEmpty $progressOut

$runtimeSuccessImported = (
    $runnerBuildOk -and
    $runtimeExecuteOk -and
    $objectOk -and
    $exeOk -and
    $emittedExeOk
)

if ($DarwinValidationManifest -eq "") {
    $DarwinValidationManifest = Report-Value $report "darwin_internal_link_validation_manifest_path" ""
}
if ($DarwinValidationResult -eq "") {
    $DarwinValidationResult = Report-Value $report "darwin_validation_result" ""
}

$darwinManifestExists = Path-Exists-NonEmpty $DarwinValidationManifest
$darwinResultExists = Path-Exists-NonEmpty $DarwinValidationResult
$darwinManifest = Try-ReadKeyValueReport $DarwinValidationManifest
$darwinResult = Try-ReadKeyValueReport $DarwinValidationResult

$manifestTargetOk = (Report-Value $darwinManifest "target" "") -eq "arm64-apple-darwin"
$manifestStaticAuditOk = Is-One (Report-Value $darwinManifest "static_audit_success" "0")
$manifestCodeSignatureOk = Is-One (Report-Value $darwinManifest "code_signature" "0")
$manifestSize = Report-Value $darwinManifest "artifact_size" ""
$manifestSha = Report-Value $darwinManifest "artifact_sha256" ""
$resultVersionOk = (Report-Value $darwinResult "validation_result_version" "") -eq "1"
$resultTargetOk = (Report-Value $darwinResult "target" "") -eq "arm64-apple-darwin"
$resultArtifactExists = Is-One (Report-Value $darwinResult "artifact_exists" "0")
$resultChmodOk = Is-One (Report-Value $darwinResult "chmod_755" "0")
$resultSize = Report-Value $darwinResult "artifact_size" ""
$resultSizeMatch = Is-One (Report-Value $darwinResult "artifact_size_match" "0")
if ($manifestSize -ne "" -and $resultSize -ne "") {
    $resultSizeMatch = $resultSizeMatch -and ($manifestSize -eq $resultSize)
}
$resultSha = Report-Value $darwinResult "artifact_sha256" ""
$resultShaMatch = Is-One (Report-Value $darwinResult "artifact_sha256_match" "0")
if ($manifestSha -ne "" -and $resultSha -ne "") {
    $resultShaMatch = $resultShaMatch -and ($manifestSha -eq $resultSha)
}
$darwinCodesignOk = Is-One (Report-Value $darwinResult "codesign_verify" "0")
$darwinLcMainOk = Is-One (Report-Value $darwinResult "lc_main" "0")
$darwinLcCodeSignatureOk = Is-One (Report-Value $darwinResult "lc_code_signature" "0")
$darwinLibsystemOk = Is-One (Report-Value $darwinResult "libsystem" "0")
$darwinRuntimeExecuted = Is-One (Report-Value $darwinResult "runtime_execution_validated" "0")
$darwinResultSuccess = Is-One (Report-Value $darwinResult "validation_result_success" "0")
$darwinRuntimeImported = (
    $darwinManifestExists -and
    $darwinResultExists -and
    $resultVersionOk -and
    $resultTargetOk -and
    $manifestTargetOk -and
    $manifestStaticAuditOk -and
    $manifestCodeSignatureOk -and
    $resultArtifactExists -and
    $resultChmodOk -and
    $resultSizeMatch -and
    $resultShaMatch -and
    $darwinCodesignOk -and
    $darwinLcMainOk -and
    $darwinLcCodeSignatureOk -and
    $darwinLibsystemOk -and
    $darwinRuntimeExecuted -and
    $darwinResultSuccess
)

if ($LinuxValidationManifest -eq "") {
    $LinuxValidationManifest = Report-Value $report "validation_manifest" ""
}
if ($LinuxRuntimeResult -eq "") {
    $LinuxRuntimeResult = Report-Value $report "imported_result" ""
}
if ($LinuxRuntimeResult -eq "") {
    $LinuxRuntimeResult = Report-Value $report "runtime_result" ""
}

$linuxManifestExists = Path-Exists-NonEmpty $LinuxValidationManifest
$linuxResultExists = Path-Exists-NonEmpty $LinuxRuntimeResult
$linuxManifest = Try-ReadKeyValueReport $LinuxValidationManifest
$linuxResult = Try-ReadKeyValueReport $LinuxRuntimeResult
$linuxGate = (
    (Report-Value $report "linux_x86_64_bootstrap_truth_gate" "0") -eq "1" -or
    $target -eq "x86_64-unknown-linux-gnu"
)
$linuxRunnerKind = Report-Value $report "runner_kind" ""
$linuxRunnerAvailable = [int](
    $linuxRunnerKind -ne "" -and
    $linuxRunnerKind -ne "__missing_linux_x86_64_runner__"
)
$linuxBuildColdOk = Is-Zero (Report-Value $report "build_cold_rc" "1")
$linuxObjectBuildOk = [int](
    (Is-Zero (Report-Value $report "object_build_rc" "1")) -and
    (Is-One (Report-Value $report "object_written" "0"))
)
$linuxRunnerBuildOk = [int](
    (Is-Zero (Report-Value $report "runner_build_rc" "1")) -and
    (Is-One (Report-Value $report "runner_written" "0"))
)
$linuxStaticAuditOk = [int](
    (Is-Zero (Report-Value $report "static_audit_rc" "1")) -and
    (Is-One (Report-Value $report "static_audit_valid" "0"))
)
$linuxDirectRuntimeOk = [int](
    $linuxGate -and
    (Report-Value $report "runtime_execute_skipped" "1") -eq "0" -and
    (Is-Zero (Report-Value $report "runtime_execute_rc" "1")) -and
    (Is-One (Report-Value $report "generated_object_written" "0")) -and
    (Is-One (Report-Value $report "generated_exe_written" "0")) -and
    (Is-Zero (Report-Value $report "generated_exe_rc" "1"))
)
$linuxReportRuntimeImportOk = [int](
    (Is-One (Report-Value $report "runtime_result_imported" "0")) -and
    (Is-One (Report-Value $report "runtime_import_valid" "0"))
)
$linuxRunnerCksum = Report-Value $report "pure_runner_cksum" ""
if ($linuxRunnerCksum -eq "") {
    $linuxRunnerCksum = Report-Value $linuxManifest "pure_runner_cksum" ""
}
$linuxManifestMode = Report-Value $linuxManifest "validation_mode" ""
$linuxResultCksum = Report-Value $linuxResult "pure_runner_cksum" ""
$linuxExternalRuntimeImportOk = [int](
    $linuxResultExists -and
    (Report-Value $linuxResult "linux_x86_64_runtime_result" "0") -eq "1" -and
    (Report-Value $linuxResult "target" "") -eq "x86_64-unknown-linux-gnu" -and
    (Report-Value $linuxResult "host_uname_s" "") -eq "Linux" -and
    (Report-Value $linuxResult "host_uname_m" "") -eq "x86_64" -and
    $linuxRunnerCksum -ne "" -and
    $linuxResultCksum -eq $linuxRunnerCksum -and
    (Report-Value $linuxResult "runtime_execute_skipped" "1") -eq "0" -and
    (Is-Zero (Report-Value $linuxResult "runtime_execute_rc" "1")) -and
    (Is-One (Report-Value $linuxResult "generated_object_written" "0")) -and
    (Is-One (Report-Value $linuxResult "generated_exe_written" "0")) -and
    (Is-Zero (Report-Value $linuxResult "generated_exe_rc" "1"))
)
$linuxRuntimeImported = [int](
    $linuxDirectRuntimeOk -or
    $linuxReportRuntimeImportOk -or
    $linuxExternalRuntimeImportOk
)

$overallRuntimeSuccess = $runtimeSuccessImported -or $darwinRuntimeImported -or ($linuxRuntimeImported -eq 1)

$blockerId = ""
$blockerPhase = ""
if ($overallRuntimeSuccess) {
    $blockerId = ""
    $blockerPhase = ""
} elseif ($target -eq "arm64-apple-darwin" -and $darwinManifestExists -and -not $darwinResultExists) {
    $blockerId = "darwin_runtime_result_missing"
    $blockerPhase = "darwin_runtime_import"
} elseif ($target -eq "arm64-apple-darwin" -and $darwinResultExists -and -not $darwinRuntimeImported) {
    $blockerId = "darwin_runtime_result_incomplete_or_stale"
    $blockerPhase = "darwin_runtime_import"
} elseif ($linuxGate -and -not $linuxBuildColdOk) {
    $blockerId = "linux_x86_64_cold_build_failed"
    $blockerPhase = "cold_build"
} elseif ($linuxGate -and $linuxObjectBuildOk -ne 1) {
    $blockerId = "linux_x86_64_pure_object_build_failed"
    $blockerPhase = "object_emit"
} elseif ($linuxGate -and $linuxRunnerBuildOk -ne 1) {
    $blockerId = "linux_x86_64_pure_runner_build_failed"
    $blockerPhase = "runner_build"
} elseif ($linuxGate -and $linuxStaticAuditOk -ne 1) {
    $blockerId = "linux_x86_64_static_audit_failed"
    $blockerPhase = "static_audit"
} elseif ($linuxGate -and $linuxRunnerAvailable -ne 1 -and $linuxRuntimeImported -ne 1) {
    $blockerId = "linux_x86_64_runner_unavailable"
    $blockerPhase = "runtime_execute"
} elseif ($linuxGate -and $linuxResultExists -and $linuxRuntimeImported -ne 1) {
    $blockerId = "linux_x86_64_runtime_result_incomplete_or_stale"
    $blockerPhase = "runtime_import"
} elseif ($linuxGate -and $linuxRuntimeImported -ne 1) {
    $blockerId = "linux_x86_64_runtime_validation_missing"
    $blockerPhase = "runtime_execute"
} elseif (-not $runnerBuildOk) {
    $blockerId = "imported_runner_build_failed"
    $blockerPhase = "runner_build"
} elseif (-not $runtimeExecuteOk) {
    $blockerId = "imported_runtime_execute_failed"
    $blockerPhase = "runtime_execute"
} elseif (-not $objectOk) {
    $blockerId = "imported_object_missing"
    $blockerPhase = "object_emit"
} elseif (-not $exeOk) {
    $blockerId = "imported_exe_missing"
    $blockerPhase = "exe_emit"
} elseif (-not $emittedExeOk) {
    $blockerId = "imported_emitted_exe_failed"
    $blockerPhase = "emitted_exe_run"
}

$outDir = Split-Path -Parent $OutReport
if ($outDir -ne "" -and -not (Test-Path -LiteralPath $outDir -PathType Container)) {
    New-Item -ItemType Directory -Force -Path $outDir | Out-Null
}

$lines = New-Object System.Collections.Generic.List[string]
$lines.Add("bootstrap_truth_import=1")
$lines.Add("input_report=$inputFullPath")
$lines.Add("target=$target")
$lines.Add("input=$input")
$lines.Add("runner_build_rc=$runnerBuildRc")
$lines.Add("runtime_execute_rc=$runtimeExecuteRc")
$lines.Add("object_written=$objectWritten")
$lines.Add("exe_written=$exeWritten")
$lines.Add("emitted_exe_rc=$emittedExeRc")
$lines.Add("pure_runner=$pureRunner")
$lines.Add("pure_runner_exists=$([int]$pureRunnerExists)")
$lines.Add("runtime_report=$runtimeReport")
$lines.Add("runtime_report_exists=$([int]$runtimeReportExists)")
$lines.Add("progress_out=$progressOut")
$lines.Add("progress_out_exists=$([int]$progressOutExists)")
$lines.Add("runner_build_ok=$([int]$runnerBuildOk)")
$lines.Add("runtime_execute_ok=$([int]$runtimeExecuteOk)")
$lines.Add("object_written_ok=$([int]$objectOk)")
$lines.Add("exe_written_ok=$([int]$exeOk)")
$lines.Add("emitted_exe_ok=$([int]$emittedExeOk)")
$lines.Add("runtime_success_imported=$([int]$runtimeSuccessImported)")
$lines.Add("darwin_validation_manifest=$(Resolve-ExistingPathText $DarwinValidationManifest)")
$lines.Add("darwin_validation_manifest_exists=$([int]$darwinManifestExists)")
$lines.Add("darwin_validation_result=$(Resolve-ExistingPathText $DarwinValidationResult)")
$lines.Add("darwin_validation_result_exists=$([int]$darwinResultExists)")
$lines.Add("darwin_manifest_target_ok=$([int]$manifestTargetOk)")
$lines.Add("darwin_manifest_static_audit_ok=$([int]$manifestStaticAuditOk)")
$lines.Add("darwin_manifest_code_signature_ok=$([int]$manifestCodeSignatureOk)")
$lines.Add("darwin_result_version_ok=$([int]$resultVersionOk)")
$lines.Add("darwin_result_target_ok=$([int]$resultTargetOk)")
$lines.Add("darwin_result_artifact_exists=$([int]$resultArtifactExists)")
$lines.Add("darwin_result_chmod_755_ok=$([int]$resultChmodOk)")
$lines.Add("darwin_artifact_size=$manifestSize")
$lines.Add("darwin_result_artifact_size=$resultSize")
$lines.Add("darwin_result_artifact_size_match=$([int]$resultSizeMatch)")
$lines.Add("darwin_artifact_sha256=$manifestSha")
$lines.Add("darwin_result_sha256=$resultSha")
$lines.Add("darwin_result_sha256_match=$([int]$resultShaMatch)")
$lines.Add("darwin_codesign_verify_ok=$([int]$darwinCodesignOk)")
$lines.Add("darwin_lc_main_ok=$([int]$darwinLcMainOk)")
$lines.Add("darwin_lc_code_signature_ok=$([int]$darwinLcCodeSignatureOk)")
$lines.Add("darwin_libsystem_ok=$([int]$darwinLibsystemOk)")
$lines.Add("darwin_runtime_execution_validated=$([int]$darwinRuntimeExecuted)")
$lines.Add("darwin_validation_result_success=$([int]$darwinResultSuccess)")
$lines.Add("darwin_runtime_success_imported=$([int]$darwinRuntimeImported)")
$lines.Add("linux_x86_64_gate_detected=$([int]$linuxGate)")
$lines.Add("linux_x86_64_runner_kind=$linuxRunnerKind")
$lines.Add("linux_x86_64_runner_available=$linuxRunnerAvailable")
$lines.Add("linux_x86_64_build_cold_ok=$([int]$linuxBuildColdOk)")
$lines.Add("linux_x86_64_object_build_ok=$linuxObjectBuildOk")
$lines.Add("linux_x86_64_runner_build_ok=$linuxRunnerBuildOk")
$lines.Add("linux_x86_64_static_audit_ok=$linuxStaticAuditOk")
$lines.Add("linux_x86_64_validation_manifest=$(Resolve-ExistingPathText $LinuxValidationManifest)")
$lines.Add("linux_x86_64_validation_manifest_exists=$([int]$linuxManifestExists)")
$lines.Add("linux_x86_64_validation_manifest_mode=$linuxManifestMode")
$lines.Add("linux_x86_64_runtime_result=$(Resolve-ExistingPathText $LinuxRuntimeResult)")
$lines.Add("linux_x86_64_runtime_result_exists=$([int]$linuxResultExists)")
$lines.Add("linux_x86_64_direct_runtime_ok=$linuxDirectRuntimeOk")
$lines.Add("linux_x86_64_report_runtime_import_ok=$linuxReportRuntimeImportOk")
$lines.Add("linux_x86_64_external_runtime_import_ok=$linuxExternalRuntimeImportOk")
$lines.Add("linux_x86_64_runtime_success_claimed=$linuxRuntimeImported")
$lines.Add("runtime_success_claimed=$([int]$runtimeSuccessImported)")
$lines.Add("darwin_runtime_success_claimed=$([int]$darwinRuntimeImported)")
$lines.Add("production_emit_exe_success_claimed=$([int]$overallRuntimeSuccess)")

if ($overallRuntimeSuccess) {
    $lines.Add("validation_status=passed")
    $lines.Add("gate_blocked=0")
    $lines.Add("next_blocker=")
} else {
    $lines.Add("validation_status=blocked")
    $lines.Add("gate_blocked=1")
    $lines.Add("gate_blocker_id=$blockerId")
    $lines.Add("gate_blocker_phase=$blockerPhase")
    $lines.Add("next_blocker=$blockerId")
}

$lines | Set-Content -LiteralPath $OutReport -Encoding ASCII
$lines | ForEach-Object { Write-Output $_ }

if ($RequireRuntimeSuccess -and -not $overallRuntimeSuccess) {
    exit 1
}

exit 0
