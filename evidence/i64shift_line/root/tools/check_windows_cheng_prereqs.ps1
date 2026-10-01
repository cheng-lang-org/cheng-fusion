param(
    [string]$MsysBin = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Fail($Message) {
    Write-Error $Message
    exit 1
}

function Normalize-Dir($Path) {
    if ($Path -eq "") {
        return ""
    }
    if (-not (Test-Path -LiteralPath $Path -PathType Container)) {
        return ""
    }
    return (Resolve-Path -LiteralPath $Path).Path
}

function Find-File-In-Dirs($Name, $Dirs) {
    foreach ($dir in $Dirs) {
        if ($dir -eq "") {
            continue
        }
        $candidate = Join-Path $dir $Name
        if (Test-Path -LiteralPath $candidate -PathType Leaf) {
            return $candidate
        }
    }
    return ""
}

function Find-First-Tool($Names, $Dirs) {
    foreach ($name in $Names) {
        $tool = Find-File-In-Dirs $name $Dirs
        if ($tool -ne "") {
            return $tool
        }
    }
    return ""
}

$extraDirs = @()
if ($MsysBin -ne "") {
    $resolvedMsysBin = Normalize-Dir $MsysBin
    if ($resolvedMsysBin -eq "") {
        Fail "MSYS bin directory does not exist: $MsysBin"
    }
    $extraDirs += $resolvedMsysBin
}

$pathDirs = @()
foreach ($entry in ($env:PATH -split ";")) {
    $resolved = Normalize-Dir $entry
    if ($resolved -ne "") {
        $pathDirs += $resolved
    }
}

$effectiveDirs = @($extraDirs + $pathDirs) | Select-Object -Unique

$missing = @()
$msysDll = Find-File-In-Dirs "msys-2.0.dll" $effectiveDirs
if ($msysDll -eq "") {
    $missing += "msys-2.0.dll"
}

$gccRuntimeDll = Find-File-In-Dirs "msys-gcc_s-seh-1.dll" $effectiveDirs
if ($gccRuntimeDll -eq "") {
    $missing += "msys-gcc_s-seh-1.dll"
}

$shell = Find-First-Tool @("sh.exe", "bash.exe") $effectiveDirs
if ($shell -eq "") {
    $missing += "sh.exe or bash.exe"
}

$compiler = Find-First-Tool @("cc.exe", "gcc.exe", "clang.exe", "cl.exe") $effectiveDirs
if ($compiler -eq "") {
    $missing += "cc.exe, gcc.exe, clang.exe, or cl.exe"
}

if ($missing.Count -ne 0) {
    Write-Host "FAIL windows_cheng_prereqs"
    foreach ($item in $missing) {
        Write-Host "missing=$item"
    }
    Write-Host ""
    Write-Host "For this shell only, prepend a directory that contains the MSYS runtime, sh, and a C compiler."
    Write-Host "Example:"
    Write-Host "  `$env:PATH = 'C:\msys64\usr\bin;' + `$env:PATH"
    Write-Host "Or check without changing PATH:"
    Write-Host "  powershell -ExecutionPolicy Bypass -File tools\check_windows_cheng_prereqs.ps1 -MsysBin C:\msys64\usr\bin"
    exit 1
}

Write-Host "PASS windows_cheng_prereqs"
Write-Host "msys_runtime=$msysDll"
Write-Host "gcc_runtime=$gccRuntimeDll"
Write-Host "shell=$shell"
Write-Host "compiler=$compiler"

if ($MsysBin -ne "") {
    Write-Host ""
    Write-Host "Use this for current-shell verification only:"
    Write-Host "  `$env:PATH = '$resolvedMsysBin;' + `$env:PATH"
}
