$ErrorActionPreference = 'Stop'
$appRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $appRoot
$logs = Join-Path $appRoot 'data\logs'
New-Item -ItemType Directory -Path $logs -Force | Out-Null
$launcherLog = Join-Path $logs 'launcher.log'

function Write-LauncherLog([string]$message) {
    Add-Content -LiteralPath $launcherLog -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $message" -Encoding UTF8
}

function Open-App([int]$port) {
    $url = "http://localhost:$port/"
    $edgePaths = @(
        (Join-Path ([Environment]::GetFolderPath('ProgramFilesX86')) 'Microsoft\Edge\Application\msedge.exe'),
        (Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe'),
        (Join-Path $env:LOCALAPPDATA 'Microsoft\Edge\Application\msedge.exe')
    )
    $edge = $edgePaths | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
    if ($edge) {
        $profile = Join-Path $appRoot 'data\app-window-profile'
        New-Item -ItemType Directory -Path $profile -Force | Out-Null
        Start-Process -FilePath $edge -ArgumentList @("--app=$url", "--user-data-dir=$profile", '--no-first-run', '--no-default-browser-check') -ErrorAction Stop
        Write-LauncherLog "Opened app window $url"
    } else {
        Start-Process -FilePath (Join-Path $env:WINDIR 'explorer.exe') -ArgumentList $url -ErrorAction Stop
        Write-LauncherLog "Opened default browser $url (Edge unavailable)"
    }
}

function Test-App([int]$port) {
    try {
        $response = Invoke-WebRequest -Uri "http://127.0.0.1:$port/login" -UseBasicParsing -TimeoutSec 3
        return $response.StatusCode -eq 200 -and $response.Content -match 'AI智能错题本'
    } catch { return $false }
}

try {
    Write-LauncherLog 'Launch requested'
    $node = Join-Path $appRoot 'runtime\node.exe'
    $server = Join-Path $appRoot 'node_modules\next\dist\bin\next'
    if (!(Test-Path -LiteralPath $node) -or !(Test-Path -LiteralPath $server)) {
        throw '程序文件不完整，请重新运行最新版安装包修复。'
    }

    $envPath = Join-Path $appRoot '.env'
    if (!(Test-Path -LiteralPath $envPath)) {
        $secretBytes = New-Object byte[] 48
        [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($secretBytes)
        $secret = [Convert]::ToBase64String($secretBytes)
        @(
            'DATABASE_URL="file:./app.db"'
            "NEXTAUTH_SECRET=`"$secret`""
            'AUTH_TRUST_HOST=true'
            'LOG_LEVEL=info'
        ) | Set-Content -LiteralPath $envPath -Encoding UTF8
    }

    $env:DATABASE_URL = 'file:./app.db'
    $bootstrap = Join-Path $appRoot 'bootstrap-admin.js'
    if (Test-Path -LiteralPath $bootstrap) {
        & $node $bootstrap 2>&1 | ForEach-Object { Write-LauncherLog "Bootstrap: $_" }
        if ($LASTEXITCODE -ne 0) { throw '初始化本地管理员失败，请查看启动日志。' }
    }

    $owned = @(Get-CimInstance Win32_Process -Filter "name = 'node.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.ExecutablePath -eq $node } | Select-Object -ExpandProperty ProcessId)
    $listeners = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
        Where-Object { $_.LocalPort -ge 3001 -and $_.LocalPort -le 3020 -and $owned -contains $_.OwningProcess } |
        Sort-Object LocalPort)
    foreach ($listener in $listeners) {
        if (Test-App $listener.LocalPort) {
            Write-LauncherLog "Reusing server on port $($listener.LocalPort)"
            Open-App $listener.LocalPort
            exit 0
        }
    }

    $port = 3001
    while ($port -le 3020) {
        $used = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
        if (!$used) { break }
        $port++
    }
    if ($port -gt 3020) { throw '本机 3001–3020 端口都被占用，无法启动。' }

    $env:NODE_ENV = 'production'
    $env:NEXTAUTH_URL = "http://localhost:$port"
    $env:AUTH_TRUST_HOST = 'true'
    Write-LauncherLog "Starting server on port $port"
    $process = Start-Process -FilePath $node -ArgumentList @($server, 'start', '-H', '0.0.0.0', '-p', "$port") -WorkingDirectory $appRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logs 'server.log') -RedirectStandardError (Join-Path $logs 'server-error.log')

    for ($attempt = 0; $attempt -lt 40; $attempt++) {
        if ($process.HasExited) { throw '服务启动失败，请查看 data\logs\server-error.log。' }
        if (Test-App $port) {
            Write-LauncherLog "Server ready on port $port"
            Open-App $port
            exit 0
        }
        Start-Sleep -Milliseconds 500
    }
    throw '服务启动超时，请查看 data\logs\server-error.log。'
} catch {
    Write-LauncherLog "ERROR $($_.Exception.Message)"
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show("错题本打开失败：$($_.Exception.Message)`n`n日志位置：$launcherLog", '拾题 AI 错题本', 'OK', 'Error') | Out-Null
    exit 1
}
