param([int]$Port = 3001, [switch]$Background)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)

if (!(Test-Path '.env')) {
    throw 'Missing .env. Copy .env.example and configure the local database and authentication secret first.'
}
if (!(Test-Path 'node_modules/next/dist/bin/next')) {
    throw 'Dependencies are missing. Run npm ci first.'
}

$previewNode = Get-Command node -ErrorAction SilentlyContinue
if ($previewNode) {
    $previewNodePath = $previewNode.Source
} else {
    $previewNodePath = Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
    if (!(Test-Path $previewNodePath)) {
        throw 'Node.js is not available. Install Node.js 20.9 or newer and retry.'
    }
}

$env:NEXTAUTH_URL = "http://localhost:$Port"
$previewMode = if (Test-Path '.next/BUILD_ID') { 'start' } else { 'dev' }
if ($Background) {
    $previewRoot = (Get-Location).Path
    $previewLogs = Join-Path $previewRoot 'data/previews'
    New-Item -ItemType Directory -Force -Path $previewLogs | Out-Null
    Start-Process -FilePath $previewNodePath -ArgumentList @('node_modules/next/dist/bin/next', $previewMode, '-H', '127.0.0.1', '-p', "$Port") -WorkingDirectory $previewRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $previewLogs 'local-server.log') -RedirectStandardError (Join-Path $previewLogs 'local-server-error.log') | Out-Null
    Write-Output "Preview started: http://localhost:$Port/"
    exit 0
}
& $previewNodePath node_modules/next/dist/bin/next $previewMode -H 127.0.0.1 -p $Port
exit $LASTEXITCODE
