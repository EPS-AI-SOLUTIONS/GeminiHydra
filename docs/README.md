# HYDRA - Multi-Agent AI Orchestration Platform

## Przegląd

HYDRA (Holistic Yielding Dynamic Resource Allocator) to zaawansowana platforma orkiestracji AI oparta na wieloagentowej architekturze. Wykorzystuje lokalne modele Ollama oraz opcjonalnie Google Gemini API do wykonywania złożonych zadań programistycznych.

## Kluczowe Funkcje

- **12 Specjalizowanych Agentów** - Zespół agentów inspirowanych postaciami z Wiedźmina
- **Protokół MCP** - Obowiązkowa komunikacja przez Model Context Protocol
- **System Kolejkowania** - Zaawansowane zarządzanie priorytetami i load balancing
- **Pamięć Trwała** - System pamięci oparty na plikach Markdown
- **Multi-Backend** - Wsparcie dla Ollama (lokalnie) i Gemini (chmura)

## Szybki Start

```bash
# Instalacja zależności
npm install

# Uruchomienie z Ollama
npm start

# Uruchomienie testów
npm test
```

## Wymagania

- Node.js 18+
- Ollama (lokalny runtime LLM)
- Opcjonalnie: Google Gemini API key

## Struktura Projektu

```
GeminiCLI/
├── src/
│   ├── cli/              # Interfejs linii poleceń
│   ├── hydra/            # System wieloagentowy HYDRA
│   ├── tools/            # Narzędzia MCP
│   ├── config.js         # Konfiguracja z walidacją Zod
│   ├── constants.js      # Stałe i definicje agentów
│   ├── prompt-queue.js   # System kolejkowania
│   └── system-prompt.js  # Prompty systemowe
├── docs/                 # Dokumentacja
├── tests/                # Testy jednostkowe i integracyjne
└── prompts/              # Szablony promptów
```

## Agenci HYDRA

| Agent | Rola | Specjalizacja |
|-------|------|---------------|
| Geralt | Koordynator | Bezpieczeństwo |
| Yennefer | Architekt | Architektura systemów |
| Triss | QA Lead | Testowanie |
| Jaskier | Dokumentalista | Dokumentacja |
| Vesemir | Code Reviewer | Przegląd kodu |
| Ciri | Optymalizator | Wydajność |
| Eskel | DevOps | Infrastruktura |
| Lambert | Debugger | Debugowanie |
| Zoltan | Data Engineer | Dane |
| Regis | Researcher | Badania |
| Dijkstra | Planer | Planowanie |
| Philippa | API Specialist | API |

## Dokumentacja

- [Architektura](./ARCHITECTURE.md)
- [API](./API.md)
- [Konfiguracja](./CONFIGURATION.md)
- [Bezpieczeństwo](./SECURITY.md)
- [Narzędzia](./TOOLS.md)
- [Agenci](./AGENTS.md)
- [HYDRA](./HYDRA.md)
- [CLI](./CLI.md)
- [MCP](./MCP.md)

## Licencja

MIT License
