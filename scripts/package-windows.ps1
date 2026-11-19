param([switch]$SkipBuild)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $root
$node = (Get-Command node -ErrorAction Stop).Source
$pnpm = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd'
$inno = Join-Path $env:LOCALAPPDATA 'Programs\Inno Setup 6\ISCC.exe'
if (!(Test-Path -LiteralPath $inno)) { throw 'Inno Setup 6 command-line compiler is missing.' }
if (!$SkipBuild) {
    & $pnpm build
    if ($LASTEXITCODE -ne 0) { throw 'Next.js build failed.' }
}

$flat = Join-Path $root 'build\windows-flat'
if (!(Test-Path -LiteralPath (Join-Path $flat 'node_modules\next\dist\bin\next'))) {
    New-Item -ItemType Directory -Force -Path $flat | Out-Null
    Copy-Item -LiteralPath 'package.json', 'package-lock.json' -Destination $flat -Force
    @('nodeLinker: hoisted', 'allowBuilds:', "  '@prisma/client': true", "  '@prisma/engines': true", '  better-sqlite3: true', '  prisma: true', '  sharp: true') | Set-Content -LiteralPath (Join-Path $flat 'pnpm-workspace.yaml') -Encoding UTF8
    & $pnpm --dir $flat import
    if ($LASTEXITCODE -ne 0) { throw 'Production dependency lockfile import failed.' }
    & $pnpm --dir $flat install --prod --frozen-lockfile
    if ($LASTEXITCODE -ne 0) { throw 'Production dependency install failed.' }
}
if (!(Test-Path -LiteralPath (Join-Path $flat 'node_modules\jsdom\package.json'))) {
    & $pnpm --dir $flat add 'jsdom@27.2.0' --save-prod --prod --ignore-scripts
    if ($LASTEXITCODE -ne 0) { throw 'Knowledge library worker dependency install failed.' }
}
if (Test-Path -LiteralPath (Join-Path $flat 'node_modules\ts-node\package.json')) {
    & $pnpm --dir $flat install --prod --frozen-lockfile --ignore-scripts
    if ($LASTEXITCODE -ne 0) { throw 'Production dependency pruning failed.' }
}
New-Item -ItemType Directory -Force -Path (Join-Path $flat 'prisma') | Out-Null
Copy-Item -LiteralPath 'prisma\schema.prisma' -Destination (Join-Path $flat 'prisma\schema.prisma') -Force
& $node (Join-Path $flat 'node_modules\prisma\build\index.js') generate --schema (Join-Path $flat 'prisma\schema.prisma')
if ($LASTEXITCODE -ne 0) { throw 'Prisma Client generation failed.' }

$stage = Join-Path $root 'build\windows-stage'
if (Test-Path -LiteralPath $stage) {
    $resolvedStage = (Resolve-Path -LiteralPath $stage).Path
    $resolvedBuild = (Resolve-Path -LiteralPath (Join-Path $root 'build')).Path
    if (!$resolvedStage.StartsWith($resolvedBuild + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe staging path.' }
    Remove-Item -LiteralPath $stage -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $stage | Out-Null
Copy-Item -LiteralPath 'package.json' -Destination $stage -Force
@(
    'module.exports = {'
    '  devIndicators: false,'
    "  serverExternalPackages: ['@prisma/client', 'bcryptjs'],"
    '};'
) | Set-Content -LiteralPath (Join-Path $stage 'next.config.js') -Encoding UTF8
Copy-Item -LiteralPath 'installer\launch.ps1' -Destination $stage -Force
Copy-Item -LiteralPath 'installer\bootstrap-admin.js' -Destination $stage -Force
& $node 'installer\compile-sync-worker.js' $stage
if ($LASTEXITCODE -ne 0) { throw 'Knowledge library worker compilation failed.' }
Copy-Item -LiteralPath 'src\app\favicon.ico' -Destination (Join-Path $stage 'app.ico') -Force
New-Item -ItemType Directory -Force -Path (Join-Path $stage 'runtime'), (Join-Path $stage 'prisma'), (Join-Path $stage 'public'), (Join-Path $stage '.next') | Out-Null
Copy-Item -LiteralPath $node -Destination (Join-Path $stage 'runtime\node.exe') -Force
Copy-Item -LiteralPath 'prisma\schema.prisma' -Destination (Join-Path $stage 'prisma\schema.prisma') -Force
Copy-Item -LiteralPath 'prisma\migrations' -Destination (Join-Path $stage 'prisma') -Recurse -Force

function Copy-Tree($source, $destination, $excludeDirectories = @()) {
    $args = @($source, $destination, '/E', '/R:1', '/W:1', '/NFL', '/NDL', '/NJH', '/NJS', '/NC', '/NS', '/XF', '*.map')
    if ($excludeDirectories.Count) { $args += '/XD'; $args += $excludeDirectories }
    & robocopy @args | Out-Null
    if ($LASTEXITCODE -gt 7) { throw "Copy failed: $source" }
}
Copy-Tree (Join-Path $root '.next') (Join-Path $stage '.next') @('cache', 'standalone', 'dev', 'diagnostics')
Copy-Tree (Join-Path $root 'public') (Join-Path $stage 'public') @('uploads')

$database = Join-Path $stage 'prisma\app.db'
$python = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
if (!(Test-Path -LiteralPath $python)) { throw 'Python 3 is required to create an empty release database.' }
& $python 'installer\create-blank-db.py' 'prisma\dev.db' $database
if ($LASTEXITCODE -ne 0) { throw 'Fresh database creation failed.' }

& $inno '/Q' (Join-Path $root 'installer\app.iss')
if ($LASTEXITCODE -ne 0) { throw 'Installer compilation failed.' }
Write-Output (Join-Path $root 'build\windows-installer\AiNotebook-Setup-1.9.7-x64.exe')
