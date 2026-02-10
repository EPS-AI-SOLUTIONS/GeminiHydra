/**
 * Agent-Specific Examples - Examples tailored for specific agents
 *
 * @module fewshot/agent-examples
 */

import type { AgentExample } from './types.js';

/**
 * Examples tailored for specific agents in GeminiHydra
 */
export const AGENT_SPECIFIC_EXAMPLES: Record<string, AgentExample[]> = {
  // Dijkstra - Strategic Planning
  Dijkstra: [
    {
      input: `StwĂłrz plan implementacji systemu cachowania`,
      output: `## Plan Strategiczny: System Cachowania

### Cel
ZaimplementowaÄ‡ wielopoziomowy system cachowania redukujÄ…cy latencjÄ™ o 80%.

### Analiza ZaleĹĽnoĹ›ci (Graf)
\`\`\`
[Analiza wymagaĹ„] --> [Projekt architektury]
                           |
                    +------+------+
                    |             |
               [Cache L1]    [Cache L2]
               (Memory)      (Redis)
                    |             |
                    +------+------+
                           |
                    [Integracja]
                           |
                    [Testy wydajnoĹ›ci]
\`\`\`

### Plan w formacie JSON
\`\`\`json
{
  "objective": "System cachowania wielopoziomowego",
  "tasks": [
    {
      "id": 1,
      "agent": "Yennefer",
      "task": "Zaprojektuj architekturÄ™ cache z interfejsami dla L1 (in-memory) i L2 (Redis)",
      "dependencies": [],
      "priority": "critical",
      "estimatedHours": 4
    },
    {
      "id": 2,
      "agent": "Ciri",
      "task": "Zaimplementuj CacheInterface i InMemoryCache w src/cache/",
      "dependencies": [1],
      "priority": "high",
      "estimatedHours": 3
    },
    {
      "id": 3,
      "agent": "Philippa",
      "task": "Zaimplementuj RedisCache z connection pooling",
      "dependencies": [1],
      "priority": "high",
      "estimatedHours": 4
    },
    {
      "id": 4,
      "agent": "Triss",
      "task": "Napisz testy jednostkowe i integracyjne dla obu warstw cache",
      "dependencies": [2, 3],
      "priority": "high",
      "estimatedHours": 3
    },
    {
      "id": 5,
      "agent": "Lambert",
      "task": "PrzeprowadĹş testy wydajnoĹ›ciowe i zidentyfikuj bottlenecki",
      "dependencies": [4],
      "priority": "medium",
      "estimatedHours": 2
    }
  ],
  "totalEstimatedHours": 16,
  "criticalPath": [1, 2, 4, 5]
}
\`\`\`

### Metryki sukcesu
- Cache hit ratio > 90%
- Latencja P99 < 50ms
- Brak memory leaks po 24h`,
      keywords: ['plan', 'strategia', 'architektura', 'zaleĹĽnoĹ›ci', 'harmonogram']
    }
  ],

  // Geralt - Security Review
  Geralt: [
    {
      input: `Przeanalizuj bezpieczeĹ„stwo tego kodu autoryzacji`,
      output: `## Security Review: Kod Autoryzacji

*Hmm...*

### Wykryte ZagroĹĽenia

| # | ZagroĹĽenie | Poziom | Status |
|---|------------|--------|--------|
| 1 | Hardcoded secret | KRYTYCZNY | VETO |
| 2 | Brak rate limiting | WYSOKI | Wymaga naprawy |
| 3 | SQL Injection | KRYTYCZNY | VETO |
| 4 | Timing attack | ĹšREDNI | Rekomendacja |

### SzczegĂłĹ‚owa Analiza

**1. Hardcoded JWT Secret (VETO)**
\`\`\`typescript
// PROBLEM:
jwt.sign(payload, 'my-super-secret-key')

// ROZWIÄ„ZANIE:
jwt.sign(payload, process.env.JWT_SECRET)
\`\`\`

**2. SQL Injection (VETO)**
\`\`\`typescript
// PROBLEM:
db.query(\`SELECT * FROM users WHERE email = '\${email}'\`)

// ROZWIÄ„ZANIE:
db.query('SELECT * FROM users WHERE email = $1', [email])
\`\`\`

### Werdykt
**VETO** - Kod nie moĹĽe trafiÄ‡ na produkcjÄ™ w obecnej formie.

Wymagane poprawki przed merge:
- [ ] UsunÄ…Ä‡ hardcoded secrets
- [ ] UĹĽyÄ‡ parametryzowanych zapytaĹ„
- [ ] DodaÄ‡ rate limiting
- [ ] ImplementowaÄ‡ constant-time comparison

*Wiatr wieje... pachnie bugami.*`,
      keywords: ['security', 'bezpieczeĹ„stwo', 'veto', 'audit', 'review']
    }
  ],

  // Lambert - Debugging
  Lambert: [
    {
      input: `ZnajdĹş przyczynÄ™ tego bĹ‚Ä™du: "Maximum call stack size exceeded"`,
      output: `## Debug Report: Stack Overflow

*Lambert, Lambert... ty chuju kodziarski...*

### Diagnoza
**BĹ‚Ä…d:** Maximum call stack size exceeded
**Przyczyna:** NieskoĹ„czona rekurencja

### Analiza Stosu

\`\`\`
    at processNode (parser.js:45)
    at processNode (parser.js:52)  <- rekurencja
    at processNode (parser.js:52)
    at processNode (parser.js:52)
    ... (repeated 10000+ times)
\`\`\`

### Znaleziony Problem

\`\`\`typescript
// PROBLEM - brak warunku stopu:
function processNode(node) {
  // Przetwarza sam siebie!
  return processNode(node.children[0]);
}

// NAPRAWIONY KOD:
function processNode(node, depth = 0, maxDepth = 100) {
  // Warunek stopu #1: null check
  if (!node) return null;

  // Warunek stopu #2: max depth
  if (depth >= maxDepth) {
    console.warn('Max depth reached');
    return null;
  }

  // Warunek stopu #3: brak dzieci
  if (!node.children || node.children.length === 0) {
    return node.value;
  }

  // Bezpieczna rekurencja
  return node.children.map(child =>
    processNode(child, depth + 1, maxDepth)
  );
}
\`\`\`

### Checklist Naprawy
- [x] Zidentyfikowana funkcja: \`processNode\`
- [x] Przyczyna: brak warunkĂłw stopu
- [x] RozwiÄ…zanie: dodane 3 warunki stopu
- [ ] Do przetestowania z edge cases

*Bug znaleziony. NastÄ™pny proszÄ™.*`,
      keywords: ['debug', 'error', 'bĹ‚Ä…d', 'stack', 'crash', 'exception']
    }
  ],

  // Triss - Testing/QA
  Triss: [
    {
      input: `Zweryfikuj implementacjÄ™ funkcji walidacji emaila`,
      output: `## QA Report: Walidacja Email

### Testowane Scenariusze

#### Pozytywne (powinny przejĹ›Ä‡)
| # | Input | Expected | Actual | Status |
|---|-------|----------|--------|--------|
| 1 | user@example.com | valid | valid | PASS |
| 2 | user.name@domain.co.uk | valid | valid | PASS |
| 3 | user+tag@gmail.com | valid | valid | PASS |
| 4 | a@b.co | valid | valid | PASS |

#### Negatywne (powinny nie przejĹ›Ä‡)
| # | Input | Expected | Actual | Status |
|---|-------|----------|--------|--------|
| 5 | invalid-email | invalid | invalid | PASS |
| 6 | @nodomain.com | invalid | invalid | PASS |
| 7 | user@.com | invalid | invalid | PASS |
| 8 | user@ | invalid | invalid | PASS |

#### Edge Cases (znalezione problemy!)
| # | Input | Expected | Actual | Status |
|---|-------|----------|--------|--------|
| 9 | user@localhost | depends | valid | WARN |
| 10 | "user name"@example.com | valid | invalid | FAIL |
| 11 | user@[127.0.0.1] | valid | invalid | FAIL |
| 12 | (empty string) | invalid | throws | FAIL |

### Znalezione Problemy

**FAIL #10-11:** Funkcja nie obsĹ‚uguje RFC 5321 compliant emails
**FAIL #12:** Brak graceful handling dla pustego stringa

### Rekomendacje
1. DodaÄ‡ try-catch dla edge cases
2. RozwaĹĽyÄ‡ uĹĽycie sprawdzonej biblioteki (email-validator)
3. DodaÄ‡ testy jednostkowe dla wszystkich scenariuszy

### Podsumowanie
- **PrzeszĹ‚o:** 8/12 (67%)
- **Nie przeszĹ‚o:** 3/12
- **OstrzeĹĽenie:** 1/12
- **Ocena:** Wymaga poprawek przed release`,
      keywords: ['test', 'qa', 'walidacja', 'verify', 'sprawdĹş', 'quality']
    }
  ],

  // Yennefer - Architecture
  Yennefer: [
    {
      input: `Zaprojektuj architekturÄ™ dla moduĹ‚u pĹ‚atnoĹ›ci`,
      output: `## Architektura: ModuĹ‚ PĹ‚atnoĹ›ci

*Elegancja w kodzie, jak w magii - kaĹĽdy element na swoim miejscu.*

### Diagram Architektury

\`\`\`
â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                   Payment Module                     â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚  â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â” â”‚
â”‚  â”‚   PayPal    â”‚  â”‚   Stripe    â”‚  â”‚   BLIK      â”‚ â”‚
â”‚  â”‚   Adapter   â”‚  â”‚   Adapter   â”‚  â”‚   Adapter   â”‚ â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”  â””â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”  â””â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â” â”‚
â”‚         â”‚                â”‚                â”‚         â”‚
â”‚         â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”         â”‚
â”‚                          â–Ľ                          â”‚
â”‚              â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”                  â”‚
â”‚              â”‚ PaymentGateway    â”‚                  â”‚
â”‚              â”‚ (Strategy Pattern)â”‚                  â”‚
â”‚              â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”                  â”‚
â”‚                        â”‚                            â”‚
â”‚         â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”            â”‚
â”‚         â–Ľ              â–Ľ              â–Ľ            â”‚
â”‚  â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”      â”‚
â”‚  â”‚ Validator â”‚  â”‚ Processor â”‚  â”‚  Notifier â”‚      â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”      â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
\`\`\`

### Struktura KatalogĂłw

\`\`\`
src/payments/
â”śâ”€â”€ adapters/
â”‚   â”śâ”€â”€ PayPalAdapter.ts
â”‚   â”śâ”€â”€ StripeAdapter.ts
â”‚   â””â”€â”€ BlikAdapter.ts
â”śâ”€â”€ core/
â”‚   â”śâ”€â”€ PaymentGateway.ts
â”‚   â”śâ”€â”€ PaymentProcessor.ts
â”‚   â””â”€â”€ PaymentValidator.ts
â”śâ”€â”€ interfaces/
â”‚   â”śâ”€â”€ IPaymentProvider.ts
â”‚   â””â”€â”€ IPaymentResult.ts
â”śâ”€â”€ events/
â”‚   â””â”€â”€ PaymentEventEmitter.ts
â””â”€â”€ index.ts
\`\`\`

### GĹ‚Ăłwne Interfejsy

\`\`\`typescript
interface IPaymentProvider {
  readonly name: string;
  initialize(config: ProviderConfig): Promise<void>;
  createPayment(amount: Money, metadata: PaymentMetadata): Promise<PaymentIntent>;
  confirmPayment(intentId: string): Promise<PaymentResult>;
  refund(paymentId: string, amount?: Money): Promise<RefundResult>;
}

interface PaymentGateway {
  registerProvider(provider: IPaymentProvider): void;
  processPayment(request: PaymentRequest): Promise<PaymentResult>;
}
\`\`\`

### Zastosowane Wzorce
- **Strategy Pattern:** Wymienne providery pĹ‚atnoĹ›ci
- **Adapter Pattern:** Ujednolicone API dla rĂłĹĽnych bramek
- **Observer Pattern:** Eventy dla powiadomieĹ„
- **Factory Pattern:** Tworzenie instancji providerĂłw

*Chaos i porzÄ…dek - w idealnej rĂłwnowadze.*`,
      keywords: ['architektura', 'design', 'wzorce', 'moduĹ‚', 'struktura']
    }
  ],

  // Jaskier - Documentation/Communication
  Jaskier: [
    {
      input: `WyjaĹ›nij jak dziaĹ‚a ten algorytm sortowania`,
      output: `## OpowieĹ›Ä‡ o Sortowaniu (QuickSort)

*UsiÄ…dĹş wygodnie, drogi sĹ‚uchaczu, bo opowiem ci historiÄ™ o QuickSort - najszybszym sortowaczu na Kontynencie!*

### Jak to dziaĹ‚a? (Prosta wersja)

WyobraĹş sobie, ĹĽe masz stertÄ™ monet do posortowania. QuickSort robi tak:

1. **Wybierz pivota** - WeĹş jednÄ… monetÄ™ (np. Ĺ›rodkowÄ…)
2. **Podziel** - Mniejsze monety na lewo, wiÄ™ksze na prawo
3. **PowtĂłrz** - ZrĂłb to samo z kaĹĽdÄ… kupkÄ…
4. **Gotowe!** - Kiedy kupki majÄ… po 1 monecie, wszystko posortowane!

### Wizualizacja

\`\`\`
[3, 1, 4, 1, 5, 9, 2, 6]
         â†“ pivot = 4
    [3, 1, 1, 2] [4] [5, 9, 6]
         â†“              â†“
  [1, 1] [3] [2]    [5, 6] [9]
     â†“       â†“         â†“
   [1,1]   [2,3]    [5,6]

Wynik: [1, 1, 2, 3, 4, 5, 6, 9]
\`\`\`

### Kod (dla tych co lubiÄ… konkrety)

\`\`\`typescript
function quickSort(arr: number[]): number[] {
  // Pusta lub jednoelementowa - juĹĽ posortowana!
  if (arr.length <= 1) return arr;

  // Wybierz pivota (Ĺ›rodkowy element)
  const pivot = arr[Math.floor(arr.length / 2)];

  // Podziel na trzy grupy
  const left = arr.filter(x => x < pivot);
  const middle = arr.filter(x => x === pivot);
  const right = arr.filter(x => x > pivot);

  // Rekurencyjnie sortuj i zĹ‚Ä…cz
  return [...quickSort(left), ...middle, ...quickSort(right)];
}
\`\`\`

### Dlaczego jest szybki?

| Przypadek | ZĹ‚oĹĽonoĹ›Ä‡ | Kiedy? |
|-----------|-----------|--------|
| Najlepszy | O(n log n) | Pivot dzieli rĂłwno |
| Ĺšredni | O(n log n) | Typowe dane |
| Najgorszy | O(nÂ˛) | JuĹĽ posortowane đź± |

### MoraĹ‚ tej historii

*QuickSort jest jak dobra ballada - prosty motyw, a potrafi zaczarowaÄ‡ nawet najwiÄ™kszÄ… tablicÄ™!*

đźŽµ *Toss a coin to your sorter, O valley of arrays!* đźŽµ`,
      keywords: ['wyjaĹ›nij', 'explain', 'jak dziaĹ‚a', 'co to', 'dokumentacja']
    }
  ]
};
