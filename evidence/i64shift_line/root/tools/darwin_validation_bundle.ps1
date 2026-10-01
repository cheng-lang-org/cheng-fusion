param(
    [string]$ValidationManifest = ".tmp-exec\darwin_arm64_probe\self_preflight_default.internal-link-probe.darwin-validation.txt",
    [string]$ValidationScript = ".tmp-exec\darwin_arm64_probe\self_preflight_default.internal-link-probe.darwin-validate.sh",
    [string]$ArtifactPath = "",
    [string]$OutDir = ".tmp-exec\darwin_validation_handoff",
    [string]$ZipPath = ".tmp-exec\darwin_validation_handoff.zip",
    [string]$ResultFileName = "darwin-validation-result.txt",
    [string]$RemoteHost = $env:CHENG_DARWIN_REMOTE_HOST,
    [string]$RemoteDir = $env:CHENG_DARWIN_REMOTE_DIR,
    [switch]$RunRemote
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Fail($Message) {
    Write-Error $Message
    exit 1
}

function Read-KeyValueReport($Path) {
    $map = @{}
    if ($Path -eq $null -or $Path -eq "" -or -not (Test-Path -LiteralPath $Path -PathType Leaf)) {
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

function Normalize-LocalPath($Path) {
    if ($Path -eq $null -or $Path -eq "") {
        return ""
    }
    if ($Path -match '^/([a-zA-Z])/(.*)$') {
        $drive = $Matches[1].ToUpperInvariant()
        $rest = $Matches[2].Replace('/', '\')
        return "$drive`:\$rest"
    }
    return $Path
}

function Report-Value($Map, $Key, $Default) {
    if ($Map.ContainsKey($Key)) {
        return [string]$Map[$Key]
    }
    return $Default
}

function Resolve-OptionalArtifact($Manifest, $ExplicitPath) {
    if ($ExplicitPath -ne "") {
        return $ExplicitPath
    }
    foreach ($key in @("artifact", "artifact_path", "output", "output_path", "executable", "linked_artifact")) {
        $value = Report-Value $Manifest $key ""
        if ($value -ne "") {
            return $value
        }
    }
    return ""
}

if (-not (Test-Path -LiteralPath $ValidationManifest -PathType Leaf)) {
    Fail "missing Darwin validation manifest: $ValidationManifest"
}
if (-not (Test-Path -LiteralPath $ValidationScript -PathType Leaf)) {
    Fail "missing Darwin validation script: $ValidationScript"
}

$manifest = Read-KeyValueReport $ValidationManifest
$artifact = Resolve-OptionalArtifact $manifest $ArtifactPath
$artifactLocalPath = Normalize-LocalPath $artifact
$artifactExists = [int]($artifactLocalPath -ne "" -and (Test-Path -LiteralPath $artifactLocalPath -PathType Leaf))

if ($artifactExists -ne 1) {
    Fail "missing Darwin artifact; pass -ArtifactPath or include artifact/artifact_path/output in manifest"
}

if (Test-Path -LiteralPath $OutDir) {
    Remove-Item -LiteralPath $OutDir -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$manifestName = Split-Path -Leaf $ValidationManifest
$scriptName = "darwin-validate.sh"
$runnerName = "run-darwin-validation.sh"
$artifactName = Split-Path -Leaf $artifactLocalPath
$manifestBundlePath = Join-Path $OutDir $manifestName
$scriptBundlePath = Join-Path $OutDir $scriptName
$runnerBundlePath = Join-Path $OutDir $runnerName
$artifactBundlePath = Join-Path $OutDir $artifactName
$resultBundlePath = Join-Path $OutDir $ResultFileName

Copy-Item -LiteralPath $ValidationManifest -Destination $manifestBundlePath -Force
Copy-Item -LiteralPath $ValidationScript -Destination $scriptBundlePath -Force
Copy-Item -LiteralPath $artifactLocalPath -Destination $artifactBundlePath -Force
$expectedTarget = Report-Value $manifest "target" "arm64-apple-darwin"
$expectedArtifactSize = Report-Value $manifest "artifact_size" ""
$expectedArtifactSha256 = Report-Value $manifest "artifact_sha256" ""
$runner = @"
#!/bin/sh
set -u
SCRIPT_DIR=`$(CDPATH= cd -- "`$(dirname -- "`$0")" && pwd)
ARTIFACT=`${CHENG_DARWIN_VALIDATION_ARTIFACT:-"`$SCRIPT_DIR/$artifactName"}
RESULT=`${CHENG_DARWIN_VALIDATION_RESULT:-"`$SCRIPT_DIR/$ResultFileName"}
EXPECTED_SIZE="$expectedArtifactSize"
EXPECTED_SHA256="$expectedArtifactSha256"
TARGET="$expectedTarget"
RUN_SMOKE=0
if [ "`${1:-}" = "--run-smoke" ]; then
    RUN_SMOKE=1
    shift
fi

artifact_exists=0
artifact_size=0
artifact_size_match=0
artifact_sha256=
artifact_sha256_match=0
chmod_755=0
codesign_verify=0
lc_main=0
lc_code_signature=0
libsystem=0
runtime_execution_validated=0
runtime_execute_rc=127

if [ -f "`$ARTIFACT" ]; then
    artifact_exists=1
    artifact_size=`$(wc -c <"`$ARTIFACT" 2>/dev/null | tr -d ' ')
    if [ "`$artifact_size" = "`$EXPECTED_SIZE" ]; then artifact_size_match=1; fi
    artifact_sha256=`$(shasum -a 256 "`$ARTIFACT" 2>/dev/null | awk '{print `$1}')
    if [ "`$artifact_sha256" = "`$EXPECTED_SHA256" ]; then artifact_sha256_match=1; fi
    chmod 755 "`$ARTIFACT" 2>/dev/null && chmod_755=1
    codesign --verify --verbose=4 "`$ARTIFACT" >/tmp/cheng_darwin_codesign_verify.stdout 2>/tmp/cheng_darwin_codesign_verify.stderr && codesign_verify=1
    otool -l "`$ARTIFACT" 2>/dev/null | grep -q LC_MAIN && lc_main=1
    otool -l "`$ARTIFACT" 2>/dev/null | grep -q LC_CODE_SIGNATURE && lc_code_signature=1
    otool -L "`$ARTIFACT" 2>/dev/null | grep -q '/usr/lib/libSystem.B.dylib' && libsystem=1
    if [ "`$RUN_SMOKE" -eq 1 ]; then
        "`$ARTIFACT" "`$@" >/tmp/cheng_darwin_runtime.stdout 2>/tmp/cheng_darwin_runtime.stderr
        runtime_execute_rc=`$?
        if [ "`$runtime_execute_rc" -eq 0 ]; then runtime_execution_validated=1; fi
    fi
fi

validation_result_success=0
if [ "`$artifact_exists" -eq 1 ] &&
   [ "`$artifact_size_match" -eq 1 ] &&
   [ "`$artifact_sha256_match" -eq 1 ] &&
   [ "`$chmod_755" -eq 1 ] &&
   [ "`$codesign_verify" -eq 1 ] &&
   [ "`$lc_main" -eq 1 ] &&
   [ "`$lc_code_signature" -eq 1 ] &&
   [ "`$libsystem" -eq 1 ] &&
   [ "`$runtime_execution_validated" -eq 1 ]; then
    validation_result_success=1
fi

{
    printf 'validation_result_schema=canonical\n'
    printf 'target=%s\n' "`$TARGET"
    printf 'host_uname_s=%s\n' "`$(uname -s 2>/dev/null || true)"
    printf 'host_uname_m=%s\n' "`$(uname -m 2>/dev/null || true)"
    printf 'artifact_path=%s\n' "`$ARTIFACT"
    printf 'artifact_exists=%s\n' "`$artifact_exists"
    printf 'artifact_size=%s\n' "`$artifact_size"
    printf 'artifact_size_match=%s\n' "`$artifact_size_match"
    printf 'artifact_sha256=%s\n' "`$artifact_sha256"
    printf 'artifact_sha256_match=%s\n' "`$artifact_sha256_match"
    printf 'chmod_755=%s\n' "`$chmod_755"
    printf 'codesign_verify=%s\n' "`$codesign_verify"
    printf 'lc_main=%s\n' "`$lc_main"
    printf 'lc_code_signature=%s\n' "`$lc_code_signature"
    printf 'libsystem=%s\n' "`$libsystem"
    printf 'runtime_execute_rc=%s\n' "`$runtime_execute_rc"
    printf 'runtime_execution_validated=%s\n' "`$runtime_execution_validated"
    printf 'validation_result_success=%s\n' "`$validation_result_success"
} >"`$RESULT"

cat "`$RESULT"
if [ "`$validation_result_success" -ne 1 ]; then exit 1; fi
"@
$runner | Set-Content -LiteralPath $runnerBundlePath -Encoding ASCII

$darwinCommand = "CHENG_DARWIN_VALIDATION_RESULT=`"`$PWD/$ResultFileName`" ./$runnerName --run-smoke"
$importCommand = "`$env:CHENG_DARWIN_VALIDATION_RESULT = `"$resultBundlePath`"; powershell -ExecutionPolicy Bypass -File tools\darwin_bootstrap_preflight.ps1"

$readme = @(
    "Cheng Darwin arm64 validation handoff",
    "",
    "Run this bundle on a real arm64 Darwin host. Do not treat the bundle as runtime-validated until the generated result file reports validation_result_success=1 and runtime_execution_validated=1.",
    "",
    "Darwin command:",
    "  cd <unzipped-bundle>",
    "  chmod +x ./$scriptName ./$runnerName ./$artifactName",
    "  $darwinCommand",
    "",
    "Return this file to the Windows checkout:",
    "  $ResultFileName",
    "",
    "Windows import command from the repository root:",
    "  $importCommand",
    "",
    "Expected manifest target:",
    "  target=$expectedTarget",
    "Expected artifact size:",
    "  artifact_size=$expectedArtifactSize",
    "Expected artifact sha256:",
    "  artifact_sha256=$expectedArtifactSha256"
)
$readme | Set-Content -LiteralPath (Join-Path $OutDir "README.txt") -Encoding ASCII
New-Item -ItemType File -Force -Path $resultBundlePath | Out-Null

$zipDir = Split-Path -Parent $ZipPath
if ($zipDir -ne "" -and -not (Test-Path -LiteralPath $zipDir -PathType Container)) {
    New-Item -ItemType Directory -Force -Path $zipDir | Out-Null
}
if (Test-Path -LiteralPath $ZipPath -PathType Leaf) {
    Remove-Item -LiteralPath $ZipPath -Force
}
Compress-Archive -Path (Join-Path $OutDir "*") -DestinationPath $ZipPath -Force

$remoteAvailable = [int]($RemoteHost -ne "")
$remoteTargetDir = $RemoteDir
if ($remoteTargetDir -eq "") {
    $remoteTargetDir = "cheng-darwin-validation"
}
$remoteCommand = ""
if ($remoteAvailable -eq 1) {
    $zipName = Split-Path -Leaf $ZipPath
    $remoteCommand = "ssh $RemoteHost 'mkdir -p $remoteTargetDir' && scp `"$ZipPath`" ${RemoteHost}:$remoteTargetDir/$zipName && ssh $RemoteHost 'cd $remoteTargetDir && rm -rf bundle && mkdir bundle && unzip -o $zipName -d bundle && cd bundle && chmod +x ./$scriptName ./$runnerName ./$artifactName && $darwinCommand'"
    if ($RunRemote) {
        ssh $RemoteHost "mkdir -p $remoteTargetDir"
        scp $ZipPath "${RemoteHost}:$remoteTargetDir/$zipName"
        ssh $RemoteHost "cd $remoteTargetDir && rm -rf bundle && mkdir bundle && unzip -o $zipName -d bundle && cd bundle && chmod +x ./$scriptName ./$runnerName ./$artifactName && $darwinCommand"
    }
}

$reportLines = @(
    "darwin_validation_bundle=1",
    "validation_manifest=$ValidationManifest",
    "validation_manifest_exists=1",
    "validation_script=$ValidationScript",
    "validation_script_exists=1",
    "validation_runner=$runnerBundlePath",
    "artifact=$artifact",
    "artifact_local_path=$artifactLocalPath",
    "artifact_exists=$artifactExists",
    "bundle_dir=$OutDir",
    "bundle_zip=$ZipPath",
    "bundle_result_file=$resultBundlePath",
    "darwin_command=$darwinCommand",
    "windows_import_command=$importCommand",
    "remote_host=$RemoteHost",
    "remote_available=$remoteAvailable",
    "remote_command=$remoteCommand"
)

$reportPath = Join-Path $OutDir "bundle.report.txt"
$reportLines | Set-Content -LiteralPath $reportPath -Encoding ASCII
$reportLines | ForEach-Object { Write-Output $_ }
