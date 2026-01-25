# System Powiadomień (Toast) - GeminiHydra

Projekt GeminiHydra korzysta z biblioteki **Sonner** do obsługi powiadomień (Toast).
Jest to nowoczesna, lekka i animowana biblioteka, zastępująca wcześniejszą implementację własną.

## Użycie

### 1. Import
W dowolnym komponencie zaimportuj funkcję `toast`:

```tsx
import { toast } from 'sonner';
```

### 2. Wyświetlanie powiadomień

Mamy do dyspozycji różne typy powiadomień:

```tsx
// Sukces
toast.success('Operacja zakończona pomyślnie');

// Błąd
toast.error('Wystąpił błąd połączenia');

// Informacja
toast.info('Nowa wersja dostępna');

// Ostrzeżenie
toast.warning('Pamięć na wyczerpaniu');

// Zwykła wiadomość
toast.message('Wiadomość systemowa');
```

### 3. Zaawansowane użycie

#### Promise (Ładowanie)
Sonner świetnie obsługuje operacje asynchroniczne:

```tsx
toast.promise(myPromise, {
  loading: 'Przetwarzanie...',
  success: (data) => `Gotowe: ${data.name}`,
  error: 'Wystąpił błąd',
});
```

#### Własne opcje
Można dostosować czas trwania lub opis:

```tsx
toast.success('Plik zapisany', {
  description: 'C:/Projekty/GeminiHydra/raport.md',
  duration: 5000,
});
```

## Konfiguracja (Globalna)

Komponent `<Toaster />` znajduje się w pliku `App.tsx` i obsługuje motywy (Dark/Light):

```tsx
<Toaster position="top-right" theme={isDark ? 'dark' : 'light'} />
```

## Migracja ze starego systemu

Jeśli widzisz w kodzie:
`addToast('Wiadomość', 'error')`

Zmień na:
`toast.error('Wiadomość')`