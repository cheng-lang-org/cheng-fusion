param(
    [string]$Manifest = ".tmp-exec\linux_x86_64_bootstrap_gate\linux_x86_64_validation_manifest.txt",
    [string]$GateReport = ".tmp-exec\linux_x86_64_bootstrap_gate\linux_x86_64_bootstrap_truth_gate.report.txt",
    [string]$OutDir = "",
    [string]$ZipPath = ""
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
        Fail "missing Linux x86_64 validation manifest: $Path"
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

function Quote-Ps($Text) {
    return "'" + ([string]$Text).Replace("'", "''") + "'"
}

$manifestLocalPath = Resolve-RequiredFile $Manifest "manifest"
$manifestMap = Read-KeyValueReport $manifestLocalPath

if ((Report-Value $manifestMap "target" "") -ne "x86_64-unknown-linux-gnu") {
    Fail "manifest target is not x86_64-unknown-linux-gnu"
}

$pureRunnerRaw = Report-Value $manifestMap "pure_runner" ""
$pureObjectRaw = Report-Value $manifestMap "pure_object" ""
$validationScriptRaw = Report-Value $manifestMap "validation_script" ""
$elfAuditRaw = Report-Value $manifestMap "elf_audit_report" ""
$runtimeResultRaw = Report-Value $manifestMap "runtime_result" ""
$pureRunner = Resolve-RequiredFile $pureRunnerRaw "pure runner"
$validationScript = Resolve-RequiredFile $validationScriptRaw "runtime validation script"
$elfAudit = Resolve-RequiredFile $elfAuditRaw "ELF audit"
$pureObject = Resolve-OptionalFile $pureObjectRaw
$gateReportPath = Resolve-OptionalFile $GateReport

$pureRunnerName = Split-Path -Leaf $pureRunner
$validationScriptName = Split-Path -Leaf $validationScript
$manifestName = Split-Path -Leaf $manifestLocalPath
$elfAuditName = Split-Path -Leaf $elfAudit
$runtimeResultName = if ($runtimeResultRaw -ne "") { Split-Path -Leaf (Normalize-LocalPath $runtimeResultRaw) } else { "linux_x86_64_runtime_result.txt" }
$pureRunnerSize = (Get-Item -LiteralPath $pureRunner).Length
$pureRunnerCksum = Report-Value $manifestMap "pure_runner_cksum" ""
$pureRunnerSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $pureRunner).Hash.ToLowerInvariant()
$staticAuditValid = Report-Value $manifestMap "static_audit_valid" "0"

if ($OutDir -eq "") {
    $baseDir = Split-Path -Parent $manifestLocalPath
    $OutDir = Join-Path $baseDir "linux-x86_64-validation-bundle"
}

$outDirLocal = Normalize-LocalPath $OutDir
if (-not (Test-Path -LiteralPath $outDirLocal -PathType Container)) {
    New-Item -ItemType Directory -Force -Path $outDirLocal | Out-Null
}
$outDirFull = (Resolve-Path -LiteralPath $outDirLocal).Path

$copySet = @(
    @{ Source = $pureRunner; Name = $pureRunnerName },
    @{ Source = $validationScript; Name = $validationScriptName },
    @{ Source = $manifestLocalPath; Name = $manifestName },
    @{ Source = $elfAudit; Name = $elfAuditName }
)
if ($pureObject -ne "") {
    $copySet += @{ Source = $pureObject; Name = (Split-Path -Leaf $pureObject) }
}
if ($gateReportPath -ne "") {
    $copySet += @{ Source = $gateReportPath; Name = (Split-Path -Leaf $gateReportPath) }
}

foreach ($item in $copySet) {
    Copy-Item -LiteralPath $item.Source -Destination (Join-Path $outDirFull $item.Name) -Force
}

$runScriptPath = Join-Path $outDirFull "RUN_ON_LINUX_X86_64.sh"
$runScript = @(
    '#!/bin/sh',
    'set -u',
    'SCRIPT_DIR=$(CDPATH= cd "$(dirname "$0")" && pwd)',
    'DEFAULT_ROOT=$(CDPATH= cd "$SCRIPT_DIR/../../.." 2>/dev/null && pwd || printf "")',
    'host_uname_s=$(uname -s 2>/dev/null || echo unknown)',
    'host_uname_m=$(uname -m 2>/dev/null || echo unknown)',
    'if [ "$host_uname_s:$host_uname_m" != "Linux:x86_64" ]; then',
    '    echo "host_not_linux_x86_64 host_uname_s=$host_uname_s host_uname_m=$host_uname_m" >&2',
    '    exit 1',
    'fi',
    'CHENG_LINUX_X86_64_VALIDATION_ROOT="${CHENG_LINUX_X86_64_VALIDATION_ROOT:-$DEFAULT_ROOT}"',
    ('CHENG_LINUX_X86_64_RUNTIME_RESULT="${CHENG_LINUX_X86_64_RUNTIME_RESULT:-$SCRIPT_DIR/' + $runtimeResultName + '}"'),
    ('CHENG_LINUX_X86_64_PURE_RUNNER="${CHENG_LINUX_X86_64_PURE_RUNNER:-$SCRIPT_DIR/' + $pureRunnerName + '}"'),
    'export CHENG_LINUX_X86_64_VALIDATION_ROOT',
    'export CHENG_LINUX_X86_64_RUNTIME_RESULT',
    'export CHENG_LINUX_X86_64_PURE_RUNNER',
    ('exec /bin/sh "$SCRIPT_DIR/' + $validationScriptName + '"')
)
$runScript | Set-Content -LiteralPath $runScriptPath -Encoding ASCII

$importScriptPath = Join-Path $outDirFull "IMPORT_ON_WINDOWS.ps1"
$repoImportScript = "tools\import_bootstrap_truth_report.ps1"
$importScript = @(
    'param(',
    '    [string]$RepoRoot = (Resolve-Path ".").Path,',
    ('    [string]$RuntimeResult = "' + $runtimeResultName + '",'),
    '    [string]$OutReport = ".tmp-exec\linux_x86_64_bootstrap_gate\bootstrap_truth_import.report.txt"',
    ')',
    '$ErrorActionPreference = "Stop"',
    '$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path',
    '$runtimeResultPath = Join-Path $scriptDir $RuntimeResult',
    'if (-not (Test-Path -LiteralPath $runtimeResultPath -PathType Leaf)) { throw "missing Linux runtime result: $runtimeResultPath" }',
    '$gateReport = Join-Path $RepoRoot ".tmp-exec\linux_x86_64_bootstrap_gate\linux_x86_64_bootstrap_truth_gate.report.txt"',
    ('$importScript = Join-Path $RepoRoot "' + $repoImportScript + '"'),
    '& powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $importScript -InputReport $gateReport -OutReport (Join-Path $RepoRoot $OutReport) -LinuxRuntimeResult $runtimeResultPath'
)
$importScript | Set-Content -LiteralPath $importScriptPath -Encoding ASCII

$readmePath = Join-Path $outDirFull "README-linux-x86_64-validation.md"
$readme = @(
    '# Linux x86_64 Bootstrap Runtime Validation',
    '',
    'This bundle was exported from the Windows checkout after the Linux pure runner build and static ELF audit completed.',
    '',
    '## Recorded Artifact',
    '',
    ('- target: `x86_64-unknown-linux-gnu`'),
    ('- pure runner: `' + $pureRunnerName + '`'),
    ('- pure runner size: `' + $pureRunnerSize + '`'),
    ('- pure runner POSIX cksum: `' + $pureRunnerCksum + '`'),
    ('- pure runner SHA-256: `' + $pureRunnerSha256 + '`'),
    ('- static ELF audit valid: `' + $staticAuditValid + '`'),
    '',
    '## Run On Linux x86_64',
    '',
    '```sh',
    'chmod +x ./RUN_ON_LINUX_X86_64.sh',
    './RUN_ON_LINUX_X86_64.sh',
    '```',
    '',
    'If the bundle is copied outside the repository checkout, set `CHENG_LINUX_X86_64_VALIDATION_ROOT=/path/to/cheng-lang` before running the script.',
    '',
    'A successful run writes `linux_x86_64_runtime_result.txt`. Runtime success is only valid when that result reports `host_uname_s=Linux`, `host_uname_m=x86_64`, `runtime_execute_rc=0`, `generated_object_written=1`, `generated_exe_written=1`, and `generated_exe_rc=0`.',
    '',
    '## Import On Windows',
    '',
    'Copy `linux_x86_64_runtime_result.txt` back into this bundle directory, then run from the repository root:',
    '',
    '```powershell',
    ('powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File ' + (Quote-Ps (Join-Path $OutDir "IMPORT_ON_WINDOWS.ps1"))),
    '```',
    '',
    'The Windows import gate also checks that the POSIX `cksum` reported by Linux matches the manifest checksum before claiming runtime success.'
)
$readme | Set-Content -LiteralPath $readmePath -Encoding ASCII

$bundleReportPath = Join-Path $outDirFull "linux_x86_64_validation_bundle.report.txt"
$lines = @(
    "linux_x86_64_validation_bundle=1",
    "target=x86_64-unknown-linux-gnu",
    "bundle_dir=$outDirFull",
    "manifest=$manifestLocalPath",
    "pure_runner=$pureRunner",
    "pure_runner_size=$pureRunnerSize",
    "pure_runner_cksum=$pureRunnerCksum",
    "pure_runner_sha256=$pureRunnerSha256",
    "static_audit_valid=$staticAuditValid",
    "elf_audit=$elfAudit",
    "validation_script=$validationScript",
    "run_on_linux_script=$runScriptPath",
    "import_on_windows_script=$importScriptPath",
    "readme=$readmePath",
    "runtime_success_claimed=0",
    "production_emit_exe_success_claimed=0",
    "next_blocker=linux_x86_64_runtime_execution_required"
)
$lines | Set-Content -LiteralPath $bundleReportPath -Encoding ASCII

if ($ZipPath -ne "") {
    $zipLocal = Normalize-LocalPath $ZipPath
    $zipParent = Split-Path -Parent $zipLocal
    if ($zipParent -ne "" -and -not (Test-Path -LiteralPath $zipParent -PathType Container)) {
        New-Item -ItemType Directory -Force -Path $zipParent | Out-Null
    }
    if (Test-Path -LiteralPath $zipLocal -PathType Leaf) {
        Remove-Item -LiteralPath $zipLocal -Force
    }
    Compress-Archive -Path (Join-Path $outDirFull '*') -DestinationPath $zipLocal -Force
    $lines += "zip_path=$((Resolve-Path -LiteralPath $zipLocal).Path)"
    $lines | Set-Content -LiteralPath $bundleReportPath -Encoding ASCII
}

$lines | ForEach-Object { Write-Output $_ }
exit 0
