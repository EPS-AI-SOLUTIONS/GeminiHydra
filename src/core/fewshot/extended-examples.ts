/**
 * Extended Few-Shot Examples - Example data by category
 *
 * Categories: debugging, testing, refactoring, api_design, security, performance, documentation
 *
 * @module fewshot/extended-examples
 */

import type { FewShotExample } from './types.js';

/**
 * Extended Few-Shot Examples for specialized task types
 */
export const EXTENDED_FEW_SHOT_EXAMPLES: Record<string, FewShotExample[]> = {
  // -------------------------------------------------------------------------
  // DEBUGGING - Przyklady debugowania
  // -------------------------------------------------------------------------
  debugging: [
    {
      input: `Zdebuguj blad "Cannot read property 'map' of undefined" w komponencie UserList.tsx`,
      output: `## Analiza bledu: Cannot read property 'map' of undefined

### 1. Diagnoza problemu
Blad wystepuje gdy probujemy wywolac .map() na wartosci ktora jest undefined.
To typowy problem przy:
- Asynchronicznym ladowaniu danych
- Pustej odpowiedzi z API
- Nieprawidlowej inicjalizacji stanu

### 2. Lokalizacja bledu
\`\`\`typescript
// PROBLEMATYCZNY KOD:
function UserList({ users }) {
  return (
    <ul>
      {users.map(user => <li key={user.id}>{user.name}</li>)}
    </ul>
  );
}
\`\`\`

### 3. Rozwiazanie
\`\`\`typescript
// NAPRAWIONY KOD:
interface User {
  id: number;
  name: string;
}

interface UserListProps {
  users?: User[];
  isLoading?: boolean;
  error?: Error | null;
}

function UserList({ users = [], isLoading = false, error = null }: UserListProps) {
  // Obsluga stanu ladowania
  if (isLoading) {
    return <div className="loading">Ladowanie uzytkownikow...</div>;
  }

  // Obsluga bledu
  if (error) {
    return <div className="error">Blad: {error.message}</div>;
  }

  // Obsluga pustej listy
  if (!users || users.length === 0) {
    return <div className="empty">Brak uzytkownikow do wyswietlenia</div>;
  }

  // Bezpieczne renderowanie listy
  return (
    <ul>
      {users.map(user => (
        <li key={user.id}>{user.name}</li>
      ))}
    </ul>
  );
}

export default UserList;
\`\`\`

### 4. Dodatkowe zabezpieczenia
- Dodano TypeScript interface dla props
- Domyslna wartosc dla users = []
- Obsluga stanow loading/error
- Walidacja przed .map()

### 5. Zapobieganie w przyszlosci
- Uzywaj Optional Chaining: \`users?.map()\`
- Inicjalizuj state jako pusta tablica: \`useState<User[]>([])\`
- Dodaj TypeScript strict mode`,
      keywords: ['debug', 'undefined', 'map', 'error', 'blad', 'cannot read', 'property', 'crash', 'exception'],
      effectiveness: 0.92
    },
    {
      input: `Znajdz przyczyne memory leak w aplikacji React - rosnie zuzycie pamieci`,
      output: `## Diagnoza Memory Leak w React

### 1. Typowe przyczyny memory leak

**A. Nieusuniete event listenery:**
\`\`\`typescript
// PROBLEM:
useEffect(() => {
  window.addEventListener('resize', handleResize);
  // Brak cleanup!
}, []);

// ROZWIAZANIE:
useEffect(() => {
  window.addEventListener('resize', handleResize);
  return () => window.removeEventListener('resize', handleResize);
}, []);
\`\`\`

**B. Nieusuniete timery/intervaly:**
\`\`\`typescript
// PROBLEM:
useEffect(() => {
  const interval = setInterval(fetchData, 5000);
  // Brak cleanup!
}, []);

// ROZWIAZANIE:
useEffect(() => {
  const interval = setInterval(fetchData, 5000);
  return () => clearInterval(interval);
}, []);
\`\`\`

**C. Nieusuniete subskrypcje:**
\`\`\`typescript
// PROBLEM:
useEffect(() => {
  const subscription = dataStream.subscribe(handleData);
  // Brak cleanup!
}, []);

// ROZWIAZANIE:
useEffect(() => {
  const subscription = dataStream.subscribe(handleData);
  return () => subscription.unsubscribe();
}, []);
\`\`\`

**D. State update po unmount:**
\`\`\`typescript
// PROBLEM:
useEffect(() => {
  fetchData().then(data => {
    setData(data); // Moze wykonac sie po unmount!
  });
}, []);

// ROZWIAZANIE:
useEffect(() => {
  let isMounted = true;

  fetchData().then(data => {
    if (isMounted) {
      setData(data);
    }
  });

  return () => { isMounted = false; };
}, []);
\`\`\`

### 2. Narzedzia do diagnostyki
- Chrome DevTools > Memory > Heap Snapshot
- React DevTools Profiler
- \`why-did-you-render\` library

### 3. Checklist naprawy
- [ ] Wszystkie useEffect maja cleanup function
- [ ] Event listenery sa usuwane
- [ ] Timery/intervaly sa czyszczone
- [ ] Subskrypcje sa anulowane
- [ ] Async operations sprawdzaja mounted state`,
      keywords: ['memory', 'leak', 'pamiec', 'useEffect', 'cleanup', 'listener', 'timer', 'interval', 'subscription'],
      effectiveness: 0.89
    }
  ],

  // -------------------------------------------------------------------------
  // TESTING - Przyklady pisania testow
  // -------------------------------------------------------------------------
  testing: [
    {
      input: `Napisz testy jednostkowe dla funkcji calculateDiscount(price, discountPercent)`,
      output: `## Testy jednostkowe dla calculateDiscount

### Implementacja testow (Jest + TypeScript)

\`\`\`typescript
// calculateDiscount.test.ts
import { calculateDiscount, DiscountError } from './calculateDiscount';

describe('calculateDiscount', () => {
  // Grupa 1: Podstawowe przypadki
  describe('podstawowe obliczenia', () => {
    it('powinien obliczyc 10% rabatu od 100', () => {
      expect(calculateDiscount(100, 10)).toBe(90);
    });

    it('powinien obliczyc 25% rabatu od 200', () => {
      expect(calculateDiscount(200, 25)).toBe(150);
    });

    it('powinien zwrocic pelna cene dla 0% rabatu', () => {
      expect(calculateDiscount(100, 0)).toBe(100);
    });

    it('powinien zwrocic 0 dla 100% rabatu', () => {
      expect(calculateDiscount(100, 100)).toBe(0);
    });
  });

  // Grupa 2: Edge cases
  describe('przypadki brzegowe', () => {
    it('powinien obslugiwac cene 0', () => {
      expect(calculateDiscount(0, 50)).toBe(0);
    });

    it('powinien zaokraglac do 2 miejsc po przecinku', () => {
      expect(calculateDiscount(99.99, 15)).toBe(84.99);
    });

    it('powinien obslugiwac male wartosci', () => {
      expect(calculateDiscount(0.01, 10)).toBe(0.01);
    });

    it('powinien obslugiwac duze wartosci', () => {
      expect(calculateDiscount(1000000, 5)).toBe(950000);
    });
  });

  // Grupa 3: Walidacja inputow
  describe('walidacja blednych danych', () => {
    it('powinien rzucic blad dla ujemnej ceny', () => {
      expect(() => calculateDiscount(-100, 10))
        .toThrow(DiscountError);
      expect(() => calculateDiscount(-100, 10))
        .toThrow('Cena nie moze byc ujemna');
    });

    it('powinien rzucic blad dla ujemnego rabatu', () => {
      expect(() => calculateDiscount(100, -10))
        .toThrow('Rabat musi byc miedzy 0 a 100');
    });

    it('powinien rzucic blad dla rabatu > 100', () => {
      expect(() => calculateDiscount(100, 150))
        .toThrow('Rabat musi byc miedzy 0 a 100');
    });

    it('powinien rzucic blad dla NaN', () => {
      expect(() => calculateDiscount(NaN, 10))
        .toThrow('Nieprawidlowa wartosc ceny');
    });

    it('powinien rzucic blad dla Infinity', () => {
      expect(() => calculateDiscount(Infinity, 10))
        .toThrow('Nieprawidlowa wartosc ceny');
    });
  });

  // Grupa 4: Typy (TypeScript)
  describe('typowanie', () => {
    it('powinien akceptowac liczby calkowite', () => {
      const result: number = calculateDiscount(100, 10);
      expect(typeof result).toBe('number');
    });

    it('powinien akceptowac liczby zmiennoprzecinkowe', () => {
      const result: number = calculateDiscount(99.99, 10.5);
      expect(typeof result).toBe('number');
    });
  });
});
\`\`\`

### Przykladowa implementacja funkcji

\`\`\`typescript
// calculateDiscount.ts
export class DiscountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DiscountError';
  }
}

export function calculateDiscount(price: number, discountPercent: number): number {
  // Walidacja
  if (!Number.isFinite(price)) {
    throw new DiscountError('Nieprawidlowa wartosc ceny');
  }
  if (price < 0) {
    throw new DiscountError('Cena nie moze byc ujemna');
  }
  if (discountPercent < 0 || discountPercent > 100) {
    throw new DiscountError('Rabat musi byc miedzy 0 a 100');
  }

  // Obliczenie
  const discount = price * (discountPercent / 100);
  const finalPrice = price - discount;

  // Zaokraglenie do 2 miejsc
  return Math.round(finalPrice * 100) / 100;
}
\`\`\`

### Pokrycie testami
- Podstawowe przypadki: 4 testy
- Edge cases: 4 testy
- Walidacja: 5 testow
- Typy: 2 testy
- **Razem: 15 testow, ~95% coverage**`,
      keywords: ['test', 'testy', 'jednostkowe', 'unit', 'jest', 'mocha', 'assert', 'expect', 'describe', 'it'],
      effectiveness: 0.94
    },
    {
      input: `Napisz testy integracyjne dla REST API endpointu POST /users`,
      output: `## Testy integracyjne dla POST /users

### Implementacja testow (Jest + Supertest)

\`\`\`typescript
// users.integration.test.ts
import request from 'supertest';
import { app } from '../app';
import { db } from '../database';
import { User } from '../models/User';

describe('POST /users', () => {
  // Setup i teardown
  beforeAll(async () => {
    await db.connect();
  });

  afterAll(async () => {
    await db.disconnect();
  });

  beforeEach(async () => {
    await User.deleteMany({});
  });

  // Grupa 1: Sukces
  describe('pomyslne tworzenie uzytkownika', () => {
    it('powinien utworzyc uzytkownika z prawidlowymi danymi', async () => {
      const userData = {
        name: 'Jan Kowalski',
        email: 'jan@example.com',
        password: 'SecurePass123!'
      };

      const response = await request(app)
        .post('/users')
        .send(userData)
        .expect('Content-Type', /json/)
        .expect(201);

      expect(response.body).toMatchObject({
        id: expect.any(String),
        name: 'Jan Kowalski',
        email: 'jan@example.com',
        createdAt: expect.any(String)
      });
      expect(response.body).not.toHaveProperty('password');
    });

    it('powinien zapisac uzytkownika w bazie danych', async () => {
      const userData = {
        name: 'Anna Nowak',
        email: 'anna@example.com',
        password: 'SecurePass123!'
      };

      const response = await request(app)
        .post('/users')
        .send(userData)
        .expect(201);

      const userInDb = await User.findById(response.body.id);
      expect(userInDb).toBeTruthy();
      expect(userInDb?.email).toBe('anna@example.com');
    });

    it('powinien hashowac haslo przed zapisem', async () => {
      const userData = {
        name: 'Test User',
        email: 'test@example.com',
        password: 'PlainPassword123!'
      };

      const response = await request(app)
        .post('/users')
        .send(userData)
        .expect(201);

      const userInDb = await User.findById(response.body.id);
      expect(userInDb?.password).not.toBe('PlainPassword123!');
      expect(userInDb?.password).toMatch(/^\\$2[ayb]\\$.{56}$/); // bcrypt pattern
    });
  });

  // Grupa 2: Walidacja
  describe('walidacja danych wejsciowych', () => {
    it('powinien zwrocic 400 dla brakujacego email', async () => {
      const response = await request(app)
        .post('/users')
        .send({ name: 'Test', password: 'Pass123!' })
        .expect(400);

      expect(response.body.errors).toContainEqual(
        expect.objectContaining({ field: 'email', message: expect.any(String) })
      );
    });

    it('powinien zwrocic 400 dla nieprawidlowego formatu email', async () => {
      const response = await request(app)
        .post('/users')
        .send({ name: 'Test', email: 'not-an-email', password: 'Pass123!' })
        .expect(400);

      expect(response.body.errors[0].field).toBe('email');
    });

    it('powinien zwrocic 400 dla zbyt krotkiego hasla', async () => {
      const response = await request(app)
        .post('/users')
        .send({ name: 'Test', email: 'test@example.com', password: '123' })
        .expect(400);

      expect(response.body.errors[0].field).toBe('password');
    });

    it('powinien zwrocic 409 dla istniejacego email', async () => {
      // Najpierw stworz uzytkownika
      await request(app)
        .post('/users')
        .send({ name: 'First', email: 'duplicate@example.com', password: 'Pass123!' });

      // Proba stworzenia z tym samym email
      const response = await request(app)
        .post('/users')
        .send({ name: 'Second', email: 'duplicate@example.com', password: 'Pass456!' })
        .expect(409);

      expect(response.body.error).toBe('Email already exists');
    });
  });

  // Grupa 3: Bezpieczenstwo
  describe('aspekty bezpieczenstwa', () => {
    it('powinien odrzucic XSS w nazwie uzytkownika', async () => {
      const response = await request(app)
        .post('/users')
        .send({
          name: '<script>alert("xss")</script>',
          email: 'xss@example.com',
          password: 'Pass123!'
        })
        .expect(201);

      expect(response.body.name).not.toContain('<script>');
    });

    it('powinien limitowac rate (429 po przekroczeniu)', async () => {
      // Wyslij wiele requestow
      const requests = Array(11).fill(null).map(() =>
        request(app)
          .post('/users')
          .send({ name: 'Test', email: \`test\${Math.random()}@example.com\`, password: 'Pass123!' })
      );

      const responses = await Promise.all(requests);
      const tooManyRequests = responses.filter(r => r.status === 429);

      expect(tooManyRequests.length).toBeGreaterThan(0);
    });
  });
});
\`\`\`

### Konfiguracja testow

\`\`\`typescript
// jest.integration.config.js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/*.integration.test.ts'],
  setupFilesAfterEnv: ['./tests/setup.ts'],
  testTimeout: 30000,
  maxWorkers: 1  // Testy integracyjne sekwencyjnie
};
\`\`\`

### Podsumowanie
- 9 testow integracyjnych
- Pokrycie: tworzenie, walidacja, bezpieczenstwo
- Izolacja: czyszczenie bazy przed kazdym testem`,
      keywords: ['integracyjne', 'integration', 'api', 'endpoint', 'rest', 'supertest', 'request', 'response', 'http'],
      effectiveness: 0.91
    }
  ],

  // -------------------------------------------------------------------------
  // REFACTORING - Przyklady refaktoryzacji
  // -------------------------------------------------------------------------
  refactoring: [
    {
      input: `Zrefaktoryzuj ten kod - funkcja ma 150 linii i robi zbyt wiele rzeczy`,
      output: `## Refaktoryzacja dlugiej funkcji - zasada Single Responsibility

### PRZED - Funkcja-moloch (150 linii)

\`\`\`typescript
// PRZED: Wszystko w jednej funkcji
async function processOrder(orderId: string) {
  // 1. Pobierz zamowienie (20 linii)
  const order = await db.orders.findById(orderId);
  if (!order) throw new Error('Order not found');
  // ... walidacja ...

  // 2. Sprawdz dostepnosc (30 linii)
  for (const item of order.items) {
    const stock = await db.inventory.check(item.productId);
    // ... logika sprawdzania ...
  }

  // 3. Oblicz cene (25 linii)
  let total = 0;
  for (const item of order.items) {
    // ... skomplikowane obliczenia z rabatami ...
  }

  // 4. Przetwarzanie platnosci (35 linii)
  const paymentResult = await paymentGateway.charge({
    // ... konfiguracja platnosci ...
  });

  // 5. Aktualizuj stan magazynowy (20 linii)
  for (const item of order.items) {
    await db.inventory.decrease(item.productId, item.quantity);
  }

  // 6. Wyslij powiadomienia (20 linii)
  await emailService.send({
    // ... konfiguracja email ...
  });

  return { success: true, orderId };
}
\`\`\`

### PO - Rozbicie na wyspecjalizowane funkcje

\`\`\`typescript
// orderProcessor.ts - Glowny orkiestrator

import { OrderValidator } from './validators/OrderValidator';
import { InventoryService } from './services/InventoryService';
import { PricingService } from './services/PricingService';
import { PaymentService } from './services/PaymentService';
import { NotificationService } from './services/NotificationService';

interface OrderResult {
  success: boolean;
  orderId: string;
  totalCharged: number;
}

export class OrderProcessor {
  constructor(
    private validator: OrderValidator,
    private inventory: InventoryService,
    private pricing: PricingService,
    private payment: PaymentService,
    private notifications: NotificationService
  ) {}

  async processOrder(orderId: string): Promise<OrderResult> {
    // 1. Pobierz i zwaliduj zamowienie
    const order = await this.validator.validateAndFetch(orderId);

    // 2. Sprawdz dostepnosc
    await this.inventory.validateAvailability(order.items);

    // 3. Oblicz cene
    const pricing = await this.pricing.calculate(order);

    // 4. Przetwarzanie platnosci
    const paymentResult = await this.payment.charge({
      orderId: order.id,
      amount: pricing.total,
      customerId: order.customerId
    });

    // 5. Aktualizuj stan magazynowy
    await this.inventory.reserveItems(order.items);

    // 6. Wyslij powiadomienia
    await this.notifications.sendOrderConfirmation(order, pricing);

    return {
      success: true,
      orderId: order.id,
      totalCharged: pricing.total
    };
  }
}
\`\`\`

\`\`\`typescript
// services/PricingService.ts
export interface PricingResult {
  subtotal: number;
  discount: number;
  tax: number;
  shipping: number;
  total: number;
}

export class PricingService {
  async calculate(order: Order): Promise<PricingResult> {
    const subtotal = this.calculateSubtotal(order.items);
    const discount = await this.applyDiscounts(order);
    const tax = this.calculateTax(subtotal - discount);
    const shipping = await this.calculateShipping(order);

    return {
      subtotal,
      discount,
      tax,
      shipping,
      total: subtotal - discount + tax + shipping
    };
  }

  private calculateSubtotal(items: OrderItem[]): number {
    return items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  }

  private async applyDiscounts(order: Order): Promise<number> {
    // Logika rabatow
    return 0;
  }

  private calculateTax(amount: number): number {
    return amount * 0.23; // 23% VAT
  }

  private async calculateShipping(order: Order): Promise<number> {
    // Logika kosztow wysylki
    return 0;
  }
}
\`\`\`

### Korzysci refaktoryzacji

| Aspekt | Przed | Po |
|--------|-------|-----|
| Linie na funkcje | 150 | 15-30 |
| Testowalnosc | Trudna | Latwa (mockowanie) |
| Czytelnosc | Niska | Wysoka |
| Reuzywalnoc | Brak | Pelna |
| Maintainability | Trudna | Prosta |

### Zastosowane wzorce
- **Single Responsibility**: Kazda klasa/funkcja ma jedno zadanie
- **Dependency Injection**: Latwe testowanie i podmiana implementacji
- **Facade**: OrderProcessor ukrywa zlozonosc
- **Strategy**: Rozne serwisy mozna podmieniac`,
      keywords: ['refaktoryzacja', 'refactor', 'refactoring', 'clean', 'solid', 'srp', 'dlugi', 'long', 'function'],
      effectiveness: 0.93
    },
    {
      input: `Usun duplikacje kodu w tych dwoch funkcjach ktore robia podobne rzeczy`,
      output: `## Usuwanie duplikacji - DRY Principle

### PRZED - Zduplikowany kod

\`\`\`typescript
// Funkcja 1: Pobieranie uzytkownikow
async function fetchUsers(filters: UserFilters) {
  try {
    const queryParams = new URLSearchParams();
    if (filters.status) queryParams.set('status', filters.status);
    if (filters.role) queryParams.set('role', filters.role);
    if (filters.page) queryParams.set('page', filters.page.toString());
    if (filters.limit) queryParams.set('limit', filters.limit.toString());

    const response = await fetch(\`/api/users?\${queryParams}\`);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to fetch users');
    }

    const data = await response.json();
    return { data: data.users, total: data.total };
  } catch (error) {
    console.error('Error fetching users:', error);
    throw error;
  }
}

// Funkcja 2: Pobieranie produktow (prawie identyczna!)
async function fetchProducts(filters: ProductFilters) {
  try {
    const queryParams = new URLSearchParams();
    if (filters.category) queryParams.set('category', filters.category);
    if (filters.status) queryParams.set('status', filters.status);
    if (filters.page) queryParams.set('page', filters.page.toString());
    if (filters.limit) queryParams.set('limit', filters.limit.toString());

    const response = await fetch(\`/api/products?\${queryParams}\`);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to fetch products');
    }

    const data = await response.json();
    return { data: data.products, total: data.total };
  } catch (error) {
    console.error('Error fetching products:', error);
    throw error;
  }
}
\`\`\`

### PO - Wspolna abstrakcja

\`\`\`typescript
// apiClient.ts - Generyczna funkcja do pobierania danych

interface PaginationParams {
  page?: number;
  limit?: number;
}

interface ApiResponse<T> {
  data: T[];
  total: number;
}

interface FetchOptions<F> {
  endpoint: string;
  filters?: F;
  dataKey: string;  // Klucz w odpowiedzi (users, products, etc.)
}

/**
 * Generyczna funkcja do pobierania danych z API
 */
async function fetchFromApi<T, F extends PaginationParams>(
  options: FetchOptions<F>
): Promise<ApiResponse<T>> {
  const { endpoint, filters = {} as F, dataKey } = options;

  try {
    // Budowanie query params z filtrow
    const queryParams = buildQueryParams(filters);
    const url = \`/api/\${endpoint}\${queryParams ? \`?\${queryParams}\` : ''}\`;

    // Wykonanie requestu
    const response = await fetch(url);

    // Obsluga bledow
    if (!response.ok) {
      await handleApiError(response, endpoint);
    }

    // Parsowanie odpowiedzi
    const data = await response.json();

    return {
      data: data[dataKey],
      total: data.total
    };
  } catch (error) {
    console.error(\`Error fetching \${endpoint}:\`, error);
    throw error;
  }
}

/**
 * Budowanie query string z obiektu filtrow
 */
function buildQueryParams<F extends Record<string, unknown>>(filters: F): string {
  const params = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value));
    }
  });

  return params.toString();
}

/**
 * Obsluga bledow API
 */
async function handleApiError(response: Response, context: string): Promise<never> {
  const error = await response.json().catch(() => ({}));
  throw new Error(error.message || \`Failed to fetch \${context}\`);
}

// ===========================================
// UZYCIE - Proste, typowane funkcje
// ===========================================

interface UserFilters extends PaginationParams {
  status?: string;
  role?: string;
}

interface ProductFilters extends PaginationParams {
  category?: string;
  status?: string;
}

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface Product {
  id: string;
  name: string;
  price: number;
  category: string;
}

// Teraz funkcje sa jednolinijkowe!
export const fetchUsers = (filters?: UserFilters) =>
  fetchFromApi<User, UserFilters>({
    endpoint: 'users',
    filters,
    dataKey: 'users'
  });

export const fetchProducts = (filters?: ProductFilters) =>
  fetchFromApi<Product, ProductFilters>({
    endpoint: 'products',
    filters,
    dataKey: 'products'
  });

// Latwo dodac nowe endpointy:
export const fetchOrders = (filters?: OrderFilters) =>
  fetchFromApi<Order, OrderFilters>({
    endpoint: 'orders',
    filters,
    dataKey: 'orders'
  });
\`\`\`

### Podsumowanie zmian

| Metryka | Przed | Po |
|---------|-------|-----|
| Linie kodu | ~60 (2x30) | ~50 (reuzywalne) |
| Duplikacja | 90% | 0% |
| Dodanie nowego endpointu | ~30 linii | ~5 linii |
| Testowalnosc | Trudna | Latwa |

### Zastosowane techniki
- **Generic functions**: Jedna funkcja dla wielu typow
- **DRY**: Wspolna logika wydzielona
- **Type safety**: TypeScript generics
- **Single Source of Truth**: Zmiana w jednym miejscu`,
      keywords: ['duplikacja', 'duplicate', 'dry', 'powtorzenie', 'copy', 'paste', 'similar', 'identyczny'],
      effectiveness: 0.90
    }
  ],

  // -------------------------------------------------------------------------
  // API_DESIGN - Projektowanie API
  // -------------------------------------------------------------------------
  api_design: [
    {
      input: `Zaprojektuj REST API dla systemu rezerwacji hoteli`,
      output: `## REST API Design: System Rezerwacji Hoteli

### 1. Zasoby (Resources)

| Zasob | Opis |
|-------|------|
| Hotels | Hotele w systemie |
| Rooms | Pokoje hotelowe |
| Reservations | Rezerwacje |
| Guests | Goscie |
| Payments | Platnosci |

### 2. Endpointy API

#### Hotels
\`\`\`
GET    /api/v1/hotels                 # Lista hoteli (z filtrami)
GET    /api/v1/hotels/:id             # Szczegoly hotelu
POST   /api/v1/hotels                 # Dodaj hotel (admin)
PUT    /api/v1/hotels/:id             # Aktualizuj hotel (admin)
DELETE /api/v1/hotels/:id             # Usun hotel (admin)
GET    /api/v1/hotels/:id/rooms       # Pokoje w hotelu
GET    /api/v1/hotels/:id/availability # Dostepnosc hotelu
\`\`\`

#### Rooms
\`\`\`
GET    /api/v1/rooms                  # Lista pokoi (z filtrami)
GET    /api/v1/rooms/:id              # Szczegoly pokoju
POST   /api/v1/hotels/:hotelId/rooms  # Dodaj pokoj do hotelu
PUT    /api/v1/rooms/:id              # Aktualizuj pokoj
DELETE /api/v1/rooms/:id              # Usun pokoj
GET    /api/v1/rooms/:id/availability # Dostepnosc pokoju
\`\`\`

#### Reservations
\`\`\`
GET    /api/v1/reservations           # Lista rezerwacji (auth)
GET    /api/v1/reservations/:id       # Szczegoly rezerwacji
POST   /api/v1/reservations           # Utworz rezerwacje
PUT    /api/v1/reservations/:id       # Modyfikuj rezerwacje
DELETE /api/v1/reservations/:id       # Anuluj rezerwacje
POST   /api/v1/reservations/:id/confirm # Potwierdz rezerwacje
POST   /api/v1/reservations/:id/checkin  # Zameldowanie
POST   /api/v1/reservations/:id/checkout # Wymeldowanie
\`\`\`

### 3. Przyklady Request/Response

#### POST /api/v1/reservations
\`\`\`json
// Request
{
  "hotelId": "hotel_123",
  "roomId": "room_456",
  "guestId": "guest_789",
  "checkIn": "2024-06-15",
  "checkOut": "2024-06-18",
  "guests": {
    "adults": 2,
    "children": 1
  },
  "specialRequests": "PokĂłj z widokiem na morze"
}

// Response 201 Created
{
  "id": "res_abc123",
  "status": "pending",
  "hotel": {
    "id": "hotel_123",
    "name": "Grand Hotel"
  },
  "room": {
    "id": "room_456",
    "type": "deluxe",
    "number": "305"
  },
  "checkIn": "2024-06-15T14:00:00Z",
  "checkOut": "2024-06-18T11:00:00Z",
  "nights": 3,
  "pricing": {
    "perNight": 450.00,
    "subtotal": 1350.00,
    "taxes": 310.50,
    "total": 1660.50,
    "currency": "PLN"
  },
  "createdAt": "2024-01-15T10:30:00Z",
  "expiresAt": "2024-01-15T11:00:00Z",
  "_links": {
    "self": "/api/v1/reservations/res_abc123",
    "confirm": "/api/v1/reservations/res_abc123/confirm",
    "cancel": "/api/v1/reservations/res_abc123",
    "payment": "/api/v1/payments?reservationId=res_abc123"
  }
}
\`\`\`

#### GET /api/v1/hotels?city=Warsaw&checkIn=2024-06-15&checkOut=2024-06-18
\`\`\`json
// Response 200 OK
{
  "data": [
    {
      "id": "hotel_123",
      "name": "Grand Hotel Warsaw",
      "stars": 5,
      "address": {
        "street": "ul. Marszalkowska 1",
        "city": "Warsaw",
        "country": "PL"
      },
      "amenities": ["wifi", "pool", "spa", "restaurant"],
      "images": [
        { "url": "https://...", "alt": "Hotel facade" }
      ],
      "rating": {
        "average": 4.7,
        "count": 1234
      },
      "priceFrom": {
        "amount": 350.00,
        "currency": "PLN"
      },
      "availability": true
    }
  ],
  "meta": {
    "total": 45,
    "page": 1,
    "perPage": 20,
    "totalPages": 3
  },
  "_links": {
    "self": "/api/v1/hotels?city=Warsaw&page=1",
    "next": "/api/v1/hotels?city=Warsaw&page=2"
  }
}
\`\`\`

### 4. Kody odpowiedzi HTTP

| Kod | Znaczenie | Kiedy uzywac |
|-----|-----------|--------------|
| 200 | OK | GET success, PUT success |
| 201 | Created | POST success |
| 204 | No Content | DELETE success |
| 400 | Bad Request | Bledne dane wejsciowe |
| 401 | Unauthorized | Brak/bledny token |
| 403 | Forbidden | Brak uprawnien |
| 404 | Not Found | Zasob nie istnieje |
| 409 | Conflict | Pokoj juz zarezerwowany |
| 422 | Unprocessable | Walidacja nie przeszla |
| 429 | Too Many Requests | Rate limit |

### 5. Autentykacja i autoryzacja

\`\`\`
Authorization: Bearer <jwt_token>

Role:
- guest: Rezerwacje wlasne
- staff: Zarzadzanie rezerwacjami
- admin: Zarzadzanie hotelami/pokojami
\`\`\`

### 6. Wersjonowanie
- URL path: \`/api/v1/\`, \`/api/v2/\`
- Header: \`Accept: application/vnd.hotel.v1+json\``,
      keywords: ['api', 'rest', 'design', 'endpoint', 'zaprojektuj', 'projektowanie', 'http', 'resource'],
      effectiveness: 0.95
    },
    {
      input: `Zaprojektuj GraphQL schema dla aplikacji e-commerce`,
      output: `## GraphQL Schema Design: E-commerce Application

### 1. Typy podstawowe (Types)

\`\`\`graphql
# schema.graphql

# ==========================================
# SCALAR TYPES
# ==========================================
scalar DateTime
scalar Money
scalar URL

# ==========================================
# ENUMS
# ==========================================
enum OrderStatus {
  PENDING
  CONFIRMED
  PROCESSING
  SHIPPED
  DELIVERED
  CANCELLED
  REFUNDED
}

enum PaymentStatus {
  PENDING
  COMPLETED
  FAILED
  REFUNDED
}

enum ProductAvailability {
  IN_STOCK
  LOW_STOCK
  OUT_OF_STOCK
  PREORDER
}

# ==========================================
# INTERFACES
# ==========================================
interface Node {
  id: ID!
}

interface Timestamped {
  createdAt: DateTime!
  updatedAt: DateTime!
}

# ==========================================
# TYPES
# ==========================================
type Product implements Node & Timestamped {
  id: ID!
  name: String!
  slug: String!
  description: String
  price: Money!
  compareAtPrice: Money
  images: [ProductImage!]!
  category: Category!
  tags: [String!]!
  variants: [ProductVariant!]!
  availability: ProductAvailability!
  rating: Float
  reviewsCount: Int!
  reviews(first: Int, after: String): ReviewConnection!
  relatedProducts(first: Int): [Product!]!
  createdAt: DateTime!
  updatedAt: DateTime!
}

type ProductImage {
  url: URL!
  alt: String
  width: Int
  height: Int
}

type ProductVariant implements Node {
  id: ID!
  product: Product!
  name: String!
  sku: String!
  price: Money!
  inventory: Int!
  attributes: [VariantAttribute!]!
}

type VariantAttribute {
  name: String!
  value: String!
}

type Category implements Node {
  id: ID!
  name: String!
  slug: String!
  description: String
  parent: Category
  children: [Category!]!
  products(first: Int, after: String): ProductConnection!
  image: URL
}

type User implements Node & Timestamped {
  id: ID!
  email: String!
  firstName: String
  lastName: String
  fullName: String
  addresses: [Address!]!
  orders(first: Int, after: String): OrderConnection!
  wishlist: [Product!]!
  createdAt: DateTime!
  updatedAt: DateTime!
}

type Address {
  id: ID!
  street: String!
  city: String!
  postalCode: String!
  country: String!
  isDefault: Boolean!
}

type Cart implements Node {
  id: ID!
  items: [CartItem!]!
  itemsCount: Int!
  subtotal: Money!
  discount: Money
  shipping: Money
  tax: Money!
  total: Money!
}

type CartItem {
  id: ID!
  product: Product!
  variant: ProductVariant
  quantity: Int!
  unitPrice: Money!
  totalPrice: Money!
}

type Order implements Node & Timestamped {
  id: ID!
  orderNumber: String!
  user: User!
  items: [OrderItem!]!
  status: OrderStatus!
  shippingAddress: Address!
  billingAddress: Address!
  subtotal: Money!
  discount: Money
  shipping: Money!
  tax: Money!
  total: Money!
  payment: Payment
  tracking: ShippingTracking
  createdAt: DateTime!
  updatedAt: DateTime!
}

type OrderItem {
  product: Product!
  variant: ProductVariant
  quantity: Int!
  unitPrice: Money!
  totalPrice: Money!
}

type Payment {
  id: ID!
  status: PaymentStatus!
  method: String!
  amount: Money!
  paidAt: DateTime
}

type ShippingTracking {
  carrier: String!
  trackingNumber: String!
  url: URL
  estimatedDelivery: DateTime
}

# ==========================================
# CONNECTIONS (Pagination)
# ==========================================
type ProductConnection {
  edges: [ProductEdge!]!
  pageInfo: PageInfo!
  totalCount: Int!
}

type ProductEdge {
  node: Product!
  cursor: String!
}

type PageInfo {
  hasNextPage: Boolean!
  hasPreviousPage: Boolean!
  startCursor: String
  endCursor: String
}

# Similar connections for Order, Review, etc.
\`\`\`

### 2. Queries

\`\`\`graphql
type Query {
  # Products
  product(id: ID, slug: String): Product
  products(
    first: Int
    after: String
    filter: ProductFilter
    sort: ProductSort
  ): ProductConnection!

  # Categories
  category(id: ID, slug: String): Category
  categories(parentId: ID): [Category!]!

  # Cart
  cart: Cart

  # User
  me: User

  # Orders
  order(id: ID!): Order
  orders(first: Int, after: String, status: OrderStatus): OrderConnection!

  # Search
  search(query: String!, first: Int): SearchResults!
}

input ProductFilter {
  categoryId: ID
  minPrice: Money
  maxPrice: Money
  availability: ProductAvailability
  tags: [String!]
}

enum ProductSort {
  PRICE_ASC
  PRICE_DESC
  NAME_ASC
  CREATED_DESC
  POPULARITY
  RATING
}

type SearchResults {
  products: [Product!]!
  categories: [Category!]!
  totalCount: Int!
}
\`\`\`

### 3. Mutations

\`\`\`graphql
type Mutation {
  # Cart
  addToCart(input: AddToCartInput!): CartPayload!
  updateCartItem(input: UpdateCartItemInput!): CartPayload!
  removeFromCart(itemId: ID!): CartPayload!
  clearCart: CartPayload!
  applyCoupon(code: String!): CartPayload!

  # Checkout
  checkout(input: CheckoutInput!): CheckoutPayload!

  # User
  register(input: RegisterInput!): AuthPayload!
  login(input: LoginInput!): AuthPayload!
  logout: Boolean!
  updateProfile(input: UpdateProfileInput!): UserPayload!
  addAddress(input: AddressInput!): AddressPayload!

  # Wishlist
  addToWishlist(productId: ID!): WishlistPayload!
  removeFromWishlist(productId: ID!): WishlistPayload!

  # Reviews
  addReview(input: ReviewInput!): ReviewPayload!
}

input AddToCartInput {
  productId: ID!
  variantId: ID
  quantity: Int! = 1
}

input CheckoutInput {
  shippingAddressId: ID!
  billingAddressId: ID
  paymentMethod: String!
  notes: String
}

type CartPayload {
  cart: Cart
  errors: [Error!]
}

type CheckoutPayload {
  order: Order
  errors: [Error!]
}

type Error {
  field: String
  message: String!
  code: String!
}
\`\`\`

### 4. Subscriptions

\`\`\`graphql
type Subscription {
  orderStatusChanged(orderId: ID!): Order!
  productAvailabilityChanged(productId: ID!): Product!
  cartUpdated: Cart!
}
\`\`\`

### 5. Przyklad uzycia

\`\`\`graphql
# Pobierz produkt ze wszystkimi danymi
query GetProduct($slug: String!) {
  product(slug: $slug) {
    id
    name
    price
    description
    images {
      url
      alt
    }
    variants {
      id
      name
      price
      inventory
    }
    reviews(first: 5) {
      edges {
        node {
          rating
          comment
          author {
            fullName
          }
        }
      }
    }
    relatedProducts(first: 4) {
      id
      name
      price
      images {
        url
      }
    }
  }
}

# Dodaj do koszyka
mutation AddToCart {
  addToCart(input: { productId: "prod_123", quantity: 2 }) {
    cart {
      itemsCount
      total
    }
    errors {
      message
    }
  }
}
\`\`\``,
      keywords: ['graphql', 'schema', 'query', 'mutation', 'type', 'ecommerce', 'sklep', 'commerce'],
      effectiveness: 0.92
    }
  ],

  // -------------------------------------------------------------------------
  // SECURITY - Analiza bezpieczenstwa
  // -------------------------------------------------------------------------
  security: [
    {
      input: `Przeanalizuj kod pod katem bezpieczenstwa - endpoint logowania`,
      output: `## Security Audit: Endpoint Logowania

### Analizowany kod (przyklad typowych bledow)

\`\`\`typescript
// NIEBEZPIECZNY KOD - DO POPRAWY
app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  const user = await db.query(
    \`SELECT * FROM users WHERE email = '\${email}'\`  // SQL Injection!
  );

  if (user && user.password === password) {  // Plain text comparison!
    const token = jwt.sign({ id: user.id }, 'secret123');  // Weak secret!
    res.json({ token });
  } else {
    res.status(401).json({ error: 'Invalid email or password' });
  }
});
\`\`\`

### Zidentyfikowane podatnosci

| # | Podatnosc | Poziom | OWASP |
|---|-----------|--------|-------|
| 1 | SQL Injection | KRYTYCZNY | A03:2021 |
| 2 | Plaintext password comparison | KRYTYCZNY | A02:2021 |
| 3 | Weak JWT secret | WYSOKI | A02:2021 |
| 4 | No rate limiting | SREDNI | A07:2021 |
| 5 | No input validation | SREDNI | A03:2021 |
| 6 | Timing attack vulnerability | NISKI | A02:2021 |
| 7 | No HTTPS enforcement | SREDNI | A02:2021 |

### Szczegolowa analiza i poprawki

#### 1. SQL Injection (KRYTYCZNY)
\`\`\`typescript
// ZRODLO PROBLEMU:
\`SELECT * FROM users WHERE email = '\${email}'\`

// ATAK:
email = "'; DROP TABLE users; --"

// ROZWIAZANIE - Parametryzowane zapytania:
const user = await db.query(
  'SELECT * FROM users WHERE email = $1',
  [email]
);
\`\`\`

#### 2. Password handling (KRYTYCZNY)
\`\`\`typescript
// ZRODLO PROBLEMU:
user.password === password  // Porownanie plain text

// ROZWIAZANIE - bcrypt:
import bcrypt from 'bcrypt';

// Przy rejestracji:
const hashedPassword = await bcrypt.hash(password, 12);

// Przy logowaniu:
const isValid = await bcrypt.compare(password, user.passwordHash);
\`\`\`

#### 3. JWT Secret (WYSOKI)
\`\`\`typescript
// ZRODLO PROBLEMU:
jwt.sign({ id: user.id }, 'secret123')  // Slaby, hardcoded secret

// ROZWIAZANIE:
const token = jwt.sign(
  {
    sub: user.id,
    iat: Date.now(),
    exp: Date.now() + 15 * 60 * 1000  // 15 min
  },
  process.env.JWT_SECRET,  // Min 256 bit z env
  { algorithm: 'HS256' }
);
\`\`\`

### Bezpieczna implementacja

\`\`\`typescript
// secure-login.ts
import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { body, validationResult } from 'express-validator';
import helmet from 'helmet';

const app = express();
app.use(helmet());
app.use(express.json());

// Rate limiting - max 5 prob na 15 min
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many login attempts, try again later' },
  standardHeaders: true,
  skipSuccessfulRequests: false
});

// Walidacja inputu
const loginValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Invalid email format'),
  body('password')
    .isLength({ min: 8, max: 128 })
    .withMessage('Password must be 8-128 characters')
];

// Bezpieczny endpoint logowania
app.post('/api/v1/auth/login',
  loginLimiter,
  loginValidation,
  async (req, res) => {
    // Sprawdz walidacje
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { email, password } = req.body;

    try {
      // Parametryzowane zapytanie (zapobiega SQL Injection)
      const user = await db.query(
        'SELECT id, email, password_hash, failed_attempts, locked_until FROM users WHERE email = $1',
        [email.toLowerCase()]
      );

      // Stala odpowiedz czasowa (zapobiega timing attack)
      const genericError = { error: 'Invalid email or password' };

      // Sprawdz czy uzytkownik istnieje
      if (!user) {
        // Wykonaj dummy hash comparison dla stalego czasu
        await bcrypt.compare(password, '$2b$12$dummy.hash.for.timing.attack.prevention');
        return res.status(401).json(genericError);
      }

      // Sprawdz czy konto zablokowane
      if (user.locked_until && new Date(user.locked_until) > new Date()) {
        return res.status(423).json({
          error: 'Account temporarily locked',
          retryAfter: user.locked_until
        });
      }

      // Weryfikacja hasla (bcrypt)
      const isValidPassword = await bcrypt.compare(password, user.password_hash);

      if (!isValidPassword) {
        // Inkrementuj licznik blednych prob
        await incrementFailedAttempts(user.id);
        return res.status(401).json(genericError);
      }

      // Reset licznika blednych prob
      await resetFailedAttempts(user.id);

      // Generowanie tokenow
      const accessToken = generateAccessToken(user);
      const refreshToken = await generateRefreshToken(user);

      // Ustaw secure cookie dla refresh token
      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000  // 7 dni
      });

      // Logowanie audytowe
      await auditLog('LOGIN_SUCCESS', { userId: user.id, ip: req.ip });

      res.json({
        accessToken,
        expiresIn: 900,  // 15 min
        tokenType: 'Bearer'
      });

    } catch (error) {
      await auditLog('LOGIN_ERROR', { email, error: error.message });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

function generateAccessToken(user: User): string {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      type: 'access'
    },
    process.env.JWT_ACCESS_SECRET!,
    {
      algorithm: 'HS256',
      expiresIn: '15m'
    }
  );
}
\`\`\`

### Security Checklist
- [x] Parametryzowane zapytania SQL
- [x] Hashowanie hasel (bcrypt, cost 12)
- [x] Silny JWT secret z env
- [x] Rate limiting
- [x] Input validation
- [x] Timing attack prevention
- [x] Account lockout
- [x] Audit logging
- [x] Secure cookies
- [x] HTTPS headers (Helmet)`,
      keywords: ['security', 'bezpieczenstwo', 'sql injection', 'xss', 'csrf', 'auth', 'login', 'authentication'],
      effectiveness: 0.96
    },
    {
      input: `Sprawdz kod pod katem podatnosci XSS`,
      output: `## Analiza XSS (Cross-Site Scripting)

### Typy XSS

| Typ | Opis | Przyklad |
|-----|------|----------|
| Reflected | Payload w URL/request | \`/search?q=<script>alert(1)</script>\` |
| Stored | Payload zapisany w DB | Komentarz z JS |
| DOM-based | Manipulacja DOM | \`innerHTML = userInput\` |

### Znalezione podatnosci

#### 1. DOM XSS - innerHTML (KRYTYCZNY)
\`\`\`typescript
// NIEBEZPIECZNY KOD:
function displayComment(comment: string) {
  document.getElementById('comments')!.innerHTML +=
    \`<div class="comment">\${comment}</div>\`;
}

// ATAK:
displayComment('<img src=x onerror="alert(document.cookie)">');

// ROZWIAZANIE - textContent lub sanityzacja:
function displayComment(comment: string) {
  const div = document.createElement('div');
  div.className = 'comment';
  div.textContent = comment;  // Bezpieczne - escapuje HTML
  document.getElementById('comments')!.appendChild(div);
}

// Lub z DOMPurify dla rich content:
import DOMPurify from 'dompurify';

function displayRichComment(html: string) {
  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a'],
    ALLOWED_ATTR: ['href']
  });
  document.getElementById('comments')!.innerHTML += clean;
}
\`\`\`

#### 2. React dangerouslySetInnerHTML (WYSOKI)
\`\`\`tsx
// NIEBEZPIECZNY KOD:
function UserProfile({ bio }: { bio: string }) {
  return <div dangerouslySetInnerHTML={{ __html: bio }} />;
}

// ROZWIAZANIE 1 - Unikaj dangerouslySetInnerHTML:
function UserProfile({ bio }: { bio: string }) {
  return <div>{bio}</div>;  // React automatycznie escapuje
}

// ROZWIAZANIE 2 - Jesli potrzebujesz HTML, sanityzuj:
import DOMPurify from 'dompurify';

function UserProfile({ bio }: { bio: string }) {
  const sanitizedBio = DOMPurify.sanitize(bio);
  return <div dangerouslySetInnerHTML={{ __html: sanitizedBio }} />;
}
\`\`\`

#### 3. URL Injection (SREDNI)
\`\`\`typescript
// NIEBEZPIECZNY KOD:
const redirectUrl = req.query.redirect;
res.redirect(redirectUrl);  // Open Redirect

// ATAK:
// /login?redirect=javascript:alert(document.cookie)
// /login?redirect=https://evil.com

// ROZWIAZANIE - Whitelist dozwolonych URL:
const ALLOWED_REDIRECTS = ['/dashboard', '/profile', '/settings'];

function safeRedirect(url: string): string {
  // Sprawdz czy URL jest na whiteliscie
  if (ALLOWED_REDIRECTS.includes(url)) {
    return url;
  }

  // Sprawdz czy to relatywny URL w naszej domenie
  try {
    const parsed = new URL(url, 'https://myapp.com');
    if (parsed.origin === 'https://myapp.com') {
      return parsed.pathname;
    }
  } catch {
    // Invalid URL
  }

  return '/dashboard';  // Domyslny bezpieczny redirect
}
\`\`\`

#### 4. Server-side Template Injection
\`\`\`typescript
// NIEBEZPIECZNY KOD (EJS):
app.get('/welcome', (req, res) => {
  const name = req.query.name;
  res.render('welcome', { name });
});

// Template:
// <h1>Witaj, <%- name %></h1>  <!-- <%- NIE escapuje! -->

// ATAK:
// /welcome?name=<script>alert(1)</script>

// ROZWIAZANIE - Uzywaj <%= zamiast <%-:
// <h1>Witaj, <%= name %></h1>  <!-- <%= automatycznie escapuje -->
\`\`\`

### Kompleksowa ochrona XSS

\`\`\`typescript
// xss-protection.ts
import helmet from 'helmet';
import { expressCspHeader, INLINE, SELF } from 'express-csp-header';

// 1. Content Security Policy
app.use(expressCspHeader({
  directives: {
    'default-src': [SELF],
    'script-src': [SELF],  // Brak 'unsafe-inline'!
    'style-src': [SELF, INLINE],
    'img-src': [SELF, 'data:', 'https:'],
    'frame-ancestors': [SELF],
    'form-action': [SELF]
  }
}));

// 2. Security headers
app.use(helmet({
  contentSecurityPolicy: true,
  xXssProtection: true,  // Legacy, ale warto
  noSniff: true
}));

// 3. Input sanitization middleware
import { body, validationResult } from 'express-validator';
import xss from 'xss';

const sanitizeInput = (fields: string[]) => {
  return fields.map(field =>
    body(field).customSanitizer(value => {
      if (typeof value === 'string') {
        return xss(value, {
          whiteList: {},  // Usuwa wszystkie tagi
          stripIgnoreTag: true
        });
      }
      return value;
    })
  );
};

// 4. Output encoding helper
function htmlEncode(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

// 5. Safe JSON embedding in HTML
function safeJsonEmbed(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}
\`\`\`

### Checklist XSS Prevention
- [ ] CSP header skonfigurowany
- [ ] Brak \`unsafe-inline\` w script-src
- [ ] Input validation na wszystkich endpointach
- [ ] Output encoding przy renderowaniu
- [ ] Unikanie innerHTML/dangerouslySetInnerHTML
- [ ] Sanityzacja HTML gdzie konieczna (DOMPurify)
- [ ] HttpOnly cookies dla tokenow
- [ ] X-XSS-Protection header`,
      keywords: ['xss', 'cross-site', 'scripting', 'injection', 'sanitize', 'escape', 'innerHTML', 'security'],
      effectiveness: 0.93
    }
  ],

  // -------------------------------------------------------------------------
  // PERFORMANCE - Optymalizacja wydajnosci
  // -------------------------------------------------------------------------
  performance: [
    {
      input: `Zoptymalizuj wydajnosc zapytania SQL ktore dziala wolno`,
      output: `## Optymalizacja wolnego zapytania SQL

### Analiza problemu

\`\`\`sql
-- WOLNE ZAPYTANIE (15+ sekund):
SELECT
  o.id,
  o.order_date,
  c.name as customer_name,
  c.email,
  SUM(oi.quantity * oi.price) as total,
  COUNT(oi.id) as items_count
FROM orders o
JOIN customers c ON o.customer_id = c.id
JOIN order_items oi ON o.id = oi.order_id
WHERE o.order_date BETWEEN '2023-01-01' AND '2023-12-31'
  AND c.country = 'Poland'
  AND o.status != 'cancelled'
GROUP BY o.id, o.order_date, c.name, c.email
ORDER BY o.order_date DESC
LIMIT 100;
\`\`\`

### Krok 1: Analiza EXPLAIN

\`\`\`sql
EXPLAIN ANALYZE SELECT ...

-- Wynik:
-- Seq Scan on orders (cost=0.00..25000.00 rows=500000)
-- Nested Loop (cost=25000.00..125000.00 rows=1500000)
-- Sort (cost=150000.00..155000.00)
-- Execution Time: 15234.567 ms
\`\`\`

### Krok 2: Identyfikacja problemow

| Problem | Wplyw | Rozwiazanie |
|---------|-------|-------------|
| Brak indeksu na order_date | Seq Scan | Dodaj indeks |
| Brak indeksu na customer_id | Slow JOIN | Dodaj indeks |
| Niepotrzebne kolumny w GROUP BY | Memory | Optymalizuj |
| Brak filtrowania przed JOIN | Rows | Subquery |

### Krok 3: Dodanie indeksow

\`\`\`sql
-- Indeks na order_date (najczesciej filtrowany)
CREATE INDEX CONCURRENTLY idx_orders_date_status
ON orders (order_date, status)
WHERE status != 'cancelled';

-- Indeks na customer country
CREATE INDEX CONCURRENTLY idx_customers_country
ON customers (country);

-- Composite index dla JOIN
CREATE INDEX CONCURRENTLY idx_order_items_order
ON order_items (order_id)
INCLUDE (quantity, price);

-- Sprawdz czy indeksy sa uzywane:
EXPLAIN (ANALYZE, BUFFERS) SELECT ...
\`\`\`

### Krok 4: Zoptymalizowane zapytanie

\`\`\`sql
-- ZOPTYMALIZOWANE ZAPYTANIE (< 100ms):

-- Opcja 1: CTE dla wczesnego filtrowania
WITH filtered_orders AS (
  SELECT id, order_date, customer_id
  FROM orders
  WHERE order_date BETWEEN '2023-01-01' AND '2023-12-31'
    AND status != 'cancelled'
),
polish_customers AS (
  SELECT id, name, email
  FROM customers
  WHERE country = 'Poland'
),
order_totals AS (
  SELECT
    order_id,
    SUM(quantity * price) as total,
    COUNT(*) as items_count
  FROM order_items
  WHERE order_id IN (SELECT id FROM filtered_orders)
  GROUP BY order_id
)
SELECT
  fo.id,
  fo.order_date,
  pc.name as customer_name,
  pc.email,
  ot.total,
  ot.items_count
FROM filtered_orders fo
JOIN polish_customers pc ON fo.customer_id = pc.id
JOIN order_totals ot ON fo.id = ot.order_id
ORDER BY fo.order_date DESC
LIMIT 100;

-- Opcja 2: Lateral join dla agregacji
SELECT
  o.id,
  o.order_date,
  c.name as customer_name,
  c.email,
  totals.total,
  totals.items_count
FROM orders o
JOIN customers c ON o.customer_id = c.id AND c.country = 'Poland'
CROSS JOIN LATERAL (
  SELECT
    SUM(quantity * price) as total,
    COUNT(*) as items_count
  FROM order_items
  WHERE order_id = o.id
) totals
WHERE o.order_date BETWEEN '2023-01-01' AND '2023-12-31'
  AND o.status != 'cancelled'
ORDER BY o.order_date DESC
LIMIT 100;
\`\`\`

### Krok 5: Dodatkowe optymalizacje

\`\`\`sql
-- 1. Partycjonowanie tabeli orders po dacie
CREATE TABLE orders_2023 PARTITION OF orders
FOR VALUES FROM ('2023-01-01') TO ('2024-01-01');

-- 2. Materializowany widok dla raportow
CREATE MATERIALIZED VIEW mv_order_summaries AS
SELECT
  o.id,
  o.order_date,
  o.customer_id,
  SUM(oi.quantity * oi.price) as total,
  COUNT(oi.id) as items_count
FROM orders o
JOIN order_items oi ON o.id = oi.order_id
WHERE o.status != 'cancelled'
GROUP BY o.id
WITH DATA;

CREATE INDEX idx_mv_order_date ON mv_order_summaries(order_date);

-- Odswiez co noc:
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_order_summaries;

-- 3. Statystyki dla query plannera
ANALYZE orders;
ANALYZE customers;
ANALYZE order_items;
\`\`\`

### Wyniki optymalizacji

| Metryka | Przed | Po |
|---------|-------|-----|
| Czas wykonania | 15.2s | 45ms |
| Rows scanned | 2.5M | 50K |
| Memory usage | 512MB | 32MB |
| Index usage | 0% | 100% |`,
      keywords: ['sql', 'query', 'optymalizacja', 'performance', 'slow', 'wolne', 'index', 'explain', 'database'],
      effectiveness: 0.94
    },
    {
      input: `Zoptymalizuj renderowanie listy 10000 elementow w React`,
      output: `## Optymalizacja renderowania duzej listy w React

### Problem
Renderowanie 10000 elementow powoduje:
- Zamrozenie UI (blocked main thread)
- Wysokie zuzycie pamieci
- Wolne scrollowanie

### Rozwiazanie 1: React Window (Virtualizacja)

\`\`\`tsx
// VirtualizedList.tsx
import { FixedSizeList as List } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';

interface Item {
  id: number;
  name: string;
  description: string;
}

interface VirtualizedListProps {
  items: Item[];
}

// Komponent wiersza - memoizowany
const Row = React.memo(({
  index,
  style,
  data
}: {
  index: number;
  style: React.CSSProperties;
  data: Item[];
}) => {
  const item = data[index];

  return (
    <div style={style} className="list-row">
      <div className="item-name">{item.name}</div>
      <div className="item-desc">{item.description}</div>
    </div>
  );
});

export function VirtualizedList({ items }: VirtualizedListProps) {
  return (
    <div style={{ height: '100vh', width: '100%' }}>
      <AutoSizer>
        {({ height, width }) => (
          <List
            height={height}
            width={width}
            itemCount={items.length}
            itemSize={60}  // Wysokosc wiersza
            itemData={items}
            overscanCount={5}  // Ile dodatkowych renderowac
          >
            {Row}
          </List>
        )}
      </AutoSizer>
    </div>
  );
}

// Uzycie:
<VirtualizedList items={tenThousandItems} />
\`\`\`

### Rozwiazanie 2: Infinite Scroll z Intersection Observer

\`\`\`tsx
// InfiniteList.tsx
import { useState, useEffect, useRef, useCallback } from 'react';

const BATCH_SIZE = 50;

export function InfiniteList({ items }: { items: Item[] }) {
  const [displayedItems, setDisplayedItems] = useState<Item[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const loaderRef = useRef<HTMLDivElement>(null);

  // Zaladuj pierwsza porcje
  useEffect(() => {
    setDisplayedItems(items.slice(0, BATCH_SIZE));
    setHasMore(items.length > BATCH_SIZE);
  }, [items]);

  // Intersection Observer callback
  const handleObserver = useCallback((entries: IntersectionObserverEntry[]) => {
    const [target] = entries;
    if (target.isIntersecting && hasMore) {
      setDisplayedItems(prev => {
        const nextBatch = items.slice(0, prev.length + BATCH_SIZE);
        setHasMore(nextBatch.length < items.length);
        return nextBatch;
      });
    }
  }, [items, hasMore]);

  // Setup observer
  useEffect(() => {
    const observer = new IntersectionObserver(handleObserver, {
      root: null,
      rootMargin: '100px',
      threshold: 0
    });

    if (loaderRef.current) {
      observer.observe(loaderRef.current);
    }

    return () => observer.disconnect();
  }, [handleObserver]);

  return (
    <div className="infinite-list">
      {displayedItems.map(item => (
        <ListItem key={item.id} item={item} />
      ))}

      {hasMore && (
        <div ref={loaderRef} className="loader">
          Ladowanie...
        </div>
      )}
    </div>
  );
}

// Memoizowany komponent wiersza
const ListItem = React.memo(({ item }: { item: Item }) => (
  <div className="list-item">
    <h3>{item.name}</h3>
    <p>{item.description}</p>
  </div>
));
\`\`\`

### Rozwiazanie 3: Web Workers dla ciezkiego przetwarzania

\`\`\`typescript
// listWorker.ts
self.onmessage = (e: MessageEvent) => {
  const { items, filter, sort } = e.data;

  // Ciezkie operacje w workerze
  let result = items;

  if (filter) {
    result = result.filter((item: Item) =>
      item.name.toLowerCase().includes(filter.toLowerCase())
    );
  }

  if (sort) {
    result = [...result].sort((a: Item, b: Item) =>
      a.name.localeCompare(b.name)
    );
  }

  self.postMessage(result);
};

// useListWorker.ts
import { useEffect, useState, useRef } from 'react';

export function useListWorker(items: Item[], filter: string, sort: boolean) {
  const [processedItems, setProcessedItems] = useState<Item[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    workerRef.current = new Worker(
      new URL('./listWorker.ts', import.meta.url)
    );

    workerRef.current.onmessage = (e) => {
      setProcessedItems(e.data);
      setIsProcessing(false);
    };

    return () => workerRef.current?.terminate();
  }, []);

  useEffect(() => {
    if (workerRef.current && items.length > 0) {
      setIsProcessing(true);
      workerRef.current.postMessage({ items, filter, sort });
    }
  }, [items, filter, sort]);

  return { processedItems, isProcessing };
}
\`\`\`

### Rozwiazanie 4: useDeferredValue (React 18+)

\`\`\`tsx
// DeferredList.tsx
import { useDeferredValue, useMemo } from 'react';

export function DeferredList({ items, filter }: { items: Item[]; filter: string }) {
  // Defer the filter value for non-urgent updates
  const deferredFilter = useDeferredValue(filter);
  const isStale = filter !== deferredFilter;

  // Memo filtered items
  const filteredItems = useMemo(() => {
    return items.filter(item =>
      item.name.toLowerCase().includes(deferredFilter.toLowerCase())
    );
  }, [items, deferredFilter]);

  return (
    <div style={{ opacity: isStale ? 0.7 : 1 }}>
      <VirtualizedList items={filteredItems} />
    </div>
  );
}
\`\`\`

### Porownanie wydajnosci

| Metoda | Initial Render | Scroll FPS | Memory |
|--------|----------------|------------|--------|
| Bez optymalizacji | 3500ms | 15 | 450MB |
| react-window | 50ms | 60 | 25MB |
| Infinite scroll | 80ms | 58 | 80MB |
| Web Worker + virtual | 60ms | 60 | 30MB |

### Best Practices
1. **Zawsze memoizuj** komponenty w listach
2. **Uzywaj stabilnych kluczy** (nie index!)
3. **Unikaj inline functions** w props
4. **Virtualizuj** listy > 100 elementow
5. **Profiluj** z React DevTools`,
      keywords: ['react', 'performance', 'lista', 'list', 'render', 'virtual', 'optimization', 'slow', 'freeze'],
      effectiveness: 0.92
    }
  ],

  // -------------------------------------------------------------------------
  // DOCUMENTATION - Pisanie dokumentacji
  // -------------------------------------------------------------------------
  documentation: [
    {
      input: `Napisz dokumentacje API dla endpointu tworzenia uzytkownika`,
      output: `## API Documentation: Create User

### Endpoint

\`\`\`
POST /api/v1/users
\`\`\`

### Description
Creates a new user account in the system. Sends a verification email upon successful creation.

### Authentication
- **Required**: No (public endpoint)
- **Rate Limit**: 10 requests per hour per IP

### Request

#### Headers
| Header | Type | Required | Description |
|--------|------|----------|-------------|
| Content-Type | string | Yes | Must be \`application/json\` |
| X-Request-Id | string | No | Unique request ID for tracing |

#### Body Parameters
| Parameter | Type | Required | Constraints | Description |
|-----------|------|----------|-------------|-------------|
| email | string | Yes | Valid email, max 255 chars | User's email address |
| password | string | Yes | Min 8 chars, must contain uppercase, lowercase, number | Account password |
| firstName | string | Yes | 1-50 chars | User's first name |
| lastName | string | Yes | 1-50 chars | User's last name |
| phone | string | No | E.164 format | Phone number |
| locale | string | No | ISO 639-1 code | Preferred language (default: "en") |
| timezone | string | No | IANA timezone | Timezone (default: "UTC") |

#### Example Request
\`\`\`json
{
  "email": "jan.kowalski@example.com",
  "password": "SecurePass123!",
  "firstName": "Jan",
  "lastName": "Kowalski",
  "phone": "+48123456789",
  "locale": "pl",
  "timezone": "Europe/Warsaw"
}
\`\`\`

\`\`\`bash
curl -X POST https://api.example.com/api/v1/users \\
  -H "Content-Type: application/json" \\
  -d '{
    "email": "jan.kowalski@example.com",
    "password": "SecurePass123!",
    "firstName": "Jan",
    "lastName": "Kowalski"
  }'
\`\`\`

### Response

#### Success (201 Created)
\`\`\`json
{
  "id": "usr_1234567890",
  "email": "jan.kowalski@example.com",
  "firstName": "Jan",
  "lastName": "Kowalski",
  "phone": "+48123456789",
  "emailVerified": false,
  "locale": "pl",
  "timezone": "Europe/Warsaw",
  "createdAt": "2024-01-15T10:30:00Z",
  "updatedAt": "2024-01-15T10:30:00Z",
  "_links": {
    "self": "/api/v1/users/usr_1234567890",
    "verify": "/api/v1/users/usr_1234567890/verify"
  }
}
\`\`\`

#### Error Responses

##### 400 Bad Request - Validation Error
\`\`\`json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [
      {
        "field": "email",
        "code": "INVALID_FORMAT",
        "message": "Invalid email format"
      },
      {
        "field": "password",
        "code": "TOO_WEAK",
        "message": "Password must contain at least one uppercase letter"
      }
    ]
  },
  "requestId": "req_abc123"
}
\`\`\`

##### 409 Conflict - Email Already Exists
\`\`\`json
{
  "error": {
    "code": "EMAIL_EXISTS",
    "message": "A user with this email already exists"
  },
  "requestId": "req_abc123"
}
\`\`\`

##### 429 Too Many Requests
\`\`\`json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests. Please try again later.",
    "retryAfter": 3600
  }
}
\`\`\`

### Response Codes
| Code | Description |
|------|-------------|
| 201 | User created successfully |
| 400 | Validation error |
| 409 | Email already exists |
| 429 | Rate limit exceeded |
| 500 | Internal server error |

### Side Effects
1. **Verification Email**: A verification email is sent to the provided address
2. **Audit Log**: Creation event is logged for compliance
3. **Analytics**: User signup event is tracked

### Notes
- Passwords are hashed with bcrypt (cost factor 12) before storage
- Email addresses are normalized (lowercased, trimmed)
- The \`id\` field uses a prefixed format (\`usr_\`) for clarity

### Related Endpoints
- [GET /api/v1/users/:id](/docs/get-user) - Get user details
- [POST /api/v1/users/:id/verify](/docs/verify-email) - Verify email
- [POST /api/v1/auth/login](/docs/login) - User login`,
      keywords: ['dokumentacja', 'documentation', 'api', 'endpoint', 'doc', 'readme', 'opisz', 'describe'],
      effectiveness: 0.91
    },
    {
      input: `Napisz JSDoc komentarze dla funkcji pomocniczych`,
      output: `## JSDoc Documentation Examples

### 1. Prosta funkcja z walidacja

\`\`\`typescript
/**
 * Calculates the discounted price after applying a percentage discount.
 *
 * @param {number} originalPrice - The original price before discount (must be >= 0)
 * @param {number} discountPercent - The discount percentage to apply (0-100)
 * @returns {number} The final price after discount, rounded to 2 decimal places
 * @throws {RangeError} If originalPrice is negative
 * @throws {RangeError} If discountPercent is not between 0 and 100
 *
 * @example
 * // Returns 90
 * calculateDiscount(100, 10);
 *
 * @example
 * // Returns 75.50
 * calculateDiscount(100.67, 25);
 *
 * @see {@link applyPromoCode} for string-based discount codes
 * @since 1.0.0
 */
function calculateDiscount(originalPrice: number, discountPercent: number): number {
  if (originalPrice < 0) {
    throw new RangeError('Original price cannot be negative');
  }
  if (discountPercent < 0 || discountPercent > 100) {
    throw new RangeError('Discount percent must be between 0 and 100');
  }

  const discount = originalPrice * (discountPercent / 100);
  return Math.round((originalPrice - discount) * 100) / 100;
}
\`\`\`

### 2. Funkcja async z typami generycznymi

\`\`\`typescript
/**
 * Fetches data from an API endpoint with automatic retry logic.
 *
 * @template T - The expected response data type
 * @param {string} url - The API endpoint URL
 * @param {FetchOptions} [options] - Optional fetch configuration
 * @param {number} [options.maxRetries=3] - Maximum number of retry attempts
 * @param {number} [options.retryDelay=1000] - Delay between retries in milliseconds
 * @param {number} [options.timeout=5000] - Request timeout in milliseconds
 * @returns {Promise<T>} The parsed JSON response
 * @throws {FetchError} If all retry attempts fail
 * @throws {TimeoutError} If request exceeds timeout
 *
 * @example
 * // Fetch user data with default options
 * const user = await fetchWithRetry<User>('/api/users/123');
 *
 * @example
 * // Fetch with custom retry settings
 * const data = await fetchWithRetry<Product[]>('/api/products', {
 *   maxRetries: 5,
 *   retryDelay: 2000,
 *   timeout: 10000
 * });
 *
 * @async
 * @since 2.0.0
 */
async function fetchWithRetry<T>(
  url: string,
  options?: FetchOptions
): Promise<T> {
  // Implementation
}
\`\`\`

### 3. Klasa z metodami

\`\`\`typescript
/**
 * Manages user authentication state and token refresh.
 *
 * @class AuthManager
 * @implements {IAuthProvider}
 *
 * @example
 * const auth = new AuthManager({
 *   tokenEndpoint: '/api/auth/token',
 *   refreshThreshold: 300
 * });
 *
 * await auth.login('user@example.com', 'password');
 * const token = auth.getAccessToken();
 */
class AuthManager implements IAuthProvider {
  /**
   * Creates a new AuthManager instance.
   *
   * @param {AuthConfig} config - Authentication configuration
   * @param {string} config.tokenEndpoint - OAuth token endpoint URL
   * @param {number} [config.refreshThreshold=300] - Seconds before expiry to refresh
   * @param {boolean} [config.persistSession=true] - Whether to persist in localStorage
   */
  constructor(config: AuthConfig) {
    // Implementation
  }

  /**
   * Authenticates user with email and password.
   *
   * @param {string} email - User's email address
   * @param {string} password - User's password
   * @returns {Promise<AuthResult>} Authentication result with tokens
   * @throws {AuthenticationError} If credentials are invalid
   * @fires AuthManager#login
   *
   * @example
   * try {
   *   const result = await auth.login('user@example.com', 'secret');
   *   console.log('Logged in as:', result.user.name);
   * } catch (error) {
   *   if (error instanceof AuthenticationError) {
   *     console.error('Invalid credentials');
   *   }
   * }
   */
  async login(email: string, password: string): Promise<AuthResult> {
    // Implementation
  }

  /**
   * Returns the current access token if valid.
   *
   * @returns {string | null} The access token or null if not authenticated
   * @readonly
   */
  get accessToken(): string | null {
    // Implementation
  }

  /**
   * Checks if the user is currently authenticated.
   *
   * @returns {boolean} True if user has valid authentication
   * @see {@link AuthManager#login} to authenticate
   */
  isAuthenticated(): boolean {
    // Implementation
  }
}
\`\`\`

### 4. Type definitions i interfaces

\`\`\`typescript
/**
 * Configuration options for API requests.
 *
 * @typedef {Object} ApiConfig
 * @property {string} baseUrl - Base URL for all API requests
 * @property {number} [timeout=5000] - Request timeout in milliseconds
 * @property {Record<string, string>} [headers] - Default headers for all requests
 * @property {boolean} [withCredentials=false] - Whether to include credentials
 */
interface ApiConfig {
  baseUrl: string;
  timeout?: number;
  headers?: Record<string, string>;
  withCredentials?: boolean;
}

/**
 * Represents a paginated API response.
 *
 * @template T - The type of items in the response
 * @typedef {Object} PaginatedResponse
 * @property {T[]} data - Array of items for current page
 * @property {PaginationMeta} meta - Pagination metadata
 * @property {PaginationLinks} links - Navigation links
 */
interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
  links: PaginationLinks;
}

/**
 * Pagination metadata.
 *
 * @typedef {Object} PaginationMeta
 * @property {number} currentPage - Current page number (1-indexed)
 * @property {number} perPage - Items per page
 * @property {number} totalItems - Total number of items
 * @property {number} totalPages - Total number of pages
 */
interface PaginationMeta {
  currentPage: number;
  perPage: number;
  totalItems: number;
  totalPages: number;
}
\`\`\`

### 5. Callback i event handlers

\`\`\`typescript
/**
 * Callback invoked when data loading completes.
 *
 * @callback OnDataLoadCallback
 * @param {DataLoadEvent} event - The load event object
 * @param {any[]} event.data - The loaded data
 * @param {number} event.loadTime - Time taken to load in ms
 * @param {boolean} event.fromCache - Whether data was served from cache
 * @returns {void}
 */
type OnDataLoadCallback = (event: DataLoadEvent) => void;

/**
 * Registers a callback for data load events.
 *
 * @param {OnDataLoadCallback} callback - Function called when data loads
 * @returns {() => void} Cleanup function to unregister callback
 *
 * @example
 * const unsubscribe = onDataLoad((event) => {
 *   console.log(\`Loaded \${event.data.length} items in \${event.loadTime}ms\`);
 * });
 *
 * // Later, to clean up:
 * unsubscribe();
 */
function onDataLoad(callback: OnDataLoadCallback): () => void {
  // Implementation
}
\`\`\`

### Best Practices
1. **Zawsze dokumentuj publiczne API** - funkcje, klasy, interfejsy
2. **Uzywaj @example** - pokazuj praktyczne uzycie
3. **Dokumentuj wyjatki** - @throws z warunkami
4. **Opisuj typy generyczne** - @template z wyjasnieniem
5. **Linkuj powiazane** - @see dla kontekstu`,
      keywords: ['jsdoc', 'komentarz', 'comment', 'dokumentacja', 'typescript', 'annotation', 'doc'],
      effectiveness: 0.88
    }
  ]
};

