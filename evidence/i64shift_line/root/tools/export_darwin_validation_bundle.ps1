param(
    [string]$Manifest = ".tmp-exec\darwin_arm64_probe\self_preflight_default.internal-link-probe.darwin-validation.txt",
    [string]$OutDir = "",
    [string]$ZipPath = "",
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
        Fail "missing Darwin validation manifest: $Path"
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

function Resolve-RequiredFile($Path, $Label) {
    $localPath = Normalize-LocalPath $Path
    if ($localPath -eq "" -or -not (Test-Path -LiteralPath $localPath -PathType Leaf)) {
        Fail "missing $Label file: $Path"
    }
    return (Resolve-Path -LiteralPath $localPath).Path
}

function Resolve-OptionalFile($Path) {
    $localPath = Normalize-LocalPath $Path
    if ($localPath -eq "" -or -not (Test-Path -LiteralPath $localPath -PathType Leaf)) {
        return ""
    }
    return (Resolve-Path -LiteralPath $localPath).Path
}

function Quote-Sh($Text) {
    return "'" + ([string]$Text).Replace("'", "'\''") + "'"
}

function Resolve-RemoteTool($Name) {
    $cmd = Get-Command $Name -ErrorAction SilentlyContinue
    if ($null -ne $cmd) {
        return $cmd.Source
    }
    foreach ($candidate in @(
        "C:\Program Files\Git\usr\bin\$Name.exe",
        "C:\Windows\System32\OpenSSH\$Name.exe"
    )) {
        if (Test-Path -LiteralPath $candidate -PathType Leaf) {
            return $candidate
        }
    }
    return ""
}

if ($RemoteHost -eq "" -and $env:CHENG_DARWIN_REMOTE -ne $null -and $env:CHENG_DARWIN_REMOTE -ne "") {
    $RemoteHost = $env:CHENG_DARWIN_REMOTE
}
if ($RunRemote -and $RemoteHost -eq "") {
    Fail "remote host required for -RunRemote; set -RemoteHost or CHENG_DARWIN_REMOTE_HOST"
}

$manifestLocalPath = Resolve-RequiredFile $Manifest "manifest"
$manifestMap = Read-KeyValueReport $manifestLocalPath

if ((Report-Value $manifestMap "target" "") -ne "arm64-apple-darwin") {
    Fail "manifest target is not arm64-apple-darwin"
}

$artifactRaw = Report-Value $manifestMap "artifact_path" ""
$artifactPath = Resolve-RequiredFile $artifactRaw "artifact"
$scriptRaw = Report-Value $manifestMap "darwin_validation_script" "$artifactRaw.darwin-validate.sh"
$readmeRaw = Report-Value $manifestMap "darwin_validation_readme" "$artifactRaw.darwin-validation.md"
$mapRaw = Report-Value $manifestMap "darwin_validation_map" "$artifactRaw.map"
$scriptPath = Resolve-RequiredFile $scriptRaw "validation script"
$readmePath = Resolve-OptionalFile $readmeRaw
$mapPath = Resolve-OptionalFile $mapRaw

$artifactName = Split-Path -Leaf $artifactPath
$scriptName = Split-Path -Leaf $scriptPath
$resultName = "$artifactName.darwin-result.txt"
$expectedTarget = Report-Value $manifestMap "target" "arm64-apple-darwin"
$expectedSize = Report-Value $manifestMap "artifact_size" ""
$expectedSha256 = Report-Value $manifestMap "artifact_sha256" ""

if ($OutDir -eq "") {
    $baseDir = Split-Path -Parent $manifestLocalPath
    $OutDir = Join-Path $baseDir "$artifactName.darwin-validation-bundle"
}

$outDirLocal = Normalize-LocalPath $OutDir
if (-not (Test-Path -LiteralPath $outDirLocal -PathType Container)) {
    New-Item -ItemType Directory -Force -Path $outDirLocal | Out-Null
}
$outDirFull = (Resolve-Path -LiteralPath $outDirLocal).Path

$copySet = @(
    @{ Source = $artifactPath; Name = $artifactName },
    @{ Source = $scriptPath; Name = $scriptName },
    @{ Source = $manifestLocalPath; Name = (Split-Path -Leaf $manifestLocalPath) }
)
if ($readmePath -ne "") {
    $copySet += @{ Source = $readmePath; Name = (Split-Path -Leaf $readmePath) }
}
if ($mapPath -ne "") {
    $copySet += @{ Source = $mapPath; Name = (Split-Path -Leaf $mapPath) }
}

foreach ($item in $copySet) {
    Copy-Item -LiteralPath $item.Source -Destination (Join-Path $outDirFull $item.Name) -Force
}

$runScriptPath = Join-Path $outDirFull "RUN_ON_DARWIN.sh"
$runScript = @(
    '#!/bin/sh',
    'set -u',
    'SCRIPT_DIR=$(CDPATH= cd "$(dirname "$0")" && pwd)',
    ('ARTIFACT=${CHENG_DARWIN_VALIDATION_ARTIFACT:-"$SCRIPT_DIR/' + $artifactName + '"}'),
    ('SCRIPT="$SCRIPT_DIR/' + $scriptName + '"'),
    ('RESULT=${CHENG_DARWIN_VALIDATION_RESULT_OUT:-"$SCRIPT_DIR/' + $resultName + '"}'),
    'SCRIPT_STDOUT="$RESULT.generated-script.stdout"',
    'SCRIPT_STDERR="$RESULT.generated-script.stderr"',
    'SCRIPT_RESULT="$RESULT.generated-script.result"',
    ('EXPECTED_TARGET="' + $expectedTarget + '"'),
    ('EXPECTED_SIZE="' + $expectedSize + '"'),
    ('EXPECTED_SHA256="' + $expectedSha256 + '"'),
    'host_uname_s=$(uname -s 2>/dev/null || echo unknown)',
    'host_uname_m=$(uname -m 2>/dev/null || echo unknown)',
    'host_darwin_arm64=0',
    'case "$host_uname_s:$host_uname_m" in Darwin:arm64|Darwin:aarch64) host_darwin_arm64=1 ;; esac',
    'artifact_exists=0',
    'artifact_size=',
    'artifact_size_match=0',
    'artifact_sha256=',
    'artifact_sha256_match=0',
    'chmod_755=0',
    'codesign_verify=0',
    'lc_main=0',
    'lc_code_signature=0',
    'libsystem=0',
    'generated_validation_script_exit_code=127',
    'runtime_execution_validated=0',
    'runtime_exit_code=127',
    'validation_error=',
    'if [ "$host_darwin_arm64" -ne 1 ]; then validation_error=host_not_darwin_arm64; fi',
    'if [ -z "$validation_error" ] && [ -f "$ARTIFACT" ]; then artifact_exists=1; else [ -n "$validation_error" ] || validation_error=missing_artifact; fi',
    'if [ "$artifact_exists" -eq 1 ]; then',
    '    artifact_size=$(wc -c < "$ARTIFACT" 2>/dev/null | tr -d " ")',
    '    [ "$artifact_size" = "$EXPECTED_SIZE" ] && artifact_size_match=1',
    '    artifact_sha256=$(shasum -a 256 "$ARTIFACT" 2>/dev/null)',
    '    artifact_sha256=${artifact_sha256%% *}',
    '    [ "$artifact_sha256" = "$EXPECTED_SHA256" ] && artifact_sha256_match=1',
    '    chmod 755 "$ARTIFACT" 2>/dev/null && chmod_755=1',
    '    codesign --verify --verbose=4 "$ARTIFACT" >/dev/null 2>&1 && codesign_verify=1',
    '    otool -l "$ARTIFACT" 2>/dev/null | grep -q LC_MAIN && lc_main=1',
    '    otool -l "$ARTIFACT" 2>/dev/null | grep -q LC_CODE_SIGNATURE && lc_code_signature=1',
    '    otool -L "$ARTIFACT" 2>/dev/null | grep -q /usr/lib/libSystem.B.dylib && libsystem=1',
    'fi',
    'if [ -z "$validation_error" ] && [ "$artifact_size_match" -ne 1 ]; then validation_error=artifact_size_mismatch; fi',
    'if [ -z "$validation_error" ] && [ "$artifact_sha256_match" -ne 1 ]; then validation_error=artifact_sha256_mismatch; fi',
    'if [ -z "$validation_error" ] && [ "$chmod_755" -ne 1 ]; then validation_error=chmod_failed; fi',
    'if [ -z "$validation_error" ] && [ "$codesign_verify" -ne 1 ]; then validation_error=codesign_verify_failed; fi',
    'if [ -z "$validation_error" ] && [ "$lc_main" -ne 1 ]; then validation_error=lc_main_missing; fi',
    'if [ -z "$validation_error" ] && [ "$lc_code_signature" -ne 1 ]; then validation_error=lc_code_signature_missing; fi',
    'if [ -z "$validation_error" ] && [ "$libsystem" -ne 1 ]; then validation_error=libsystem_missing; fi',
    'if [ -z "$validation_error" ] && [ -f "$SCRIPT" ]; then',
    '    CHENG_DARWIN_VALIDATION_RESULT_OUT="$SCRIPT_RESULT" /bin/sh "$SCRIPT" "$ARTIFACT" --run-smoke >"$SCRIPT_STDOUT" 2>"$SCRIPT_STDERR"',
    '    generated_validation_script_exit_code=$?',
    '    runtime_exit_code=$generated_validation_script_exit_code',
    '    [ "$generated_validation_script_exit_code" -eq 0 ] && runtime_execution_validated=1',
    'else',
    '    [ -n "$validation_error" ] || validation_error=missing_validation_script',
    'fi',
    'if [ -z "$validation_error" ] && [ "$runtime_execution_validated" -ne 1 ]; then validation_error=runtime_smoke_failed; fi',
    'validation_result_success=0',
    'if [ -z "$validation_error" ]; then validation_result_success=1; fi',
    '{',
    '    printf "validation_result_schema=canonical\n"',
    '    printf "target=%s\n" "$EXPECTED_TARGET"',
    '    printf "host_uname_s=%s\n" "$host_uname_s"',
    '    printf "host_uname_m=%s\n" "$host_uname_m"',
    '    printf "host_darwin_arm64=%s\n" "$host_darwin_arm64"',
    '    printf "artifact_path=%s\n" "$ARTIFACT"',
    '    printf "artifact_exists=%s\n" "$artifact_exists"',
    '    printf "artifact_size=%s\n" "$artifact_size"',
    '    printf "artifact_size_match=%s\n" "$artifact_size_match"',
    '    printf "artifact_sha256=%s\n" "$artifact_sha256"',
    '    printf "artifact_sha256_match=%s\n" "$artifact_sha256_match"',
    '    printf "chmod_755=%s\n" "$chmod_755"',
    '    printf "codesign_verify=%s\n" "$codesign_verify"',
    '    printf "lc_main=%s\n" "$lc_main"',
    '    printf "lc_code_signature=%s\n" "$lc_code_signature"',
    '    printf "libsystem=%s\n" "$libsystem"',
    '    printf "generated_validation_script=%s\n" "$SCRIPT"',
    '    printf "generated_validation_script_exit_code=%s\n" "$generated_validation_script_exit_code"',
    '    printf "runtime_exit_code=%s\n" "$runtime_exit_code"',
    '    printf "runtime_execution_validated=%s\n" "$runtime_execution_validated"',
    '    printf "validation_error=%s\n" "$validation_error"',
    '    printf "validation_result_success=%s\n" "$validation_result_success"',
    '} > "$RESULT"',
    'cat "$RESULT"',
    'if [ "$validation_result_success" -eq 1 ]; then exit 0; fi',
    'exit 1'
)
$runScript | Set-Content -LiteralPath $runScriptPath -Encoding ASCII

$bundleReadmePath = Join-Path $outDirFull "DARWIN_VALIDATION_BUNDLE.md"
$bundleReadme = @(
    '# Cheng Darwin arm64 validation bundle',
    '',
    'Copy this directory to a real arm64 Darwin host and run:',
    '',
    '    /bin/sh RUN_ON_DARWIN.sh',
    '',
    "The script writes $resultName only after checking the target host, artifact size, SHA-256, codesign --verify, LC_MAIN, LC_CODE_SIGNATURE, libSystem imports, and the runtime smoke step.",
    '',
    "After the command succeeds, copy $resultName back and import it on Windows with:",
    '',
    "    `$env:CHENG_DARWIN_VALIDATION_RESULT = '<path-to-$resultName>'",
    '    powershell -ExecutionPolicy Bypass -File tools\darwin_bootstrap_preflight.ps1'
)
$bundleReadme | Set-Content -LiteralPath $bundleReadmePath -Encoding ASCII

$importScriptPath = Join-Path $outDirFull "IMPORT_ON_WINDOWS.ps1"
$importScript = @(
    "`$Result = Join-Path `$PSScriptRoot '$resultName'",
    "Write-Output `"CHENG_DARWIN_VALIDATION_RESULT=`$Result`"",
    "Write-Output `"Rerun the same Cheng system-link-exec/preflight command with that environment variable set.`""
)
$importScript | Set-Content -LiteralPath $importScriptPath -Encoding ASCII

if ($ZipPath -ne "") {
    $zipLocal = Normalize-LocalPath $ZipPath
    $zipParent = Split-Path -Parent $zipLocal
    if ($zipParent -ne "" -and -not (Test-Path -LiteralPath $zipParent -PathType Container)) {
        New-Item -ItemType Directory -Force -Path $zipParent | Out-Null
    }
    if (Test-Path -LiteralPath $zipLocal -PathType Leaf) {
        Remove-Item -LiteralPath $zipLocal -Force
    }
    Compress-Archive -Path (Join-Path $outDirFull "*") -DestinationPath $zipLocal -Force
}

if ($RemoteDir -eq "") {
    $RemoteDir = "cheng-darwin-validation/$artifactName"
}

$darwinCommand = "cd " + (Quote-Sh $RemoteDir) + " && /bin/sh RUN_ON_DARWIN.sh"
$remoteParentDir = "."
$remoteSlash = $RemoteDir.LastIndexOf("/")
if ($remoteSlash -gt 0) {
    $remoteParentDir = $RemoteDir.Substring(0, $remoteSlash)
}
$remotePrepareCommand = ""
$remoteCopyCommand = ""
$remoteRunCommand = ""
$remoteRunExitCode = ""
$remoteFetchCommand = ""
$remoteFetchExitCode = ""
$remoteResultFetched = 0
$remoteSshTool = Resolve-RemoteTool "ssh"
$remoteScpTool = Resolve-RemoteTool "scp"
if ($RemoteHost -ne "") {
    if ($remoteParentDir -ne ".") {
        $remotePrepareCommand = "ssh " + (Quote-Sh $RemoteHost) + " " + (Quote-Sh ("mkdir -p " + (Quote-Sh $remoteParentDir)))
    }
    $remoteCopyCommand = "scp -r " + (Quote-Sh $outDirFull) + " " + (Quote-Sh "$RemoteHost`:$RemoteDir")
    $remoteRunCommand = "ssh " + (Quote-Sh $RemoteHost) + " " + (Quote-Sh $darwinCommand)
    $remoteFetchCommand = "scp " + (Quote-Sh "$RemoteHost`:$RemoteDir/$resultName") + " " + (Quote-Sh (Join-Path $outDirFull $resultName))
    if ($RunRemote) {
        if ($remoteScpTool -eq "" -or $remoteSshTool -eq "") {
            Fail "ssh/scp not available for -RunRemote"
        }
        if ($remoteParentDir -ne ".") {
            & $remoteSshTool $RemoteHost ("mkdir -p " + (Quote-Sh $remoteParentDir))
            if ($LASTEXITCODE -ne 0) {
                Fail "remote prepare failed with exit code $LASTEXITCODE"
            }
        }
        & $remoteScpTool -r $outDirFull "$RemoteHost`:$RemoteDir"
        if ($LASTEXITCODE -ne 0) {
            Fail "remote copy failed with exit code $LASTEXITCODE"
        }
        & $remoteSshTool $RemoteHost $darwinCommand
        $remoteRunExitCode = "$LASTEXITCODE"
        $remoteRunCode = $LASTEXITCODE
        & $remoteScpTool "$RemoteHost`:$RemoteDir/$resultName" (Join-Path $outDirFull $resultName)
        $remoteFetchExitCode = "$LASTEXITCODE"
        if ($LASTEXITCODE -eq 0) {
            $remoteResultFetched = 1
        }
        if ($remoteRunCode -ne 0) {
            Fail "remote Darwin validation failed with exit code $remoteRunCode"
        }
        if ($remoteResultFetched -ne 1) {
            Fail "remote Darwin validation result fetch failed with exit code $remoteFetchExitCode"
        }
    }
}

$reportPath = Join-Path $outDirFull "darwin_validation_bundle.report.txt"
$report = @(
    "darwin_validation_bundle=1",
    "manifest=$manifestLocalPath",
    "out_dir=$outDirFull",
    "artifact=$artifactName",
    "validation_script=$scriptName",
    "validation_result=$resultName",
    "run_on_darwin_script=RUN_ON_DARWIN.sh",
    "run_on_darwin_command=/bin/sh RUN_ON_DARWIN.sh",
    "windows_import_script=IMPORT_ON_WINDOWS.ps1",
    "windows_import_env=CHENG_DARWIN_VALIDATION_RESULT=$(Join-Path $outDirFull $resultName)",
    "zip_path=$(Normalize-LocalPath $ZipPath)",
    "remote_host=$RemoteHost",
    "remote_dir=$RemoteDir",
    "remote_ssh_tool=$remoteSshTool",
    "remote_scp_tool=$remoteScpTool",
    "remote_prepare_command=$remotePrepareCommand",
    "remote_copy_command=$remoteCopyCommand",
    "remote_run_command=$remoteRunCommand",
    "remote_run_exit_code=$remoteRunExitCode",
    "remote_fetch_command=$remoteFetchCommand",
    "remote_fetch_exit_code=$remoteFetchExitCode",
    "remote_result_fetched=$remoteResultFetched"
)
$report | Set-Content -LiteralPath $reportPath -Encoding ASCII
$report | ForEach-Object { Write-Output $_ }
