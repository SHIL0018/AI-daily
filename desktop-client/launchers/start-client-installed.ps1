$ErrorActionPreference = "Continue"

function Write-Step {
    param([string]$Message)
    Write-Host ""
    Write-Host "[Activity Daily] $Message" -ForegroundColor Cyan
}

function Test-Command {
    param([string]$Name)
    return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Test-Http {
    param([string]$Url, [int]$TimeoutSec = 2)
    try {
        $request = [System.Net.WebRequest]::Create($Url)
        $request.Method = "GET"
        $request.Timeout = $TimeoutSec * 1000
        $response = $request.GetResponse()
        $response.Close()
        return $true
    } catch {
        return $false
    }
}

function Wait-Http {
    param([string]$Url, [int]$TimeoutSec = 60)
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        if (Test-Http -Url $Url -TimeoutSec 2) { return $true }
        Start-Sleep -Seconds 1
    }
    return $false
}

function Resolve-ExistingModelPath {
    param([string[]]$Candidates)
    foreach ($candidate in $Candidates) {
        if ($candidate -and (Test-Path (Join-Path $candidate "config.json"))) {
            return (Resolve-Path $candidate).Path
        }
    }
    return $null
}

function Get-PythonLauncher {
    if (Test-Command "py") {
        & py -3.11 --version *> $null
        if ($LASTEXITCODE -eq 0) { return @{ FilePath = "py"; Prefix = @("-3.11") } }
        & py -3 --version *> $null
        if ($LASTEXITCODE -eq 0) { return @{ FilePath = "py"; Prefix = @("-3") } }
    }
    if (Test-Command "python") { return @{ FilePath = "python"; Prefix = @() } }
    return $null
}

function Test-PythonImport {
    param([string]$PythonExe, [string]$ModuleName)
    & $PythonExe -c "import $ModuleName" *> $null
    return $LASTEXITCODE -eq 0
}

function Ensure-ModelVenv {
    param([string]$RuntimeRoot)

    $venvPath = Join-Path $RuntimeRoot ".venv-model"
    $pythonExe = Join-Path $venvPath "Scripts\python.exe"
    $transformersExe = Join-Path $venvPath "Scripts\transformers.exe"
    $requiredImports = @("transformers", "requests", "torch", "PIL", "accelerate", "safetensors", "openai")

    if ((Test-Path $pythonExe) -and (Test-Path $transformersExe)) {
        $missingImports = @($requiredImports | Where-Object { -not (Test-PythonImport -PythonExe $pythonExe -ModuleName $_) })
        if ($missingImports.Count -eq 0) {
            Write-Host "Model Python environment is ready: $venvPath"
            return @{ Python = $pythonExe; Transformers = $transformersExe }
        }
        Write-Host "Model Python environment is missing packages: $($missingImports -join ', ')"
    }

    $launcher = Get-PythonLauncher
    if (-not $launcher) {
        Write-Warning "Python was not found. Install Python 3.11 if you want the local model service to start automatically."
        return $null
    }

    if (-not (Test-Path $pythonExe)) {
        Write-Host "Creating model Python environment: $venvPath"
        & $launcher.FilePath @($launcher.Prefix + @("-m", "venv", $venvPath))
        if ($LASTEXITCODE -ne 0) {
            Write-Warning "Failed to create model Python environment."
            return $null
        }
    }

    Write-Host "Installing/updating model service dependencies. This can take several minutes on first run..."
    & $pythonExe -m pip install -U pip
    if ($LASTEXITCODE -ne 0) { Write-Warning "pip upgrade failed."; return $null }
    & $pythonExe -m pip install "transformers[serving]" torch torchvision pillow accelerate safetensors openai requests
    if ($LASTEXITCODE -ne 0) { Write-Warning "Model service dependency install failed."; return $null }

    if (-not (Test-Path $transformersExe)) {
        Write-Warning "transformers.exe was not found after dependency install: $transformersExe"
        return $null
    }

    return @{ Python = $pythonExe; Transformers = $transformersExe }
}

function Start-TransformersModelService {
    param(
        [string]$RuntimeRoot,
        [string]$ModelPath,
        [string]$LogDir,
        [string]$HostName = "127.0.0.1",
        [int]$Port = 8001
    )

    $modelsUrl = "http://$HostName`:$Port/v1/models"
    if (Test-Http -Url $modelsUrl -TimeoutSec 3) {
        Write-Host "Transformers/OpenAI-compatible service detected: $modelsUrl"
        return $true
    }

    if (-not $ModelPath) {
        Write-Warning "Qwen3.5-0.8B files were not found. The app will still open, but local AI summaries may use fallback text."
        return $false
    }

    $runtime = Ensure-ModelVenv -RuntimeRoot $RuntimeRoot
    if (-not $runtime) { return $false }

    $modelLog = Join-Path $LogDir "model-service.log"
    $modelErrLog = Join-Path $LogDir "model-service.err.log"
    Write-Host "Starting model service: $modelsUrl"
    Write-Host "Model path: $ModelPath"
    Write-Host "Model service log: $modelLog"

    $args = @("serve", $ModelPath, "--host", $HostName, "--port", [string]$Port, "--model-timeout", "-1")
    Start-Process -FilePath $runtime.Transformers -ArgumentList $args -WorkingDirectory $RuntimeRoot -WindowStyle Hidden -RedirectStandardOutput $modelLog -RedirectStandardError $modelErrLog | Out-Null

    if (Wait-Http -Url $modelsUrl -TimeoutSec 120) {
        Write-Host "Model service is ready: $modelsUrl"
        return $true
    }

    Write-Warning "Model service did not become ready in time. Check logs:`n  $modelLog`n  $modelErrLog"
    return $false
}

$InstallDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$AppExe = Join-Path $InstallDir "Activity Daily Client.exe"
$RuntimeRoot = Join-Path $env:APPDATA "Activity Daily Client"
$ModelRoot = Join-Path $RuntimeRoot "local-models"
$OllamaModelRoot = Join-Path $ModelRoot "ollama"
$LogDir = Join-Path $RuntimeRoot "logs"
$LogPath = Join-Path $LogDir "launcher.log"
$TranscriptStarted = $false

New-Item -ItemType Directory -Force -Path $OllamaModelRoot | Out-Null
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

try {
    Start-Transcript -Path $LogPath -Append | Out-Null
    $TranscriptStarted = $true
} catch { }

try {
    Write-Step "Checking installed client"
    Write-Host "Install directory: $InstallDir"
    Write-Host "Runtime directory: $RuntimeRoot"
    Write-Host "Log file: $LogPath"
    if (-not (Test-Path $AppExe)) { throw "Activity Daily Client.exe was not found: $AppExe" }

    Write-Step "Preparing local model directory"
    Write-Host "Model directory: $OllamaModelRoot"
    $modelCandidates = @(
        (Join-Path $OllamaModelRoot "Qwen3.5-0.8B"),
        (Join-Path $ModelRoot "Qwen3.5-0.8B"),
        (Join-Path $ModelRoot "Qwen\Qwen3.5-0.8B"),
        (Join-Path $InstallDir "local-models\ollama\Qwen3.5-0.8B"),
        (Join-Path $InstallDir "local-models\Qwen3.5-0.8B")
    )
    $modelPath = Resolve-ExistingModelPath -Candidates $modelCandidates
    if ($modelPath) { Write-Host "Qwen3.5-0.8B files detected: $modelPath" } else { Write-Warning "Qwen3.5-0.8B files were not found." }

    Write-Step "Checking Python runtime"
    $python = Get-PythonLauncher
    if ($python) {
        $version = & $python.FilePath @($python.Prefix + @("--version"))
        Write-Host "Python: $version"
    } else {
        Write-Warning "Python was not found."
    }

    Write-Step "Checking Transformers model service"
    [void](Start-TransformersModelService -RuntimeRoot $RuntimeRoot -ModelPath $modelPath -LogDir $LogDir)

    Write-Step "Starting Activity Daily Client"
    Start-Process -FilePath $AppExe -WorkingDirectory $InstallDir | Out-Null
    Write-Host "Client started. This window will close shortly."
    Start-Sleep -Seconds 2
} catch {
    Write-Host ""
    Write-Host "[Activity Daily] Startup failed:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host "Log file: $LogPath"
    if ($TranscriptStarted) { try { Stop-Transcript | Out-Null } catch { } }
    exit 1
} finally {
    if ($TranscriptStarted) { try { Stop-Transcript | Out-Null } catch { } }
}