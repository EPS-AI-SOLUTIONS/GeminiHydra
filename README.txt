================================================================================
                    CLAUDE CODE PORTABLE v2.1.12
================================================================================

Wersja portable Claude CLI zainstalowana w tym folderze.

WYMAGANIA:
-----------
- Node.js 18.0 lub nowszy (musi byc w PATH)
- Klucz API Anthropic (do skonfigurowania przy pierwszym uruchomieniu)

STRUKTURA FOLDEROW:
-------------------
ClaudeCLI/
  |- claude.cmd      -> Uruchom w CMD
  |- claude.ps1      -> Uruchom w PowerShell
  |- bin/            -> Pliki programu
  |   |- claude-code/
  |- config/         -> Konfiguracja portable (klucz API, ustawienia)
  |   |- .claude/
  |- data/           -> Dane tymczasowe

JAK URUCHOMIC:
--------------
PowerShell:
  .\claude.ps1

CMD:
  claude.cmd

Lub bezposrednio:
  node bin\claude-code\cli.js

KONFIGURACJA:
-------------
Przy pierwszym uruchomieniu:
1. Uruchom claude.ps1 lub claude.cmd
2. Podaj klucz API Anthropic gdy zostaniesz poproszony
3. Konfiguracja zostanie zapisana w folderze config\.claude

PRZENOSZENIE:
-------------
Caly folder ClaudeCLI mozesz przeniesc w dowolne miejsce.
Konfiguracja i dane sa przechowywane lokalnie w tym folderze.

WIECEJ INFORMACJI:
------------------
https://code.claude.com/docs/en/setup

================================================================================
