# Agenci HYDRA - Witcher Team

## Przegląd

HYDRA wykorzystuje 12 wyspecjalizowanych agentów AI, każdy z unikalnymi zdolnościami i rolami. Agenci są inspirowani postaciami z uniwersum Wiedźmina.

## Lista Agentów

### 1. Geralt of Rivia (Koordynator/Bezpieczeństwo)

```
Tytuł: The White Wolf
Model: llama3.2:3b
Specjalizacja: security
```

**Możliwości:**
- Audyt bezpieczeństwa
- Wykrywanie zagrożeń
- Koordynacja multi-agentowa
- Podejmowanie decyzji

**Prompt systemowy:**
> "Jesteś Geraltem z Rivii, Białym Wilkiem. Jako główny koordynator, prowadzisz analizę bezpieczeństwa, podejmujesz krytyczne decyzje i zapewniasz jakość wszystkich wyników."

---

### 2. Yennefer of Vengerberg (Architekt Systemów)

```
Tytuł: The Sorceress
Model: phi3:mini
Specjalizacja: architecture
```

**Możliwości:**
- Projektowanie systemów
- Przegląd architektury
- Analiza skalowalności
- Projektowanie API i baz danych

---

### 3. Triss Merigold (QA Lead)

```
Tytuł: The Healer
Model: qwen2.5-coder:1.5b
Specjalizacja: testing
```

**Możliwości:**
- Testy jednostkowe
- Testy integracyjne
- Testy E2E
- Automatyzacja testów

---

### 4. Jaskier (Dokumentalista)

```
Tytuł: The Bard
Model: llama3.2:3b
Specjalizacja: documentation
```

**Możliwości:**
- Dokumentacja techniczna
- Dokumentacja API
- Poradniki użytkownika
- Changelogi

---

### 5. Vesemir (Senior Code Reviewer)

```
Tytuł: The Elder
Model: phi3:mini
Specjalizacja: code_review
```

**Możliwości:**
- Przegląd kodu
- Egzekwowanie best practices
- Refaktoryzacja
- Mentoring

---

### 6. Ciri (Performance Optimizer)

```
Tytuł: The Elder Blood
Model: llama3.2:1b
Specjalizacja: performance
```

**Możliwości:**
- Optymalizacja wydajności
- Caching
- Profilowanie
- Szybkie zadania

---

### 7. Eskel (DevOps Engineer)

```
Tytuł: The Reliable
Model: llama3.2:3b
Specjalizacja: devops
```

**Możliwości:**
- Deployment
- CI/CD
- Docker/Kubernetes
- Monitoring

---

### 8. Lambert (Debug Specialist)

```
Tytuł: The Sharp-Tongued
Model: qwen2.5-coder:1.5b
Specjalizacja: debugging
```

**Możliwości:**
- Debugowanie
- Obsługa błędów
- Analiza stack trace
- Wykrywanie memory leaks

---

### 9. Zoltan Chivay (Data Engineer)

```
Tytuł: The Dwarf
Model: phi3:mini
Specjalizacja: data
```

**Możliwości:**
- Przetwarzanie danych
- Walidacja danych
- Migracje danych
- Optymalizacja SQL

---

### 10. Emiel Regis (Research Analyst)

```
Tytuł: The Philosopher
Model: phi3:mini
Specjalizacja: research
```

**Możliwości:**
- Badania
- Głęboka analiza
- Synteza wiedzy
- Rozpoznawanie wzorców

---

### 11. Sigismund Dijkstra (Strategic Planner)

```
Tytuł: The Spymaster
Model: llama3.2:3b
Specjalizacja: planning
```

**Możliwości:**
- Planowanie strategiczne
- Dekompozycja zadań
- Alokacja zasobów
- Ocena ryzyka

---

### 12. Philippa Eilhart (API Specialist)

```
Tytuł: The Mastermind
Model: llama3.2:3b
Specjalizacja: api
```

**Możliwości:**
- Rozwój API
- REST/GraphQL
- Bezpieczeństwo API
- Webhooks

## Użycie Agentów

```javascript
import { getAgentQueue, enqueueToSpecificAgent } from './prompt-queue.js';

// Enqueue do konkretnego agenta
enqueueToSpecificAgent('Geralt', 'Przeanalizuj bezpieczeństwo kodu', {
  priority: Priority.HIGH
});

// Enqueue z wyborem po roli
enqueueToAgents('Napisz testy', {
  role: 'tester' // Triss zajmie się tym
});

// Batch distributed
enqueueBatchDistributed([
  'Zadanie 1',
  'Zadanie 2',
  'Zadanie 3'
]); // Rozdzieli między wszystkich aktywnych agentów
```

## Metryki Agentów

```javascript
const metrics = getAgentMetrics();

// Per-agent metrics
console.log(metrics.perAgent.Geralt.successRate);
console.log(metrics.perAgent.Geralt.averageResponseTime);
console.log(metrics.perAgent.Geralt.throughput);

// Summary
console.log(metrics.summary.activeAgents);
console.log(metrics.summary.totalThroughput);
```

## Zarządzanie Agentami

```javascript
// Pauza agenta
pauseAgentQueue('Lambert');

// Wznowienie agenta
resumeAgentQueue('Lambert');

// Wyłączenie agenta
getAgentQueue().offlineAgent('Ciri');

// Status kanału
const status = getAgentChannel('Geralt').getStatus();
```
