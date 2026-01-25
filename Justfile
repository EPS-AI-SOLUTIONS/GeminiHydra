# Justfile for GeminiHydra
set shell := ["powershell", "-c"]

# Uruchomienie CLI
run:
    .\gemini.ps1

# Uruchomienie GUI w trybie deweloperskim
dev:
    cd GeminiGUI; npm run tauri dev

# Budowanie GUI
build:
    cd GeminiGUI; npm run tauri build

# Instalacja zależności
install:
    .\setup-mcp.ps1
    cd GeminiGUI; npm install

# Czyszczenie (Windows safe)
clean:
    cd GeminiGUI; Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
    cd GeminiGUI; Remove-Item -Recurse -Force dist -ErrorAction SilentlyContinue
