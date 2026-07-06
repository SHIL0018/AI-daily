param(
    [string]$ModelName = "qwen3.5:0.8b",
    [string]$TransformersModelPath = "local-models/ollama/Qwen3.5-0.8B",
    [string]$TransformersHost = "127.0.0.1",
    [int]$TransformersPort = 8001,
    [switch]$SkipInstall,
    [switch]$SkipModelService,
    [switch]$CheckOnly
)

$ErrorActionPreference = "Stop"

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
    param(
        [string]$Url,
        [int]$TimeoutSec = 2
    )
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
    param(
        [string]$Url,
        [int]$TimeoutSec = 60
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        if (Test-Http -Url $Url -TimeoutSec 2) {
            return $true
        }
        Start-Sleep -Seconds 1
    }

    return $false
}

function Invoke-CommandChecked {
    param(
        [string]$FilePath,
        [string[]]$Arguments,
        [string]$Description
    )

    Write-Host "Running: $FilePath $($Arguments -join ' ')"
    & $FilePath @Arguments
    $exitCode = $LASTEXITCODE
    if ($null -ne $exitCode -and $exitCode -ne 0) {
        throw "$Description failed with exit code $exitCode."
    }
}

function Resolve-ClientPath {
    param(
        [string]$BasePath,
        [string]$Value
    )

    if ([System.IO.Path]::IsPathRooted($Value)) {
        return $Value
    }

    return Join-Path $BasePath $Value
}

function Find-LocalQwenModelPath {
    param(
        [string]$ClientRoot,
        [string]$ModelRoot,
        [string]$OllamaModelRoot,
        [string]$ConfiguredModelPath
    )

    $candidates = @(
        (Resolve-ClientPath -BasePath $ClientRoot -Value $ConfiguredModelPath),
        (Join-Path $OllamaModelRoot "Qwen3.5-0.8B"),
        (Join-Path $ModelRoot "Qwen3.5-0.8B"),
        (Join-Path $ModelRoot "Qwen\Qwen3.5-0.8B")
    )

    foreach ($candidate in $candidates) {
        if (Test-Path (Join-Path $candidate "config.json")) {
            return (Resolve-Path $candidate).Path
        }
    }

    return $null
}

function Get-PythonLauncher {
    if (Test-Command "py") {
        return @{ FilePath = "py"; Prefix = @("-3.11") }
    }
    if (Test-Command "python") {
        return @{ FilePath = "python"; Prefix = @() }
    }
    return $null
}

function Test-PythonImport {
    param(
        [string]$PythonExe,
        [string]$ModuleName
    )

    & $PythonExe -c "import $ModuleName" *> $null
    return $LASTEXITCODE -eq 0
}

function Ensure-ModelVenv {
    param(
        [string]$ClientRoot,
        [string]$VenvPath,
        [bool]$AllowInstall
    )

    $pythonExe = Join-Path $VenvPath "Scripts\python.exe"
    $transformersExe = Join-Path $VenvPath "Scripts\transformers.exe"

    $requiredImports = @("transformers", "requests", "torch", "PIL", "accelerate", "safetensors", "openai")
    if ((Test-Path $pythonExe) -and (Test-Path $transformersExe)) {
        $missingImports = @($requiredImports | Where-Object { -not (Test-PythonImport -PythonExe $pythonExe -ModuleName $_) })
        if ($missingImports.Count -eq 0) {
            return @{ Python = $pythonExe; Transformers = $transformersExe }
        }

        if (-not $AllowInstall) {
            Write-Warning "Model Python environment is missing packages: $($missingImports -join ', ')"
            return $null
        }

        Write-Host "Model Python environment is missing packages: $($missingImports -join ', ')"
    }

    if (-not $AllowInstall) {
        Write-Warning "Model Python environment is not ready: $VenvPath"
        return $null
    }

    $launcher = Get-PythonLauncher
    if (-not $launcher) {
        Write-Warning "Python was not found. Install Python 3.11, then run start-client.cmd again."
        return $null
    }

    if (-not (Test-Path $pythonExe)) {
        Write-Host "Creating model Python environment: $VenvPath"
        & $launcher.FilePath @($launcher.Prefix + @("-m", "venv", $VenvPath))
        if ($LASTEXITCODE -ne 0) {
            if ($launcher.FilePath -eq "py" -and $launcher.Prefix -contains "-3.11") {
                Write-Warning "Python 3.11 launcher failed. Trying default Python 3..."
                & py -3 -m venv $VenvPath
                if ($LASTEXITCODE -ne 0) { return $null }
            } else {
                return $null
            }
        }
    }

    if (-not (Test-Path $pythonExe)) {
        Write-Warning "Python environment was not created correctly: $VenvPath"
        return $null
    }

    Write-Host "Installing/updating model service dependencies. This can take several minutes on first run..."
    Invoke-CommandChecked -FilePath $pythonExe -Arguments @("-m", "pip", "install", "-U", "pip") -Description "pip upgrade"
    Invoke-CommandChecked -FilePath $pythonExe -Arguments @("-m", "pip", "install", "transformers[serving]", "torch", "torchvision", "pillow", "accelerate", "safetensors", "openai", "requests") -Description "model service dependency install"

    if (-not (Test-Path $transformersExe)) {
        Write-Warning "transformers.exe was not found after dependency install: $transformersExe"
        return $null
    }

    return @{ Python = $pythonExe; Transformers = $transformersExe }
}

function Start-TransformersModelService {
    param(
        [string]$ClientRoot,
        [string]$ModelPath,
        [string]$HostName,
        [int]$Port,
        [string]$LogDir,
        [bool]$AllowInstall
    )

    $modelsUrl = "http://$HostName`:$Port/v1/models"
    if (Test-Http -Url $modelsUrl -TimeoutSec 3) {
        Write-Host "Transformers/OpenAI-compatible service detected: $modelsUrl"
        return $true
    }

    if (-not $ModelPath) {
        Write-Warning "Qwen3.5-0.8B files were not found. Cannot start the model service automatically."
        return $false
    }

    $venvPath = Join-Path $ClientRoot ".venv-model"
    $runtime = Ensure-ModelVenv -ClientRoot $ClientRoot -VenvPath $venvPath -AllowInstall:$AllowInstall
    if (-not $runtime) {
        Write-Warning "Model service runtime is unavailable. The client will still start with fallback summaries."
        return $false
    }

    $modelLog = Join-Path $LogDir "model-service.log"
    $modelErrLog = Join-Path $LogDir "model-service.err.log"
    Write-Host "Starting model service on $modelsUrl"
    Write-Host "Model path: $ModelPath"
    Write-Host "Model service log: $modelLog"

    $args = @("serve", $ModelPath, "--host", $HostName, "--port", [string]$Port, "--model-timeout", "-1")
    Start-Process -FilePath $runtime.Transformers -ArgumentList $args -WorkingDirectory $ClientRoot -WindowStyle Hidden -RedirectStandardOutput $modelLog -RedirectStandardError $modelErrLog | Out-Null

    if (Wait-Http -Url $modelsUrl -TimeoutSec 120) {
        Write-Host "Model service is ready: $modelsUrl"
        return $true
    }

    Write-Warning "Model service did not become ready in time. Check logs:`n  $modelLog`n  $modelErrLog"
    return $false
}

$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$ClientRoot = Split-Path -Parent $ScriptRoot
$ModelRoot = Join-Path $ClientRoot "local-models"
$OllamaModelRoot = Join-Path $ModelRoot "ollama"
$RendererUrl = "http://127.0.0.1:5173"
$TransformersModelsUrl = "http://$TransformersHost`:$TransformersPort/v1/models"
$LogDir = Join-Path $ClientRoot "logs"
$LogPath = Join-Path $LogDir "start-client.log"
$TranscriptStarted = $false

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
try {
    Start-Transcript -Path $LogPath -Append | Out-Null
    $TranscriptStarted = $true
    Write-Host "Log file: $LogPath"
} catch {
    Write-Warning "Could not start transcript log: $LogPath"
}

if ([System.Environment]::OSVersion.Platform -ne [System.PlatformID]::Win32NT) {
    Write-Warning "This launcher is designed for Windows 11. Use npm commands on other systems."
}

Write-Step "Preparing local model directory"
New-Item -ItemType Directory -Force -Path $OllamaModelRoot | Out-Null
$env:OLLAMA_MODELS = $OllamaModelRoot
Write-Host "Model directory: $OllamaModelRoot"

$LocalQwenModelPath = Find-LocalQwenModelPath -ClientRoot $ClientRoot -ModelRoot $ModelRoot -OllamaModelRoot $OllamaModelRoot -ConfiguredModelPath $TransformersModelPath
if ($LocalQwenModelPath) {
    Write-Host "Qwen3.5-0.8B files detected: $LocalQwenModelPath"
} else {
    Write-Warning "Qwen3.5-0.8B files were not found under local-models."
}

Push-Location $ClientRoot
try {
    Write-Step "Checking Node.js and npm"
    if (-not (Test-Command "node")) {
        throw "Node.js was not found. Install Node.js LTS, then run start-client.cmd again."
    }
    if (-not (Test-Command "npm")) {
        throw "npm was not found. Check your Node.js installation, then run start-client.cmd again."
    }
    $nodeVersion = & node --version
    $npmVersion = & npm --version
    Write-Host "Node.js: $nodeVersion"
    Write-Host "npm: $npmVersion"

    Write-Step "Checking Transformers model service"
    if ($SkipModelService) {
        Write-Warning "SkipModelService was set. The local model service will not be started by this launcher."
    } elseif ($CheckOnly) {
        if (Test-Http -Url $TransformersModelsUrl -TimeoutSec 3) {
            Write-Host "Transformers/OpenAI-compatible service detected: $TransformersModelsUrl"
        } else {
            Write-Warning "Transformers/OpenAI-compatible service is not responding at $TransformersModelsUrl."
        }
    } else {
        [void](Start-TransformersModelService -ClientRoot $ClientRoot -ModelPath $LocalQwenModelPath -HostName $TransformersHost -Port $TransformersPort -LogDir $LogDir -AllowInstall:(!$SkipInstall))
    }

    Write-Step "Checking optional Ollama runtime"
    if (Test-Command "ollama") {
        try {
            $ollamaVersion = & ollama --version
            Write-Host "Ollama: $ollamaVersion"
        } catch {
            Write-Host "Ollama command was found."
        }

        if (-not (Test-Http -Url "http://127.0.0.1:11434/api/tags" -TimeoutSec 2)) {
            Write-Host "Ollama service is not responding. Trying to start it in the background..."
            Start-Process -FilePath "ollama" -ArgumentList "serve" -WindowStyle Hidden | Out-Null
            if (-not (Wait-Http -Url "http://127.0.0.1:11434/api/tags" -TimeoutSec 20)) {
                Write-Warning "Ollama still is not responding. This is OK when using Transformers/OpenAI-compatible service."
            }
        }

        try {
            $modelList = & ollama list 2>$null
            $modelBaseName = ($ModelName -split ":")[0]
            if ($modelList -notmatch [regex]::Escape($modelBaseName)) {
                Write-Host "Ollama model tag was not found: $ModelName. This is OK when using Transformers/OpenAI-compatible service."
            } else {
                Write-Host "Ollama model detected: $ModelName"
            }
        } catch {
            Write-Warning "Could not read the Ollama model list."
        }
    } else {
        Write-Host "Ollama was not found. This is OK when using Transformers/OpenAI-compatible service."
    }

    if ($CheckOnly) {
        Write-Step "Checks completed"
        Write-Host "CheckOnly mode does not install dependencies, start the model service, or start the client."
        exit 0
    }

    Write-Step "Checking npm dependencies"
    $NodeModules = Join-Path $ClientRoot "node_modules"
    if (-not (Test-Path $NodeModules)) {
        if ($SkipInstall) {
            throw "node_modules does not exist and SkipInstall was set. Run npm install in desktop-client first."
        }
        Write-Host "Installing npm dependencies. This may take a few minutes..."
        Invoke-CommandChecked -FilePath "npm.cmd" -Arguments @("install") -Description "npm install"
    }

    Write-Step "Rebuilding Electron native modules"
    Invoke-CommandChecked -FilePath "npm.cmd" -Arguments @("run", "rebuild:native") -Description "Electron native module rebuild"

    Write-Step "Starting renderer dev server"
    if (-not (Test-Http -Url $RendererUrl -TimeoutSec 2)) {
        Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "npm run dev:web" -WorkingDirectory $ClientRoot -WindowStyle Hidden | Out-Null
        if (-not (Wait-Http -Url $RendererUrl -TimeoutSec 60)) {
            throw "Renderer dev server timed out: $RendererUrl"
        }
    } else {
        Write-Host "Renderer dev server is already running: $RendererUrl"
    }

    Write-Step "Building Electron main process"
    Invoke-CommandChecked -FilePath "npm.cmd" -Arguments @("run", "build:main") -Description "Electron main build"

    Write-Step "Starting Electron client"
    $electronLog = Join-Path $LogDir "electron.log"
    $electronErrLog = Join-Path $LogDir "electron.err.log"
    $electronCmd = "set VITE_DEV_SERVER_URL=$RendererUrl&& npx electron ."
    Start-Process -FilePath "cmd.exe" -ArgumentList @("/c", $electronCmd) -WorkingDirectory $ClientRoot -WindowStyle Hidden -RedirectStandardOutput $electronLog -RedirectStandardError $electronErrLog | Out-Null
    Start-Sleep -Seconds 2
    Write-Host "Electron client was started in the background."
    Write-Host "Electron log: $electronLog"
} finally {
    Pop-Location
    if ($TranscriptStarted) {
        try { Stop-Transcript | Out-Null } catch { }
    }
}


