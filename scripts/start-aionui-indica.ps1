param(
    [string]$IndicaProjectPath = "C:\Users\Satyam\Desktop\codex projects\Project 3",
    [string]$AionUiPath = "C:\Users\Satyam\Desktop\codex projects\AionUi"
)

$ErrorActionPreference = "Stop"

$indicaExe = Join-Path $IndicaProjectPath "Assistant.App\bin\Debug\net10.0-windows10.0.19041.0\Assistant.App.exe"
$gatewayStatePath = Join-Path $env:LOCALAPPDATA "IndicaAI\native-gateway.json"
$gatewayTokenPath = Join-Path $env:LOCALAPPDATA "IndicaAI\native-gateway-token.txt"
$extensionPath = Join-Path $AionUiPath "extensions"

if (-not (Test-Path -LiteralPath $indicaExe)) {
    throw "Indica executable was not found: $indicaExe. Build Project 3 first."
}

if (-not (Get-Process -Name Assistant.App -ErrorAction SilentlyContinue)) {
    Start-Process -FilePath $indicaExe -WorkingDirectory (Split-Path $indicaExe -Parent) -WindowStyle Hidden
    Start-Sleep -Seconds 3
}

if (-not (Test-Path -LiteralPath $gatewayStatePath)) {
    throw "Indica gateway state file was not found: $gatewayStatePath. Restart Indica and try again."
}

if (-not (Test-Path -LiteralPath $gatewayTokenPath)) {
    throw "Indica gateway token file was not found: $gatewayTokenPath. Restart Indica and try again."
}

$gatewayState = Get-Content -LiteralPath $gatewayStatePath -Raw | ConvertFrom-Json
$token = (Get-Content -LiteralPath $gatewayTokenPath -Raw).Trim()

if ([string]::IsNullOrWhiteSpace($gatewayState.mcpUrl)) {
    throw "Indica gateway state did not include mcpUrl."
}

$env:AIONUI_EXTENSIONS_PATH = $extensionPath
$env:INDICA_GATEWAY_MCP_URL = [string]$gatewayState.mcpUrl
$env:INDICA_GATEWAY_TOKEN = $token

Write-Host "Starting native AionUi with Indica extension..."
Write-Host "AIONUI_EXTENSIONS_PATH=$env:AIONUI_EXTENSIONS_PATH"
Write-Host "INDICA_GATEWAY_MCP_URL=$env:INDICA_GATEWAY_MCP_URL"

Set-Location -LiteralPath $AionUiPath

if (Get-Command bun -ErrorAction SilentlyContinue) {
    bun run start
    exit $LASTEXITCODE
}

if (Get-Command npm -ErrorAction SilentlyContinue) {
    npm run start
    exit $LASTEXITCODE
}

throw "Neither bun nor npm is available on PATH. Install Bun or Node.js/npm to run AionUi from source."
