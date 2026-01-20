import '@testing-library/jest-dom';

// Mock localStorage for Zustand persist
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
    get length() { return Object.keys(store).length; },
    key: (index: number) => Object.keys(store)[index] || null,
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

// Mock Tauri API for testing outside Tauri context
const mockInvoke = vi.fn().mockImplementation((cmd: string) => {
  switch (cmd) {
    case 'get_session_status':
      return Promise.resolve({
        running: false,
        session_id: null,
        working_dir: null,
        cli_path: null,
      });
    case 'get_approval_rules':
      return Promise.resolve([]);
    case 'get_approval_history':
      return Promise.resolve([]);
    default:
      return Promise.resolve();
  }
});

vi.mock('@tauri-apps/api/core', () => ({
  invoke: mockInvoke,
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockReturnValue(Promise.resolve(() => {})),
  emit: vi.fn().mockReturnValue(Promise.resolve()),
}));

// Mock window.__TAURI__ for components that check it
Object.defineProperty(window, '__TAURI__', {
  value: {
    invoke: mockInvoke,
  },
  writable: true,
});
