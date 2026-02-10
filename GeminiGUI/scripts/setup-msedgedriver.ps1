# Download msedgedriver for Tauri E2E testing
# This script downloads the latest stable msedgedriver and places it in the project

$ErrorActionPreference = "Stop"

$driverDir = Join-Path (Join-Path $PSScriptRoot "..") "drivers"
$driverPath = Join-Path $driverDir "msedgedriver.exe"

if (Test-Path $driverPath) {
    Write-Host "msedgedriver.exe already exists at $driverPath"
    exit 0
}

New-Item -ItemType Directory -Path $driverDir -Force | Out-Null

# Get latest stable Edge version
Write-Host "Fetching latest stable Edge version..."
$versionUrl = "https://msedgedriver.azureedge.net/LATEST_STABLE"
try {
    $version = (Invoke-WebRequest -Uri $versionUrl -UseBasicParsing).Content.Trim()
} catch {
    # Fallback: try the Microsoft API
    $versionUrl = "https://edgeupdates.microsoft.com/api/products"
    try {
        $products = Invoke-RestMethod -Uri $versionUrl
        $stable = $products | Where-Object { $_.Product -eq "Stable" } | Select-Object -First 1
        $version = $stable.Releases | Where-Object { $_.Platform -eq "Windows" -and $_.Architecture -eq "x64" } | Select-Object -First 1 -ExpandProperty ProductVersion
    } catch {
        Write-Host "Could not determine Edge version. Using fallback version."
        $version = "131.0.2903.86"
    }
}

Write-Host "Edge version: $version"

# Download msedgedriver
$arch = if ([Environment]::Is64BitOperatingSystem) { "win64" } else { "win32" }
$downloadUrl = "https://msedgedriver.azureedge.net/$version/edgedriver_$arch.zip"
$zipPath = Join-Path $env:TEMP "edgedriver.zip"

Write-Host "Downloading from $downloadUrl..."
try {
    Invoke-WebRequest -Uri $downloadUrl -OutFile $zipPath -UseBasicParsing
} catch {
    Write-Error "Failed to download msedgedriver: $_"
    exit 1
}

Write-Host "Extracting..."
Expand-Archive -Path $zipPath -DestinationPath $driverDir -Force
Remove-Item $zipPath -Force

# Rename if needed
$extracted = Join-Path $driverDir "msedgedriver.exe"
if (-not (Test-Path $extracted)) {
    $found = Get-ChildItem -Path $driverDir -Filter "msedgedriver.exe" -Recurse | Select-Object -First 1
    if ($found) {
        Move-Item $found.FullName $extracted -Force
    }
}

if (Test-Path $extracted) {
    Write-Host "msedgedriver.exe installed at: $extracted"
} else {
    Write-Error "msedgedriver.exe not found after extraction"
    exit 1
}
