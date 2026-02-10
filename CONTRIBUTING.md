# Kontrybucja do GeminiHydra

Witaj w Szkole Wilka! Cieszymy się, że chcesz pomóc w rozwoju GeminiHydra.

## Standardy Deweloperskie

### 1. TypeScript (Core Engine)
- **Target:** ES2022, moduły NodeNext.
- **Styl:** camelCase dla zmiennych i funkcji, PascalCase dla klas i typów.
- **Bezpieczeństwo:** Zawsze używaj `try/catch` przy operacjach zewnętrznych (HTTP, IO).
- **Typy:** Strict mode. Unikaj `any` - używaj `unknown` z type narrowing.
- **Importy:** ES Module syntax (`import/export`), z rozszerzeniem `.js` w ścieżkach.
- **Linting:** Biome (`npm run lint`). Przed commitem uruchamia się automatycznie via Husky + lint-staged.

### 2. React (GUI)
- **Komponenty:** Funkcyjne + TypeScript.
- **Stan:** Zustand (`useAppStore`). Unikaj `Context API` dla stanu globalnego.
- **UI:** TailwindCSS. Używaj klas narzędziowych, nie twórz plików `.css` chyba że to absolutnie konieczne.
- **Fetching:** React Query (`@tanstack/react-query`) dla zapytań asynchronicznych.

### 3. Rust (Tauri Backend)
- **Bezpieczeństwo:** Nigdy nie wykonuj komend systemowych bezpośrednio z user input. Używaj allowlisty w `lib.rs`.
- **Async:** Wszystkie komendy Tauri muszą być `async`.

## Dodawanie Nowego Agenta

1.  Otwórz `src/swarm/agents/definitions.ts`.
2.  Dodaj nowy wpis do obiektu `AGENT_SPECS` z odpowiednim `tier` (commander/coordinator/executor).
3.  Zdefiniuj `persona`, `focus` i `skills` agenta.
4.  Zaktualizuj typy w `src/types/swarm.ts` (dodaj nową rolę do `AgentRole`).
5.  Zaktualizuj `README.md`, `GEMINI.md` i `ARCHITECTURE.md`.

## Workflow Deweloperski

```bash
# Instalacja zależności
npm install

# Build projektu
npm run build

# Uruchomienie testów
npm test

# Uruchomienie lintingu
npm run lint

# Auto-fix linting
npm run lint:fix

# Formatowanie kodu
npm run format

# Watch mode (dev)
npm run dev

# Testy GUI
cd GeminiGUI
npm test

# GUI Dev Server
cd GeminiGUI
npm run tauri:dev
```

## Testowanie

Projekt posiada infrastrukturę testową na wielu poziomach:

### Unit/Integration Tests (Vitest)
```bash
# Core tests
npm test

# Watch mode
npm run test:watch

# GUI tests
cd GeminiGUI
npm test
```

### E2E Tests (Playwright)
```bash
cd GeminiGUI
npx playwright test
```

Przed wysłaniem PR upewnij się, że:
1. `npm run build` przechodzi bez błędów.
2. `npm test` - wszystkie testy przechodzą.
3. `npm run lint` - brak ostrzeżeń lintingu.

## Zgłaszanie Błędów

Używaj GitHub Issues. Opisując błąd, dołącz:
- Wersję Node.js (`node --version`)
- Output z konsoli (błędy, stack trace)
- Kroki do reprodukcji

Powodzenia na Szlaku!
