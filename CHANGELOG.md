# Changelog

## [Unreleased]
- Dodano konfigurację, logger i narzędzia diagnostyczne.
- Przeniesiono definicje narzędzi do osobnego modułu.
- Dodano szyfrowanie cache (AES-256-GCM).
- Ustawiono AI handler jako domyślny handler kolejki przy starcie.
- Dodano walidację ENV, obsługę dotenv i schematów narzędzi.
- Dodano limity rozmiaru cache i cykliczne sprzątanie.
- Dodano retry/timeout dla pobierania modeli Gemini.
- Dodano limity długości promptów i obsługę allowlist/denylist modeli.
- Dodano opcjonalną persystencję kolejki.
