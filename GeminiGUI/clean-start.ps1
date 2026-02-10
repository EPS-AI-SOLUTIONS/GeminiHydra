# GeminiGUI Clean Start Script
# Uruchamia GUI w trybie deweloperskim

# UTF-8 Encoding Fix: Ensure Polish characters display correctly
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "=== GeminiGUI Clean Start ===" -ForegroundColor Cyan

# Ubij stary proces geminigui.exe (zapobiega "Odmowa dostepu" przy kompilacji)
$oldProc = Get-Process -Name "geminigui" -ErrorAction SilentlyContinue
if ($oldProc) {
    Write-Host "Zamykanie starego geminigui.exe (PID: $($oldProc.Id))..." -ForegroundColor Yellow
    $oldProc | Stop-Process -Force
    Start-Sleep -Milliseconds 500
} else {
    Write-Host "Brak starego procesu geminigui.exe" -ForegroundColor Green
}

# Sprawdz czy node_modules istnieje
if (-not (Test-Path "node_modules")) {
    Write-Host "Instalowanie zaleznosci..." -ForegroundColor Yellow
    npm install
}

# Wyczysc cache Vite
if (Test-Path "node_modules/.vite") {
    Write-Host "Czyszczenie cache Vite..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force "node_modules/.vite"
}

# Sprawdz i uwolnij port
function Free-Port($port) {
    Write-Host "Sprawdzanie portu $port... " -NoNewline
    $connections = netstat -ano | Select-String ":$port\s+.*LISTENING"
    if ($connections) {
        Write-Host "ZAJETY" -ForegroundColor Yellow
        $procIds = $connections | ForEach-Object {
            ($_.ToString().Trim() -split '\s+')[-1]
        } | Sort-Object -Unique
        foreach ($procId in $procIds) {
            if ([int]$procId -gt 4) {
                Write-Host "  -> Zamykanie procesu PID: $procId" -ForegroundColor Red
                taskkill /PID $procId /F 2>$null | Out-Null
            }
        }
        Start-Sleep -Milliseconds 500
    } else {
        Write-Host "WOLNY" -ForegroundColor Green
    }
}

Free-Port 1420
Free-Port 1421

# Sprawdz czy Rust/Cargo jest dostepny (wymagane dla Tauri)
$cargoAvailable = Get-Command cargo -ErrorAction SilentlyContinue
if ($cargoAvailable) {
    Write-Host "Uruchamianie Tauri (desktop + backend)..." -ForegroundColor Green
    npm run tauri:dev
} else {
    Write-Host "Cargo/Rust nie znaleziony - uruchamianie w trybie Web (bez backendu)..." -ForegroundColor Yellow
    npm run dev
}
